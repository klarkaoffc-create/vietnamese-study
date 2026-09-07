export const DAY_MS = 24 * 60 * 60 * 1000;

export function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function daysBetween(a: number, b: number): number {
  return Math.round((startOfDay(b) - startOfDay(a)) / DAY_MS);
}

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateTime(ts: number): string {
  return new Date(ts).toLocaleString('pl-PL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function relativeDays(ts: number, now = Date.now()): string {
  const d = daysBetween(now, ts);
  if (d <= 0) return 'dziś';
  if (d === 1) return 'jutro';
  if (d < 7) return `za ${d} dni`;
  if (d < 30) return `za ${Math.round(d / 7)} tyg.`;
  return `za ${Math.round(d / 30)} mies.`;
}
