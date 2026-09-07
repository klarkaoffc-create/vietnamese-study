import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { allVocab, lessons, lessonLabel, type VocabEntry } from '../data/content';
import type { VocabCategory } from '../data/schema';
import { useStore } from '../learning/store';
import { makeSrsId, mastery, masteryLevel, type MasteryLevel } from '../learning/srs';
import { PageHeader, Pill, Vi } from '../components/ui';
import { AudioButton } from '../components/AudioButton';
import { comparisonForm, stripDiacritics } from '../utilities/vietnamese';
import { relativeDays } from '../utilities/dates';

const CATEGORY_LABEL: Record<VocabCategory, string> = {
  noun: 'rzeczownik',
  verb: 'czasownik',
  adjective: 'przymiotnik',
  adverb: 'przysłówek',
  pronoun: 'zaimek',
  number: 'liczebnik',
  phrase: 'zwrot',
  'question-word': 'słowo pytające',
  particle: 'partykuła',
  preposition: 'przyimek',
  classifier: 'klasyfikator',
  time: 'czas',
  'proper-noun': 'nazwa własna',
  other: 'inne',
};

const LEVEL_LABEL: Record<MasteryLevel, string> = { new: 'nowe', learning: 'w nauce', young: 'młode', mature: 'dojrzałe' };

export function VocabularyPage() {
  const { state } = useStore();
  const [q, setQ] = useState('');
  const [lesson, setLesson] = useState<string>('all');
  const [category, setCategory] = useState<string>('all');
  const [level, setLevel] = useState<string>('all');
  const [status, setStatus] = useState<string>('all');
  const [open, setOpen] = useState<string | null>(null);

  const rows = useMemo(() => {
    const qn = stripDiacritics(comparisonForm(q));
    return allVocab
      .map((v) => {
        const viPl = state.srs[makeSrsId('vocab-active', v.id)];
        const plVi = state.srs[makeSrsId('vocab-passive', v.id)];
        const m = viPl || plVi ? Math.round(((viPl ? mastery(viPl) : 0) + (plVi ? mastery(plVi) : 0)) / ((viPl ? 1 : 0) + (plVi ? 1 : 0))) : 0;
        const lvl = masteryLevel(viPl ?? plVi);
        const due = [viPl?.due, plVi?.due].filter((x): x is number => typeof x === 'number').sort((a, b) => a - b)[0];
        return { v, m, lvl, due };
      })
      .filter(({ v, lvl }) => {
        if (lesson !== 'all' && v.lessonId !== lesson) return false;
        if (category !== 'all' && v.category !== category) return false;
        if (level !== 'all' && lvl !== level) return false;
        if (status !== 'all' && v.status !== status) return false;
        if (qn && !stripDiacritics(comparisonForm(v.vi)).includes(qn) && !stripDiacritics(comparisonForm(v.pl)).includes(qn)) return false;
        return true;
      });
  }, [q, lesson, category, level, status, state.srs]);

  return (
    <div className="container">
      <PageHeader eyebrow="Słownictwo" title={`Baza słówek (${allVocab.length})`}>
        <p>Wszystkie słówka z lekcji z lekcją, kategorią, klasyfikatorem, przykładami, statusem weryfikacji i stanem powtórek. Szukaj z tonami lub bez.</p>
      </PageHeader>
      <div className="row mb">
        <input className="text" style={{ maxWidth: 280 }} placeholder="Szukaj (vi lub pl)…" value={q} onChange={(e) => setQ(e.target.value)} lang="vi" />
        <select className="select" value={lesson} onChange={(e) => setLesson(e.target.value)}>
          <option value="all">Wszystkie lekcje</option>
          {lessons.map((l) => (
            <option key={l.id} value={l.id}>{lessonLabel(l.number)} – {l.title}</option>
          ))}
        </select>
        <select className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="all">Wszystkie kategorie</option>
          {Object.entries(CATEGORY_LABEL).map(([k, label]) => (
            <option key={k} value={k}>{label}</option>
          ))}
        </select>
        <select className="select" value={level} onChange={(e) => setLevel(e.target.value)}>
          <option value="all">Każdy poziom</option>
          {Object.entries(LEVEL_LABEL).map(([k, label]) => (
            <option key={k} value={k}>{label}</option>
          ))}
        </select>
        <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">Każdy status</option>
          <option value="verified">zweryfikowane</option>
          <option value="flagged">do weryfikacji</option>
        </select>
        <span className="muted small">{rows.length} wyników</span>
      </div>
      <div className="card table-wrap" style={{ padding: 0 }}>
        <table className="table clickable">
          <thead>
            <tr>
              <th>Wietnamski</th>
              <th>Polski</th>
              <th>Lekcja</th>
              <th>Kategoria</th>
              <th>Opanowanie</th>
              <th>Następna</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map(({ v, m, lvl, due }) => (
              <VocabRow key={v.id} v={v} m={m} lvl={lvl} due={due} open={open === v.id} onToggle={() => setOpen(open === v.id ? null : v.id)} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function VocabRow({ v, m, lvl, due, open, onToggle }: { v: VocabEntry; m: number; lvl: MasteryLevel; due?: number; open: boolean; onToggle: () => void }) {
  return (
    <>
      <tr onClick={onToggle}>
        <td>
          <Vi>{v.vi}</Vi> {v.status === 'flagged' && <Pill tone="warn">⚠</Pill>}
        </td>
        <td>{v.pl}</td>
        <td>{lessonLabel(v.lessonNumber)}</td>
        <td className="muted small">{v.category ? CATEGORY_LABEL[v.category] : ''}{v.classifier ? ` · kl. ${v.classifier}` : ''}</td>
        <td>
          <Pill tone={lvl === 'mature' ? 'ok' : lvl === 'young' ? 'primary' : lvl === 'learning' ? 'warn' : ''}>{lvl === 'new' ? 'nowe' : `${m}% · ${LEVEL_LABEL[lvl]}`}</Pill>
        </td>
        <td className="muted small">{due ? relativeDays(due) : '—'}</td>
        <td>
          <Link to={`/cwicz?vocab=${v.id}`} className="btn sm" onClick={(e) => e.stopPropagation()}>Ćwicz</Link>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={7} style={{ background: 'var(--surface-2)' }}>
            <div className="stack" style={{ gap: '0.3rem' }}>
              <div className="row">
                <AudioButton targetId={v.id} text={v.vi} />
                <Pill tone={v.status === 'verified' ? 'ok' : 'warn'}>{v.status === 'verified' ? 'zweryfikowane (materiał lekcji)' : v.status === 'flagged' ? 'do weryfikacji – zob. CONTENT_REVIEW.md' : 'niezweryfikowane'}</Pill>
                {!v.srs && <Pill>poza powtórkami</Pill>}
                {v.tags.map((t) => (
                  <Pill key={t}>{t}</Pill>
                ))}
              </div>
              {v.note && <div className="small">ℹ {v.note}</div>}
              {v.dialect && <div className="small">Dialekt: {v.dialect}</div>}
              {v.examples.map((ex, i) => (
                <div key={i} className="small">
                  <Vi>{ex.vi}</Vi>
                  {ex.pl && <span className="muted"> – {ex.pl}</span>}
                </div>
              ))}
              <div>
                <Link to={`/lekcje/${v.lessonId}#slownictwo`} className="small">Otwórz {lessonLabel(v.lessonNumber)} →</Link>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
