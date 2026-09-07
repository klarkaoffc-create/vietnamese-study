import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { allDialogues, allExercises, dialogueById, lessonLabel } from '../data/content';
import type { Exercise } from '../data/schema';
import type { SessionItem } from '../learning/session';
import { ExerciseRunner, RunnerSummaryView, type RunnerSummary } from '../exercises/ExerciseRunner';
import { DialogueView, type DialogueMode } from '../components/DialogueView';
import { Callout, Card, PageHeader, Pill } from '../components/ui';
import { sample } from '../utilities/random';

export function DialoguesPage() {
  return (
    <div className="container">
      <PageHeader eyebrow="Dialogi" title="Trener dialogów">
        <p>Wszystkie dialogi z lekcji. Czytaj, ukrywaj jedną stronę rozmowy, przypominaj sobie linie i uzupełniaj brakujące wypowiedzi.</p>
      </PageHeader>
      <div className="grid">
        {allDialogues.map((d) => (
          <Card key={d.id} to={`/dialogi/${d.id}`}>
            <div className="card-title">💬 {d.title}</div>
            <p className="muted small">{d.situation}</p>
            <div className="row">
              <Pill>{lessonLabel(d.lessonNumber)}</Pill>
              <Pill>{d.lines.length} linii</Pill>
              {d.lines.some((l) => l.status === 'flagged') && <Pill tone="warn">⚠ fragment do weryfikacji</Pill>}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function DialogueTrainerPage() {
  const { id } = useParams();
  const d = id ? dialogueById.get(id) : undefined;
  const [mode, setMode] = useState<DialogueMode>('read');
  const [showPl, setShowPl] = useState(true);
  const [session, setSession] = useState<SessionItem[] | null>(null);
  const [summary, setSummary] = useState<RunnerSummary | null>(null);

  // /dialogi/:id stays mounted when navigating between dialogues in place;
  // drop any in-progress session from the previous dialogue so the runner
  // never shows lines from a different dialogue than the one now shown.
  useEffect(() => {
    setSession(null);
    setSummary(null);
    setMode('read');
  }, [id]);

  const completionItems = useMemo(() => {
    if (!d) return [];
    const existing = allExercises.filter((e) => e.exercise.type === 'dialogue-completion' && (e.exercise as { dialogueId: string }).dialogueId === d.id);
    const items: SessionItem[] = existing.map((e) => ({ kind: 'exercise', exercise: e.exercise, lesson: e.ownerId }));
    // Generate completion tasks for the remaining lines (distractors = other lines of the dialogue)
    const covered = new Set(existing.map((e) => (e.exercise as { lineIndex: number }).lineIndex));
    d.lines.forEach((line, i) => {
      if (covered.has(i) || line.status === 'flagged') return;
      const distractors = sample(d.lines.filter((_, j) => j !== i).map((l) => l.vi), 2);
      const ex: Exercise = {
        id: `e-${d.lessonId}-gen-dialog-${i}`,
        type: 'dialogue-completion',
        skill: 'dialogue',
        source: 'generated',
        status: 'unverified',
        dialogueId: d.id,
        lineIndex: i,
        distractors,
        grammar: [],
        vocab: [],
        level: 2,
      };
      items.push({ kind: 'exercise', exercise: ex, lesson: d.lessonId });
    });
    return items;
  }, [d]);

  if (!d) {
    return (
      <div className="container">
        <Callout tone="bad">Nie znaleziono dialogu.</Callout>
        <Link to="/dialogi">← Dialogi</Link>
      </div>
    );
  }

  if (session && !summary) {
    return (
      <div className="container">
        <ExerciseRunner items={session} title={`💬 ${d.title}`} sessionKind="dialogue" onExit={() => setSession(null)} onFinish={setSummary} />
      </div>
    );
  }
  if (summary) {
    return (
      <div className="container">
        <RunnerSummaryView summary={summary} onClose={() => { setSession(null); setSummary(null); }} closeLabel="Wróć do dialogu" />
      </div>
    );
  }

  return (
    <div className="container narrow">
      <PageHeader eyebrow={`Dialog · ${lessonLabel(d.lessonNumber)}`} title={d.title}>
        <p>{d.situation}</p>
      </PageHeader>
      <div className="card">
        <div className="row between mb">
          <div className="chips">
            {(['read', 'hide-a', 'hide-b', 'recall'] as DialogueMode[]).map((m) => (
              <button key={m} type="button" className={`chip ${mode === m ? 'on' : ''}`} onClick={() => setMode(m)}>
                {m === 'read' ? 'Czytaj' : m === 'hide-a' ? 'Ukryj pierwszą osobę' : m === 'hide-b' ? 'Ukryj drugą osobę' : 'Przypomnij sobie każdą linię'}
              </button>
            ))}
          </div>
          <label className="row small">
            <input type="checkbox" checked={showPl} onChange={(e) => setShowPl(e.target.checked)} /> tłumaczenie
          </label>
        </div>
        <DialogueView key={mode} dialogue={d} mode={mode} showTranslation={showPl} />
        <p className="muted tiny mt">W trybach z ukrywaniem kliknij linię, aby ją odsłonić po przypomnieniu sobie treści.</p>
      </div>
      <div className="card">
        <div className="row between">
          <div>
            <h3 style={{ margin: 0 }}>Uzupełnianie dialogu</h3>
            <p className="muted small" style={{ margin: 0 }}>{completionItems.length} zadań: wybierz albo wpisz brakującą linię.</p>
          </div>
          <button type="button" className="btn primary" onClick={() => setSession(completionItems)} disabled={completionItems.length === 0}>Ćwicz</button>
        </div>
      </div>
      <Link to={`/lekcje/${d.lessonId}`} className="btn mt">← {lessonLabel(d.lessonNumber)}</Link>
    </div>
  );
}
