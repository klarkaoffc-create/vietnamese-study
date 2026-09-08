import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SessionItem } from '../learning/session';
import { grade as gradeTask, type GradeResult, type UserAnswer } from '../learning/grading';
import { useStore } from '../learning/store';
import { actionsForExercise, actionsForSelfAssessed, actionsForTask } from '../learning/record';
import { AUTOMATICITY_LABEL, type SrsGrade } from '../learning/srs';
import { phaseLabel } from '../learning/tasks';
import { ExerciseView, answerToText, taskExplanation, taskPrompt, type Task } from './ExerciseView';
import { SpeakingTask } from '../components/SpeakingTask';
import { Callout, Kbd, Pill, Progress, Vi } from '../components/ui';
import { lessonById, lessonLabel } from '../data/content';

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

/** Every session item is rendered through the shared exercise engine. */
function toTask(item: SessionItem): Task {
  if (item.kind === 'task') return { kind: 'exercise', exercise: item.task.exercise };
  if (item.kind === 'exercise') return { kind: 'exercise', exercise: item.exercise };
  return { kind: 'generated', instance: item.instance };
}

function itemKey(i: SessionItem): string {
  if (i.kind === 'task') return i.task.id;
  if (i.kind === 'exercise') return i.exercise.id;
  return i.instance.id;
}

function lessonOf(i: SessionItem): string {
  return i.kind === 'task' ? i.task.lesson : i.lesson;
}

function answerReady(a: UserAnswer | null): boolean {
  if (!a) return false;
  switch (a.kind) {
    case 'text':
      return a.value.trim().length > 0;
    case 'choice':
    case 'self':
      return true;
    case 'order':
      return a.tokens.length > 0;
    case 'match':
      return Object.keys(a.pairs).length > 0;
  }
}

