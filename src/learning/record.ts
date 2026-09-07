/**
 * Turns exercise / vocabulary outcomes into store actions: SRS updates for
 * vocabulary and grammar, mistake logging and mistake retries.
 */
import type { Action } from './state';
import type { GradeResult } from './grading';
import type { SessionItem } from './session';
import { gradeFromOutcome, type SrsGrade } from './srs';
import { taskPrompt, type Task } from '../exercises/ExerciseView';
import { exerciseById } from '../data/content';

export function actionsForVocab(item: Extract<SessionItem, { kind: 'vocab' }>, grade: SrsGrade, outcome: 'correct' | 'tone' | 'wrong', given: string): Action[] {
  const actions: Action[] = [
    { type: 'review', kind: item.direction === 'vi-pl' ? 'vocab-vi-pl' : 'vocab-pl-vi', ref: item.vocab.id, lesson: item.vocab.lessonId, grade },
  ];
  if (grade === 0 && item.direction === 'pl-vi') {
    actions.push({
      type: 'mistake',
      mistake: {
        lesson: item.vocab.lessonId,
        ref: item.vocab.id,
        refKind: 'vocab',
        category: outcome === 'tone' ? 'tone' : 'vocabulary',
        prompt: item.vocab.pl,
        expected: item.vocab.vi,
        given,
        outcome,
        flagged: item.vocab.status === 'flagged',
      },
    });
  } else if (grade >= 2) {
    actions.push({ type: 'mistake-retry', ref: item.vocab.id, success: true });
  } else if (grade === 0) {
    actions.push({ type: 'mistake-retry', ref: item.vocab.id, success: false });
  }
  return actions;
}

export function actionsForTask(task: Task, lesson: string, result: GradeResult, given: string, mistakeRef?: string): Action[] {
  const actions: Action[] = [];
  const outcome3 = result.outcome === 'partial' ? (result.score >= 0.5 ? 'tone' : 'wrong') : result.outcome;
  const grade = gradeFromOutcome(outcome3);
  const ref = task.kind === 'exercise' ? task.exercise.id : task.instance.id;
  const lessonId = task.kind === 'exercise' ? exerciseById.get(task.exercise.id)?.ownerId ?? lesson : lesson;

  // Grammar SRS: every grammar point the exercise practises gets the grade.
  if (task.kind === 'exercise') {
    for (const gid of task.exercise.grammar) actions.push({ type: 'review', kind: 'grammar', ref: gid, lesson: lessonId, grade });
  }

  const success = result.outcome === 'correct';
  if (!success && result.outcome !== 'partial' || (result.outcome === 'partial' && result.score < 0.5)) {
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
  const retryRef = mistakeRef ?? ref;
  actions.push({ type: 'mistake-retry', ref: retryRef, success });
  return actions;
}
