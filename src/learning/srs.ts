/**
 * Transparent, time-based spaced repetition.
 *
 * A simplified SM-2: every item has an interval (days), an ease factor and a
 * due timestamp. The scheduling maths is deliberately unchanged from the
 * original engine — what changed is WHAT gets scheduled. Instead of
 * "flashcard for the word chú", the scheduler now tracks abilities:
 * producing a word inside a sentence, using a grammar pattern in context,
 * answering in a dialogue, understanding speech. The learner always meets
 * these as tasks (see `src/learning/tasks.ts`), never as reveal-and-rate
 * cards.
 *
 * Grades:
 *   0 – failed          → interval resets, comes back in the same session
 *   1 – shaky / partial → small growth, ease drops
 *   2 – produced it     → normal growth (1 → 3 → interval × ease)
 *   3 – effortless      → faster growth, ease rises
 */
import { DAY_MS } from '../utilities/dates';

export type SrsGrade = 0 | 1 | 2 | 3;

/**
 * What the scheduler tracks. These are abilities, not card directions.
 *
 * - `vocab-active`   — can retrieve and USE the item in Vietnamese. This is
 *                      the ability that matters for speaking, so it is what
 *                      vocabulary mastery is mostly based on.
 * - `vocab-passive`  — understands the item when reading/hearing it. Used as
 *                      a diagnostic, deliberately weighted far lower.
 * - `grammar`        — applies a pattern in a live sentence.
 * - `sentence`       — produces one concrete useful sentence on demand.
 * - `dialogue`       — responds appropriately inside a conversation.
 * - `listening`      — understands spoken input.
 */
export type SrsKind = 'vocab-active' | 'vocab-passive' | 'grammar' | 'sentence' | 'dialogue' | 'listening';

export const SRS_KINDS: SrsKind[] = ['vocab-active', 'vocab-passive', 'grammar', 'sentence', 'dialogue', 'listening'];

/**
 * Automaticity ladder. Every scheduled ability climbs this as it is
 * successfully produced, and each step removes scaffolding: level 1 shows
 * the answer among options, level 5 gives only a situation and expects
 * spontaneous Vietnamese. Failures drop it back one step.
 */
export type AutomaticityLevel = 1 | 2 | 3 | 4 | 5;

export const AUTOMATICITY_LABEL: Record<AutomaticityLevel, string> = {
  1: 'rozpoznawanie',
  2: 'przypomnienie z podpowiedzią',
  3: 'budowanie zdania',
  4: 'użycie w kontekście',
  5: 'produkcja spontaniczna',
};

export interface SrsItem {
  id: string;
  /** Lesson id the item was introduced in. */
  lesson: string;
  kind: SrsKind;
  /** Content id (vocab id, grammar id, sentence id, dialogue line id …). */
  ref: string;
  lastReview: number | null;
  successes: number;
  failures: number;
  /** Current interval in days (0 = learning). */
  interval: number;
  ease: number;
  /** Timestamp when the item is due. */
  due: number;
  /** Consecutive failures since the last success. */
  lapses: number;
  /** How far up the automaticity ladder this ability has climbed. */
  level: AutomaticityLevel;
}

export const MIN_EASE = 1.3;
export const DEFAULT_EASE = 2.5;
/** Failed cards come back after this many minutes within the session. */
export const RELEARN_MINUTES = 10;

export function makeSrsId(kind: SrsKind, ref: string): string {
  return `${kind}:${ref}`;
}

export function newSrsItem(kind: SrsKind, ref: string, lesson: string, now = Date.now()): SrsItem {
  return {
    id: makeSrsId(kind, ref),
    lesson,
    kind,
    ref,
    lastReview: null,
    successes: 0,
    failures: 0,
    interval: 0,
    ease: DEFAULT_EASE,
    due: now,
    lapses: 0,
    level: 1,
  };
}

const clampLevel = (n: number): AutomaticityLevel => Math.max(1, Math.min(5, n)) as AutomaticityLevel;

