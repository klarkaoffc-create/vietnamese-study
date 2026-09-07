import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { exerciseById, exercisesForVocab, grammarById, lessonById, vocabById, allExercises } from '../data/content';
import { buildLessonSession, buildVocabSession, expandExercise, grammarPracticeItems, type SessionItem } from '../learning/session';
import { useStore } from '../learning/store';
import { ExerciseRunner, RunnerSummaryView, type RunnerSummary } from '../exercises/ExerciseRunner';
import { Callout } from '../components/ui';

/**
 * Ad-hoc practice: /cwicz?vocab=id | ?grammar=id | ?exercise=id | ?lesson=id&set=all|vocab|checkpoint
 */
export function PracticePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { state, dispatch } = useStore();
  const [summary, setSummary] = useState<RunnerSummary | null>(null);
  const [round, setRound] = useState(0);
  const [retryItems, setRetryItems] = useState<SessionItem[] | null>(null);

  const plan = useMemo(() => {
    const vocabId = params.get('vocab');
    const grammarId = params.get('grammar');
    const exerciseId = params.get('exercise');
    const lessonId = params.get('lesson');
    const set = params.get('set') ?? 'all';
    let items: SessionItem[] = [];
    let title = 'Ćwiczenie';
    let back = '/';
    let checkpointLesson: string | null = null;

    if (vocabId) {
      const v = vocabById.get(vocabId);
      if (v) {
        title = `W użyciu: ${v.vi}`;
        back = `/lekcje/${v.lessonId}`;
        // The same word met in changing contexts, always as production.
        items = [...buildVocabSession(state, v.id), ...exercisesForVocab(v.id).flatMap((e) => expandExercise(e, 1))];
      }
    } else if (grammarId) {
      const g = grammarById.get(grammarId);
      if (g) {
        title = `Gramatyka: ${g.title}`;
        back = `/lekcje/${g.lessonId}#${g.id}`;
        items = grammarPracticeItems(g.id);
      }
    } else if (exerciseId) {
      const e = exerciseById.get(exerciseId);
      if (e) {
        title = 'Zadanie';
        back = e.ownerKind === 'lesson' ? `/lekcje/${e.ownerId}` : '/egzaminy';
        items = expandExercise(e);
      }
    } else if (lessonId) {
      const l = lessonById.get(lessonId);
      if (l) {
        back = `/lekcje/${l.id}`;
        if (set === 'vocab') {
          title = `Słownictwo w użyciu – Bài ${l.number}`;
          items = buildLessonSession(state, l.number);
        } else if (set === 'checkpoint') {
          title = `Checkpoint – Bài ${l.number}`;
          checkpointLesson = l.id;
          items = l.checkpoint.map((id) => exerciseById.get(id)).filter((e): e is NonNullable<typeof e> => !!e).flatMap((e) => expandExercise(e, 3));
        } else {
          title = `Ćwiczenia – Bài ${l.number}`;
          items = allExercises.filter((e) => e.ownerId === l.id).flatMap((e) => expandExercise(e, 2));
        }
      }
    }
    return { items, title, back, checkpointLesson };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  // React Router keeps this component mounted across /cwicz?... navigations
  // that only change the query string (in-app back/forward, or switching
  // straight from one "Ćwicz" target to another). Without this, the memoised
  // `plan` would update but ExerciseRunner's own internal queue/index state
  // — seeded once from `items` on mount — would keep showing the previous
  // session. Resetting on every distinct query string forces a clean remount.
  const sessionKey = params.toString();
  useEffect(() => {
    setSummary(null);
    setRetryItems(null);
    setRound(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKey]);

  const items = retryItems ?? plan.items;

  if (plan.items.length === 0) {
    return (
      <div className="container narrow">
        <Callout tone="warn">Brak ćwiczeń dla tego wyboru.</Callout>
        <Link to={plan.back} className="btn mt">← Wróć</Link>
      </div>
    );
  }

  if (summary) {
    const wrongItems = summary.results.filter((r) => r.outcome !== 'correct').map((r) => r.item);
    return (
      <div className="container">
        <RunnerSummaryView
          summary={summary}
          onRepeatMistakes={wrongItems.length ? () => { setRetryItems(wrongItems); setSummary(null); setRound((r) => r + 1); } : undefined}
          onClose={() => navigate(plan.back)}
          closeLabel="Wróć"
        />
      </div>
    );
  }

  return (
    <div className="container">
      <ExerciseRunner
        key={`${sessionKey}-${round}`}
        items={items}
        title={plan.title}
        sessionKind={plan.checkpointLesson ? 'checkpoint' : 'practice'}
        onExit={() => navigate(plan.back)}
        onFinish={(s) => {
          if (plan.checkpointLesson && !retryItems) dispatch({ type: 'checkpoint', lesson: plan.checkpointLesson, score: s.correct, total: s.total });
          setSummary(s);
        }}
      />
    </div>
  );
}
