import { describe, expect, it } from 'vitest';
import { lessons } from '../src/data/content';
import { initialState, reducer, type AppState, type Mistake } from '../src/learning/state';
import { buildSession, buildLessonSession, dashboardCounts, type DailyPlan, type SessionItem } from '../src/learning/session';
import { lessonStatus, lessonTargets, nextLesson } from '../src/learning/progression';
import { deferredMistakes, openMistakes } from '../src/learning/mistakes';
import { eligibleLessonNumbers, frontierNumber, isDeferredLesson } from '../src/learning/eligibility';
import { MASTERY_SUCCESSES } from '../src/learning/targets';
import { makeSrsId } from '../src/learning/srs';
import { DAY_MS } from '../src/utilities/dates';
import { byNumber, demonstrate, masterLesson } from './helpers/course';

const T0 = Date.UTC(2026, 8, 18, 9, 0, 0);

const lessonNumbersIn = (items: SessionItem[]) =>
  new Set(
    items
      .map((i) => (i.kind === 'task' ? i.task.lesson : i.lesson))
      .map((id) => lessons.find((l) => l.id === id)?.number)
      .filter((n): n is number => n !== undefined),
  );

/**
 * The reported situation: Bài 1 fully learned, Bài 2 part-way, and stray Bài 3
 * records left behind by the version that reached ahead too eagerly.
 */
function reportedState(bai2Share = 0.65): AppState {
  let s = masterLesson(initialState(T0), 1, T0 - 30 * DAY_MS);
  const l2 = byNumber(2);
  const t2 = lessonTargets(l2);
  s = reducer(s, { type: 'visit-lesson', lesson: l2.id, now: T0 - 10 * DAY_MS });
  for (const t of t2.slice(0, Math.floor(t2.length * bai2Share))) {
    s = demonstrate(s, t.kind, t.ref, l2.id, MASTERY_SUCCESSES, 2, T0 - 10 * DAY_MS);
  }
  // Accidental Bài 3 exposure: some SRS evidence and a logged mistake.
  const l3 = byNumber(3);
  for (const t of lessonTargets(l3).slice(0, 4)) s = demonstrate(s, t.kind, t.ref, l3.id, MASTERY_SUCCESSES, 2, T0 - 5 * DAY_MS);
  const stray: Omit<Mistake, 'id' | 'ts' | 'retries' | 'resolved'> = {
    lesson: l3.id,
    ref: lessonTargets(l3)[5].ref,
    refKind: 'vocab',
    category: 'vocabulary',
    prompt: 'stray',
    expected: 'e',
    given: 'g',
    outcome: 'wrong',
    flagged: false,
  };
  return reducer(s, { type: 'mistake', mistake: stray, now: T0 - 5 * DAY_MS });
}

describe('the course never reaches past the lesson in hand', () => {
  it('keeps Bài 2 current while it is only part-learned', () => {
    const s = reportedState();
    expect(lessonStatus(s, byNumber(2)).percent).toBeLessThan(90);
    expect(nextLesson(s)!.number).toBe(2);
    expect(frontierNumber(s)).toBe(2);
    expect(eligibleLessonNumbers(s)).toEqual([1, 2]);
  });

  it('builds a mixed session of Bài 2 plus Bài 1 review, with zero Bài 3', () => {
    const s = reportedState();
    const plan = buildSession(s, 'today', T0) as DailyPlan;
    const numbers = lessonNumbersIn(plan.items);
    expect(numbers.has(2), 'no current-lesson material').toBe(true);
    expect([...numbers].every((n) => n <= 2), `reached ${[...numbers]}`).toBe(true);
    expect(plan.items.length).toBeGreaterThan(4);
  });

  it('does not let a stray SRS record make Bài 3 eligible', () => {
    const s = reportedState();
    // The evidence is really there…
    expect(s.srs[makeSrsId(lessonTargets(byNumber(3))[0].kind, lessonTargets(byNumber(3))[0].ref)]).toBeDefined();
    // …and it still buys nothing.
    expect(isDeferredLesson(s, 3)).toBe(true);
    for (const day of [0, 1, 3, 10]) {
      const numbers = lessonNumbersIn(buildSession(s, 'today', T0 + day * DAY_MS).items);
      expect([...numbers].every((n) => n <= 2), `day ${day} reached ${[...numbers]}`).toBe(true);
    }
  });

  it('keeps a stray Bài 3 mistake out of the count and out of practice', () => {
    const s = reportedState();
    expect(s.mistakes).toHaveLength(1); // history preserved
    expect(openMistakes(s)).toHaveLength(0);
    expect(deferredMistakes(s)).toHaveLength(1);
    expect(dashboardCounts(s, T0).mistakes).toBe(0);
    expect(buildSession(s, 'mistakes').items).toHaveLength(0);
  });

  it('does not advertise progress on a lesson the course has not reached', () => {
    const s = reportedState();
    // The raw numbers exist, but the card must present Bài 3 as future.
    expect(lessonStatus(s, byNumber(3)).mastered).toBeGreaterThan(0);
    expect(isDeferredLesson(s, 3)).toBe(true);
    expect(isDeferredLesson(s, 2)).toBe(false);
  });

  it('keeps deferred material out of the review queues', () => {
    const s = reportedState();
    for (const mode of ['production', 'conversation', 'grammar', 'weak', 'listening', 'diagnostic'] as const) {
      const numbers = lessonNumbersIn(buildSession(s, mode).items);
      expect([...numbers].every((n) => n <= 2), `${mode} reached ${[...numbers]}`).toBe(true);
    }
  });
});

