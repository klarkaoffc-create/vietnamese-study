import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Status, Source } from '../data/schema';

export function Vi({ children, className = '', big = false }: { children: ReactNode; className?: string; big?: boolean }) {
  return (
    <span lang="vi" className={`vi ${big ? 'big' : ''} ${className}`.trim()}>
      {children}
    </span>
  );
}

export function PageHeader({ eyebrow, title, children }: { eyebrow?: string; title: ReactNode; children?: ReactNode }) {
  return (
    <header className="page-header">
      {eyebrow && <div className="eyebrow">{eyebrow}</div>}
      <h1>{title}</h1>
      {children}
    </header>
  );
}

export function Card({ children, className = '', to, tight = false }: { children: ReactNode; className?: string; to?: string; tight?: boolean }) {
  const cls = `card ${tight ? 'tight' : ''} ${className}`.trim();
  if (to) {
    return (
      <Link to={to} className={`${cls} card-link`}>
        {children}
      </Link>
    );
  }
  return <div className={cls}>{children}</div>;
}

export function Pill({ children, tone = '' }: { children: ReactNode; tone?: '' | 'primary' | 'ok' | 'warn' | 'bad' | 'accent' | 'info' }) {
  return <span className={`pill ${tone}`.trim()}>{children}</span>;
}

export function Progress({ value, max = 100, tone, thin = false }: { value: number; max?: number; tone?: 'ok' | 'warn' | 'bad'; thin?: boolean }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className={`progress ${thin ? 'thin' : ''}`.trim()} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <i className={tone ?? ''} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Stat({ value, label, tone }: { value: ReactNode; label: string; tone?: 'ok' | 'warn' | 'bad' | 'primary' }) {
  return (
    <div className={`stat ${tone ?? ''}`.trim()}>
      <b>{value}</b>
      <span>{label}</span>
    </div>
  );
}

export function StatusTag({ status, source }: { status?: Status; source?: Source }) {
  return (
    <>
      {source === 'teacher' && <Pill tone="info">Materiał z lekcji</Pill>}
      {source === 'generated' && <Pill>Ćwiczenie wygenerowane do nauki</Pill>}
      {status === 'flagged' && <Pill tone="warn">⚠ Do weryfikacji</Pill>}
      {status === 'unverified' && source !== 'generated' && <Pill tone="warn">Klucz niezweryfikowany</Pill>}
    </>
  );
}

export function Callout({ children, tone = '' }: { children: ReactNode; tone?: '' | 'warn' | 'bad' | 'info' }) {
  return <div className={`callout ${tone}`.trim()}>{children}</div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="card muted" style={{ textAlign: 'center', padding: '2rem 1rem' }}>{children}</div>;
}

export function Kbd({ children }: { children: ReactNode }) {
  return <span className="kbd">{children}</span>;
}
