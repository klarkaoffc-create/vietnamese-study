/**
 * Session builder.
 *
 * A session is no longer a deck of cards — it is a short, mixed language
 * workout. `buildSession('today')` produces the phased daily practice
 * described in the learning philosophy: warm-up → retrieval → conversation →
 * grammar in use → old mistakes → listening → free production.
 *
 * What decides WHICH abilities appear is still the spaced-repetition
 * scheduler (`srs.ts`); what decides HOW they appear is the task engine
 * (`tasks.ts`), which picks a task shape matching the automaticity level the
 * ability has reached.
 */
import type { Exercise } from '../data/schema';
import {
  allVocab,
  audioByTarget,
  dialogueById,
  exercisesForGrammar,
  exercisesForLessons,
  grammarById,
  lessonById,
  lessons,
  scenarioById,
  vocabById,
  type ExerciseEntry,
  type VocabEntry,
} from '../data/content';
import { generate, type GeneratedInstance } from './generators';
import { isDue, isWeak, makeSrsId, sortForReview, type AutomaticityLevel, type SrsItem, type SrsKind } from './srs';
import { mistakeSessionItems, mistakeTask, openMistakes } from './mistakes';
import { type AppState } from './state';
import { sample, shuffle } from '../utilities/random';
import {
  contextualVocab,
  dialogueTask,
  grammarTask,
  poolsFor,
  scenarioTask,
  speakingTask,
  usableExamples,
  vocabActiveTask,
  vocabPassiveTask,
  type LearningTask,
  type TaskPhase,
} from './tasks';

/** One thing to do in a session. */
export type SessionItem =
  /** A scheduled ability, presented as something to produce. */
  | { kind: 'task'; task: LearningTask; mistakeRef?: string }
  /** A hand-written exercise from the lesson content. */
  | { kind: 'exercise'; exercise: Exercise; lesson: string; mistakeRef?: string }
  /** A runtime-generated drill (numbers, clock, classifiers …). */
  | { kind: 'generated'; instance: GeneratedInstance; lesson: string; mistakeRef?: string };

export type ReviewMode = 'today' | 'production' | 'conversation' | 'grammar' | 'mistakes' | 'listening' | 'weak' | 'diagnostic';

export const REVIEW_MODES: { id: ReviewMode; label: string; description: string; icon: string }[] = [
  { id: 'today', label: 'Dzisiejsza sesja', description: 'Krótka mieszana sesja: rozgrzewka, przypomnienie, rozmowa, gramatyka w użyciu, twoje błędy i swobodna wypowiedź.', icon: '🌅' },
  { id: 'production', label: 'Budowanie zdań', description: 'Polski → wietnamski. Tworzysz całe zdania z materiału, który już znasz.', icon: '✍️' },
  { id: 'conversation', label: 'Rozmowa', description: 'Odpowiadasz na repliki z dialogów i sytuacje komunikacyjne.', icon: '💬' },
  { id: 'grammar', label: 'Gramatyka w użyciu', description: 'Struktury ćwiczone w żywych zdaniach, nie w regułkach.', icon: '📐' },
  { id: 'mistakes', label: 'Moje błędy', description: 'Zadania odtworzone z tego, co ostatnio nie wyszło.', icon: '❌' },
  { id: 'listening', label: 'Słuchanie', description: 'Zadania ze słuchu — dostępne, gdy dodasz nagrania.', icon: '🎧' },
  { id: 'weak', label: 'Słabe miejsca', description: 'To, co najczęściej nie wychodzi: słabe umiejętności i powracające błędy.', icon: '🧩' },
  { id: 'diagnostic', label: 'Szybka diagnoza', description: 'Krótkie sprawdzenie rozumienia słówek. Diagnostyka, nie główna nauka.', icon: '🩺' },
];

/* ------------------------------------------------------------------ */
/* Where the learner is                                                */
/* ------------------------------------------------------------------ */

export function currentLesson(state: AppState): number {
  let best = 0;
  for (const [id, p] of Object.entries(state.lessons)) {
    const l = lessonById.get(id);
    if (!l) continue;
    if (p.completed || p.visited) best = Math.max(best, p.completed ? l.number + 1 : l.number);
  }
  const maxLesson = lessons.length ? Math.max(...lessons.map((l) => l.number)) : 1;
  return Math.max(1, Math.min(best || 1, maxLesson));
}

export function studiedLessonNumbers(state: AppState): number[] {
  const cur = currentLesson(state);
  return lessons.map((l) => l.number).filter((n) => n <= cur);
}

/* ------------------------------------------------------------------ */
/* Scheduler queries                                                    */
/* ------------------------------------------------------------------ */

