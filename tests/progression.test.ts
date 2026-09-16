import { describe, expect, it } from 'vitest';
import { lessons } from '../src/data/content';
import { initialState, reducer, type AppState } from '../src/learning/state';
import { buildSession, currentLesson, DAILY_MISTAKE_CAP, DAILY_REVIEW_CAP, DAILY_TASKS, studiedLessonNumbers, type DailyPlan, type SessionItem } from '../src/learning/session';
import { completedLessonNumbers, completedLessons, lessonReadyToAdvance, lessonStatus, lessonTargets, nextLesson } from '../src/learning/progression';
import { frontierLessons } from '../src/learning/session';
import { MAINTENANCE_MIN_DAYS, MASTERY_SUCCESSES, isMastered, targetPhase } from '../src/learning/targets';
import { makeSrsId } from '../src/learning/srs';
import { DAY_MS } from '../src/utilities/dates';

const T0 = Date.UTC(2026, 8, 16, 9, 0, 0);
const byNumber = (n: number) => lessons.find((l) => l.number === n)!;

/** Demonstrate one target `times` times, each a day apart. */
function demonstrate(state: AppState, kind: 'vocab-active' | 'grammar', ref: string, lesson: string, times: number, grade: 0 | 1 | 2 | 3 = 2, start = T0): AppState {
  let s = state;
  for (let i = 0; i < times; i++) s = reducer(s, { type: 'review', kind, ref, lesson, grade, now: start + i * DAY_MS });
  return s;
}

/** Take a lesson to completion the way a learner would: demonstrate its targets. */
function completeLesson(state: AppState, n: number, start = T0): AppState {
  const l = byNumber(n);
  let s = reducer(state, { type: 'visit-lesson', lesson: l.id, now: start });
  for (const t of lessonTargets(l)) s = demonstrate(s, t.kind, t.ref, l.id, MASTERY_SUCCESSES, 2, start);
  return s;
}

const refsOf = (items: SessionItem[]) => items.map((i) => (i.kind === 'task' ? `${i.task.srsKind}:${i.task.srsRef}` : i.kind === 'exercise' ? i.exercise.id : i.instance.id));

/* ------------------------------------------------------------------ */
/* CASE A — three demonstrations, then leave it alone                  */
/* ------------------------------------------------------------------ */

describe('CASE A: a target with three successes stops being drilled', () => {
  it('moves from learning to mastered on the third demonstration', () => {
    const l = byNumber(1);
    const t = lessonTargets(l)[0];
    let s = initialState(T0);
    expect(targetPhase(s.srs[makeSrsId(t.kind, t.ref)])).toBe('new');
    s = demonstrate(s, t.kind, t.ref, l.id, 1);
    expect(targetPhase(s.srs[makeSrsId(t.kind, t.ref)])).toBe('learning');
    s = demonstrate(s, t.kind, t.ref, l.id, 1, 2, T0 + DAY_MS);
    expect(targetPhase(s.srs[makeSrsId(t.kind, t.ref)])).toBe('learning');
    s = demonstrate(s, t.kind, t.ref, l.id, 1, 2, T0 + 2 * DAY_MS);
    expect(targetPhase(s.srs[makeSrsId(t.kind, t.ref)])).toBe('mastered');
  });

  it('schedules maintenance far away instead of tomorrow', () => {
    const l = byNumber(1);
    const t = lessonTargets(l)[0];
    let s = initialState(T0);
    s = demonstrate(s, t.kind, t.ref, l.id, MASTERY_SUCCESSES);
    const item = s.srs[makeSrsId(t.kind, t.ref)];
    expect(item.successes).toBe(MASTERY_SUCCESSES);
    expect(item.interval).toBeGreaterThanOrEqual(MAINTENANCE_MIN_DAYS);
    // Not due tomorrow, not due next week.
    expect(item.due).toBeGreaterThan(item.lastReview! + 7 * DAY_MS);
  });

  it('drops out of the daily learning rotation', () => {
    const l = byNumber(1);
    const targets = lessonTargets(l);
    let s = reducer(initialState(T0), { type: 'visit-lesson', lesson: l.id, now: T0 });
    // Master the first four targets of the lesson.
    const done = targets.slice(0, 4);
    for (const t of done) s = demonstrate(s, t.kind, t.ref, l.id, MASTERY_SUCCESSES);
    const plan = buildSession(s, 'today', T0 + 4 * DAY_MS);
    const refs = refsOf(plan.items);
    for (const t of done) {
      expect(isMastered(s.srs[makeSrsId(t.kind, t.ref)])).toBe(true);
      expect(refs, `${t.ref} was mastered but is still being drilled`).not.toContain(`${t.kind}:${t.ref}`);
    }
  });

  it('never shows the same target twice in one session', () => {
    const s = completeLesson(initialState(T0), 1);
    for (const day of [1, 2, 3]) {
      const refs = refsOf(buildSession(s, 'today', T0 + day * DAY_MS).items);
      expect(new Set(refs).size, `duplicate target on day ${day}`).toBe(refs.length);
    }
  });
});

