import { describe, expect, it } from 'vitest';
import { DAY_MS } from '../src/utilities/dates';
import { isDue, isWeak, mastery, masteryLevel, newSrsItem, schedule, sortForReview } from '../src/learning/srs';

const T0 = Date.UTC(2026, 8, 6, 10, 0, 0);

describe('SRS scheduling', () => {
  it('grows intervals 1 → 3 → ease-based on "good"', () => {
    let it = newSrsItem('vocab-active', 'v-bai-01-xin-chao', 'bai-01', T0);
    expect(isDue(it, T0)).toBe(true);
    it = schedule(it, 2, T0);
    expect(it.interval).toBe(1);
    expect(it.due).toBe(T0 + DAY_MS);
    expect(isDue(it, T0)).toBe(false);
    expect(isDue(it, T0 + DAY_MS)).toBe(true);
    it = schedule(it, 2, T0 + DAY_MS);
    expect(it.interval).toBe(3);
    it = schedule(it, 2, T0 + 4 * DAY_MS);
    expect(it.interval).toBe(Math.round(3 * 2.5));
    expect(it.successes).toBe(3);
  });
  it('resets on failure and comes back within the session', () => {
    let it = newSrsItem('vocab-passive', 'v', 'bai-01', T0);
    it = schedule(it, 2, T0);
    it = schedule(it, 2, T0 + DAY_MS);
    it = schedule(it, 0, T0 + 4 * DAY_MS);
    expect(it.interval).toBe(0);
    expect(it.failures).toBe(1);
    expect(it.lapses).toBe(1);
    expect(it.due - (T0 + 4 * DAY_MS)).toBe(10 * 60 * 1000);
    expect(it.ease).toBeCloseTo(2.3);
  });
  it('hard shortens growth and easy accelerates it', () => {
    const base = schedule(newSrsItem('grammar', 'g', 'bai-02', T0), 2, T0);
    const hard = schedule(base, 1, T0 + DAY_MS);
    const easy = schedule(base, 3, T0 + DAY_MS);
    expect(hard.interval).toBeLessThan(easy.interval);
    expect(easy.ease).toBeGreaterThan(hard.ease);
  });
  it('mastery rises with interval and level names follow thresholds', () => {
    let it = newSrsItem('vocab-active', 'v', 'bai-01', T0);
    expect(mastery(it)).toBe(0);
    expect(masteryLevel(it)).toBe('new');
    it = schedule(it, 2, T0);
    expect(masteryLevel(it)).toBe('learning');
    const m1 = mastery(it);
    it = schedule(it, 2, T0 + DAY_MS);
    it = schedule(it, 2, T0 + 4 * DAY_MS);
    expect(masteryLevel(it)).toBe('young');
    expect(mastery(it)).toBeGreaterThan(m1);
    it = schedule(it, 3, T0 + 12 * DAY_MS);
    expect(masteryLevel(it)).toBe('mature');
  });
  it('detects weak items', () => {
    let it = newSrsItem('vocab-active', 'v', 'bai-01', T0);
    it = schedule(it, 0, T0);
    expect(isWeak(it)).toBe(true);
    let ok = newSrsItem('vocab-active', 'w', 'bai-01', T0);
    for (let i = 0; i < 4; i++) ok = schedule(ok, 2, T0 + i * 30 * DAY_MS);
    expect(isWeak(ok)).toBe(false);
  });
  it('sorts weak and overdue items first', () => {
    const a = schedule(newSrsItem('vocab-active', 'a', 'bai-01', T0), 2, T0); // due T0+1d
    const b = schedule(newSrsItem('vocab-active', 'b', 'bai-01', T0), 0, T0); // weak, due T0+10min
    const sorted = sortForReview([a, b], T0 + 2 * DAY_MS);
    expect(sorted[0].ref).toBe('b');
  });
});
