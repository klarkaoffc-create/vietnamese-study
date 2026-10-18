/**
 * The learning changes this release is about:
 *
 *  - long sentences are built up in meaningful pieces, with support that is
 *    withdrawn level by level, and later checked on a NEW sentence with the
 *    same structure;
 *  - tone mistakes are remembered per syllable and practised in whole
 *    sentences;
 *  - material that keeps failing comes back sooner.
 */
import { describe, expect, it } from 'vitest';
import { allGrammar, dialogueById, grammarById, lessons } from '../src/data/content';
import { dialogueTask, grammarTask, isChunked, transferExamples } from '../src/learning/tasks';
import { gradeExercise, toneSlipsOf } from '../src/learning/grading';
import { actionsForTask, toneActions } from '../src/learning/record';
import { buildSession, toneTasks, troubleSyllables } from '../src/learning/session';
import { poolsFor } from '../src/learning/tasks';
import { initialState, reducer } from '../src/learning/state';
import { DIFFICULT_MAX_DAYS, isDifficult, newSrsItem, schedule } from '../src/learning/srs';
import { chunksRebuild } from '../src/utilities/chunks';
import { findAnswerLeaks } from '../src/learning/answers';
import { DAY_MS } from '../src/utilities/dates';
import type { Exercise } from '../src/data/schema';

const neuThi = grammarById.get('g-bai-13-neu-thi')!;
const shop = dialogueById.get('d-bai-14-shop')!;

describe('authored sentence pieces', () => {
  it('rebuild their sentence exactly, everywhere in the course', () => {
    let n = 0;
    for (const l of lessons) {
      const all = [
        ...l.vocabulary.flatMap((v) => v.examples),
        ...l.grammar.flatMap((g) => [...g.examples, ...g.transfer]),
        ...l.dialogues.flatMap((d) => d.lines),
      ];
      for (const s of all) {
        if (!s.chunks) continue;
        n++;
        expect(chunksRebuild(s.vi, s.chunks), s.vi).toBe(true);
      }
    }
    expect(n).toBeGreaterThan(40);
  });

  it('transfer sentences are never presented as teacher-verified', () => {
    for (const g of allGrammar) for (const t of g.transfer) expect(t.status, t.vi).not.toBe('verified');
  });
});

