import { describe, expect, it } from 'vitest';
import { allExercises, allGrammar, allVocab, allDialogues, scenarios } from '../src/data/content';
import { grade, gradeExercise, gradeGenerated, type UserAnswer } from '../src/learning/grading';
import { actionsForTask } from '../src/learning/record';
import { dialogueTask, grammarTask, scenarioTask, vocabActiveTask } from '../src/learning/tasks';
import { generate } from '../src/learning/generators';
import { comparisonForm, differsOnlyInTypography, matchVietnamese } from '../src/utilities/vietnamese';
import { GeneratorKindSchema, type Exercise } from '../src/data/schema';
import type { AutomaticityLevel } from '../src/learning/srs';

const typed = (answers: string[], lang: 'vi' | 'pl' = 'vi'): Exercise => ({
  id: 'e-bai-01-probe', type: 'typed', skill: 'grammar', source: 'generated', status: 'unverified',
  prompt: 'p', answerLang: lang, answers, grammar: [], vocab: [], level: 2,
});

const outcomeOf = (ex: Exercise, value: string) => gradeExercise(ex, { kind: 'text', value }).outcome;

/** Every way a learner might finish (or not finish) the same sentence. */
const punctuationVariants = (s: string): string[] => {
  const bare = s.replace(/[.!?…]+\s*$/u, '').trim();
  return [bare, `${bare}.`, `${bare}!`, `${bare}?`, `${bare}...`, `${bare}…`, `${bare}!!`, `${bare}??`, `${bare}?!`, `  ${bare}  `, bare.replace(/ /g, '   ')];
};

/* ------------------------------------------------------------------ */
/* The rule, stated literally                                          */
/* ------------------------------------------------------------------ */

describe('sentence-final punctuation never decides correctness', () => {
  it('accepts every ending for „Mình thích học tiếng Việt.”', () => {
    const ex = typed(['Mình thích học tiếng Việt.']);
    for (const v of [
      'Mình thích học tiếng Việt',
      'Mình thích học tiếng Việt.',
      'Mình thích học tiếng Việt!',
      'Mình thích học tiếng Việt?',
      '  Mình thích học tiếng Việt   ',
      'Mình   thích   học tiếng Việt',
    ]) {
      expect(outcomeOf(ex, v), v).toBe('correct');
    }
  });

  it('accepts every ending for „Bạn khỏe không?”', () => {
    const ex = typed(['Bạn khỏe không?']);
    for (const v of ['Bạn khỏe không', 'Bạn khỏe không?', 'Bạn khỏe không!', 'Bạn khỏe không...', 'Bạn khỏe không…', 'Bạn khỏe không?!']) {
      expect(outcomeOf(ex, v), v).toBe('correct');
    }
  });

  it('works in the other direction too — key without punctuation, answer with', () => {
    const ex = typed(['Bạn khỏe không']);
    expect(outcomeOf(ex, 'Bạn khỏe không?')).toBe('correct');
    expect(outcomeOf(ex, 'Bạn khỏe không.')).toBe('correct');
  });

  it('ignores an internal comma in ordinary sentence production', () => {
    const ex = typed(['Đi thẳng, sau đó rẽ phải.']);
    expect(outcomeOf(ex, 'Đi thẳng sau đó rẽ phải')).toBe('correct');
    expect(outcomeOf(ex, 'Đi thẳng, sau đó rẽ phải!')).toBe('correct');
  });
});

/* ------------------------------------------------------------------ */
/* …but language stays strict                                          */
/* ------------------------------------------------------------------ */

describe('tones and diacritics are never normalised away', () => {
  it('does not accept a toneless answer as fully correct', () => {
    expect(outcomeOf(typed(['Bạn khỏe không?']), 'Ban khoe khong')).toBe('tone');
    expect(outcomeOf(typed(['Mình thích học tiếng Việt.']), 'Mình thich hoc tieng Viet')).toBe('tone');
  });

  it('does not accept a wrong tone mark as fully correct', () => {
    expect(outcomeOf(typed(['Bạn khỏe không?']), 'Bạn khõe không')).toBe('tone');
    expect(outcomeOf(typed(['phở']), 'phơ')).toBe('tone');
  });

  it('keeps the vowel diacritics and đ/d distinct', () => {
    for (const [expected, typedIn] of [['phở', 'pho'], ['thích', 'thich'], ['Việt', 'Viet'], ['đi', 'di'], ['cơm', 'com'], ['tên', 'ten']]) {
      expect(outcomeOf(typed([expected]), typedIn), `${typedIn} vs ${expected}`).not.toBe('correct');
    }
  });

  it('still rejects wrong vocabulary and missing words', () => {
    const ex = typed(['Mình thích học tiếng Việt.']);
    expect(outcomeOf(ex, 'Mình thích uống cà phê')).toBe('wrong');
    expect(outcomeOf(ex, 'Mình thích học')).toBe('wrong');
    expect(outcomeOf(ex, 'Mình thích học tiếng Việt và tiếng Anh')).toBe('wrong');
  });

  it('still rejects wrong word order', () => {
    const ordering: Exercise = {
      id: 'e-bai-02-ord', type: 'ordering', skill: 'word-order', source: 'teacher', status: 'verified',
      prompt: 'p', tokens: ['Bạn', 'tên', 'là', 'gì?'], grammar: [], vocab: [], level: 1,
    };
    expect(gradeExercise(ordering, { kind: 'order', tokens: ['Bạn', 'tên', 'là', 'gì?'] }).outcome).toBe('correct');
    // Punctuation on the token is typography: the same order without it passes.
    expect(gradeExercise(ordering, { kind: 'order', tokens: ['Bạn', 'tên', 'là', 'gì'] }).outcome).toBe('correct');
    expect(gradeExercise(ordering, { kind: 'order', tokens: ['Bạn', 'là', 'tên', 'gì?'] }).outcome).toBe('wrong');
  });
});

