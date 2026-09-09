/**
 * Grading of every exercise type. Returns an outcome, a score in 0..1, Polish
 * feedback and a mistake category. Questionable content (status "flagged")
 * never fails the learner on its own: a wrong answer to a flagged item is
 * reported with `flagged: true` so the UI can label it and the mistake book
 * can store it as "do weryfikacji".
 */
import type { Exercise, Skill } from '../data/schema';
import { dialogueById } from '../data/content';
import type { GeneratedInstance } from './generators';
import { comparisonForm, editDistance, feedbackFor, matchAny, matchPatterns, stripDiacritics, type MatchResult } from '../utilities/vietnamese';

export type Outcome = 'correct' | 'tone' | 'partial' | 'wrong';

export type MistakeCategory = Skill;

export interface GradeResult {
  outcome: Outcome;
  /** 0..1 */
  score: number;
  feedback: string;
  /** Model answer to display. */
  expected: string;
  category: MistakeCategory;
  /** True when the exercise or its answer key is flagged / unverified. */
  flagged: boolean;
  unverified: boolean;
}

export type UserAnswer =
  | { kind: 'text'; value: string }
  | { kind: 'choice'; index: number }
  | { kind: 'order'; tokens: string[] }
  | { kind: 'match'; pairs: Record<string, string> }
  | { kind: 'self'; grade: 0 | 1 | 2 | 3 };

/** Something the runner can grade: a content exercise or a generated instance. */
export type Gradable = { source: 'exercise'; exercise: Exercise } | { source: 'generated'; instance: GeneratedInstance };

function fromMatch(r: MatchResult, expected: string, skill: Skill): { outcome: Outcome; score: number; feedback: string; category: MistakeCategory } {
  if (r.kind === 'correct') return { outcome: 'correct', score: 1, feedback: feedbackFor(r, expected), category: skill };
  if (r.kind === 'tone') return { outcome: 'tone', score: 0.5, feedback: feedbackFor(r, expected), category: 'tone' };
  return { outcome: 'wrong', score: 0, feedback: feedbackFor(r, expected), category: skill };
}

/** Wrong answers close to the expected one are spelling slips rather than vocabulary gaps. */
function refineCategory(given: string, expected: string, base: MistakeCategory): MistakeCategory {
  if (base !== 'vocabulary' && base !== 'grammar') return base;
  const g = stripDiacritics(comparisonForm(given));
  const e = stripDiacritics(comparisonForm(expected));
  if (!g || !e) return base;
  const d = editDistance(g, e);
  if (d > 0 && d <= Math.max(1, Math.floor(e.length / 5))) return 'spelling';
  return base;
}

function gradeText(given: string, answers: string[], lang: 'vi' | 'pl', skill: Skill): { outcome: Outcome; score: number; feedback: string; expected: string; category: MistakeCategory } {
  const expected = answers[0];
  if (!given.trim()) return { outcome: 'wrong', score: 0, feedback: `Brak odpowiedzi. Poprawna odpowiedź: ${expected}`, expected, category: skill };
  if (lang === 'pl') {
    // Polish answers: tolerant to diacritics and punctuation.
    const g = stripDiacritics(comparisonForm(given));
    const ok = answers.some((a) => stripDiacritics(comparisonForm(a)) === g);
    if (ok) return { outcome: 'correct', score: 1, feedback: 'Dobrze!', expected, category: skill };
    const close = answers.some((a) => editDistance(stripDiacritics(comparisonForm(a)), g) <= 2);
    if (close) return { outcome: 'partial', score: 0.5, feedback: `Prawie — sprawdź pisownię. Odpowiedź wzorcowa: ${expected}`, expected, category: 'spelling' };
    return { outcome: 'wrong', score: 0, feedback: `Niepoprawnie. Odpowiedź wzorcowa: ${expected}`, expected, category: skill };
  }
  const m = matchAny(given, answers);
  const r = fromMatch(m, m.expected, skill);
  return { ...r, expected: m.expected, category: r.outcome === 'wrong' ? refineCategory(given, m.expected, r.category) : r.category };
}

