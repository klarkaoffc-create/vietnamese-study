import { describe, expect, it } from 'vitest';
import { buildSession, interleave, type SessionItem } from '../src/learning/session';
import { initialState, reducer } from '../src/learning/state';

/** A learner who has opened the first eight lessons. */
function seededState() {
  let s = initialState(0);
  for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) {
    s = reducer(s, { type: 'visit-lesson', lesson: `bai-0${n}`, now: 1000 });
  }
  return s;
}

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

/**
 * The daily session is the user-facing product. These tests pin the two
 * properties that were explicitly asked for: it must be a mixed production
 * workout, and it must never open with (or cluster) passive tasks.
 */
describe('daily session shape', () => {
  it('opens with a productive task, never a self-rated speaking card', () => {
    const s = seededState();
    const plan = buildSession(s, 'today');
    expect(plan.items.length).toBeGreaterThan(4);
    const first = plan.items[0];
    expect(first.kind).toBe('task');
    if (first.kind === 'task') {
      expect(first.task.exercise.type).not.toBe('speaking');
      expect(first.task.selfAssessed).toBe(false);
    }
  });

  it('is mostly production, not recognition', () => {
    const plan = buildSession(seededState(), 'today');
    const producing = plan.items.filter((i) => {
      const ex = i.kind === 'task' ? i.task.exercise : i.kind === 'exercise' ? i.exercise : null;
      return ex ? !['mcq', 'matching'].includes(ex.type) : false;
    });
    expect(producing.length / plan.items.length).toBeGreaterThan(0.6);
  });

  it('mixes several kinds of task rather than one drill repeated', () => {
    const plan = buildSession(seededState(), 'today');
    const phases = new Set(plan.items.filter((i) => i.kind === 'task').map((i) => (i as { task: { phase: string } }).task.phase));
    expect(phases.size).toBeGreaterThanOrEqual(3);
  });

  it('never runs three pure recognition tasks back to back', () => {
    const mcq = (id: string): SessionItem => ({
      kind: 'task',
      task: {
        id, srsKind: 'vocab-passive', srsRef: id, lesson: 'bai-01', level: 1, phase: 'warmup', targetVocab: [], selfAssessed: false,
        exercise: { id: `e-bai-01-${id}`, type: 'mcq', skill: 'vocabulary', source: 'generated', status: 'unverified', prompt: 'p', options: ['a', 'b'], answer: 0, grammar: [], vocab: [], level: 1 },
      },
    });
    const typed = (id: string): SessionItem => ({
      kind: 'task',
      task: {
        id, srsKind: 'vocab-active', srsRef: id, lesson: 'bai-01', level: 3, phase: 'retrieval', targetVocab: [], selfAssessed: false,
        exercise: { id: `e-bai-01-${id}`, type: 'typed', skill: 'vocabulary', source: 'generated', status: 'unverified', prompt: 'p', answerLang: 'vi', answers: ['x'], grammar: [], vocab: [], level: 3 },
      },
    });
    const mixed = interleave([mcq('a'), mcq('b'), mcq('c'), mcq('d'), typed('t1'), typed('t2')]);
    const isMcq = (i: SessionItem) => i.kind === 'task' && i.task.exercise.type === 'mcq';
    for (let i = 2; i < mixed.length; i++) {
      expect(isMcq(mixed[i]) && isMcq(mixed[i - 1]) && isMcq(mixed[i - 2])).toBe(false);
    }
  });
});
