import { describe, expect, it } from 'vitest';
import { initialState, loadState, reducer, saveState, type Action, type AppState, type Mistake, type StorageLike } from '../src/learning/state';
import { isPracticeable, mistakeSource, mistakeTask, openMistakes, orphanedMistakes, resolvedMistakes } from '../src/learning/mistakes';
import { buildSession, dashboardCounts } from '../src/learning/session';
import { actionsForTask } from '../src/learning/record';
import { grammarTask, dialogueTask, scenarioTask } from '../src/learning/tasks';
import { allDialogues, allGrammar, scenarios } from '../src/data/content';
import type { GradeResult } from '../src/learning/grading';

const T0 = Date.UTC(2026, 8, 9, 9, 0, 0);

const WRONG: GradeResult = { outcome: 'wrong', score: 0, feedback: 'nie', expected: 'x', category: 'grammar', flagged: false, unverified: true };

function apply(state: AppState, actions: Action[], now = T0): AppState {
  return actions.reduce((s, a) => reducer(s, { ...a, now } as Action), state);
}

/** Log a failed answer the way the runner does. */
function logMistake(state: AppState, ref: string, refKind: Mistake['refKind'], lesson = 'bai-03', now = T0): AppState {
  return reducer(state, {
    type: 'mistake',
    now,
    mistake: { lesson, ref, refKind, category: 'vocabulary', prompt: `p ${ref}`, expected: 'e', given: 'g', outcome: 'wrong', flagged: false },
  });
}

/** One graded answer inside mistake practice. */
const retry = (state: AppState, ref: string, success: boolean, now = T0) => reducer(state, { type: 'mistake-retry', ref, success, now });

/** The three views the learner sees, which must never disagree. */
function views(state: AppState) {
  return {
    badge: dashboardCounts(state).mistakes,
    page: openMistakes(state).length,
    session: buildSession(state, 'mistakes').items.length,
  };
}

/* ------------------------------------------------------------------ */
/* The reported contradiction                                          */
/* ------------------------------------------------------------------ */

describe('the count and the practice session always agree', () => {
  it('CASE A: 2 open → both practiceable → solve one → 1 open and it still appears', () => {
    let s = initialState(T0);
    s = logMistake(s, 'v-bai-03-nam', 'vocab');
    s = logMistake(s, 'v-bai-03-tuoi', 'vocab');
    expect(views(s)).toEqual({ badge: 2, page: 2, session: 2 });

    // Correct it twice — the rule is two consecutive successes.
    s = retry(s, 'v-bai-03-nam', true);
    expect(views(s)).toEqual({ badge: 2, page: 2, session: 2 }); // one success is not enough
    s = retry(s, 'v-bai-03-nam', true);
    expect(views(s)).toEqual({ badge: 1, page: 1, session: 1 });

    // CASE A, second half: failing the remaining one keeps it open.
    s = retry(s, 'v-bai-03-tuoi', false);
    expect(views(s)).toEqual({ badge: 1, page: 1, session: 1 });
    expect(buildSession(s, 'mistakes').items.length).toBeGreaterThan(0);
  });

  it('CASE B: the last mistake is offered until it is actually corrected', () => {
    let s = initialState(T0);
    s = logMistake(s, 'v-bai-03-tuoi', 'vocab');
    expect(views(s)).toEqual({ badge: 1, page: 1, session: 1 });
    s = retry(s, 'v-bai-03-tuoi', true);
    s = retry(s, 'v-bai-03-tuoi', true);
    expect(views(s)).toEqual({ badge: 0, page: 0, session: 0 });
    expect(resolvedMistakes(s)).toHaveLength(1);
  });

  it('CASE C: nothing open means nothing to practise', () => {
    const s = initialState(T0);
    expect(views(s)).toEqual({ badge: 0, page: 0, session: 0 });
  });

  it('one visible open mistake never yields an empty session', () => {
    // The exact failure that was reported: the page said 1–2 open, the
    // session said "Nie masz otwartych błędów".
    const refs = [
      { ref: allGrammar[0].id, kind: 'exercise' as const },
      { ref: `${allDialogues[0].id}#1`, kind: 'exercise' as const },
      { ref: scenarios[0].id, kind: 'exercise' as const },
      { ref: 'v-bai-03-nam', kind: 'vocab' as const },
    ];
    for (const { ref, kind } of refs) {
      const s = logMistake(initialState(T0), ref, kind);
      const v = views(s);
      expect(v.page, `${ref} counted`).toBe(1);
      expect(v.session, `${ref} practiceable`).toBe(1);
    }
  });
});

