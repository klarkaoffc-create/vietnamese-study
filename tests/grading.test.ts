import { describe, expect, it } from 'vitest';
import { gradeExercise, gradeGenerated } from '../src/learning/grading';
import type { Exercise } from '../src/data/schema';
import { generate } from '../src/learning/generators';
import { numberToWords, timeToWords, dateToWords, digitsToWords, yearToWords } from '../src/learning/numbers';

const typed: Exercise = { id: 'e-bai-01-x', type: 'typed', skill: 'vocabulary', source: 'generated', status: 'unverified', prompt: 'Dziękuję', answerLang: 'vi', answers: ['Cảm ơn'], grammar: [], vocab: [], level: 2 };

describe('gradeExercise', () => {
  it('grades typed answers with tone awareness', () => {
    expect(gradeExercise(typed, { kind: 'text', value: 'cảm ơn!' }).outcome).toBe('correct');
    const tone = gradeExercise(typed, { kind: 'text', value: 'cam on' });
    expect(tone.outcome).toBe('tone');
    expect(tone.category).toBe('tone');
    expect(tone.feedback).toContain('Prawie dobrze');
    expect(gradeExercise(typed, { kind: 'text', value: 'xin lỗi' }).outcome).toBe('wrong');
  });
  it('classifies near misses as spelling', () => {
    const r = gradeExercise({ ...typed, answers: ['nghe nhạc'] }, { kind: 'text', value: 'nhge nhạc' });
    expect(r.outcome).toBe('wrong');
    expect(r.category).toBe('spelling');
  });
  it('grades mcq', () => {
    const ex: Exercise = { id: 'e-bai-01-m', type: 'mcq', skill: 'pronoun', source: 'generated', status: 'unverified', prompt: 'p', options: ['anh', 'em'], answer: 0, grammar: [], vocab: [], level: 1 };
    expect(gradeExercise(ex, { kind: 'choice', index: 0 }).outcome).toBe('correct');
    expect(gradeExercise(ex, { kind: 'choice', index: 1 }).outcome).toBe('wrong');
  });
  it('grades matching partially', () => {
    const ex: Exercise = { id: 'e-bai-01-mt', type: 'matching', skill: 'vocabulary', source: 'generated', status: 'unverified', prompt: 'p', pairs: [{ left: 'a', right: '1' }, { left: 'b', right: '2' }, { left: 'c', right: '3' }, { left: 'd', right: '4' }], grammar: [], vocab: [], level: 1 };
    const r = gradeExercise(ex, { kind: 'match', pairs: { a: '1', b: '2', c: '4', d: '3' } });
    expect(r.outcome).toBe('partial');
    expect(r.score).toBe(0.5);
  });
  it('grades ordering', () => {
    const ex: Exercise = { id: 'e-bai-02-o', type: 'ordering', skill: 'word-order', source: 'generated', status: 'unverified', prompt: 'p', tokens: ['Bạn', 'tên', 'là', 'gì?'], grammar: [], vocab: [], level: 2 };
    expect(gradeExercise(ex, { kind: 'order', tokens: ['Bạn', 'tên', 'là', 'gì?'] }).outcome).toBe('correct');
    expect(gradeExercise(ex, { kind: 'order', tokens: ['tên', 'Bạn', 'là', 'gì?'] }).category).toBe('word-order');
  });
  it('diacritics exercise gives low credit for tone-stripped text', () => {
    const ex: Exercise = { id: 'e-bai-01-d', type: 'diacritics', skill: 'tone', source: 'generated', status: 'unverified', stripped: 'Xin chao', answers: ['Xin chào'], grammar: [], vocab: [], level: 2 };
    const r = gradeExercise(ex, { kind: 'text', value: 'Xin chao' });
    expect(r.outcome).toBe('tone');
    expect(r.score).toBeLessThan(0.5);
    expect(gradeExercise(ex, { kind: 'text', value: 'Xin chào' }).outcome).toBe('correct');
  });
  it('marks flagged exercises so the UI can label them', () => {
    const r = gradeExercise({ ...typed, status: 'flagged' }, { kind: 'text', value: 'zzz' });
    expect(r.flagged).toBe(true);
  });
  it('grades open answers by pattern', () => {
    const ex: Exercise = { id: 'e-bai-02-open', type: 'open-answer', skill: 'grammar', source: 'generated', status: 'unverified', prompt: 'p', patterns: ['Mình tên là {x}'], grammar: [], vocab: [], level: 3 };
    expect(gradeExercise(ex, { kind: 'text', value: 'Mình tên là Anna.' }).outcome).toBe('correct');
    expect(gradeExercise(ex, { kind: 'text', value: 'Minh ten la Anna' }).outcome).toBe('tone');
  });
  it('is tolerant for Polish answers', () => {
    const ex: Exercise = { ...typed, answerLang: 'pl', answers: ['Wczoraj uczyłem się wietnamskiego.'] };
    expect(gradeExercise(ex, { kind: 'text', value: 'wczoraj uczylem sie wietnamskiego' }).outcome).toBe('correct');
  });
});

