import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LessonSchema, ReviewSchema, ExamBlueprintSchema, ExerciseSchema } from '../src/data/schema';
import { computeBlocks } from '../src/learning/blocks';

const root = join(__dirname, '..', 'content');
const lessonFiles = readdirSync(join(root, 'lessons')).filter((f) => f.endsWith('.json')).sort();

describe('lesson discovery', () => {
  it('finds every lesson file and they parse', () => {
    expect(lessonFiles.length).toBeGreaterThanOrEqual(11);
    const numbers: number[] = [];
    for (const f of lessonFiles) {
      const raw = JSON.parse(readFileSync(join(root, 'lessons', f), 'utf8'));
      const r = LessonSchema.safeParse(raw);
      expect(r.success, `${f}: ${r.success ? '' : r.error.message}`).toBe(true);
      if (r.success) {
        expect(f).toBe(`${r.data.id}.json`);
        numbers.push(r.data.number);
      }
    }
    expect(numbers).toEqual(numbers.map((_, i) => i + 1));
  });
  it('derives blocks from the discovered lessons', () => {
    const numbers = lessonFiles.map((f) => Number(f.match(/(\d+)/)![1]));
    const blocks = computeBlocks(numbers);
    expect(blocks[0].complete).toBe(true);
    expect(blocks[1].complete).toBe(true);
    // Block 3 (Bài 11–15) stays incomplete until Bài 15 exists, so no review
    // or exam is generated for it.
    expect(blocks[2].lessons).toEqual([11, 12]);
    expect(blocks[2].complete).toBe(false);
    expect(blocks[2].reviewId).toBeUndefined();
    expect(blocks[2].examId).toBeUndefined();
  });
  it('has unique ids across all content', () => {
    const ids = new Set<string>();
    const add = (id: string) => {
      expect(ids.has(id), `duplicate ${id}`).toBe(false);
      ids.add(id);
    };
    for (const f of lessonFiles) {
      const l = LessonSchema.parse(JSON.parse(readFileSync(join(root, 'lessons', f), 'utf8')));
      add(l.id);
      l.vocabulary.forEach((v) => add(v.id));
      l.grammar.forEach((g) => add(g.id));
      l.exercises.forEach((e) => add(e.id));
      l.dialogues.forEach((d) => add(d.id));
      l.readings.forEach((r) => add(r.id));
    }
    for (const f of readdirSync(join(root, 'reviews'))) {
      const r = ReviewSchema.parse(JSON.parse(readFileSync(join(root, 'reviews', f), 'utf8')));
      add(r.id);
      r.exercises.forEach((e) => add(e.id));
    }
    for (const f of readdirSync(join(root, 'exams'))) {
      const e = ExamBlueprintSchema.parse(JSON.parse(readFileSync(join(root, 'exams', f), 'utf8')));
      add(e.id);
    }
  });
});

describe('schema validation', () => {
  it('rejects malformed lesson ids and missing fields', () => {
    expect(LessonSchema.safeParse({ id: 'lesson-1', number: 1 }).success).toBe(false);
    expect(LessonSchema.safeParse({ id: 'bai-1', number: 1 }).success).toBe(false);
  });
  it('rejects exercises without answers', () => {
    expect(ExerciseSchema.safeParse({ id: 'e-bai-01-x', type: 'typed', skill: 'vocabulary', source: 'generated', prompt: 'p', answerLang: 'vi', answers: [] }).success).toBe(false);
    expect(ExerciseSchema.safeParse({ id: 'e-bai-01-x', type: 'fill-blank', skill: 'vocabulary', source: 'generated', sentence: 'no blank here', answers: ['a'] }).success).toBe(false);
    expect(ExerciseSchema.safeParse({ id: 'e-bai-01-x', type: 'mcq', skill: 'vocabulary', source: 'generated', prompt: 'p', options: ['a'], answer: 0 }).success).toBe(false);
  });
  it('applies defaults', () => {
    const r = ExerciseSchema.parse({ id: 'e-bai-01-x', type: 'typed', skill: 'vocabulary', source: 'generated', prompt: 'p', answerLang: 'vi', answers: ['a'] });
    expect(r.status).toBe('verified');
    expect(r.grammar).toEqual([]);
    expect(r.level).toBe(1);
  });
});
