import { Fragment } from 'react';
import type { Chunk } from '../data/schema';
import { comparisonForm, detectTone, TONES, type ToneName } from '../utilities/vietnamese';
import { AudioButton } from './AudioButton';

const TONE_LABEL = new Map(TONES.map((t) => [t.name, t.label]));
const CLASS: Record<ToneName, string> = { ngang: 'ngang', huyền: 'huyen', sắc: 'sac', hỏi: 'hoi', ngã: 'nga', nặng: 'nang' };

/**
 * Vietnamese text with every syllable coloured by its tone. Used only where
 * the learner is focusing on pronunciation (the model in a speaking task, the
 * feedback after a tone slip, the sentence broken into pieces), never as the
 * default rendering, so colour stays a signal rather than decoration.
 *
 * Colour is never the only cue: the tone name is in each syllable's tooltip,
 * and slipped syllables are also underlined.
 */
export function ToneText({ text, slips, big = false }: { text: string; slips?: Set<string>; big?: boolean }) {
  const parts = text.split(/([\p{L}\p{M}]+)/u);
  return (
    <span lang="vi" className={`vi tone-text ${big ? 'big' : ''}`.trim()}>
      {parts.map((p, i) => {
        if (!/[\p{L}]/u.test(p)) return <Fragment key={i}>{p}</Fragment>;
        const tone = detectTone(p);
        const slipped = slips?.has(comparisonForm(p));
        return (
          <span key={i} className={`tone-${CLASS[tone]}${slipped ? ' tone-slip' : ''}`} title={TONE_LABEL.get(tone)}>
            {p}
          </span>
        );
      })}
    </span>
  );
}

/** One line explaining the colours, shown next to coloured text. */
export function ToneLegend() {
  return (
    <div className="tone-legend muted tiny" aria-label="Kolory tonów">
      {TONES.map((t) => (
        <span key={t.name} className={`tone-${CLASS[t.name]}`}>
          {t.label}
        </span>
      ))}
    </div>
  );
}

const TONE_MARKS = /[\u0300\u0301\u0303\u0309\u0323]/g;
/** The syllable with its tone mark removed but its letters (ơ, ư, â, đ…) kept. */
const withoutTone = (s: string) => s.normalize('NFD').replace(TONE_MARKS, '').normalize('NFC');

/** Letters (not tones) that differ, e.g. "ơ" when "với" was typed as "voi". */
function letterSlips(expected: string, given: string): string[] {
  const e = [...withoutTone(expected)];
  const g = [...withoutTone(given)];
  return e.length === g.length ? e.filter((c, i) => c !== g[i]) : [];
}

/** What went wrong with tones, syllable by syllable. */
export function ToneSlipNote({ expected, slips }: { expected: string; slips: { expected: string; given: string }[] }) {
  const set = new Set(slips.map((s) => s.expected));
  return (
    <div className="tone-note">
      <ToneText text={expected} slips={set} />
      <ul className="tone-slip-list">
        {slips.map((s, i) => {
          const sameTone = detectTone(s.expected) === detectTone(s.given);
          const letters = letterSlips(s.expected, s.given);
          return (
            <li key={i}>
              <span lang="vi">„{s.expected}”</span>
              {sameTone ? ' — ton dobry' : <> ma ton <b>{TONE_LABEL.get(detectTone(s.expected))}</b></>}
              {letters.length > 0 && (sameTone ? <>, ale powinna być litera <b lang="vi">{letters.join(', ')}</b></> : <> i literę <b lang="vi">{letters.join(', ')}</b></>)}
              {' '}— wpisano <span lang="vi">„{s.given}”</span>
              {!sameTone && ` (${TONE_LABEL.get(detectTone(s.given))})`}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** A longer sentence shown in its meaningful pieces, each with its meaning. */
export function ChunkBreakdown({ chunks, title = 'Zdanie w częściach' }: { chunks: Chunk[]; title?: string }) {
  return (
    <div className="chunk-breakdown">
      <div className="muted tiny">{title}</div>
      <ol className="chunk-list">
        {chunks.map((c, i) => (
          <li key={i}>
            <ToneText text={c.vi} />
            <span className="chunk-pl">{c.pl}</span>
            <AudioButton text={c.vi} compact />
          </li>
        ))}
      </ol>
    </div>
  );
}
