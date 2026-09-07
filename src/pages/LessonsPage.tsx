import { Link } from 'react-router-dom';
import { blocks, lessonById, lessonsInBlock, lessonLabel } from '../data/content';
import { useStore } from '../learning/store';
import { completedLessonNumbers } from '../learning/state';
import { Card, PageHeader, Pill, Progress } from '../components/ui';
import { makeSrsId, mastery } from '../learning/srs';

export function LessonsPage() {
  const { state } = useStore();
  const completed = completedLessonNumbers(state, (id) => lessonById.get(id)?.number);
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
                const vocabItems = l.vocabulary.filter((v) => v.srs).map((v) => state.srs[makeSrsId('vocab-active', v.id)]).filter(Boolean);
                const avg = vocabItems.length ? Math.round(vocabItems.reduce((a, i) => a + mastery(i), 0) / l.vocabulary.length) : 0;
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
                      {completed.has(l.number) ? <Pill tone="ok">✓ ukończona</Pill> : lp?.visited ? <Pill tone="primary">w trakcie</Pill> : <Pill>nowa</Pill>}
                      <Pill>{l.vocabulary.length} słówek · {avg}% opanowania</Pill>
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
