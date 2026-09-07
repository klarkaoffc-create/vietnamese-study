import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useStore } from '../learning/store';
import { buildSession, dashboardCounts, REVIEW_MODES, type ReviewMode, type SessionItem } from '../learning/session';
import { phaseLabel } from '../learning/tasks';
import { ExerciseRunner, RunnerSummaryView, type RunnerSummary } from '../exercises/ExerciseRunner';
import { Callout, Card, PageHeader, Pill, Progress } from '../components/ui';
import { skillScores } from '../learning/skills';

export function ReviewsPage() {
  const { state } = useStore();
  const counts = dashboardCounts(state);
  const skills = skillScores(state);
  const production = skills.find((s) => s.id === 'vocab-active');
  const passive = skills.find((s) => s.id === 'vocab-passive');

  return (
    <div className="container">
      <PageHeader eyebrow="Powtórki" title="Ćwiczenie języka, nie fiszek">
        <p>
          Każda powtórka to zadania, w których coś <strong>tworzysz</strong> — zdanie, odpowiedź w rozmowie, reakcję na sytuację. Terminy powtórek
          planuje ten sam system odstępów co wcześniej, ale planuje umiejętności, a nie karty ze słówkami.
        </p>
      </PageHeader>

      {production && passive && (
        <div className="card mb">
          <div className="row between">
            <div>
              <h3 style={{ margin: 0 }}>Aktywne vs bierne</h3>
              <p className="muted small" style={{ margin: 0 }}>
                Rozumienie rośnie szybciej niż umiejętność mówienia — celem jest domknięcie tej różnicy.
              </p>
            </div>
          </div>
          <div className="row mt" style={{ gap: '1.5rem', alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <div className="row between small"><span>Potrafię użyć</span><b>{production.percent}%</b></div>
              <Progress value={production.percent} tone={production.percent >= 60 ? 'ok' : undefined} />
            </div>
            <div style={{ flex: 1 }}>
              <div className="row between small"><span>Rozumiem</span><b>{passive.percent}%</b></div>
              <Progress value={passive.percent} thin />
            </div>
          </div>
        </div>
      )}

      <div className="grid">
        {REVIEW_MODES.map((m) => {
          const count =
            m.id === 'today' ? counts.due + counts.fresh : m.id === 'mistakes' ? counts.mistakes : m.id === 'weak' ? counts.weak : undefined;
          return (
            <Card key={m.id} to={`/powtorki/${m.id}`}>
              <div className="card-title">
                <span className="card-icon">{m.icon}</span>
                {m.label}
                {count !== undefined && count > 0 && <Pill tone="accent">{count}</Pill>}
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
  const plan = useMemo(() => buildSession(state, reviewMode), [reviewMode]); // eslint-disable-line react-hooks/exhaustive-deps
  const info = REVIEW_MODES.find((m) => m.id === reviewMode)!;

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
          {reviewMode === 'listening'
            ? 'Brak zadań ze słuchu — pojawią się, gdy dodasz prawdziwe nagrania (zob. content/audio/README.md).'
            : reviewMode === 'mistakes'
              ? 'Nie masz otwartych błędów. To dobra wiadomość.'
              : 'Nic tu teraz nie czeka. Otwórz nową lekcję albo wróć jutro.'}
        </Callout>
        <div className="row mt">
          <Link to="/powtorki" className="btn">← Tryby ćwiczeń</Link>
          <Link to="/lekcje" className="btn primary">Lekcje</Link>
        </div>
      </div>
    );
  }

  if (summary) {
    const wrong = summary.results.filter((r) => r.outcome !== 'correct').map((r) => r.item);
    return (
      <div className="container">
        <RunnerSummaryView
          summary={summary}
          onRepeatMistakes={wrong.length ? () => { setRetry(wrong); setSummary(null); setRound((r) => r + 1); } : undefined}
          onClose={() => navigate('/')}
          closeLabel="Wróć do pulpitu"
        />
      </div>
    );
  }

  return (
    <div className="container">
      {!retry && round === 0 && plan.phases.length > 0 && (
        <div className="row" style={{ justifyContent: 'center', marginBottom: '0.5rem' }}>
          {plan.phases.map((p) => (
            <Pill key={p.phase}>{phaseLabel(p.phase)} · {p.count}</Pill>
          ))}
          <Pill tone="primary">~{plan.estimatedMinutes} min</Pill>
        </div>
      )}
      <ExerciseRunner
        key={`${reviewMode}-${round}`}
        items={retry ?? plan.items}
        title={`${info.icon} ${info.label}`}
        sessionKind={`review:${reviewMode}`}
        onExit={() => navigate('/powtorki')}
        onFinish={setSummary}
      />
    </div>
  );
}
