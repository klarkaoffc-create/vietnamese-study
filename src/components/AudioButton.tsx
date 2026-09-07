import { useEffect, useState } from 'react';
import { audioByTarget } from '../data/content';
import { useStore } from '../learning/store';

/**
 * Plays a verified recording when one exists in the audio manifest. When none
 * exists and the learner enabled the option in settings, offers browser
 * speech synthesis clearly labelled as synthetic.
 */
export function AudioButton({ targetId, text }: { targetId?: string; text: string }) {
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
    const base = import.meta.env.BASE_URL;
    return (
      <button
        type="button"
        className="btn sm"
        title={`Nagranie: ${clip.speaker} (${clip.dialect}) – ${clip.source}${clip.verified ? '' : ' – niezweryfikowane'}`}
        onClick={() => {
          const a = new Audio(`${base}audio/${clip.file}`);
          void a.play();
        }}
      >
        🔊 {clip.verified ? 'Nagranie' : 'Nagranie (niezweryfikowane)'}
      </button>
    );
  }
  if (!state.settings.ttsEnabled || !ttsAvailable) return null;
  return (
    <button
      type="button"
      className="btn sm ghost"
      title="Syntezator mowy przeglądarki – to NIE jest wymowa native speakera"
      onClick={() => {
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'vi-VN';
        const voice = window.speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith('vi'));
        if (voice) u.voice = voice;
        u.rate = 0.85;
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(u);
      }}
    >
      🤖 Syntezator (niezweryfikowany)
    </button>
  );
}