describe('a long sentence is built up in stages', () => {
  it('level 1: assemble the pieces, knowing what each one means', () => {
    const t = grammarTask(neuThi, 1)!;
    expect(t.exercise.type).toBe('ordering');
    if (t.exercise.type === 'ordering') {
      const chunks = t.sentence!.chunks!;
      expect(t.exercise.tokens).toEqual(chunks.map((c) => c.vi));
      for (const c of chunks) expect(t.exercise.instruction).toContain(`${c.vi} = ${c.pl}`);
      // The meanings are listed out of sentence order, so they explain the
      // pieces without solving the task.
      const listed = chunks.map((c) => t.exercise.instruction!.indexOf(`${c.vi} =`));
      expect(listed).not.toEqual([...listed].sort((a, b) => a - b));
      expect(findAnswerLeaks(t.exercise)).toEqual([]);
    }
  });

  it('level 2: put the pieces in order, graded on the pieces', () => {
    const t = grammarTask(neuThi, 2)!;
    expect(t.exercise.type).toBe('ordering');
    if (t.exercise.type === 'ordering') {
      const chunks = t.sentence!.chunks!.map((c) => c.vi);
      expect(t.exercise.tokens).toEqual(chunks);
      expect(t.exercise.instruction).not.toContain(' = ');
      expect(gradeExercise(t.exercise, { kind: 'order', tokens: chunks }).outcome).toBe('correct');
      expect(gradeExercise(t.exercise, { kind: 'order', tokens: [...chunks].reverse() }).outcome).toBe('wrong');
    }
  });

  it('level 3: write it, with only the structure as support', () => {
    const t = grammarTask(neuThi, 3)!;
    expect(t.exercise.type).toBe('typed');
    if (t.exercise.type === 'typed') {
      expect(t.exercise.hint).toMatch(/^Kolejność:/);
      // The scaffold is Polish only: no Vietnamese piece is handed over.
      for (const c of t.sentence!.chunks!) expect(t.exercise.hint).not.toContain(c.vi);
      expect(findAnswerLeaks(t.exercise)).toEqual([]);
    }
  });

  it('level 4: the same structure in a new sentence, without hints', () => {
    const transfer = transferExamples(neuThi).map((s) => s.vi);
    expect(transfer.length).toBeGreaterThan(0);
    for (let i = 0; i < 10; i++) {
      const t = grammarTask(neuThi, 4)!;
      expect(t.exercise.type).toBe('typed');
      if (t.exercise.type === 'typed') {
        expect(transfer).toContain(t.exercise.answers[0]);
        expect(t.exercise.hint).toBeUndefined();
        expect(t.exercise.status).toBe('unverified');
      }
    }
  });

  it('short sentences stay simple', () => {
    const directions = grammarById.get('g-bai-12-directions')!;
    for (const level of [1, 2, 3] as const) {
      const t = grammarTask(directions, level)!;
      expect(t.sentence).toBeUndefined();
      expect(t.exercise.instruction ?? '').not.toContain('Złóż zdanie z fragmentów');
    }
  });

  it('dialogue replies: pieces first, then the structure hint, then nothing', () => {
    const line = 1; // "Chào em, chị thích cái đầm này. Có màu khác không?"
    expect(isChunked({ vi: shop.lines[line].vi, pl: '', chunks: shop.lines[line].chunks })).toBe(true);
    const l1 = dialogueTask(shop, line, 1)!;
    expect(l1.exercise.type).toBe('ordering');
    const l2 = dialogueTask(shop, line, 2)!;
    expect(l2.exercise.type === 'typed' && l2.exercise.hint).toMatch(/^Kolejność:/);
    const l3 = dialogueTask(shop, line, 3)!;
    expect(l3.exercise.type === 'typed' && l3.exercise.hint).toBeFalsy();
    for (const t of [l1, l2, l3]) expect(findAnswerLeaks(t.exercise)).toEqual([]);
  });
});

