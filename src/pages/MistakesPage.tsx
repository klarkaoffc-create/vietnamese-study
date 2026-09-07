import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../learning/store';
import { lessonById, lessonLabel } from '../data/content';
import type { MistakeCategory } from '../learning/grading';
import { Callout, PageHeader, Pill, Stat, Vi } from '../components/ui';
import { formatDateTime } from '../utilities/dates';

export const CATEGORY_LABEL: Record<MistakeCategory, string> = {
  vocabulary: 'słownictwo',
  spelling: 'pisownia',
  tone: 'ton / znak',
  grammar: 'gramatyka',
  pronoun: 'zaimek',
  classifier: 'klasyfikator',
  'word-order': 'szyk zdania',
  tense: 'czas / aspekt',
  reading: 'czytanie ze zrozumieniem',
  listening: 'słuchanie',
  numbers: 'liczby',
  dates: 'daty',
  time: 'godziny',
  dialogue: 'dialog',
};

export function MistakesPage() {
  const { state, dispatch } = useStore();
  const [filter, setFilter] = useState<string>('all');
  const [showResolved, setShowResolved] = useState(false);
  const open = state.mistakes.filter((m) => !m.resolved);
  const resolved = state.mistakes.filter((m) => m.resolved);
  const byCat = useMemo(() => {
    const out = new Map<string, number>();
    for (const m of open) out.set(m.category, (out.get(m.category) ?? 0) + 1);
    return Array.from(out.entries()).sort((a, b) => b[1] - a[1]);
  }, [open]);
  const list = (showResolved ? resolved : open).filter((m) => filter === 'all' || m.category === filter);

  return (
    <div className="container">
      <PageHeader eyebrow="Moje błędy" title="Zeszyt błędów">
        <p>Każde niezaliczone zadanie trafia tutaj automatycznie z kategorią. Błąd znika po dwóch kolejnych poprawnych powtórzeniach albo gdy oznaczysz go ręcznie.</p>
      </PageHeader>
      <div className="row mb">
        <Link to="/powtorki/mistakes" className={`btn primary big ${open.length === 0 ? 'disabled' : ''}`}>Ćwicz moje błędy ({open.length})</Link>
        <span className="spacer" />
        <button type="button" className="btn sm" onClick={() => setShowResolved(!showResolved)}>{showResolved ? 'Pokaż otwarte' : `Rozwiązane (${resolved.length})`}</button>
        {resolved.length > 0 && <button type="button" className="btn sm ghost" onClick={() => dispatch({ type: 'clear-resolved-mistakes' })}>Wyczyść rozwiązane</button>}
      </div>
      <div className="stat-grid mb">
        {byCat.slice(0, 6).map(([c, n]) => (
          <Stat key={c} value={n} label={CATEGORY_LABEL[c as MistakeCategory] ?? c} tone={n > 3 ? 'bad' : 'warn'} />
        ))}
        {byCat.length === 0 && <Stat value={0} label="otwartych błędów" tone="ok" />}
      </div>
      <div className="chips mb">
        <button type="button" className={`chip ${filter === 'all' ? 'on' : ''}`} onClick={() => setFilter('all')}>wszystkie</button>
        {byCat.map(([c]) => (
          <button key={c} type="button" className={`chip ${filter === c ? 'on' : ''}`} onClick={() => setFilter(c)}>{CATEGORY_LABEL[c as MistakeCategory] ?? c}</button>
        ))}
      </div>
      {list.length === 0 ? (
        <Callout>Brak {showResolved ? 'rozwiązanych' : 'otwartych'} błędów{filter !== 'all' ? ' w tej kategorii' : ''}.</Callout>
      ) : (
        <div className="card table-wrap" style={{ padding: 0 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Kiedy</th>
                <th>Kategoria</th>
                <th>Zadanie</th>
                <th>Twoja odpowiedź</th>
                <th>Poprawnie</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.map((m) => {
                const l = lessonById.get(m.lesson);
                return (
                  <tr key={m.id}>
                    <td className="muted small">{formatDateTime(m.ts)}<br />{l ? lessonLabel(l.number) : m.lesson}</td>
                    <td>
                      <Pill tone={m.category === 'tone' ? 'warn' : 'bad'}>{CATEGORY_LABEL[m.category] ?? m.category}</Pill>
                      {m.flagged && <Pill tone="warn">⚠ klucz do weryfikacji</Pill>}
                      {m.retries > 0 && <Pill tone="ok">{m.retries}/2 ✓</Pill>}
                    </td>
                    <td className="small">{m.prompt}</td>
                    <td><Vi>{m.given || '—'}</Vi></td>
                    <td><Vi>{m.expected}</Vi></td>
                    <td>
                      {!m.resolved && (
                        <div className="row" style={{ gap: '0.3rem' }}>
                          <Link className="btn sm" to={m.refKind === 'vocab' ? `/cwicz?vocab=${m.ref}` : m.refKind === 'exercise' ? `/cwicz?exercise=${m.ref}` : '/powtorki/mistakes'}>Ćwicz</Link>
                          <button type="button" className="btn sm ghost" onClick={() => dispatch({ type: 'resolve-mistake', id: m.id })}>✓</button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
