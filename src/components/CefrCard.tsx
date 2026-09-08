import { useState } from 'react';
import {
  CEFR_CONFIDENCE_LABEL,
  CEFR_LEVELS,
  CEFR_STAGE_LABEL,
  type CefrEstimate,
  type CefrLevel,
} from '../learning/cefr';
import { Card, Progress } from './ui';

/**
 * The CEFR estimate on the progress dashboard.
 *
 * Presentation only: every threshold, weight and rule lives in
 * `src/learning/cefr.ts`. This file decides how to say it in Polish, and
 * nothing else.
 */

export const CEFR_DISCLAIMER = 'To orientacyjna estymacja na podstawie wyników w aplikacji, a nie oficjalny certyfikat językowy.';

/** How the level reads on screen. Never a decimal — "A1", never "A1.73". */
function levelText(est: CefrEstimate): string {
  if (!est.sufficientEvidence && est.evidence.gradedProduction === 0) return 'Za mało danych';
  return est.level === 'pre-A1' ? 'Pre-A1' : est.level;
}

function stageText(est: CefrEstimate): string {
  if (!est.sufficientEvidence) return est.evidence.gradedProduction === 0 ? 'ćwicz dalej, żeby oszacować poziom' : 'wstępnie';
  return CEFR_STAGE_LABEL[est.stage];
}

/** The next thing worth aiming at, phrased for the "what's missing" list. */
function gapTarget(est: CefrEstimate): string {
  if (!est.sufficientEvidence) return 'pierwszej wiarygodnej oceny';
  if (est.level === 'pre-A1') return 'poziomu A1';
  if (est.stage !== 'strong') return `mocnego ${est.level}`;
  if (!est.atCourseCeiling) {
    const next = CEFR_LEVELS[CEFR_LEVELS.indexOf(est.level) + 1] as CefrLevel | undefined;
    return next ? `poziomu ${next}` : `pełnego ${est.level}`;
  }
  return 'pełnego wykorzystania obecnego kursu';
}

/* ------------------------------------------------------------------ */
/* The stat card                                                        */
/* ------------------------------------------------------------------ */

export function CefrStat({ estimate, open, onToggle }: { estimate: CefrEstimate; open: boolean; onToggle: () => void }) {
  const [info, setInfo] = useState(false);
  const level = levelText(estimate);
  const long = level.length > 6;

  return (
    <div className="stat cefr">
      <div className="row between">
        <span className="cefr-caption">Szacowany poziom CEFR</span>
        <button
          type="button"
          className="info-dot"
          title={CEFR_DISCLAIMER}
          aria-label="Co oznacza ta estymacja?"
          aria-expanded={info}
          onClick={() => setInfo((v) => !v)}
        >
          i
        </button>
      </div>
      <b className={long ? 'cefr-level long' : 'cefr-level'}>{level}</b>
      <span className="cefr-stage">{stageText(estimate)}</span>
      <span className="cefr-basis">na podstawie aktywnych umiejętności</span>
      {estimate.sufficientEvidence && (
        <span className="cefr-basis">pewność estymacji: {CEFR_CONFIDENCE_LABEL[estimate.confidence]}</span>
      )}
      {info && <p className="cefr-info">{CEFR_DISCLAIMER}</p>}
      <button type="button" className="cefr-how" aria-expanded={open} onClick={onToggle}>
        {open ? 'Ukryj szczegóły' : 'Jak to liczymy?'}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* The breakdown                                                        */
/* ------------------------------------------------------------------ */

export function CefrDetail({ estimate }: { estimate: CefrEstimate }) {
  const { evidence } = estimate;
  const ceiling = estimate.ceiling === 'pre-A1' ? 'Pre-A1' : estimate.ceiling;

  return (
    <Card className="mb">
      <h3>Jak liczymy poziom CEFR</h3>
      <p className="muted tiny" style={{ marginTop: 0 }}>{CEFR_DISCLAIMER}</p>

      <p className="cefr-verdict">
        Szacowany poziom: <b>{levelText(estimate)}</b> — {stageText(estimate)}
      </p>

      <h4 className="cefr-heading">Dowody</h4>
      <p className="muted tiny" style={{ marginTop: 0 }}>
        Liczy się to, co potrafisz wyprodukować. Aktywne umiejętności ważą 90 % oceny, rozumienie 10 % — samo rozpoznawanie słów nie podnosi poziomu.
      </p>
      {evidence.components.map((c) => (
        <div key={c.id} style={{ marginBottom: '0.55rem' }}>
          <div className="row between small">
            <span>
              {c.label} <span className="muted tiny">waga {Math.round(c.weight * 100)} %</span>
            </span>
            <b>{c.percent}%</b>
          </div>
          <Progress value={c.percent} tone={c.percent >= 70 ? 'ok' : c.percent >= 35 ? 'warn' : undefined} thin />
        </div>
      ))}

      {evidence.gaps.length > 0 && (
        <>
          <h4 className="cefr-heading">Do {gapTarget(estimate)} najbardziej brakuje Ci:</h4>
          <ul className="small cefr-gaps">
            {evidence.gaps.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        </>
      )}

      <h4 className="cefr-heading">
        Potwierdzone umiejętności — {evidence.canDoDemonstrated} z {evidence.canDoAvailable}
      </h4>
      <p className="muted tiny" style={{ marginTop: 0 }}>
        Z celów lekcji („Po tej lekcji potrafię…”). Umiejętność liczy się dopiero wtedy, gdy potrafisz ją wykonać, a nie gdy przeczytasz o niej lekcję.
      </p>
      {evidence.missingCanDo.length === 0 ? (
        <p className="small">Wszystkie umiejętności z tego poziomu są potwierdzone.</p>
      ) : (
        <ul className="small cefr-gaps">
          {evidence.missingCanDo.slice(0, 6).map((c) => (
            <li key={c.id}>
              {c.label} <span className="muted tiny">{c.percent}%</span>
            </li>
          ))}
        </ul>
      )}

      <p className="muted tiny mt">
        Sufit obecnego kursu: <b>{ceiling}</b>. Bài 1–12 to materiał dla początkujących, więc nawet pełne opanowanie całego kursu oznacza mocne {ceiling},
        a nie automatycznie wyższy poziom. Kolejne lekcje rozszerzą ten sufit.
      </p>
      <p className="muted tiny">
        Ocenione zadania produkcyjne: {evidence.gradedProduction} · umiejętności powtórzone co najmniej dwa razy: {evidence.repeatedItems} · obszary umiejętności:{' '}
        {evidence.skillAreas} · checkpointy i egzaminy: {evidence.cumulativeChecks}
        {evidence.recurringMistakes > 0 ? ` · powracające błędy: ${evidence.recurringMistakes}` : ''}
        {evidence.listeningCounted ? '' : ' · słuchanie doliczymy, gdy pojawią się prawdziwe nagrania'}
      </p>
    </Card>
  );
}