export function gradeGenerated(inst: GeneratedInstance, answer: UserAnswer): GradeResult {
  const base = { flagged: false, unverified: true };
  if (inst.options && typeof inst.answer === 'number') {
    if (answer.kind !== 'choice') return { outcome: 'wrong', score: 0, feedback: 'Wybierz odpowiedź.', expected: inst.options[inst.answer], category: inst.skill, ...base };
    const ok = answer.index === inst.answer;
    return {
      outcome: ok ? 'correct' : 'wrong',
      score: ok ? 1 : 0,
      feedback: ok ? 'Dobrze!' : `Niepoprawnie. Poprawna odpowiedź: ${inst.options[inst.answer]}`,
      expected: inst.options[inst.answer],
      category: inst.skill,
      ...base,
    };
  }
  if (answer.kind !== 'text') return { outcome: 'wrong', score: 0, feedback: 'Wpisz odpowiedź.', expected: inst.answers?.[0] ?? '', category: inst.skill, ...base };
  const r = gradeText(answer.value, inst.answers ?? [], inst.answerLang ?? 'vi', inst.skill);
  return { ...r, ...base };
}

export function gradeExercise(ex: Exercise, answer: UserAnswer): GradeResult {
  const flagged = ex.status === 'flagged';
  const unverified = ex.status !== 'verified';
  const meta = { flagged, unverified };
  switch (ex.type) {
    case 'mcq': {
      const expected = ex.options[ex.answer];
      if (answer.kind !== 'choice') return { outcome: 'wrong', score: 0, feedback: 'Wybierz odpowiedź.', expected, category: ex.skill, ...meta };
      const ok = answer.index === ex.answer;
      return { outcome: ok ? 'correct' : 'wrong', score: ok ? 1 : 0, feedback: ok ? 'Dobrze!' : `Niepoprawnie. Poprawna odpowiedź: ${expected}`, expected, category: ex.skill, ...meta };
    }
    case 'typed': {
      if (answer.kind !== 'text') return { outcome: 'wrong', score: 0, feedback: 'Wpisz odpowiedź.', expected: ex.answers[0], category: ex.skill, ...meta };
      return { ...gradeText(answer.value, ex.answers, ex.answerLang, ex.skill), ...meta };
    }
    case 'fill-blank': {
      if (answer.kind !== 'text') return { outcome: 'wrong', score: 0, feedback: 'Wpisz odpowiedź.', expected: ex.answers[0], category: ex.skill, ...meta };
      return { ...gradeText(answer.value, ex.answers, 'vi', ex.skill), ...meta };
    }
    case 'error-correction': {
      if (answer.kind !== 'text') return { outcome: 'wrong', score: 0, feedback: 'Wpisz poprawione zdanie.', expected: ex.answers[0], category: ex.skill, ...meta };
      const r = gradeText(answer.value, ex.answers, 'vi', ex.skill);
      if (r.outcome === 'wrong' && comparisonForm(answer.value) === comparisonForm(ex.wrong)) r.feedback = `Zdanie nie zostało poprawione. Poprawna forma: ${ex.answers[0]}`;
      return { ...r, ...meta };
    }
    case 'diacritics': {
      if (answer.kind !== 'text') return { outcome: 'wrong', score: 0, feedback: 'Wpisz odpowiedź.', expected: ex.answers[0], category: 'tone', ...meta };
      const r = gradeText(answer.value, ex.answers, 'vi', 'tone');
      if (r.outcome === 'tone') {
        r.feedback = r.feedback.replace('Prawie dobrze', 'Litery się zgadzają, ale brakuje znaków');
        r.score = 0.25;
      }
      return { ...r, category: 'tone', ...meta };
    }
    case 'open-answer': {
      if (answer.kind !== 'text') return { outcome: 'wrong', score: 0, feedback: 'Wpisz odpowiedź.', expected: ex.sample ?? ex.patterns[0], category: ex.skill, ...meta };
      const expected = ex.sample ?? ex.patterns[0].replace(/\{x\}/g, '…');
      if (!answer.value.trim()) return { outcome: 'wrong', score: 0, feedback: `Brak odpowiedzi. Przykładowa odpowiedź (jedna z wielu): ${expected}`, expected, category: ex.skill, ...meta };
      const m = matchPatterns(answer.value, ex.patterns);
      if (m.kind === 'correct') return { outcome: 'correct', score: 1, feedback: `Struktura zdania się zgadza. Przykładowa odpowiedź (jedna z wielu): ${expected}`, expected, category: ex.skill, ...meta };
      if (m.kind === 'tone') return { outcome: 'tone', score: 0.5, feedback: feedbackFor(m, expected), expected, category: 'tone', ...meta };
      return { outcome: 'wrong', score: 0, feedback: `Zdanie nie pasuje do wzorca „${ex.patterns[0]}”. Przykładowa odpowiedź (jedna z wielu): ${expected}`, expected, category: ex.skill, ...meta };
    }
    case 'matching': {
      const expected = ex.pairs.map((p) => `${p.left} → ${p.right}`).join('; ');
      if (answer.kind !== 'match') return { outcome: 'wrong', score: 0, feedback: 'Dopasuj pary.', expected, category: ex.skill, ...meta };
      let ok = 0;
      const wrongPairs: string[] = [];
      for (const p of ex.pairs) {
        if (answer.pairs[p.left] === p.right) ok++;
        else wrongPairs.push(`${p.left} → ${p.right}`);
      }
      const score = ok / ex.pairs.length;
      const outcome: Outcome = score === 1 ? 'correct' : score >= 0.5 ? 'partial' : 'wrong';
      return {
        outcome,
        score,
        feedback: score === 1 ? 'Wszystkie pary dobrze!' : `${ok}/${ex.pairs.length} par poprawnie. Do poprawy: ${wrongPairs.join('; ')}`,
        expected,
        category: ex.skill,
        ...meta,
      };
    }
    case 'ordering': {
      const expected = ex.tokens.join(' ');
      if (answer.kind !== 'order') return { outcome: 'wrong', score: 0, feedback: 'Ułóż wyrazy.', expected, category: 'word-order', ...meta };
      const ok = answer.tokens.length === ex.tokens.length && answer.tokens.every((t, i) => comparisonForm(t) === comparisonForm(ex.tokens[i]));
      return { outcome: ok ? 'correct' : 'wrong', score: ok ? 1 : 0, feedback: ok ? 'Dobrze!' : `Zły szyk. Poprawnie: ${expected}`, expected, category: 'word-order', ...meta };
    }
    case 'reading-question': {
      if (ex.options && typeof ex.answer === 'number') {
        const expected = ex.options[ex.answer];
        if (answer.kind !== 'choice') return { outcome: 'wrong', score: 0, feedback: 'Wybierz odpowiedź.', expected, category: 'reading', ...meta };
        const ok = answer.index === ex.answer;
        return { outcome: ok ? 'correct' : 'wrong', score: ok ? 1 : 0, feedback: ok ? 'Dobrze!' : `Niepoprawnie. Poprawna odpowiedź: ${expected}`, expected, category: 'reading', ...meta };
      }
      const answers = ex.answers ?? [];
      if (answer.kind !== 'text') return { outcome: 'wrong', score: 0, feedback: 'Wpisz odpowiedź.', expected: answers[0] ?? '', category: 'reading', ...meta };
      const r = gradeText(answer.value, answers, ex.answerLang ?? 'vi', 'reading');
      return { ...r, ...meta };
    }
    case 'dialogue-completion': {
      const d = dialogueById.get(ex.dialogueId);
      const line = d?.lines[ex.lineIndex];
      const expected = line?.vi ?? '';
      if (answer.kind === 'choice') {
        // options are built by the runner: [correct, ...distractors] shuffled; runner passes the chosen text via index into its own list,
        // so here we accept a text comparison through the 'text' branch instead. Choice index alone cannot be graded.
        return { outcome: 'wrong', score: 0, feedback: 'Wybierz odpowiedź.', expected, category: 'dialogue', ...meta };
      }
      if (answer.kind !== 'text') return { outcome: 'wrong', score: 0, feedback: 'Wpisz odpowiedź.', expected, category: 'dialogue', ...meta };
      const r = gradeText(answer.value, [expected], 'vi', 'dialogue');
      const lineFlagged = line?.status === 'flagged';
      return { ...r, flagged: flagged || lineFlagged, unverified: unverified || lineFlagged };
    }
    case 'generator':
      return { outcome: 'wrong', score: 0, feedback: 'Ćwiczenie generowane – użyj gradeGenerated.', expected: '', category: ex.skill, ...meta };
    case 'speaking':
      // Speaking is never auto-graded: the browser cannot judge pronunciation
      // reliably, so the learner rates themselves after comparing with the
      // model (see SpeakingTask). The runner handles this before grading.
      return { outcome: 'correct', score: 1, feedback: 'Ocena własna po porównaniu ze wzorem.', expected: ex.target, category: ex.skill, ...meta };
  }
}

export function grade(g: Gradable, answer: UserAnswer): GradeResult {
  return g.source === 'exercise' ? gradeExercise(g.exercise, answer) : gradeGenerated(g.instance, answer);
}

/** Whether an exercise type is "production" (learner must produce language). */
export function isProduction(ex: Exercise | GeneratedInstance): boolean {
  if ('generator' in ex && 'prompt' in ex && !('type' in ex)) return !ex.options;
  const e = ex as Exercise;
  switch (e.type) {
    case 'mcq':
    case 'matching':
      return false;
    case 'reading-question':
      return !e.options;
    case 'generator':
    case 'speaking':
      return true;
    default:
      return true;
  }
}
