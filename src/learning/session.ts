/**
 * Builds review / practice sessions from content + learner state.
 * A session is a list of items the ExerciseRunner can present:
 *  - vocab recall cards (VN→PL or PL→VN)
 *  - content exercises
 *  - generated exercise instances
 */
import type { Exercise } from '../data/schema';
import { allVocab, exerciseById, exercisesForGrammar, exercisesForLessons, lessonById, lessons, vocabById, type VocabEntry, type ExerciseEntry } from '../data/content';
import { generate, type GeneratedInstance } from './generators';
import { isDue, isWeak, makeSrsId, sortForReview, type SrsItem } from './srs';
import { unresolvedMistakes, type AppState, type Mistake } from './state';
import { sample, shuffle } from '../utilities/random';

export type SessionItem =
  | { kind: 'vocab'; direction: 'vi-pl' | 'pl-vi'; vocab: VocabEntry; srsId: string }
  | { kind: 'exercise'; exercise: Exercise; lesson: string; mistakeRef?: string }
  | { kind: 'generated'; instance: GeneratedInstance; lesson: string; mistakeRef?: string };

export type ReviewMode = 'today' | 'weak' | 'vocab' | 'grammar' | 'mistakes' | 'overdue';

export const REVIEW_MODES: { id: ReviewMode; label: string; description: string; icon: string }[] = [
  { id: 'today', label: 'Dzisiaj', description: 'Zaległe elementy, nowe słówka z bieżącej lekcji, dawne błędy i kilka zadań produktywnych.', icon: '🌅' },
  { id: 'weak', label: 'Słabe elementy', description: 'Słówka i struktury, które ostatnio sprawiały problemy.', icon: '🧩' },
  { id: 'vocab', label: 'Słownictwo', description: 'Powtórka słówek w obu kierunkach.', icon: '🗂' },
  { id: 'grammar', label: 'Gramatyka', description: 'Ćwiczenia powiązane ze strukturami gramatycznymi.', icon: '📐' },
  { id: 'mistakes', label: 'Moje błędy', description: 'Ćwicz ponownie zadania, w których popełniono błąd.', icon: '❌' },
  { id: 'overdue', label: 'Wszystkie zaległe', description: 'Wszystko, co jest po terminie – bez limitu.', icon: '📚' },
];

export function vocabSrsCandidates(): { vocab: VocabEntry; direction: 'vi-pl' | 'pl-vi'; srsId: string }[] {
  const out: { vocab: VocabEntry; direction: 'vi-pl' | 'pl-vi'; srsId: string }[] = [];
  for (const v of allVocab) {
    if (!v.srs || v.status === 'flagged') continue;
    out.push({ vocab: v, direction: 'vi-pl', srsId: makeSrsId('vocab-vi-pl', v.id) });
    out.push({ vocab: v, direction: 'pl-vi', srsId: makeSrsId('vocab-pl-vi', v.id) });
  }
  return out;
}

/** Highest lesson the learner has visited or completed; defaults to lesson 1. */
export function currentLesson(state: AppState): number {
  let best = 0;
  for (const [id, p] of Object.entries(state.lessons)) {
    const l = lessonById.get(id);
    if (!l) continue;
    if (p.completed || p.visited) best = Math.max(best, p.completed ? l.number + 1 : l.number);
  }
  const maxLesson = lessons.length ? Math.max(...lessons.map((l) => l.number)) : 1;
  return Math.max(1, Math.min(best || 1, maxLesson));
}

/** Lesson numbers the learner has already "unlocked" (visited, completed or before the current one). */
export function studiedLessonNumbers(state: AppState): number[] {
  const cur = currentLesson(state);
  return lessons.map((l) => l.number).filter((n) => n <= cur);
}

export function dueVocab(state: AppState, now = Date.now()): SrsItem[] {
  return sortForReview(
    Object.values(state.srs).filter((i) => (i.kind === 'vocab-vi-pl' || i.kind === 'vocab-pl-vi') && isDue(i, now) && vocabById.has(i.ref)),
    now,
  );
}

export function dueGrammar(state: AppState, now = Date.now()): SrsItem[] {
  return sortForReview(Object.values(state.srs).filter((i) => i.kind === 'grammar' && isDue(i, now)), now);
}

