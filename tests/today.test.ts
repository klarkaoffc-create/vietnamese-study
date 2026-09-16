import { describe, expect, it } from 'vitest';
import { DAY_MS, daysBetween, isSameLocalDay, msUntilNextLocalMidnight, startOfDay } from '../src/utilities/dates';
import { buildSession, dashboardCounts } from '../src/learning/session';
import { initialState, reducer, type AppState } from '../src/learning/state';
import { allVocab } from '../src/data/content';
import { createDayWatcher } from '../src/utilities/dayWatcher';

/** 23:30 and 00:30 local time either side of one midnight. */
const beforeMidnight = new Date(2026, 8, 16, 23, 30, 0).getTime();
const afterMidnight = new Date(2026, 8, 17, 0, 30, 0).getTime();

describe('local calendar day', () => {
  it('uses the local date, never the UTC date', () => {
    // 23:30 local on the 16th is already the 17th in UTC for any timezone east
    // of UTC, and still the 16th for any west of it. The local day must not
    // move either way.
    expect(startOfDay(beforeMidnight)).toBe(new Date(2026, 8, 16, 0, 0, 0, 0).getTime());
    expect(new Date(startOfDay(beforeMidnight)).getDate()).toBe(16);
    expect(new Date(startOfDay(afterMidnight)).getDate()).toBe(17);
  });

  it('knows when two instants share a day', () => {
    expect(isSameLocalDay(beforeMidnight, beforeMidnight + 60_000)).toBe(true);
    expect(isSameLocalDay(beforeMidnight, afterMidnight)).toBe(false);
    expect(daysBetween(beforeMidnight, afterMidnight)).toBe(1);
  });

  it('counts down to the next local midnight, not 24h from now', () => {
    expect(msUntilNextLocalMidnight(beforeMidnight)).toBe(30 * 60 * 1000);
    expect(msUntilNextLocalMidnight(afterMidnight)).toBe(23.5 * 60 * 60 * 1000);
    // Landing exactly on midnight still schedules forward, never zero.
    const midnight = new Date(2026, 8, 17, 0, 0, 0).getTime();
    expect(msUntilNextLocalMidnight(midnight)).toBe(DAY_MS);
    expect(msUntilNextLocalMidnight(beforeMidnight)).toBeGreaterThan(0);
  });

  it('lands on midnight across a DST change rather than adding 24h', () => {
    // Europe/Warsaw springs forward on 2026-03-29; that local day is 23h long.
    const dstEve = new Date(2026, 2, 28, 12, 0, 0).getTime();
    const target = dstEve + msUntilNextLocalMidnight(dstEve);
    const d = new Date(target);
    expect([d.getHours(), d.getMinutes(), d.getSeconds()]).toEqual([0, 0, 0]);
    expect(d.getDate()).toBe(29);
  });
});

/** A learner with one ability scheduled to come due overnight. */
function stateDueTomorrow(): AppState {
  let s = initialState(beforeMidnight);
  const v = allVocab[0];
  s = reducer(s, { type: 'review', kind: 'vocab-active', ref: v.id, lesson: v.lessonId, grade: 2, now: beforeMidnight });
  // Land the due date inside the new day.
  const id = `vocab-active:${v.id}`;
  return { ...s, srs: { ...s.srs, [id]: { ...s.srs[id], due: afterMidnight + 60_000, interval: 1 } } };
}