/* ------------------------------------------------------------------ */
/* Punctuation must not reach the SRS or the mistake book              */
/* ------------------------------------------------------------------ */

describe('a punctuation-only difference costs the learner nothing', () => {
  it('produces no mistake action and a full SRS grade', () => {
    const v = allVocab.find((x) => x.examples.some((e) => e.pl && /[.!?]$/.test(e.vi)))!;
    const task = vocabActiveTask(v, 3)!;
    const ex = task.exercise as Extract<Exercise, { type: 'typed' }>;
    const model = ex.answers[0];
    const bare = model.replace(/[.!?…]+\s*$/u, '');
    expect(differsOnlyInTypography(bare, model)).toBe(true);

    const result = grade({ source: 'exercise', exercise: ex }, { kind: 'text', value: bare });
    expect(result.outcome).toBe('correct');
    expect(result.feedback).toBe('Dobrze!');

    const actions = actionsForTask({ kind: 'task', task }, result, bare);
    expect(actions.some((a) => a.type === 'mistake')).toBe(false);
    const review = actions.find((a) => a.type === 'review');
    expect(review && 'grade' in review ? review.grade : -1).toBe(2);
  });

  it('never mentions punctuation in any feedback string', () => {
    const samples = [
      outcomeOfFeedback(typed(['Bạn khỏe không?']), 'Bạn khỏe không'),
      outcomeOfFeedback(typed(['Bạn khỏe không?']), 'Ban khoe khong'),
      outcomeOfFeedback(typed(['Bạn khỏe không?']), 'Tôi tên là Nam'),
    ];
    for (const f of samples) {
      expect(f.toLowerCase()).not.toMatch(/kropk|przecink|wykrzyknik|pytajnik|interpunkc|znak zapytania/);
    }
  });
});

function outcomeOfFeedback(ex: Exercise, value: string): string {
  return gradeExercise(ex, { kind: 'text', value }).feedback;
}

/* ------------------------------------------------------------------ */
/* The whole course, every gradable path                               */
/* ------------------------------------------------------------------ */

