/**
 * Exam sampling: cumulative exams for a completed five-lesson block. Pure
 * functions (seeded) so attempts are reproducible in tests.
 */
import type { Exercise } from '../data/schema';
import type { Block } from './blocks';
import { generate, type GeneratedInstance } from './generators';
import { isProduction } from './grading';
import { createRng, shuffle, type Rng } from '../utilities/random';

export interface ExamQuestion {
  id: string;
  lesson: string;
  lessonNumber: number;
  source: { kind: 'exercise'; exercise: Exercise } | { kind: 'generated'; instance: GeneratedInstance };
  /** Shuffled option order for choice questions (indices into original options). */
  optionOrder?: number[];
}

export interface ExamPool {
  exercise: Exercise;
  ownerId: string;
  lessonNumber: number;
}

const EXAM_TYPES = new Set<Exercise['type']>(['mcq', 'typed', 'fill-blank', 'matching', 'ordering', 'error-correction', 'diacritics', 'reading-question', 'dialogue-completion', 'generator']);

export function eligibleForExam(e: Exercise): boolean {
  return EXAM_TYPES.has(e.type) && e.status !== 'flagged';
}

/**
 * Pick `count` questions spread across the lessons of the block, with at least
 * `minProductionShare` production tasks. Deterministic for a given seed.
 */
export function sampleExam(pool: ExamPool[], _block: Block, count: number, minProductionShare: number, seed: number): ExamQuestion[] {
  const rng = createRng(seed);
  const eligible = pool.filter((p) => eligibleForExam(p.exercise));
  const byLesson = new Map<number, ExamPool[]>();
  for (const p of eligible) {
    const list = byLesson.get(p.lessonNumber) ?? [];
    list.push(p);
    byLesson.set(p.lessonNumber, list);
  }
  const lessonNumbers = Array.from(byLesson.keys()).sort((a, b) => a - b);
  for (const n of lessonNumbers) byLesson.set(n, shuffle(byLesson.get(n)!, rng));

  const chosen: ExamPool[] = [];
  const used = new Set<string>();
  const needProduction = Math.ceil(count * minProductionShare);

  const takeFrom = (n: number, predicate: (p: ExamPool) => boolean): boolean => {
    const list = byLesson.get(n) ?? [];
    const idx = list.findIndex((p) => !used.has(p.exercise.id) && predicate(p));
    if (idx === -1) return false;
    used.add(list[idx].exercise.id);
    chosen.push(list[idx]);
    return true;
  };

  // Round-robin over lessons: production first until the share is met, then anything.
  let guard = 0;
  while (chosen.length < count && guard++ < count * 10 && lessonNumbers.length) {
    const productionSoFar = chosen.filter((p) => isProduction(p.exercise)).length;
    const wantProduction = productionSoFar < needProduction;
    let progressed = false;
    for (const n of lessonNumbers) {
      if (chosen.length >= count) break;
      if (takeFrom(n, (p) => (wantProduction ? isProduction(p.exercise) : true))) progressed = true;
    }
    if (!progressed) {
      // relax the constraint
      for (const n of lessonNumbers) {
        if (chosen.length >= count) break;
        if (takeFrom(n, () => true)) progressed = true;
      }
      if (!progressed) break;
    }
  }

  const questions: ExamQuestion[] = chosen.map((p) => toQuestion(p, rng));
  return shuffle(questions, rng);
}

function toQuestion(p: ExamPool, rng: Rng): ExamQuestion {
  const ex = p.exercise;
  if (ex.type === 'generator') {
    const inst = generate(ex.generator, ex.params, 1, Math.floor(rng() * 2 ** 31))[0];
    return {
      id: `${ex.id}:${inst.id}`,
      lesson: p.ownerId,
      lessonNumber: p.lessonNumber,
      source: { kind: 'generated', instance: inst },
      optionOrder: inst.options ? shuffle(inst.options.map((_, i) => i), rng) : undefined,
    };
  }
  const optionCount = ex.type === 'mcq' ? ex.options.length : ex.type === 'reading-question' && ex.options ? ex.options.length : 0;
  return {
    id: ex.id,
    lesson: p.ownerId,
    lessonNumber: p.lessonNumber,
    source: { kind: 'exercise', exercise: ex },
    optionOrder: optionCount ? shuffle(Array.from({ length: optionCount }, (_, i) => i), rng) : undefined,
  };
}

export const MASTERY_THRESHOLD = 0.8;

export function scorePercent(scores: number[]): number {
  if (!scores.length) return 0;
  return Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100);
}
