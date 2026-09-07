import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { allDialogues, dialogueById, lessonById, lessonLabel, scenariosForLessons } from '../data/content';
import type { Exercise } from '../data/schema';
import type { SessionItem } from '../learning/session';
import { dialogueTask, scenarioTask } from '../learning/tasks';
import { makeSrsId, type AutomaticityLevel } from '../learning/srs';
import { useStore } from '../learning/store';
import { ExerciseRunner, RunnerSummaryView, type RunnerSummary } from '../exercises/ExerciseRunner';
import { DialogueView } from '../components/DialogueView';
import { Callout, Card, PageHeader, Pill, Vi } from '../components/ui';

export function DialoguesPage() {
  return (
    <div className="container">
      <PageHeader eyebrow="Dialogi" title="Trener rozmowy">
        <p>
          Każdy dialog przechodzi przez pięć poziomów — od czytania z tłumaczeniem aż po odgrywanie sytuacji, w której musisz sam(a) sformułować
          wypowiedź. To jest najbliższa symulacja prawdziwej rozmowy, jaką da się zrobić bez rozmówcy.
        </p>
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

/** The five progressive stages of working with one conversation. */
const LEVELS = [
  { n: 1, label: 'Czytaj', hint: 'Wietnamski z podporą polską.' },
  { n: 2, label: 'Rozumiej', hint: 'Tylko wietnamski, bez tłumaczenia.' },
  { n: 3, label: 'Uzupełnij', hint: 'Ukryte wypowiedzi jednej strony — odsłaniasz po przypomnieniu.' },
  { n: 4, label: 'Odpowiadaj', hint: 'Widzisz tylko replikę rozmówcy i piszesz odpowiedź.' },
  { n: 5, label: 'Odegraj', hint: 'Dostajesz samą sytuację — całą wypowiedź formułujesz sam(a).' },
] as const;

export function DialogueTrainerPage() {
  const { id } = useParams();
  const { state } = useStore();
  const d = id ? dialogueById.get(id) : undefined;
  const [level, setLevel] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [session, setSession] = useState<SessionItem[] | null>(null);
  const [summary, setSummary] = useState<RunnerSummary | null>(null);

  useEffect(() => {
    setSession(null);
    setSummary(null);
    setLevel(1);
  }, [id]);

  /** Levels 4–5 are practised as graded tasks, not as reading modes. */
  const practiceItems = useMemo(() => {
    if (!d) return [];
    const items: SessionItem[] = [];
    if (level === 5) {
      // Roleplay: situations from the same lesson, no target sentence given.
      const lessonNumber = lessonById.get(d.lessonId)?.number ?? 1;
      for (const s of scenariosForLessons([lessonNumber])) {
        items.push({ kind: 'task', task: scenarioTask(s, 5, 'conversation') });
      }
    }
    // Respond to each answerable line at the chosen amount of scaffolding.
    d.lines.forEach((line, i) => {
      if (i === 0 || line.status === 'flagged') return;
      const lvl = (level >= 4 ? 4 : Math.max(1, level)) as AutomaticityLevel;
      const t = dialogueTask(d, i, lvl, 'conversation');
      if (t) items.push({ kind: 'task', task: t });
    });
    return items;
  }, [d, level]);

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
        <ExerciseRunner items={session} title={`💬 ${d.title}`} sessionKind={`dialogue:L${level}`} onExit={() => setSession(null)} onFinish={setSummary} />
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

  const info = LEVELS.find((l) => l.n === level)!;
  const practised = d.lines.filter((_, i) => i > 0 && state.srs[makeSrsId('dialogue', `${d.id}#${i}`)]).length;

  return (
    <div className="container narrow">
      <PageHeader eyebrow={`Dialog · ${lessonLabel(d.lessonNumber)}`} title={d.title}>
        <p>{d.situation}</p>
        {practised > 0 && <Pill tone="ok">{practised} z {d.lines.length - 1} replik już ćwiczonych</Pill>}
      </PageHeader>

      <div className="card">
        <div className="chips mb">
          {LEVELS.map((l) => (
            <button key={l.n} type="button" className={`chip ${level === l.n ? 'on' : ''}`} onClick={() => setLevel(l.n)}>
              {l.n}. {l.label}
            </button>
          ))}
        </div>
        <Callout>{info.hint}</Callout>

        {level <= 3 ? (
          <div style={{ marginTop: '0.9rem' }}>
            <DialogueView
              key={level}
              dialogue={d}
              mode={level === 3 ? 'hide-b' : 'read'}
              showTranslation={level === 1}
            />
            {level === 3 && <p className="muted tiny mt">Kliknij ukrytą linię, aby ją odsłonić po przypomnieniu sobie treści.</p>}
            <div className="ex-actions">
              <button type="button" className="btn primary" onClick={() => setLevel((l) => (l < 5 ? ((l + 1) as typeof l) : l))}>
                Dalej: poziom {Math.min(5, level + 1)} →
              </button>
            </div>
          </div>
        ) : (
          <div style={{ marginTop: '0.9rem' }}>
            <p className="muted small">
              {level === 4
                ? 'Zobaczysz wyłącznie wypowiedź rozmówcy. Twoja odpowiedź jest oceniana i wpływa na terminy powtórek.'
                : 'Same sytuacje — bez gotowych zdań. Formułujesz całą wypowiedź od zera.'}
            </p>
            <div className="row">
              <Pill tone="primary">{practiceItems.length} zadań</Pill>
              <button type="button" className="btn primary" onClick={() => setSession(practiceItems)} disabled={practiceItems.length === 0}>
                Zacznij poziom {level}
              </button>
            </div>
            {practiceItems.length === 0 && <Callout tone="warn">Brak zadań na tym poziomie dla tego dialogu.</Callout>}
          </div>
        )}
      </div>

      <div className="card">
        <h3>Słowa kluczowe tej rozmowy</h3>
        <div className="chips">
          {[...new Set(d.lines.flatMap((l) => l.vi.split(/[\s,.!?]+/).filter((w) => w.length > 2)))].slice(0, 14).map((w, i) => (
            <span key={`${w}-${i}`} className="pill"><Vi>{w}</Vi></span>
          ))}
        </div>
      </div>

      <Link to={`/lekcje/${d.lessonId}`} className="btn mt">← {lessonLabel(d.lessonNumber)}</Link>
    </div>
  );
}

/** Kept for compatibility with authored dialogue-completion exercises. */
export type { Exercise };
