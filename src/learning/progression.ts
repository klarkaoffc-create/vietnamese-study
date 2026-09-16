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
import { isMastered, MASTERY_SUCCESSES } from './targets';
import type { AppState } from './state';

/**
 * Share of a lesson's targets that must have been demonstrated before the
 * course frontier moves past it. This governs WHAT TO TEACH NEXT only — it has
 * never been, and must not be, a claim that the lesson was finished.
 */
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
  /** Targets currently at three demonstrations and not shaky — shown to the learner. */
  mastered: number;
  total: number;
  checkpointPassed: boolean;
  /** Explicitly finished — the manual toggle, or a checkpoint that set the flag. */
  markedComplete: boolean;
  /** Enough targets have EVER been demonstrated for the course to move on. */
  demonstrated: boolean;
  /**
   * FORMAL completion — what "ukończona" and the "ukończone lekcje" count
   * mean. Explicit evidence only.
   */
  complete: boolean;
  /**
   * Whether the course frontier may move past this lesson. A superset of
   * `complete`: practising a lesson thoroughly is reason enough to start
   * introducing the next one, but it is NOT reason to tell the learner they
   * finished it.
   */
  readyToAdvance: boolean;
}

/**
 * Has this target ever been demonstrated three times?
 *
 * `successes` only ever increases — a failure raises `failures` and leaves it
 * alone — so this is monotonic, which is what keeps the frontier from walking
 * backwards after a shaky review. `isMastered` is the stricter, weakness-aware
 * test and stays in charge of what still gets drilled.
 */
const everDemonstrated = (item: { successes: number } | undefined): boolean => (item?.successes ?? 0) >= MASTERY_SUCCESSES;

export function lessonStatus(state: AppState, lesson: Lesson): LessonStatus {
  const lp = state.lessons[lesson.id];
  const targets = lessonTargets(lesson);
  const mastered = targets.filter((t) => isMastered(state.srs[makeSrsId(t.kind, t.ref)])).length;
  const proved = targets.filter((t) => everDemonstrated(state.srs[makeSrsId(t.kind, t.ref)])).length;
  const checkpointPassed = (lp?.checkpoints ?? []).some((c) => c.total > 0 && c.score / c.total >= CHECKPOINT_PASS);
  const markedComplete = !!lp?.completed;
  const demonstrated = targets.length > 0 && proved >= Math.ceil(targets.length * LESSON_TARGET_SHARE);
  return {
    lesson,
    viewed: !!lp?.visited,
    mastered,
    total: targets.length,
    checkpointPassed,
    markedComplete,
    demonstrated,
    /*
     * FORMAL completion needs real completion evidence, and nothing else.
     * Inferring it from "80 % of the targets happen to be mastered" told the
     * learner they had finished Bài 2 after a few ordinary review sessions —
     * a small lesson needs only 10 of its 12 targets — which is not the same
     * claim at all. Both terms here are historical facts, so this can never
     * go backwards.
     */
    complete: markedComplete || checkpointPassed,
    // Teaching decision, not an achievement: practising a lesson thoroughly is
    // reason enough to start introducing the next one.
    readyToAdvance: markedComplete || checkpointPassed || demonstrated,
  };
}

/** FORMAL completion — the definition behind "ukończone lekcje". */
export const isLessonComplete = (state: AppState, lesson: Lesson): boolean => lessonStatus(state, lesson).complete;

/** Whether the course frontier may move past this lesson. */
export const lessonReadyToAdvance = (state: AppState, lesson: Lesson): boolean => lessonStatus(state, lesson).readyToAdvance;

/**
 * THE next lesson: the earliest one that is not finished yet.
 *
 * `null` means the course is done — every available lesson is complete — and
 * the daily plan may switch to a review-and-consolidation shape.
 */
export function nextLesson(state: AppState): Lesson | null {
  const ordered = [...lessons].sort((a, b) => a.number - b.number);
  // Frontier question, so it asks `readyToAdvance` — a thoroughly practised
  // lesson stops supplying new material even if it was never formally closed.
  return ordered.find((l) => !lessonReadyToAdvance(state, l)) ?? null;
}

/** Every FORMALLY completed lesson, earliest first. */
export function completedLessons(state: AppState): Lesson[] {
  return [...lessons].sort((a, b) => a.number - b.number).filter((l) => isLessonComplete(state, l));
}

/**
 * Lessons whose material may appear in review: everything completed, plus the
 * one currently being learned. Deliberately NOT "everything ever opened".
 */
export function studiedLessons(state: AppState): Lesson[] {
  const next = nextLesson(state);
  // Everything the frontier has moved past, plus the lesson in hand. Uses the
  // advance rule, not formal completion, so review pools are unchanged.
  const done = [...lessons].sort((a, b) => a.number - b.number).filter((l) => lessonReadyToAdvance(state, l));
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
