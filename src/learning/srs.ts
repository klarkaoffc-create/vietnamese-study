/**
 * Transparent, time-based spaced repetition.
 *
 * A simplified SM-2: every item has an interval (days), an ease factor and a
 * due timestamp. Grades:
 *   0 – "Nie umiem"  → interval resets, due again in the same session
 *   1 – "Trudne"     → small growth, ease drops
 *   2 – "Umiem"      → normal growth (1 → 3 → interval × ease)
 *   3 – "Łatwe"      → faster growth, ease rises
 * Mastery (0–100) is derived from the current interval and the success ratio
 * so the learner can see exactly why an item is "weak".
 */
import { DAY_MS } from '../utilities/dates';

export type SrsGrade = 0 | 1 | 2 | 3;

export type SrsKind = 'vocab-vi-pl' | 'vocab-pl-vi' | 'grammar' | 'exercise';

export interface SrsItem {
  id: string;
  /** Lesson id the item was introduced in. */
  lesson: string;
  kind: SrsKind;
  /** Content id (vocab id, grammar id or exercise id). */
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
  };
}

export function schedule(item: SrsItem, grade: SrsGrade, now = Date.now()): SrsItem {
  const next: SrsItem = { ...item, lastReview: now };
  switch (grade) {
    case 0:
      next.failures += 1;
      next.lapses += 1;
      next.interval = 0;
      next.ease = Math.max(MIN_EASE, item.ease - 0.2);
      next.due = now + RELEARN_MINUTES * 60 * 1000;
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
  return next;
}

/** 0–100 mastery derived from interval and reliability. */
export function mastery(item: SrsItem): number {
  const total = item.successes + item.failures;
  if (total === 0) return 0;
  const intervalScore = 1 - Math.exp(-item.interval / 14); // 1 day ≈ 7 %, 7 days ≈ 39 %, 21 days ≈ 78 %, 60 days ≈ 99 %
  const reliability = item.successes / total;
  const raw = 100 * (0.75 * intervalScore + 0.25 * reliability);
  return Math.max(0, Math.min(100, Math.round(raw - (item.lapses > 0 ? 15 : 0))));
}

export type MasteryLevel = 'new' | 'learning' | 'young' | 'mature';

export function masteryLevel(item: SrsItem | undefined): MasteryLevel {
  if (!item || item.successes + item.failures === 0) return 'new';
  if (item.interval < 3) return 'learning';
  if (item.interval < 21) return 'young';
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