const itemsOfKind = (state: AppState, kinds: SrsKind[]) => Object.values(state.srs).filter((i) => kinds.includes(i.kind));

export function dueItems(state: AppState, kinds: SrsKind[], now = Date.now()): SrsItem[] {
  return sortForReview(itemsOfKind(state, kinds).filter((i) => isDue(i, now)), now);
}

export function weakAbilities(state: AppState): SrsItem[] {
  return Object.values(state.srs).filter(isWeak);
}

const levelOf = (item: SrsItem | undefined): AutomaticityLevel => (item?.level ?? 1) as AutomaticityLevel;

/** Vocabulary the learner has met but has never had to PRODUCE yet. */
function vocabNeedingActivation(state: AppState, pool: VocabEntry[], limit: number): VocabEntry[] {
  const fresh = pool.filter((v) => !state.srs[makeSrsId('vocab-active', v.id)]);
  // Prefer words that have a real sentence to practise inside.
  const withContext = contextualVocab(fresh);
  return sample(withContext.length >= limit ? withContext : fresh, limit);
}

/* ------------------------------------------------------------------ */
/* Turning scheduled abilities into tasks                               */
/* ------------------------------------------------------------------ */

function taskForDueItem(item: SrsItem, phase: TaskPhase): LearningTask | null {
  const level = levelOf(item);
  switch (item.kind) {
    case 'vocab-active': {
      const v = vocabById.get(item.ref);
      return v ? vocabActiveTask(v, level, phase) : null;
    }
    case 'vocab-passive': {
      const v = vocabById.get(item.ref);
      return v ? vocabPassiveTask(v, allVocab, phase) : null;
    }
    case 'grammar': {
      const g = grammarById.get(item.ref);
      return g ? grammarTask(g, level, phase) : null;
    }
    case 'dialogue': {
      const [dId, idxRaw] = item.ref.split('#');
      const d = dialogueById.get(dId);
      const idx = Number(idxRaw);
      return d && Number.isInteger(idx) ? dialogueTask(d, idx, level, phase) : null;
    }
    case 'sentence': {
      const s = scenarioById.get(item.ref);
      if (s) return scenarioTask({ ...s, lesson: s.lesson }, level, phase);
      // A sentence ability can also come from a speaking task on a vocab example.
      const v = vocabById.get(item.ref);
      const ex = v ? usableExamples(v)[0] : undefined;
      return v && ex ? speakingTask(ex.vi, ex.pl, v.id, v.lessonId, level, [v.id]) : null;
    }
    case 'listening':
      return null; // built separately, only when audio exists
  }
}

/* ------------------------------------------------------------------ */
/* Phase builders                                                       */
/* ------------------------------------------------------------------ */

const asItems = (tasks: (LearningTask | null)[]): SessionItem[] =>
  tasks.filter((t): t is LearningTask => !!t).map((task) => ({ kind: 'task', task }));

/**
 * Contextual vocabulary use: retrieve the word inside a real sentence
 * (cloze) rather than as an isolated pair. Used to open the session because
 * it is productive but well supported.
 */
function contextVocabPhase(state: AppState, pools: ReturnType<typeof poolsFor>, limit: number): SessionItem[] {
  const out: SessionItem[] = [];
  const contextual = contextualVocab(pools.vocab);
  // Prefer words already met (they have a scheduled ability), then new ones.
  const met = contextual.filter((v) => state.srs[makeSrsId('vocab-active', v.id)]);
  const pool = met.length >= limit ? met : [...met, ...contextual.filter((v) => !met.includes(v))];
  for (const v of sample(pool, limit)) {
    // Level 2 = the word blanked inside its own sentence.
    const t = vocabActiveTask(v, 2, 'warmup');
    if (t) out.push({ kind: 'task', task: t });
  }
  return out.slice(0, limit);
}

/** One spoken task, placed late in the session — never as the opener. */
function speakingPhase(state: AppState, pools: ReturnType<typeof poolsFor>, limit: number): SessionItem[] {
  const speakable = pools.vocab.filter((v) => usableExamples(v).length);
  return sample(speakable, limit).map((v) => {
    const ex = usableExamples(v)[0];
    const level = levelOf(state.srs[makeSrsId('sentence', v.id)]);
    return { kind: 'task' as const, task: speakingTask(ex.vi, ex.pl, v.id, v.lessonId, level, [v.id]) };
  });
}

