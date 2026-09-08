import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../learning/store';
import { allGrammar, lessonById, lessons, lessonLabel } from '../data/content';
import { completedLessonNumbers, exportState, parseImport } from '../learning/state';
import { makeSrsId, mastery } from '../learning/srs';
import { skillScores } from '../learning/skills';
import { estimateCefr } from '../learning/cefr';
import { CefrDetail, CefrStat } from '../components/CefrCard';
import { Callout, Card, PageHeader, Pill, Progress, Stat } from '../components/ui';
import { DAY_MS, daysBetween, formatDate, formatDateTime, startOfDay } from '../utilities/dates';

export function ProgressPage() {
  const { state, dispatch } = useStore();
  const [msg, setMsg] = useState<string | null>(null);
  const [cefrOpen, setCefrOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const completed = completedLessonNumbers(state, (id) => lessonById.get(id)?.number);
  const skills = skillScores(state);
  // Read-only: the estimate never writes to progress.
  const cefr = estimateCefr(state);
  const grammarItems = allGrammar.map((g) => ({ g, item: state.srs[makeSrsId('grammar', g.id)] }));
  const sessionsByDay = new Map<number, number>();
  for (const s of state.sessions) sessionsByDay.set(startOfDay(s.ts), (sessionsByDay.get(startOfDay(s.ts)) ?? 0) + s.items);
  const today = startOfDay(Date.now());
  const heat = Array.from({ length: 12 * 7 }, (_, i) => {
    const day = today - (12 * 7 - 1 - i) * DAY_MS;
    return { day, n: sessionsByDay.get(day) ?? 0 };
  });
  const totalItems = state.sessions.reduce((a, s) => a + s.items, 0);
  const totalMinutes = Math.round(state.sessions.reduce((a, s) => a + s.durationSec, 0) / 60);

  const doExport = () => {
    const blob = new Blob([exportState(state)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vietnamese-study-postep-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMsg('Wyeksportowano plik JSON z postępem.');
  };
  const doImport = async (file: File) => {
    try {
      const text = await file.text();
      const imported = parseImport(text);
      if (!window.confirm('Zastąpić obecny postęp danymi z pliku? Tej operacji nie można cofnąć.')) return;
      dispatch({ type: 'import', state: imported });
      setMsg('Zaimportowano postęp.');
    } catch (e) {
      setMsg(`Nie udało się zaimportować: ${(e as Error).message}`);
    }
  };

  return (
    <div className="container">
      <PageHeader eyebrow="Postęp" title="Twój postęp">
        <p>Wszystko jest zapisane lokalnie w tej przeglądarce. Inna osoba na stronie publicznej zaczyna od zera. Eksportuj plik, aby przenieść postęp na inne urządzenie.</p>
      </PageHeader>
      <div className="stat-grid mb">
        <CefrStat estimate={cefr} open={cefrOpen} onToggle={() => setCefrOpen((o) => !o)} />
        <Stat value={`${completed.size}/${lessons.length}`} label="ukończone lekcje" tone="primary" />
        <Stat value={totalItems} label="przećwiczonych elementów" />
        <Stat value={`${totalMinutes} min`} label="łączny czas nauki" />
        <Stat value={state.exams.length} label="podejść do egzaminów" />
      </div>
      {cefrOpen && <CefrDetail estimate={cefr} />}

      <div className="grid two">
        <Card>
          <h3>Umiejętności językowe</h3>
          <p className="muted tiny" style={{ marginTop: 0 }}>
            Nie liczba opanowanych fiszek, tylko to, co potrafisz zrobić po wietnamsku.
          </p>
          {skills.map((sk) => (
            <div key={sk.id} style={{ marginBottom: '0.6rem' }}>
              <div className="row between small">
                <span title={sk.detail}>{sk.label}</span>
                <b>{sk.percent}%</b>
              </div>
              <Progress value={sk.percent} tone={sk.percent >= 70 ? 'ok' : sk.percent >= 35 ? 'warn' : undefined} thin />
              <span className="muted tiny">{sk.detail}{sk.total > 0 ? ` · ${sk.practised}/${sk.total}` : ''}</span>
            </div>
          ))}
        </Card>
        <Card>
          <h3>Aktywność (12 tygodni)</h3>
          <div className="heatmap" aria-label="Mapa aktywności">
            {heat.map((h) => (
              <i key={h.day} className={h.n === 0 ? '' : h.n < 10 ? 'l1' : h.n < 25 ? 'l2' : h.n < 50 ? 'l3' : 'l4'} title={`${formatDate(h.day)}: ${h.n} elementów`} />
            ))}
          </div>
          <p className="muted tiny mt">Ostatnie sesje:</p>
          <ul className="small" style={{ margin: 0, paddingLeft: '1.1rem' }}>
            {state.sessions.slice(0, 5).map((s, i) => (
              <li key={i}>{formatDateTime(s.ts)} · {s.kind} · {s.correct}/{s.items} · {Math.max(1, Math.round(s.durationSec / 60))} min</li>
            ))}
            {state.sessions.length === 0 && <li className="muted">brak sesji</li>}
          </ul>
        </Card>
      </div>

      <Card className="mt">
        <h3>Lekcje i checkpointy</h3>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Lekcja</th><th>Status</th><th>Słownictwo aktywne</th><th>Checkpointy</th></tr></thead>
            <tbody>
              {lessons.map((l) => {
                const lp = state.lessons[l.id];
                const vm = l.vocabulary.filter((v) => v.srs).map((v) => state.srs[makeSrsId('vocab-active', v.id)]).filter(Boolean);
                const avg = l.vocabulary.length ? Math.round(vm.reduce((a, i) => a + mastery(i), 0) / l.vocabulary.length) : 0;
                return (
                  <tr key={l.id}>
                    <td><Link to={`/lekcje/${l.id}`}>{lessonLabel(l.number)} {l.title}</Link></td>
                    <td>{lp?.completed ? <Pill tone="ok">ukończona {formatDate(lp.completed)}</Pill> : lp?.visited ? <Pill tone="primary">w trakcie</Pill> : <Pill>nie otwarto</Pill>}</td>
                    <td style={{ minWidth: 120 }}><Progress value={avg} thin /><span className="muted tiny">{avg}%</span></td>
                    <td className="small">{lp?.checkpoints?.length ? lp.checkpoints.slice(-5).map((c, i) => <Pill key={i} tone={c.score / c.total >= 0.8 ? 'ok' : 'warn'}>{Math.round((c.score / c.total) * 100)}%</Pill>) : <span className="muted">—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="mt">
        <h3>Gramatyka</h3>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.5rem' }}>
          {grammarItems.map(({ g, item }) => (
            <div key={g.id} className="small">
              <Link to={`/lekcje/${g.lessonId}#${g.id}`}>{g.title}</Link>
              <Progress value={item ? mastery(item) : 0} thin tone={item && mastery(item) >= 70 ? 'ok' : undefined} />
              <span className="muted tiny">{lessonLabel(g.lessonNumber)} · {item ? `${mastery(item)}% · ${item.successes}✓ ${item.failures}✗` : 'nie ćwiczono'}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card className="mt">
        <h3>Egzaminy</h3>
        {state.exams.length === 0 ? <p className="muted small">Brak podejść.</p> : (
          <div className="row">
            {state.exams.map((a) => (
              <Link key={a.id} to={`/egzaminy/wynik/${a.id}`} className="pill" style={{ background: a.percent >= 80 ? 'var(--ok-soft)' : 'var(--warn-soft)' }}>Egzamin {a.block} · {formatDate(a.ts)} · {a.percent}%</Link>
            ))}
          </div>
        )}
      </Card>

      <Card className="mt">
        <h3>Ustawienia i dane</h3>
        <div className="row mb">
          <label className="row small">nowe słówka dziennie
            <input type="number" className="text" style={{ width: 80 }} min={0} max={50} value={state.settings.dailyNewLimit} onChange={(e) => dispatch({ type: 'settings', settings: { dailyNewLimit: Number(e.target.value) } })} />
          </label>
          <label className="row small">limit powtórek dziennie
            <input type="number" className="text" style={{ width: 80 }} min={5} max={200} value={state.settings.dailyReviewLimit} onChange={(e) => dispatch({ type: 'settings', settings: { dailyReviewLimit: Number(e.target.value) } })} />
          </label>
          <label className="row small">
            <input type="checkbox" checked={state.settings.ttsEnabled} onChange={(e) => dispatch({ type: 'settings', settings: { ttsEnabled: e.target.checked } })} /> syntezator mowy (opcjonalny, niezweryfikowany)
          </label>
        </div>
        <div className="row">
          <button type="button" className="btn primary" onClick={doExport}>Exportuj postęp</button>
          <button type="button" className="btn" onClick={() => fileRef.current?.click()}>Importuj postęp</button>
          <input ref={fileRef} type="file" accept="application/json" style={{ display: 'none' }} onChange={(e) => e.target.files?.[0] && doImport(e.target.files[0])} />
          <span className="spacer" />
          <button type="button" className="btn danger" onClick={() => { if (window.confirm('Usunąć cały postęp z tej przeglądarki?')) { dispatch({ type: 'reset' }); setMsg('Postęp wyzerowany.'); } }}>Wyzeruj postęp</button>
        </div>
        {msg && <Callout>{msg}</Callout>}
        <p className="muted tiny mt">Dane od {formatDate(state.createdAt)} · {daysBetween(state.createdAt, Date.now())} dni · klucz localStorage: vietnamese-study:v1</p>
      </Card>
    </div>
  );
}
