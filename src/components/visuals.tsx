/** Small inline visuals for generated exercises. */

export function ClockFace({ hour, minute, size = 150 }: { hour: number; minute: number; size?: number }) {
  const h = hour % 12;
  const hourAngle = (h + minute / 60) * 30;
  const minuteAngle = minute * 6;
  const r = size / 2;
  const hand = (angle: number, length: number, width: number, color: string) => {
    const rad = ((angle - 90) * Math.PI) / 180;
    return <line x1={r} y1={r} x2={r + Math.cos(rad) * length} y2={r + Math.sin(rad) * length} stroke={color} strokeWidth={width} strokeLinecap="round" />;
  };
  return (
    <svg className="clock" width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Zegar: ${hour}:${String(minute).padStart(2, '0')}`}>
      <circle cx={r} cy={r} r={r - 3} fill="var(--surface)" stroke="var(--text)" strokeWidth={3} />
      {Array.from({ length: 12 }, (_, i) => {
        const a = ((i * 30 - 90) * Math.PI) / 180;
        const inner = r - 14;
        const outer = r - 7;
        return <line key={i} x1={r + Math.cos(a) * inner} y1={r + Math.sin(a) * inner} x2={r + Math.cos(a) * outer} y2={r + Math.sin(a) * outer} stroke="var(--muted)" strokeWidth={2} />;
      })}
      {Array.from({ length: 12 }, (_, i) => {
        const n = i === 0 ? 12 : i;
        const a = ((i * 30 - 90) * Math.PI) / 180;
        const d = r - 26;
        return (
          <text key={n} x={r + Math.cos(a) * d} y={r + Math.sin(a) * d + 4} textAnchor="middle" fontSize={12} fill="var(--text)">
            {n}
          </text>
        );
      })}
      {hand(hourAngle, r * 0.5, 5, 'var(--text)')}
      {hand(minuteAngle, r * 0.75, 3, 'var(--primary)')}
      <circle cx={r} cy={r} r={4} fill="var(--primary)" />
    </svg>
  );
}

export function PositionVisual({ position }: { position: string }) {
  // Simple emoji diagram of a cat relative to a box.
  const box = <span style={{ fontSize: '2.6rem' }}>📦</span>;
  const cat = <span style={{ fontSize: '1.8rem' }}>🐱</span>;
  const layout: Record<string, JSX.Element> = {
    trong: <div style={{ position: 'relative', display: 'inline-block' }}>{box}<span style={{ position: 'absolute', left: '50%', top: '40%', transform: 'translate(-50%,-50%)', fontSize: '1.2rem' }}>🐱</span></div>,
    ngoài: <div className="row" style={{ gap: '2rem' }}>{box}<span className="muted small">→ daleko</span>{cat}</div>,
    trên: <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>{cat}{box}</div>,
    dưới: <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>{box}{cat}</div>,
    cạnh: <div className="row" style={{ gap: '0.5rem' }}>{box}{cat}</div>,
    trước: <div style={{ position: 'relative', display: 'inline-block' }}>{box}<span style={{ position: 'absolute', left: '60%', top: '65%', fontSize: '1.6rem' }}>🐱</span></div>,
    sau: <div style={{ position: 'relative', display: 'inline-block' }}><span style={{ position: 'absolute', left: '55%', top: '-45%', fontSize: '1.4rem', opacity: 0.85 }}>🐱</span>{box}</div>,
  };
  return <div className="position-visual" aria-hidden>{layout[position] ?? cat}</div>;
}