export function weakItems(state: AppState): SrsItem[] {
  return Object.values(state.srs).filter((i) => isWeak(i) && vocabById.has(i.ref) || (i.kind === 'grammar' && isWeak(i)));
}

/** New vocabulary (never reviewed) from studied lessons, current lesson first. */
export function newVocab(state: AppState, limit: number): { vocab: VocabEntry; direction: 'vi-pl' | 'pl-vi'; srsId: string }[] {
  const studied = new Set(studiedLessonNumbers(state));
  const cur = currentLesson(state);
  const cands = vocabSrsCandidates()
    .filter((c) => studied.has(c.vocab.lessonNumber) && !state.srs[c.srsId])
    .sort((a, b) => Math.abs(a.vocab.lessonNumber - cur) - Math.abs(b.vocab.lessonNumber - cur));
  // Introduce VN→PL first for a word, PL→VN once the recognition card exists.
  const out: typeof cands = [];
  const seenWord = new Set<string>();
  for (const c of cands) {
    if (out.length >= limit) break;
    if (c.direction === 'vi-pl' && !seenWord.has(c.vocab.id)) {
      out.push(c);
      seenWord.add(c.vocab.id);
    }
  }
  if (out.length < limit) {
    for (const c of cands) {
      if (out.length >= limit) break;
      if (c.direction === 'pl-vi' && state.srs[makeSrsId('vocab-vi-pl', c.vocab.id)]) out.push(c);
    }
  }
  return out;
}

function vocabItemFromSrs(i: SrsItem): SessionItem | null {
  const v = vocabById.get(i.ref);
  if (!v) return null;
  return { kind: 'vocab', direction: i.kind === 'vocab-vi-pl' ? 'vi-pl' : 'pl-vi', vocab: v, srsId: i.id };
}

function exerciseItem(e: ExerciseEntry, mistakeRef?: string): SessionItem {
  return { kind: 'exercise', exercise: e.exercise, lesson: e.ownerId, mistakeRef };
}

/** Turn a content exercise entry into session items (generators expand to instances). */
export function expandExercise(e: ExerciseEntry, count?: number, seed?: number): SessionItem[] {
  if (e.exercise.type === 'generator') {
    return generate(e.exercise.generator, e.exercise.params, count ?? e.exercise.count, seed).map((instance) => ({ kind: 'generated', instance, lesson: e.ownerId }));
  }
  return [exerciseItem(e)];
}

function mistakeItem(m: Mistake): SessionItem | null {
  if (m.refKind === 'vocab') {
    const v = vocabById.get(m.ref);
    if (!v) return null;
    return { kind: 'vocab', direction: 'pl-vi', vocab: v, srsId: makeSrsId('vocab-pl-vi', v.id) };
  }
  if (m.refKind === 'exercise') {
    const e = exerciseById.get(m.ref);
    if (!e) return null;
    return { ...exerciseItem(e, m.ref) };
  }
  // generated: regenerate a fresh instance of the same generator kind
  if (!m.generatorKind) return null;
  const gen = generate(m.generatorKind, {}, 1)[0];
  return gen ? { kind: 'generated', instance: gen, lesson: m.lesson, mistakeRef: m.ref } : null;
}

/** Grammar exercises for due/weak grammar points, or fallback to studied lessons. */
function grammarItems(state: AppState, limit: number, now = Date.now()): SessionItem[] {
  const due = dueGrammar(state, now).map((i) => i.ref);
  const studied = studiedLessonNumbers(state);
  const pool: ExerciseEntry[] = [];
  for (const gid of due) pool.push(...exercisesForGrammar(gid));
  if (pool.length < limit) {
    const extra = exercisesForLessons(studied).filter((e) => e.exercise.grammar.length > 0 && e.exercise.status !== 'flagged' && e.exercise.type !== 'open-answer');
    pool.push(...sample(extra, limit * 2));
  }
  const unique = new Map(pool.map((e) => [e.exercise.id, e]));
  return sample(Array.from(unique.values()), limit).flatMap((e) => expandExercise(e, 1));
}

