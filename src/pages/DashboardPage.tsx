import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../learning/store';
import { blocks, lessonById, lessonByNumber, lessons, lessonLabel, vocabById } from '../data/content';
import { buildSession, currentLesson, dashboardCounts, REVIEW_MODES } from '../learning/session';
import { phaseLabel } from '../learning/tasks';
import { completedLessonNumbers, unresolvedMistakes } from '../learning/state';
import { isWeak, mastery } from '../learning/srs';
import { passiveOnlyVocab, skillScores } from '../learning/skills';
import { Card, PageHeader, Pill, Progress, Stat, Vi } from '../components/ui';
import { daysBetween, formatDate } from '../utilities/dates';

function streakDays(sessionTs: number[], now = Date.now()): number {
  const days = new Set(sessionTs.map((t) => daysBetween(0, t)));
  let streak = 0;
  let d = daysBetween(0, now);
  if (!days.has(d)) d -= 1;
  while (days.has(d)) {
    streak++;
    d--;
  }
  return streak;
}

export function DashboardPage() {
  const { state } = useStore();
  const counts = dashboardCounts(state);
  const cur = currentLesson(state);
  const lesson = lessonByNumber.get(cur) ?? lessons[0];
  const completed = completedLessonNumbers(state, (id) => lessonById.get(id)?.number);
  const block = blocks.find((b) => cur >= b.fromLesson && cur <= b.toLesson) ?? blocks[0];
  const blockDone = block ? block.lessons.filter((n) => completed.has(n)).length : 0;
  const lastExam = state.exams[0];
  const recentMistakes = unresolvedMistakes(state).slice(0, 4);
  const skills = skillScores(state);
  const active = skills.find((s) => s.id === 'vocab-active')!;
  const passiveOnly = passiveOnlyVocab(state).slice(0, 6);
  const weak = Object.values(state.srs)
    .filter((i) => isWeak(i) && (i.kind !== 'vocab-active' || vocabById.has(i.ref)))
    .sort((a, b) => mastery(a) - mastery(b))
    .slice(0, 5);
  const streak = streakDays(state.sessions.map((s) => s.ts));
  const todayStudied = state.sessions.filter((s) => daysBetween(s.ts, Date.now()) === 0).reduce((a, s) => a + s.items, 0);

  // Preview of what today's session will actually contain.
  const plan = useMemo(() => buildSession(state, 'today'), [state]);

  return (
    <div className="container">
      <PageHeader eyebrow="Dzisiaj" title={<>Xin chào! 👋</>}>
        <p>
          {plan.items.length > 0
            ? `Dzisiejsza sesja: ${plan.items.length} zadań, około ${plan.estimatedMinutes} minut mówienia i pisania po wietnamsku.`
            : 'Otwórz lekcję, żeby wprowadzić nowy materiał do ćwiczeń.'}
          {todayStudied > 0 && ` Dziś wykonano już ${todayStudied} zadań.`}
          {streak > 1 && ` Seria: ${streak} dni.`}
        </p>
      </PageHeader>

      <div className="card" style={{ background: 'var(--primary-soft)', borderColor: 'transparent' }}>
        <div className="row between">
          <div style={{ minWidth: 0 }}>
            <h2 style={{ marginBottom: '0.2rem' }}>Dzisiejsza sesja</h2>
            <p className="muted small" style={{ margin: '0 0 0.5rem' }}>
              Mieszany trening: rozgrzewka, przypominanie zdań, rozmowa, gramatyka w użyciu, twoje błędy i swobodna wypowiedź.
            </p>
            <div className="row">
              {plan.phases.map((p) => (
                <Pill key={p.phase}>{phaseLabel(p.phase)} · {p.count}</Pill>
              ))}
            </div>
          </div>
          <Link to="/powtorki/today" className="btn primary big">
            Zacznij dzisiejszą sesję →
          </Link>
        </div>
      </div>

      <div className="stat-grid mt">
        <Stat value={`${active.percent}%`} label="słownictwo aktywne (potrafię użyć)" tone="primary" />
        <Stat value={counts.due} label="umiejętności do powtórki" tone={counts.due > 0 ? 'warn' : 'ok'} />
        <Stat value={`${completed.size}/${lessons.length}`} label="ukończone lekcje" />
        <Stat value={counts.mistakes} label="otwarte błędy" tone={counts.mistakes > 0 ? 'warn' : 'ok'} />
      </div>

      <div className="grid two mt">
        {lesson && (
          <Card to={`/lekcje/${lesson.id}`}>
            <div className="eyebrow muted tiny" style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>Bieżąca lekcja</div>
            <div className="card-title">
              <span className="card-icon">{lesson.icon}</span>
              {lessonLabel(lesson.number)} · {lesson.title}
            </div>
            <p className="muted small">{lesson.summary}</p>
            <div className="row">
              <Pill tone={completed.has(lesson.number) ? 'ok' : 'primary'}>{completed.has(lesson.number) ? 'ukończona' : 'w trakcie'}</Pill>
              <Pill>{lesson.vocabulary.length} słówek</Pill>
            </div>
          </Card>
        )}
        {block && (
          <Card>
            <div className="eyebrow muted tiny" style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>Blok {block.index}</div>
            <div className="card-title">Bài {block.fromLesson}–{block.toLesson}</div>
            <Progress value={blockDone} max={5} />
            <p className="muted small" style={{ marginTop: '0.5rem' }}>
              {blockDone} z 5 lekcji ukończonych.{' '}
              {block.reviewId ? (
                <Link to={`/egzaminy/powtorka/${block.reviewId}`}>Otwórz powtórkę →</Link>
              ) : block.complete ? (
                'Powtórka nauczycielki nie została jeszcze dodana.'
              ) : (
                `Powtórka i egzamin po lekcji ${block.toLesson}.`
              )}
            </p>
          </Card>
        )}
      </div>

      <div className="grid two mt">
        <Card>
          <div className="card-title">Rozumiem, ale jeszcze nie mówię</div>
          <p className="muted small" style={{ marginTop: 0 }}>
            Słowa, które rozpoznajesz, ale których nie potrafisz jeszcze sam(a) użyć. To jest luka do domknięcia.
          </p>
          {passiveOnly.length === 0 ? (
            <p className="muted small">Brak takich słów — rozumienie i produkcja idą w parze.</p>
          ) : (
            <div className="chips">
              {passiveOnly.map((id) => {
                const v = vocabById.get(id)!;
                return (
                  <Link key={id} to={`/cwicz?vocab=${id}`} className="chip">
                    <Vi>{v.vi}</Vi>
                  </Link>
                );
              })}
            </div>
          )}
          <Link to="/powtorki/production" className="btn sm mt">Ćwicz produkcję</Link>
        </Card>
        <Card>
          <div className="card-title">Ostatnie błędy</div>
          {recentMistakes.length === 0 ? (
            <p className="muted small">Brak zapisanych błędów.</p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: '1.1rem' }} className="small">
              {recentMistakes.map((m) => (
                <li key={m.id}>
                  <span className="muted">{m.category}:</span> <Vi>{m.expected || m.prompt}</Vi>
                </li>
              ))}
            </ul>
          )}
          <Link to="/bledy" className="btn sm mt">Moje błędy</Link>
        </Card>
      </div>

      <div className="grid two mt">
        <Card>
          <div className="card-title">Słabe miejsca</div>
          {weak.length === 0 ? (
            <p className="muted small">Nic nie odstaje — świetnie.</p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: '1.1rem' }} className="small">
              {weak.map((i) => {
                const v = vocabById.get(i.ref);
                return (
                  <li key={i.id}>
                    {v ? <Vi>{v.vi}</Vi> : i.ref} <span className="muted">({mastery(i)}%)</span>
                  </li>
                );
              })}
            </ul>
          )}
          <Link to="/powtorki/weak" className="btn sm mt">Ćwicz słabe miejsca</Link>
        </Card>
        <Card>
          <div className="card-title">Tryby ćwiczeń</div>
          <div className="chips">
            {REVIEW_MODES.filter((m) => m.id !== 'today').map((m) => (
              <Link key={m.id} to={`/powtorki/${m.id}`} className="chip">
                {m.icon} {m.label}
              </Link>
            ))}
          </div>
          {lastExam && (
            <p className="muted small mt">
              Ostatni egzamin: {lastExam.percent}% ({formatDate(lastExam.ts)}) ·{' '}
              <Link to={`/egzaminy/wynik/${lastExam.id}`}>szczegóły</Link>
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