describe('tones', () => {
  it('finds exactly the syllables written with the wrong tone', () => {
    expect(toneSlipsOf('Toi o Ha Noi', 'Tôi ở Hà Nội')).toHaveLength(4);
    expect(toneSlipsOf('Tôi ơ Hà Nội', 'Tôi ở Hà Nội')).toEqual([{ expected: 'ở', given: 'ơ' }]);
    expect(toneSlipsOf('Tôi sống Hà Nội', 'Tôi ở Hà Nội')).toEqual([]);
  });

  it('records slips from typed answers only — picking an option proves nothing', () => {
    const typed: Exercise = { id: 'e-bai-07-x', type: 'typed', skill: 'grammar', source: 'generated', status: 'unverified', prompt: 'p', answerLang: 'vi', answers: ['Tôi ở Hà Nội.'], grammar: [], vocab: [], level: 2 };
    const r = gradeExercise(typed, { kind: 'text', value: 'Tôi ơ Hà Nội' });
    expect(r.outcome).toBe('tone');
    expect(toneActions(typed, r, 'Tôi ơ Hà Nội', 'bai-07')).toEqual([{ type: 'tone-slips', slips: [{ expected: 'ở', given: 'ơ' }], sentence: 'Tôi ở Hà Nội.', lesson: 'bai-07' }]);
    const mcq: Exercise = { id: 'e-bai-07-y', type: 'mcq', skill: 'grammar', source: 'generated', status: 'unverified', prompt: 'p', options: ['a', 'b'], answer: 0, grammar: [], vocab: [], level: 1 };
    expect(toneActions(mcq, gradeExercise(mcq, { kind: 'choice', index: 0 }), 'a', 'bai-07')).toEqual([]);
  });

  it('the daily tone task targets a syllable that slipped, in a sentence already met', () => {
    let s = initialState(0);
    for (let n = 1; n <= 7; n++) s = reducer(s, { type: 'visit-lesson', lesson: `bai-0${n}`, now: 1 });
    s = reducer(s, { type: 'tone-slips', slips: [{ expected: 'ở', given: 'ơ' }], sentence: 'Tôi ở Hà Nội.', lesson: 'bai-07', now: 2 });
    expect(troubleSyllables(s).map((r) => r.syllable)).toEqual(['ở']);
    const [item] = toneTasks(s, poolsFor([1, 2, 3, 4, 5, 6, 7]), 1);
    expect(item.kind).toBe('task');
    if (item.kind !== 'task') return;
    const ex = item.task.exercise;
    expect(ex.type).toBe('diacritics');
    if (ex.type === 'diacritics') expect(ex.answers[0].toLowerCase()).toContain('ở');
    expect(findAnswerLeaks(ex)).toEqual([]);
    // Untracked: a slip in it only updates the tone record.
    const result = gradeExercise(ex, { kind: 'text', value: ex.type === 'diacritics' ? ex.stripped : '' });
    const actions = actionsForTask(item, result, ex.type === 'diacritics' ? ex.stripped : '');
    expect(actions.every((a) => a.type === 'tone-slips' || a.type === 'tone-hits')).toBe(true);
  });

  it('a settled syllable is no longer singled out', () => {
    let s = initialState(0);
    s = reducer(s, { type: 'tone-slips', slips: [{ expected: 'ở', given: 'ơ' }], sentence: 'x', lesson: 'bai-07', now: 1 });
    s = reducer(s, { type: 'tone-hits', syllables: ['ở'], now: 2 });
    expect(troubleSyllables(s)).toHaveLength(1);
    s = reducer(s, { type: 'tone-hits', syllables: ['ở'], now: 3 });
    expect(troubleSyllables(s)).toHaveLength(0);
  });
});

describe('the daily session keeps its length', () => {
  it('stays at twelve tasks and includes one tone task', () => {
    let s = initialState(0);
    for (let n = 1; n <= 9; n++) s = reducer(s, { type: 'visit-lesson', lesson: `bai-0${n}`, now: 1 });
    const plan = buildSession(s, 'today', 10 * DAY_MS);
    expect(plan.items.length).toBeLessThanOrEqual(12);
    const tones = plan.items.filter((i) => i.kind === 'task' && i.task.phase === 'tones');
    expect(tones).toHaveLength(1);
  });
});

describe('difficult material comes back sooner', () => {
  it('a record with repeated failures is capped, even after a run of successes', () => {
    let item = newSrsItem('grammar', 'g-bai-06-tense', 'bai-06', 0);
    let now = 0;
    for (const g of [0, 0, 2, 2, 2] as const) {
      item = schedule(item, g, now);
      now += DAY_MS;
    }
    expect(isDifficult(item)).toBe(true);
    // Without the cap the third success would have jumped to the 10-day maintenance rest.
    expect(item.interval).toBeLessThanOrEqual(DIFFICULT_MAX_DAYS);
  });

  it('a reliable record still earns its maintenance rest', () => {
    let item = newSrsItem('grammar', 'g-bai-06-tense', 'bai-06', 0);
    for (const [i, g] of ([2, 2, 2] as const).entries()) item = schedule(item, g, i * DAY_MS);
    expect(isDifficult(item)).toBe(false);
    expect(item.interval).toBeGreaterThanOrEqual(10);
  });

  it('the cap lifts as the record improves', () => {
    let item = newSrsItem('grammar', 'g', 'bai-06', 0);
    let now = 0;
    for (const g of [0, 0, 2, 2, 2, 2, 2, 2] as const) {
      item = schedule(item, g, now);
      now += DAY_MS;
    }
    expect(isDifficult(item)).toBe(false);
    expect(item.interval).toBeGreaterThan(DIFFICULT_MAX_DAYS);
  });
});
