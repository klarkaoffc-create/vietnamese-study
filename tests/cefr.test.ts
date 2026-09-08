import { describe, expect, it } from 'vitest';
import {
  CEFR_CAPABILITIES,
  courseCoverage,
  courseIndex,
  estimateCefr,
  type CanDoCapability,
  type CourseIndex,
} from '../src/learning/cefr';
import { initialState, reducer, type AppState } from '../src/learning/state';
import { allGrammar, allVocab, lessons, scenarios } from '../src/data/content';
import type { SrsGrade, SrsKind } from '../src/learning/srs';
import { DAY_MS } from '../src/utilities/dates';

const T0 = Date.UTC(2026, 8, 7, 10, 0, 0);

/** Drive one ability through N reviews spaced far enough apart to mature. */
function practise(state: AppState, kind: SrsKind, ref: string, lesson: string, times: number, grade: SrsGrade = 2): AppState {
  let s = state;
  for (let i = 0; i < times; i++) {
    s = reducer(s, { type: 'review', kind, ref, lesson, grade, now: T0 + i * 30 * DAY_MS });
  }
  return s;
}

const vocabOfLesson = (lessonId: string) => allVocab.filter((v) => v.lessonId === lessonId && v.srs && v.status !== 'flagged').map((v) => v.id);
const grammarOfLesson = (lessonId: string) => allGrammar.filter((g) => g.lessonId === lessonId).map((g) => g.id);
const scenariosOfLesson = (lessonId: string) => scenarios.filter((s) => s.lesson === lessonId).map((s) => s.id);

/**
 * A learner who has genuinely worked through every lesson of the current
 * course: every word produced, every structure used, every scenario done,
 * every dialogue line answered — repeatedly, to full automaticity.
 */
function masteredWholeCourse(): AppState {
  let s = initialState(T0);
  for (const l of lessons) {
    for (const ref of vocabOfLesson(l.id)) s = practise(s, 'vocab-active', ref, l.id, 6);
    for (const ref of grammarOfLesson(l.id)) s = practise(s, 'grammar', ref, l.id, 6);
    for (const ref of scenariosOfLesson(l.id)) s = practise(s, 'sentence', ref, l.id, 6);
    for (const d of l.dialogues) for (let i = 0; i < d.lines.length; i++) s = practise(s, 'dialogue', `${d.id}#${i}`, l.id, 6);
  }
  return s;
}

describe('minimum evidence', () => {
  it('refuses to name a level when the app has barely been used', () => {
    let s = initialState(T0);
    s = practise(s, 'vocab-active', 'v-bai-01-xin-chao', 'bai-01', 1);
    s = practise(s, 'sentence', 's-bai-01-greet-elder', 'bai-01', 1);
    const est = estimateCefr(s);
    expect(est.sufficientEvidence).toBe(false);
    expect(est.level).toBe('pre-A1');
    expect(est.confidence).toBe('low');
  });

  it('needs repeated retrieval, not a run of one-time successes', () => {
    // Twenty different abilities, each answered exactly once: plenty of
    // graded attempts, but nothing has been retrieved twice.
    let s = initialState(T0);
    for (const ref of vocabOfLesson('bai-03').slice(0, 20)) s = practise(s, 'vocab-active', ref, 'bai-03', 1);
    const est = estimateCefr(s);
    expect(est.evidence.gradedProduction).toBeGreaterThanOrEqual(20);
    expect(est.evidence.repeatedItems).toBe(0);
    expect(est.sufficientEvidence).toBe(false);
    expect(est.level).toBe('pre-A1');
  });

  it('needs more than one kind of skill', () => {
    let s = initialState(T0);
    for (const ref of vocabOfLesson('bai-03').slice(0, 12)) s = practise(s, 'vocab-active', ref, 'bai-03', 3);
    const est = estimateCefr(s);
    expect(est.evidence.skillAreas).toBe(1);
    expect(est.sufficientEvidence).toBe(false);
  });
});

describe('passive knowledge cannot buy a level', () => {
  it('stays at pre-A1 on recognition alone, however much of it there is', () => {
    let s = initialState(T0);
    for (const l of lessons) for (const ref of vocabOfLesson(l.id)) s = practise(s, 'vocab-passive', ref, l.id, 6);
    const est = estimateCefr(s);
    expect(est.evidence.components.find((c) => c.id === 'comprehension')!.percent).toBeGreaterThan(70);
    expect(est.evidence.production).toBe(0);
    expect(est.level).toBe('pre-A1');
    expect(est.sufficientEvidence).toBe(false);
  });

  it('keeps the score pinned to production even with perfect comprehension', () => {
    let s = masteredWholeCourse();
    const strong = estimateCefr(s);
    // Same learner, but only ever recognised the vocabulary.
    let passiveOnly = initialState(T0);
    for (const l of lessons) for (const ref of vocabOfLesson(l.id)) passiveOnly = practise(passiveOnly, 'vocab-passive', ref, l.id, 6);
    const weak = estimateCefr(passiveOnly);
    expect(weak.score).toBeLessThan(strong.score);
    expect(weak.score).toBeLessThanOrEqual(weak.evidence.production + 8);
  });
});

