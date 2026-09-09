import { useMemo, useState } from 'react';
import type { Exercise } from '../data/schema';
import { dialogueById, readingById } from '../data/content';
import type { GeneratedInstance } from '../learning/generators';
import type { GradeResult, UserAnswer } from '../learning/grading';
import { shuffle } from '../utilities/random';
import { ChoiceInput, FillBlankInput, MatchingInput, OrderingInput, TextInput } from './inputs';
import { ClockFace, PositionVisual } from '../components/visuals';
import { DialogueView } from '../components/DialogueView';
import { StatusTag, Vi } from '../components/ui';

export type Task = { kind: 'exercise'; exercise: Exercise } | { kind: 'generated'; instance: GeneratedInstance };

export function taskId(t: Task): string {
  return t.kind === 'exercise' ? t.exercise.id : t.instance.id;
}

const withBase = (src: string) => `${import.meta.env.BASE_URL}${src.replace(/^\//, '')}`;

/**
 * Renders the prompt and the answer input for a task. Controlled: the parent
 * owns the answer and the grade result (null until submitted).
 */
export function ExerciseView({
  task,
  answer,
  onAnswer,
  result,
  onSubmit,
  optionOrder,
  showMeta = true,
}: {
  task: Task;
  answer: UserAnswer | null;
  onAnswer: (a: UserAnswer) => void;
  result: GradeResult | null;
  onSubmit?: () => void;
  optionOrder?: number[];
  showMeta?: boolean;
}) {
  if (task.kind === 'generated') return <GeneratedView inst={task.instance} answer={answer} onAnswer={onAnswer} result={result} onSubmit={onSubmit} optionOrder={optionOrder} />;
  const ex = task.exercise;
  const text = answer?.kind === 'text' ? answer.value : '';
  const setText = (v: string) => onAnswer({ kind: 'text', value: v });
  const selected = answer?.kind === 'choice' ? answer.index : null;
  const meta = showMeta ? (
    <div className="ex-meta">
      <StatusTag status={ex.status} source={ex.source} />
    </div>
  ) : null;
  const image = ex.image ? (
    <div className="ex-image">
      <img src={withBase(ex.image.src)} alt={ex.image.alt} />
    </div>
  ) : null;

  switch (ex.type) {
    case 'mcq':
      return (
        <div>
          {meta}
          {ex.instruction && <div className="ex-instruction">{ex.instruction}</div>}
          <p className="ex-prompt">{ex.prompt}</p>
          {image}
          <ChoiceInput options={ex.options} selected={selected} onSelect={(i) => onAnswer({ kind: 'choice', index: i })} correctIndex={ex.answer} result={result} order={optionOrder} />
        </div>
      );
    case 'typed':
      return (
        <div>
          {meta}
          {ex.instruction && <div className="ex-instruction">{ex.instruction}</div>}
          <p className="ex-prompt">{ex.prompt}</p>
          {image}
          <TextInput value={text} onChange={setText} onSubmit={onSubmit} result={result} lang={ex.answerLang} />
          {ex.hint && <div className="ex-hint">💡 {ex.hint}</div>}
        </div>
      );
    case 'fill-blank':
      return (
        <div>
          {meta}
          <div className="ex-instruction">{ex.instruction ?? 'Uzupełnij lukę.'}</div>
          <FillBlankInput sentence={ex.sentence} bank={ex.bank} value={text} onChange={setText} onSubmit={onSubmit} result={result} />
          {ex.translation && <div className="ex-hint">{ex.translation}</div>}
        </div>
      );
    case 'matching': {
      const val = answer?.kind === 'match' ? answer.pairs : {};
      return (
        <div>
          {meta}
          <p className="ex-prompt">{ex.prompt}</p>
          <MatchingInput pairs={ex.pairs} value={val} onChange={(pairs) => onAnswer({ kind: 'match', pairs })} result={result} />
        </div>
      );
    }
    case 'ordering': {
      const val = answer?.kind === 'order' ? answer.tokens : [];
      return (
        <div>
          {meta}
          <p className="ex-prompt">{ex.prompt}</p>
          <OrderingInput tokens={ex.tokens} value={val} onChange={(tokens) => onAnswer({ kind: 'order', tokens })} result={result} />
        </div>
      );
    }
    case 'error-correction':
      return (
        <div>
          {meta}
          <div className="ex-instruction">{ex.prompt ?? 'Popraw błąd w zdaniu.'}</div>
          <p className="ex-prompt vi">
            <Vi>{ex.wrong}</Vi>
          </p>
          <TextInput value={text} onChange={setText} onSubmit={onSubmit} result={result} placeholder="Wpisz poprawione zdanie…" />
        </div>
      );
    case 'diacritics':
      return (
        <div>
          {meta}
          <div className="ex-instruction">{ex.instruction ?? 'Dopisz znaki diakrytyczne i tony.'}</div>
          <p className="ex-prompt vi">
            <Vi>{ex.stripped}</Vi>
          </p>
          {ex.translation && <div className="ex-hint" style={{ marginBottom: '0.5rem' }}>{ex.translation}</div>}
          <TextInput value={text} onChange={setText} onSubmit={onSubmit} result={result} placeholder="Wpisz z tonami…" />
        </div>
      );
    case 'open-answer':
      return (
        <div>
          {meta}
          {/* For scenarios the instruction carries the situation itself
              ("Jesteś w kawiarni w Hà Nội…"), which is the whole point of
              the task — it must never be replaced by a generic line. */}
          <div className="ex-instruction">{ex.instruction ?? 'Odpowiedz pełnym zdaniem po wietnamsku.'}</div>
          <p className="ex-prompt">{ex.prompt}</p>
          {image}
          <TextInput value={text} onChange={setText} onSubmit={onSubmit} result={result} multiline />
          {/* `patterns` is the grading key — showing it here handed the
              learner most of the sentence before they had tried. Only the
              purpose-written scaffold is shown before an attempt; the model
              answer arrives with the feedback, after grading. */}
          {ex.hint && !result && <div className="ex-hint">💡 {ex.hint}</div>}
        </div>
      );
    case 'reading-question': {
      const reading = readingById.get(ex.readingId);
      return (
        <div>
          {meta}
          {reading && (
            <details className="disclosure" open style={{ marginBottom: '0.75rem' }}>
              <summary>{reading.title}</summary>
              <div className="reading-box" lang="vi">
                {reading.paragraphs.map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
            </details>
          )}
          <p className="ex-prompt">{ex.prompt}</p>
          {ex.options && typeof ex.answer === 'number' ? (
            <ChoiceInput options={ex.options} selected={selected} onSelect={(i) => onAnswer({ kind: 'choice', index: i })} correctIndex={ex.answer} result={result} order={optionOrder} lang={ex.answerLang ?? 'vi'} />
          ) : (
            <TextInput value={text} onChange={setText} onSubmit={onSubmit} result={result} lang={ex.answerLang ?? 'vi'} />
          )}
        </div>
      );
    }
    case 'dialogue-completion':
      return <DialogueCompletionView ex={ex} text={text} setText={setText} result={result} onSubmit={onSubmit} meta={meta} />;
    case 'generator':
      return <p className="muted">Ćwiczenie generowane – uruchom je z poziomu lekcji.</p>;
    case 'speaking':
      // Rendered by ExerciseRunner through <SpeakingTask />, which owns the
      // record/compare/self-rate flow.
      return <p className="muted">Zadanie mówione – uruchom je w sesji.</p>;
  }
}

function DialogueCompletionView({
  ex,
  text,
  setText,
  result,
  onSubmit,
  meta,
}: {
  ex: Extract<Exercise, { type: 'dialogue-completion' }>;
  text: string;
  setText: (v: string) => void;
  result: GradeResult | null;
  onSubmit?: () => void;
  meta: React.ReactNode;
}) {
  const d = dialogueById.get(ex.dialogueId);
  const [mode, setMode] = useState<'choice' | 'typed'>(ex.distractors.length ? 'choice' : 'typed');
  const line = d?.lines[ex.lineIndex];
  const options = useMemo(() => (line ? shuffle([line.vi, ...ex.distractors]) : []), [line, ex.distractors]);
  if (!d || !line) return <p className="muted">Brak dialogu.</p>;
  const correctIndex = options.indexOf(line.vi);
  const selected = options.indexOf(text);
  return (
    <div>
      {meta}
      <div className="row between" style={{ marginBottom: '0.5rem' }}>
        <div className="ex-instruction">Uzupełnij brakującą linię dialogu „{d.title}”.</div>
        {ex.distractors.length > 0 && !result && (
          <div className="tabs" style={{ margin: 0, borderBottom: 0 }}>
            <button type="button" className={`tab ${mode === 'choice' ? 'on' : ''}`} onClick={() => setMode('choice')}>Wybierz</button>
            <button type="button" className={`tab ${mode === 'typed' ? 'on' : ''}`} onClick={() => setMode('typed')}>Wpisz</button>
          </div>
        )}
      </div>
      <DialogueView dialogue={d} mode="read" showTranslation blankIndex={ex.lineIndex} blankContent={<span className="muted small">{line.pl ? `(${line.pl})` : '…'}</span>} />
      <div style={{ marginTop: '0.9rem' }}>
        {mode === 'choice' ? (
          <ChoiceInput options={options} selected={selected >= 0 ? selected : null} onSelect={(i) => setText(options[i])} correctIndex={correctIndex} result={result} />
        ) : (
          <TextInput value={text} onChange={setText} onSubmit={onSubmit} result={result} />
        )}
      </div>
    </div>
  );
}

function GeneratedView({
  inst,
  answer,
  onAnswer,
  result,
  onSubmit,
  optionOrder,
}: {
  inst: GeneratedInstance;
  answer: UserAnswer | null;
  onAnswer: (a: UserAnswer) => void;
  result: GradeResult | null;
  onSubmit?: () => void;
  optionOrder?: number[];
}) {
  const text = answer?.kind === 'text' ? answer.value : '';
  const selected = answer?.kind === 'choice' ? answer.index : null;
  return (
    <div>
      <div className="ex-meta">
        <StatusTag source="generated" />
      </div>
      <p className="ex-prompt">{inst.prompt}</p>
      {inst.visual?.kind === 'clock' && <ClockFace hour={inst.visual.hour} minute={inst.visual.minute} />}
      {inst.visual?.kind === 'position' && <PositionVisual position={inst.visual.position} />}
      {inst.options && typeof inst.answer === 'number' ? (
        <ChoiceInput options={inst.options} selected={selected} onSelect={(i) => onAnswer({ kind: 'choice', index: i })} correctIndex={inst.answer} result={result} order={optionOrder} lang={inst.generator === 'tone-identify' ? 'pl' : 'vi'} />
      ) : (
        <TextInput value={text} onChange={(v) => onAnswer({ kind: 'text', value: v })} onSubmit={onSubmit} result={result} lang={inst.answerLang ?? 'vi'} />
      )}
      {inst.hint && <div className="ex-hint">💡 {inst.hint}</div>}
    </div>
  );
}

/** Explanation text for a task, shown after grading. */
export function taskExplanation(task: Task): string | undefined {
  return task.kind === 'exercise' ? task.exercise.explanation : task.instance.explanation;
}

export function taskPrompt(task: Task): string {
  if (task.kind === 'generated') return task.instance.prompt;
  const ex = task.exercise;
  switch (ex.type) {
    case 'fill-blank':
      return ex.sentence;
    case 'error-correction':
      return ex.wrong;
    case 'diacritics':
      return ex.stripped;
    case 'dialogue-completion':
      return `Dialog: ${dialogueById.get(ex.dialogueId)?.title ?? ex.dialogueId} (linia ${ex.lineIndex + 1})`;
    case 'generator':
      return ex.instruction ?? ex.generator;
    case 'speaking':
      return ex.prompt;
    default:
      return ex.prompt;
  }
}

export function answerToText(a: UserAnswer | null, task: Task): string {
  if (!a) return '';
  switch (a.kind) {
    case 'text':
      return a.value;
    case 'choice': {
      if (task.kind === 'generated') return task.instance.options?.[a.index] ?? String(a.index);
      const ex = task.exercise;
      if (ex.type === 'mcq' || (ex.type === 'reading-question' && ex.options)) return (ex as { options?: string[] }).options?.[a.index] ?? '';
      return String(a.index);
    }
    case 'order':
      return a.tokens.join(' ');
    case 'match':
      return Object.entries(a.pairs)
        .map(([l, r]) => `${l} → ${r}`)
        .join('; ');
    case 'self':
      return `ocena ${a.grade}`;
  }
}