function productiveItems(state: AppState, limit: number): SessionItem[] {
  const studied = studiedLessonNumbers(state);
  const recent = studied.slice(-3);
  const pool = exercisesForLessons(recent).filter((e) => e.exercise.status !== 'flagged' && (e.exercise.type === 'generator' || e.exercise.type === 'typed' || e.exercise.type === 'ordering' || e.exercise.type === 'error-correction' || e.exercise.type === 'diacritics'));
  return sample(pool, limit).flatMap((e) => expandExercise(e, 1));
}

export interface SessionPlan {
  mode: ReviewMode;
  items: SessionItem[];
  summary: { due: number; new: number; mistakes: number; grammar: number; productive: number };
}

export function buildSession(state: AppState, mode: ReviewMode, now = Date.now()): SessionPlan {
  const { dailyNewLimit, dailyReviewLimit } = state.settings;
  const summary = { due: 0, new: 0, mistakes: 0, grammar: 0, productive: 0 };
  let items: SessionItem[] = [];

  switch (mode) {
    case 'today': {
      const due = dueVocab(state, now).slice(0, dailyReviewLimit).map(vocabItemFromSrs).filter((x): x is SessionItem => !!x);
      const fresh = newVocab(state, dailyNewLimit).map((c) => ({ kind: 'vocab', direction: c.direction, vocab: c.vocab, srsId: c.srsId }) as SessionItem);
      const mistakes = sample(unresolvedMistakes(state), 5).map(mistakeItem).filter((x): x is SessionItem => !!x);
      const grammar = grammarItems(state, 4, now);
      const productive = productiveItems(state, 3);
      summary.due = due.length;
      summary.new = fresh.length;
      summary.mistakes = mistakes.length;
      summary.grammar = grammar.length;
      summary.productive = productive.length;
      items = [...due, ...fresh, ...mistakes, ...grammar, ...productive];
      break;
    }
    case 'weak': {
      const weak = weakItems(state).map(vocabItemFromSrs).filter((x): x is SessionItem => !!x);
      const mistakes = unresolvedMistakes(state).slice(0, 10).map(mistakeItem).filter((x): x is SessionItem => !!x);
      summary.due = weak.length;
      summary.mistakes = mistakes.length;
      items = [...weak, ...mistakes];
      break;
    }
    case 'vocab': {
      const due = dueVocab(state, now).map(vocabItemFromSrs).filter((x): x is SessionItem => !!x);
      const fresh = newVocab(state, dailyNewLimit).map((c) => ({ kind: 'vocab', direction: c.direction, vocab: c.vocab, srsId: c.srsId }) as SessionItem);
      summary.due = due.length;
      summary.new = fresh.length;
      items = [...due, ...fresh];
      if (items.length === 0) {
        // Nothing due: practise a random sample of studied vocabulary.
        const studied = new Set(studiedLessonNumbers(state));
        items = sample(vocabSrsCandidates().filter((c) => studied.has(c.vocab.lessonNumber)), 15).map((c) => ({ kind: 'vocab', direction: c.direction, vocab: c.vocab, srsId: c.srsId }) as SessionItem);
      }
      break;
    }
    case 'grammar': {
      items = grammarItems(state, 10, now);
      summary.grammar = items.length;
      break;
    }
    case 'mistakes': {
      items = unresolvedMistakes(state).map(mistakeItem).filter((x): x is SessionItem => !!x);
      summary.mistakes = items.length;
      break;
    }
    case 'overdue': {
      items = [...dueVocab(state, now), ...dueGrammar(state, now)].map(vocabItemFromSrs).filter((x): x is SessionItem => !!x);
      summary.due = items.length;
      break;
    }
  }
  // Interleave: shuffle but keep due vocab reasonably spread.
  return { mode, items: mode === 'mistakes' ? items : shuffle(items), summary };
}

/** Counts shown on the dashboard. */
export function dashboardCounts(state: AppState, now = Date.now()) {
  const due = dueVocab(state, now).length + dueGrammar(state, now).length;
  const weak = weakItems(state).length;
  const mistakes = unresolvedMistakes(state).length;
  const fresh = newVocab(state, state.settings.dailyNewLimit).length;
  return { due, weak, mistakes, fresh };
}
