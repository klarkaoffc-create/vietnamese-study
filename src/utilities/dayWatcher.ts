import { msUntilNextLocalMidnight, startOfDay } from './dates';

/**
 * Watches the local calendar date and reports when it changes.
 *
 * Framework-free and fully injectable so the awkward cases — a suspended
 * laptop, a throttled timer, a timeout that fires late — can be tested
 * without a browser or a real clock.
 *
 * The timer always targets the next local midnight rather than counting 24
 * hours from now, which keeps it exact across the DST switches. It is only
 * the *primary* trigger though: a sleeping machine fires no timers at all, so
 * the host is expected to call `check()` whenever the page wakes up.
 */
export interface DayWatcherDeps {
  now: () => number;
  setTimer: (fn: () => void, ms: number) => number;
  clearTimer: (id: number) => void;
}

export interface DayWatcher {
  /** Start-of-day timestamp of the day this watcher last saw. */
  readonly day: number;
  /** Re-read the clock; fires the callback when the calendar day moved. Returns the current day. */
  check: () => number;
  stop: () => void;
}

export function createDayWatcher(deps: DayWatcherDeps, onDayChange: (dayStart: number) => void): DayWatcher {
  let day = startOfDay(deps.now());
  let timer: number | null = null;
  let stopped = false;

  const schedule = () => {
    if (stopped) return;
    if (timer !== null) deps.clearTimer(timer);
    timer = deps.setTimer(() => {
      timer = null;
      check();
    }, msUntilNextLocalMidnight(deps.now()));
  };

  const check = (): number => {
    if (stopped) return day;
    const current = startOfDay(deps.now());
    if (current !== day) {
      day = current;
      onDayChange(current);
    }
    // Always reschedule: a timer that fired late (or a wake-up check) must
    // leave a fresh timeout aimed at the *next* midnight, not the past one.
    schedule();
    return current;
  };

  schedule();

  return {
    get day() {
      return day;
    },
    check,
    stop() {
      stopped = true;
      if (timer !== null) deps.clearTimer(timer);
      timer = null;
    },
  };
}