describe('progress and status track real mastery', () => {
  it('updates the lesson percentage as targets are demonstrated', () => {
    const l = byNumber(2);
    const targets = lessonTargets(l);
    let s = reducer(initialState(T0), { type: 'visit-lesson', lesson: l.id, now: T0 });
    expect(lessonStatus(s, l).percent).toBe(0);
    s = demonstrate(s, targets[0].kind, targets[0].ref, l.id, MASTERY_SUCCESSES, 2, T0);
    const after = lessonStatus(s, l);
    expect(after.mastered).toBe(1);
    expect(after.percent).toBeGreaterThan(0);
    expect(after.percent).toBeLessThan(100);
  });

  it('is "w trakcie" one target short and "ukończona" only at 100 %', () => {
    const l = byNumber(2);
    const targets = lessonTargets(l);
    let s = reducer(initialState(T0), { type: 'visit-lesson', lesson: l.id, now: T0 });
    for (const t of targets.slice(0, targets.length - 1)) s = demonstrate(s, t.kind, t.ref, l.id, MASTERY_SUCCESSES, 2, T0);
    expect(lessonStatus(s, l).complete, 'one target short must not be "ukończona"').toBe(false);
    const last = targets[targets.length - 1];
    s = demonstrate(s, last.kind, last.ref, l.id, MASTERY_SUCCESSES, 2, T0);
    expect(lessonStatus(s, l).percent).toBe(100);
    expect(lessonStatus(s, l).complete).toBe(true);
  });

  it('counts scenarios and dialogue turns as required targets', () => {
    const t = lessonTargets(byNumber(2));
    expect(t.some((x) => x.kind === 'sentence'), 'scenarios missing from the target model').toBe(true);
    expect(t.some((x) => x.kind === 'dialogue'), 'dialogue turns missing from the target model').toBe(true);
    expect(t.some((x) => x.kind === 'vocab-active')).toBe(true);
    expect(t.some((x) => x.kind === 'grammar')).toBe(true);
  });
});

