/**
 * Where the learner is in the COURSE.
 *
 * One definition, used by the dashboard, the lesson list, the lesson page, the
 * daily plan and the progress page, so they can never disagree about what to
 * study next.
 *
 * The rule is deliberately narrow: progression is decided by lesson
 * COMPLETION and nothing else. Not by SRS due counts, not by the mistake
 * backlog, not by which lesson was opened most recently, not by the date.
 *
 * What went wrong before: `currentLesson()` took the highest-numbered lesson
 * that had ever been *visited* and treated everything below it as "studied".
 * Opening Bài 12 out of curiosity therefore declared the whole course studied,
 * filled the review pools with all twelve lessons, and — because nothing in
 * the daily session drew on unseen material — left the learner reviewing
 * forever without a next step. `nextLesson` below cannot do that: it walks
 * from Bài 1 and stops at the first lesson that is not finished.
 */
import { lessons } from '../data/content';
import type { Lesson } from '../data/schema';
import { makeSrsId } from './srs';
import { isMastered } from './targets';
import type { AppState } from './state';

/** Share of a lesson's learning targets that must be mastered to count it done. */
export const LESSON_TARGET_SHARE = 0.8;

/** Checkpoint score that counts as passing. */
export const CHECKPOINT_PASS = 0.8;

/** The scheduled abilities a lesson is trying to teach. */
export function lessonTargets(lesson: Lesson): { kind: 'vocab-active' | 'grammar'; ref: string }[] {
  return [
    ...lesson.vocabulary.filter((v) => v.srs && v.status !== 'flagged').map((v) => ({ kind: 'vocab-active' as const, ref: v.id })),
    ...lesson.grammar.map((g) => ({ kind: 'grammar' as const, ref: g.id })),
  ];
}

export interface LessonStatus {
  lesson: Lesson;
  /** Opened at least once. */
  viewed: boolean;
  /** Learning targets that have reached three successful demonstrations. */
  mastered: number;
  total: number;
  checkpointPassed: boolean;
  /** Explicitly finished — a passed checkpoint, or the manual toggle. */
  markedComplete: boolean;
  /** Enough of the lesson's targets are mastered right now. */
  demonstrated: boolean;
  complete: boolean;
}

export function lessonStatus(state: AppState, lesson: Lesson): LessonStatus {
  const lp = state.lessons[lesson.id];
  const targets = lessonTargets(lesson);
  const mastered = targets.filter((t) => isMastered(state.srs[makeSrsId(t.kind, t.ref)])).length;
  const checkpointPassed = (lp?.checkpoints ?? []).some((c) => c.total > 0 && c.score / c.total >= CHECKPOINT_PASS);
  const markedComplete = !!lp?.completed;
  // Two honest routes to "finished": pass the checkpoint (which already sets
  // `completed`), or simply demonstrate the material — a learner who has
  // mastered the lesson's targets in review has met the objectives and should
  // not be held behind a quiz they never opened. Nothing here requires every
  // last task to be repeated.
  const demonstrated = targets.length > 0 && mastered >= Math.ceil(targets.length * LESSON_TARGET_SHARE);
  return {
    lesson,
    viewed: !!lp?.visited,
    mastered,
    total: targets.length,
    checkpointPassed,
    markedComplete,
    demonstrated,
    /*
     * Completion never goes backwards. `markedComplete` and `checkpointPassed`
     * are historical facts and cannot regress; `demonstrated` can, because a
     * target that is later failed drops out of mastery. Without the first two
     * terms, missing one review of Bài 3 months later would un-finish the
     * lesson and march the course back to it — which is exactly the "why am I
     * being sent to redo old lessons" complaint. `syncLessonCompletion` below
     * turns a demonstrated lesson into a stored one so the fact is kept.
     */
    complete: markedComplete || checkpointPassed || demonstrated,
  };
}

/**
 * Lessons finished by demonstration but not yet written down. The app
 * dispatches `complete-lesson` for each so the achievement is permanent and a
 * later wobble in review cannot undo it.
 */
export function lessonsToMarkComplete(state: AppState): Lesson[] {
  return lessons.filter((l) => {
    const st = lessonStatus(state, l);
    return st.demonstrated && !st.markedComplete;
  });
}

export const isLessonComplete = (state: AppState, lesson: Lesson): boolean => lessonStatus(state, lesson).complete;

/**
 * THE next lesson: the earliest one that is not finished yet.
 *
 * `null` means the course is done — every available lesson is complete — and
 * the daily plan may switch to a review-and-consolidation shape.
 */
export function nextLesson(state: AppState): Lesson | null {
  const ordered = [...lessons].sort((a, b) => a.number - b.number);
  return ordered.find((l) => !isLessonComplete(state, l)) ?? null;
}

/** Every finished lesson, earliest first. */
export function completedLessons(state: AppState): Lesson[] {
  return [...lessons].sort((a, b) => a.number - b.number).filter((l) => isLessonComplete(state, l));
}

/**
 * Lessons whose material may appear in review: everything completed, plus the
 * one currently being learned. Deliberately NOT "everything ever opened".
 */
export function studiedLessons(state: AppState): Lesson[] {
  const next = nextLesson(state);
  const done = completedLessons(state);
  if (!next) return done;
  return done.some((l) => l.id === next.id) ? done : [...done, next];
}

/** Numbers of the completed lessons — the set the pages render badges from. */
export function completedLessonNumbers(state: AppState): Set<number> {
  return new Set(completedLessons(state).map((l) => l.number));
}

export interface CourseProgress {
  next: Lesson | null;
  completed: number;
  total: number;
  courseComplete: boolean;
}

export function courseProgress(state: AppState): CourseProgress {
  const next = nextLesson(state);
  return { next, completed: completedLessons(state).length, total: lessons.length, courseComplete: next === null };
}
