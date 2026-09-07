import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { allExercises, allVocab, audioClips, lessons, lessonLabel } from '../data/content';
import { useStore } from '../learning/store';
import { generate } from '../learning/generators';
import type { SessionItem } from '../learning/session';
import { ExerciseRunner, RunnerSummaryView, type RunnerSummary } from '../exercises/ExerciseRunner';
import { Callout, Card, PageHeader, Pill, Vi } from '../components/ui';
import { AudioButton } from '../components/AudioButton';
import { detectTone, stripDiacritics, syllables, TONES, comparisonForm } from '../utilities/vietnamese';
import { OriginalBlockView } from './LessonPage';

type Tab = 'tones' | 'identify' | 'marks' | 'pairs' | 'reference' | 'audio';

export function ToneLabPage() {
  const { state, dispatch } = useStore();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('tones');
  const [session, setSession] = useState<SessionItem[] | null>(null);
  const [summary, setSummary] = useState<RunnerSummary | null>(null);

  // Example words per tone from the lessons (single syllables preferred)
  const examples = useMemo(() => {
    const out: Record<string, { vi: string; pl: string }[]> = {};
    for (const t of TONES) out[t.name] = [];
    for (const v of allVocab) {
      if (v.status === 'flagged') continue;
      const s = syllables(v.vi);
      if (s.length !== 1) continue;
      const tone = detectTone(s[0]);
      if (out[tone].length < 5 && !out[tone].some((x) => x.vi === v.vi)) out[tone].push({ vi: v.vi, pl: v.pl });
    }
    return out;
  }, []);

  // Minimal pairs: same letters, different tones/diacritics
  const pairs = useMemo(() => {
    const groups = new Map<string, { vi: string; pl: string; lesson: number }[]>();
    for (const v of allVocab) {
      if (v.status === 'flagged') continue;
      const s = syllables(v.vi);
      if (s.length !== 1) continue;
      const key = stripDiacritics(s[0]);
      const list = groups.get(key) ?? [];
      if (!list.some((x) => comparisonForm(x.vi) === s[0])) list.push({ vi: s[0], pl: v.pl, lesson: v.lessonNumber });
      groups.set(key, list);
    }
    return Array.from(groups.entries()).filter(([, l]) => l.length > 1).sort((a, b) => a[0].localeCompare(b[0]));
  }, []);

  const diacriticExercises = useMemo(() => allExercises.filter((e) => e.exercise.type === 'diacritics' && e.exercise.status !== 'flagged'), []);
  const lesson1 = lessons.find((l) => l.number === 1);
  const letterTable = lesson1?.original.find((b) => b.kind === 'table');

  const startIdentify = () => {
    setSummary(null);
    setSession(generate('tone-identify', {}, 10).map((instance) => ({ kind: 'generated', instance, lesson: 'bai-01' })));
  };
  const startMarks = () => {
    setSummary(null);
    setSession(diacriticExercises.map((e) => ({ kind: 'exercise', exercise: e.exercise, lesson: e.ownerId })));
  };
  const startPairs = () => {
    setSummary(null);
    const items: SessionItem[] = [];
    for (const [, list] of pairs) {
      for (const w of list) {
        const options = list.map((x) => x.vi);
        const answer = options.indexOf(w.vi);
        items.push({
          kind: 'generated',
          lesson: 'bai-01',
          instance: {
            id: `gen:pair:${w.vi}`,
            generator: 'tone-identify',
            skill: 'tone',
            prompt: `Które słowo znaczy „${w.pl}”?`,
            options,
            answer,
            explanation: list.map((x) => `${x.vi} – ${x.pl}`).join(' · '),
            level: 1,
          },
        });
      }
    }
    setSession(items.sort(() => Math.random() - 0.5).slice(0, 12));
  };

  if (session && !summary) {
    return (
      <div className="container">
        <ExerciseRunner items={session} title="🎧 Laboratorium tonów" sessionKind="tones" onExit={() => setSession(null)} onFinish={setSummary} />
      </div>
    );
  }
  if (summary) {
    return (
      <div className="container">
        <RunnerSummaryView summary={summary} onClose={() => { setSession(null); setSummary(null); }} closeLabel="Wróć do laboratorium" />
      </div>
    );
  }

  return (
    <div className="container">
      <PageHeader eyebrow="Tony i słuchanie" title="Laboratorium tonów i wymowy">
        <p>Sześć tonów, rozpoznawanie, dopisywanie znaków, pary minimalne i opis wymowy z lekcji 1. Nagrania native speakerów można dodać później – zob. zakładkę „Audio”.</p>
      </PageHeader>
      <div className="tabs">
        {([
          ['tones', 'Sześć tonów'],
          ['identify', 'Rozpoznaj ton'],
          ['marks', 'Dopisz znaki'],
          ['pairs', 'Pary minimalne'],
          ['reference', 'Wymowa (płn./płd.)'],
          ['audio', 'Audio'],
        ] as [Tab, string][]).map(([t, label]) => (
          <button key={t} type="button" className={`tab ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)}>{label}</button>
        ))}
      </div>

      {tab === 'tones' && (
        <div className="stack">
          <div className="tone-table">
            {TONES.map((t) => (
              <div key={t.name} className="tone-cell">
                <div className="ex" lang="vi">{t.example}</div>
                <div><b>{t.label}</b></div>
                <div className="muted tiny">{t.description}</div>
                <div className="small" style={{ marginTop: '0.4rem' }}>
                  {examples[t.name].map((w) => (
                    <div key={w.vi}><Vi>{w.vi}</Vi> <span className="muted">– {w.pl}</span></div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <Callout>
            Ton jest częścią słowa: <Vi>chị</Vi> (starsza siostra) i <Vi>chỉ</Vi> (tylko) różnią się wyłącznie tonem. Dlatego odpowiedzi bez znaków nie są liczone jako w pełni poprawne – aplikacja odpowiada wtedy „Prawie dobrze — sprawdź znak/ton”.
          </Callout>
        </div>
      )}

      {tab === 'identify' && (
        <Card>
          <h2>Rozpoznaj ton</h2>
          <p className="muted">Losowe sylaby ze słownictwa lekcji. Wskaż, który z sześciu tonów widzisz.</p>
          <button type="button" className="btn primary" onClick={startIdentify}>Start (10 sylab)</button>
        </Card>
      )}

      {tab === 'marks' && (
        <Card>
          <h2>Dopisz brakujące znaki i tony</h2>
          <p className="muted">{diacriticExercises.length} zdań z lekcji zapisanych bez znaków. Wpisz je poprawnie – pasek znaków pod polem pomaga na telefonie.</p>
          <button type="button" className="btn primary" onClick={startMarks}>Start</button>
        </Card>
      )}

      {tab === 'pairs' && (
        <div className="stack">
          <Card>
            <h2>Pary minimalne w słownictwie kursu</h2>
            <p className="muted small">Słowa o tych samych literach, różniące się tylko znakami. Znalezione automatycznie w słownictwie Bài 1–{lessons.length}.</p>
            <div className="table-wrap">
              <table className="table">
                <tbody>
                  {pairs.map(([key, list]) => (
                    <tr key={key}>
                      <td className="muted">{key}</td>
                      <td>
                        {list.map((w) => (
                          <span key={w.vi} style={{ marginRight: '1rem' }}>
                            <Vi>{w.vi}</Vi> <span className="muted small">– {w.pl} ({lessonLabel(w.lesson)})</span>
                          </span>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button type="button" className="btn primary mt" onClick={startPairs}>Ćwicz pary</button>
          </Card>
        </div>
      )}

      {tab === 'reference' && (
        <div className="stack">
          {lesson1?.pronunciation.map((p) => (
            <Card key={p.id}>
              <h3>{p.title}</h3>
              <p>{p.body}</p>
            </Card>
          ))}
          <Card>
            <h3>Tabela głosek z Bài 1 (materiał nauczycielki)</h3>
            {letterTable && <OriginalBlockView block={letterTable} />}
            <p className="muted small mt">Uwaga: opis „ă” jako głoski przedłużającej jest oznaczony w CONTENT_REVIEW.md – w standardowym opisie „ă” to krótkie „a”.</p>
          </Card>
        </div>
      )}

      {tab === 'audio' && (
        <div className="stack">
          <Callout tone="warn">
            W materiałach lekcyjnych nie ma nagrań. Aplikacja nie generuje „native” wymowy. Prawdziwe nagrania (nauczycielka, native speaker) dodaje się do folderu <code>public/audio/</code> i opisuje w <code>content/audio/manifest.json</code> (dialekt, mówca, źródło, lekcja, id słowa lub zdania).
          </Callout>
          <Card>
            <div className="row between">
              <div>
                <h3 style={{ margin: 0 }}>Syntezator mowy przeglądarki (opcjonalny)</h3>
                <p className="muted small" style={{ margin: 0 }}>Sztuczny głos, zależny od systemu; nie jest zweryfikowaną wymową. Przydatny tylko orientacyjnie.</p>
              </div>
              <label className="row">
                <input type="checkbox" checked={state.settings.ttsEnabled} onChange={(e) => dispatch({ type: 'settings', settings: { ttsEnabled: e.target.checked } })} /> włącz
              </label>
            </div>
          </Card>
          <Card>
            <h3>Nagrania w manifeście: {audioClips.length}</h3>
            {audioClips.length === 0 ? <p className="muted small">Brak nagrań. Instrukcja w README (sekcja „Jak dodać audio”).</p> : (
              <ul className="small">
                {audioClips.map((c) => (
                  <li key={c.file}>{c.targetId} – {c.speaker} ({c.dialect}) {c.verified ? '✓' : '(niezweryfikowane)'}</li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <h3>Słownictwo – odsłuch</h3>
            <p className="muted small">Lista słówek z przyciskiem odtwarzania (nagranie, jeśli istnieje; syntezator, jeśli włączony).</p>
            <div className="vocab-list">
              {allVocab.slice(0, 60).map((v) => (
                <div key={v.id} className="vocab-item">
                  <span className="vi"><Vi>{v.vi}</Vi></span>
                  <span className="pl">{v.pl}</span>
                  <span className="spacer" />
                  <AudioButton targetId={v.id} text={v.vi} />
                </div>
              ))}
            </div>
            <p className="muted tiny mt">Pokazano pierwsze 60 słówek. Pełna lista w zakładce Słownictwo.</p>
            <button type="button" className="btn sm" onClick={() => navigate('/slownictwo')}>Słownictwo →</button>
          </Card>
          <Pill>Formaty: mp3 / m4a · pola: dialect, speaker, source, lesson, targetId, verified</Pill>
        </div>
      )}
    </div>
  );
}
