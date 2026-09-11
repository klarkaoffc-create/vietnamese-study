/**
 * The line between "what the learner may see before attempting a task" and
 * "the answer key".
 *
 * Source lessons (the teacher DOCX files) often contain the completed
 * exercise, so an answer can end up inside a field that is rendered as part
 * of the task. The key material stays in the content — it is needed for
 * grading and as a reference — but it must never reach the screen before an
 * attempt. This module states both sides of that line in one place so
 * `scripts/validate-content.ts` and the answer-leak tests can enforce it.
 *
 * Keep the `visibleBeforeAttempt` lists in step with `ExerciseView`: they
 * describe the same rendering, and the render-level test in
 * `tests/answer-leak.test.ts` fails if they drift apart.
 */
import type { Exercise } from '../data/schema';
import type { GeneratedInstance } from './generators';

/**
 * How to look up a dialogue by id. Injected rather than imported so this
 * module stays free of `src/data/content` (which uses `import.meta.glob`) and
 * can therefore also run inside `scripts/validate-content.ts` under tsx.
 */
export interface ContentLookup {
  dialogue?: (id: string) => { lines: { vi: string; pl?: string }[] } | undefined;
}

/** A field the learner can read before answering. */
export interface VisibleField {
  field: string;
  text: string;
}

export interface AnswerLeak {
  exerciseId: string;
  field: string;
  answer: string;
  text: string;
}

/**
 * Exercises where an answer legitimately appears in the visible task.
 *
 * Every entry needs a reason. This is not a place to silence real leaks —
 * it exists because a few task designs cannot work otherwise.
 */
export const ANSWER_LEAK_EXEMPTIONS: Record<string, string> = {
  // "___, tháng Mười Một, tháng Mười Hai" — completing a sequence. Vietnamese
  // month names are compositional (tháng Mười = 10, tháng Mười Một = 11), so
  // the neighbouring months necessarily share the answer's words. Removing
  // them would destroy the exercise.
  'e-rev-01-05-seq-5': 'sequence completion: neighbouring month names share the answer stem by construction',
};

/* ------------------------------------------------------------------ */
/* Normalisation                                                        */
/* ------------------------------------------------------------------ */

