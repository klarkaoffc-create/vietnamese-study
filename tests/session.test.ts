import { describe, expect, it } from 'vitest';
import { buildSession } from '../src/learning/session';
import { initialState, reducer } from '../src/learning/state';

/**
 * Regression coverage for a real crash found during manual verification:
 * navigating to /powtorki/today (or any mode building the mistake queue)
 * threw "Cannot read properties of undefined (reading 'id')" whenever the
 * mistake book contained a "tone-identify" generated item. The generated
 * instance id for that generator is "gen:tone:<syllable>" (not
 * "gen:tone-identify:..."), so `session.ts` used to re-derive the generator
 * kind by splitting the ref string, which produced the invalid kind "tone"
 * and made the generator return undefined. The fix stores `generatorKind`
 * explicitly on the Mistake record instead of parsing it back out of `ref`.
 */
describe('buildSession with generated mistakes', () => {
  it('does not crash on a tone-identify mistake and returns a playable item', () => {
    let s = initialState(0);
    s = reducer(s, {
      type: 'mistake',
      mistake: {
        lesson: 'bai-01',
        ref: 'gen:tone:ma',
        refKind: 'generated',
        generatorKind: 'tone-identify',
        category: 'tone',
        prompt: 'Jaki ton ma sylaba „ma”?',
        expected: 'ngang (równy)',
        given: 'huyền (opadający)',
        outcome: 'wrong',
        flagged: false,
      },
      now: 1000,
    });

    expect(() => buildSession(s, 'mistakes')).not.toThrow();
    const plan = buildSession(s, 'mistakes');
    expect(plan.items).toHaveLength(1);
    expect(plan.items[0].kind).toBe('generated');
    if (plan.items[0].kind === 'generated') {
      expect(plan.items[0].instance.generator).toBe('tone-identify');
      expect(plan.items[0].instance.id).toBeTruthy();
    }
  });

  it('handles every generator kind used as a mistake without crashing', () => {
    const kinds = ['number', 'phone', 'age', 'year', 'date', 'weekday', 'month', 'time', 'classifier', 'pronoun', 'tense', 'comparison', 'position', 'tone-identify'] as const;
    let s = initialState(0);
    for (const kind of kinds) {
      s = reducer(s, {
        type: 'mistake',
        mistake: { lesson: 'bai-01', ref: `gen:${kind}:x`, refKind: 'generated', generatorKind: kind, category: 'grammar', prompt: 'p', expected: 'e', given: 'g', outcome: 'wrong', flagged: false },
        now: 1000,
      });
    }
    expect(() => buildSession(s, 'mistakes')).not.toThrow();
    const plan = buildSession(s, 'mistakes');
    expect(plan.items.length).toBe(kinds.length);
  });

  it('skips a generated mistake with no generatorKind rather than crashing (defensive: e.g. data imported from an older version)', () => {
    let s = initialState(0);
    s = reducer(s, {
      type: 'mistake',
      mistake: { lesson: 'bai-01', ref: 'gen:unknown:x', refKind: 'generated', category: 'grammar', prompt: 'p', expected: 'e', given: 'g', outcome: 'wrong', flagged: false },
      now: 1000,
    });
    expect(() => buildSession(s, 'mistakes')).not.toThrow();
    expect(buildSession(s, 'mistakes').items).toHaveLength(0);
  });

  it('builds the "today" session without crashing on an empty state', () => {
    const s = initialState(0);
    expect(() => buildSession(s, 'today')).not.toThrow();
  });
});
