import { useCallback, useEffect, useState } from 'react';

/**
 * Dark / light preference.
 *
 * Stored under its own key, deliberately NOT inside the learner state: the
 * theme is a device setting, and it must be impossible for a colour choice to
 * touch SRS, mistakes, exams or the CEFR estimate — or to travel with an
 * exported progress file to a machine where it makes no sense.
 *
 * Dark is the default, so a first visit (or a browser that refuses storage)
 * gets the dark palette with no attribute written and no first-paint flash.
 */
export type Theme = 'dark' | 'light';

export const THEME_KEY = 'vietnamese-study:theme';

export function readStoredTheme(): Theme {
  try {
    return window.localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

/** Point the document — and the mobile browser chrome — at a palette. */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  // Dark is what `:root` already declares, so it needs no attribute at all.
  if (theme === 'light') root.setAttribute('data-theme', 'light');
  else root.removeAttribute('data-theme');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'light' ? '#f5f4ef' : '#0f1214');
}

export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(() => (typeof window === 'undefined' ? 'dark' : readStoredTheme()));

  useEffect(() => {
    applyTheme(theme);
    try {
      window.localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* private mode or quota — the palette still applies for this session */
    }
  }, [theme]);

  return [theme, useCallback((t: Theme) => setTheme(t), [])];
}
