/**
 * Learner state persisted in localStorage. Pure reducer + (de)serialisation so
 * it can be tested without React.
 */
import type { SrsGrade, SrsItem, SrsKind } from './srs';
import { makeSrsId, newSrsItem, schedule } from './srs';
import type { MistakeCategory, Outcome } from './grading';
import type { GeneratorKind } from '../data/schema';

export const STORAGE_KEY = 'vietnamese-study:v1';
export const STATE_VERSION = 2;

export interface Mistake {
  id: string;
  ts: number;
  lesson: string;
  /** Exercise id, generated instance id or vocab id. */
  ref: string;
  refKind: 'exercise' | 'generated' | 'vocab';
  /**
   * Generator kind, set only when refKind is "generated". Re-practising a
   * generated mistake needs to know which generator produced it; this is
   * stored explicitly rather than guessed by parsing `ref` (generated
   * instance ids are opaque and not guaranteed to embed the exact
   * GeneratorKind string — e.g. tone-identify instances use the id prefix
   * "gen:tone:", not "gen:tone-identify:").
   */
  generatorKind?: GeneratorKind;
  category: MistakeCategory;
  prompt: string;
  expected: string;
  given: string;
  outcome: Outcome;
  /** Times practised again since logging. */
  retries: number;
  resolved: boolean;
  resolvedTs?: number;
  flagged: boolean;
}

export interface CheckpointResult {
  ts: number;
  score: number;
  total: number;
}

export interface LessonProgress {
  visited?: number;
  completed?: number;
  checkpoints: CheckpointResult[];
}

export interface ExamAnswerRecord {
  exerciseId: string;
  lesson: string;
  skill: MistakeCategory;
  prompt: string;
  expected: string;
  given: string;
  outcome: Outcome;
  score: number;
}

export interface ExamAttempt {
  id: string;
  examId: string;
  block: number;
  ts: number;
  seed: number;
  percent: number;
  answers: ExamAnswerRecord[];
  bySkill: Record<string, { score: number; total: number }>;
  byLesson: Record<string, { score: number; total: number }>;
}

export interface StudySession {
  ts: number;
  kind: string;
  items: number;
  correct: number;
  durationSec: number;
}

export interface Settings {
  ttsEnabled: boolean;
  dailyNewLimit: number;
  dailyReviewLimit: number;
}

export interface AppState {
  version: number;
  createdAt: number;
  srs: Record<string, SrsItem>;
  lessons: Record<string, LessonProgress>;
  mistakes: Mistake[];
  exams: ExamAttempt[];
  sessions: StudySession[];
  settings: Settings;
}

export function initialState(now = Date.now()): AppState {
  return {
    version: STATE_VERSION,
    createdAt: now,
    srs: {},
    lessons: {},
    mistakes: [],
    exams: [],
    sessions: [],
    settings: { ttsEnabled: false, dailyNewLimit: 10, dailyReviewLimit: 40 },
  };
}

export type Action =
  | { type: 'review'; kind: SrsKind; ref: string; lesson: string; grade: SrsGrade; now?: number }
  | { type: 'mistake'; mistake: Omit<Mistake, 'id' | 'ts' | 'retries' | 'resolved'>; now?: number }
  | { type: 'mistake-retry'; ref: string; success: boolean; now?: number }
  | { type: 'resolve-mistake'; id: string; now?: number }
  | { type: 'clear-resolved-mistakes' }
  | { type: 'visit-lesson'; lesson: string; now?: number }
  | { type: 'complete-lesson'; lesson: string; completed: boolean; now?: number }
  | { type: 'checkpoint'; lesson: string; score: number; total: number; now?: number }
  | { type: 'exam'; attempt: ExamAttempt }
  | { type: 'session'; session: StudySession }
  | { type: 'settings'; settings: Partial<Settings> }
  | { type: 'import'; state: AppState }
  | { type: 'reset' };

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'review': {
      const now = action.now ?? Date.now();
      const id = makeSrsId(action.kind, action.ref);
      const item = state.srs[id] ?? newSrsItem(action.kind, action.ref, action.lesson, now);
      return { ...state, srs: { ...state.srs, [id]: schedule(item, action.grade, now) } };
    }
    case 'mistake': {
      const now = action.now ?? Date.now();
      // Merge with an existing unresolved mistake for the same ref.
      const existing = state.mistakes.find((m) => m.ref === action.mistake.ref && !m.resolved);
      if (existing) {
        const updated: Mistake = { ...existing, ts: now, given: action.mistake.given, outcome: action.mistake.outcome, category: action.mistake.category, retries: 0 };
        return { ...state, mistakes: state.mistakes.map((m) => (m.id === existing.id ? updated : m)) };
      }
      const mistake: Mistake = { ...action.mistake, id: `m-${now}-${Math.floor(Math.random() * 1e6)}`, ts: now, retries: 0, resolved: false };
      return { ...state, mistakes: [mistake, ...state.mistakes].slice(0, 500) };
    }
    case 'mistake-retry': {
      const now = action.now ?? Date.now();
      return {
        ...state,
        mistakes: state.mistakes.map((m) => {
          if (m.ref !== action.ref || m.resolved) return m;
          const retries = action.success ? m.retries + 1 : 0;
          // Two consecutive successful retries resolve the mistake.
          if (retries >= 2) return { ...m, retries, resolved: true, resolvedTs: now };
          return { ...m, retries };
        }),
      };
    }
    case 'resolve-mistake': {
      const now = action.now ?? Date.now();
      return { ...state, mistakes: state.mistakes.map((m) => (m.id === action.id ? { ...m, resolved: true, resolvedTs: now } : m)) };
    }
    case 'clear-resolved-mistakes':
      return { ...state, mistakes: state.mistakes.filter((m) => !m.resolved) };
    case 'visit-lesson': {
      const now = action.now ?? Date.now();
      const lp = state.lessons[action.lesson] ?? { checkpoints: [] };
      return { ...state, lessons: { ...state.lessons, [action.lesson]: { ...lp, visited: now } } };
    }
    case 'complete-lesson': {
      const now = action.now ?? Date.now();
      const lp = state.lessons[action.lesson] ?? { checkpoints: [] };
      return { ...state, lessons: { ...state.lessons, [action.lesson]: { ...lp, completed: action.completed ? now : undefined } } };
    }
    case 'checkpoint': {
      const now = action.now ?? Date.now();
      const lp = state.lessons[action.lesson] ?? { checkpoints: [] };
      const checkpoints = [...lp.checkpoints, { ts: now, score: action.score, total: action.total }].slice(-20);
      const passed = action.total > 0 && action.score / action.total >= 0.8;
      return { ...state, lessons: { ...state.lessons, [action.lesson]: { ...lp, checkpoints, completed: passed ? lp.completed ?? now : lp.completed } } };
    }
    case 'exam':
      return { ...state, exams: [action.attempt, ...state.exams].slice(0, 100) };
    case 'session':
      return { ...state, sessions: [action.session, ...state.sessions].slice(0, 200) };
    case 'settings':
      return { ...state, settings: { ...state.settings, ...action.settings } };
    case 'import':
      return migrate(action.state);
    case 'reset':
      return initialState();
  }
}

