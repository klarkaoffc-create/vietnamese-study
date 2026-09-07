import { describe, expect, it } from 'vitest';
import { allVocab, grammarById, scenarios, vocabById } from '../src/data/content';
import { grammarTask, vocabActiveTask, vocabPassiveTask, scenarioTask, speakingTask, usableExamples } from '../src/learning/tasks';
import { gradeExercise } from '../src/learning/grading';
import type { AutomaticityLevel } from '../src/learning/srs';

/**
 * The pedagogy these tests protect: reviews must require the learner to
 * PRODUCE Vietnamese, not to reveal a translation and rate themselves.
 */

const withExample = allVocab.find((v) => usableExamples(v).length > 0)!;

describe('vocabulary tasks are production, not flashcards', () => {
  it('asks the learner to produce Vietnamese at every level', () => {
    for (const level of [1, 2, 3, 4, 5] as AutomaticityLevel[]) {
      const t = vocabActiveTask(withExample, level);
      expect(t, `level ${level}`).toBeTruthy();
      // Never a "reveal and self-rate" card: the learner always types or fills.
      expect(['typed', 'fill-blank', 'open-answer']).toContain(t!.exercise.type);
      expect(t!.selfAssessed).toBe(false);
      expect(t!.srsKind).toBe('vocab-active');
    }
  });

  it('practises the word inside a real sentence from the lesson content', () => {
    const t = vocabActiveTask(withExample, 3)!;
    const ex = usableExamples(withExample)[0];
    expect(t.exercise.type).toBe('typed');
    if (t.exercise.type === 'typed') {
      // The expected answer is the lesson's own sentence, not an invented one.
      expect(t.exercise.answers[0]).toBe(ex.vi);
      expect(t.exercise.prompt).toContain(ex.pl);
    }
  });

  it('drops scaffolding as the level rises', () => {
    const early = vocabActiveTask(withExample, 3)!;
    const late = vocabActiveTask(withExample, 5)!;
    expect(early.exercise.type === 'typed' && early.exercise.hint).toBeTruthy();
    // Level 5 gives only the communicative goal, with a time budget.
    expect(late.exercise.type).toBe('open-answer');
    expect(late.timeLimitSec).toBeGreaterThan(0);
  });

  it('grades a produced sentence with the normal engine', () => {
    const t = vocabActiveTask(withExample, 3)!;
    if (t.exercise.type !== 'typed') throw new Error('expected typed');
    const good = gradeExercise(t.exercise, { kind: 'text', value: t.exercise.answers[0] });
    expect(good.outcome).toBe('correct');
    const bad = gradeExercise(t.exercise, { kind: 'text', value: 'zzz' });
    expect(bad.outcome).toBe('wrong');
  });

  it('falls back to typed word recall (never a self-rated card) with no example sentence', () => {
    const bare = allVocab.find((v) => usableExamples(v).length === 0)!;
    const t = vocabActiveTask(bare, 4)!;
    expect(t.exercise.type).toBe('typed');
    expect(t.selfAssessed).toBe(false);
    // Scaffolding is capped because no contextual sentence exists for it.
    expect(t.level).toBeLessThanOrEqual(2);
  });
});

describe('passive checks stay diagnostic', () => {
  it('uses real alternatives rather than a reveal button', () => {
    const t = vocabPassiveTask(withExample, allVocab);
    expect(t).toBeTruthy();
    expect(t!.exercise.type).toBe('mcq');
    expect(t!.srsKind).toBe('vocab-passive');
    if (t!.exercise.type === 'mcq') expect(t!.exercise.options.length).toBeGreaterThanOrEqual(3);
  });
});

describe('grammar and dialogue tasks', () => {
  it('makes grammar produce a sentence at higher levels', () => {
    const g = [...grammarById.values()].find((x) => x.examples.some((e) => e.pl))!;
    const low = grammarTask(g, 2)!;
    const high = grammarTask(g, 4)!;
    expect(['ordering', 'typed']).toContain(low.exercise.type);
    expect(high.exercise.type).toBe('typed');
    expect(high.srsKind).toBe('grammar');
  });
});

describe('scenarios drive spontaneous production', () => {
  it('gives a situation and a goal, never the sentence', () => {
    expect(scenarios.length).toBeGreaterThan(10);
    const s = scenarios[0];
    const t = scenarioTask(s, 4);
    expect(t.exercise.type).toBe('open-answer');
    expect(t.srsKind).toBe('sentence');
    if (t.exercise.type === 'open-answer') {
      expect(t.exercise.instruction).toBe(s.situation);
      // The model answer is available only as feedback after answering.
      expect(t.exercise.sample).toBe(s.sample);
    }
  });

  it('every scenario references vocabulary that exists', () => {
    for (const s of scenarios) {
      for (const v of s.vocab) expect(vocabById.has(v), `${s.id} → ${v}`).toBe(true);
    }
  });

  it('accepts an answer that matches the scenario pattern', () => {
    const s = scenarios.find((x) => x.id === 's-bai-08-order-coffee')!;
    const t = scenarioTask(s, 3);
    if (t.exercise.type !== 'open-answer') throw new Error('expected open-answer');
    expect(gradeExercise(t.exercise, { kind: 'text', value: s.sample }).outcome).toBe('correct');
    expect(gradeExercise(t.exercise, { kind: 'text', value: 'Xin chào' }).outcome).toBe('wrong');
  });
});

describe('speaking is the only self-assessed task', () => {
  it('is marked self-assessed and carries the model sentence', () => {
    const t = speakingTask('Xin chào!', 'Dzień dobry!', 'v-bai-01-xin-chao', 'bai-01', 2);
    expect(t.selfAssessed).toBe(true);
    expect(t.exercise.type).toBe('speaking');
    if (t.exercise.type === 'speaking') expect(t.exercise.target).toBe('Xin chào!');
  });

  it('hides the model at high automaticity so it must be produced first', () => {
    const early = speakingTask('Xin chào!', 'Dzień dobry!', 'r', 'bai-01', 2);
    const late = speakingTask('Xin chào!', 'Dzień dobry!', 'r', 'bai-01', 5);
    if (early.exercise.type !== 'speaking' || late.exercise.type !== 'speaking') throw new Error('expected speaking');
    expect(early.exercise.showTarget).toBe(true);
    expect(late.exercise.showTarget).toBe(false);
  });
});
