import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SessionItem } from '../learning/session';
import { grade as gradeTask, type GradeResult, type UserAnswer } from '../learning/grading';
import { useStore } from '../learning/store';
import { actionsForTask, actionsForVocab } from '../learning/record';
import { ExerciseView, answerToText, taskExplanation, taskPrompt, type Task } from './ExerciseView';
import { VocabCard, type VocabOutcome } from './VocabCard';
import { Callout, Kbd, Pill, Progress, Vi } from '../components/ui';
import { lessonLabel, lessonById } from '../data/content';

export interface RunnerResult {
  item: SessionItem;
  outcome: 'correct' | 'tone' | 'partial' | 'wrong';
  score: number;
  expected: string;
  given: string;
  prompt: string;
}

export interface RunnerSummary {
  results: RunnerResult[];
  correct: number;
  total: number;
  durationSec: number;
}

function toTask(item: SessionItem): Task | null {
  if (item.kind === 'exercise') return { kind: 'exercise', exercise: item.exercise };
  if (item.kind === 'generated') return { kind: 'generated', instance: item.instance };
  return null;
}

function answerReady(a: UserAnswer | null): boolean {
  if (!a) return false;
  switch (a.kind) {
    case 'text':
      return a.value.trim().length > 0;
    case 'choice':
      return true;
    case 'order':
      return a.tokens.length > 0;
    case 'match':
      return Object.keys(a.pairs).length > 0;
    case 'self':
      return true;
  }
}

/**
 * Practice runner: presents session items one by one with immediate feedback,
 * records outcomes in the store and reports a summary when done.
 */