/** Validate/migrate a persisted or imported object into a usable state. */
/**
 * Version 1 scheduled flashcard directions (`vocab-vi-pl` / `vocab-pl-vi`).
 * Version 2 schedules abilities instead. The mapping is the honest one:
 * recognising Vietnamese → Polish was a passive check, producing Vietnamese
 * from Polish was active use. Existing intervals and success counts are kept,
 * and every migrated item starts at automaticity level 1 or 2 depending on
 * whether it had ever been produced.
 */
function migrateSrsV1toV2(srs: Record<string, SrsItem>): Record<string, SrsItem> {
  const out: Record<string, SrsItem> = {};
  const remap: Record<string, SrsKind> = { 'vocab-vi-pl': 'vocab-passive', 'vocab-pl-vi': 'vocab-active' };
  for (const item of Object.values(srs)) {
    const kind = (remap[item.kind as string] ?? item.kind) as SrsKind;
    const migrated: SrsItem = {
      ...item,
      kind,
      id: makeSrsId(kind, item.ref),
      // Production history earns level 2; recognition-only history stays at 1.
      level: item.level ?? (kind === 'vocab-active' && item.successes > 0 ? 2 : 1),
    };
    // If both directions existed for one word they now collapse onto two
    // separate abilities; keep whichever record is further along.
    const prev = out[migrated.id];
    out[migrated.id] = !prev || migrated.interval > prev.interval ? migrated : prev;
  }
  return out;
}

export function migrate(raw: unknown): AppState {
  const base = initialState();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<AppState>;
  if (typeof r.version !== 'number' || r.version > STATE_VERSION) throw new Error('Nieznana wersja pliku postępu.');
  const rawSrs = r.srs && typeof r.srs === 'object' ? (r.srs as Record<string, SrsItem>) : {};
  return {
    ...base,
    createdAt: typeof r.createdAt === 'number' ? r.createdAt : base.createdAt,
    srs: r.version < 2 ? migrateSrsV1toV2(rawSrs) : rawSrs,
    lessons: r.lessons && typeof r.lessons === 'object' ? r.lessons : {},
    mistakes: Array.isArray(r.mistakes) ? r.mistakes : [],
    exams: Array.isArray(r.exams) ? r.exams : [],
    sessions: Array.isArray(r.sessions) ? r.sessions : [],
    settings: { ...base.settings, ...(r.settings ?? {}) },
  };
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function loadState(storage: StorageLike | undefined): AppState {
  if (!storage) return initialState();
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return initialState();
    return migrate(JSON.parse(raw));
  } catch {
    return initialState();
  }
}

export function saveState(storage: StorageLike | undefined, state: AppState): void {
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* quota or private mode – ignore */
  }
}

export function exportState(state: AppState): string {
  return JSON.stringify({ ...state, exportedAt: Date.now(), app: 'vietnamese-study' }, null, 2);
}

export function parseImport(text: string): AppState {
  const parsed = JSON.parse(text);
  if (parsed?.app !== 'vietnamese-study') throw new Error('To nie jest plik postępu tej aplikacji.');
  return migrate(parsed);
}

/* ------------------------------------------------------------------ */
/* Selectors                                                           */
/* ------------------------------------------------------------------ */

export function completedLessonNumbers(state: AppState, lessonNumberById: (id: string) => number | undefined): Set<number> {
  const out = new Set<number>();
  for (const [id, p] of Object.entries(state.lessons)) {
    if (p.completed) {
      const n = lessonNumberById(id);
      if (n !== undefined) out.add(n);
    }
  }
  return out;
}

export function srsItemFor(state: AppState, kind: SrsKind, ref: string): SrsItem | undefined {
  return state.srs[makeSrsId(kind, ref)];
}

export function unresolvedMistakes(state: AppState): Mistake[] {
  return state.mistakes.filter((m) => !m.resolved);
}