/* ------------------------------------------------------------------ */
/* CASE B — a failure returns, but does not loop forever               */
/* ------------------------------------------------------------------ */

describe('CASE B: two successes and a failure', () => {
  it('stays in learning and can still be finished', () => {
    const l = byNumber(1);
    const t = lessonTargets(l)[0];
    let s = initialState(T0);
    s = demonstrate(s, t.kind, t.ref, l.id, 2);
    s = demonstrate(s, t.kind, t.ref, l.id, 1, 0, T0 + 2 * DAY_MS); // failed
    const afterFail = s.srs[makeSrsId(t.kind, t.ref)];
    expect(targetPhase(afterFail)).toBe('learning');
    expect(afterFail.interval).toBe(0); // comes back inside the session

    // A success later finishes it rather than restarting the count.
    s = demonstrate(s, t.kind, t.ref, l.id, 1, 2, T0 + 3 * DAY_MS);
    const done = s.srs[makeSrsId(t.kind, t.ref)];
    expect(done.successes).toBeGreaterThanOrEqual(MASTERY_SUCCESSES);
    expect(targetPhase(done)).toBe('mastered');
    expect(done.interval).toBeGreaterThanOrEqual(MAINTENANCE_MIN_DAYS);
  });

  it('does not let one failed target dominate later sessions', () => {
    const l = byNumber(1);
    const t = lessonTargets(l)[0];
    let s = reducer(initialState(T0), { type: 'visit-lesson', lesson: l.id, now: T0 });
    s = demonstrate(s, t.kind, t.ref, l.id, 1, 0);
    // Across several days it may reappear, but never more than once a session.
    for (const day of [1, 2, 3, 4]) {
      const refs = refsOf(buildSession(s, 'today', T0 + day * DAY_MS).items);
      expect(refs.filter((r) => r === `${t.kind}:${t.ref}`).length).toBeLessThanOrEqual(1);
    }
  });
});

/* ------------------------------------------------------------------ */
/* CASE C — several lessons in one day                                 */
/* ------------------------------------------------------------------ */

describe('CASE C: completing Bài 5, 6 and 7 in one day', () => {
  it('advances nextLesson to Bài 8', () => {
    let s = initialState(T0);
    for (const n of [1, 2, 3, 4]) s = completeLesson(s, n);
    expect(nextLesson(s)!.number).toBe(5);

    // Three lessons, same day.
    for (const n of [5, 6, 7]) s = completeLesson(s, n, T0);
    expect(nextLesson(s)!.number).toBe(8);
    expect(currentLesson(s)).toBe(8);
    // Progression claim, so it asks the advance rule. Formal completion is a
    // separate, stricter thing — covered by its own suite below.
    expect([1, 2, 3, 4, 5, 6, 7].every((n) => lessonReadyToAdvance(s, byNumber(n)))).toBe(true);
  });

  it('keeps Bài 8 next the following day, despite review coming due', () => {
    let s = initialState(T0);
    for (const n of [1, 2, 3, 4, 5, 6, 7]) s = completeLesson(s, n, T0);
    // A day later the earlier lessons have review waiting; progression is unmoved.
    expect(nextLesson(s)!.number).toBe(8);
    const tomorrow = buildSession(s, 'today', T0 + DAY_MS) as DailyPlan;
    expect(tomorrow.course.next!.number).toBe(8);
  });
});

/* ------------------------------------------------------------------ */
/* CASE D — a big review backlog must not block new material           */
/* ------------------------------------------------------------------ */

