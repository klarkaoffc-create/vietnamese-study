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
  prompt,
  instruction,
  target,
  translation,
  showTarget,
  targetId,
  onDone,
}: {
  /** What the learner has to say, in Polish. Shown before the attempt. */
  prompt: string;
  instruction?: string;
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

  // Enter drives the task, matching every other exercise. The runner's own
  // Enter handler stands down for spoken tasks, so it is wired here instead.
  // preventDefault also stops the browser re-firing it as a click on the
  // focused button, which would advance twice.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.defaultPrevented) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      e.preventDefault();
      if (revealed) onDone(2);
      else setRevealed(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDone, revealed]);


  return (
    <div className="fade-in">
      <div className="row" style={{ marginBottom: '0.6rem' }}>
        <Pill tone="primary">🗣 mówienie</Pill>
        {!hasModelAudio && <Pill tone="warn">brak nagrania wzorcowego</Pill>}
      </div>

      {instruction && <p className="ex-instruction">{instruction}</p>}
      {/* The task itself is always visible: the learner must know what to
          say before saying it. Only the Vietnamese model is hidden. */}
      <h2 className="ex-prompt">{prompt}</h2>

      {revealed ? (
        <div className="speak-target">
          <div className="muted tiny">Wzór</div>
          <Vi big>{target}</Vi>
          {translation && <div className="muted small">{translation}</div>}
          <div className="row" style={{ marginTop: '0.5rem', justifyContent: 'center' }}>
            <AudioButton targetId={targetId} text={target} />
          </div>
        </div>
      ) : (
        <div className="speak-target muted">
          <p style={{ margin: 0 }}>
            Powiedz to po wietnamsku na głos (możesz się nagrać). Wzór odsłonisz dopiero po próbie.
          </p>
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

      {!revealed ? (
        <div className="ex-actions">
          <button type="button" className="btn primary" onClick={() => setRevealed(true)}>
            Powiedziałam/em — pokaż wzór <Kbd>Enter</Kbd>
          </button>
        </div>
      ) : (
        <>
          <div className="ex-actions">
            {/* Continuing IS the normal outcome: you produced the sentence.
                The scheduler takes that as a plain success, so there is no
                "did you know it?" question to answer. */}
            <button type="button" className="btn primary" onClick={() => onDone(2)}>
              Dalej <Kbd>Enter</Kbd>
            </button>
          </div>
          {/* Secondary, deliberately small: pronunciation cannot be graded
              automatically, so the only self-assessment offered is a nudge
              up or down — never a four-button rating screen. */}
          <div className="self-assess">
            <span>Wyszło inaczej?</span>
            <button type="button" onClick={() => onDone(0)}>nie wyszło</button>
            <button type="button" onClick={() => onDone(1)}>z trudem</button>
            <button type="button" onClick={() => onDone(3)}>bez wysiłku</button>
          </div>
        </>
      )}
    </div>
  );
}
