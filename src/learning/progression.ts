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
import { lessons, scenariosForLessons } from '../data/content';
import type { Lesson } from '../data/schema';
import { makeSrsId, type SrsKind } from './srs';
import { isMastered, MASTERY_SUCCESSES } from './targets';
import type { AppState } from './state';

/**
 * How thoroughly the current lesson must be learned before the course starts
 * introducing the next one.
 *
 * Two separate ideas, because collapsing them is what made the app either too
 * loose or unusable:
 *
 *   COVERAGE — has every required target been TAUGHT? Every one must have been
 *              attempted at least once. Nothing may still be unseen.
 *   MASTERY  — how much of it is actually learned, i.e. demonstrated three
 *              times in meaningful variants.
 *
 * Advancing needs full coverage AND `ADVANCE_MASTERY_SHARE` mastered. The
 * share is deliberately not 100 %: one stubborn word stuck at 2/3 must not
 * bar the rest of the course forever. At the size of these lessons (Bài 2 has
 * 18 targets) 0.9 leaves room for about two such targets and no more — they
 * stay in rotation as review until they finally land.
 *
 * The visible status "ukończona" is stricter still: see `complete` below.
 */
export const ADVANCE_MASTERY_SHARE = 0.9;

/** Checkpoint score that counts as passing. Kept for history/display only. */
export const CHECKPOINT_PASS = 0.8;

export interface LessonTarget {
  kind: SrsKind;
  ref: string;
}

/**
 * Everything a lesson is trying to teach, as scheduled abilities.
 *
 * The unit is the LEARNING TARGET, never the exercise id: several task shapes
 * assess one target and all of them count towards the same three
 * demonstrations. Duplicate examples that teach nothing new get no target.
 *
 * Previously this was vocabulary and grammar only, which quietly excluded the
 * communicative half of every lesson — a learner could be declared ready to
 * move on without ever having handled the dialogue or the scenarios. All four
 * kinds now count.
 */
export function lessonTargets(lesson: Lesson): LessonTarget[] {
  const out: LessonTarget[] = [
    ...lesson.vocabulary.filter((v) => v.srs && v.status !== 'flagged').map((v) => ({ kind: 'vocab-active' as SrsKind, ref: v.id })),
    ...lesson.grammar.map((g) => ({ kind: 'grammar' as SrsKind, ref: g.id })),
    ...scenariosForLessons([lesson.number]).map((sc) => ({ kind: 'sentence' as SrsKind, ref: sc.id })),
  ];
  for (const d of lesson.dialogues) {
    // Line 0 has no preceding turn to respond to, so it is not an ability.
    d.lines.forEach((line, i) => {
      if (i > 0 && line.status !== 'flagged') out.push({ kind: 'dialogue', ref: `${d.id}#${i}` });
    });
  }
  return out;
}

export interface LessonStatus {
  lesson: Lesson;
  /** Opened at least once. */
  viewed: boolean;
  /** Targets demonstrated three times and not currently shaky. */
  mastered: number;
  /** Targets attempted at least once — the coverage measure. */
  introduced: number;
  total: number;
  /** 0–100, mastered / total. What the lesson card shows. */
  percent: number;
  checkpointPassed: boolean;
  /** A `completed` flag from an older version. History only; gates nothing. */
  markedComplete: boolean;
  /** Every required target has been taught. */
  covered: boolean;
  /** FORMAL completion: 100 % of the required targets mastered. Nothing less. */
  complete: boolean;
  /** Whether the course frontier may move past this lesson. */
  readyToAdvance: boolean;
}

export function lessonStatus(state: AppState, lesson: Lesson): LessonStatus {
  const lp = state.lessons[lesson.id];
  const targets = lessonTargets(lesson);
  const items = targets.map((t) => state.srs[makeSrsId(t.kind, t.ref)]);
  const mastered = items.filter(isMastered).length;
  const introduced = items.filter((i) => (i?.successes ?? 0) + (i?.failures ?? 0) > 0).length;
  /*
   * Targets demonstrated three times at ANY point. `successes` only ever
   * increases — a failure raises `failures` and leaves it alone — so this is
   * monotonic, and it is what the advance rule is built on. Using the
   * weakness-aware `mastered` there instead would let a bad run of reviews in
   * Bài 1 drop it under the bar and march the course back to a lesson the
   * learner has already worked through.
   */
  const proved = items.filter((i) => (i?.successes ?? 0) >= MASTERY_SUCCESSES).length;
  const total = targets.length;
  const covered = total > 0 && introduced === total;
  return {
    lesson,
    viewed: !!lp?.visited,
    mastered,
    introduced,
    total,
    percent: total ? Math.round((mastered / total) * 100) : 0,
    checkpointPassed: (lp?.checkpoints ?? []).some((c) => c.total > 0 && c.score / c.total >= CHECKPOINT_PASS),
    markedComplete: !!lp?.completed,
    covered,
    /*
     * "ukończona" means the learner actually knows the lesson: every required
     * target mastered. An old manual flag or a passed checkpoint no longer
     * overrides this — mastery is the source of truth, so the badge and the
     * percentage can never disagree.
     */
    complete: total > 0 && mastered === total,
    // Teaching decision: taught in full, and all but a stubborn couple proved
    // at least once. Monotonic, so the course never walks backwards.
    readyToAdvance: covered && proved >= Math.ceil(total * ADVANCE_MASTERY_SHARE),
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
