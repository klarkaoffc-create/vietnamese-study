/**
 * Task engine — the heart of the communicative redesign.
 *
 * The scheduler tracks abilities (see `srs.ts`); this module turns each due
 * ability into a concrete THING TO DO, at the right amount of scaffolding for
 * where that ability currently sits on the automaticity ladder.
 *
 * Nothing here invents Vietnamese. Every task is derived from material that
 * already exists in `content/`: the example sentences attached to vocabulary
 * and grammar points, dialogue lines, readings, hand-written exercises and
 * the communicative scenarios in `content/scenarios/`. Where a needed piece
 * is missing (e.g. a word with no example sentence), the engine falls back to
 * a weaker-but-honest task rather than fabricating a sentence.
 *
 * Tasks are rendered and graded by the EXISTING exercise engine: each task
 * carries a synthesised `Exercise`, so `ExerciseView` and `grading.ts` work
 * unchanged.
 */
import type { Exercise, Skill } from '../data/schema';
import {
  allVocab,
  dialogueById,
  grammarById,
  lessonById,
  scenariosForLessons,
  type DialogueEntry,
  type GrammarEntry,
  type VocabEntry,
} from '../data/content';
import type { AutomaticityLevel, SrsKind } from './srs';
import { pick, sample, shuffle } from '../utilities/random';
import { comparisonForm } from '../utilities/vietnamese';

/* ------------------------------------------------------------------ */
/* Task shape                                                          */
/* ------------------------------------------------------------------ */

/** Broad grouping used to build a balanced daily session. */
export type TaskPhase = 'warmup' | 'retrieval' | 'conversation' | 'grammar' | 'mistakes' | 'listening' | 'speaking' | 'free';

export interface LearningTask {
  /** Unique within a session. */
  id: string;
  /** Which ability this practises — what the scheduler updates. */
  srsKind: SrsKind;
  /** Ability reference (vocab id, grammar id, dialogue line id …). */
  srsRef: string;
  lesson: string;
  /** Amount of scaffolding this particular task provides. */
  level: AutomaticityLevel;
  phase: TaskPhase;
  /** Rendered and graded by the existing exercise engine. */
  exercise: Exercise;
  /** Vocabulary this task pulls into use (for progress reporting). */
  targetVocab: string[];
  /** True when only the learner can judge the answer (open speech/writing). */
  selfAssessed: boolean;
  /** Optional seconds budget, used to push toward faster responses. */
  timeLimitSec?: number;
}

const PHASE_LABEL: Record<TaskPhase, string> = {
  warmup: 'Rozgrzewka',
  retrieval: 'Przypomnienie',
  conversation: 'Rozmowa',
  grammar: 'Gramatyka w użyciu',
  mistakes: 'Twoje błędy',
  listening: 'Słuchanie',
  speaking: 'Mówienie',
  free: 'Swobodna wypowiedź',
};