/**
 * Runs a session: one task at a time, answer first, feedback after.
 *
 * There is no reveal-and-rate card here. The learner always produces or
 * chooses something and the engine grades it; the only self-rated tasks are
 * spoken ones, where automatic scoring would be dishonest.
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
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const started = useRef(Date.now());
  const finished = useRef(false);

  const item = queue[index];
  const task = useMemo(() => (item ? toTask(item) : null), [item]);
  const speaking = item?.kind === 'task' && item.task.exercise.type === 'speaking' ? item.task.exercise : null;
  const timeLimit = item?.kind === 'task' ? item.task.timeLimitSec : undefined;

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

  // Optional soft timer: it never blocks the answer, it just shows the clock
  // so responses gradually get faster.
  useEffect(() => {
    setSecondsLeft(timeLimit ?? null);
    if (!timeLimit || result) return;
    const t = window.setInterval(() => setSecondsLeft((s) => (s === null ? null : Math.max(0, s - 1))), 1000);
    return () => window.clearInterval(t);
  }, [timeLimit, index, result]);

  const next = useCallback(
    (r: RunnerResult) => {
      const nextResults = [...results, r];
      setResults(nextResults);
      setAnswer(null);
      setResult(null);
      let nextQueue = queue;
      const seen = nextResults.filter((x) => itemKey(x.item) === itemKey(r.item)).length;
      if (r.outcome === 'wrong' && !queue.slice(index + 1).some((q) => itemKey(q) === itemKey(r.item)) && seen < 2) {
        nextQueue = [...queue, r.item];
      }
      setQueue(nextQueue);
      if (index + 1 >= nextQueue.length) finish(nextResults);
      else setIndex(index + 1);
    },
    [finish, index, queue, results],
  );

  const record_ = useCallback(
    (r: GradeResult, given: string) => {
      if (!record || !item) return;
      if (item.kind === 'task') {
        for (const a of actionsForTask(item, r, given)) dispatch(a);
      } else {
        const t = toTask(item);
        for (const a of actionsForExercise(t, lessonOf(item), r, given, item.mistakeRef)) dispatch(a);
      }
    },
    [dispatch, item, record],
  );

  const submit = useCallback(
    (forceEmpty = false) => {
      if (!task || !item || result) return;
      const a: UserAnswer = forceEmpty ? { kind: 'text', value: '' } : answer!;
      if (!forceEmpty && !answerReady(answer)) return;
      const graded = gradeTask(
        task.kind === 'exercise' ? { source: 'exercise', exercise: task.exercise } : { source: 'generated', instance: task.instance },
        a,
      );
      setResult(graded);
      record_(graded, answerToText(a, task));
    },
    [answer, item, record_, result, task],
  );

  /** Speaking tasks: the learner rates themselves after comparing. */
  const finishSpeaking = (g: SrsGrade) => {
    if (!item || item.kind !== 'task') return;
    if (record) for (const a of actionsForSelfAssessed(item, g, '')) dispatch(a);
    next({
      item,
      outcome: g >= 2 ? 'correct' : g === 1 ? 'tone' : 'wrong',
      score: g >= 2 ? 1 : g === 1 ? 0.5 : 0,
      expected: speaking?.target ?? '',
      given: '(wypowiedź ustna)',
      prompt: speaking?.prompt ?? '',
    });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!item || speaking) return;
      if (e.key === 'Enter') {
        // The focused input handles its own Enter (and calls preventDefault).
        // Without this guard the same keystroke is processed twice: the input
        // submits, React re-renders and re-registers this listener, and the
        // fresh listener then sees `result` set and skips straight past the
        // feedback the learner never got to read.
        if (e.defaultPrevented) return;
        if (e.target instanceof HTMLTextAreaElement && !result) return;
        e.preventDefault();
        if (result && task) next({ item, outcome: result.outcome, score: result.score, expected: result.expected, given: answerToText(answer, task), prompt: taskPrompt(task) });
        else submit();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [answer, item, next, result, speaking, submit, task]);

  if (!item) return null;

  const lessonNum = lessonById.get(lessonOf(item))?.number;
  const meta = item.kind === 'task' ? item.task : null;

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
        <div className="row" style={{ marginBottom: '0.5rem' }}>
          {meta && <Pill tone="primary">{phaseLabel(meta.phase)}</Pill>}
          {lessonNum && <Pill>{lessonLabel(lessonNum)}</Pill>}
          {meta && <Pill tone={meta.level >= 4 ? 'ok' : ''}>{AUTOMATICITY_LABEL[meta.level]}</Pill>}
          {item.mistakeRef && <Pill tone="accent">z Twoich błędów</Pill>}
          <span className="spacer" />
          {secondsLeft !== null && !result && (
            <Pill tone={secondsLeft <= 10 ? 'warn' : ''}>⏱ {secondsLeft}s</Pill>
          )}
        </div>

        {speaking ? (
          <SpeakingTask
            prompt={speaking.prompt}
            instruction={speaking.instruction}
            target={speaking.target}
            translation={speaking.translation}
            showTarget={speaking.showTarget}
            targetId={meta?.srsRef}
            onDone={finishSpeaking}
          />
        ) : (
          task && (
            <div className="fade-in">
              <ExerciseView task={task} answer={answer} onAnswer={setAnswer} result={result} onSubmit={() => submit()} />
              {result && (
                <div className={`feedback ${result.outcome}`}>
                  <strong>{result.feedback}</strong>
                  {taskExplanation(task) && <span className="expl">ℹ {taskExplanation(task)}</span>}
                  {result.flagged && <span className="expl">⚠ Ten element jest oznaczony do weryfikacji w CONTENT_REVIEW.md – klucz może być niepełny.</span>}
                  {!result.flagged && result.unverified && task.kind === 'exercise' && task.exercise.source === 'teacher' && (
                    <span className="expl">Klucz odpowiedzi opracowany do nauki (brak klucza w materiale nauczycielki).</span>
                  )}
                </div>
              )}
              <div className="ex-actions">
                {!result ? (
                  <button type="button" className="btn primary" disabled={!answerReady(answer)} onClick={() => submit()}>
                    Sprawdź <Kbd>Enter</Kbd>
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn primary"
                    onClick={() => next({ item, outcome: result.outcome, score: result.score, expected: result.expected, given: answerToText(answer, task), prompt: taskPrompt(task) })}
                  >
                    Dalej <Kbd>Enter</Kbd>
                  </button>
                )}
                {!result && (
                  <button type="button" className="btn ghost" onClick={() => submit(true)}>
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
}

export function RunnerSummaryView({
  summary,
  onRepeatMistakes,
  onClose,
  closeLabel = 'Zakończ',
}: {
  summary: RunnerSummary;
  onRepeatMistakes?: () => void;
  onClose: () => void;
  closeLabel?: string;
}) {
  const wrong = summary.results.filter((r) => r.outcome !== 'correct');
  const pct = summary.total ? Math.round((summary.correct / summary.total) * 100) : 0;
  const produced = summary.results.filter((r) => r.item.kind === 'task' && r.item.task.level >= 3).length;
  return (
    <div className="ex-frame stack">
      <div className="card" style={{ textAlign: 'center' }}>
        <div className="summary-big">{pct}%</div>
        <p className="muted">
          {summary.correct} z {summary.total} zadań · {Math.max(1, Math.round(summary.durationSec / 60))} min
          {produced > 0 && ` · ${produced} razy tworzyłaś/eś własne zdania`}
        </p>
        <div className="row" style={{ justifyContent: 'center' }}>
          {wrong.length > 0 && onRepeatMistakes && (
            <button type="button" className="btn" onClick={onRepeatMistakes}>
              Powtórz trudne ({wrong.length})
            </button>
          )}
          <button type="button" className="btn primary" onClick={onClose}>
            {closeLabel}
          </button>
        </div>
      </div>
      {wrong.length > 0 && (
        <div className="card">
          <h3>Do dopracowania</h3>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Zadanie</th>
                  <th>Twoja odpowiedź</th>
                  <th>Wzór</th>
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
      {summary.total === 0 && <Callout>Brak zadań w tej sesji.</Callout>}
    </div>
  );
}