describe('CASE D: 50 due reviews', () => {
  function backlog(): AppState {
    let s = initialState(T0);
    for (const n of [1, 2, 3, 4, 5, 6, 7]) s = completeLesson(s, n, T0);
    // Force a big pile of overdue items.
    const srs = { ...s.srs };
    let n = 0;
    for (const [id, item] of Object.entries(srs)) {
      if (n++ >= 50) break;
      srs[id] = { ...item, due: T0 - 5 * DAY_MS, interval: 1, lastReview: T0 - 5 * DAY_MS };
    }
    return { ...s, srs };
  }

  it('still offers Bài 8 as the next lesson', () => {
    const s = backlog();
    expect(nextLesson(s)!.number).toBe(8);
    const plan = buildSession(s, 'today', T0 + DAY_MS) as DailyPlan;
    expect(plan.course.next!.number).toBe(8);
  });

  it('caps review so forward material keeps the majority of the session', () => {
    const s = backlog();
    const plan = buildSession(s, 'today', T0 + DAY_MS) as DailyPlan;
    // `reviewCount` is the whole supporting half: due review plus mistakes.
    expect(plan.reviewCount).toBeLessThanOrEqual(DAILY_REVIEW_CAP + DAILY_MISTAKE_CAP);
    expect(plan.items.length).toBeLessThanOrEqual(DAILY_TASKS);
    expect(plan.newCount).toBeGreaterThan(plan.reviewCount);
    // Comfortably more than half the session is forward material.
    expect(plan.newCount / plan.items.length).toBeGreaterThan(0.55);
  });
});

/* ------------------------------------------------------------------ */
/* CASE E — a completed lesson is review, never "today's lesson"       */
/* ------------------------------------------------------------------ */

describe('CASE E: Bài 6 complete', () => {
  it('never returns as the new lesson', () => {
    let s = initialState(T0);
    for (const n of [1, 2, 3, 4, 5, 6]) s = completeLesson(s, n, T0);
    expect(lessonReadyToAdvance(s, byNumber(6))).toBe(true);
    expect(nextLesson(s)!.number).toBe(7);
    for (const day of [0, 1, 2, 7]) {
      const plan = buildSession(s, 'today', T0 + day * DAY_MS) as DailyPlan;
      expect(plan.course.next!.number, `day ${day}`).toBe(7);
    }
  });

  it('remains available as review material', () => {
    let s = initialState(T0);
    for (const n of [1, 2, 3, 4, 5, 6]) s = completeLesson(s, n, T0);
    expect(studiedLessonNumbers(s)).toContain(6);
    expect(studiedLessonNumbers(s)).toContain(7); // the lesson in progress
    expect(studiedLessonNumbers(s)).not.toContain(9); // not yet reached
  });
});

/* ------------------------------------------------------------------ */
/* CASE F — variety                                                    */
/* ------------------------------------------------------------------ */

describe('CASE F: variety and cooldown', () => {
  it('does not repeat a target answered moments ago', () => {
    const l = byNumber(3);
    const t = lessonTargets(l)[0];
    let s = reducer(initialState(T0), { type: 'visit-lesson', lesson: l.id, now: T0 });
    for (const n of [1, 2]) s = completeLesson(s, n, T0);
    // Just answered — inside the cooldown window.
    s = demonstrate(s, t.kind, t.ref, l.id, 1, 2, T0);
    const refs = refsOf(buildSession(s, 'today', T0 + 60 * 60 * 1000).items);
    expect(refs).not.toContain(`${t.kind}:${t.ref}`);
  });

  it('produces a varied session rather than one skill repeated', () => {
    let s = initialState(T0);
    for (const n of [1, 2]) s = completeLesson(s, n, T0);
    const plan = buildSession(s, 'today', T0 + 2 * DAY_MS);
    const kinds = new Set(plan.items.filter((i) => i.kind === 'task').map((i) => (i as { task: { srsKind: string } }).task.srsKind));
    expect(kinds.size).toBeGreaterThanOrEqual(2);
    expect(new Set(refsOf(plan.items)).size).toBe(plan.items.length);
  });
});

/* ------------------------------------------------------------------ */
/* Existing progress is respected, never reset                         */
/* ------------------------------------------------------------------ */

