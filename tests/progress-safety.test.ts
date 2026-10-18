/**
 * Regression tests for the one thing that must never break: progress that is
 * already stored in a learner's browser.
 *
 * The fixture below is shaped exactly like a record written by the version of
 * the app deployed before this change (STATE_VERSION 2, no `tones` field).
 */
import { describe, expect, it } from 'vitest';
import {
  initialState,
  loadStateSafely,
  migrate,
  readSnapshot,
  RECOVERY_PREFIX,
  reducer,
  saveState,
  SNAPSHOT_DAY_KEY,
  SNAPSHOT_KEY,
  STATE_VERSION,
  STORAGE_KEY,
  type StorageLike,
} from '../src/learning/state';
import { DAY_MS } from '../src/utilities/dates';

function memoryStorage(failOn?: (key: string, value: string) => boolean): StorageLike & { data: Record<string, string> } {
  const data: Record<string, string> = {};
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      if (failOn?.(k, v)) throw new Error('QuotaExceededError');
      data[k] = v;
    },
    removeItem: (k) => {
      delete data[k];
    },
  };
}

/** A record as the previously deployed app wrote it. */
const DEPLOYED_RECORD = {
  version: 2,
  createdAt: 1757000000000,
  srs: {
    'vocab-active:v-bai-01-xin-chao': {
      id: 'vocab-active:v-bai-01-xin-chao', lesson: 'bai-01', kind: 'vocab-active', ref: 'v-bai-01-xin-chao',
      lastReview: 1758000000000, successes: 5, failures: 1, interval: 24, ease: 2.35, due: 1760000000000, lapses: 0, level: 4,
    },
    'grammar:g-bai-06-tense': {
      id: 'grammar:g-bai-06-tense', lesson: 'bai-06', kind: 'grammar', ref: 'g-bai-06-tense',
      lastReview: 1758100000000, successes: 2, failures: 3, interval: 1, ease: 1.9, due: 1758186400000, lapses: 1, level: 2,
    },
  },
  lessons: {
    'bai-01': { visited: 1757000100000, completed: 1757000200000, checkpoints: [{ ts: 1757000200000, score: 7, total: 7 }] },
    'bai-02': { visited: 1757100000000, completed: 1757100200000, checkpoints: [] },
    'bai-03': { visited: 1757200000000, checkpoints: [{ ts: 1757200100000, score: 3, total: 7 }] },
  },
  mistakes: [
    { id: 'm-1', ts: 1758000000000, lesson: 'bai-06', ref: 'g-bai-06-tense', refKind: 'exercise', category: 'tense', prompt: 'p', expected: 'Tôi đã ăn.', given: 'Tôi ăn.', outcome: 'wrong', retries: 0, resolved: false, flagged: false },
  ],
  exams: [
    { id: 'x-1', examId: 'exam-01', block: 1, ts: 1757500000000, seed: 42, percent: 84, answers: [], bySkill: { grammar: { score: 4, total: 5 } }, byLesson: { 'bai-01': { score: 5, total: 5 } } },
  ],
  sessions: [{ ts: 1758000000000, kind: 'today', items: 12, correct: 10, durationSec: 840 }],
  settings: { ttsEnabled: true, dailyNewLimit: 8, dailyReviewLimit: 30 },
};

describe('existing progress survives the update', () => {
  it('keeps the persisted version so a rollback can still read new saves', () => {
    // An older deployment throws on any version above 2 ("Nieznana wersja")
    // and would start from zero. Additive fields must never raise it.
    expect(STATE_VERSION).toBe(2);
  });

  it('loads a record from the deployed version without changing any of it', () => {
    const storage = memoryStorage();
    storage.setItem(STORAGE_KEY, JSON.stringify(DEPLOYED_RECORD));
    const { state, canSave, recoveredKey } = loadStateSafely(storage);
    expect(canSave).toBe(true);
    expect(recoveredKey).toBeUndefined();
    const { tones, ...rest } = state;
    expect(rest).toEqual(DEPLOYED_RECORD);
    expect(tones).toEqual({});
  });

  it('round-trips through save and load with every field intact', () => {
    const storage = memoryStorage();
    storage.setItem(STORAGE_KEY, JSON.stringify(DEPLOYED_RECORD));
    const loaded = loadStateSafely(storage).state;
    saveState(storage, loaded);
    const reloaded = loadStateSafely(storage).state;
    expect(reloaded).toEqual(loaded);
    expect(reloaded.srs).toEqual(DEPLOYED_RECORD.srs);
  });

  it('keeps completed lessons completed through new actions', () => {
    let s = migrate(DEPLOYED_RECORD);
    s = reducer(s, { type: 'tone-slips', slips: [{ expected: 'ở', given: 'ơ' }], sentence: 'Tôi ở Hà Nội.', lesson: 'bai-07', now: 1 });
    s = reducer(s, { type: 'tone-hits', syllables: ['ở'], now: 2 });
    s = reducer(s, { type: 'review', kind: 'grammar', ref: 'g-bai-06-tense', lesson: 'bai-06', grade: 0, now: 3 });
    // A failed checkpoint on an already completed lesson must not un-complete it.
    s = reducer(s, { type: 'checkpoint', lesson: 'bai-01', score: 1, total: 7, now: 4 });
    expect(s.lessons['bai-01'].completed).toBe(DEPLOYED_RECORD.lessons['bai-01'].completed);
    expect(s.lessons['bai-02'].completed).toBe(DEPLOYED_RECORD.lessons['bai-02'].completed);
    expect(s.lessons['bai-03'].completed).toBeUndefined();
    expect(s.exams).toEqual(DEPLOYED_RECORD.exams);
    expect(s.sessions).toEqual(DEPLOYED_RECORD.sessions);
    expect(s.settings).toEqual(DEPLOYED_RECORD.settings);
  });
});

