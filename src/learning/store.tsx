import { createContext, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { loadStateSafely, reducer, saveState, type Action, type AppState } from './state';

interface StoreValue {
  state: AppState;
  dispatch: (action: Action) => void;
  /** Set when stored progress could not be read; see `loadStateSafely`. */
  storageProblem: { canSave: boolean; recoveredKey?: string } | null;
}

const StoreContext = createContext<StoreValue | null>(null);

function browserStorage() {
  try {
    return typeof window !== 'undefined' ? window.localStorage : undefined;
  } catch {
    return undefined;
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [loaded] = useState(() => loadStateSafely(browserStorage()));
  const [state, dispatch] = useReducer(reducer, loaded.state);
  const timer = useRef<number | null>(null);
  useEffect(() => {
    // Never write over a record that could neither be read nor copied aside.
    if (!loaded.canSave) return;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => saveState(browserStorage(), state), 150);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [loaded.canSave, state]);
  const [storageProblem] = useState(() => (loaded.canSave && !loaded.recoveredKey ? null : { canSave: loaded.canSave, recoveredKey: loaded.recoveredKey }));
  const value = useMemo(() => ({ state, dispatch, storageProblem }), [state, storageProblem]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
}
