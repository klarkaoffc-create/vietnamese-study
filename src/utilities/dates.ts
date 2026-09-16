export const DAY_MS = 24 * 60 * 60 * 1000;

export function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Same LOCAL calendar day? Never compares UTC dates. */
export function isSameLocalDay(a: number, b: number): boolean {
  return startOfDay(a) === startOfDay(b);
}

/**
 * Milliseconds from `now` until the next local midnight.
 *
 * Built by advancing the calendar date and zeroing the clock rather than by
 * adding 24 h, so days that are not 24 h long — the DST switches — still land
 * exactly on midnight. Always at least 1 ms, so a caller scheduling a timeout
 * can never busy-loop on the boundary itself.
 */
export function msUntilNextLocalMidnight(now = Date.now()): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 1);
  return Math.max(1, d.getTime() - now);
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
