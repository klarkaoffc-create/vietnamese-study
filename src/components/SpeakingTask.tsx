import { useEffect, useRef, useState } from 'react';
import type { SrsGrade } from '../learning/srs';
import { audioByTarget } from '../data/content';
import { AudioButton } from './AudioButton';
import { Callout, Kbd, Pill, Vi } from './ui';

/**
 * Speaking practice: say it → (optionally) record yourself → compare with the
 * model → rate yourself.
 *
 * Deliberately honest about its limits: the browser cannot reliably score
 * Vietnamese pronunciation, so nothing here pretends to. The value is in
 * producing the sentence aloud and hearing your own version next to the
 * model. Recording is optional — the task works without a microphone.
 */
export function SpeakingTask({
  target,
  translation,
  showTarget,
  targetId,
  onDone,
}: {
  target: string;
  translation?: string;
  showTarget: boolean;
  /** Vocabulary / line id, used to find a real recording if one exists. */
  targetId?: string;
  onDone: (grade: SrsGrade) => void;
}) {
  const [revealed, setRevealed] = useState(showTarget);
  const [recording, setRecording] = useState(false);
  const [myAudio, setMyAudio] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(
    () => () => {
      recorderRef.current?.state === 'recording' && recorderRef.current.stop();
      if (myAudio) URL.revokeObjectURL(myAudio);
    },
    [myAudio],
  );

  const canRecord = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';
  const hasModelAudio = !!targetId && (audioByTarget.get(targetId)?.length ?? 0) > 0;

  const start = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' });
        setMyAudio((old) => {
          if (old) URL.revokeObjectURL(old);
          return URL.createObjectURL(blob);
        });
      };
      recorderRef.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      setError('Nie udało się uruchomić mikrofonu. Możesz ćwiczyć bez nagrywania — powiedz zdanie na głos i oceń się sam(a).');
    }
  };

  const stop = () => {
    recorderRef.current?.stop();
    setRecording(false);
  };

  const grades: { g: SrsGrade; label: string; sub: string }[] = [
    { g: 0, label: 'Nie umiałam/em', sub: 'powtórz wkrótce' },
    { g: 1, label: 'Z trudem', sub: 'jeszcze poćwicz' },
    { g: 2, label: 'Powiedziane', sub: 'normalny odstęp' },
    { g: 3, label: 'Płynnie', sub: 'długi odstęp' },
  ];

  return (
    <div className="fade-in">
      <div className="row" style={{ marginBottom: '0.6rem' }}>
        <Pill tone="primary">🗣 mówienie</Pill>
        {!hasModelAudio && <Pill tone="warn">brak nagrania wzorcowego</Pill>}
      </div>

      {revealed ? (
        <div className="speak-target">
          <Vi big>{target}</Vi>
          {translation && <div className="muted small">{translation}</div>}
          <div className="row" style={{ marginTop: '0.5rem' }}>
            <AudioButton targetId={targetId} text={target} />
          </div>
        </div>
      ) : (
        <div className="speak-target muted">
          <p style={{ margin: 0 }}>Najpierw powiedz to po wietnamsku na głos, dopiero potem odsłoń wzór.</p>
          <button type="button" className="btn mt" onClick={() => setRevealed(true)}>
            Pokaż wzór
          </button>
        </div>
      )}

      <div className="ex-actions">
        {canRecord ? (
          recording ? (
            <button type="button" className="btn danger" onClick={stop}>
              ⏹ Zatrzymaj nagrywanie
            </button>
          ) : (
            <button type="button" className="btn" onClick={start}>
              🎙 {myAudio ? 'Nagraj jeszcze raz' : 'Nagraj siebie'}
            </button>
          )
        ) : (
          <span className="muted small">Nagrywanie niedostępne w tej przeglądarce — ćwicz na głos bez nagrania.</span>
        )}
        {myAudio && <audio controls src={myAudio} style={{ height: 34 }} />}
      </div>

      {error && <Callout tone="warn">{error}</Callout>}

      {revealed && (
        <>
          <p className="muted small" style={{ marginTop: '1rem' }}>
            Porównaj swoją wersję ze wzorem i oceń, jak ci poszło. Wymowy nie da się rzetelnie ocenić automatycznie, więc tę ocenę wystawiasz sam(a).
          </p>
          <div className="grade-row">
            {grades.map((g) => (
              <button key={g.g} type="button" className={`btn ${g.g >= 2 ? 'primary' : ''}`.trim()} onClick={() => onDone(g.g)}>
                {g.label}
                <small>
                  <Kbd>{g.g + 1}</Kbd> {g.sub}
                </small>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
