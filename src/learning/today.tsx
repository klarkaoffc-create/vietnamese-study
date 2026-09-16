import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { startOfDay } from '../utilities/dates';
import { createDayWatcher } from '../utilities/dayWatcher';

/**
 * "Today", as a piece of reactive state.
 *
 * Everything date-dependent in the app — due counts, the daily session, the
 * nav badges, the activity heatmap — used to read `Date.now()` during render.
 * That is correct the moment a page loads and wrong ever after: leave the tab
 * open past midnight and it keeps yesterday's queue until a manual reload.
 *
 * This provider makes the current LOCAL calendar day observable. It never
 * counts 24 hours from page load; it targets the next local midnight, which
 * also keeps it right across the DST switches.
 *
 * Three things move it forward, because any one of them can be missed:
 *
 *  1. a timeout aimed at the next local midnight — the normal case;
 *  2. `visibilitychange` and `focus` — a sleeping laptop suspends timers, so
 *     a MacBook closed at 22:00 and opened the next morning fires no timeout
 *     at all, and the check has to happen when the page comes back;
 *  3. a slow interval as a backstop, for a window that is visible and focused
 *     the whole time but whose timer was throttled or fired late.
 *
 * It updates React state. Nothing here reloads the page.
 */
const TodayContext = createContext<number | null>(null);

/** How often to re-check when nothing else has woken us. Cheap: two integer compares. */
const HEARTBEAT_MS = 60_000;

export function TodayProvider({ children, now = Date.now }: { children: ReactNode; now?: () => number }) {
  const [dayStart, setDayStart] = useState(() => startOfDay(now()));

  useEffect(() => {
    const watcher = createDayWatcher(
      { now, setTimer: (fn, ms) => window.setTimeout(fn, ms), clearTimer: (id) => window.clearTimeout(id) },
      setDayStart,
    );
    // `focus` alone is not enough: returning from another Space, or unlocking
    // the machine, can fire only visibilitychange; `pageshow` covers Safari's
    // back/forward cache restoring a page that slept for hours.
    const onWake = () => {
      if (document.visibilityState === 'visible') watcher.check();
    };
    const heartbeat = window.setInterval(() => watcher.check(), HEARTBEAT_MS);
    document.addEventListener('visibilitychange', onWake);
    window.addEventListener('focus', onWake);
    window.addEventListener('pageshow', onWake);

    return () => {
      watcher.stop();
      window.clearInterval(heartbeat);
      document.removeEventListener('visibilitychange', onWake);
      window.removeEventListener('focus', onWake);
      window.removeEventListener('pageshow', onWake);
    };
  }, [now]);

  return <TodayContext.Provider value={dayStart}>{children}</TodayContext.Provider>;
}

/**
 * Start-of-day timestamp for the current local calendar day. Re-renders the
 * caller when the day rolls over, so putting it in a `useMemo` dependency
 * list is all a date-dependent computation needs.
 */
export function useToday(): number {
  const ctx = useContext(TodayContext);
  // Falling back keeps components usable in isolation (tests, storybook-like
  // renders) without forcing every one of them to be wrapped.
  return ctx ?? startOfDay(Date.now());
}

/**
 * A timestamp safe to pass as "now" to the scheduler. It is the current
 * instant, but it changes identity when the day does, which is what makes
 * memoised due-counts recompute at midnight.
 */
export function useNowForDay(): number {
  const day = useToday();
  return useMemo(() => Math.max(Date.now(), day), [day]);
}
