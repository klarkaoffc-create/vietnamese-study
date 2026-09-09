/**
 * One definition of an "open, practiceable mistake".
 *
 * The badge, the page count, the "Ćwicz" button, the displayed list and the
 * mistake-practice session builder all go through this module, so they can
 * never disagree again. The rule is deliberately not a filter that merely
 * *resembles* the session builder — a mistake counts as practiceable exactly
 * when `mistakeTask()` can actually rebuild a task for it. Counting and
 * building are the same code path.
 *
 * Why this was needed: mistakes are logged with a coarse `refKind`
 * ('vocab' | 'exercise' | 'generated'), and `recordTask()` labels every
 * non-vocabulary ability as 'exercise'. So a failed grammar, scenario,
 * dialogue or speaking task was stored with refKind 'exercise' but a
 * grammar / scenario / dialogue-line / vocabulary id, which is never present
 * in `exerciseById`. The old builder looked only in `exerciseById`, found
 * nothing, dropped the item — while every count still showed it as open.
 * Result: "2 otwarte błędy" → "Nie masz otwartych błędów".
 *
 * `mistakeSource()` therefore resolves the ref against every id namespace
 * rather than trusting `refKind`. The namespaces are disjoint by
 * construction (`v-bai-*`, `g-bai-*`, `s-bai-*`, `d-bai-*#n`, `e-*`), so the
 * lookup is unambiguous, and old records recorded before this fix start
 * working again without touching stored state.
 */
import {
  dialogueById,
  exerciseById,
  grammarById,
  scenarioById,
  vocabById,
  type DialogueEntry,
  type ExerciseEntry,
  type GrammarEntry,
  type VocabEntry,
} from '../data/content';
import { GeneratorKindSchema, type GeneratorKind, type Scenario } from '../data/schema';
import { generate } from './generators';
import { makeSrsId, type AutomaticityLevel, type SrsItem } from './srs';
import { dialogueTask, grammarTask, scenarioTask, vocabActiveTask } from './tasks';
import type { AppState, Mistake } from './state';
import type { SessionItem } from './session';

/** The content a logged mistake can be rebuilt from. */
export type MistakeSource =
  | { kind: 'vocab'; vocab: VocabEntry }
  | { kind: 'grammar'; grammar: GrammarEntry }
  | { kind: 'scenario'; scenario: Scenario }
  | { kind: 'dialogue'; dialogue: DialogueEntry; lineIndex: number }
  | { kind: 'exercise'; entry: ExerciseEntry }
  | { kind: 'generated'; generator: GeneratorKind };

/**
 * Resolve a mistake back to the content that produced it.
 *
 * `refKind` is used as a hint for ordering the lookups, never as the final
 * word — see the module comment for why it cannot be trusted.
 */
export function mistakeSource(m: Mistake): MistakeSource | null {
  if (m.refKind === 'generated') {
    // Instances generated before `generatorKind` was recorded cannot be
    // rebuilt: their ids are opaque and do not reliably embed the kind.
    const parsed = GeneratorKindSchema.safeParse(m.generatorKind);
    return parsed.success ? { kind: 'generated', generator: parsed.data } : null;
  }

  const v = vocabById.get(m.ref);
  if (v) return { kind: 'vocab', vocab: v };

  const e = exerciseById.get(m.ref);
  if (e) return { kind: 'exercise', entry: e };

  const g = grammarById.get(m.ref);
  if (g) return { kind: 'grammar', grammar: g };

  const s = scenarioById.get(m.ref);
  if (s) return { kind: 'scenario', scenario: s };

  // Dialogue abilities are stored as "<dialogue id>#<line index>".
  const hash = m.ref.lastIndexOf('#');
  if (hash > 0) {
    const d = dialogueById.get(m.ref.slice(0, hash));
    const idx = Number(m.ref.slice(hash + 1));
    if (d && Number.isInteger(idx)) return { kind: 'dialogue', dialogue: d, lineIndex: idx };
  }
  return null;
}

const levelOf = (item: SrsItem | undefined): AutomaticityLevel => (item?.level ?? 1) as AutomaticityLevel;

/**
 * Rebuild a logged mistake as something to do again, or null when the
 * content it referred to is gone or can no longer generate a task.
 *
 * This is the single arbiter: everything that counts, lists or enables
 * practice asks this function.
 */
export function mistakeTask(m: Mistake, state: AppState): SessionItem | null {
  const src = mistakeSource(m);
  if (!src) return null;
  switch (src.kind) {
    case 'vocab': {
      const t = vocabActiveTask(src.vocab, levelOf(state.srs[makeSrsId('vocab-active', src.vocab.id)]), 'mistakes');
      return t ? { kind: 'task', task: t, mistakeRef: m.ref } : null;
    }
    case 'exercise':
      return { kind: 'exercise', exercise: src.entry.exercise, lesson: src.entry.ownerId, mistakeRef: m.ref };
    case 'grammar': {
      const t = grammarTask(src.grammar, levelOf(state.srs[makeSrsId('grammar', src.grammar.id)]), 'mistakes');
      return t ? { kind: 'task', task: t, mistakeRef: m.ref } : null;
    }
    case 'scenario': {
      const t = scenarioTask(src.scenario, levelOf(state.srs[makeSrsId('sentence', src.scenario.id)]), 'mistakes');
      return { kind: 'task', task: t, mistakeRef: m.ref };
    }
    case 'dialogue': {
      const t = dialogueTask(src.dialogue, src.lineIndex, levelOf(state.srs[makeSrsId('dialogue', m.ref)]), 'mistakes');
      return t ? { kind: 'task', task: t, mistakeRef: m.ref } : null;
    }
    case 'generated': {
      const gen = generate(src.generator, {}, 1)[0];
      return gen ? { kind: 'generated', instance: gen, lesson: m.lesson, mistakeRef: m.ref } : null;
    }
  }
}

/** True exactly when this mistake can be turned back into a task right now. */
export function isPracticeable(m: Mistake, state: AppState): boolean {
  return mistakeTask(m, state) !== null;
}

/**
 * Open AND practiceable — the only number the UI is allowed to label
 * "otwarte błędy", because every one of these is guaranteed to appear in the
 * next mistake session.
 */
export function openMistakes(state: AppState): Mistake[] {
  return state.mistakes.filter((m) => !m.resolved && isPracticeable(m, state));
}

/**
 * Unresolved, but the lesson content it pointed at has changed or gone.
 * Kept in history and shown separately; never counted as practiceable and
 * never silently deleted.
 */
export function orphanedMistakes(state: AppState): Mistake[] {
  return state.mistakes.filter((m) => !m.resolved && !isPracticeable(m, state));
}

export function resolvedMistakes(state: AppState): Mistake[] {
  return state.mistakes.filter((m) => m.resolved);
}

/** Every open, practiceable mistake, rebuilt as a task. Never empty when the count is not. */
export function mistakeSessionItems(state: AppState): SessionItem[] {
  return openMistakes(state)
    .map((m) => mistakeTask(m, state))
    .filter((x): x is SessionItem => !!x);
}

/** Where the per-row "Ćwicz" button should go for a single mistake. */
export function mistakePracticeHref(m: Mistake): string {
  const src = mistakeSource(m);
  if (src?.kind === 'vocab') return `/cwicz?vocab=${src.vocab.id}`;
  if (src?.kind === 'exercise') return `/cwicz?exercise=${src.entry.exercise.id}`;
  if (src?.kind === 'grammar') return `/cwicz?grammar=${src.grammar.id}`;
  return '/powtorki/mistakes';
}
