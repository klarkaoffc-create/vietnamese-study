import { describe, expect, it } from 'vitest';
import { initialState, migrate, reducer, STATE_VERSION, type AppState } from '../src/learning/state';
import { passiveOnlyVocab, skillScores } from '../src/learning/skills';
import { allVocab } from '../src/data/content';
import { isAutomatic, makeSrsId, mastery, newSrsItem, schedule } from '../src/learning/srs';
import { DAY_MS } from '../src/utilities/dates';

const T0 = Date.UTC(2026, 8, 7, 10, 0, 0);
const VOCAB = 'v-bai-01-xin-chao';

/** Drive one ability through N successful reviews. */
function practise(state: AppState, kind: Parameters<typeof newSrsItem>[0], ref: string, times: number, grade: 0 | 1 | 2 | 3 = 2): AppState {
  let s = state;
  for (let i = 0; i < times; i++) {
    s = reducer(s, { type: 'review', kind, ref, lesson: 'bai-01', grade, now: T0 + i * 30 * DAY_MS });
  }
  return s;
}

describe('automaticity ladder', () => {
  it('climbs on success and falls back on failure', () => {
    let item = newSrsItem('vocab-active', VOCAB, 'bai-01', T0);
    expect(item.level).toBe(1);
    item = schedule(item, 2, T0);
    expect(item.level).toBe(2);
    item = schedule(item, 2, T0 + DAY_MS);
    expect(item.level).toBe(3);
    item = schedule(item, 0, T0 + 2 * DAY_MS);
    expect(item.level).toBe(2); // failing drops one rung, restoring scaffolding
  });

  it('caps at 5 and never below 1', () => {
    let item = newSrsItem('grammar', 'g', 'bai-01', T0);
    for (let i = 0; i < 10; i++) item = schedule(item, 3, T0 + i * DAY_MS);
    expect(item.level).toBe(5);
    for (let i = 0; i < 10; i++) item = schedule(item, 0, T0 + i * DAY_MS);
    expect(item.level).toBe(1);
  });

  it('withholds "mature" and mastery from recognition-only history', () => {
    // Long interval but still low on the ladder: not mastered.
    const recognised = { ...newSrsItem('vocab-passive', VOCAB, 'bai-01', T0), interval: 40, successes: 5, failures: 0, level: 1 as const };
    const produced = { ...recognised, level: 5 as const };
    expect(mastery(produced)).toBeGreaterThan(mastery(recognised));
    expect(isAutomatic(recognised)).toBe(false);
    expect(isAutomatic(produced)).toBe(true);
  });
});

describe('skill scores', () => {
  it('reports fluency-relevant skills rather than card counts', () => {
    const scores = skillScores(initialState(T0));
    const ids = scores.map((s) => s.id);
    expect(ids).toContain('vocab-active');
    expect(ids).toContain('vocab-passive');
    expect(ids).toContain('sentences');
    expect(ids).toContain('dialogue');
    expect(ids).toContain('grammar');
    expect(ids).toContain('automaticity');
    for (const s of scores) expect(s.percent).toBe(0);
  });

  it('separates active from passive knowledge', () => {
    let s = initialState(T0);
    // Recognise a slice of the course vocabulary, produce none of it.
    for (const v of allVocab.slice(0, 40)) s = practise(s, 'vocab-passive', v.id, 4);
    const scores = skillScores(s);
    const active = scores.find((x) => x.id === 'vocab-active')!;
    const passive = scores.find((x) => x.id === 'vocab-passive')!;
    // Recognising words must not make them count as usable vocabulary.
    expect(passive.practised).toBe(40);
    expect(passive.percent).toBeGreaterThan(0);
    expect(active.practised).toBe(0);
    expect(active.percent).toBe(0);
  });

  it('lists words understood but not yet producible', () => {
    let s = initialState(T0);
    s = practise(s, 'vocab-passive', VOCAB, 5);
    expect(passiveOnlyVocab(s)).toContain(VOCAB);
    // Once it is produced repeatedly, it leaves the gap list.
    s = practise(s, 'vocab-active', VOCAB, 5);
    expect(passiveOnlyVocab(s)).not.toContain(VOCAB);
  });
});

describe('progress migration from the flashcard era', () => {
  it('maps card directions onto abilities without losing history', () => {
    const legacy = {
      version: 1,
      createdAt: T0,
      srs: {
        'vocab-vi-pl:v-bai-01-xin-chao': { id: 'vocab-vi-pl:v-bai-01-xin-chao', lesson: 'bai-01', kind: 'vocab-vi-pl', ref: VOCAB, lastReview: T0, successes: 4, failures: 1, interval: 10, ease: 2.5, due: T0, lapses: 0 },
        'vocab-pl-vi:v-bai-01-xin-chao': { id: 'vocab-pl-vi:v-bai-01-xin-chao', lesson: 'bai-01', kind: 'vocab-pl-vi', ref: VOCAB, lastReview: T0, successes: 2, failures: 0, interval: 3, ease: 2.5, due: T0, lapses: 0 },
      },
      lessons: {},
      mistakes: [],
      exams: [],
      sessions: [],
    };
    const migrated = migrate(legacy);
    expect(migrated.version).toBe(STATE_VERSION);
    // Recognition history → passive ability; production history → active.
    const passive = migrated.srs[makeSrsId('vocab-passive', VOCAB)];
    const active = migrated.srs[makeSrsId('vocab-active', VOCAB)];
    expect(passive.interval).toBe(10);
    expect(passive.successes).toBe(4);
    expect(active.interval).toBe(3);
    // Production history earns a head start on the ladder; recognition does not.
    expect(active.level).toBe(2);
    expect(passive.level).toBe(1);
    expect(Object.keys(migrated.srs)).toHaveLength(2);
  });

  it('leaves already-migrated state untouched', () => {
    let s = initialState(T0);
    s = practise(s, 'vocab-active', VOCAB, 2);
    const again = migrate(JSON.parse(JSON.stringify(s)));
    expect(again.srs[makeSrsId('vocab-active', VOCAB)].successes).toBe(2);
  });
});
