import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { blocks, examBlueprints, exerciseById, lessonById, lessonLabel, lessonsInBlock, reviews, allExercises } from '../data/content';
import { useStore } from '../learning/store';
import { completedLessonNumbers, type ExamAnswerRecord, type ExamAttempt } from '../learning/state';
import { sampleExam, MASTERY_THRESHOLD, type ExamQuestion } from '../learning/exam';
import { grade as gradeTask, type GradeResult, type UserAnswer } from '../learning/grading';
import { ExerciseView, answerToText, taskPrompt, type Task } from '../exercises/ExerciseView';
import { ExerciseRunner, RunnerSummaryView, type RunnerSummary } from '../exercises/ExerciseRunner';
import { expandExercise, type SessionItem } from '../learning/session';
import { Callout, Card, PageHeader, Pill, Progress, Stat, Vi } from '../components/ui';
import { randomSeed } from '../utilities/random';
import { formatDate } from '../utilities/dates';
import { CATEGORY_LABEL } from './MistakesPage';
import { OriginalBlockView } from './LessonPage';

/* ------------------------------------------------------------------ */
/* Exams overview                                                       */
/* ------------------------------------------------------------------ */

export function ExamsPage() {
  const { state } = useStore();
  const completed = completedLessonNumbers(state, (id) => lessonById.get(id)?.number);
  return (
    <div className="container">
      <PageHeader eyebrow="Egzaminy" title="Powtórki i egzaminy blokowe">
        <p>Po każdych pięciu lekcjach: powtórka (materiał nauczycielki, jeśli istnieje) i egzamin z losowanymi pytaniami. Próg opanowania: {MASTERY_THRESHOLD * 100} %. Egzamin można zdawać wielokrotnie – za każdym razem inny zestaw.</p>
      </PageHeader>
      <div className="stack">
        {blocks.map((b) => {
          const attempts = state.exams.filter((a) => a.block === b.index);
          const best = attempts.length ? Math.max(...attempts.map((a) => a.percent)) : null;
          const done = b.lessons.filter((n) => completed.has(n)).length;
          return (
            <div key={b.index} className="card">
              <div className="row between">
                <div>
                  <h2 style={{ margin: 0 }}>Blok {b.index}: Bài {b.fromLesson}–{b.toLesson}</h2>
                  <div className="row" style={{ marginTop: '0.3rem' }}>
                    {lessonsInBlock(b).map((l) => (
                      <Link key={l.id} to={`/lekcje/${l.id}`} className="pill" style={{ background: completed.has(l.number) ? 'var(--ok-soft)' : undefined }}>
                        {completed.has(l.number) ? '✓ ' : ''}{lessonLabel(l.number)}
                      </Link>
                    ))}
                    {!b.complete && <Pill tone="warn">brakuje {5 - b.lessons.length} lekcji</Pill>}
                  </div>
                </div>
                <div className="row">
                  {b.reviewId ? <Link to={`/egzaminy/powtorka/${b.reviewId}`} className="btn">📖 Powtórka {b.fromLesson}–{b.toLesson}</Link> : <span className="muted small">brak powtórki nauczycielki</span>}
                  {b.examId && b.complete ? (
                    <Link to={`/egzaminy/${b.examId}`} className="btn primary">📝 Egzamin {b.index}</Link>
                  ) : (
                    <span className="muted small">{b.complete ? 'brak szkicu egzaminu (content/exams)' : `egzamin po lekcji ${b.toLesson}`}</span>
                  )}
                </div>
              </div>
              <div className="row mt">
                <div style={{ flex: 1 }}><Progress value={done} max={5} /></div>
                <span className="muted small">{done}/5 lekcji</span>
                {best !== null && <Pill tone={best >= 80 ? 'ok' : 'warn'}>najlepszy wynik {best}%</Pill>}
              </div>
              {attempts.length > 0 && (
                <div className="row mt small">
                  {attempts.slice(0, 6).map((a) => (
                    <Link key={a.id} to={`/egzaminy/wynik/${a.id}`} className="pill" style={{ background: a.percent >= 80 ? 'var(--ok-soft)' : 'var(--warn-soft)' }}>
                      {formatDate(a.ts)} · {a.percent}%
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Five-lesson review                                                   */
/* ------------------------------------------------------------------ */

export function ReviewBlockPage() {
  const { reviewId } = useParams();
  const review = reviews.find((r) => r.id === reviewId);
  const [session, setSession] = useState<SessionItem[] | null>(null);
  const [summary, setSummary] = useState<RunnerSummary | null>(null);
  const [showTr, setShowTr] = useState(false);
  if (!review) {
    return (
      <div className="container">
        <Callout tone="bad">Nie znaleziono powtórki.</Callout>
      </div>
    );
  }
  const teacher = review.exercises.filter((e) => e.source === 'teacher');
  const generated = review.exercises.filter((e) => e.source === 'generated');
  const start = (list: typeof review.exercises) => {
    setSummary(null);
    setSession(list.flatMap((e) => expandExercise({ exercise: e, ownerId: review.id, lessonNumber: review.toLesson, ownerKind: 'review' }, 2)));
  };
  if (session && !summary) {
    return (
      <div className="container">
        <ExerciseRunner items={session} title={review.title} sessionKind="review-block" onExit={() => setSession(null)} onFinish={setSummary} />
      </div>
    );
  }
  if (summary) {
    return (
      <div className="container">
        <RunnerSummaryView summary={summary} onClose={() => { setSession(null); setSummary(null); }} closeLabel="Wróć do powtórki" />
      </div>
    );
  }
  return (
    <div className="container">
      <PageHeader eyebrow={`Powtórka · ${review.sourceFile ?? ''}`} title={review.title}>
        <p>{review.intro}</p>
        <div className="row">
          <button type="button" className="btn primary" onClick={() => start(review.exercises)}>Ćwicz wszystko ({review.exercises.length})</button>
          <button type="button" className="btn" onClick={() => start(teacher)}>Tylko materiał z lekcji ({teacher.length})</button>
          {generated.length > 0 && <button type="button" className="btn" onClick={() => start(generated)}>Tylko wygenerowane ({generated.length})</button>}
        </div>
      </PageHeader>
      {review.readings.map((r) => (
        <div key={r.id} className="card">
          <div className="row between">
            <h3 style={{ margin: 0 }}>{r.title}</h3>
            {r.translation && <button type="button" className="btn sm" onClick={() => setShowTr(!showTr)}>{showTr ? 'Ukryj tłumaczenie' : 'Pokaż tłumaczenie'}</button>}
          </div>
          <div className="reading-box" lang="vi">{r.paragraphs.map((p, i) => <p key={i}>{p}</p>)}</div>
          {showTr && r.translation?.map((p, i) => <p key={i} className="muted small">{p}</p>)}
          {r.note && <Callout tone="warn">{r.note}</Callout>}
        </div>
      ))}
      <div className="card">
        <h3>Zadania</h3>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Zadanie</th><th>Źródło</th><th /></tr></thead>
            <tbody>
              {review.exercises.map((e) => (
                <tr key={e.id}>
                  <td>{taskPrompt({ kind: 'exercise', exercise: e })}</td>
                  <td>
                    <Pill tone={e.source === 'teacher' ? 'info' : ''}>{e.source === 'teacher' ? 'Materiał z lekcji' : 'Ćwiczenie wygenerowane do nauki'}</Pill>
                    {e.status === 'flagged' && <Pill tone="warn"> ⚠ do weryfikacji</Pill>}
                    {e.status === 'unverified' && e.source === 'teacher' && <Pill tone="warn"> klucz niezweryfikowany</Pill>}
                  </td>
                  <td><Link to={`/cwicz?exercise=${e.id}`} className="btn sm">Ćwicz</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <details className="disclosure">
        <summary>Materiał nauczycielki (oryginał)</summary>
        <div className="stack" style={{ gap: '0.6rem' }}>
          {review.original.map((b, i) => <OriginalBlockView key={i} block={b} />)}
        </div>
      </details>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Exam runner                                                          */
/* ------------------------------------------------------------------ */

function questionTask(q: ExamQuestion): Task {
  return q.source.kind === 'exercise' ? { kind: 'exercise', exercise: q.source.exercise } : { kind: 'generated', instance: q.source.instance };
}

export function ExamPage() {
  const { examId } = useParams();
  const navigate = useNavigate();
  const { state, dispatch } = useStore();
  const blueprint = examBlueprints.find((e) => e.id === examId);
  const block = blueprint ? blocks.find((b) => b.index === blueprint.block) : undefined;
  const [seed, setSeed] = useState<number | null>(null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, UserAnswer | null>>({});
  const [confirmSubmit, setConfirmSubmit] = useState(false);

  // /egzaminy/:examId stays mounted across in-place navigation between two
  // exam ids; reset the in-progress attempt so it never mixes questions or
  // answers from a different exam's blueprint.
  useEffect(() => {
    setSeed(null);
    setIndex(0);
    setAnswers({});
    setConfirmSubmit(false);
  }, [examId]);

  const questions = useMemo(() => {
    if (!blueprint || !block || seed === null) return [];
    const lessonIds = new Set(lessonsInBlock(block).map((l) => l.id));
    const pool = allExercises
      .filter((e) => (e.ownerKind === 'lesson' && lessonIds.has(e.ownerId)) || (e.ownerKind === 'review' && e.ownerId === block.reviewId) || (e.ownerKind === 'exam' && e.ownerId === blueprint.id))
      .map((e) => ({ exercise: e.exercise, ownerId: e.ownerId, lessonNumber: e.lessonNumber }));
    return sampleExam(pool, block, blueprint.questionCount, blueprint.minProductionShare, seed);
  }, [blueprint, block, seed]);

  if (!blueprint || !block) {
    return (
      <div className="container"><Callout tone="bad">Nie znaleziono egzaminu.</Callout></div>
    );
  }
  if (!block.complete) {
    return (
      <div className="container narrow">
        <PageHeader title={blueprint.title} />
        <Callout tone="warn">Egzamin będzie dostępny, gdy w bloku będą wszystkie lekcje ({block.fromLesson}–{block.toLesson}).</Callout>
      </div>
    );
  }

  if (seed === null) {
    const attempts = state.exams.filter((a) => a.examId === blueprint.id);
    return (
      <div className="container narrow">
        <PageHeader eyebrow={`Blok ${block.index}`} title={blueprint.title}>
          <p>{blueprint.questionCount} pytań losowanych z lekcji {block.fromLesson}–{block.toLesson}{block.reviewId ? ' i powtórki' : ''}. Co najmniej {Math.round(blueprint.minProductionShare * 100)} % zadań wymaga samodzielnego napisania odpowiedzi. Odpowiedzi nie są sprawdzane do końca egzaminu.</p>
        </PageHeader>
        <Card>
          <h3>Zasady</h3>
          <ul className="small">
            <li>Kolejność pytań i odpowiedzi jest losowa; każde podejście to inny zestaw.</li>
            <li>Możesz wracać do wcześniejszych pytań przed oddaniem.</li>
            <li>Po oddaniu: wynik, rozbicie na umiejętności i lekcje, lista błędów i zalecenia.</li>
            <li>Elementy oznaczone do weryfikacji w CONTENT_REVIEW.md nie trafiają do egzaminu.</li>
          </ul>
          <button type="button" className="btn primary big" onClick={() => setSeed(randomSeed())}>Rozpocznij egzamin</button>
        </Card>
        {attempts.length > 0 && (
          <Card>
            <h3>Poprzednie podejścia</h3>
            <div className="row">
              {attempts.map((a) => (
                <Link key={a.id} to={`/egzaminy/wynik/${a.id}`} className="pill" style={{ background: a.percent >= 80 ? 'var(--ok-soft)' : 'var(--warn-soft)' }}>{formatDate(a.ts)} · {a.percent}%</Link>
              ))}
            </div>
          </Card>
        )}
      </div>
    );
  }

  const q = questions[index];
  if (!q) {
    return <div className="container"><Callout tone="warn">Brak pytań w puli egzaminu.</Callout></div>;
  }
  const task = questionTask(q);
  const answered = questions.filter((qq) => !!answers[qq.id]).length;

  const submit = () => {
    const records: ExamAnswerRecord[] = questions.map((qq) => {
      const t = questionTask(qq);
      const a = answers[qq.id] ?? { kind: 'text', value: '' };
      const r: GradeResult = gradeTask(t.kind === 'exercise' ? { source: 'exercise', exercise: t.exercise } : { source: 'generated', instance: t.instance }, a);
      const skill = t.kind === 'exercise' ? t.exercise.skill : t.instance.skill;
      return { exerciseId: qq.id, lesson: qq.lesson, skill: r.outcome === 'tone' ? 'tone' : skill, prompt: taskPrompt(t), expected: r.expected, given: answerToText(a, t), outcome: r.outcome, score: r.score };
    });
    const agg = (key: (r: ExamAnswerRecord) => string) => {
      const out: Record<string, { score: number; total: number }> = {};
      for (const r of records) {
        const k = key(r);
        out[k] = out[k] ?? { score: 0, total: 0 };
        out[k].score += r.score;
        out[k].total += 1;
      }
      return out;
    };
    const percent = Math.round((records.reduce((s, r) => s + r.score, 0) / records.length) * 100);
    const attempt: ExamAttempt = {
      id: `a-${Date.now()}`,
      examId: blueprint.id,
      block: block.index,
      ts: Date.now(),
      seed,
      percent,
      answers: records,
      bySkill: agg((r) => r.skill),
      byLesson: agg((r) => r.lesson),
    };
    dispatch({ type: 'exam', attempt });
    // Exam mistakes feed the mistake book too.
    for (const r of records) {
      if (r.outcome === 'correct') continue;
      const entry = exerciseById.get(r.exerciseId);
      dispatch({ type: 'mistake', mistake: { lesson: r.lesson, ref: r.exerciseId, refKind: entry ? 'exercise' : 'generated', category: r.skill, prompt: r.prompt, expected: r.expected, given: r.given, outcome: r.outcome === 'partial' ? 'wrong' : r.outcome, flagged: false } });
    }
    navigate(`/egzaminy/wynik/${attempt.id}`, { replace: true });
  };

  return (
    <div className="container">
      <div className="ex-frame">
        <div className="ex-top">
          <span>{blueprint.title}</span>
          <Progress value={answered} max={questions.length} thin />
          <span>{index + 1} / {questions.length}</span>
        </div>
        <div className="ex-card" key={q.id}>
          <div className="row" style={{ marginBottom: '0.5rem' }}>
            <Pill>{lessonById.get(q.lesson) ? lessonLabel(lessonById.get(q.lesson)!.number) : q.lesson}</Pill>
            {answers[q.id] && <Pill tone="ok">odpowiedziano</Pill>}
          </div>
          <ExerciseView task={task} answer={answers[q.id] ?? null} onAnswer={(a) => setAnswers({ ...answers, [q.id]: a })} result={null} optionOrder={q.optionOrder} showMeta={false} onSubmit={() => index < questions.length - 1 && setIndex(index + 1)} />
          <div className="ex-actions">
            <button type="button" className="btn" disabled={index === 0} onClick={() => setIndex(index - 1)}>← Poprzednie</button>
            {index < questions.length - 1 ? (
              <button type="button" className="btn primary" onClick={() => setIndex(index + 1)}>Następne →</button>
            ) : (
              <button type="button" className="btn accent" onClick={() => setConfirmSubmit(true)}>Oddaj egzamin</button>
            )}
            <span className="spacer" />
            <button type="button" className="btn ghost sm" onClick={() => setConfirmSubmit(true)}>Zakończ i oddaj</button>
          </div>
          {confirmSubmit && (
            <Callout tone="warn">
              Odpowiedziano na {answered} z {questions.length} pytań. Oddać egzamin?{' '}
              <button type="button" className="btn sm primary" onClick={submit}>Tak, oddaj</button>{' '}
              <button type="button" className="btn sm" onClick={() => setConfirmSubmit(false)}>Wróć</button>
            </Callout>
          )}
        </div>
        <div className="chips mt" aria-label="Nawigacja po pytaniach">
          {questions.map((qq, i) => (
            <button key={qq.id} type="button" className={`chip ${i === index ? 'on' : ''} ${answers[qq.id] ? '' : 'used'}`} onClick={() => setIndex(i)}>{i + 1}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Exam result                                                          */
/* ------------------------------------------------------------------ */

export function ExamResultPage() {
  const { attemptId } = useParams();
  const { state } = useStore();
  const attempt = state.exams.find((a) => a.id === attemptId);
  if (!attempt) {
    return <div className="container"><Callout tone="bad">Nie znaleziono wyniku.</Callout></div>;
  }
  const wrong = attempt.answers.filter((a) => a.outcome !== 'correct');
  const weakLessons = Object.entries(attempt.byLesson).filter(([, v]) => v.score / v.total < MASTERY_THRESHOLD).sort((a, b) => a[1].score / a[1].total - b[1].score / b[1].total);
  const weakSkills = Object.entries(attempt.bySkill).filter(([, v]) => v.score / v.total < MASTERY_THRESHOLD).sort((a, b) => a[1].score / a[1].total - b[1].score / b[1].total);
  const passed = attempt.percent >= MASTERY_THRESHOLD * 100;
  return (
    <div className="container">
      <PageHeader eyebrow={`Egzamin ${attempt.block} · ${formatDate(attempt.ts)}`} title={passed ? 'Próg opanowania osiągnięty 🎉' : 'Jeszcze nie 80 % – zobacz, co powtórzyć'} />
      <div className="card" style={{ textAlign: 'center' }}>
        <div className="summary-big" style={{ color: passed ? 'var(--ok)' : 'var(--warn)' }}>{attempt.percent}%</div>
        <p className="muted">{attempt.answers.length} pytań · {wrong.length} do poprawy · próg {MASTERY_THRESHOLD * 100} %</p>
        <div className="row" style={{ justifyContent: 'center' }}>
          <Link to={`/egzaminy/${attempt.examId}`} className="btn primary">Nowe podejście</Link>
          <Link to="/egzaminy" className="btn">Egzaminy</Link>
          {wrong.length > 0 && <Link to="/powtorki/mistakes" className="btn">Ćwicz błędy</Link>}
        </div>
      </div>
      <div className="grid two mt">
        <Card>
          <h3>Umiejętności</h3>
          {Object.entries(attempt.bySkill).sort((a, b) => a[1].score / a[1].total - b[1].score / b[1].total).map(([k, v]) => (
            <div key={k} className="row" style={{ marginBottom: '0.4rem' }}>
              <span style={{ width: 150 }} className="small">{CATEGORY_LABEL[k as keyof typeof CATEGORY_LABEL] ?? k}</span>
              <div style={{ flex: 1 }}><Progress value={v.score} max={v.total} tone={v.score / v.total >= 0.8 ? 'ok' : v.score / v.total >= 0.5 ? 'warn' : 'bad'} /></div>
              <span className="muted small">{Math.round((v.score / v.total) * 100)}%</span>
            </div>
          ))}
        </Card>
        <Card>
          <h3>Lekcje</h3>
          {Object.entries(attempt.byLesson).sort().map(([k, v]) => {
            const l = lessonById.get(k);
            return (
              <div key={k} className="row" style={{ marginBottom: '0.4rem' }}>
                <span style={{ width: 150 }} className="small">{l ? `${lessonLabel(l.number)} ${l.title}` : k}</span>
                <div style={{ flex: 1 }}><Progress value={v.score} max={v.total} tone={v.score / v.total >= 0.8 ? 'ok' : v.score / v.total >= 0.5 ? 'warn' : 'bad'} /></div>
                <span className="muted small">{Math.round((v.score / v.total) * 100)}%</span>
              </div>
            );
          })}
        </Card>
      </div>
      {(weakLessons.length > 0 || weakSkills.length > 0) && (
        <div className="card mt">
          <h3>Zalecana powtórka</h3>
          <ul className="small">
            {weakLessons.map(([k]) => {
              const l = lessonById.get(k);
              return l ? (
                <li key={k}><Link to={`/lekcje/${l.id}`}>{lessonLabel(l.number)} – {l.title}</Link> (checkpoint: <Link to={`/cwicz?lesson=${l.id}&set=checkpoint`}>ćwicz</Link>)</li>
              ) : (
                <li key={k}><Link to={`/egzaminy/powtorka/${k}`}>{k}</Link></li>
              );
            })}
            {weakSkills.map(([k]) => (
              <li key={k}>Umiejętność: {CATEGORY_LABEL[k as keyof typeof CATEGORY_LABEL] ?? k} – {k === 'tone' ? <Link to="/tony">laboratorium tonów</Link> : k === 'vocabulary' || k === 'spelling' ? <Link to="/powtorki/vocab">powtórka słownictwa</Link> : <Link to="/powtorki/grammar">ćwiczenia gramatyczne</Link>}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="card mt">
        <h3>Wszystkie odpowiedzi</h3>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th />
              <th>Zadanie</th><th>Twoja odpowiedź</th><th>Poprawnie</th><th>Lekcja</th></tr></thead>
            <tbody>
              {attempt.answers.map((a, i) => (
                <tr key={i}>
                  <td>{a.outcome === 'correct' ? '✅' : a.outcome === 'tone' || a.outcome === 'partial' ? '🟡' : '❌'}</td>
                  <td className="small">{a.prompt}</td>
                  <td><Vi>{a.given || '—'}</Vi></td>
                  <td><Vi>{a.expected}</Vi></td>
                  <td className="muted small">{lessonById.get(a.lesson) ? lessonLabel(lessonById.get(a.lesson)!.number) : a.lesson}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="row mt">
        <Stat value={attempt.answers.filter((a) => a.outcome === 'correct').length} label="poprawnie" tone="ok" />
        <Stat value={attempt.answers.filter((a) => a.outcome === 'tone' || a.outcome === 'partial').length} label="częściowo (ton / pisownia)" tone="warn" />
        <Stat value={attempt.answers.filter((a) => a.outcome === 'wrong').length} label="błędnie" tone="bad" />
      </div>
    </div>
  );
}
