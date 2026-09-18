import { lessons } from '../../src/data/content';
import { lessonTargets } from '../../src/learning/progression';
import { MASTERY_SUCCESSES } from '../../src/learning/targets';
import type { SrsKind } from '../../src/learning/srs';
import { reducer, type AppState } from '../../src/learning/state';
import { DAY_MS } from '../../src/utilities/dates';

export const byNumber = (n: number) => lessons.find((l) => l.number === n)!;

/** Drive one target through `times` graded answers, a day apart. */
export function demonstrate(state: AppState, kind: SrsKind, ref: string, lesson: string, times: number, grade: 0 | 1 | 2 | 3 = 2, start = 0): AppState {
  let s = state;
  for (let i = 0; i < times; i++) s = reducer(s, { type: 'review', kind, ref, lesson, grade, now: start + i * DAY_MS });
  return s;
}

/**
 * Master every required target of a lesson — the honest way a learner
 * finishes one, and what the advance rule is written against.
 */
export function masterLesson(state: AppState, n: number, start = 0): AppState {
  const l = byNumber(n);
  let s = reducer(state, { type: 'visit-lesson', lesson: l.id, now: start });
  for (const t of lessonTargets(l)) s = demonstrate(s, t.kind, t.ref, l.id, MASTERY_SUCCESSES, 2, start);
  return s;
}

/**
 * Bring the course frontier to lesson `n` by genuinely finishing everything
 * before it. Needed by any test whose fixture refers to material from a later
 * lesson, since deferred material is invisible to the app by design.
 */
export function openCourseThrough(state: AppState, n: number, start = 0): AppState {
  let s = state;
  for (let i = 1; i < n; i++) s = masterLesson(s, i, start);
  return s;
}
