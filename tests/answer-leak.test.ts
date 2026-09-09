import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { allExercises, allVocab, allGrammar, allDialogues, lessons, scenarios } from '../src/data/content';
import {
  ANSWER_LEAK_EXEMPTIONS,
  answerKeysOfGenerated,
  findAnswerLeaks,
  findAnswerLeaksGenerated,
  normalise,
  revealsAnswer,
  textComparableKeys,
  visibleBeforeAttempt,
} from '../src/learning/answers';
import { ExerciseView } from '../src/exercises/ExerciseView';
import { dialogueTask, grammarTask, scenarioTask, speakingTask, vocabActiveTask, vocabPassiveTask } from '../src/learning/tasks';
import { generate } from '../src/learning/generators';
import { GeneratorKindSchema, type Exercise } from '../src/data/schema';
import type { AutomaticityLevel } from '../src/learning/srs';
import type { GradeResult } from '../src/learning/grading';

const LEVELS: AutomaticityLevel[] = [1, 2, 3, 4, 5];

/** The markup a learner sees before typing or selecting anything. */
function renderBeforeAttempt(exercise: Exercise): string {
  return renderToStaticMarkup(
    createElement(ExerciseView, { task: { kind: 'exercise' as const, exercise }, answer: null, onAnswer: () => {}, result: null }),
  );
}

function renderAfterSubmit(exercise: Exercise, result: GradeResult): string {
  return renderToStaticMarkup(
    createElement(ExerciseView, { task: { kind: 'exercise' as const, exercise }, answer: { kind: 'text', value: 'x' }, onAnswer: () => {}, result }),
  );
}

/** Strip tags, then normalise, so we compare words rather than markup. */
const visibleText = (html: string) => normalise(html.replace(/<[^>]*>/g, ' '));

/**
 * The instructional chrome only: the instruction, the prompt, the hint and
 * image alt text. The answer WIDGETS are excluded on purpose — a multiple
 * choice list, a fill-blank word bank, the token pool of an ordering task and
 * the right-hand column of a matching task all contain the answer among
 * decoys, because choosing it is the exercise.
 */
