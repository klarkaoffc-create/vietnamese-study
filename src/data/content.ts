/**
 * Content loading and indexing.
 *
 * All lessons, reviews and exam blueprints are discovered automatically from
 * `content/` with Vite's `import.meta.glob`. Nothing here is hard-coded per
 * lesson: adding `content/lessons/bai-12.json` is enough for the lesson to
 * appear in navigation, blocks, vocabulary, grammar and exams.
 */
import {
  LessonSchema,
  ReviewSchema,
  ExamBlueprintSchema,
  AudioManifestSchema,
  type Lesson,
  type Review,
  type ExamBlueprint,
  type Exercise,
  type VocabItem,
  type GrammarPoint,
  type Dialogue,
  type Reading,
  type AudioClip,
} from './schema';
import { computeBlocks, type Block } from '../learning/blocks';

const lessonModules = import.meta.glob('../../content/lessons/*.json', { eager: true, import: 'default' }) as Record<string, unknown>;
const reviewModules = import.meta.glob('../../content/reviews/*.json', { eager: true, import: 'default' }) as Record<string, unknown>;
const examModules = import.meta.glob('../../content/exams/*.json', { eager: true, import: 'default' }) as Record<string, unknown>;
const audioModules = import.meta.glob('../../content/audio/manifest.json', { eager: true, import: 'default' }) as Record<string, unknown>;

function parseAll<T>(modules: Record<string, unknown>, parse: (raw: unknown, file: string) => T): T[] {
  return Object.entries(modules).map(([file, raw]) => parse(raw, file));
}

export const lessons: Lesson[] = parseAll(lessonModules, (raw, file) => {
  const r = LessonSchema.safeParse(raw);
  if (!r.success) throw new Error(`Invalid lesson ${file}: ${r.error.message}`);
  return r.data;
}).sort((a, b) => a.number - b.number);

export const reviews: Review[] = parseAll(reviewModules, (raw, file) => {
  const r = ReviewSchema.safeParse(raw);
  if (!r.success) throw new Error(`Invalid review ${file}: ${r.error.message}`);
  return r.data;
}).sort((a, b) => a.fromLesson - b.fromLesson);

export const examBlueprints: ExamBlueprint[] = parseAll(examModules, (raw, file) => {
  const r = ExamBlueprintSchema.safeParse(raw);
  if (!r.success) throw new Error(`Invalid exam ${file}: ${r.error.message}`);
  return r.data;
}).sort((a, b) => a.block - b.block);

export const audioClips: AudioClip[] = parseAll(audioModules, (raw, file) => {
  const r = AudioManifestSchema.safeParse(raw);
  if (!r.success) throw new Error(`Invalid audio manifest ${file}: ${r.error.message}`);
  return r.data.clips;
}).flat();

/* ----------------------------------------------------------------------- */
/* Indexes                                                                   */
/* ----------------------------------------------------------------------- */

export const lessonById = new Map<string, Lesson>(lessons.map((l) => [l.id, l]));
export const lessonByNumber = new Map<number, Lesson>(lessons.map((l) => [l.number, l]));

export interface VocabEntry extends VocabItem {
  lessonId: string;
  lessonNumber: number;
}
export interface GrammarEntry extends GrammarPoint {
  lessonId: string;
  lessonNumber: number;
}
export interface DialogueEntry extends Dialogue {
  lessonId: string;
  lessonNumber: number;
}
export interface ReadingEntry extends Reading {
  /** Lesson id or review id the reading belongs to. */
  ownerId: string;
  lessonNumber: number;
}
export interface ExerciseEntry {
  exercise: Exercise;
  /** Lesson id, review id or exam id the exercise belongs to. */
  ownerId: string;
  /** Lesson number the exercise is attributed to (reviews use their last lesson). */
  lessonNumber: number;
  ownerKind: 'lesson' | 'review' | 'exam';
}

export const allVocab: VocabEntry[] = lessons.flatMap((l) => l.vocabulary.map((v) => ({ ...v, lessonId: l.id, lessonNumber: l.number })));
export const vocabById = new Map<string, VocabEntry>(allVocab.map((v) => [v.id, v]));

export const allGrammar: GrammarEntry[] = lessons.flatMap((l) => l.grammar.map((g) => ({ ...g, lessonId: l.id, lessonNumber: l.number })));
export const grammarById = new Map<string, GrammarEntry>(allGrammar.map((g) => [g.id, g]));

export const allDialogues: DialogueEntry[] = lessons.flatMap((l) => l.dialogues.map((d) => ({ ...d, lessonId: l.id, lessonNumber: l.number })));
export const dialogueById = new Map<string, DialogueEntry>(allDialogues.map((d) => [d.id, d]));

export const allReadings: ReadingEntry[] = [
  ...lessons.flatMap((l) => l.readings.map((r) => ({ ...r, ownerId: l.id, lessonNumber: l.number }))),
  ...reviews.flatMap((rv) => rv.readings.map((r) => ({ ...r, ownerId: rv.id, lessonNumber: rv.toLesson }))),
];
export const readingById = new Map<string, ReadingEntry>(allReadings.map((r) => [r.id, r]));

export const allExercises: ExerciseEntry[] = [
  ...lessons.flatMap((l) => l.exercises.map((e) => ({ exercise: e, ownerId: l.id, lessonNumber: l.number, ownerKind: 'lesson' as const }))),
  ...reviews.flatMap((rv) => rv.exercises.map((e) => ({ exercise: e, ownerId: rv.id, lessonNumber: rv.toLesson, ownerKind: 'review' as const }))),
  ...examBlueprints.flatMap((ex) => ex.exercises.map((e) => ({ exercise: e, ownerId: ex.id, lessonNumber: ex.block * 5, ownerKind: 'exam' as const }))),
];
export const exerciseById = new Map<string, ExerciseEntry>(allExercises.map((e) => [e.exercise.id, e]));

export const audioByTarget = new Map<string, AudioClip[]>();
for (const clip of audioClips) {
  const list = audioByTarget.get(clip.targetId) ?? [];
  list.push(clip);
  audioByTarget.set(clip.targetId, list);
}

/** Five-lesson blocks derived from the lessons that exist. */
export const blocks: Block[] = computeBlocks(
  lessons.map((l) => l.number),
  reviews.map((r) => ({ id: r.id, fromLesson: r.fromLesson, toLesson: r.toLesson })),
  examBlueprints.map((e) => ({ id: e.id, block: e.block })),
);

export function lessonsInBlock(block: Block): Lesson[] {
  return lessons.filter((l) => l.number >= block.fromLesson && l.number <= block.toLesson);
}

export function exercisesForLessons(lessonNumbers: number[]): ExerciseEntry[] {
  const set = new Set(lessonNumbers);
  return allExercises.filter((e) => e.ownerKind === 'lesson' && set.has(e.lessonNumber));
}

/** Exercises that practise a grammar point, either declared on the point or referencing it. */
export function exercisesForGrammar(grammarId: string): ExerciseEntry[] {
  const g = grammarById.get(grammarId);
  const declared = new Set(g?.practice ?? []);
  return allExercises.filter((e) => declared.has(e.exercise.id) || e.exercise.grammar.includes(grammarId));
}

export function exercisesForVocab(vocabId: string): ExerciseEntry[] {
  return allExercises.filter((e) => e.exercise.vocab.includes(vocabId));
}

export function lessonLabel(n: number): string {
  return `Bài ${n}`;
}