/** Polish → Vietnamese production from material already met. */
function retrievalPhase(state: AppState, pools: ReturnType<typeof poolsFor>, limit: number, now: number): SessionItem[] {
  const due = dueItems(state, ['vocab-active', 'sentence'], now);
  const tasks = due.slice(0, limit).map((i) => taskForDueItem(i, 'retrieval'));
  const out = asItems(tasks);
  if (out.length < limit) {
    const fresh = vocabNeedingActivation(state, pools.vocab, limit - out.length).map((v) => vocabActiveTask(v, 3, 'retrieval'));
    out.push(...asItems(fresh));
  }
  return out.slice(0, limit);
}

/** Respond inside a conversation, or handle a communicative situation. */
function conversationPhase(state: AppState, pools: ReturnType<typeof poolsFor>, limit: number, now: number): SessionItem[] {
  const out: SessionItem[] = [];
  const due = dueItems(state, ['dialogue'], now);
  out.push(...asItems(due.slice(0, limit).map((i) => taskForDueItem(i, 'conversation'))));
  if (out.length < limit && pools.dialogues.length) {
    const fresh = sample(pools.dialogues, limit - out.length).map(({ dialogue, lineIndex }) => {
      const level = levelOf(state.srs[makeSrsId('dialogue', `${dialogue.id}#${lineIndex}`)]);
      return dialogueTask(dialogue, lineIndex, level, 'conversation');
    });
    out.push(...asItems(fresh));
  }
  if (out.length < limit && pools.scenarios.length) {
    const fresh = sample(pools.scenarios, limit - out.length).map((s) => scenarioTask(s, levelOf(state.srs[makeSrsId('sentence', s.id)]), 'conversation'));
    out.push(...asItems(fresh));
  }
  return out.slice(0, limit);
}

/** Grammar practised as live sentences, plus the hand-written drills. */
function grammarPhase(state: AppState, pools: ReturnType<typeof poolsFor>, limit: number, now: number): SessionItem[] {
  const out: SessionItem[] = [];
  const due = dueItems(state, ['grammar'], now);
  out.push(...asItems(due.slice(0, limit).map((i) => taskForDueItem(i, 'grammar'))));
  if (out.length < limit && pools.grammar.length) {
    const fresh = sample(pools.grammar, limit - out.length).map((g) => grammarTask(g, levelOf(state.srs[makeSrsId('grammar', g.id)]), 'grammar'));
    out.push(...asItems(fresh));
  }
  // Fall back to authored productive exercises if the pool is thin.
  if (out.length < limit) {
    const studied = studiedLessonNumbers(state);
    const authored = exercisesForLessons(studied).filter(
      (e) => e.exercise.status !== 'flagged' && ['typed', 'ordering', 'error-correction', 'fill-blank'].includes(e.exercise.type),
    );
    out.push(...sample(authored, limit - out.length).map((e) => ({ kind: 'exercise' as const, exercise: e.exercise, lesson: e.ownerId })));
  }
  return out.slice(0, limit);
}

function mistakesPhase(state: AppState, limit: number): SessionItem[] {
  return sample(openMistakes(state), limit)
    .map((m) => mistakeTask(m, state))
    .filter((x): x is SessionItem => !!x)
    .slice(0, limit);
}

/**
 * Listening tasks exist only where a real recording exists. No audio is
 * invented, so with an empty audio manifest this phase is simply empty.
 */
function listeningPhase(state: AppState, pools: ReturnType<typeof poolsFor>, limit: number): SessionItem[] {
  const withAudio = pools.vocab.filter((v) => (audioByTarget.get(v.id) ?? []).length > 0);
  return sample(withAudio, limit)
    .map((v) => {
      const clip = audioByTarget.get(v.id)![0];
      const ex = usableExamples(v)[0];
      const exercise: Exercise = {
        id: `e-${v.lessonId}-listen-${v.id}`.replace(/[^a-z0-9-]/gi, '-').toLowerCase(),
        type: 'typed',
        skill: 'listening',
        source: 'generated',
        status: 'unverified',
        instruction: `Posłuchaj (${clip.speaker}) i zapisz, co słyszysz.`,
        prompt: `🔊 ${ex ? 'Zapisz usłyszane zdanie.' : 'Zapisz usłyszane słowo.'}`,
        answerLang: 'vi',
        answers: [ex ? ex.vi : v.vi],
        grammar: [],
        vocab: [v.id],
        level: 3,
      };
      const task: LearningTask = {
        id: `t-listen-${v.id}`,
        srsKind: 'listening',
        srsRef: v.id,
        lesson: v.lessonId,
        level: levelOf(state.srs[makeSrsId('listening', v.id)]),
        phase: 'listening',
        exercise,
        targetVocab: [v.id],
        selfAssessed: false,
      };
      return { kind: 'task' as const, task };
    })
    .slice(0, limit);
}