describe('advancing, and only then', () => {
  it('does not advance at 69 % of Bài 2', () => {
    const s = reportedState(0.69);
    expect(lessonStatus(s, byNumber(2)).percent).toBeLessThan(90);
    expect(nextLesson(s)!.number).toBe(2);
    expect(lessonNumbersIn(buildSession(s, 'today', T0).items).has(3)).toBe(false);
  });

  it('advances the moment the rule is met — same day, same minute', () => {
    let s = masterLesson(initialState(T0), 1, T0 - 30 * DAY_MS);
    expect(nextLesson(s)!.number).toBe(2);
    s = masterLesson(s, 2, T0);
    expect(nextLesson(s)!.number).toBe(3);
    const later = buildSession(s, 'today', T0 + 10 * 60 * 1000) as DailyPlan;
    expect(later.course.next!.number).toBe(3);
    expect(lessonNumbersIn(later.items).has(3)).toBe(true);
  });

  it('needs full coverage, not just a high mastery share', () => {
    // 90 % of the targets mastered but several never even attempted: the
    // lesson has not been taught in full, so the course stays put.
    const l = byNumber(2);
    const targets = lessonTargets(l);
    let s = masterLesson(initialState(T0), 1, T0 - 30 * DAY_MS);
    for (const t of targets.slice(0, Math.ceil(targets.length * 0.9))) s = demonstrate(s, t.kind, t.ref, l.id, MASTERY_SUCCESSES, 2, T0);
    const st = lessonStatus(s, l);
    expect(st.covered, 'some targets were never introduced').toBe(false);
    expect(st.readyToAdvance).toBe(false);
    expect(nextLesson(s)!.number).toBe(2);
  });

  it('is not blocked forever by one stubborn target', () => {
    const l = byNumber(2);
    const targets = lessonTargets(l);
    let s = masterLesson(initialState(T0), 1, T0 - 30 * DAY_MS);
    for (const t of targets.slice(0, targets.length - 1)) s = demonstrate(s, t.kind, t.ref, l.id, MASTERY_SUCCESSES, 2, T0);
    // The last one is attempted but never lands: covered, 94 % mastered.
    const stubborn = targets[targets.length - 1];
    s = demonstrate(s, stubborn.kind, stubborn.ref, l.id, 2, 1, T0);
    const st = lessonStatus(s, l);
    expect(st.covered).toBe(true);
    expect(st.complete, 'still not "ukończona"').toBe(false);
    expect(st.readyToAdvance, 'one stubborn target must not bar the course').toBe(true);
    expect(nextLesson(s)!.number).toBe(3);
  });
});

describe('lesson practice is a generator, not a worksheet', () => {
  it('produces a different combination on each visit', () => {
    const s = masterLesson(initialState(T0), 1, T0 - 30 * DAY_MS);
    const runs = Array.from({ length: 5 }, () =>
      buildLessonSession(s, 2, 12, T0).map((i) => (i.kind === 'task' ? `${i.task.srsRef}@${i.task.exercise.type}` : i.kind === 'exercise' ? `ex:${i.exercise.id}` : `gen:${i.instance.id}`)),
    );
    for (const r of runs) expect(new Set(r).size, 'a run repeated a task').toBe(r.length);
    // Across five visits the learner meets appreciably more than one run's worth.
    const union = new Set(runs.flat());
    expect(union.size).toBeGreaterThan(runs[0].length);
    // And consecutive visits are not identical lists.
    expect(runs.some((r, i) => i > 0 && r.join('|') !== runs[i - 1].join('|'))).toBe(true);
  });

  it('spends its time on what is not yet mastered', () => {
    const l = byNumber(2);
    const targets = lessonTargets(l);
    let s = masterLesson(initialState(T0), 1, T0 - 30 * DAY_MS);
    // Master all but three targets.
    for (const t of targets.slice(0, targets.length - 3)) s = demonstrate(s, t.kind, t.ref, l.id, MASTERY_SUCCESSES, 2, T0 - 5 * DAY_MS);
    const unmastered = new Set(targets.slice(targets.length - 3).map((t) => t.ref));
    let hits = 0;
    for (let i = 0; i < 6; i++) {
      const refs = buildLessonSession(s, 2, 8, T0).map((x) => (x.kind === 'task' ? x.task.srsRef : ''));
      hits += refs.filter((r) => unmastered.has(r)).length;
    }
    expect(hits, 'unmastered targets were not prioritised').toBeGreaterThan(0);
  });

  it('never draws on a lesson the course has not reached', () => {
    const s = reportedState();
    const numbers = lessonNumbersIn(buildLessonSession(s, 2, 12, T0));
    expect([...numbers].every((n) => n <= 2)).toBe(true);
  });
});

describe('the frontier never walks backwards', () => {
  it('holds its position when reviews of an earlier lesson go badly', () => {
    let s = masterLesson(initialState(T0), 1, T0 - 30 * DAY_MS);
    s = masterLesson(s, 2, T0 - 20 * DAY_MS);
    expect(nextLesson(s)!.number).toBe(3);

    // A run of failures across Bài 1: its live percentage drops…
    for (const t of lessonTargets(byNumber(1))) s = demonstrate(s, t.kind, t.ref, byNumber(1).id, 1, 0, T0);
    expect(lessonStatus(s, byNumber(1)).percent).toBeLessThan(100);
    // …but the course stays where the learner got to.
    expect(nextLesson(s)!.number).toBe(3);
    expect(isDeferredLesson(s, 3)).toBe(false);
    expect(isDeferredLesson(s, 4)).toBe(true);
  });
});
