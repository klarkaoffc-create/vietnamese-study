import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { grammarById, lessonById, lessonByNumber, lessonLabel, lessons } from '../data/content';
import type { Exercise, OriginalBlock } from '../data/schema';
import { useStore } from '../learning/store';
import { makeSrsId, mastery, masteryLevel } from '../learning/srs';
import { Callout, PageHeader, Pill, Progress, StatusTag, Vi } from '../components/ui';
import { DialogueView, type DialogueMode } from '../components/DialogueView';
import { AudioButton } from '../components/AudioButton';

const withBase = (src: string) => `${import.meta.env.BASE_URL}${src.replace(/^\//, '')}`;

const TYPE_LABEL: Record<Exercise['type'], string> = {
  mcq: 'wybór',
  typed: 'wpisywanie',
  'fill-blank': 'luka',
  matching: 'dopasowanie',
  ordering: 'szyk zdania',
  'error-correction': 'poprawianie błędu',
  diacritics: 'znaki i tony',
  'reading-question': 'czytanie',
  'dialogue-completion': 'dialog',
  generator: 'generator',
  'open-answer': 'własna odpowiedź',
  speaking: 'mówienie',
};

export function LessonPage() {
  const { id } = useParams();
  const { state, dispatch } = useStore();
  const lesson = id ? lessonById.get(id) : undefined;
  const [showTranslation, setShowTranslation] = useState<Record<string, boolean>>({});
  const [dialogueMode, setDialogueMode] = useState<Record<string, DialogueMode>>({});

  useEffect(() => {
    if (lesson) dispatch({ type: 'visit-lesson', lesson: lesson.id });
  }, [lesson, dispatch]);

  if (!lesson) {
    return (
      <div className="container">
        <Callout tone="bad">Nie znaleziono lekcji „{id}”.</Callout>
        <Link to="/lekcje">← Lekcje</Link>
      </div>
    );
  }
  const lp = state.lessons[lesson.id];
  const completed = !!lp?.completed;
  const prev = lessonByNumber.get(lesson.number - 1);
  const next = lessonByNumber.get(lesson.number + 1);
  const generatorExercises = lesson.exercises.filter((e) => e.type === 'generator');
  const otherExercises = lesson.exercises.filter((e) => e.type !== 'generator');
  const lastCp = lp?.checkpoints?.[lp.checkpoints.length - 1];
  const vocabMastery = lesson.vocabulary.filter((v) => v.srs).map((v) => mastery(state.srs[makeSrsId('vocab-active', v.id)] ?? { successes: 0, failures: 0, interval: 0, lapses: 0 } as never));
  const avg = vocabMastery.length ? Math.round(vocabMastery.reduce((a, b) => a + b, 0) / vocabMastery.length) : 0;

  const toc = [
    ['cele', 'Cele'],
    ['slownictwo', 'Słownictwo'],
    ['gramatyka', 'Gramatyka'],
    lesson.dialogues.length ? ['dialogi', 'Dialogi'] : null,
    lesson.readings.length ? ['czytanki', 'Czytanki'] : null,
    lesson.pronunciation.length ? ['wymowa', 'Wymowa'] : null,
    ['cwiczenia', 'Ćwiczenia'],
    ['checkpoint', 'Checkpoint'],
    lesson.reviewLinks.length ? ['powtorka', 'Powtórz wcześniej'] : null,
    ['oryginal', 'Materiał nauczycielki'],
  ].filter(Boolean) as [string, string][];

  return (
    <div className="container">
      <PageHeader eyebrow={`${lessonLabel(lesson.number)} · ${lesson.sourceFile}`} title={<>{lesson.icon} {lesson.title}</>}>
        <p>{lesson.summary}</p>
        <div className="row">
          <Pill tone={completed ? 'ok' : 'primary'}>{completed ? '✓ ukończona' : 'w trakcie'}</Pill>
          <Pill>{lesson.vocabulary.length} słówek · {avg}% opanowania</Pill>
          {lastCp && <Pill tone={lastCp.score / lastCp.total >= 0.8 ? 'ok' : 'warn'}>ostatni checkpoint {Math.round((lastCp.score / lastCp.total) * 100)}%</Pill>}
          {lesson.draft && <Pill tone="warn">szkic – do przejrzenia</Pill>}
          <span className="spacer" />
          <Link to={`/cwicz?lesson=${lesson.id}&set=all`} className="btn sm">Ćwicz całą lekcję</Link>
          <Link to={`/cwicz?lesson=${lesson.id}&set=vocab`} className="btn sm">Słówka</Link>
          <button type="button" className={`btn sm ${completed ? '' : 'primary'}`} onClick={() => dispatch({ type: 'complete-lesson', lesson: lesson.id, completed: !completed })}>
            {completed ? 'Oznacz jako nieukończoną' : 'Oznacz jako ukończoną'}
          </button>
        </div>
      </PageHeader>

      <div className="lesson-layout">
        <aside className="lesson-toc">
          {toc.map(([a, label]) => (
            <a key={a} href={`#${a}`}>{label}</a>
          ))}
        </aside>
        <div className="stack">
          <section id="cele" className="lesson-section card">
            <h2>Po tej lekcji potrafię…</h2>
            <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
              {lesson.objectives.map((o, i) => (
                <li key={i}>{o}</li>
              ))}
            </ul>
          </section>

          <section id="slownictwo" className="lesson-section card">
            <div className="row between">
              <h2>Kluczowe słownictwo</h2>
              <Link to={`/cwicz?lesson=${lesson.id}&set=vocab`} className="btn sm">Ćwicz słówka</Link>
            </div>
            <div className="vocab-list">
              {lesson.vocabulary.map((v) => {
                const item = state.srs[makeSrsId('vocab-active', v.id)];
                const level = masteryLevel(item);
                return (
                  <div key={v.id} className="vocab-item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '0.2rem' }}>
                    <div className="row between" style={{ gap: '0.4rem' }}>
                      <span className="vi"><Vi>{v.vi}</Vi></span>
                      <span className="row" style={{ gap: '0.3rem' }}>
                        {v.classifier && <Pill>kl. {v.classifier}</Pill>}
                        {v.status === 'flagged' && <Pill tone="warn">⚠</Pill>}
                        <Pill tone={level === 'mature' ? 'ok' : level === 'young' ? 'primary' : level === 'learning' ? 'warn' : ''}>{item ? `${mastery(item)}%` : 'nowe'}</Pill>
                        <AudioButton targetId={v.id} text={v.vi} />
                      </span>
                    </div>
                    <span className="pl">{v.pl}</span>
                    {v.note && <span className="muted tiny">{v.note}</span>}
                    {v.dialect && <span className="muted tiny">{v.dialect}</span>}
                    {v.examples[0] && (
                      <span className="tiny"><Vi>{v.examples[0].vi}</Vi>{v.examples[0].pl && <span className="muted"> – {v.examples[0].pl}</span>}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <section id="gramatyka" className="lesson-section stack">
            <h2 style={{ margin: 0 }}>Gramatyka i wzorce</h2>
            {lesson.grammar.map((g) => {
              const item = state.srs[makeSrsId('grammar', g.id)];
              return (
                <div key={g.id} className="card" id={g.id}>
                  <div className="row between">
                    <h3 style={{ margin: 0 }}>{g.title}</h3>
                    <span className="row">
                      {item && <Pill tone={mastery(item) >= 70 ? 'ok' : 'warn'}>{mastery(item)}%</Pill>}
                      {g.status === 'flagged' && <Pill tone="warn">⚠ do weryfikacji</Pill>}
                      <Link to={`/cwicz?grammar=${g.id}`} className="btn sm">Ćwicz</Link>
                    </span>
                  </div>
                  {g.pattern && <Callout><Vi>{g.pattern}</Vi></Callout>}
                  {g.explanation.split('\n\n').map((p, i) => (
                    <p key={i} style={{ marginTop: '0.6rem' }}>{p}</p>
                  ))}
                  {g.examples.length > 0 && (
                    <div style={{ marginTop: '0.5rem' }}>
                      <div className="muted tiny" style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>Przykłady</div>
                      {g.examples.map((ex, i) => (
                        <div key={i} className="example">
                          <span><Vi>{ex.vi}</Vi> {ex.status === 'flagged' && <Pill tone="warn">⚠ do weryfikacji</Pill>}</span>
                          {ex.pl && <span className="pl">{ex.pl}</span>}
                          {ex.note && <span className="muted tiny">{ex.note}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </section>

          {lesson.dialogues.length > 0 && (
            <section id="dialogi" className="lesson-section stack">
              <h2 style={{ margin: 0 }}>Dialogi</h2>
              {lesson.dialogues.map((d) => {
                const mode = dialogueMode[d.id] ?? 'read';
                return (
                  <div key={d.id} className="card">
                    <div className="row between">
                      <div>
                        <h3 style={{ margin: 0 }}>{d.title}</h3>
                        {d.situation && <div className="muted small">{d.situation}</div>}
                      </div>
                      <Link to={`/dialogi/${d.id}`} className="btn sm">Trener dialogu</Link>
                    </div>
                    <div className="chips" style={{ margin: '0.6rem 0' }}>
                      {(['read', 'hide-a', 'hide-b', 'recall'] as DialogueMode[]).map((m) => (
                        <button key={m} type="button" className={`chip ${mode === m ? 'on' : ''}`} onClick={() => setDialogueMode({ ...dialogueMode, [d.id]: m })}>
                          {m === 'read' ? 'Czytaj' : m === 'hide-a' ? 'Ukryj A' : m === 'hide-b' ? 'Ukryj B' : 'Przypomnij sobie'}
                        </button>
                      ))}
                    </div>
                    <DialogueView key={mode} dialogue={d} mode={mode} />
                  </div>
                );
              })}
            </section>
          )}

          {lesson.readings.length > 0 && (
            <section id="czytanki" className="lesson-section stack">
              <h2 style={{ margin: 0 }}>Czytanki</h2>
              {lesson.readings.map((r) => (
                <div key={r.id} className="card">
                  <div className="row between">
                    <h3 style={{ margin: 0 }}>{r.title}</h3>
                    <span className="row">
                      {r.status === 'flagged' && <Pill tone="warn">⚠ fragmenty do weryfikacji</Pill>}
                      {r.translation && (
                        <button type="button" className="btn sm" onClick={() => setShowTranslation({ ...showTranslation, [r.id]: !showTranslation[r.id] })}>
                          {showTranslation[r.id] ? 'Ukryj tłumaczenie' : 'Pokaż tłumaczenie'}
                        </button>
                      )}
                    </span>
                  </div>
                  <div className="reading-box" lang="vi">
                    {r.paragraphs.map((p, i) => (
                      <p key={i}>{p}</p>
                    ))}
                  </div>
                  {showTranslation[r.id] && r.translation && (
                    <div className="muted small">
                      {r.translation.map((p, i) => (
                        <p key={i}>{p}</p>
                      ))}
                    </div>
                  )}
                  {r.note && <Callout tone="warn">{r.note}</Callout>}
                </div>
              ))}
            </section>
          )}

          {lesson.pronunciation.length > 0 && (
            <section id="wymowa" className="lesson-section card">
              <h2>Wymowa</h2>
              {lesson.pronunciation.map((p) => (
                <div key={p.id} style={{ marginBottom: '0.75rem' }}>
                  <h3>{p.title}</h3>
                  <p>{p.body}</p>
                </div>
              ))}
              <Link to="/tony" className="btn sm">Laboratorium tonów →</Link>
            </section>
          )}

          {lesson.images.length > 0 && (
            <section className="card">
              <h2>Obrazki z lekcji</h2>
              <div className="grid">
                {lesson.images.map((im) => (
                  <figure key={im.src} style={{ margin: 0 }}>
                    <img src={withBase(im.src)} alt={im.alt} style={{ borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }} />
                    {im.caption && <figcaption className="muted small">{im.caption}</figcaption>}
                  </figure>
                ))}
              </div>
            </section>
          )}

          <section id="cwiczenia" className="lesson-section card">
            <div className="row between">
              <h2>Interaktywna praktyka</h2>
              <Link to={`/cwicz?lesson=${lesson.id}&set=all`} className="btn primary sm">Ćwicz wszystko</Link>
            </div>
            {generatorExercises.length > 0 && (
              <>
                <h3>Generatory (nowe zadania za każdym razem)</h3>
                <div className="chips mb">
                  {generatorExercises.map((e) => (
                    <Link key={e.id} to={`/cwicz?exercise=${e.id}`} className="chip">
                      ⚙ {e.instruction ?? e.generator}
                    </Link>
                  ))}
                </div>
              </>
            )}
            <h3>Zadania</h3>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Zadanie</th>
                    <th>Typ</th>
                    <th>Źródło</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {otherExercises.map((e) => (
                    <tr key={e.id}>
                      <td>{'prompt' in e ? e.prompt : 'sentence' in e ? e.sentence : 'stripped' in e ? e.stripped : 'wrong' in e ? e.wrong : e.id}</td>
                      <td><Pill>{TYPE_LABEL[e.type]}</Pill></td>
                      <td><StatusTag status={e.status} source={e.source} /></td>
                      <td><Link to={`/cwicz?exercise=${e.id}`} className="btn sm">Ćwicz</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section id="checkpoint" className="lesson-section card" style={{ background: 'var(--primary-soft)', borderColor: 'transparent' }}>
            <div className="row between">
              <div>
                <h2 style={{ marginBottom: '0.2rem' }}>Checkpoint lekcji</h2>
                <p className="muted small" style={{ margin: 0 }}>{lesson.checkpoint.length} zadań z tej lekcji. 80 % oznacza lekcję jako ukończoną.</p>
                {lp?.checkpoints?.length ? (
                  <div className="row" style={{ marginTop: '0.4rem' }}>
                    {lp.checkpoints.slice(-5).map((c, i) => (
                      <Pill key={i} tone={c.score / c.total >= 0.8 ? 'ok' : 'warn'}>{Math.round((c.score / c.total) * 100)}%</Pill>
                    ))}
                  </div>
                ) : null}
              </div>
              <Link to={`/cwicz?lesson=${lesson.id}&set=checkpoint`} className="btn primary big">Rozpocznij checkpoint</Link>
            </div>
          </section>

          {lesson.reviewLinks.length > 0 && (
            <section id="powtorka" className="lesson-section card">
              <h2>Powtórz wcześniejszy materiał</h2>
              <div className="stack" style={{ gap: '0.4rem' }}>
                {lesson.reviewLinks.map((gid) => {
                  const g = grammarById.get(gid);
                  if (!g) return null;
                  const item = state.srs[makeSrsId('grammar', gid)];
                  return (
                    <div key={gid} className="row between" style={{ padding: '0.4rem 0', borderBottom: '1px dashed var(--border)' }}>
                      <span>
                        <Link to={`/lekcje/${g.lessonId}#${g.id}`}>{lessonLabel(g.lessonNumber)}: {g.title}</Link>
                        {g.pattern && <div className="muted tiny"><Vi>{g.pattern}</Vi></div>}
                      </span>
                      <span className="row">
                        {item && <Progress value={mastery(item)} thin />}
                        <Link to={`/cwicz?grammar=${g.id}`} className="btn sm">Ćwicz</Link>
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <section id="oryginal" className="lesson-section">
            <details className="disclosure">
              <summary>Materiał nauczycielki (oryginał, {lesson.sourceFile})</summary>
              <p className="muted small">Tekst przepisany z dokumentu bez poprawek. Literówki i wątpliwe formy są wypisane w CONTENT_REVIEW.md.</p>
              <div className="stack" style={{ gap: '0.6rem' }}>
                {lesson.original.map((b, i) => (
                  <OriginalBlockView key={i} block={b} />
                ))}
              </div>
            </details>
          </section>

          <div className="row between">
            {prev ? <Link to={`/lekcje/${prev.id}`} className="btn">← {lessonLabel(prev.number)}</Link> : <span />}
            {next ? <Link to={`/lekcje/${next.id}`} className="btn">{lessonLabel(next.number)} →</Link> : <span className="muted small">To ostatnia lekcja ({lessons.length}).</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

export function OriginalBlockView({ block }: { block: OriginalBlock }) {
  switch (block.kind) {
    case 'heading':
      return <h4 style={{ margin: '0.5rem 0 0' }}>{block.text}</h4>;
    case 'paragraph':
      return <div className="original-block" lang="vi">{block.text}</div>;
    case 'table':
      return (
        <div className="table-wrap">
          <table className="table" lang="vi">
            <tbody>
              {block.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((c, j) => (
                    <td key={j}>{c}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'image':
      return (
        <figure style={{ margin: 0 }}>
          <img src={withBase(block.image.src)} alt={block.image.alt} style={{ maxHeight: 320, borderRadius: 'var(--radius-sm)' }} />
          {block.image.caption && <figcaption className="muted small">{block.image.caption}</figcaption>}
        </figure>
      );
  }
}