export function schedule(item: SrsItem, grade: SrsGrade, now = Date.now()): SrsItem {
  const next: SrsItem = { ...item, lastReview: now, level: item.level ?? 1 };
  switch (grade) {
    case 0:
      next.failures += 1;
      next.lapses += 1;
      next.interval = 0;
      next.ease = Math.max(MIN_EASE, item.ease - 0.2);
      next.due = now + RELEARN_MINUTES * 60 * 1000;
      // Failing at the current amount of scaffolding puts the ability back a
      // step, so the next encounter gives more support again.
      next.level = clampLevel((item.level ?? 1) - 1);
      return next;
    case 1:
      next.successes += 1;
      next.lapses = 0;
      next.interval = item.interval === 0 ? 1 : Math.max(1, Math.round(item.interval * 1.2));
      next.ease = Math.max(MIN_EASE, item.ease - 0.15);
      break;
    case 2:
      next.successes += 1;
      next.lapses = 0;
      next.interval = item.interval === 0 ? 1 : item.interval === 1 ? 3 : Math.round(item.interval * item.ease);
      break;
    case 3:
      next.successes += 1;
      next.lapses = 0;
      next.interval = item.interval === 0 ? 3 : Math.round(item.interval * item.ease * 1.3);
      next.ease = item.ease + 0.15;
      break;
  }
  next.interval = Math.min(next.interval, 365);
  next.due = now + next.interval * DAY_MS;
  // A clean success moves the ability one rung up the automaticity ladder,
  // so the next task for it is presented with less scaffolding.
  if (grade >= 2) next.level = clampLevel((item.level ?? 1) + 1);
  return next;
}

/**
 * 0–100 mastery derived from interval, reliability and how far the ability
 * climbed the automaticity ladder. The level term is what stops an item
 * from looking "mastered" while it has only ever been recognised — an item
 * still sitting at level 1–2 is capped well below full mastery.
 */
export function mastery(item: SrsItem): number {
  const total = item.successes + item.failures;
  if (total === 0) return 0;
  const intervalScore = 1 - Math.exp(-item.interval / 14); // 1 day ≈ 7 %, 7 days ≈ 39 %, 21 days ≈ 78 %, 60 days ≈ 99 %
  const reliability = item.successes / total;
  const levelScore = ((item.level ?? 1) - 1) / 4; // level 1 → 0, level 5 → 1
  const raw = 100 * (0.5 * intervalScore + 0.2 * reliability + 0.3 * levelScore);
  return Math.max(0, Math.min(100, Math.round(raw - (item.lapses > 0 ? 15 : 0))));
}

/** True once the learner can produce this without scaffolding, repeatedly. */
export function isAutomatic(item: SrsItem | undefined): boolean {
  return !!item && (item.level ?? 1) >= 4 && item.interval >= 14 && item.lapses === 0;
}

export type MasteryLevel = 'new' | 'learning' | 'young' | 'mature';

export function masteryLevel(item: SrsItem | undefined): MasteryLevel {
  if (!item || item.successes + item.failures === 0) return 'new';
  if (item.interval < 3) return 'learning';
  // "Mature" now also requires having produced the item with little
  // scaffolding — a long interval earned only through recognition is not
  // the same as being able to say it.
  if (item.interval < 21 || (item.level ?? 1) < 4) return 'young';
  return 'mature';
}

export function isDue(item: SrsItem, now = Date.now()): boolean {
  return item.due <= now;
}

/** An item is weak when it lapsed recently or its reliability is poor. */
export function isWeak(item: SrsItem): boolean {
  const total = item.successes + item.failures;
  if (total === 0) return false;
  return item.lapses > 0 || item.failures / total >= 0.4 || (mastery(item) < 35 && total >= 2);
}

/** Order due items: overdue first, then weakest. */
export function sortForReview(items: SrsItem[], now = Date.now()): SrsItem[] {
  return items.slice().sort((a, b) => {
    const overdueA = now - a.due;
    const overdueB = now - b.due;
    if (isWeak(a) !== isWeak(b)) return isWeak(a) ? -1 : 1;
    return overdueB - overdueA;
  });
}

/** Map a graded exercise outcome onto an SRS grade. */
export function gradeFromOutcome(outcome: 'correct' | 'tone' | 'wrong', selfRated?: SrsGrade): SrsGrade {
  if (selfRated !== undefined) return selfRated;
  if (outcome === 'correct') return 2;
  if (outcome === 'tone') return 1;
  return 0;
}
