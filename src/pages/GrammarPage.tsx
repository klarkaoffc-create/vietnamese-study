import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { allGrammar, exercisesForGrammar, lessonLabel, lessons } from '../data/content';
import { useStore } from '../learning/store';
import { makeSrsId, mastery } from '../learning/srs';
import { Callout, PageHeader, Pill, Progress, Vi } from '../components/ui';
import { comparisonForm, stripDiacritics } from '../utilities/vietnamese';

export function GrammarPage() {
  const { state } = useStore();
  const [q, setQ] = useState('');
  const [lesson, setLesson] = useState('all');
  const rows = useMemo(() => {
    const qn = stripDiacritics(comparisonForm(q));
    return allGrammar.filter((g) => {
      if (lesson !== 'all' && g.lessonId !== lesson) return false;
      if (!qn) return true;
      const hay = stripDiacritics(comparisonForm([g.title, g.pattern ?? '', ...g.keywords].join(' ')));
      return hay.includes(qn);
    });
  }, [q, lesson]);

  return (
    <div className="container">
      <PageHeader eyebrow="Gramatyka" title={`Indeks struktur (${allGrammar.length})`}>
        <p>Każda struktura prowadzi do lekcji, w której została wprowadzona, i do ćwiczeń, które ją trenują. Opanowanie liczy się z wyników tych ćwiczeń.</p>
      </PageHeader>
      <div className="row mb">
        <input className="text" style={{ maxWidth: 280 }} placeholder="Szukaj: là, không, của, mấy…" value={q} onChange={(e) => setQ(e.target.value)} lang="vi" />
        <select className="select" value={lesson} onChange={(e) => setLesson(e.target.value)}>
          <option value="all">Wszystkie lekcje</option>
          {lessons.map((l) => (
            <option key={l.id} value={l.id}>{lessonLabel(l.number)} – {l.title}</option>
          ))}
        </select>
        <span className="muted small">{rows.length} wyników</span>
      </div>
      <div className="stack">
        {rows.map((g) => {
          const item = state.srs[makeSrsId('grammar', g.id)];
          const n = exercisesForGrammar(g.id).length;
          return (
            <div key={g.id} className="card tight">
              <div className="row between">
                <div>
                  <div className="card-title" style={{ marginBottom: 0 }}>
                    {g.title}
                    <Pill>{lessonLabel(g.lessonNumber)}</Pill>
                    {g.status === 'flagged' && <Pill tone="warn">⚠</Pill>}
                  </div>
                  {g.pattern && <div className="muted small"><Vi>{g.pattern}</Vi></div>}
                </div>
                <div className="row">
                  <div style={{ width: 90 }}>
                    <Progress value={item ? mastery(item) : 0} thin tone={item && mastery(item) >= 70 ? 'ok' : undefined} />
                    <div className="muted tiny" style={{ textAlign: 'right' }}>{item ? `${mastery(item)}%` : 'nie ćwiczono'}</div>
                  </div>
                  <Link to={`/lekcje/${g.lessonId}#${g.id}`} className="btn sm">Lekcja</Link>
                  <Link to={`/cwicz?grammar=${g.id}`} className="btn sm primary">Ćwicz ({n})</Link>
                </div>
              </div>
              <details style={{ marginTop: '0.4rem' }}>
                <summary className="small muted" style={{ cursor: 'pointer' }}>Wyjaśnienie i przykłady</summary>
                {g.explanation.split('\n\n').map((p, i) => (
                  <p key={i} className="small" style={{ marginTop: '0.4rem' }}>{p}</p>
                ))}
                {g.examples.map((ex, i) => (
                  <div key={i} className="example small">
                    <span><Vi>{ex.vi}</Vi>{ex.status === 'flagged' && <Pill tone="warn"> ⚠</Pill>}</span>
                    {ex.pl && <span className="pl">{ex.pl}</span>}
                  </div>
                ))}
                <div className="chips" style={{ marginTop: '0.4rem' }}>
                  {g.keywords.map((k) => (
                    <span key={k} className="pill">{k}</span>
                  ))}
                </div>
              </details>
            </div>
          );
        })}
        {rows.length === 0 && <Callout>Brak struktur pasujących do wyszukiwania.</Callout>}
      </div>
    </div>
  );
}
