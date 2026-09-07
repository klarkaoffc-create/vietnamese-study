/**
 * Five-lesson course blocks. Pure function so it can be unit tested without
 * loading content.
 */
export const BLOCK_SIZE = 5;

export interface Block {
  index: number;
  fromLesson: number;
  toLesson: number;
  /** Lesson numbers that actually exist in this block. */
  lessons: number[];
  /** True when every lesson of the block exists. */
  complete: boolean;
  /** Review content id if a teacher review exists for exactly this block. */
  reviewId?: string;
  /** Exam blueprint id if one exists. */
  examId?: string;
}

export function blockIndexForLesson(n: number): number {
  return Math.ceil(n / BLOCK_SIZE);
}

export function computeBlocks(
  lessonNumbers: number[],
  reviews: { id: string; fromLesson: number; toLesson: number }[] = [],
  exams: { id: string; block: number }[] = [],
): Block[] {
  if (lessonNumbers.length === 0) return [];
  const max = Math.max(...lessonNumbers);
  const set = new Set(lessonNumbers);
  const count = blockIndexForLesson(max);
  const out: Block[] = [];
  for (let i = 1; i <= count; i++) {
    const from = (i - 1) * BLOCK_SIZE + 1;
    const to = i * BLOCK_SIZE;
    const present: number[] = [];
    for (let n = from; n <= to; n++) if (set.has(n)) present.push(n);
    out.push({
      index: i,
      fromLesson: from,
      toLesson: to,
      lessons: present,
      complete: present.length === BLOCK_SIZE,
      reviewId: reviews.find((r) => r.fromLesson === from && r.toLesson === to)?.id,
      examId: exams.find((e) => e.block === i)?.id,
    });
  }
  return out;
}

/** Progress toward the end of the block a lesson belongs to. */
export function blockProgress(block: Block, completedLessons: Set<number>): { done: number; total: number } {
  const done = block.lessons.filter((n) => completedLessons.has(n)).length;
  return { done, total: BLOCK_SIZE };
}