describe('date-dependent data recalculates on the new day', () => {
  it('leaves everything alone within the same day', () => {
    const s = stateDueTomorrow();
    const a = dashboardCounts(s, beforeMidnight);
    const b = dashboardCounts(s, beforeMidnight + 5 * 60_000);
    expect(b).toEqual(a);
  });

  it('brings the item due once the day has turned', () => {
    const s = stateDueTomorrow();
    expect(dashboardCounts(s, beforeMidnight).due).toBe(0);
    expect(dashboardCounts(s, afterMidnight + 2 * 60_000).due).toBe(1);
  });

  it('feeds the new day into the session builder', () => {
    const s = stateDueTomorrow();
    // Same state, different "now": the queue is rebuilt from the later day.
    expect(() => buildSession(s, 'today', beforeMidnight)).not.toThrow();
    expect(() => buildSession(s, 'today', afterMidnight + 2 * 60_000)).not.toThrow();
  });

  it('never mutates progress while recomputing', () => {
    const s = stateDueTomorrow();
    const before = JSON.stringify(s);
    dashboardCounts(s, beforeMidnight);
    dashboardCounts(s, afterMidnight);
    buildSession(s, 'today', afterMidnight);
    expect(JSON.stringify(s)).toBe(before);
  });
});

/* ------------------------------------------------------------------ */
/* The watcher that drives the React provider                          */
/* ------------------------------------------------------------------ */

/** A fake clock plus a fake timer queue, so nothing here waits in real time. */
function harness(start: number) {
  let clock = start;
  let nextId = 1;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const changes: number[] = [];
  const watcher = createDayWatcher(
    {
      now: () => clock,
      setTimer: (fn, ms) => {
        const id = nextId++;
        timers.set(id, { at: clock + ms, fn });
        return id;
      },
      clearTimer: (id) => void timers.delete(id),
    },
    (d) => changes.push(d),
  );
  return {
    watcher,
    changes,
    pending: () => timers.size,
    /** Move the clock and run any timer whose moment has come. */
    advance(ms: number) {
      clock += ms;
      for (const [id, t] of [...timers]) {
        if (t.at <= clock) {
          timers.delete(id);
          t.fn();
        }
      }
    },
    /** Jump the clock WITHOUT running timers — a suspended laptop. */
    sleep(ms: number) {
      clock += ms;
    },
    wake: () => watcher.check(),
  };
}

describe('day watcher', () => {
  it('says nothing while the day has not changed', () => {
    const h = harness(beforeMidnight);
    h.advance(10 * 60_000); // 23:40
    h.wake();
    expect(h.changes).toEqual([]);
    expect(h.watcher.day).toBe(startOfDay(beforeMidnight));
  });

  it('fires exactly once when its midnight timer runs', () => {
    const h = harness(beforeMidnight);
    h.advance(30 * 60_000 + 1000); // just past midnight
    expect(h.changes).toEqual([startOfDay(afterMidnight)]);
    expect(h.watcher.day).toBe(startOfDay(afterMidnight));
    // And it has armed the next one rather than stopping.
    expect(h.pending()).toBe(1);
  });

  it('detects the change on wake-up when the machine slept through midnight', () => {
    const h = harness(new Date(2026, 8, 16, 22, 0, 0).getTime());
    // Lid closed at 22:00, opened at 09:00 — no timer ever fired.
    h.sleep(11 * 60 * 60 * 1000);
    expect(h.changes).toEqual([]);
    h.wake();
    expect(h.changes).toEqual([new Date(2026, 8, 17, 0, 0, 0).getTime()]);
  });

  it('reports a single change after sleeping across several days', () => {
    const h = harness(beforeMidnight);
    h.sleep(3 * DAY_MS);
    h.wake();
    expect(h.changes).toHaveLength(1);
    expect(h.changes[0]).toBe(new Date(2026, 8, 19, 0, 0, 0).getTime());
  });

  it('keeps a timer armed for the next midnight after every wake-up', () => {
    const h = harness(beforeMidnight);
    h.wake();
    h.wake();
    expect(h.pending()).toBe(1); // never leaks duplicates
    h.sleep(DAY_MS);
    h.wake();
    expect(h.pending()).toBe(1);
  });

  it('stops cleanly and goes quiet', () => {
    const h = harness(beforeMidnight);
    h.watcher.stop();
    expect(h.pending()).toBe(0);
    h.sleep(DAY_MS);
    h.wake();
    expect(h.changes).toEqual([]);
  });
});
