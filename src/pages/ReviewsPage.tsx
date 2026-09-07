import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useStore } from '../learning/store';
import { buildSession, dashboardCounts, REVIEW_MODES, type ReviewMode, type SessionItem } from '../learning/session';
import { ExerciseRunner, RunnerSummaryView, type RunnerSummary } from '../exercises/ExerciseRunner';
import { Callout, Card, PageHeader, Pill } from '../components/ui';
import { isDue, masteryLevel } from '../learning/srs';

export function ReviewsPage() {
  const { state } = useStore();
  const counts = dashboardCounts(state);
  const items = Object.values(state.srs);
  const levels = { new: 0, learning: 0, young: 0, mature: 0 };
  for (const i of items) levels[masteryLevel(i)]++;
  const dueNow = items.filter((i) => isDue(i)).length;
  return (
    <div className="container">
      <PageHeader eyebrow="Powtórki" title="Powtórki rozłożone w czasie">
        <p>
          Każde słówko ma dwie karty (wietnamski → polski i polski → wietnamski) oraz własny termin następnej powtórki. Odstępy rosną po każdej udanej odpowiedzi (1 → 3 → ok. 7 → ok. 18 dni…) i wracają do zera po błędzie.
        </p>
      </PageHeader>
      <div className="stat-grid mb">
        <div className="stat warn"><b>{dueNow}</b><span>do powtórki teraz</span></div>
        <div className="stat"><b>{levels.learning}</b><span>w nauce (&lt; 3 dni)</span></div>
        <div className="stat primary"><b>{levels.young}</b><span>młode (3–20 dni)</span></div>
        <div className="stat ok"><b>{levels.mature}</b><span>dojrzałe (≥ 21 dni)</span></div>
      </div>
      <div className="grid">
        {REVIEW_MODES.map((m) => {
          const count = m.id === 'today' ? counts.due + counts.fresh + counts.mistakes : m.id === 'weak' ? counts.weak + counts.mistakes : m.id === 'mistakes' ? counts.mistakes : m.id === 'overdue' || m.id === 'vocab' ? counts.due : undefined;
          return (
            <Card key={m.id} to={`/powtorki/${m.id}`}>
              <div className="card-title">
                <span className="card-icon">{m.icon}</span>
                {m.label}
                {count !== undefined && <Pill tone={count > 0 ? 'accent' : ''}>{count}</Pill>}
              </div>
              <p className="muted small" style={{ margin: 0 }}>{m.description}</p>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

export function ReviewSessionPage() {
  const { mode } = useParams();
  const navigate = useNavigate();
  const { state } = useStore();
  const [summary, setSummary] = useState<RunnerSummary | null>(null);
  const [retry, setRetry] = useState<SessionItem[] | null>(null);
  const [round, setRound] = useState(0);
  const reviewMode = (REVIEW_MODES.some((m) => m.id === mode) ? mode : 'today') as ReviewMode;
  // Build the plan once from the state at the start of the session.
  const plan = useMemo(() => buildSession(state, reviewMode), [reviewMode]); // eslint-disable-line react-hooks/exhaustive-deps
  const info = REVIEW_MODES.find((m) => m.id === reviewMode)!;

  // /powtorki/:mode stays on the same route component when the mode chip
  // changes in place (e.g. via back/forward, or a Link to a different mode
  // while a session is active) — reset local session state so a stale
  // ExerciseRunner instance never keeps showing the previous mode's items.
  useEffect(() => {
    setSummary(null);
    setRetry(null);
    setRound(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewMode]);

  if (plan.items.length === 0) {
    return (
      <div className="container narrow">
        <PageHeader title={`${info.icon} ${info.label}`} />
        <Callout>
          Nic do powtórki w tym trybie. {reviewMode === 'today' ? 'Otwórz nową lekcję, aby wprowadzić nowe słówka, albo wróć jutro.' : ''}
        </Callout>
        <div className="row mt">
          <Link to="/powtorki" className="btn">← Tryby powtórki</Link>
          <Link to="/lekcje" className="btn primary">Lekcje</Link>
        </div>
      </div>
    );
  }

  if (summary) {
    const wrong = summary.results.filter((r) => r.outcome !== 'correct').map((r) => r.item);
    return (
      <div className="container">
        <RunnerSummaryView summary={summary} onRepeatMistakes={wrong.length ? () => { setRetry(wrong); setSummary(null); setRound((r) => r + 1); } : undefined} onClose={() => navigate('/')} closeLabel="Wróć do pulpitu" />
      </div>
    );
  }

  return (
    <div className="container">
      {!retry && round === 0 && (
        <div className="row" style={{ justifyContent: 'center', marginBottom: '0.5rem' }}>
          {plan.summary.due > 0 && <Pill tone="warn">{plan.summary.due} zaległych</Pill>}
          {plan.summary.new > 0 && <Pill tone="primary">{plan.summary.new} nowych</Pill>}
          {plan.summary.mistakes > 0 && <Pill tone="accent">{plan.summary.mistakes} z błędów</Pill>}
          {plan.summary.grammar > 0 && <Pill>{plan.summary.grammar} gramatyka</Pill>}
          {plan.summary.productive > 0 && <Pill>{plan.summary.productive} produkcja</Pill>}
        </div>
      )}
      <ExerciseRunner key={`${reviewMode}-${round}`} items={retry ?? plan.items} title={`${info.icon} ${info.label}`} sessionKind={`review:${reviewMode}`} onExit={() => navigate('/powtorki')} onFinish={setSummary} />
    </div>
  );
}
