/**
 * Learning targets: what the course is actually trying to teach, and when it
 * should stop teaching it.
 *
 * A target is one scheduled ability — a word you can use, a grammar point you
 * can apply, a scenario you can handle, a dialogue turn you can take. It is
 * deliberately NOT "an exercise": several task shapes assess the same target,
 * and all of them count towards the same mastery. Every task built for
 * `g-bai-06-tense` is a demonstration of *using đã / đang / sẽ*, whether it
 * arrives as a translation, a cloze or a free answer.
 *
 * The course runs each target through two states:
 *
 *   LEARNING      — up to MASTERY_SUCCESSES successful demonstrations, each at
 *                   a different rung of the automaticity ladder, so the same
 *                   question is never simply asked three times.
 *   MAINTENANCE   — mastered for now. Dropped from the learning rotation and
 *                   pushed out to a long interval; it comes back occasionally,
 *                   not tomorrow.
 *
 * This is what stops the app drilling something you have already shown you can
 * do, which was the main reason a week of study could feel like no progress.
 */
import { isWeak, makeSrsId, MAINTENANCE_MIN_DAYS, MASTERY_SUCCESSES, type SrsItem, type SrsKind } from './srs';
import type { AppState } from './state';

/**
 * Re-exported so callers can speak in course terms. `MASTERY_SUCCESSES` is the
 * number of successful demonstrations that end the learning phase;
 * `MAINTENANCE_MIN_DAYS` is the rest a target earns the moment it gets there,
 * instead of continuing the slow 1 → 3 → 7 climb that used to put a
 * just-proved target back in tomorrow's queue.
 */
export { MAINTENANCE_MIN_DAYS, MASTERY_SUCCESSES };

/**
 * A target is not offered again for this many hours after it was last
 * answered, however "due" the scheduler thinks it is. Stops the same word
 * coming back three tasks later, or on each of several sessions in one day.
 */
export const COOLDOWN_HOURS = 20;

export type TargetPhase = 'new' | 'learning' | 'mastered';

export function targetPhase(item: SrsItem | undefined): TargetPhase {
  if (!item || item.successes + item.failures === 0) return 'new';
  // A target that keeps failing is still being learned, whatever its count.
  if (item.successes >= MASTERY_SUCCESSES && !isWeak(item)) return 'mastered';
  return 'learning';
}

export const isMastered = (item: SrsItem | undefined): boolean => targetPhase(item) === 'mastered';

/** Still worth spending learning time on: new, or part-way through. */
export const isInLearning = (item: SrsItem | undefined): boolean => targetPhase(item) !== 'mastered';

export function phaseOf(state: AppState, kind: SrsKind, ref: string): TargetPhase {
  return targetPhase(state.srs[makeSrsId(kind, ref)]);
}

/**
 * Answered so recently that showing it again would be repetition rather than
 * practice. Applies to selection only — a mistake being re-practised on
 * purpose, or a requeue inside the current session, ignores it.
 */
export function inCooldown(item: SrsItem | undefined, now: number): boolean {
  if (!item?.lastReview) return false;
  return now - item.lastReview < COOLDOWN_HOURS * 60 * 60 * 1000;
}

/** How many demonstrations are still wanted before this target is parked. */
export function remainingDemonstrations(item: SrsItem | undefined): number {
  if (isMastered(item)) return 0;
  return Math.max(0, MASTERY_SUCCESSES - (item?.successes ?? 0));
}