/** Lowercase, strip tones/diacritics and punctuation, collapse whitespace. */
export function normalise(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const words = (s: string) => normalise(s).split(' ').filter(Boolean);

/**
 * Does `text` hand the learner the answer?
 *
 * The test is containment of the WHOLE answer, compared word by word and
 * ignoring tones, diacritics, case and punctuation — so "Podpowiedź: Xin
 * chào" and "podpowiedz xin chao" both count.
 *
 * Partial overlap deliberately does not count. Scaffolding is supposed to
 * overlap: a grammar pattern ("Gia đình của tôi có + liczba + người"), a
 * gloss, or a drill prompt that supplies the pronoun and the number all share
 * words with the answer while still leaving the learner something to produce.
 * The mechanical exposure of answer-key FIELDS is caught separately, by the
 * render test in tests/answer-leak.test.ts.
 */
export function revealsAnswer(text: string, answer: string): boolean {
  const hay = words(text);
  const need = words(answer);
  if (!need.length || !hay.length) return false;
  return ` ${hay.join(' ')} `.includes(` ${need.join(' ')} `);
}

/**
 * A hint, unless it hands over one of the answers — in which case none.
 *
 * Runtime tasks pair a scaffold (a grammar pattern, a dictionary gloss) with
 * an example sentence drawn at random. Most pairings are fine, but some
 * patterns illustrate themselves with the very sentence that was drawn
 * ("g-bai-12-directions" + "Đi thẳng."), and then the hint IS the answer.
 * Dropping the hint for that draw is strictly better than showing it.
 */
export function hintUnlessRevealing(hint: string | undefined, ...answers: (string | undefined)[]): string | undefined {
  if (!hint) return undefined;
  return answers.some((a) => a && revealsAnswer(hint, a)) ? undefined : hint;
}

/**
 * A Polish gloss with any part that spells out the Vietnamese word removed.
 *
 * Dictionary glosses often carry collocations ("wrócić; về nhà – wrócić do
 * domu", "sto (một trăm = 100)"). That is useful on the vocabulary page, but
 * the same string is used as the prompt of "Jak powiesz po wietnamsku: …?",
 * where it simply printed the answer. Clauses that reveal the word are
 * dropped; if every clause does, the word itself is elided instead, so the
 * learner still gets a usable prompt.
 */
export function glossWithoutAnswer(pl: string, vi: string, ...alsoHide: string[]): string {
  const forms = [vi, ...alsoHide].filter(Boolean);
  const reveals = (text: string) => forms.some((f) => revealsAnswer(text, f));
  const tidy = (t: string) =>
    t
      .replace(/\s+/g, ' ')
      .replace(/\s*([;,–—-])\s*$/g, '')
      .replace(/^\s*([;,–—-])\s*/g, '')
      .trim();
  for (const sep of [/;/, /\s[–—]\s/, /,/]) {
    const kept = pl
      .split(sep)
      .map((c) => c.trim())
      .filter((c) => c && !reveals(c));
    if (kept.length) return tidy(kept.join('; '));
  }
  // The word appears in every clause: drop revealing asides, then the word.
  const withoutAsides = pl.replace(/\([^)]*\)|„[^”]*”/g, (m) => (reveals(m) ? ' ' : m));
  const needle = forms.flatMap((f) => normalise(f).split(' ')).filter(Boolean);
  const stripped = tidy(
    withoutAsides
      .split(/\s+/)
      .filter((w) => !needle.includes(normalise(w)))
      .join(' '),
  );
  return stripped.length >= 2 ? stripped : tidy(withoutAsides) || '…';
}

/* ------------------------------------------------------------------ */
/* Answer keys                                                          */
/* ------------------------------------------------------------------ */

/**
 * Everything that counts as the solution to this exercise. None of it may be
 * rendered before the learner has submitted an attempt.
 */
export function answerKeysOf(ex: Exercise, lookup: ContentLookup = {}): string[] {
  switch (ex.type) {
    case 'mcq':
      return [ex.options[ex.answer]].filter(Boolean);
    case 'typed':
    case 'fill-blank':
    case 'error-correction':
    case 'diacritics':
      return ex.answers;
    case 'ordering':
      return [ex.tokens.join(' ')];
    case 'matching':
      return ex.pairs.map((p) => p.right);
    case 'open-answer':
      return [...ex.patterns, ...(ex.sample ? [ex.sample] : [])];
    case 'reading-question':
      return ex.options && typeof ex.answer === 'number' ? [ex.options[ex.answer]] : (ex.answers ?? []);
    case 'dialogue-completion': {
      const line = lookup.dialogue?.(ex.dialogueId)?.lines[ex.lineIndex];
      return line ? [line.vi] : [];
    }
    case 'speaking':
      return [ex.target];
    case 'generator':
      return [];
  }
}

/**
 * What the learner reads before answering — the same fields `ExerciseView`
 * renders while `result` is null.
 *
 * Deliberate exclusions, each because the field IS the task rather than a
 * leak: `error-correction.wrong` (the sentence to repair), `diacritics.stripped`
 * (the same words without tones), and the reading passage behind a
 * `reading-question` (finding the answer in the text is the exercise).
 */
