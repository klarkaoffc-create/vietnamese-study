import { Link } from 'react-router-dom';
import { useStore } from '../learning/store';
import { blocks, lessonById, lessonByNumber, lessons, lessonLabel, vocabById } from '../data/content';
import { currentLesson, dashboardCounts } from '../learning/session';
import { completedLessonNumbers, unresolvedMistakes } from '../learning/state';
import { isWeak, mastery } from '../learning/srs';
import { Card, PageHeader, Pill, Progress, Stat, Vi } from '../components/ui';
import { daysBetween, formatDate, relativeDays } from '../utilities/dates';
import { REVIEW_MODES } from '../learning/session';

function streakDays(sessionTs: number[], now = Date.now()): number {
  const days = new Set(sessionTs.map((t) => daysBetween(0, t)));
  let streak = 0;
  let d = daysBetween(0, now);
  if (!days.has(d)) d -= 1; // allow "yesterday" to keep the streak alive today
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
  const recentMistakes = unresolvedMistakes(state).slice(0, 5);
  const weakVocab = Object.values(state.srs)
    .filter((i) => i.kind.startsWith('vocab') && isWeak(i) && vocabById.has(i.ref))
    .sort((a, b) => mastery(a) - mastery(b))
    .slice(0, 6);
  const streak = streakDays(state.sessions.map((s) => s.ts));
  const todayStudied = state.sessions.filter((s) => daysBetween(s.ts, Date.now()) === 0).reduce((a, s) => a + s.items, 0);
  const nextDue = Object.values(state.srs)
    .filter((i) => i.due > Date.now())
    .sort((a, b) => a.due - b.due)[0];

  return (
    <div className="container">
      <PageHeader eyebrow="Dzisiaj" title={<>Xin chào! 👋</>}>
        <p>
          {counts.due > 0 ? `Masz ${counts.due} elementów do powtórki.` : 'Nic nie zalega – możesz uczyć się nowego materiału.'}
          {todayStudied > 0 && ` Dziś przećwiczono ${todayStudied} elementów.`}
          {streak > 1 && ` Seria: ${streak} dni z rzędu.`}
        </p>
      </PageHeader>

      <div className="card" style={{ background: 'var(--primary-soft)', borderColor: 'transparent' }}>
        <div className="row between">
          <div>
            <h2 style={{ marginBottom: '0.2rem' }}>Dzisiejsza powtórka</h2>
            <p className="muted small" style={{ margin: 0 }}>
              {counts.due} zaległych · {counts.fresh} nowych słówek · {counts.mistakes} błędów do przećwiczenia · zadania gramatyczne i produktywne
            </p>
          </div>
          <Link to="/powtorki/today" className="btn primary big">
            Zacznij dzisiejszą powtórkę →
          </Link>
        </div>
      </div>

      <div className="stat-grid mt">
        <Stat value={`${completed.size} / ${lessons.length}`} label="ukończone lekcje" tone="primary" />
        <Stat value={counts.due} label="do powtórki dziś" tone={counts.due > 0 ? 'warn' : 'ok'} />
        <Stat value={counts.weak} label="słabe elementy" tone={counts.weak > 0 ? 'bad' : 'ok'} />
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
              <Pill>{lesson.grammar.length} struktur</Pill>
            </div>
          </Card>
        )}
        {block && (
          <Card>
            <div className="eyebrow muted tiny" style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>Blok {block.index}</div>
            <div className="card-title">Do powtórki {block.fromLesson}–{block.toLesson}</div>
            <Progress value={blockDone} max={5} />
            <p className="muted small" style={{ marginTop: '0.5rem' }}>
              {blockDone} z 5 lekcji ukończonych.{' '}
              {block.reviewId ? (
                <Link to={`/egzaminy/powtorka/${block.reviewId}`}>Otwórz powtórkę →</Link>
              ) : block.complete ? (
                'Powtórka nauczycielki nie została jeszcze dodana.'
              ) : (
                `Powtórka i egzamin pojawią się po lekcji ${block.toLesson}.`
              )}
            </p>
            {block.examId && block.complete && (
              <Link to={`/egzaminy/${block.examId}`} className="btn sm">
                Egzamin {block.index} →
              </Link>
            )}
          </Card>
        )}
      </div>

      <div className="grid two mt">
        <Card>
          <div className="card-title">Słabe słownictwo</div>
          {weakVocab.length === 0 ? (
            <p className="muted small">Brak słabych słówek – świetnie.</p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: '1.1rem' }} className="small">
              {weakVocab.map((i) => {
                const v = vocabById.get(i.ref)!;
                return (
                  <li key={i.id}>
                    <Vi>{v.vi}</Vi> – {v.pl} <span className="muted">({mastery(i)}%)</span>
                  </li>
                );
              })}
            </ul>
          )}
          <Link to="/powtorki/weak" className="btn sm mt">Ćwicz słabe elementy</Link>
        </Card>
        <Card>
          <div className="card-title">Ostatnie błędy</div>
          {recentMistakes.length === 0 ? (
            <p className="muted small">Brak zapisanych błędów.</p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: '1.1rem' }} className="small">
              {recentMistakes.map((m) => (
                <li key={m.id}>
                  <span className="muted">{m.category}:</span> <Vi>{m.expected}</Vi>
                </li>
              ))}
            </ul>
          )}
          <Link to="/bledy" className="btn sm mt">Moje błędy</Link>
        </Card>
      </div>

      <div className="grid two mt">
        <Card>
          <div className="card-title">Ostatni egzamin</div>
          {lastExam ? (
            <>
              <div className="summary-big" style={{ fontSize: '2.2rem', textAlign: 'left' }}>{lastExam.percent}%</div>
              <p className="muted small">
                Egzamin {lastExam.block} · {formatDate(lastExam.ts)} · {lastExam.percent >= 80 ? 'próg opanowania osiągnięty' : 'poniżej progu 80 %'}
              </p>
              <Link to={`/egzaminy/wynik/${lastExam.id}`} className="btn sm">Zobacz wynik</Link>
            </>
          ) : (
            <p className="muted small">Nie zdawano jeszcze egzaminu. <Link to="/egzaminy">Egzaminy →</Link></p>
          )}
        </Card>
        <Card>
          <div className="card-title">Tryby powtórki</div>
          <div className="chips">
            {REVIEW_MODES.map((m) => (
              <Link key={m.id} to={`/powtorki/${m.id}`} className="chip">
                {m.icon} {m.label}
              </Link>
            ))}
          </div>
          {nextDue && counts.due === 0 && <p className="muted small mt">Najbliższa powtórka: {relativeDays(nextDue.due)}.</p>}
        </Card>
      </div>
    </div>
  );
}