export function ExerciseRunner({
  items,
  title,
  onFinish,
  onExit,
  record = true,
  sessionKind = 'practice',
}: {
  items: SessionItem[];
  title: string;
  onFinish: (summary: RunnerSummary) => void;
  onExit: () => void;
  record?: boolean;
  sessionKind?: string;
}) {
  const { dispatch } = useStore();
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState<UserAnswer | null>(null);
  const [result, setResult] = useState<GradeResult | null>(null);
  const [results, setResults] = useState<RunnerResult[]>([]);
  const [queue, setQueue] = useState<SessionItem[]>(items);
  const started = useRef(Date.now());
  const finished = useRef(false);

  const item = queue[index];
  const task = useMemo(() => (item ? toTask(item) : null), [item]);

  const finish = useCallback(
    (final: RunnerResult[]) => {
      if (finished.current) return;
      finished.current = true;
      const correct = final.filter((r) => r.outcome === 'correct').length;
      const durationSec = Math.round((Date.now() - started.current) / 1000);
      if (record) dispatch({ type: 'session', session: { ts: Date.now(), kind: sessionKind, items: final.length, correct, durationSec } });
      onFinish({ results: final, correct, total: final.length, durationSec });
    },
    [dispatch, onFinish, record, sessionKind],
  );

  useEffect(() => {
    if (queue.length === 0) finish([]);
  }, [queue.length, finish]);

  const next = useCallback(
    (r: RunnerResult) => {
      const nextResults = [...results, r];
      setResults(nextResults);
      setAnswer(null);
      setResult(null);
      // Failed items come back once at the end of the session (re-learn step).
      let nextQueue = queue;
      if (r.outcome === 'wrong' && !queue.slice(index + 1).some((q) => sameItem(q, r.item)) && countOf(nextResults, r.item) < 2) nextQueue = [...queue, r.item];
      setQueue(nextQueue);
      if (index + 1 >= nextQueue.length) finish(nextResults);
      else setIndex(index + 1);
    },
    [finish, index, queue, results],
  );

  const submit = useCallback(() => {
    if (!task || !item || result || !answerReady(answer)) return;
    const r = gradeTask(task.kind === 'exercise' ? { source: 'exercise', exercise: task.exercise } : { source: 'generated', instance: task.instance }, answer!);
    setResult(r);
    if (record && item.kind !== 'vocab') {
      const given = answerToText(answer, task);
      for (const a of actionsForTask(task, item.lesson, r, given, item.mistakeRef)) dispatch(a);
    }
  }, [answer, dispatch, item, record, result, task]);

  const onVocabDone = (o: VocabOutcome) => {
    if (!item || item.kind !== 'vocab') return;
    if (record) for (const a of actionsForVocab(item, o.grade, o.outcome, o.given)) dispatch(a);
    next({ item, outcome: o.outcome, score: o.grade >= 2 ? 1 : o.grade === 1 ? 0.5 : 0, expected: item.direction === 'vi-pl' ? item.vocab.pl : item.vocab.vi, given: o.given, prompt: item.direction === 'vi-pl' ? item.vocab.vi : item.vocab.pl });
  };

  // Enter = submit / next for non-vocab tasks
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!item || item.kind === 'vocab') return;
      if (e.key === 'Enter') {
        if (e.target instanceof HTMLTextAreaElement && !result) return;
        e.preventDefault();
        if (result && task) next({ item, outcome: result.outcome, score: result.score, expected: result.expected, given: answerToText(answer, task), prompt: taskPrompt(task) });
        else submit();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [answer, item, next, result, submit, task]);

  if (!item) return null;
  const lessonName = item.kind === 'vocab' ? lessonLabel(item.vocab.lessonNumber) : lessonById.get(item.lesson)?.number ? lessonLabel(lessonById.get(item.lesson)!.number) : item.lesson;

  return (
    <div className="ex-frame">
      <div className="ex-top">
        <button type="button" className="btn sm ghost" onClick={onExit} aria-label="Zakończ sesję">✕</button>
        <span>{title}</span>
        <Progress value={index} max={queue.length} thin />
        <span>
          {index + 1} / {queue.length}
        </span>
      </div>
      <div className="ex-card" key={`${index}-${itemKey(item)}`}>
        {item.kind === 'vocab' ? (
          <VocabCard vocab={item.vocab} direction={item.direction} onDone={onVocabDone} />
        ) : (
          task && (
            <div className="fade-in">
              <div className="row" style={{ marginBottom: '0.5rem' }}>
                <Pill>{lessonName}</Pill>
                {item.mistakeRef && <Pill tone="accent">z Moich błędów</Pill>}
              </div>
              <ExerciseView task={task} answer={answer} onAnswer={setAnswer} result={result} onSubmit={submit} />
              {result && (
                <div className={`feedback ${result.outcome}`}>
                  <strong>{result.feedback}</strong>
                  {taskExplanation(task) && <span className="expl">ℹ {taskExplanation(task)}</span>}
                  {result.flagged && <span className="expl">⚠ Ten element jest oznaczony do weryfikacji w CONTENT_REVIEW.md – klucz może być niepełny.</span>}
                  {!result.flagged && result.unverified && task.kind === 'exercise' && task.exercise.source === 'teacher' && <span className="expl">Klucz odpowiedzi opracowany do nauki (brak klucza w materiale nauczycielki).</span>}
                </div>
              )}
              <div className="ex-actions">
                {!result ? (
                  <button type="button" className="btn primary" disabled={!answerReady(answer)} onClick={submit}>
                    Sprawdź <Kbd>Enter</Kbd>
                  </button>
                ) : (
                  <button type="button" className="btn primary" onClick={() => next({ item, outcome: result.outcome, score: result.score, expected: result.expected, given: answerToText(answer, task), prompt: taskPrompt(task) })}>
                    Dalej <Kbd>Enter</Kbd>
                  </button>
                )}
                {!result && (
                  <button type="button" className="btn ghost" onClick={() => { setAnswer({ kind: 'text', value: '' }); setTimeout(submitEmpty, 0); }}>
                    Nie wiem
                  </button>
                )}
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );

  function submitEmpty() {
    if (!task || !item) return;
    const r = gradeTask(task.kind === 'exercise' ? { source: 'exercise', exercise: task.exercise } : { source: 'generated', instance: task.instance }, { kind: 'text', value: '' });
    setResult(r);
    if (record && item.kind !== 'vocab') for (const a of actionsForTask(task, item.lesson, r, '', item.mistakeRef)) dispatch(a);
  }
}

function itemKey(i: SessionItem): string {
  if (i.kind === 'vocab') return i.srsId;
  if (i.kind === 'exercise') return i.exercise.id;
  return i.instance.id;
}
function sameItem(a: SessionItem, b: SessionItem): boolean {
  return itemKey(a) === itemKey(b);
}
function countOf(results: RunnerResult[], item: SessionItem): number {
  return results.filter((r) => sameItem(r.item, item)).length;
}

export function RunnerSummaryView({ summary, onRepeatMistakes, onClose, closeLabel = 'Zakończ' }: { summary: RunnerSummary; onRepeatMistakes?: () => void; onClose: () => void; closeLabel?: string }) {
  const wrong = summary.results.filter((r) => r.outcome !== 'correct');
  const pct = summary.total ? Math.round((summary.correct / summary.total) * 100) : 0;
  return (
    <div className="ex-frame stack">
      <div className="card" style={{ textAlign: 'center' }}>
        <div className="summary-big">{pct}%</div>
        <p className="muted">
          {summary.correct} z {summary.total} poprawnie · {Math.max(1, Math.round(summary.durationSec / 60))} min
        </p>
        <div className="row" style={{ justifyContent: 'center' }}>
          {wrong.length > 0 && onRepeatMistakes && (
            <button type="button" className="btn" onClick={onRepeatMistakes}>
              Powtórz błędy ({wrong.length})
            </button>
          )}
          <button type="button" className="btn primary" onClick={onClose}>
            {closeLabel}
          </button>
        </div>
      </div>
      {wrong.length > 0 && (
        <div className="card">
          <h3>Do poprawy</h3>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Zadanie</th>
                  <th>Twoja odpowiedź</th>
                  <th>Poprawnie</th>
                </tr>
              </thead>
              <tbody>
                {wrong.map((r, i) => (
                  <tr key={i}>
                    <td>{r.prompt}</td>
                    <td><Vi>{r.given || '—'}</Vi></td>
                    <td><Vi>{r.expected}</Vi></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {summary.total === 0 && <Callout>Brak elementów do ćwiczenia w tej sesji.</Callout>}
    </div>
  );
}