/** One open prompt requiring several Vietnamese sentences. */
function freePhase(state: AppState, pools: ReturnType<typeof poolsFor>, limit: number): SessionItem[] {
  const multi = pools.scenarios.filter((s) => s.minSentences >= 2);
  const chosen = sample(multi.length ? multi : pools.scenarios, limit);
  return asItems(chosen.map((s) => scenarioTask(s, levelOf(state.srs[makeSrsId('sentence', s.id)]), 'free')));
}

/* ------------------------------------------------------------------ */
/* Session assembly                                                     */
/* ------------------------------------------------------------------ */

/** A task is "pure recognition" when it can be answered by picking, not producing. */
function isRecognition(item: SessionItem): boolean {
  const ex = item.kind === 'task' ? item.task.exercise : item.kind === 'exercise' ? item.exercise : null;
  if (ex) return ex.type === 'mcq' || ex.type === 'matching' || (ex.type === 'reading-question' && !!ex.options);
  return item.kind === 'generated' ? !!item.instance.options : false;
}

/**
 * Keep the session feeling like language practice: never let more than two
 * pure recognition tasks run back to back. Any third one in a row is swapped
 * with the next productive task further down the queue.
 */
export function interleave(items: SessionItem[]): SessionItem[] {
  const out = items.slice();
  for (let i = 2; i < out.length; i++) {
    if (!isRecognition(out[i]) || !isRecognition(out[i - 1]) || !isRecognition(out[i - 2])) continue;
    const swap = out.findIndex((it, j) => j > i && !isRecognition(it));
    if (swap === -1) break; // nothing productive left to pull forward
    [out[i], out[swap]] = [out[swap], out[i]];
  }
  return out;
}

export interface SessionPhaseSummary {
  phase: TaskPhase;
  count: number;
}

export interface SessionPlan {
  mode: ReviewMode;
  items: SessionItem[];
  phases: SessionPhaseSummary[];
  /** Rough minutes, for the dashboard. */
  estimatedMinutes: number;
}

function summarise(mode: ReviewMode, items: SessionItem[]): SessionPlan {
  const counts = new Map<TaskPhase, number>();
  for (const it of items) {
    if (it.kind !== 'task') continue;
    counts.set(it.task.phase, (counts.get(it.task.phase) ?? 0) + 1);
  }
  const order: TaskPhase[] = ['warmup', 'retrieval', 'conversation', 'grammar', 'mistakes', 'listening', 'free'];
  return {
    mode,
    items,
    phases: order.filter((p) => counts.has(p)).map((p) => ({ phase: p, count: counts.get(p)! })),
    estimatedMinutes: Math.max(3, Math.round(items.length * 1.2)),
  };
}

export function buildSession(state: AppState, mode: ReviewMode, now = Date.now()): SessionPlan {
  const studied = studiedLessonNumbers(state);
  const pools = poolsFor(studied);

  switch (mode) {
    case 'today': {
      // Daily workout, ~12 tasks, mixed roughly to the intended proportions:
      // 25% PL→VN production, 20% contextual vocabulary, 20% grammar in
      // sentences, 15% dialogue, 10% mistakes, 10% freer production, plus a
      // spoken task when there is something worth saying aloud.
      const items = [
        ...contextVocabPhase(state, pools, 2),      // ~20% contextual vocabulary
        ...retrievalPhase(state, pools, 3, now),    // ~25% PL → VN production
        ...grammarPhase(state, pools, 2, now),      // ~20% grammar in use
        ...conversationPhase(state, pools, 2, now), // ~15% dialogue response
        ...mistakesPhase(state, 1),                 // ~10% old mistakes
        ...listeningPhase(state, pools, 1),         // only when audio exists
        ...speakingPhase(state, pools, 1),          // spoken, never first
        ...freePhase(state, pools, 1),              // ~10% freer production
      ];
      return summarise(mode, interleave(items));
    }
    case 'production': {
      const items = [...retrievalPhase(state, pools, 8, now), ...freePhase(state, pools, 2)];
      return summarise(mode, items);
    }
    case 'conversation': {
      const items = [...conversationPhase(state, pools, 8, now), ...freePhase(state, pools, 2)];
      return summarise(mode, items);
    }
    case 'grammar':
      return summarise(mode, grammarPhase(state, pools, 10, now));
    case 'mistakes':
      // Exactly the mistakes the UI counted as open — see learning/mistakes.ts.
      return summarise(mode, mistakeSessionItems(state));
    case 'listening':
      return summarise(mode, listeningPhase(state, pools, 10));
    case 'weak': {
      const weak = weakAbilities(state).slice(0, 8);
      const items: SessionItem[] = asItems(weak.map((i) => taskForDueItem(i, 'retrieval')));
      items.push(...mistakesPhase(state, 4));
      return summarise(mode, items);
    }
    case 'diagnostic': {
      // The only place isolated word recognition is used, and even here it is
      // a real multiple-choice check, never a self-rated reveal.
      const seen = pools.vocab.filter((v) => state.srs[makeSrsId('vocab-active', v.id)] || state.srs[makeSrsId('vocab-passive', v.id)]);
      const pool = seen.length >= 5 ? seen : pools.vocab;
      const items = asItems(sample(pool, 12).map((v) => vocabPassiveTask(v, allVocab, 'warmup')));
      return summarise(mode, items);
    }
  }
}