/* ------------------------------------------------------------------ */
/* The root cause                                                      */
/* ------------------------------------------------------------------ */

describe('mistakes logged by the review runner are rebuildable', () => {
  it('resolves grammar, dialogue and scenario refs that recordTask stores as "exercise"', () => {
    const cases = [
      { task: grammarTask(allGrammar.find((g) => g.id === 'g-bai-06-family-talk')!, 3)!, kind: 'grammar' },
      { task: dialogueTask(allDialogues[0], 1, 2)!, kind: 'dialogue' },
      { task: scenarioTask(scenarios[0], 2), kind: 'scenario' },
    ];
    for (const { task, kind } of cases) {
      const actions = actionsForTask({ kind: 'task', task }, WRONG, 'zła odpowiedź');
      const s = apply(initialState(T0), actions);
      const logged = s.mistakes[0];
      expect(logged, `${kind}: nothing logged`).toBeDefined();
      // recordTask labels every non-vocabulary ability "exercise"…
      expect(logged.refKind).toBe('exercise');
      // …and the ref is not an exercise id at all, which is what used to
      // make it uncountable-but-unpractisable.
      expect(mistakeSource(logged)?.kind, `${kind} resolved wrongly`).toBe(kind);
      expect(mistakeTask(logged, s), `${kind} not rebuildable`).not.toBeNull();
      expect(views(s)).toEqual({ badge: 1, page: 1, session: 1 });
    }
  });
});

/* ------------------------------------------------------------------ */
/* Resolution rule                                                     */
/* ------------------------------------------------------------------ */

describe('a mistake resolves only on real success', () => {
  it('is not resolved by opening the page, listing it or building the session', () => {
    let s = logMistake(initialState(T0), 'v-bai-03-nam', 'vocab');
    const before = JSON.stringify(s);
    openMistakes(s);
    orphanedMistakes(s);
    dashboardCounts(s);
    buildSession(s, 'mistakes');
    buildSession(s, 'today');
    expect(JSON.stringify(s)).toBe(before);
    expect(s.mistakes[0].resolved).toBe(false);

    // Even displaying and re-displaying it many times changes nothing.
    for (let i = 0; i < 5; i++) s = { ...s, mistakes: openMistakes(s) };
    expect(s.mistakes[0].resolved).toBe(false);
  });

  it('needs two consecutive successes, and a failure restarts the count', () => {
    let s = logMistake(initialState(T0), 'v-bai-03-nam', 'vocab');
    s = retry(s, 'v-bai-03-nam', true);
    expect(s.mistakes[0].retries).toBe(1);
    s = retry(s, 'v-bai-03-nam', false);
    expect(s.mistakes[0].retries).toBe(0);
    expect(s.mistakes[0].resolved).toBe(false);
    s = retry(s, 'v-bai-03-nam', true);
    s = retry(s, 'v-bai-03-nam', true);
    expect(s.mistakes[0].resolved).toBe(true);
    expect(s.mistakes[0].resolvedTs).toBeDefined();
  });

  it('reopens nothing that was already resolved when the same item fails again', () => {
    let s = logMistake(initialState(T0), 'v-bai-03-nam', 'vocab');
    s = retry(s, 'v-bai-03-nam', true);
    s = retry(s, 'v-bai-03-nam', true);
    expect(openMistakes(s)).toHaveLength(0);
    // Failing it later logs a NEW open mistake rather than mutating history.
    s = logMistake(s, 'v-bai-03-nam', 'vocab', 'bai-03', T0 + 1000);
    expect(openMistakes(s)).toHaveLength(1);
    expect(resolvedMistakes(s)).toHaveLength(1);
    expect(views(s).session).toBe(1);
  });
});

/* ------------------------------------------------------------------ */
/* Orphans                                                             */
/* ------------------------------------------------------------------ */