export function phaseLabel(p: TaskPhase): string {
  return PHASE_LABEL[p];
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

let seq = 0;
const uid = (prefix: string) => `${prefix}-${(seq++).toString(36)}`;

/**
 * Synthesised exercises need ids that satisfy the content schema's id rules
 * (`e-bai-NN-...`). They are never persisted to content files; the id only
 * has to be stable enough for one session and for mistake logging.
 */
function exId(lesson: string, suffix: string): string {
  const base = /^bai-\d{2}$/.test(lesson) ? lesson : 'bai-01';
  return `e-${base}-t-${suffix.replace(/[^a-z0-9-]/gi, '').toLowerCase() || 'x'}-${(seq++).toString(36)}`;
}

/** Sentence examples attached to a vocabulary item that have a Polish side. */
function usableExamples(v: VocabEntry): { vi: string; pl: string }[] {
  return v.examples
    .filter((e) => e.pl && e.status !== 'flagged' && e.vi.trim().split(/\s+/).length >= 2)
    .map((e) => ({ vi: e.vi, pl: e.pl! }));
}

function grammarExamples(g: GrammarEntry): { vi: string; pl: string }[] {
  return g.examples.filter((e) => e.pl && e.status !== 'flagged').map((e) => ({ vi: e.vi, pl: e.pl! }));
}

/** Build a cloze by blanking the target word inside its own example sentence. */
function clozeOf(sentence: string, target: string): string | null {
  const words = target.trim().split(/\s+/);
  const head = words[0];
  if (!head) return null;
  const idx = comparisonForm(sentence).indexOf(comparisonForm(target));
  if (idx >= 0) {
    // Replace the matched span in the original (untouched) casing.
    const re = new RegExp(target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    if (re.test(sentence)) return sentence.replace(re, '___');
  }
  return null;
}

const isPhraseLike = (v: VocabEntry) => v.vi.trim().split(/\s+/).length >= 2 || v.category === 'phrase';

/* ------------------------------------------------------------------ */
/* Vocabulary tasks — always in context where the content allows it     */
/* ------------------------------------------------------------------ */

/**
 * Build an ACTIVE vocabulary task: the learner must produce Vietnamese.
 * The shape depends on the automaticity level the ability has reached.
 */
export function vocabActiveTask(v: VocabEntry, level: AutomaticityLevel, phase: TaskPhase = 'retrieval'): LearningTask | null {
  const examples = usableExamples(v);
  const lesson = v.lessonId;
  const common = {
    srsKind: 'vocab-active' as SrsKind,
    srsRef: v.id,
    lesson,
    level,
    phase,
    targetVocab: [v.id],
    selfAssessed: false,
  };

  // Levels 3–5 want a full sentence. Use a real example sentence when the
  // content has one; otherwise fall back to a lower-scaffold word task
  // rather than inventing a sentence.
  if (level >= 3 && examples.length) {
    const ex = examples[(level - 3) % examples.length];
    if (level >= 5) {
      // Spontaneous: no Polish prompt sentence, only the communicative goal.
      return {
        ...common,
        id: uid('t-va5'),
        exercise: {
          id: exId(lesson, `va5-${v.id}`),
          type: 'open-answer',
          skill: 'vocabulary',
          source: 'generated',
          status: 'unverified',
          instruction: 'Bez podpowiedzi — powiedz to po swojemu.',
          prompt: `Ułóż własne zdanie po wietnamsku ze słowem „${v.vi}” (${v.pl}).`,
          patterns: withOptionalEdges([`{x}${v.vi}{x}`]),
          sample: examples[0].vi,
          explanation: `Przykład użycia: ${examples[0].vi} – ${examples[0].pl}`,
          grammar: [],
          vocab: [v.id],
          level: 3,
        },
        timeLimitSec: 90,
      };
    }
    // Levels 3–4: produce the whole sentence from Polish.
    return {
      ...common,
      id: uid('t-va3'),
      exercise: {
        id: exId(lesson, `va3-${v.id}`),
        type: 'typed',
        skill: 'vocabulary',
        source: 'generated',
        status: 'unverified',
        instruction: level === 3 ? `Użyj słowa „${v.vi}”.` : 'Całe zdanie po wietnamsku.',
        prompt: `Powiedz po wietnamsku: „${ex.pl}”`,
        answerLang: 'vi',
        answers: [ex.vi],
        hint: level === 3 ? `${v.vi} = ${v.pl}` : undefined,
        grammar: [],
        vocab: [v.id],
        level: 3,
      },
      timeLimitSec: level === 4 ? 75 : undefined,
    };
  }

  // Level 2 (or no example available): retrieve the word inside its sentence.
  const cloze = examples.length ? clozeOf(examples[0].vi, v.vi) : null;
  if (cloze) {
    return {
      ...common,
      id: uid('t-va2'),
      exercise: {
        id: exId(lesson, `va2-${v.id}`),
        type: 'fill-blank',
        skill: 'vocabulary',
        source: 'generated',
        status: 'unverified',
        instruction: 'Uzupełnij brakujące słowo.',
        sentence: cloze,
        answers: [v.vi],
        translation: examples[0].pl,
        grammar: [],
        vocab: [v.id],
        level: 2,
      },
    };
  }

  // No sentence in the content for this item: ask for the word itself, but
  // still as production (typed Vietnamese), never as reveal-and-rate.
  return {
    ...common,
    level: level > 2 ? 2 : level,
    id: uid('t-va1'),
    exercise: {
      id: exId(lesson, `va1-${v.id}`),
      type: 'typed',
      skill: 'vocabulary',
      source: 'generated',
      status: 'unverified',
      instruction: v.classifier ? `Klasyfikator: ${v.classifier}` : undefined,
      prompt: `Jak powiesz po wietnamsku: „${v.pl}”?`,
      answerLang: 'vi',
      answers: [v.vi, ...v.vi.split('/').map((s) => s.trim()).filter(Boolean)],
      explanation: v.note,
      grammar: [],
      vocab: [v.id],
      level: 2,
    },
  };
}

/**
 * Passive check — used sparingly, as a diagnostic. Recognition among real
 * alternatives, not a self-rated reveal.
 */
export function vocabPassiveTask(v: VocabEntry, pool: VocabEntry[], phase: TaskPhase = 'warmup'): LearningTask | null {
  const distractors = sample(
    pool.filter((o) => o.id !== v.id && o.pl !== v.pl && (o.category === v.category || o.lessonNumber === v.lessonNumber)),
    3,
  );
  if (distractors.length < 2) return null;
  const options = shuffle([v.pl, ...distractors.map((d) => d.pl)]);
  return {
    id: uid('t-vp'),
    srsKind: 'vocab-passive',
    srsRef: v.id,
    lesson: v.lessonId,
    level: 1,
    phase,
    targetVocab: [v.id],
    selfAssessed: false,
    exercise: {
      id: exId(v.lessonId, `vp-${v.id}`),
      type: 'mcq',
      skill: 'vocabulary',
      source: 'generated',
      status: 'unverified',
      instruction: 'Szybkie sprawdzenie rozumienia.',
      prompt: `Co znaczy „${v.vi}”?`,
      options,
      answer: options.indexOf(v.pl),
      explanation: usableExamples(v)[0] ? `${usableExamples(v)[0].vi} – ${usableExamples(v)[0].pl}` : undefined,
      grammar: [],
      vocab: [v.id],
      level: 1,
    },
    timeLimitSec: 25,
  };
}

/* ------------------------------------------------------------------ */
/* Grammar tasks — pattern used in a live sentence                      */
/* ------------------------------------------------------------------ */

export function grammarTask(g: GrammarEntry, level: AutomaticityLevel, phase: TaskPhase = 'grammar'): LearningTask | null {
  const examples = grammarExamples(g);
  if (!examples.length) return null;
  const common = {
    srsKind: 'grammar' as SrsKind,
    srsRef: g.id,
    lesson: g.lessonId,
    level,
    phase,
    targetVocab: [],
    selfAssessed: false,
  };

  if (level >= 5) {
    return {
      ...common,
      id: uid('t-g5'),
      exercise: {
        id: exId(g.lessonId, `g5-${g.id}`),
        type: 'open-answer',
        skill: 'grammar',
        source: 'generated',
        status: 'unverified',
        instruction: 'Bez podpowiedzi.',
        prompt: `Ułóż własne zdanie po wietnamsku, używając wzorca: ${g.title}.`,
        patterns: ['{x}'],
        sample: examples[0].vi,
        explanation: `${g.pattern ?? ''}\nPrzykład: ${examples[0].vi} – ${examples[0].pl}`.trim(),
        grammar: [g.id],
        vocab: [],
        level: 3,
      },
      timeLimitSec: 90,
    };
  }

  const ex = pick(examples);
  if (level >= 3) {
    // Produce the sentence from Polish; level 4 drops the pattern hint.
    return {
      ...common,
      id: uid('t-g3'),
      exercise: {
        id: exId(g.lessonId, `g3-${g.id}`),
        type: 'typed',
        skill: 'grammar',
        source: 'generated',
        status: 'unverified',
        prompt: `Powiedz po wietnamsku: „${ex.pl}”`,
        answerLang: 'vi',
        answers: [ex.vi],
        hint: level === 3 ? g.pattern : undefined,
        explanation: g.pattern,
        grammar: [g.id],
        vocab: [],
        level: 3,
      },
      timeLimitSec: level === 4 ? 75 : undefined,
    };
  }

  // Level 1–2: rebuild the sentence from its own words (word order in use).
  const tokens = ex.vi.trim().split(/\s+/);
  if (tokens.length >= 3 && tokens.length <= 9) {
    return {
      ...common,
      id: uid('t-g2'),
      exercise: {
        id: exId(g.lessonId, `g2-${g.id}`),
        type: 'ordering',
        skill: 'word-order',
        source: 'generated',
        status: 'unverified',
        instruction: g.pattern,
        prompt: `Ułóż zdanie: „${ex.pl}”`,
        tokens,
        translation: ex.pl,
        grammar: [g.id],
        vocab: [],
        level: 2,
      },
    };
  }
  return {
    ...common,
    id: uid('t-g2b'),
    exercise: {
      id: exId(g.lessonId, `g2b-${g.id}`),
      type: 'typed',
      skill: 'grammar',
      source: 'generated',
      status: 'unverified',
      prompt: `Powiedz po wietnamsku: „${ex.pl}”`,
      answerLang: 'vi',
      answers: [ex.vi],
      hint: g.pattern,
      grammar: [g.id],
      vocab: [],
      level: 2,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Dialogue tasks — respond inside a conversation                       */
/* ------------------------------------------------------------------ */

/** Ability ref for one answerable line of a dialogue. */
export const dialogueLineRef = (dialogueId: string, index: number) => `${dialogueId}#${index}`;

export function dialogueTask(d: DialogueEntry, lineIndex: number, level: AutomaticityLevel, phase: TaskPhase = 'conversation'): LearningTask | null {
  const line = d.lines[lineIndex];
  const prev = d.lines[lineIndex - 1];
  if (!line || !prev || line.status === 'flagged') return null;
  const common = {
    srsKind: 'dialogue' as SrsKind,
    srsRef: dialogueLineRef(d.id, lineIndex),
    lesson: d.lessonId,
    level,
    phase,
    targetVocab: [],
    selfAssessed: false,
  };

  if (level >= 4) {
    // Only the other speaker's line — produce a natural answer yourself.
    return {
      ...common,
      id: uid('t-d4'),
      exercise: {
        id: exId(d.lessonId, `d4-${d.id}-${lineIndex}`),
        type: 'open-answer',
        skill: 'dialogue',
        source: 'generated',
        status: 'unverified',
        instruction: `Rozmowa: ${d.situation ?? d.title}`,
        prompt: `${prev.speaker} mówi: „${prev.vi}”\n\nOdpowiedz po wietnamsku.`,
        patterns: ['{x}'],
        sample: line.vi,
        explanation: `Wersja z dialogu: ${line.vi}${line.pl ? ` – ${line.pl}` : ''}`,
        grammar: [],
        vocab: [],
        level: 3,
      },
      timeLimitSec: level === 5 ? 45 : 75,
    };
  }

  // Levels 1–3: reconstruct the exact line, with the previous turn as context.
  return {
    ...common,
    id: uid('t-d2'),
    exercise: {
      id: exId(d.lessonId, `d2-${d.id}-${lineIndex}`),
      type: 'typed',
      skill: 'dialogue',
      source: 'generated',
      status: 'unverified',
      instruction: `Rozmowa: ${d.situation ?? d.title}`,
      prompt: `${prev.speaker}: „${prev.vi}”${prev.pl ? ` (${prev.pl})` : ''}\n\n${line.speaker}: ?${line.pl && level <= 2 ? `\nSens: ${line.pl}` : ''}`,
      answerLang: 'vi',
      answers: [line.vi],
      hint: level === 1 && line.pl ? line.pl : undefined,
      grammar: [],
      vocab: [],
      level: 2,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Scenario tasks — communicative situations from content/scenarios     */
/* ------------------------------------------------------------------ */

/**
 * Scenario patterns say "your answer should contain these fragments, in this
 * order". `{x}` matches one-or-more words everywhere else in the app, which
 * would wrongly reject an answer that simply *starts* or *ends* on one of
 * those fragments ("Cho chị một ly cà phê trứng" against `{x}cho{x}ly{x}`).
 * Rather than loosening `{x}` globally — that would also weaken the authored
 * lesson exercises — the edge cases are expanded here, for scenarios only.
 */
function withOptionalEdges(patterns: string[]): string[] {
  const out = new Set<string>();
  for (const p of patterns) {
    const variants = [p];
    if (p.startsWith('{x}')) variants.push(p.slice(3));
    for (const v of [...variants]) if (v.endsWith('{x}')) variants.push(v.slice(0, -3));
    for (const v of variants) if (v.trim()) out.add(v);
  }
  return [...out];
}

export function scenarioTask(
  s: { id: string; lesson: string; situation: string; goal: string; patterns: string[]; sample: string; vocab: string[]; grammar: string[]; hint?: string },
  level: AutomaticityLevel,
  phase: TaskPhase = 'free',
): LearningTask {
  return {
    id: uid('t-sc'),
    srsKind: 'sentence',
    srsRef: s.id,
    lesson: s.lesson,
    level,
    phase,
    targetVocab: s.vocab,
    selfAssessed: false,
    exercise: {
      id: exId(s.lesson, `sc-${s.id}`),
      type: 'open-answer',
      skill: 'dialogue',
      source: 'generated',
      status: 'unverified',
      instruction: s.situation,
      prompt: s.goal,
      patterns: withOptionalEdges(s.patterns),
      sample: s.sample,
      explanation: level <= 2 && s.hint ? s.hint : undefined,
      grammar: s.grammar,
      vocab: s.vocab,
      level: 3,
    },
    timeLimitSec: level >= 4 ? 90 : undefined,
  };
}

/* ------------------------------------------------------------------ */
/* Speaking tasks — say it aloud, record, compare                       */
/* ------------------------------------------------------------------ */

/**
 * Speaking practice is the one place where self-assessment is the right
 * tool: nothing in the browser can reliably score pronunciation, and this
 * app does not pretend otherwise. The learner speaks first, then compares
 * with the model and rates themselves.
 */
export function speakingTask(vi: string, pl: string, ref: string, lesson: string, level: AutomaticityLevel, targetVocab: string[] = []): LearningTask {
  return {
    id: uid('t-sp'),
    srsKind: 'sentence',
    srsRef: ref,
    lesson,
    level,
    phase: 'speaking',
    targetVocab,
    selfAssessed: true,
    exercise: {
      id: exId(lesson, `sp-${ref}`),
      type: 'speaking',
      skill: 'listening',
      source: 'generated',
      status: 'unverified',
      instruction: 'Powiedz na głos, nagraj się, potem porównaj ze wzorem.',
      // Always production-first: the Vietnamese model is never shown before
      // the attempt, at any level. Seeing the answer and then rating yourself
      // is the flashcard pattern this app deliberately avoids.
      prompt: `Powiedz po wietnamsku: „${pl}”`,
      target: vi,
      translation: pl,
      showTarget: false,
      grammar: [],
      vocab: targetVocab,
      level: 3,
    },
    timeLimitSec: 60,
  };
}

/* ------------------------------------------------------------------ */
/* Pools — what could be practised, given what has been studied         */
/* ------------------------------------------------------------------ */

export interface TaskPools {
  vocab: VocabEntry[];
  grammar: GrammarEntry[];
  dialogues: { dialogue: DialogueEntry; lineIndex: number }[];
  scenarios: ReturnType<typeof scenariosForLessons>;
}

export function poolsFor(lessonNumbers: number[]): TaskPools {
  const set = new Set(lessonNumbers);
  const vocab = allVocab.filter((v) => set.has(v.lessonNumber) && v.srs && v.status !== 'flagged');
  const grammar: GrammarEntry[] = [];
  const dialogues: { dialogue: DialogueEntry; lineIndex: number }[] = [];
  for (const n of lessonNumbers) {
    const lesson = [...lessonById.values()].find((l) => l.number === n);
    if (!lesson) continue;
    for (const g of lesson.grammar) {
      const entry = grammarById.get(g.id);
      if (entry && grammarExamples(entry).length) grammar.push(entry);
    }
    for (const d of lesson.dialogues) {
      const entry = dialogueById.get(d.id);
      if (!entry) continue;
      entry.lines.forEach((l, i) => {
        if (i > 0 && l.status !== 'flagged') dialogues.push({ dialogue: entry, lineIndex: i });
      });
    }
  }
  return { vocab, grammar, dialogues, scenarios: scenariosForLessons(lessonNumbers) };
}

/** Vocabulary that has a real sentence to practise inside. */
export function contextualVocab(pool: VocabEntry[]): VocabEntry[] {
  return pool.filter((v) => usableExamples(v).length > 0 || isPhraseLike(v));
}

export const SKILL_OF_KIND: Record<SrsKind, Skill> = {
  'vocab-active': 'vocabulary',
  'vocab-passive': 'vocabulary',
  grammar: 'grammar',
  sentence: 'grammar',
  dialogue: 'dialogue',
  listening: 'listening',
};

export { usableExamples, grammarExamples };