/** Practice a single lesson: production-first, using its own material. */
export function buildLessonSession(state: AppState, lessonNumber: number): SessionItem[] {
  const pools = poolsFor([lessonNumber]);
  const items: SessionItem[] = [];
  for (const v of contextualVocab(pools.vocab).slice(0, 8)) {
    const t = vocabActiveTask(v, levelOf(state.srs[makeSrsId('vocab-active', v.id)]), 'retrieval');
    if (t) items.push({ kind: 'task', task: t });
  }
  for (const g of pools.grammar.slice(0, 4)) {
    const t = grammarTask(g, levelOf(state.srs[makeSrsId('grammar', g.id)]), 'grammar');
    if (t) items.push({ kind: 'task', task: t });
  }
  for (const { dialogue, lineIndex } of pools.dialogues.slice(0, 3)) {
    const t = dialogueTask(dialogue, lineIndex, levelOf(state.srs[makeSrsId('dialogue', `${dialogue.id}#${lineIndex}`)]), 'conversation');
    if (t) items.push({ kind: 'task', task: t });
  }
  for (const s of pools.scenarios.slice(0, 3)) {
    items.push({ kind: 'task', task: scenarioTask(s, levelOf(state.srs[makeSrsId('sentence', s.id)]), 'free') });
  }
  return shuffle(items);
}

/** Practise one vocabulary item across changing contexts. */
export function buildVocabSession(state: AppState, vocabId: string): SessionItem[] {
  const v = vocabById.get(vocabId);
  if (!v) return [];
  const level = levelOf(state.srs[makeSrsId('vocab-active', v.id)]);
  const out: SessionItem[] = [];
  // Same word, three different demands — that is what "in changing contexts" means.
  for (const lv of [Math.max(2, level - 1), level, Math.min(5, level + 1)] as AutomaticityLevel[]) {
    const t = vocabActiveTask(v, lv, 'retrieval');
    if (t) out.push({ kind: 'task', task: t });
  }
  const ex = usableExamples(v)[0];
  if (ex) out.push({ kind: 'task', task: speakingTask(ex.vi, ex.pl, v.id, v.lessonId, level, [v.id]) });
  return out;
}

/** Expand a content exercise (generators produce several instances). */
export function expandExercise(e: ExerciseEntry, count?: number, seed?: number): SessionItem[] {
  if (e.exercise.type === 'generator') {
    return generate(e.exercise.generator, e.exercise.params, count ?? e.exercise.count, seed).map((instance) => ({
      kind: 'generated' as const,
      instance,
      lesson: e.ownerId,
    }));
  }
  return [{ kind: 'exercise', exercise: e.exercise, lesson: e.ownerId }];
}

/** Grammar-linked exercises, used by the per-grammar practice route. */
export function grammarPracticeItems(grammarId: string): SessionItem[] {
  const g = grammarById.get(grammarId);
  const items: SessionItem[] = [];
  if (g) {
    for (const lv of [2, 3, 4] as AutomaticityLevel[]) {
      const t = grammarTask(g, lv, 'grammar');
      if (t) items.push({ kind: 'task', task: t });
    }
  }
  for (const e of exercisesForGrammar(grammarId).slice(0, 6)) items.push(...expandExercise(e, 1));
  return items;
}

/* ------------------------------------------------------------------ */
/* Dashboard counters                                                   */
/* ------------------------------------------------------------------ */

export function dashboardCounts(state: AppState, now = Date.now()) {
  const due = dueItems(state, ['vocab-active', 'vocab-passive', 'grammar', 'sentence', 'dialogue', 'listening'], now).length;
  const weak = weakAbilities(state).length;
  const mistakes = openMistakes(state).length;
  const studied = studiedLessonNumbers(state);
  const pools = poolsFor(studied);
  const fresh = pools.vocab.filter((v) => !state.srs[makeSrsId('vocab-active', v.id)]).length;
  return { due, weak, mistakes, fresh };
}
