/**
 * What has legitimately entered the course yet.
 *
 * The course teaches one lesson at a time and never reaches past it. A lesson
 * is ELIGIBLE once the frontier has arrived at it; everything beyond is
 * DEFERRED — it may exist in stored progress, but the learner must not meet it
 * in reviews, mistakes, counters or the daily session.
 *
 * Why this module exists: an earlier version advanced the frontier at 80 %
 * mastery and let the session builder reach into later lessons, so Bài 3
 * material (and, once answered wrongly, Bài 3 mistakes) got into a learner's
 * state while Bài 2 was still being learned. That history is real and must not
 * be deleted — but it must not count either. Treating those records as
 * deferred rather than erasing them means nothing is lost, the learner does
 * not get to skip half of Bài 3 on the strength of an accident, and fresh
 * learning drives Bài 3's mastery when it legitimately opens.
 *
 * "Has an SRS record" is therefore never proof that material belongs in the
 * course. Eligibility is decided here, from the frontier, and nowhere else.
 */
import { lessonById, lessons } from '../data/content';
import { nextLesson } from './progression';
import type { AppState } from './state';

/**
 * The lesson currently being learned. Everything numbered at or below this is
 * eligible; everything above is deferred.
 *
 * With the course finished there is no frontier, so every lesson is eligible
 * and the app becomes review-and-consolidation.
 */
export function frontierNumber(state: AppState): number {
  const next = nextLesson(state);
  return next ? next.number : Math.max(0, ...lessons.map((l) => l.number));
}

/** Has this lesson number legitimately entered the course? */
export function isLessonNumberEligible(state: AppState, lessonNumber: number, frontier = frontierNumber(state)): boolean {
  return lessonNumber <= frontier;
}

/**
 * Same question, by lesson id.
 *
 * An id that matches no lesson is NOT deferred — you cannot defer material
 * that does not exist. It passes here and is then caught as an orphan by the
 * practiceability check, which is the accurate classification for a record
 * left behind by renamed content.
 */
export function isLessonIdEligible(state: AppState, lessonId: string, frontier = frontierNumber(state)): boolean {
  const n = lessonById.get(lessonId)?.number;
  return n === undefined || n <= frontier;
}

/** Lesson numbers the learner may currently meet, in course order. */
export function eligibleLessonNumbers(state: AppState): number[] {
  const frontier = frontierNumber(state);
  return lessons
    .map((l) => l.number)
    .filter((n) => n <= frontier)
    .sort((a, b) => a - b);
}

/**
 * A reusable predicate for anything carrying a `lesson` id — SRS items,
 * mistakes, session items. Bind the frontier once when filtering a list.
 */
export function eligibilityFilter(state: AppState): (carrier: { lesson: string }) => boolean {
  const frontier = frontierNumber(state);
  return (carrier) => isLessonIdEligible(state, carrier.lesson, frontier);
}

/**
 * True when a lesson's stored progress came only from accidental early
 * exposure. Its card should look like the future lesson it is, rather than
 * advertising a misleading few percent.
 */
export function isDeferredLesson(state: AppState, lessonNumber: number): boolean {
  return !isLessonNumberEligible(state, lessonNumber);
}