describe('existing progress', () => {
  it('honours a lesson marked complete the old way, with no SRS evidence', () => {
    let s = initialState(T0);
    for (const n of [1, 2, 3]) s = reducer(s, { type: 'complete-lesson', lesson: byNumber(n).id, completed: true, now: T0 });
    expect(nextLesson(s)!.number).toBe(4);
  });

  it('does not send a learner back to old lessons because SRS is full', () => {
    // A state stuffed with review records but no completions: progression
    // starts at Bài 1 and is not thrown forward by the pile of SRS items.
    let s = initialState(T0);
    for (const l of lessons) for (const t of lessonTargets(l).slice(0, 2)) s = demonstrate(s, t.kind, t.ref, l.id, 1, 1);
    expect(nextLesson(s)!.number).toBe(1);
    expect(studiedLessonNumbers(s)).toEqual([1]);
  });

  it('does not send the course backwards when an old review is failed', () => {
    // The regression this guards: failing one Bài 3 item months later used to
    // un-master the target, drop the lesson below the completion bar and make
    // Bài 3 "today's new lesson" all over again.
    let s = initialState(T0);
    for (const n of [1, 2, 3, 4]) s = completeLesson(s, n, T0);
    expect(nextLesson(s)!.number).toBe(5);

    // Failing several Bài 3 targets later changes nothing about progression:
    // `successes` never decreases, so the frontier cannot walk backwards.
    const l3 = byNumber(3);
    for (const t of lessonTargets(l3).slice(0, 8)) s = demonstrate(s, t.kind, t.ref, l3.id, 1, 0, T0 + 40 * DAY_MS);
    expect(lessonReadyToAdvance(s, l3)).toBe(true);
    expect(nextLesson(s)!.number).toBe(5);
    const plan = buildSession(s, 'today', T0 + 41 * DAY_MS) as DailyPlan;
    expect(plan.course.next!.number).toBe(5);
  });

  it('keeps a checkpoint pass as a permanent fact', () => {
    let s = initialState(T0);
    const l = byNumber(1);
    s = reducer(s, { type: 'checkpoint', lesson: l.id, score: 9, total: 10, now: T0 });
    expect(lessonStatus(s, l).checkpointPassed).toBe(true);
    expect(lessonStatus(s, l).complete).toBe(true);
    // Un-marking by hand does not erase the checkpoint history.
    s = reducer(s, { type: 'complete-lesson', lesson: l.id, completed: false, now: T0 });
    expect(lessonStatus(s, l).complete).toBe(true);
  });

  it('never mutates the state it is given', () => {
    const s = completeLesson(initialState(T0), 1);
    const before = JSON.stringify(s);
    buildSession(s, 'today', T0 + DAY_MS);
    nextLesson(s);
    completedLessons(s);
    expect(JSON.stringify(s)).toBe(before);
  });
});

/* ------------------------------------------------------------------ */
/* The course frontier: continuous, and blind to the calendar          */
/* ------------------------------------------------------------------ */

/** Lesson numbers the new-material half of a session drew on. */
const frontierNumbersIn = (plan: { items: SessionItem[] }) =>
  new Set(
    plan.items
      .map((i) => (i.kind === 'task' ? i.task.lesson : i.lesson))
      .map((id) => lessons.find((l) => l.id === id)?.number)
      .filter((n): n is number => n !== undefined),
  );

describe('the mixed session', () => {
  it('contains both frontier material and older review', () => {
    let s = initialState(T0);
    for (const n of [1, 2, 3, 4]) s = completeLesson(s, n, T0);
    const plan = buildSession(s, 'today', T0 + DAY_MS) as DailyPlan;
    expect(plan.newCount).toBeGreaterThan(0);
    expect(plan.reviewCount).toBeGreaterThan(0);
    // Not "all Bài 5": older lessons are represented too.
    const numbers = frontierNumbersIn(plan);
    expect(numbers.has(5)).toBe(true);
    expect([...numbers].some((n) => n < 5)).toBe(true);
  });

  it('mixes several kinds of task rather than one drill', () => {
    let s = initialState(T0);
    for (const n of [1, 2, 3, 4]) s = completeLesson(s, n, T0);
    const plan = buildSession(s, 'today', T0 + DAY_MS);
    const phases = new Set(plan.items.filter((i) => i.kind === 'task').map((i) => (i as { task: { phase: string } }).task.phase));
    expect(phases.size).toBeGreaterThanOrEqual(2);
  });
});

