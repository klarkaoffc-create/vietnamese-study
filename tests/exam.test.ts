import { describe, expect, it } from 'vitest';
import { eligibleForExam, sampleExam, scorePercent, type ExamPool } from '../src/learning/exam';
import { computeBlocks } from '../src/learning/blocks';
import { isProduction } from '../src/learning/grading';
import type { Exercise } from '../src/data/schema';

function mcq(id: string, lesson: number, status: Exercise['status'] = 'unverified'): ExamPool {
  return { exercise: { id, type: 'mcq', skill: 'grammar', source: 'generated', status, prompt: id, options: ['a', 'b', 'c'], answer: 0, grammar: [], vocab: [], level: 1 }, ownerId: `bai-0${lesson}`, lessonNumber: lesson };
}
function typed(id: string, lesson: number): ExamPool {
  return { exercise: { id, type: 'typed', skill: 'vocabulary', source: 'generated', status: 'unverified', prompt: id, answerLang: 'vi', answers: ['x'], grammar: [], vocab: [], level: 2 }, ownerId: `bai-0${lesson}`, lessonNumber: lesson };
}
function open(id: string, lesson: number): ExamPool {
  return { exercise: { id, type: 'open-answer', skill: 'grammar', source: 'generated', status: 'unverified', prompt: id, patterns: ['{x}'], grammar: [], vocab: [], level: 3 }, ownerId: `bai-0${lesson}`, lessonNumber: lesson };
}

const pool: ExamPool[] = [];
for (let l = 1; l <= 5; l++) {
  for (let i = 0; i < 4; i++) pool.push(mcq(`m-${l}-${i}`, l));
  for (let i = 0; i < 4; i++) pool.push(typed(`t-${l}-${i}`, l));
  pool.push(open(`o-${l}`, l));
  pool.push(mcq(`f-${l}`, l, 'flagged'));
}
const block = computeBlocks([1, 2, 3, 4, 5])[0];

describe('exam sampling', () => {
  it('excludes flagged and open-answer exercises', () => {
    expect(eligibleForExam(mcq('x', 1, 'flagged').exercise)).toBe(false);
    expect(eligibleForExam(open('x', 1).exercise)).toBe(false);
    const qs = sampleExam(pool, block, 25, 0.5, 1);
    expect(qs.every((q) => q.source.kind === 'exercise' && q.source.exercise.status !== 'flagged' && q.source.exercise.type !== 'open-answer')).toBe(true);
  });
  it('returns the requested count, unique, spread over lessons', () => {
    const qs = sampleExam(pool, block, 25, 0.5, 123);
    expect(qs).toHaveLength(25);
    expect(new Set(qs.map((q) => q.id)).size).toBe(25);
    const perLesson = new Map<number, number>();
    for (const q of qs) perLesson.set(q.lessonNumber, (perLesson.get(q.lessonNumber) ?? 0) + 1);
    for (const n of perLesson.values()) expect(n).toBe(5);
  });
  it('respects the production share', () => {
    const qs = sampleExam(pool, block, 20, 0.6, 5);
    const production = qs.filter((q) => q.source.kind === 'exercise' && isProduction(q.source.exercise)).length;
    expect(production).toBeGreaterThanOrEqual(12);
  });
  it('is deterministic per seed and different across seeds', () => {
    const a = sampleExam(pool, block, 10, 0.5, 9).map((q) => q.id);
    const b = sampleExam(pool, block, 10, 0.5, 9).map((q) => q.id);
    const c = sampleExam(pool, block, 10, 0.5, 10).map((q) => q.id);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });
  it('shuffles mcq options through optionOrder', () => {
    const qs = sampleExam(pool, block, 25, 0, 3);
    const withOrder = qs.filter((q) => q.optionOrder);
    expect(withOrder.length).toBeGreaterThan(0);
    for (const q of withOrder) expect([...q.optionOrder!].sort()).toEqual([0, 1, 2]);
  });
  it('computes percentages', () => {
    expect(scorePercent([1, 0.5, 0])).toBe(50);
    expect(scorePercent([])).toBe(0);
  });
});