describe('unreadable records are never overwritten', () => {
  it('sets corrupted JSON aside before starting fresh', () => {
    const storage = memoryStorage();
    storage.setItem(STORAGE_KEY, '{"version":2,"srs":{');
    const r = loadStateSafely(storage, 5000);
    expect(r.canSave).toBe(true);
    expect(r.recoveredKey).toBe(`${RECOVERY_PREFIX}5000`);
    expect(storage.data[r.recoveredKey!]).toBe('{"version":2,"srs":{');
  });

  it('sets a record from a newer app version aside instead of discarding it', () => {
    const storage = memoryStorage();
    const future = JSON.stringify({ ...DEPLOYED_RECORD, version: 3 });
    storage.setItem(STORAGE_KEY, future);
    const r = loadStateSafely(storage, 6000);
    expect(storage.data[r.recoveredKey!]).toBe(future);
  });

  it('refuses to save at all when the unreadable record cannot be copied', () => {
    const storage = memoryStorage((k) => k.startsWith(RECOVERY_PREFIX));
    storage.setItem(STORAGE_KEY, 'garbage');
    const r = loadStateSafely(storage);
    expect(r.canSave).toBe(false);
    expect(storage.data[STORAGE_KEY]).toBe('garbage');
  });
});

describe('daily snapshot', () => {
  const day1 = new Date(2026, 9, 18, 9, 0).getTime();

  it('keeps the record as it stood before the first save of the day', () => {
    const storage = memoryStorage();
    storage.setItem(STORAGE_KEY, JSON.stringify(DEPLOYED_RECORD));
    const changed = reducer(migrate(DEPLOYED_RECORD), { type: 'visit-lesson', lesson: 'bai-04', now: day1 });
    saveState(storage, changed, day1);
    expect(storage.data[SNAPSHOT_KEY]).toBe(JSON.stringify(DEPLOYED_RECORD));
    const snap = readSnapshot(storage);
    expect(snap?.state.lessons['bai-04']).toBeUndefined();
    expect(snap?.state.lessons['bai-01'].completed).toBe(DEPLOYED_RECORD.lessons['bai-01'].completed);

    // Later saves on the same day leave the morning copy alone…
    saveState(storage, reducer(changed, { type: 'visit-lesson', lesson: 'bai-05', now: day1 + 1000 }), day1 + 1000);
    expect(storage.data[SNAPSHOT_KEY]).toBe(JSON.stringify(DEPLOYED_RECORD));
    // …and the next day takes a fresh one.
    saveState(storage, changed, day1 + DAY_MS);
    expect(JSON.parse(storage.data[SNAPSHOT_KEY]).lessons['bai-05']).toBeDefined();
    expect(storage.data[SNAPSHOT_DAY_KEY]).not.toBe('2026-10-18');
  });

  it('gives up the snapshot rather than the live save when space runs out', () => {
    let full = false;
    const storage = memoryStorage((k) => full && k === STORAGE_KEY && SNAPSHOT_KEY in storage.data);
    storage.setItem(STORAGE_KEY, JSON.stringify(DEPLOYED_RECORD));
    full = true;
    const next = reducer(migrate(DEPLOYED_RECORD), { type: 'complete-lesson', lesson: 'bai-03', completed: true, now: day1 });
    saveState(storage, next, day1);
    expect(JSON.parse(storage.data[STORAGE_KEY]).lessons['bai-03'].completed).toBe(day1);
    expect(storage.data[SNAPSHOT_KEY]).toBeUndefined();
  });

  it('starts clean when nothing was ever stored', () => {
    const storage = memoryStorage();
    const r = loadStateSafely(storage);
    expect(r).toEqual({ state: initialState(r.state.createdAt), canSave: true });
  });
});

describe('tone records', () => {
  it('counts misses and hits per syllable and remembers the confusion', () => {
    let s = initialState(0);
    s = reducer(s, { type: 'tone-slips', slips: [{ expected: 'ở', given: 'ơ' }], sentence: 'Tôi ở Hà Nội.', lesson: 'bai-07', now: 10 });
    s = reducer(s, { type: 'tone-slips', slips: [{ expected: 'ở', given: 'ớ' }], sentence: 'Bạn ở đâu?', lesson: 'bai-07', now: 20 });
    s = reducer(s, { type: 'tone-hits', syllables: ['ở', 'không-tracked'], now: 30 });
    expect(s.tones['ở']).toMatchObject({ misses: 2, hits: 1, confusedWith: ['ớ', 'ơ'], sentence: 'Bạn ở đâu?', lastMiss: 20, lastSeen: 30 });
    expect(s.tones['không-tracked']).toBeUndefined();
  });
});
