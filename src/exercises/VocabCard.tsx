import { useEffect, useState } from 'react';
import type { VocabEntry } from '../data/content';
import type { SrsGrade } from '../learning/srs';
import { matchAny, feedbackFor } from '../utilities/vietnamese';
import { TextInput } from './inputs';
import { AudioButton } from '../components/AudioButton';
import { Kbd, Pill, Vi } from '../components/ui';
import { lessonLabel } from '../data/content';

export interface VocabOutcome {
  grade: SrsGrade;
  outcome: 'correct' | 'tone' | 'wrong';
  given: string;
}

/**
 * Vocabulary recall card.
 *  - VN→PL: recall the meaning, reveal, self-grade (1–4). Optional typing.
 *  - PL→VN: type the Vietnamese; graded automatically with tone detection,
 *    then confirm/override the grade.
 */
export function VocabCard({ vocab, direction, onDone }: { vocab: VocabEntry; direction: 'vi-pl' | 'pl-vi'; onDone: (o: VocabOutcome) => void }) {
  const [typed, setTyped] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [auto, setAuto] = useState<VocabOutcome | null>(null);

  useEffect(() => {
    setTyped('');
    setRevealed(false);
    setAuto(null);
  }, [vocab.id, direction]);

  const reveal = () => setRevealed(true);
  const check = () => {
    if (revealed) return;
    const m = matchAny(typed, [vocab.vi, ...vocab.vi.split('/').map((s) => s.trim())].filter(Boolean));
    const outcome = m.kind;
    const grade: SrsGrade = outcome === 'correct' ? 2 : outcome === 'tone' ? 1 : 0;
    setAuto({ grade, outcome, given: typed });
    setRevealed(true);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        if (e.key === 'Enter' && revealed) {
          e.preventDefault();
          if (auto) onDone(auto);
        }
        return;
      }
      if (!revealed && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault();
        direction === 'vi-pl' ? reveal() : check();
      } else if (revealed && ['1', '2', '3', '4'].includes(e.key)) {
        onDone({ grade: (Number(e.key) - 1) as SrsGrade, outcome: Number(e.key) >= 3 ? 'correct' : Number(e.key) === 2 ? 'tone' : 'wrong', given: typed });
      } else if (revealed && e.key === 'Enter' && auto) {
        onDone(auto);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const front = direction === 'vi-pl' ? vocab.vi : vocab.pl;
  const back = direction === 'vi-pl' ? vocab.pl : vocab.vi;
  const grades: { g: SrsGrade; label: string; sub: string; cls: string }[] = [
    { g: 0, label: 'Nie umiem', sub: 'powtórz wkrótce', cls: 'danger' },
    { g: 1, label: 'Trudne', sub: 'krótki odstęp', cls: '' },
    { g: 2, label: 'Umiem', sub: 'normalny odstęp', cls: 'primary' },
    { g: 3, label: 'Łatwe', sub: 'długi odstęp', cls: '' },
  ];

  return (
    <div className="vocab-card fade-in">
      <div className="row" style={{ justifyContent: 'center', marginBottom: '0.5rem' }}>
        <Pill tone="primary">{direction === 'vi-pl' ? 'wietnamski → polski' : 'polski → wietnamski'}</Pill>
        <Pill>{lessonLabel(vocab.lessonNumber)}</Pill>
        {vocab.status === 'flagged' && <Pill tone="warn">⚠ do weryfikacji</Pill>}
      </div>
      <div className="term">{direction === 'vi-pl' ? <Vi>{front}</Vi> : front}</div>
      {direction === 'vi-pl' && <AudioButton targetId={vocab.id} text={vocab.vi} />}
      {vocab.classifier && direction === 'vi-pl' && <div className="muted small">klasyfikator: <Vi>{vocab.classifier}</Vi></div>}

      {!revealed && direction === 'vi-pl' && (
        <div style={{ marginTop: '1.25rem' }}>
          <p className="muted small">Przypomnij sobie znaczenie, potem odsłoń.</p>
          <button type="button" className="btn primary big" onClick={reveal}>
            Pokaż odpowiedź <span className="kbd">spacja</span>
          </button>
        </div>
      )}

      {!revealed && direction === 'pl-vi' && (
        <div style={{ marginTop: '1rem', textAlign: 'left' }}>
          <TextInput value={typed} onChange={setTyped} onSubmit={check} result={null} placeholder="Wpisz po wietnamsku (z tonami)…" />
          <div className="ex-actions">
            <button type="button" className="btn primary" onClick={check}>
              Sprawdź <span className="kbd">Enter</span>
            </button>
            <button type="button" className="btn ghost" onClick={reveal}>
              Nie wiem – pokaż
            </button>
          </div>
        </div>
      )}

      {revealed && (
        <div className="fade-in">
          <div className="answer">{direction === 'vi-pl' ? back : <Vi big>{back}</Vi>}</div>
          {direction === 'pl-vi' && <AudioButton targetId={vocab.id} text={vocab.vi} />}
          {vocab.note && <div className="muted small" style={{ marginTop: '0.4rem' }}>{vocab.note}</div>}
          {vocab.dialect && <div className="muted small">Dialekt: {vocab.dialect}</div>}
          {vocab.examples.length > 0 && (
            <div className="small" style={{ marginTop: '0.6rem' }}>
              <Vi>{vocab.examples[0].vi}</Vi>
              {vocab.examples[0].pl && <span className="muted"> – {vocab.examples[0].pl}</span>}
            </div>
          )}
          {auto && (
            <div className={`feedback ${auto.outcome}`} style={{ textAlign: 'left' }}>
              {feedbackFor(matchAny(auto.given, [vocab.vi]), vocab.vi)}
            </div>
          )}
          <p className="muted small" style={{ marginTop: '1rem' }}>
            {auto ? 'Ocena automatyczna zaznaczona – potwierdź Enterem albo zmień:' : 'Jak ci poszło?'}
          </p>
          <div className="grade-row">
            {grades.map((g) => (
              <button key={g.g} type="button" className={`btn ${g.cls} ${auto && auto.grade === g.g ? 'primary' : ''}`.trim()} onClick={() => onDone({ grade: g.g, outcome: g.g >= 2 ? 'correct' : g.g === 1 ? 'tone' : 'wrong', given: typed })}>
                {g.label}
                <small>
                  <Kbd>{g.g + 1}</Kbd> {g.sub}
                </small>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