describe('demonstrated production earns A1', () => {
  it('reaches A1 once the beginner can-do abilities are actually demonstrated', () => {
    const est = estimateCefr(masteredWholeCourse());
    expect(est.sufficientEvidence).toBe(true);
    expect(est.level).toBe('A1');
    expect(est.stage).toBe('strong');
    expect(est.confidence).not.toBe('low');
    expect(est.evidence.canDoDemonstrated).toBeGreaterThanOrEqual(Math.ceil(est.evidence.canDoAvailable * 0.8));
  });

  it('ranks strong production above strong recognition', () => {
    let recogniser = initialState(T0);
    for (const l of lessons) {
      for (const ref of vocabOfLesson(l.id)) recogniser = practise(recogniser, 'vocab-passive', ref, l.id, 6);
      // A little production, but always shaky (grade 1 keeps automaticity low).
      for (const ref of vocabOfLesson(l.id).slice(0, 3)) recogniser = practise(recogniser, 'vocab-active', ref, l.id, 3, 1);
      for (const ref of grammarOfLesson(l.id).slice(0, 1)) recogniser = practise(recogniser, 'grammar', ref, l.id, 3, 1);
    }
    const weak = estimateCefr(recogniser);
    const strong = estimateCefr(masteredWholeCourse());
    expect(weak.score).toBeLessThan(strong.score);
    expect(weak.evidence.production).toBeLessThan(strong.evidence.production);
    expect(weak.level).toBe('pre-A1');
  });
});

describe('course ceiling', () => {
  it('caps Bài 1–12 at A1 — full mastery is strong A1, never A2', () => {
    expect(courseCoverage(CEFR_CAPABILITIES, courseIndex())).toBe('A1');
    const est = estimateCefr(masteredWholeCourse());
    expect(est.ceiling).toBe('A1');
    expect(est.level).toBe('A1');
    expect(est.atCourseCeiling).toBe(true);
    // The raw score is high enough for A2's threshold; only the ceiling stops it.
    expect(est.score).toBeGreaterThanOrEqual(60);
  });

  it('offers no A2 can-do abilities from the current content', () => {
    const available = CEFR_CAPABILITIES.filter((c) => c.level === 'A2');
    expect(available).toHaveLength(0);
  });

  it('lifts to A2 when future lessons add A2 can-do abilities', () => {
    // Model a bigger course: the same content plus eight A2 abilities whose
    // lessons and grammar exist. Nothing about the Progress page changes.
    const base = courseIndex();
    const extraLessons = Array.from({ length: 8 }, (_, i) => `bai-${13 + i}`);
    const future: CourseIndex = {
      ...base,
      lessonIds: new Set([...base.lessonIds, ...extraLessons]),
      grammarIds: new Set([...base.grammarIds, ...extraLessons.map((l) => `g-${l}-a2`)]),
      vocabByLesson: new Map(base.vocabByLesson),
    };
    const a2: CanDoCapability[] = extraLessons.map((l) => ({
      id: `a2-${l}`,
      label: `umiejętność A2 z ${l}`,
      level: 'A2',
      lessons: [l],
      grammar: [`g-${l}-a2`],
      scenarios: [],
    }));
    const capabilities = [...CEFR_CAPABILITIES, ...a2];
    expect(courseCoverage(capabilities, future)).toBe('A2');

    // A learner who mastered the current course but none of the new material
    // is now A1 with headroom, not A2: the A2 abilities are undemonstrated.
    const est = estimateCefr(masteredWholeCourse(), { capabilities, course: future });
    expect(est.ceiling).toBe('A2');
    expect(est.level).toBe('A1');

    // Demonstrate the A2 abilities too and the level follows.
    let s = masteredWholeCourse();
    for (const l of extraLessons) s = practise(s, 'grammar', `g-${l}-a2`, l, 6);
    const advanced = estimateCefr(s, { capabilities, course: future });
    expect(advanced.level).toBe('A2');
  });
});

describe('the estimate is read-only', () => {
  it('does not mutate the state it is given', () => {
    const s = masteredWholeCourse();
    const before = JSON.stringify(s);
    estimateCefr(s);
    estimateCefr(s, { capabilities: CEFR_CAPABILITIES, course: courseIndex() });
    expect(JSON.stringify(s)).toBe(before);
  });

  it('is stable across repeated calls', () => {
    const s = masteredWholeCourse();
    expect(estimateCefr(s)).toEqual(estimateCefr(s));
  });
});

describe('evidence reported to the learner', () => {
  it('names weak areas rather than counting missing words', () => {
    let s = initialState(T0);
    for (const l of lessons.slice(0, 4)) {
      for (const ref of vocabOfLesson(l.id)) s = practise(s, 'vocab-active', ref, l.id, 4);
      for (const ref of grammarOfLesson(l.id)) s = practise(s, 'grammar', ref, l.id, 4);
    }
    const est = estimateCefr(s);
    expect(est.evidence.gaps.length).toBeGreaterThan(0);
    for (const g of est.evidence.gaps) {
      expect(g).not.toMatch(/\d/); // never "143 more words"
    }
    // Dialogue and sentence work is untouched, so it should be called out.
    expect(est.evidence.gaps).toContain('odpowiedzi dialogowych');
  });

  it('reports every weighted component with weights summing to one', () => {
    const est = estimateCefr(masteredWholeCourse());
    expect(est.evidence.components.map((c) => c.id)).toEqual([
      'active-vocab',
      'sentences',
      'grammar',
      'dialogue',
      'comprehension',
      'automaticity',
    ]);
    const total = est.evidence.components.reduce((a, c) => a + c.weight, 0);
    expect(total).toBeCloseTo(1, 6);
  });

  it('leaves listening out of comprehension until real audio exists', () => {
    const est = estimateCefr(masteredWholeCourse());
    expect(est.evidence.listeningCounted).toBe(false);
  });
});
