import { useState } from 'react';
import type { Dialogue } from '../data/schema';
import { AudioButton } from './AudioButton';
import { Pill, Vi } from './ui';

export type DialogueMode = 'read' | 'hide-a' | 'hide-b' | 'recall';

/**
 * Reusable dialogue renderer: plain reading, hiding one speaker's lines,
 * reveal-after-recall for every line, and an optional blank line (for
 * completion exercises).
 */
export function DialogueView({
  dialogue,
  mode = 'read',
  showTranslation = true,
  blankIndex,
  blankContent,
}: {
  dialogue: Dialogue;
  mode?: DialogueMode;
  showTranslation?: boolean;
  blankIndex?: number;
  blankContent?: React.ReactNode;
}) {
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const speakers = Array.from(new Set(dialogue.lines.map((l) => l.speaker)));
  const isHidden = (i: number, speaker: string) => {
    if (revealed.has(i)) return false;
    if (mode === 'recall') return true;
    if (mode === 'hide-a') return speaker === speakers[0];
    if (mode === 'hide-b') return speaker === speakers[1];
    return false;
  };
  return (
    <div className="dialogue-lines">
      {dialogue.lines.map((line, i) => {
        const cls = line.speaker === speakers[0] ? 'a' : 'b';
        if (blankIndex === i) {
          return (
            <div key={i} className={`dl ${cls}`}>
              <div className="speaker">{line.speaker}</div>
              <div className="line blank-line">{blankContent}</div>
            </div>
          );
        }
        const hidden = isHidden(i, line.speaker);
        return (
          <div key={i} className={`dl ${cls}`}>
            <div className="speaker">{line.speaker}</div>
            <div>
              <div
                className={`line ${hidden ? 'hidden-line' : ''}`}
                onClick={() => hidden && setRevealed((s) => new Set(s).add(i))}
                role={hidden ? 'button' : undefined}
                tabIndex={hidden ? 0 : undefined}
                onKeyDown={(e) => {
                  if (hidden && (e.key === 'Enter' || e.key === ' ')) setRevealed((s) => new Set(s).add(i));
                }}
              >
                <Vi>{line.vi}</Vi>
                {!hidden && line.status === 'flagged' && (
                  <>
                    {' '}
                    <Pill tone="warn">⚠ do weryfikacji</Pill>
                  </>
                )}
                {!hidden && <span style={{ marginLeft: '0.5rem' }}><AudioButton targetId={`${dialogue.id}#${i}`} text={line.vi} /></span>}
              </div>
              {!hidden && showTranslation && line.pl && <div className="pl">{line.pl}</div>}
              {!hidden && line.note && <div className="pl">ℹ {line.note}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