describe('the rule holds across every exercise in the course', () => {
  const textTypes = new Set(['typed', 'fill-blank', 'error-correction', 'diacritics']);

  it('authored lesson, review and exam exercises grade identically with or without final punctuation', () => {
    const bad: string[] = [];
    for (const { exercise: ex } of allExercises) {
      let model: string | undefined;
      if (textTypes.has(ex.type)) model = (ex as { answers: string[] }).answers[0];
      else if (ex.type === 'reading-question' && ex.answers?.length) model = ex.answers[0];
      else if (ex.type === 'open-answer' && ex.sample) model = ex.sample;
      if (!model) continue;
      const outs = new Set(punctuationVariants(model).map((v) => outcomeOf(ex, v)));
      if (outs.size !== 1 || !outs.has('correct')) bad.push(`${ex.id} (${ex.type}): ${[...outs].join('/')} for ${JSON.stringify(model)}`);
    }
    expect(bad, `punctuation changed the outcome:\n${bad.join('\n')}`).toEqual([]);
    expect(allExercises.length).toBeGreaterThan(200);
  });

  it('runtime review tasks behave the same at every automaticity level', () => {
    const bad: string[] = [];
    const check = (ex: Exercise | undefined, label: string) => {
      if (!ex) return;
      let model: string | undefined;
      if (textTypes.has(ex.type)) model = (ex as { answers: string[] }).answers[0];
      else if (ex.type === 'open-answer' && ex.sample) model = ex.sample;
      if (!model) return;
      const outs = new Set(punctuationVariants(model).map((v) => outcomeOf(ex, v)));
      if (outs.size !== 1 || !outs.has('correct')) bad.push(`${label}: ${[...outs].join('/')} for ${JSON.stringify(model)}`);
    };
    for (const level of [1, 2, 3, 4, 5] as AutomaticityLevel[]) {
      for (const v of allVocab) check(vocabActiveTask(v, level)?.exercise, `vocab ${v.id} L${level}`);
      for (const g of allGrammar) check(grammarTask(g, level)?.exercise, `grammar ${g.id} L${level}`);
      for (const d of allDialogues) for (let i = 0; i < d.lines.length; i++) check(dialogueTask(d, i, level)?.exercise, `dialogue ${d.id}#${i} L${level}`);
      for (const s of scenarios) check(scenarioTask(s, level).exercise, `scenario ${s.id} L${level}`);
    }
    expect(bad, `punctuation changed the outcome:\n${bad.slice(0, 30).join('\n')}`).toEqual([]);
  });

  it('generated drills (numbers, dates, clocks, classifiers…) behave the same', () => {
    const bad: string[] = [];
    for (const kind of GeneratorKindSchema.options) {
      for (const inst of generate(kind, {}, 20, 11)) {
        const model = inst.answers?.[0];
        if (!model || inst.options) continue;
        const outs = new Set(punctuationVariants(model).map((v) => gradeGenerated(inst, { kind: 'text', value: v }).outcome));
        if (outs.size !== 1 || !outs.has('correct')) bad.push(`${kind}: ${[...outs].join('/')} for ${JSON.stringify(model)}`);
      }
    }
    expect(bad, `punctuation changed the outcome:\n${bad.slice(0, 20).join('\n')}`).toEqual([]);
  });

  it('every open-answer key accepts its own model answer', () => {
    // Regression: patterns ending in a literal ("… {x} giờ") silently rejected
    // any natural continuation, including the exercise's own sample.
    const bad: string[] = [];
    for (const { exercise: ex } of allExercises) {
      if (ex.type !== 'open-answer' || !ex.sample) continue;
      if (outcomeOf(ex, ex.sample) !== 'correct') bad.push(`${ex.id}: ${JSON.stringify(ex.sample)}`);
    }
    for (const s of scenarios) {
      const ex = scenarioTask(s, 3).exercise as Exercise;
      if (outcomeOf(ex, s.sample) !== 'correct') bad.push(`${s.id}: ${JSON.stringify(s.sample)}`);
    }
    expect(bad, `model answer rejected by its own key:\n${bad.join('\n')}`).toEqual([]);
  });

  it('grades matching pairs through the same normalisation', () => {
    const ex: Exercise = {
      id: 'e-bai-08-match', type: 'matching', skill: 'vocabulary', source: 'teacher', status: 'verified',
      prompt: 'p', pairs: [{ left: 'phở', right: 'zupa z makaronem' }, { left: 'cà phê', right: 'kawa' }], grammar: [], vocab: [], level: 1,
    };
    const answer: UserAnswer = { kind: 'match', pairs: { 'phở': 'zupa z makaronem.', 'cà phê': '  Kawa  ' } };
    expect(gradeExercise(ex, answer).outcome).toBe('correct');
  });
});

/* ------------------------------------------------------------------ */
/* The primitive itself                                                */
/* ------------------------------------------------------------------ */

describe('comparisonForm', () => {
  it('folds typography and keeps language', () => {
    expect(comparisonForm('Mình thích học tiếng Việt.')).toBe('mình thích học tiếng việt');
    expect(comparisonForm('Bạn khỏe không?!')).toBe('bạn khỏe không');
    expect(comparisonForm('  A,  B.  C!  ')).toBe('a b c');
    // Tones survive: these must NOT collapse onto one another.
    expect(comparisonForm('phở')).not.toBe(comparisonForm('pho'));
    expect(comparisonForm('đi')).not.toBe(comparisonForm('di'));
  });

  it('reports typography-only differences', () => {
    expect(differsOnlyInTypography('Bạn khỏe không', 'Bạn khỏe không?')).toBe(true);
    expect(differsOnlyInTypography('Bạn khỏe không', 'Ban khoe khong')).toBe(false);
    expect(differsOnlyInTypography('Bạn khỏe không', 'Bạn khỏe không')).toBe(false);
  });

  it('classifies the three grading tiers', () => {
    expect(matchVietnamese('Mình thích học tiếng Việt', 'Mình thích học tiếng Việt.').kind).toBe('correct');
    expect(matchVietnamese('Minh thich hoc tieng Viet', 'Mình thích học tiếng Việt.').kind).toBe('tone');
    expect(matchVietnamese('Mình thích uống cà phê', 'Mình thích học tiếng Việt.').kind).toBe('wrong');
  });
});
