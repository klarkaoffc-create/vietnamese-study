import { Link } from 'react-router-dom';
import { blocks, lessonsInBlock, lessonLabel } from '../data/content';
import { useStore } from '../learning/store';
import { completedLessonNumbers, lessonStatus } from '../learning/progression';
import { isDeferredLesson } from '../learning/eligibility';
import { Card, PageHeader, Pill, Progress } from '../components/ui';

export function LessonsPage() {
  const { state } = useStore();
  const completed = completedLessonNumbers(state);
  return (
    <div className="container">
      <PageHeader eyebrow="Lekcje" title="Kurs w blokach po pięć lekcji">
        <p>Lekcje odpowiadają materiałom nauczycielki (Bài). Po każdym bloku pięciu lekcji jest powtórka i egzamin. Nic nie jest zablokowane – ucz się w swoim tempie.</p>
      </PageHeader>
      {blocks.map((b) => {
        const ls = lessonsInBlock(b);
        const done = b.lessons.filter((n) => completed.has(n)).length;
        return (
          <section key={b.index} className="mb">
            <div className="row between" style={{ marginBottom: '0.5rem' }}>
              <h2 style={{ margin: 0 }}>
                Blok {b.index}: Bài {b.fromLesson}–{b.toLesson}
              </h2>
              <div className="row">
                <Pill tone={done === 5 ? 'ok' : ''}>{done}/5 ukończone</Pill>
                {b.reviewId && (
                  <Link to={`/egzaminy/powtorka/${b.reviewId}`} className="btn sm">
                    Powtórka {b.fromLesson}–{b.toLesson}
                  </Link>
                )}
                {b.examId && b.complete && (
                  <Link to={`/egzaminy/${b.examId}`} className="btn sm">
                    Egzamin {b.index}
                  </Link>
                )}
              </div>
            </div>
            <div className="grid">
              {ls.map((l) => {
                // Progress is mastered required targets / all required targets,
                // so it moves by itself as the learner works anywhere in the app.
                const st = lessonStatus(state, l);
                // A lesson the course has not reached shows as future, never as
                // a misleading few percent picked up by accidental exposure.
                const deferred = isDeferredLesson(state, l.number);
                const avg = deferred ? 0 : st.percent;
                const lp = state.lessons[l.id];
                const lastCp = lp?.checkpoints?.[lp.checkpoints.length - 1];
                return (
                  <Card key={l.id} to={`/lekcje/${l.id}`}>
                    <div className="card-title">
                      <span className="card-icon">{l.icon}</span>
                      <span>
                        {lessonLabel(l.number)}
                        <div className="small muted" style={{ fontWeight: 400 }}>{l.title}</div>
                      </span>
                    </div>
                    <p className="muted small">{l.summary}</p>
                    <Progress value={avg} thin />
                    <div className="row" style={{ marginTop: '0.5rem' }}>
                      {deferred ? (
                        <Pill>🔒 później</Pill>
                      ) : st.complete ? (
                        <Pill tone="ok">✓ ukończona</Pill>
                      ) : st.percent > 0 || lp?.visited ? (
                        <Pill tone="primary">w trakcie</Pill>
                      ) : (
                        <Pill>nowa</Pill>
                      )}
                      <Pill>{l.vocabulary.length} słówek{deferred ? '' : ` · ${avg}% opanowania (${st.mastered}/${st.total})`}</Pill>
                      {lastCp && <Pill tone={lastCp.score / lastCp.total >= 0.8 ? 'ok' : 'warn'}>checkpoint {Math.round((lastCp.score / lastCp.total) * 100)}%</Pill>}
                      {l.draft && <Pill tone="warn">szkic</Pill>}
                    </div>
                  </Card>
                );
              })}
              {!b.complete && (
                <div className="card muted small" style={{ borderStyle: 'dashed', display: 'grid', placeItems: 'center' }}>
                  Kolejne lekcje pojawią się po zaimportowaniu Bài {Math.max(...b.lessons, b.fromLesson - 1) + 1}.
                </div>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
