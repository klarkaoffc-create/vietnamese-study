/**
 * Turns the outcome of a task into store actions: scheduler updates for the
 * ability that was practised, plus mistake logging.
 *
 * The important change from the flashcard era: an ability is only credited
 * when the learner actually PRODUCED something and it was graded. Passive
 * recognition updates a separate, lower-weighted ability.
 */
import type { Action } from './state';
import type { GradeResult } from './grading';
import type { SessionItem } from './session';
import type { LearningTask } from './tasks';
import { gradeFromOutcome, type SrsGrade } from './srs';
import { taskPrompt, type Task } from '../exercises/ExerciseView';
import { exerciseById, vocabById } from '../data/content';

/** Actions for a scheduled task that the engine graded automatically. */
export function actionsForTask(item: Extract<SessionItem, { kind: 'task' }>, result: GradeResult, given: string): Action[] {
  const { task } = item;
  const outcome3 = result.outcome === 'partial' ? (result.score >= 0.5 ? 'tone' : 'wrong') : result.outcome;
  const grade = gradeFromOutcome(outcome3);
  return recordTask(task, grade, outcome3, given, result, item.mistakeRef);
}

/** Actions for an open task the learner rated themselves (speaking). */
export function actionsForSelfAssessed(item: Extract<SessionItem, { kind: 'task' }>, grade: SrsGrade, given: string): Action[] {
  const outcome = grade >= 2 ? 'correct' : grade === 1 ? 'tone' : 'wrong';
  return recordTask(item.task, grade, outcome, given, null, item.mistakeRef);
}

function recordTask(
  task: LearningTask,
  grade: SrsGrade,
  outcome: 'correct' | 'tone' | 'wrong',
  given: string,
  result: GradeResult | null,
  mistakeRef?: string,
): Action[] {
  const actions: Action[] = [{ type: 'review', kind: task.srsKind, ref: task.srsRef, lesson: task.lesson, grade }];

  // Producing a word inside a sentence also proves you understand it, so a
  // successful active task credits the passive ability too (never the
  // reverse — recognising a word says nothing about being able to say it).
  if (task.srsKind === 'vocab-active' && grade >= 2) {
    actions.push({ type: 'review', kind: 'vocab-passive', ref: task.srsRef, lesson: task.lesson, grade: 2 });
  }
  // Any vocabulary genuinely used inside a bigger task counts as active use.
  if (task.srsKind !== 'vocab-active' && grade >= 2) {
    for (const vid of task.targetVocab) {
      const v = vocabById.get(vid);
      if (v) actions.push({ type: 'review', kind: 'vocab-active', ref: vid, lesson: v.lessonId, grade: 2 });
    }
  }

  const success = grade >= 2;
  if (!success) {
    actions.push({
      type: 'mistake',
      mistake: {
        lesson: task.lesson,
        ref: task.srsRef,
        refKind: task.srsKind === 'vocab-active' || task.srsKind === 'vocab-passive' ? 'vocab' : 'exercise',
        category: result?.category ?? (task.srsKind === 'dialogue' ? 'dialogue' : 'grammar'),
        prompt: taskPrompt({ kind: 'exercise', exercise: task.exercise }),
        expected: result?.expected ?? '',
        given,
        outcome,
        flagged: result?.flagged ?? false,
      },
    });
  }
  actions.push({ type: 'mistake-retry', ref: mistakeRef ?? task.srsRef, success });
  return actions;
}

/** Actions for a hand-written content exercise or a generated drill. */
export function actionsForExercise(task: Task, lesson: string, result: GradeResult, given: string, mistakeRef?: string): Action[] {
  const actions: Action[] = [];
  const outcome3 = result.outcome === 'partial' ? (result.score >= 0.5 ? 'tone' : 'wrong') : result.outcome;
  const grade = gradeFromOutcome(outcome3);
  const ref = task.kind === 'exercise' ? task.exercise.id : task.instance.id;
  const lessonId = task.kind === 'exercise' ? exerciseById.get(task.exercise.id)?.ownerId ?? lesson : lesson;

  if (task.kind === 'exercise') {
    for (const gid of task.exercise.grammar) actions.push({ type: 'review', kind: 'grammar', ref: gid, lesson: lessonId, grade });
    // Using a word correctly in an authored exercise is active use as well.
    if (grade >= 2) {
      for (const vid of task.exercise.vocab) {
        const v = vocabById.get(vid);
        if (v) actions.push({ type: 'review', kind: 'vocab-active', ref: vid, lesson: v.lessonId, grade: 2 });
      }
    }
  }

  const success = result.outcome === 'correct';
  if ((!success && result.outcome !== 'partial') || (result.outcome === 'partial' && result.score < 0.5)) {
    actions.push({
      type: 'mistake',
      mistake: {
        lesson: lessonId,
        ref,
        refKind: task.kind === 'exercise' ? 'exercise' : 'generated',
        generatorKind: task.kind === 'generated' ? task.instance.generator : undefined,
        category: result.category,
        prompt: taskPrompt(task),
        expected: result.expected,
        given,
        outcome: outcome3,
        flagged: result.flagged,
      },
    });
  }
  actions.push({ type: 'mistake-retry', ref: mistakeRef ?? ref, success });
  return actions;
}
