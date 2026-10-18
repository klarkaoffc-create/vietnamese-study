import { useEffect, useState } from 'react';
import { audioByTarget } from '../data/content';
import { useStore } from '../learning/store';

/** Slow playback speed. Pitch is preserved, so tones keep their shape. */
const SLOW_RATE = 0.7;
const TTS_RATE = 0.85;
const TTS_SLOW_RATE = 0.55;

function playRecording(src: string, rate: number) {
  const a = new Audio(src);
  a.playbackRate = rate;
  // Time-stretch rather than resample: a slowed recording must not drop in
  // pitch, or every tone would sound lower than it is.
  (a as HTMLAudioElement & { preservesPitch?: boolean; webkitPreservesPitch?: boolean }).preservesPitch = true;
  (a as HTMLAudioElement & { webkitPreservesPitch?: boolean }).webkitPreservesPitch = true;
  void a.play();
}

function speak(text: string, rate: number) {
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'vi-VN';
  const voice = window.speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith('vi'));
  if (voice) u.voice = voice;
  u.rate = rate;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}

/**
 * Plays a verified recording when one exists in the audio manifest. When none
 * exists and the learner enabled the option in settings, offers browser
 * speech synthesis clearly labelled as synthetic. Both can be played slower.
 *
 * `compact` renders icon-only buttons, for lists of sentence pieces.
 */
export function AudioButton({ targetId, text, compact = false }: { targetId?: string; text: string; compact?: boolean }) {
  const { state } = useStore();
  const clips = targetId ? audioByTarget.get(targetId) ?? [] : [];
  const [ttsAvailable, setTtsAvailable] = useState(false);

  useEffect(() => {
    if (!state.settings.ttsEnabled || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const check = () => setTtsAvailable(window.speechSynthesis.getVoices().some((v) => v.lang.toLowerCase().startsWith('vi')));
    check();
    window.speechSynthesis.addEventListener('voiceschanged', check);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', check);
  }, [state.settings.ttsEnabled]);

  if (clips.length) {
    const clip = clips[0];
    const src = `${import.meta.env.BASE_URL}audio/${clip.file}`;
    const title = `Nagranie: ${clip.speaker} (${clip.dialect}) – ${clip.source}${clip.verified ? '' : ' – niezweryfikowane'}`;
    return (
      <span className="audio-group">
        <button type="button" className="btn sm" title={title} onClick={() => playRecording(src, 1)}>
          🔊{compact ? '' : clip.verified ? ' Nagranie' : ' Nagranie (niezweryfikowane)'}
        </button>
        <button type="button" className="btn sm ghost" title={`${title} – wolniej`} aria-label="Odtwórz wolniej" onClick={() => playRecording(src, SLOW_RATE)}>
          🐢
        </button>
      </span>
    );
  }
  if (!state.settings.ttsEnabled || !ttsAvailable) return null;
  const title = 'Syntezator mowy przeglądarki – to NIE jest wymowa native speakera';
  return (
    <span className="audio-group">
      <button type="button" className="btn sm ghost" title={title} onClick={() => speak(text, TTS_RATE)}>
        🤖{compact ? '' : ' Syntezator (niezweryfikowany)'}
      </button>
      <button type="button" className="btn sm ghost" title={`${title} – wolniej`} aria-label="Syntezator wolniej" onClick={() => speak(text, TTS_SLOW_RATE)}>
        🐢
      </button>
    </span>
  );
}
