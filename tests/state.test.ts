import { describe, expect, it } from 'vitest';
import { exportState, initialState, loadState, migrate, parseImport, reducer, saveState, STORAGE_KEY, unresolvedMistakes, type StorageLike } from '../src/learning/state';

function memoryStorage(): StorageLike & { data: Record<string, string> } {
  const data: Record<string, string> = {};
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = v;
    },
    removeItem: (k) => {
      delete data[k];
    },
  };
}

describe('localStorage state', () => {
  it('starts clean when nothing is stored', () => {
    const s = loadState(memoryStorage());
    expect(Object.keys(s.srs)).toHaveLength(0);
    expect(s.mistakes).toEqual([]);
  });
  it('round-trips through storage', () => {
    const storage = memoryStorage();
    let s = initialState(1000);
    s = reducer(s, { type: 'review', kind: 'vocab-vi-pl', ref: 'v-bai-01-xin-chao', lesson: 'bai-01', grade: 2, now: 1000 });
    s = reducer(s, { type: 'complete-lesson', lesson: 'bai-01', completed: true, now: 2000 });
    saveState(storage, s);
    expect(storage.data[STORAGE_KEY]).toBeTruthy();
    const loaded = loadState(storage);
    expect(loaded.srs['vocab-vi-pl:v-bai-01-xin-chao'].successes).toBe(1);
    expect(loaded.lessons['bai-01'].completed).toBe(2000);
  });
  it('ignores corrupted storage', () => {
    const storage = memoryStorage();
    storage.setItem(STORAGE_KEY, '{not json');
    expect(loadState(storage).version).toBe(1);
  });
  it('logs, merges and resolves mistakes', () => {
    let s = initialState(0);
    const m = { lesson: 'bai-01', ref: 'e-bai-01-x', refKind: 'exercise' as const, category: 'tone' as const, prompt: 'p', expected: 'Cảm ơn', given: 'Cam on', outcome: 'tone' as const, flagged: false };
    s = reducer(s, { type: 'mistake', mistake: m, now: 10 });
    s = reducer(s, { type: 'mistake', mistake: { ...m, given: 'x' }, now: 20 });
    expect(s.mistakes).toHaveLength(1);
    expect(s.mistakes[0].given).toBe('x');
    s = reducer(s, { type: 'mistake-retry', ref: 'e-bai-01-x', success: true, now: 30 });
    expect(unresolvedMistakes(s)).toHaveLength(1);
    s = reducer(s, { type: 'mistake-retry', ref: 'e-bai-01-x', success: true, now: 40 });
    expect(unresolvedMistakes(s)).toHaveLength(0);
    expect(s.mistakes[0].resolved).toBe(true);
  });
  it('checkpoint at 80 % completes the lesson', () => {
    let s = initialState(0);
    s = reducer(s, { type: 'checkpoint', lesson: 'bai-02', score: 3, total: 5, now: 5 });
    expect(s.lessons['bai-02'].completed).toBeUndefined();
    s = reducer(s, { type: 'checkpoint', lesson: 'bai-02', score: 4, total: 5, now: 6 });
    expect(s.lessons['bai-02'].completed).toBe(6);
  });
  it('exports and imports JSON', () => {
    let s = initialState(0);
    s = reducer(s, { type: 'settings', settings: { dailyNewLimit: 3 } });
    const text = exportState(s);
    const back = parseImport(text);
    expect(back.settings.dailyNewLimit).toBe(3);
    expect(() => parseImport('{"foo":1}')).toThrow();
    expect(() => migrate({ version: 99 })).toThrow();
  });
  it('reset returns to a clean state', () => {
    let s = initialState(0);
    s = reducer(s, { type: 'visit-lesson', lesson: 'bai-03', now: 1 });
    s = reducer(s, { type: 'reset' });
    expect(Object.keys(s.lessons)).toHaveLength(0);
  });
});