function taskText(html: string, type: string): string {
  const parts: string[] = [];
  for (const m of html.matchAll(/class="(ex-instruction|ex-hint)"[^>]*>(.*?)<\/(?:div|p)>/gs)) parts.push(m[2]);
  // A diacritics task prints the answer without its tones as the prompt —
  // restoring them IS the task, so the prompt cannot be judged as a leak.
  if (type !== 'diacritics') {
    for (const m of html.matchAll(/class="ex-prompt[^"]*"[^>]*>(.*?)<\/p>/gs)) parts.push(m[1]);
  }
  for (const m of html.matchAll(/alt="([^"]*)"/g)) parts.push(m[1]);
  return visibleText(parts.join(' '));
}

/**
 * Choice-based tasks legitimately print the answer as one of the options —
 * picking it is the exercise. Everything else must not show its key at all.
 */
const SHOWS_KEY_AS_AN_OPTION = new Set(['mcq', 'matching', 'ordering', 'reading-question', 'dialogue-completion']);

/* ------------------------------------------------------------------ */
/* 1. The content itself                                                */
/* ------------------------------------------------------------------ */

describe('no lesson exercise prints its own answer in the task', () => {
  it('audits every exercise in Bài 1–12, the reviews and the exams', () => {
    const leaks = allExercises.flatMap((e) => findAnswerLeaks(e.exercise));
    const report = leaks.map((l) => `${l.exerciseId} · ${l.field} · answer ${JSON.stringify(l.answer)} in ${JSON.stringify(l.text)}`);
    expect(report, `answer visible before the attempt:\n${report.join('\n')}`).toEqual([]);
    // The audit is worthless if it silently stops covering the course.
    expect(allExercises.length).toBeGreaterThan(200);
  });

  it('covers every exercise type the course actually uses', () => {
    const audited = new Set(allExercises.map((e) => e.exercise.type));
    for (const t of ['mcq', 'typed', 'fill-blank', 'matching', 'ordering', 'error-correction', 'diacritics', 'reading-question', 'dialogue-completion', 'open-answer', 'generator']) {
      expect(audited, `type ${t} missing from the course`).toContain(t);
    }
  });

  it('keeps every exemption justified', () => {
    for (const [id, reason] of Object.entries(ANSWER_LEAK_EXEMPTIONS)) {
      expect(allExercises.some((e) => e.exercise.id === id), `exempted ${id} no longer exists`).toBe(true);
      expect(reason.length).toBeGreaterThan(20);
    }
  });

  it('detects a planted leak, so the audit is not vacuous', () => {
    const planted: Exercise = {
      id: 'e-bai-01-planted', type: 'typed', skill: 'vocabulary', source: 'generated', status: 'unverified',
      prompt: 'Jak powiesz „dzień dobry”? Podpowiedź: Xin chào.', answerLang: 'vi', answers: ['Xin chào'], grammar: [], vocab: [], level: 1,
    };
    expect(findAnswerLeaks(planted)).toHaveLength(1);
  });
});

describe('answer-key fields are separated from visible fields', () => {
  it('never lists an answer key as visible-before-attempt', () => {
    for (const { exercise } of allExercises) {
      const visible = visibleBeforeAttempt(exercise).map((v) => v.field);
      for (const key of ['answers', 'patterns', 'sample', 'tokens', 'options', 'answer', 'target', 'pairs']) {
        expect(visible, `${exercise.id} exposes ${key}`).not.toContain(key);
      }
    }
  });

  it('flags a whole answer and tolerates a partial scaffold', () => {
    expect(revealsAnswer('Podpowiedź: Mình tên là Anna.', 'Mình tên là Anna')).toBe(true);
    expect(revealsAnswer('Gia đình của tôi có + liczba + người', 'Gia đình của mình có bốn người')).toBe(false);
    expect(revealsAnswer('Podmiot + là + rzeczownik', 'Bố là bác sĩ và mẹ làm việc ở nhà')).toBe(false);
    // Tone-insensitive: stripping the diacritics must not defeat the check.
    expect(revealsAnswer('podpowiedz: xin chao', 'Xin chào')).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* 2. What the renderer actually puts on screen                         */
/* ------------------------------------------------------------------ */

describe('the exercise renderer hides the answer until submission', () => {
  it('does not render the answer key for any authored exercise', () => {
    const leaked: string[] = [];
    for (const { exercise } of allExercises) {
      if (exercise.type === 'generator' || exercise.type === 'speaking') continue;
      if (SHOWS_KEY_AS_AN_OPTION.has(exercise.type) || ANSWER_LEAK_EXEMPTIONS[exercise.id]) continue;
      const text = taskText(renderBeforeAttempt(exercise), exercise.type);
      for (const key of textComparableKeys(exercise)) {
        if (revealsAnswer(text, key)) leaked.push(`${exercise.id} (${exercise.type}): ${key}`);
      }
    }
    expect(leaked, `rendered before any attempt:\n${leaked.join('\n')}`).toEqual([]);
  });

  it('never renders the grading key of an open-production task', () => {
    // The bug: the view printed `Wzór: <patterns[0]>` before the attempt,
    // which for short answers is the whole sentence. It must be gone for
    // every open-answer exercise AND every scenario, at every level.
    const opens = allExercises.map((e) => e.exercise).filter((e): e is Extract<Exercise, { type: 'open-answer' }> => e.type === 'open-answer');
    expect(opens.length).toBeGreaterThan(10);
    const fromScenarios = LEVELS.flatMap((l) => scenarios.map((s) => scenarioTask(s, l).exercise as Extract<Exercise, { type: 'open-answer' }>));
    for (const ex of [...opens, ...fromScenarios]) {
      const html = renderBeforeAttempt(ex);
      expect(html, `${ex.id} still prints a "Wzór:" line`).not.toContain('Wzór');
      if (ex.sample) expect(revealsAnswer(visibleText(html), ex.sample), `${ex.id} showed its sample`).toBe(false);
    }
  });

  it('reveals the model answer for open production only after grading', () => {
    const open = allExercises.map((e) => e.exercise).find((e) => e.type === 'open-answer' && e.sample)!;
    const sample = (open as Extract<Exercise, { type: 'open-answer' }>).sample!;
    expect(revealsAnswer(visibleText(renderBeforeAttempt(open)), sample)).toBe(false);
    const result: GradeResult = {
      outcome: 'correct', score: 1, expected: sample, category: 'grammar', flagged: false, unverified: true,
      feedback: `Struktura zdania się zgadza. Przykładowa odpowiedź (jedna z wielu): ${sample}`,
    };
    // Grading is what carries the model answer, and it labels it as one of
    // several possibilities rather than the only right sentence.
    expect(result.feedback).toContain('jedna z wielu');
    expect(result.feedback).toContain(sample);
    // Once a result exists the view stops offering the pre-attempt scaffold.
    expect(renderAfterSubmit(open, result)).not.toContain('ex-hint');
  });

  it('shows a scenario its own scaffold before the attempt', () => {
    const s = scenarios.find((x) => x.hint)!;
    const ex = scenarioTask(s, 1, 'free').exercise as Extract<Exercise, { type: 'open-answer' }>;
    expect(ex.hint).toBe(s.hint);
    expect(visibleText(renderBeforeAttempt(ex))).toContain(normalise(s.hint!).slice(0, 20));
    // At high automaticity the scaffold is withdrawn entirely.
    expect((scenarioTask(s, 5, 'free').exercise as Extract<Exercise, { type: 'open-answer' }>).hint).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */
/* 3. Runtime-built tasks (the daily review)                            */
/* ------------------------------------------------------------------ */

describe('generated review tasks hide their answers too', () => {
  it('builds every vocabulary, grammar, dialogue and scenario task at every level without leaking', () => {
    const leaked: string[] = [];
    const check = (ex: Exercise | undefined, label: string) => {
      if (!ex || ex.type === 'speaking') return;
      if (SHOWS_KEY_AS_AN_OPTION.has(ex.type)) return;
      const text = taskText(renderBeforeAttempt(ex), ex.type);
      for (const key of textComparableKeys(ex)) {
        if (revealsAnswer(text, key)) leaked.push(`${label} → ${ex.type}: ${key}`);
      }
    };
    // The builders draw their example sentence at random, so sweep the whole
    // course several times rather than trusting one lucky draw.
    for (let pass = 0; pass < 3; pass++) {
      for (const level of LEVELS) {
        for (const v of allVocab) {
          check(vocabActiveTask(v, level)?.exercise, `vocab-active ${v.id} L${level}`);
          check(vocabPassiveTask(v, allVocab)?.exercise, `vocab-passive ${v.id}`);
        }
        for (const g of allGrammar) check(grammarTask(g, level)?.exercise, `grammar ${g.id} L${level}`);
        for (const d of allDialogues) for (let i = 0; i < d.lines.length; i++) check(dialogueTask(d, i, level)?.exercise, `dialogue ${d.id}#${i} L${level}`);
        for (const s of scenarios) check(scenarioTask(s, level).exercise, `scenario ${s.id} L${level}`);
      }
    }
    expect(leaked, `runtime tasks leaking their answer:\n${leaked.slice(0, 40).join('\n')}`).toEqual([]);
  });

  it('never shows the spoken model before the attempt', () => {
    for (const v of allVocab) {
      const ex = v.examples[0];
      if (!ex) continue;
      for (const level of LEVELS) {
        const t = speakingTask(ex.vi, ex.pl ?? '', v.id, v.lessonId, level);
        if (t.exercise.type !== 'speaking') continue;
        expect(t.exercise.showTarget).toBe(false);
        expect(revealsAnswer(t.exercise.prompt, t.exercise.target)).toBe(false);
      }
    }
  });

  it('keeps generated drills (numbers, dates, clocks, classifiers…) clean', () => {
    const leaked: string[] = [];
    for (const kind of GeneratorKindSchema.options) {
      for (const inst of generate(kind, {}, 25, 7)) {
        for (const l of findAnswerLeaksGenerated(inst)) leaked.push(`${kind} · ${l.field} · ${l.answer} in ${l.text}`);
        // Options-based drills legitimately contain the answer among options.
        expect(answerKeysOfGenerated(inst).length).toBeGreaterThan(0);
      }
    }
    expect(leaked, `generated drills leaking:\n${leaked.slice(0, 20).join('\n')}`).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* 4. Lesson checkpoints                                                */
/* ------------------------------------------------------------------ */

describe('lesson checkpoints', () => {
  it('are built from audited exercises only', () => {
    for (const l of lessons) {
      expect(l.checkpoint.length).toBeGreaterThan(0);
      for (const id of l.checkpoint) {
        const found = allExercises.find((e) => e.exercise.id === id);
        expect(found, `${l.id} checkpoint references missing exercise ${id}`).toBeDefined();
        expect(findAnswerLeaks(found!.exercise)).toEqual([]);
      }
    }
  });
});
