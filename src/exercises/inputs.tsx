import { useEffect, useMemo, useRef, useState } from 'react';
import type { GradeResult } from '../learning/grading';
import { comparisonForm } from '../utilities/vietnamese';
import { applyToneAt, insertAt, TOOLBAR_CHARS, TOOLBAR_TONES } from '../utilities/typing';
import { shuffle } from '../utilities/random';
import { Vi } from '../components/ui';

/* ------------------------------------------------------------------ */
/* Choice                                                               */
/* ------------------------------------------------------------------ */

export function ChoiceInput({
  options,
  selected,
  onSelect,
  correctIndex,
  result,
  order,
  lang = 'vi',
}: {
  options: string[];
  selected: number | null;
  onSelect: (i: number) => void;
  correctIndex?: number;
  result: GradeResult | null;
  order?: number[];
  lang?: 'vi' | 'pl';
}) {
  const idxs = order ?? options.map((_, i) => i);
  useEffect(() => {
    if (result) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const n = Number(e.key);
      if (n >= 1 && n <= idxs.length) onSelect(idxs[n - 1]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [idxs, onSelect, result]);
  return (
    <div className="options" role="radiogroup">
      {idxs.map((optIdx, pos) => {
        let cls = 'option';
        if (result && correctIndex !== undefined) {
          if (optIdx === correctIndex) cls += ' correct';
          else if (optIdx === selected) cls += ' wrong';
        } else if (optIdx === selected) cls += ' selected';
        return (
          <button key={optIdx} type="button" className={cls} disabled={!!result} onClick={() => onSelect(optIdx)} role="radio" aria-checked={optIdx === selected}>
            <span className="letter">{pos + 1}</span>
            {lang === 'vi' ? <Vi>{options[optIdx]}</Vi> : <span>{options[optIdx]}</span>}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Text with Vietnamese toolbar                                         */
/* ------------------------------------------------------------------ */

export function TextInput({
  value,
  onChange,
  onSubmit,
  result,
  lang = 'vi',
  placeholder,
  autoFocus = true,
  multiline = false,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit?: () => void;
  result: GradeResult | null;
  lang?: 'vi' | 'pl';
  placeholder?: string;
  autoFocus?: boolean;
  multiline?: boolean;
}) {
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  useEffect(() => {
    if (autoFocus && !result) ref.current?.focus();
  }, [autoFocus, result]);
  const cls = `text ${result ? (result.outcome === 'correct' ? 'ok' : result.outcome === 'tone' || result.outcome === 'partial' ? 'tone' : 'bad') : ''}`.trim();
  const apply = (fn: (text: string, pos: number) => { text: string; pos: number }) => {
    const el = ref.current;
    const pos = el?.selectionStart ?? value.length;
    const r = fn(value, pos);
    onChange(r.text);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(r.pos, r.pos);
    });
  };
  const common = {
    ref,
    className: cls,
    value,
    lang,
    placeholder: placeholder ?? (lang === 'vi' ? 'Wpisz po wietnamsku…' : 'Wpisz po polsku…'),
    disabled: !!result,
    autoCapitalize: 'off' as const,
    autoCorrect: 'off',
    spellCheck: false,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(e.target.value),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey && onSubmit) {
        e.preventDefault();
        onSubmit();
      }
    },
  };
  return (
    <div>
      {multiline ? <textarea {...common} rows={2} /> : <input type="text" {...common} />}
      {lang === 'vi' && !result && (
        <div className="chips" style={{ marginTop: '0.5rem' }} aria-label="Znaki wietnamskie">
          {TOOLBAR_CHARS.map((c) => (
            <button key={c} type="button" className="chip" tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onClick={() => apply((t, p) => insertAt(t, p, c))}>
              {c}
            </button>
          ))}
          <span className="muted tiny" style={{ alignSelf: 'center' }}>ton:</span>
          {TOOLBAR_TONES.map((t) => (
            <button key={t.label} type="button" className="chip" tabIndex={-1} title="Dodaj ton do ostatniej sylaby" onMouseDown={(e) => e.preventDefault()} onClick={() => apply((txt, p) => applyToneAt(txt, p, t.combining))}>
              {t.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Fill in the blank                                                    */
/* ------------------------------------------------------------------ */

export function FillBlankInput({
  sentence,
  bank,
  value,
  onChange,
  onSubmit,
  result,
}: {
  sentence: string;
  bank?: string[];
  value: string;
  onChange: (v: string) => void;
  onSubmit?: () => void;
  result: GradeResult | null;
}) {
  const [before, after] = sentence.split('___');
  const shuffledBank = useMemo(() => (bank ? shuffle(bank) : undefined), [bank]);
  return (
    <div>
      <p className="ex-prompt vi" lang="vi">
        {before}
        <span className="blank">{value || '…'}</span>
        {after}
      </p>
      {shuffledBank && (
        <div className="chips" style={{ marginBottom: '0.75rem' }}>
          {shuffledBank.map((w) => (
            <button key={w} type="button" className={`chip ${comparisonForm(w) === comparisonForm(value) ? 'on' : ''}`} disabled={!!result} onClick={() => onChange(w)} lang="vi">
              {w}
            </button>
          ))}
        </div>
      )}
      <TextInput value={value} onChange={onChange} onSubmit={onSubmit} result={result} placeholder="Wpisz brakujące słowo…" autoFocus={!shuffledBank} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Matching                                                             */
/* ------------------------------------------------------------------ */

export function MatchingInput({
  pairs,
  value,
  onChange,
  result,
}: {
  pairs: { left: string; right: string }[];
  value: Record<string, string>;
  onChange: (v: Record<string, string>) => void;
  result: GradeResult | null;
}) {
  const rights = useMemo(() => shuffle(pairs.map((p) => p.right)), [pairs]);
  const [selLeft, setSelLeft] = useState<string | null>(null);
  const usedRights = new Set(Object.values(value));
  const correctFor = (left: string) => pairs.find((p) => p.left === left)?.right;
  const pickRight = (right: string) => {
    if (!selLeft || result) return;
    const next = { ...value };
    for (const k of Object.keys(next)) if (next[k] === right) delete next[k];
    next[selLeft] = right;
    onChange(next);
    setSelLeft(null);
  };
  return (
    <div className="match-grid">
      <div className="match-col">
        {pairs.map((p) => {
          let cls = 'match-item';
          if (result) cls += value[p.left] === p.right ? ' correct' : ' wrong';
          else if (selLeft === p.left) cls += ' selected';
          else if (value[p.left]) cls += ' paired';
          return (
            <button key={p.left} type="button" className={cls} disabled={!!result} onClick={() => setSelLeft(selLeft === p.left ? null : p.left)}>
              <Vi>{p.left}</Vi>
              {value[p.left] && <span className="muted small"> → {value[p.left]}</span>}
              {result && value[p.left] !== p.right && <span className="small"> (✓ {correctFor(p.left)})</span>}
            </button>
          );
        })}
      </div>
      <div className="match-col">
        {rights.map((r) => (
          <button key={r} type="button" className={`match-item ${usedRights.has(r) ? 'paired' : ''}`} disabled={!!result} onClick={() => pickRight(r)}>
            {r}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Ordering                                                             */
/* ------------------------------------------------------------------ */

export function OrderingInput({
  tokens,
  value,
  onChange,
  result,
}: {
  tokens: string[];
  value: string[];
  onChange: (v: string[]) => void;
  result: GradeResult | null;
}) {
  const pool = useMemo(() => shuffle(tokens.map((t, i) => ({ t, i }))), [tokens]);
  const usedIdx = new Set<number>();
  // map chosen tokens back to pool indices (handles duplicates)
  const chosen: { t: string; i: number }[] = [];
  for (const v of value) {
    const cand = pool.find((p) => p.t === v && !usedIdx.has(p.i));
    if (cand) {
      usedIdx.add(cand.i);
      chosen.push(cand);
    }
  }
  return (
    <div>
      <div className="tokens" aria-label="Twoje zdanie">
        {chosen.length === 0 && <span className="muted small">Kliknij wyrazy w odpowiedniej kolejności…</span>}
        {chosen.map((c, pos) => (
          <button key={`${c.i}-${pos}`} type="button" className="token" lang="vi" disabled={!!result} onClick={() => onChange(value.filter((_, j) => j !== pos))}>
            {c.t}
          </button>
        ))}
      </div>
      <div className="chips" style={{ marginTop: '0.6rem' }}>
        {pool.map((p) => (
          <button key={p.i} type="button" className="token" lang="vi" disabled={!!result || usedIdx.has(p.i)} onClick={() => onChange([...value, p.t])}>
            {p.t}
          </button>
        ))}
      </div>
    </div>
  );
}