describe('numbers', () => {
  it('builds lesson forms and accepts standard variants', () => {
    expect(numberToWords(15).primary).toBe('mười lăm');
    expect(numberToWords(25).primary).toBe('hai mươi lăm');
    expect(numberToWords(21).accepted).toContain('hai mươi mốt');
    expect(numberToWords(21).primary).toBe('hai mươi một');
    expect(numberToWords(100).primary).toBe('một trăm');
    expect(numberToWords(1000).primary).toBe('một nghìn');
    expect(numberToWords(2026).accepted).toContain('hai nghìn không trăm hai mươi sáu');
    expect(numberToWords(105).accepted).toContain('một trăm linh năm');
    expect(numberToWords(911).primary).toBe('chín trăm mười một');
  });
  it('reads digits and years', () => {
    expect(digitsToWords('523 911 487')).toBe('năm hai ba chín một một bốn tám bảy');
    expect(yearToWords(2026).accepted).toContain('hai không hai sáu');
  });
  it('builds times with day parts', () => {
    const t = timeToWords(17, 20);
    expect(t.primary).toBe('năm giờ hai mươi phút chiều');
    expect(t.accepted).toContain('5 giờ 20 phút chiều');
    expect(timeToWords(5, 0).primary).toBe('năm giờ sáng');
  });
  it('builds dates', () => {
    const d = dateToWords(10, 12, 2026);
    expect(d.primary).toBe('ngày mười tháng Mười Hai năm hai nghìn không trăm hai mươi sáu');
    expect(d.accepted).toContain('ngày 10 tháng 12 năm 2026');
  });
});

describe('generators', () => {
  it('are deterministic for a seed and gradeable', () => {
    const a = generate('number', { max: 99 }, 5, 42);
    const b = generate('number', { max: 99 }, 5, 42);
    expect(a.map((x) => x.id)).toEqual(b.map((x) => x.id));
    for (const inst of a) {
      const r = gradeGenerated(inst, { kind: 'text', value: inst.answers![0] });
      expect(r.outcome).toBe('correct');
    }
  });
  it('produce every kind without throwing', () => {
    for (const kind of ['number', 'phone', 'age', 'year', 'date', 'weekday', 'month', 'time', 'classifier', 'pronoun', 'tense', 'comparison', 'position', 'tone-identify'] as const) {
      const list = generate(kind, {}, 4, 7);
      expect(list.length).toBeGreaterThan(0);
      for (const inst of list) {
        if (inst.options) {
          expect(inst.answer).toBeGreaterThanOrEqual(0);
          expect(gradeGenerated(inst, { kind: 'choice', index: inst.answer! }).outcome).toBe('correct');
        } else {
          expect(inst.answers!.length).toBeGreaterThan(0);
          expect(gradeGenerated(inst, { kind: 'text', value: inst.answers![0] }).outcome).toBe('correct');
        }
      }
    }
  });
});