export function visibleBeforeAttempt(ex: Exercise, lookup: ContentLookup = {}): VisibleField[] {
  const out: VisibleField[] = [];
  const add = (field: string, text?: string) => {
    if (text) out.push({ field, text });
  };
  add('instruction', ex.instruction);
  add('image.alt', ex.image?.alt);
  add('image.caption', ex.image?.caption);
  switch (ex.type) {
    case 'mcq':
      add('prompt', ex.prompt);
      break;
    case 'typed':
      add('prompt', ex.prompt);
      add('hint', ex.hint);
      break;
    case 'fill-blank':
      add('sentence', ex.sentence.split('___').join(' '));
      add('translation', ex.translation);
      break;
    case 'matching':
      add('prompt', ex.prompt);
      break;
    case 'ordering':
      add('prompt', ex.prompt);
      add('translation', ex.translation);
      break;
    case 'error-correction':
      add('prompt', ex.prompt);
      break;
    case 'diacritics':
      add('translation', ex.translation);
      break;
    case 'open-answer':
      add('prompt', ex.prompt);
      add('hint', ex.hint);
      break;
    case 'reading-question':
      add('prompt', ex.prompt);
      break;
    case 'dialogue-completion': {
      const d = lookup.dialogue?.(ex.dialogueId);
      // Every line except the blanked one is context; the blanked line's
      // Polish gloss is the task ("say this in Vietnamese").
      d?.lines.forEach((l, i) => {
        if (i !== ex.lineIndex) add(`line[${i}]`, l.vi);
        else add('blank.pl', l.pl);
      });
      break;
    }
    case 'speaking':
      add('prompt', ex.prompt);
      break;
    case 'generator':
      break;
  }
  return out;
}

/** Visible fields of a runtime-generated drill instance. */
export function visibleBeforeAttemptGenerated(inst: GeneratedInstance): VisibleField[] {
  const out: VisibleField[] = [];
  if (inst.prompt) out.push({ field: 'prompt', text: inst.prompt });
  if (inst.hint) out.push({ field: 'hint', text: inst.hint });
  return out;
}

export function answerKeysOfGenerated(inst: GeneratedInstance): string[] {
  if (inst.options && typeof inst.answer === 'number') return [inst.options[inst.answer]].filter(Boolean);
  return inst.answers ?? [];
}

/* ------------------------------------------------------------------ */
/* The audit                                                            */
/* ------------------------------------------------------------------ */

/**
 * The answer strings worth comparing against visible text.
 *
 * An open-answer `pattern` is a frame with holes ("Mình thích {x}"), so its
 * literal words are a structure, not a solution — several prompts state that
 * structure on purpose ("odpowiedz o sobie (Mình thích + czasownik + …)").
 * Only the `sample`, an actual complete answer, is compared. That the app
 * must not RENDER the patterns is asserted separately by the render test.
 */
export function textComparableKeys(ex: Exercise, lookup: ContentLookup = {}): string[] {
  if (ex.type === 'open-answer') return ex.sample ? [ex.sample] : [];
  return answerKeysOf(ex, lookup);
}

/** Every place this exercise shows its own solution before an attempt. */
export function findAnswerLeaks(ex: Exercise, lookup: ContentLookup = {}): AnswerLeak[] {
  if (ANSWER_LEAK_EXEMPTIONS[ex.id]) return [];
  const keys = textComparableKeys(ex, lookup);
  const leaks: AnswerLeak[] = [];
  for (const { field, text } of visibleBeforeAttempt(ex, lookup)) {
    for (const answer of keys) {
      // An open-answer pattern is a template; compare only its literal words.
      const key = answer.replace(/\{x\}/g, ' ').trim();
      if (key && revealsAnswer(text, key)) {
        leaks.push({ exerciseId: ex.id, field, answer, text });
        break;
      }
    }
  }
  return leaks;
}

export function findAnswerLeaksGenerated(inst: GeneratedInstance): AnswerLeak[] {
  const keys = answerKeysOfGenerated(inst);
  const leaks: AnswerLeak[] = [];
  for (const { field, text } of visibleBeforeAttemptGenerated(inst)) {
    for (const answer of keys) {
      if (revealsAnswer(text, answer)) {
        leaks.push({ exerciseId: inst.id, field, answer, text });
        break;
      }
    }
  }
  return leaks;
}
