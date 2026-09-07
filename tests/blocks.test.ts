import { describe, expect, it } from 'vitest';
import { blockIndexForLesson, blockProgress, computeBlocks } from '../src/learning/blocks';

describe('five-lesson blocks', () => {
  it('derives blocks from existing lesson numbers', () => {
    const b = computeBlocks([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], [{ id: 'rev-01-05', fromLesson: 1, toLesson: 5 }], [{ id: 'exam-01', block: 1 }, { id: 'exam-02', block: 2 }]);
    expect(b).toHaveLength(3);
    expect(b[0]).toMatchObject({ index: 1, fromLesson: 1, toLesson: 5, complete: true, reviewId: 'rev-01-05', examId: 'exam-01' });
    expect(b[1]).toMatchObject({ index: 2, fromLesson: 6, toLesson: 10, complete: true, examId: 'exam-02' });
    expect(b[1].reviewId).toBeUndefined();
    expect(b[2]).toMatchObject({ index: 3, fromLesson: 11, toLesson: 15, complete: false, lessons: [11] });
  });
  it('handles a new lesson 12 without any code change', () => {
    const b = computeBlocks([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(b[2].lessons).toEqual([11, 12]);
    expect(b[2].complete).toBe(false);
  });
  it('marks block 3 complete when lesson 15 exists', () => {
    const b = computeBlocks(Array.from({ length: 15 }, (_, i) => i + 1));
    expect(b[2].complete).toBe(true);
  });
  it('maps lesson numbers to block indexes', () => {
    expect(blockIndexForLesson(1)).toBe(1);
    expect(blockIndexForLesson(5)).toBe(1);
    expect(blockIndexForLesson(6)).toBe(2);
    expect(blockIndexForLesson(11)).toBe(3);
  });
  it('computes progress toward the next review', () => {
    const [b] = computeBlocks([1, 2, 3, 4, 5]);
    expect(blockProgress(b, new Set([1, 2, 3]))).toEqual({ done: 3, total: 5 });
  });
  it('returns nothing for no lessons', () => {
    expect(computeBlocks([])).toEqual([]);
  });
});