describe('the frontier advances continuously, never by the clock', () => {
  it('moves the instant the current lesson is demonstrated — same day, same minute', () => {
    let s = initialState(T0);
    for (const n of [1, 2, 3, 4]) s = completeLesson(s, n, T0);
    expect(frontierLessons(s)[0].number).toBe(5);
    expect(frontierNumbersIn(buildSession(s, 'today', T0)).has(5)).toBe(true);

    // Learn Bài 5 at 09:30, no date change at all.
    s = completeLesson(s, 5, T0);
    expect(frontierLessons(s)[0].number).toBe(6);
    const second = buildSession(s, 'today', T0 + 30 * 60 * 1000) as DailyPlan;
    expect(second.course.next!.number).toBe(6);
    expect(frontierNumbersIn(second).has(6)).toBe(true);

    // And again, still the same day.
    s = completeLesson(s, 6, T0);
    const third = buildSession(s, 'today', T0 + 60 * 60 * 1000) as DailyPlan;
    expect(third.course.next!.number).toBe(7);
    expect(frontierNumbersIn(third).has(7)).toBe(true);
  });

  it('reaches Bài 8 after three lessons in one day', () => {
    let s = initialState(T0);
    for (const n of [1, 2, 3, 4]) s = completeLesson(s, n, T0);
    for (const n of [5, 6, 7]) s = completeLesson(s, n, T0);
    expect(frontierLessons(s)[0].number).toBe(8);
  });

  it('is not advanced by midnight on its own', () => {
    let s = initialState(T0);
    for (const n of [1, 2, 3, 4]) s = completeLesson(s, n, T0);
    const before = frontierLessons(s)[0].number;
    // Several days pass with no study at all.
    for (const day of [1, 2, 5, 30]) {
      expect(frontierLessons(s)[0].number, `after ${day} days`).toBe(before);
      expect((buildSession(s, 'today', T0 + day * DAY_MS) as DailyPlan).course.next!.number).toBe(before);
    }
  });

  it('keeps the frontier the learner actually reached across a new day', () => {
    let s = initialState(T0);
    for (const n of [1, 2, 3, 4, 5, 6]) s = completeLesson(s, n, T0);
    expect(frontierLessons(s)[0].number).toBe(7);
    // Tomorrow: still 7, neither advanced nor rolled back.
    expect((buildSession(s, 'today', T0 + DAY_MS) as DailyPlan).course.next!.number).toBe(7);
  });

  it('does not move when a later lesson is merely opened', () => {
    let s = initialState(T0);
    for (const n of [1, 2, 3, 4]) s = completeLesson(s, n, T0);
    s = reducer(s, { type: 'visit-lesson', lesson: byNumber(11).id, now: T0 });
    expect(frontierLessons(s)[0].number).toBe(5);
    expect((buildSession(s, 'today', T0) as DailyPlan).course.next!.number).toBe(5);
  });

  it('never reaches past the next lesson while the current one still has material', () => {
    let s = initialState(T0);
    for (const n of [1, 2, 3, 4]) s = completeLesson(s, n, T0);
    // Frontier is Bài 5 and it is untouched, so nothing from Bài 7+ may appear.
    const numbers = [...frontierNumbersIn(buildSession(s, 'today', T0))];
    expect(Math.max(...numbers)).toBeLessThanOrEqual(6);
  });

  it('spills into the next lesson once the current one runs out mid-session', () => {
    // Bài 5 all but finished: its last targets plus Bài 6 should both appear.
    let s = initialState(T0);
    for (const n of [1, 2, 3, 4]) s = completeLesson(s, n, T0);
    const l5 = lessonTargets(byNumber(5));
    for (const t of l5.slice(0, l5.length - 1)) s = demonstrate(s, t.kind, t.ref, byNumber(5).id, MASTERY_SUCCESSES, 2, T0);
    const numbers = frontierNumbersIn(buildSession(s, 'today', T0 + 4 * DAY_MS));
    expect(numbers.has(6), 'session never reached into Bài 6').toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Formal completion is not the same claim as "ready to move on"       */
/* ------------------------------------------------------------------ */

describe('"ukończone lekcje" counts only real completion evidence', () => {
  it('does NOT count a lesson whose targets are merely mastered', () => {
    // Exactly the Bài 2 case: a small lesson (12 targets, 10 needed for the
    // 80 % bar) drilled through ordinary review sessions.
    let s = initialState(T0);
    s = completeLesson(s, 2, T0);
    const st = lessonStatus(s, byNumber(2));
    expect(st.demonstrated).toBe(true);
    expect(st.complete, 'mastery alone must not read as "ukończona"').toBe(false);
    expect(completedLessons(s)).toEqual([]);
  });

  it('counts a lesson the learner explicitly finished', () => {
    let s = initialState(T0);
    s = reducer(s, { type: 'complete-lesson', lesson: byNumber(1).id, completed: true, now: T0 });
    expect(lessonStatus(s, byNumber(1)).complete).toBe(true);
    expect(completedLessons(s).map((l) => l.number)).toEqual([1]);
  });

  it('counts a lesson whose checkpoint was passed', () => {
    let s = initialState(T0);
    s = reducer(s, { type: 'checkpoint', lesson: byNumber(1).id, score: 9, total: 10, now: T0 });
    expect(lessonStatus(s, byNumber(1)).checkpointPassed).toBe(true);
    expect(completedLessons(s).map((l) => l.number)).toEqual([1]);
  });

  it('does not count a failed checkpoint', () => {
    let s = initialState(T0);
    s = reducer(s, { type: 'checkpoint', lesson: byNumber(1).id, score: 4, total: 10, now: T0 });
    expect(completedLessons(s)).toEqual([]);
  });

  it('reproduces the reported state: Bài 1 finished, Bài 2 only practised → 1/12', () => {
    let s = initialState(T0);
    s = reducer(s, { type: 'complete-lesson', lesson: byNumber(1).id, completed: true, now: T0 });
    s = completeLesson(s, 2, T0); // drilled, never formally closed
    expect(completedLessons(s).map((l) => l.number)).toEqual([1]);
    expect(completedLessonNumbers(s).size).toBe(1);
  });

  it('keeps supplying new material from the frontier despite the stricter count', () => {
    // Bài 1 formally done, Bài 2 practised through: the course must move on to
    // Bài 3 rather than re-teaching Bài 2 just because it is not "ukończona".
    let s = initialState(T0);
    s = reducer(s, { type: 'complete-lesson', lesson: byNumber(1).id, completed: true, now: T0 });
    s = completeLesson(s, 2, T0);
    expect(completedLessons(s).map((l) => l.number)).toEqual([1]);
    expect(nextLesson(s)!.number).toBe(3);
    const plan = buildSession(s, 'today', T0 + DAY_MS) as DailyPlan;
    expect(plan.course.next!.number).toBe(3);
    expect(frontierNumbersIn(plan).has(3)).toBe(true);
  });

  it('still advances through several lessons in one day', () => {
    let s = initialState(T0);
    for (const n of [1, 2, 3, 4]) s = completeLesson(s, n, T0);
    expect(nextLesson(s)!.number).toBe(5);
    for (const n of [5, 6, 7]) s = completeLesson(s, n, T0);
    expect(nextLesson(s)!.number).toBe(8);
    // …while the visible count stays honest: none of them were formally closed.
    expect(completedLessons(s)).toEqual([]);
  });

  it('leaves an older explicitly completed lesson completed', () => {
    let s = initialState(T0);
    for (const n of [1, 2, 3]) s = reducer(s, { type: 'complete-lesson', lesson: byNumber(n).id, completed: true, now: T0 });
    expect(completedLessons(s).map((l) => l.number)).toEqual([1, 2, 3]);
    // A later failed review does not take it away.
    const t = lessonTargets(byNumber(2))[0];
    s = demonstrate(s, t.kind, t.ref, byNumber(2).id, 1, 0, T0 + 10 * DAY_MS);
    expect(completedLessons(s).map((l) => l.number)).toEqual([1, 2, 3]);
  });

  it('resets nothing while evaluating', () => {
    let s = initialState(T0);
    s = completeLesson(s, 2, T0);
    const before = JSON.stringify(s);
    completedLessons(s);
    nextLesson(s);
    buildSession(s, 'today', T0 + DAY_MS);
    expect(JSON.stringify(s)).toBe(before);
  });
});