describe('stale mistakes from older content', () => {
  it('are kept in history but never counted as practiceable', () => {
    let s = logMistake(initialState(T0), 'v-bai-99-does-not-exist', 'vocab');
    s = logMistake(s, 'e-bai-99-removed-exercise', 'exercise', 'bai-99', T0 + 1);
    s = logMistake(s, 'v-bai-03-nam', 'vocab', 'bai-03', T0 + 2);
    expect(s.mistakes).toHaveLength(3); // nothing deleted
    expect(orphanedMistakes(s)).toHaveLength(2);
    expect(views(s)).toEqual({ badge: 1, page: 1, session: 1 });
    for (const m of orphanedMistakes(s)) expect(isPracticeable(m, s)).toBe(false);
  });

  it('treats a generated drill with no recorded generator as stale', () => {
    // Older records predate `generatorKind`; the instance id alone is opaque.
    const s = reducer(initialState(T0), {
      type: 'mistake',
      now: T0,
      mistake: { lesson: 'bai-03', ref: 'gen:number:42', refKind: 'generated', category: 'numbers', prompt: 'p', expected: 'e', given: 'g', outcome: 'wrong', flagged: false },
    });
    expect(orphanedMistakes(s)).toHaveLength(1);
    expect(views(s)).toEqual({ badge: 0, page: 0, session: 0 });
  });

  it('practises a generated drill that does record its generator', () => {
    const s = reducer(initialState(T0), {
      type: 'mistake',
      now: T0,
      mistake: { lesson: 'bai-03', ref: 'gen:number:42', refKind: 'generated', generatorKind: 'number', category: 'numbers', prompt: 'p', expected: 'e', given: 'g', outcome: 'wrong', flagged: false },
    });
    expect(views(s)).toEqual({ badge: 1, page: 1, session: 1 });
  });
});

/* ------------------------------------------------------------------ */
/* Agreement and persistence                                           */
/* ------------------------------------------------------------------ */

describe('every surface uses the same definition', () => {
  it('badge, list and session agree over a mixed pile of mistakes', () => {
    let s = initialState(T0);
    const refs: [string, Mistake['refKind']][] = [
      ['v-bai-03-nam', 'vocab'],
      ['v-bai-05-pho', 'vocab'],
      [allGrammar[1].id, 'exercise'],
      [scenarios[2].id, 'exercise'],
      [`${allDialogues[0].id}#2`, 'exercise'],
      ['v-bai-99-gone', 'vocab'],
      ['e-bai-99-gone', 'exercise'],
    ];
    refs.forEach(([ref, kind], i) => {
      s = logMistake(s, ref, kind, 'bai-03', T0 + i);
    });
    const v = views(s);
    expect(v.badge).toBe(v.page);
    expect(v.session).toBe(v.page);
    expect(v.page).toBe(5); // the two stale refs are excluded
    expect(orphanedMistakes(s)).toHaveLength(2);
    expect(openMistakes(s).length + orphanedMistakes(s).length + resolvedMistakes(s).length).toBe(s.mistakes.length);
  });

  it('every open mistake really produces a task in the session', () => {
    let s = initialState(T0);
    for (const g of allGrammar.slice(0, 6)) s = logMistake(s, g.id, 'exercise', g.lessonId);
    const built = buildSession(s, 'mistakes').items;
    expect(built).toHaveLength(openMistakes(s).length);
    for (const item of built) expect(item.mistakeRef).toBeDefined();
  });

  it('survives a save/load round trip through localStorage', () => {
    const store: Record<string, string> = {};
    const storage: StorageLike = {
      getItem: (k) => store[k] ?? null,
      setItem: (k, v) => {
        store[k] = v;
      },
      removeItem: (k) => {
        delete store[k];
      },
    };
    let s = logMistake(initialState(T0), 'v-bai-03-nam', 'vocab');
    s = logMistake(s, allGrammar[0].id, 'exercise', allGrammar[0].lessonId, T0 + 1);
    s = retry(s, 'v-bai-03-nam', true);
    saveState(storage, s);

    const reloaded = loadState(storage);
    expect(views(reloaded)).toEqual(views(s));
    expect(views(reloaded)).toEqual({ badge: 2, page: 2, session: 2 });
    expect(reloaded.mistakes.find((m) => m.ref === 'v-bai-03-nam')!.retries).toBe(1);

    // And finishing the correction after the reload still resolves it.
    const done = retry(reloaded, 'v-bai-03-nam', true);
    expect(views(done)).toEqual({ badge: 1, page: 1, session: 1 });
  });
});
