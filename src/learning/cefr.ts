/**
 * Estimated CEFR level, derived from demonstrated performance.
 *
 * The rules, in one place so nothing leaks into the UI:
 *
 * 1. The estimate is built from ABILITIES the learner has demonstrated
 *    (scheduled SRS items and their automaticity), never from lessons
 *    opened, minutes spent, pages viewed or words merely seen.
 * 2. Active production dominates. Speaking fluently is the goal, so
 *    producing words, sentences, grammar and dialogue turns carries 80 % of
 *    the weight; comprehension carries 10 % and automaticity 10 %.
 * 3. Passive knowledge supports the estimate but can never lift it on its
 *    own — the composite is clamped to the production score plus a small
 *    headroom (see PASSIVE_HEADROOM).
 * 4. Nothing is awarded without enough evidence (MIN_EVIDENCE): a handful of
 *    lucky answers is not an A1.
 * 5. The course itself has a ceiling. Bài 1–12 is beginner material, so
 *    mastering all of it is strong A1 evidence — not A2. The ceiling is
 *    derived from CEFR_CAPABILITIES: a level is only reachable when the
 *    loaded content actually contains the can-do abilities for it. Adding
 *    future lessons plus their capabilities extends the ceiling on its own.
 *
 * The estimate is a pure function of state: it reads, never writes.
 */
import { allDialogues, allGrammar, allVocab, audioClips, lessons, scenarios } from '../data/content';
import { isAutomatic, makeSrsId, mastery, type SrsItem, type SrsKind } from './srs';
import { populationScore } from './skills';
import type { AppState } from './state';

/* ------------------------------------------------------------------ */
/* Levels, stages, confidence                                          */
/* ------------------------------------------------------------------ */

export type CefrLevel = 'pre-A1' | 'A1' | 'A2' | 'B1' | 'B2' | 'C1';

/** Ascending. Index order is the comparison order everywhere below. */
export const CEFR_LEVELS: CefrLevel[] = ['pre-A1', 'A1', 'A2', 'B1', 'B2', 'C1'];

/** How far into the current level the learner is. Never shown as a decimal. */
export type CefrStage = 'early' | 'developing' | 'strong';

export type CefrConfidence = 'low' | 'medium' | 'high';

export const CEFR_STAGE_LABEL: Record<CefrStage, string> = {
  early: 'początek',
  developing: 'w trakcie',
  strong: 'mocne',
};

export const CEFR_CONFIDENCE_LABEL: Record<CefrConfidence, string> = {
  low: 'niska',
  medium: 'średnia',
  high: 'wysoka',
};

const levelIndex = (l: CefrLevel) => CEFR_LEVELS.indexOf(l);

/* ------------------------------------------------------------------ */
/* Weighted components                                                  */
/* ------------------------------------------------------------------ */

export type CefrComponentId = 'active-vocab' | 'sentences' | 'grammar' | 'dialogue' | 'comprehension' | 'automaticity';

/**
 * Weights sum to 1. Production-heavy on purpose: the learner's goal is to
 * speak, so recognising Vietnamese is worth a tenth of producing it.
 */
export const CEFR_WEIGHTS: Record<CefrComponentId, number> = {
  'active-vocab': 0.2,
  sentences: 0.25,
  grammar: 0.15,
  dialogue: 0.2,
  comprehension: 0.1,
  automaticity: 0.1,
};

/** Everything except comprehension: what the learner can actively produce. */
export const PRODUCTION_COMPONENTS: CefrComponentId[] = ['active-vocab', 'sentences', 'grammar', 'dialogue', 'automaticity'];

export const CEFR_COMPONENT_LABEL: Record<CefrComponentId, string> = {
  'active-vocab': 'Słownictwo aktywne',
  sentences: 'Budowanie zdań',
  grammar: 'Gramatyka w użyciu',
  dialogue: 'Dialogi',
  comprehension: 'Rozumienie',
  automaticity: 'Automatyzm',
};

/** What the learner should work on when a component is holding the level back. */
const COMPONENT_GAP_PHRASE: Record<CefrComponentId, string> = {
  'active-vocab': 'aktywnego użycia słownictwa',
  sentences: 'szybszego budowania zdań',
  grammar: 'pewniejszego użycia struktur w zdaniach',
  dialogue: 'odpowiedzi dialogowych',
  comprehension: 'rozumienia czytanego i ze słuchu',
  automaticity: 'produkcji bez podpowiedzi',
};

/**
 * How much a perfect comprehension score may exceed pure production. Small
 * on purpose: understanding Vietnamese without being able to say it is not
 * a higher CEFR level, it is a gap.
 */
export const PASSIVE_HEADROOM = 8;

/** Recurring unresolved mistakes shave points off, bounded so it cannot dominate. */
export const MISTAKE_PENALTY_PER_ITEM = 0.5;
export const MISTAKE_PENALTY_MAX = 10;

/* ------------------------------------------------------------------ */
/* Thresholds                                                           */
/* ------------------------------------------------------------------ */

export interface CefrThreshold {
  /** Weighted composite (0–100) needed for this level. */
  score: number;
  /** Production-only composite (0–100) needed. Blocks passive-only inflation. */
  production: number;
  /** Share of this level's can-do abilities that must be demonstrated. */
  canDoShare: number;
  /** How many can-do abilities the COURSE must offer before the level exists. */
  minCapabilities: number;
}

/**
 * Add a row here (and capabilities below) when the course grows into a new
 * level. Nothing else needs to change.
 */
export const CEFR_THRESHOLDS: Record<Exclude<CefrLevel, 'pre-A1'>, CefrThreshold> = {
  A1: { score: 35, production: 30, canDoShare: 0.45, minCapabilities: 6 },
  A2: { score: 60, production: 55, canDoShare: 0.55, minCapabilities: 8 },
  B1: { score: 72, production: 68, canDoShare: 0.6, minCapabilities: 10 },
  B2: { score: 82, production: 78, canDoShare: 0.65, minCapabilities: 12 },
  C1: { score: 90, production: 88, canDoShare: 0.7, minCapabilities: 14 },
};

/**
 * Below this, an estimate would be noise rather than information. All three
 * must be satisfied: enough graded production, more than one kind of skill,
 * and abilities actually retrieved more than once (not one lucky answer).
 */
export const MIN_EVIDENCE = {
  /** Graded attempts on production abilities. */
  gradedProduction: 15,
  /** Distinct production skill areas practised. */
  skillAreas: 2,
  /** Abilities answered at least twice. */
  repeatedItems: 5,
};

/** A can-do ability counts as demonstrated at this much mastery. */
export const CAN_DO_THRESHOLD = 55;

/* ------------------------------------------------------------------ */
/* Can-do abilities                                                     */
/* ------------------------------------------------------------------ */

/**
 * Communicative abilities, taken from the lessons' own
 * "Po tej lekcji potrafię…" objectives and tied to the content that proves
 * them. This is the meaningful half of the estimate: "can order food" says
 * far more than "knows 240 words".
 *
 * A capability only exists for the estimate when the content it points at is
 * actually loaded, which is what keeps the course ceiling honest.
 */
export interface CanDoCapability {
  id: string;
  /** Polish, phrased as something the learner can do. */
  label: string;
  level: CefrLevel;
  /** Lessons the ability is introduced in. Its vocabulary is the vocab evidence. */
  lessons: string[];
  /** Grammar points that have to work in live sentences. */
  grammar: string[];
  /** Scenarios that demonstrate the whole ability end to end. */
  scenarios: string[];
}

/**
 * Bài 1–12 in can-do form. Everything here is A1: greetings, personal
 * information, family, routines, dates and times, ordering food, describing
 * things and places, asking for and giving simple directions.
 *
 * There is deliberately no A2 row yet. A2 needs abilities this course does
 * not teach or test (narrating past events at length, giving reasons and
 * opinions, handling unexpected turns in a conversation). When lessons for
 * that land, add A2 capabilities here and the ceiling lifts by itself.
 */
export const CEFR_CAPABILITIES: CanDoCapability[] = [
  {
    id: 'greet',
    label: 'przywitać się, podziękować i przeprosić',
    level: 'A1',
    lessons: ['bai-01'],
    grammar: ['g-bai-01-greetings'],
    scenarios: ['s-bai-01-greet-elder', 's-bai-01-greet-peer'],
  },
  {
    id: 'address-people',
    label: 'zwrócić się do rozmówcy właściwym zaimkiem',
    level: 'A1',
    lessons: ['bai-01'],
    grammar: ['g-bai-01-pronouns'],
    scenarios: ['s-bai-01-uncle-age'],
  },
  {
    id: 'introduce-self',
    label: 'przedstawić się i zapytać o imię',
    level: 'A1',
    lessons: ['bai-02'],
    grammar: ['g-bai-02-sentence', 'g-bai-02-la', 'g-bai-02-gi'],
    scenarios: ['s-bai-02-introduce', 's-bai-02-how-are-you'],
  },
  {
    id: 'yes-no',
    label: 'zadać pytanie rozstrzygające i odpowiedzieć na nie',
    level: 'A1',
    lessons: ['bai-02'],
    grammar: ['g-bai-02-khong-question'],
    scenarios: [],
  },
  {
    id: 'personal-info',
    label: 'podać narodowość, wiek i numer telefonu',
    level: 'A1',
    lessons: ['bai-03'],
    grammar: ['g-bai-03-nationality', 'g-bai-03-age', 'g-bai-03-phone', 'g-bai-03-con-co'],
    scenarios: ['s-bai-03-where-from', 's-bai-03-ask-age-phone'],
  },
  {
    id: 'numbers',
    label: 'liczyć i czytać liczby na głos',
    level: 'A1',
    lessons: ['bai-03'],
    grammar: ['g-bai-03-numbers'],
    scenarios: [],
  },
  {
    id: 'dates',
    label: 'podać datę, dzień tygodnia i swoje urodziny',
    level: 'A1',
    lessons: ['bai-04'],
    grammar: ['g-bai-04-weekdays-months', 'g-bai-04-date', 'g-bai-04-may-bao-nhieu'],
    scenarios: ['s-bai-04-birthday', 's-bai-04-what-day'],
  },
  {
    id: 'everyday-verbs',
    label: 'powiedzieć, co robię, co lubię, chcę i muszę robić',
    level: 'A1',
    lessons: ['bai-05'],
    grammar: ['g-bai-05-verb-question', 'g-bai-05-modal', 'g-bai-05-lam-gi'],
    scenarios: ['s-bai-05-order-want', 's-bai-05-hobby', 's-bai-05-must-go'],
  },
  {
    id: 'family',
    label: 'opowiedzieć o swojej rodzinie',
    level: 'A1',
    lessons: ['bai-06'],
    grammar: ['g-bai-06-family-talk'],
    scenarios: ['s-bai-06-family'],
  },
  {
    id: 'time-frames',
    label: 'umieścić czynność w czasie (đã / đang / sẽ, rồi / chưa)',
    level: 'A1',
    lessons: ['bai-06'],
    grammar: ['g-bai-06-tense', 'g-bai-06-roi-chua'],
    scenarios: ['s-bai-06-yesterday', 's-bai-06-eaten-yet'],
  },
  {
    id: 'places-plans',
    label: 'powiedzieć, gdzie ktoś jest, i zaproponować wspólne wyjście',
    level: 'A1',
    lessons: ['bai-07'],
    grammar: ['g-bai-07-place', 'g-bai-07-plans'],
    scenarios: ['s-bai-07-invite', 's-bai-07-where-hang-out'],
  },
  {
    id: 'order-food',
    label: 'zamówić jedzenie i napoje oraz poprosić o rachunek',
    level: 'A1',
    lessons: ['bai-08'],
    grammar: ['g-bai-08-classifiers', 'g-bai-08-ordering'],
    scenarios: ['s-bai-08-order-coffee', 's-bai-08-order-food-bill', 's-bai-08-ask-drinks'],
  },
  {
    id: 'time-routine',
    label: 'zapytać o godzinę i opisać swój dzień',
    level: 'A1',
    lessons: ['bai-09'],
    grammar: ['g-bai-09-time', 'g-bai-09-khi-nao', 'g-bai-09-routine'],
    scenarios: ['s-bai-09-what-time', 's-bai-09-my-morning', 's-bai-09-sunday-family'],
  },
  {
    id: 'describe',
    label: 'opisać osobę lub rzecz i porównać dwie rzeczy',
    level: 'A1',
    lessons: ['bai-10'],
    grammar: ['g-bai-10-the-nao', 'g-bai-10-adj-sentence', 'g-bai-10-rat-qua-lam', 'g-bai-10-comparison'],
    scenarios: ['s-bai-10-describe-person', 's-bai-10-compare'],
  },
  {
    id: 'locations',
    label: 'powiedzieć, gdzie coś się znajduje',
    level: 'A1',
    lessons: ['bai-11'],
    grammar: ['g-bai-11-position', 'g-bai-11-tren-duoi'],
    scenarios: ['s-bai-11-where-is', 's-bai-11-describe-room'],
  },
  {
    id: 'directions',
    label: 'zapytać o drogę i wskazać komuś drogę',
    level: 'A1',
    lessons: ['bai-12'],
    grammar: ['g-bai-12-directions', 'g-bai-12-nhu-the-nao', 'g-bai-12-co-the'],
    scenarios: ['s-bai-12-ask-way', 's-bai-12-give-directions', 's-bai-12-pay-card', 's-bai-12-city-day'],
  },
];

/* ------------------------------------------------------------------ */
/* Course index                                                         */
/* ------------------------------------------------------------------ */

/**
 * What the loaded course actually contains. Passed explicitly so the
 * estimator stays pure and testable against a hypothetical future course.
 */
export interface CourseIndex {
  lessonIds: Set<string>;
  grammarIds: Set<string>;
  scenarioIds: Set<string>;
  /** Vocabulary ids per lesson, restricted to items the scheduler tracks. */
  vocabByLesson: Map<string, string[]>;
  vocabPopulation: number;
  grammarPopulation: number;
  scenarioPopulation: number;
  dialogueLinePopulation: number;
  /** Real recordings exist, so listening scores mean something. */
  hasAudio: boolean;
}

let cached: CourseIndex | null = null;

/** The index for the content shipped with the app. */
export function courseIndex(): CourseIndex {
  if (cached) return cached;
  const vocabByLesson = new Map<string, string[]>();
  for (const v of allVocab) {
    if (!v.srs || v.status === 'flagged') continue;
    const list = vocabByLesson.get(v.lessonId) ?? [];
    list.push(v.id);
    vocabByLesson.set(v.lessonId, list);
  }
  cached = {
    lessonIds: new Set(lessons.map((l) => l.id)),
    grammarIds: new Set(allGrammar.map((g) => g.id)),
    scenarioIds: new Set(scenarios.map((s) => s.id)),
    vocabByLesson,
    vocabPopulation: allVocab.filter((v) => v.srs && v.status !== 'flagged').length,
    grammarPopulation: allGrammar.length,
    scenarioPopulation: scenarios.length,
    dialogueLinePopulation: allDialogues.reduce((a, d) => a + d.lines.length, 0),
    hasAudio: audioClips.length > 0,
  };
  return cached;
}

/* ------------------------------------------------------------------ */
/* Results                                                              */
/* ------------------------------------------------------------------ */

export interface CefrComponentScore {
  id: CefrComponentId;
  label: string;
  /** 0–100. */
  percent: number;
  weight: number;
}

export interface CanDoEvidence {
  id: string;
  label: string;
  level: CefrLevel;
  /** 0–100 mastery of the content that proves this ability. */
  percent: number;
  demonstrated: boolean;
}

export interface CefrEvidence {
  components: CefrComponentScore[];
  /** Production-only composite, 0–100. */
  production: number;
  canDo: CanDoEvidence[];
  canDoDemonstrated: number;
  /** Can-do abilities the course offers at the level being judged. */
  canDoAvailable: number;
  /** Not yet demonstrated, at the level being judged. */
  missingCanDo: CanDoEvidence[];
  /** Graded attempts on production abilities. */
  gradedProduction: number;
  /** Production abilities answered at least twice. */
  repeatedItems: number;
  /** Distinct production skill areas practised. */
  skillAreas: number;
  /** Unresolved mistakes that came back after a retry. */
  recurringMistakes: number;
  /** Checkpoint runs and exam attempts — cumulative, delayed evidence. */
  cumulativeChecks: number;
  /** Weakest weighted areas, phrased as what to work on. */
  gaps: string[];
  /** Listening is folded into comprehension only once real audio exists. */
  listeningCounted: boolean;
}

export interface CefrEstimate {
  level: CefrLevel;
  stage: CefrStage;
  confidence: CefrConfidence;
  /** Weighted composite, 0–100. Never shown as a decimal level. */
  score: number;
  /** False when there is too little data to say anything. */
  sufficientEvidence: boolean;
  /** Highest level the current course can provide evidence for. */
  ceiling: CefrLevel;
  /** The estimate is limited by the course, not by the learner. */
  atCourseCeiling: boolean;
  evidence: CefrEvidence;
}

export interface CefrOptions {
  /** Override the capability table (used to model a future, larger course). */
  capabilities?: CanDoCapability[];
  /** Override the course index (used to model a future, larger course). */
  course?: CourseIndex;
}

/* ------------------------------------------------------------------ */
/* Estimation                                                           */
/* ------------------------------------------------------------------ */

const PRODUCTION_KINDS: SrsKind[] = ['vocab-active', 'sentence', 'grammar', 'dialogue'];

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

function itemsOf(state: AppState, kind: SrsKind): SrsItem[] {
  return Object.values(state.srs).filter((i) => i.kind === kind);
}

/** Mastery of a named set of SRS items, unpractised ones counting as zero. */
function setScore(state: AppState, kind: SrsKind, refs: string[]): number {
  if (refs.length === 0) return 0;
  const sum = refs.reduce((a, ref) => {
    const item = state.srs[makeSrsId(kind, ref)];
    return a + (item ? mastery(item) : 0);
  }, 0);
  return sum / refs.length;
}

/** Only capabilities whose content is actually in the course can be judged. */
function availableCapabilities(capabilities: CanDoCapability[], course: CourseIndex): CanDoCapability[] {
  return capabilities
    .filter((c) => c.lessons.every((l) => course.lessonIds.has(l)) && c.grammar.every((g) => course.grammarIds.has(g)))
    .map((c) => ({ ...c, scenarios: c.scenarios.filter((s) => course.scenarioIds.has(s)) }));
}

/**
 * How well the learner has demonstrated one ability: the grammar behind it
 * used in live sentences, the scenarios that exercise it end to end, and the
 * active vocabulary it needs. Weighted towards the scenarios — doing the
 * whole thing is stronger evidence than any single piece.
 */
function canDoScore(state: AppState, cap: CanDoCapability, course: CourseIndex): number {
  const parts: { value: number; weight: number }[] = [];
  if (cap.grammar.length) parts.push({ value: setScore(state, 'grammar', cap.grammar), weight: 0.35 });
  if (cap.scenarios.length) parts.push({ value: setScore(state, 'sentence', cap.scenarios), weight: 0.4 });
  const vocab = cap.lessons.flatMap((l) => course.vocabByLesson.get(l) ?? []);
  if (vocab.length) parts.push({ value: setScore(state, 'vocab-active', vocab), weight: 0.25 });
  const totalWeight = parts.reduce((a, p) => a + p.weight, 0);
  if (totalWeight === 0) return 0;
  return clamp(parts.reduce((a, p) => a + p.value * p.weight, 0) / totalWeight);
}

/**
 * The highest level the course can evidence. A level counts as covered only
 * when the content offers at least `minCapabilities` of its can-do
 * abilities, and coverage is monotonic: no A2 ceiling without A1 coverage.
 */
export function courseCoverage(capabilities: CanDoCapability[], course: CourseIndex): CefrLevel {
  const available = availableCapabilities(capabilities, course);
  let ceiling: CefrLevel = 'pre-A1';
  for (const level of CEFR_LEVELS.slice(1) as Exclude<CefrLevel, 'pre-A1'>[]) {
    const count = available.filter((c) => c.level === level).length;
    if (count < CEFR_THRESHOLDS[level].minCapabilities) break;
    ceiling = level;
  }
  return ceiling;
}

function componentScores(state: AppState, course: CourseIndex): { components: CefrComponentScore[]; listeningCounted: boolean } {
  const activeVocab = itemsOf(state, 'vocab-active');
  const passiveVocab = itemsOf(state, 'vocab-passive');
  const grammarItems = itemsOf(state, 'grammar');
  const dialogueItems = itemsOf(state, 'dialogue');
  const sentenceItems = itemsOf(state, 'sentence');
  const listeningItems = itemsOf(state, 'listening');

  const produced = [...activeVocab, ...grammarItems, ...dialogueItems, ...sentenceItems];
  const automatic = produced.filter(isAutomatic).length;

  const passive = populationScore(passiveVocab, course.vocabPopulation);
  // Listening only joins comprehension once real recordings exist; until
  // then a "listening" score would be measuring nothing. When audio lands,
  // widen this blend (and, if wanted, the comprehension weight above).
  const listeningCounted = course.hasAudio && listeningItems.length > 0;
  const listening = populationScore(listeningItems, Math.max(listeningItems.length, 1));
  const comprehension = listeningCounted ? Math.round(0.5 * passive + 0.5 * listening) : passive;

  const components: CefrComponentScore[] = [
    { id: 'active-vocab', label: CEFR_COMPONENT_LABEL['active-vocab'], percent: populationScore(activeVocab, course.vocabPopulation), weight: CEFR_WEIGHTS['active-vocab'] },
    { id: 'sentences', label: CEFR_COMPONENT_LABEL.sentences, percent: populationScore(sentenceItems, Math.max(course.scenarioPopulation, sentenceItems.length)), weight: CEFR_WEIGHTS.sentences },
    { id: 'grammar', label: CEFR_COMPONENT_LABEL.grammar, percent: populationScore(grammarItems, course.grammarPopulation), weight: CEFR_WEIGHTS.grammar },
    { id: 'dialogue', label: CEFR_COMPONENT_LABEL.dialogue, percent: populationScore(dialogueItems, Math.max(course.dialogueLinePopulation, dialogueItems.length)), weight: CEFR_WEIGHTS.dialogue },
    { id: 'comprehension', label: CEFR_COMPONENT_LABEL.comprehension, percent: comprehension, weight: CEFR_WEIGHTS.comprehension },
    { id: 'automaticity', label: CEFR_COMPONENT_LABEL.automaticity, percent: produced.length ? Math.round((automatic / produced.length) * 100) : 0, weight: CEFR_WEIGHTS.automaticity },
  ];
  return { components, listeningCounted };
}

/**
 * How far through the current level the learner is. Normally measured
 * against the next level's threshold; at the course ceiling there is no next
 * level to travel towards, so "mocne" means near-complete mastery of
 * everything the course actually offers.
 */
function stageFor(level: CefrLevel, score: number, atCeiling: boolean): CefrStage {
  const lower = level === 'pre-A1' ? 0 : CEFR_THRESHOLDS[level as Exclude<CefrLevel, 'pre-A1'>].score;
  const next = CEFR_LEVELS[levelIndex(level) + 1] as Exclude<CefrLevel, 'pre-A1'> | undefined;
  const upper = atCeiling || !next ? 100 : CEFR_THRESHOLDS[next].score;
  const ratio = upper > lower ? (score - lower) / (upper - lower) : 1;
  if (ratio < 0.34) return 'early';
  if (ratio < 0.75) return 'developing';
  return 'strong';
}

/**
 * Estimate the CEFR level from demonstrated performance.
 *
 * Pure: it reads `state` and returns a new object, never mutating anything.
 */
export function estimateCefr(state: AppState, options: CefrOptions = {}): CefrEstimate {
  const course = options.course ?? courseIndex();
  const capabilities = availableCapabilities(options.capabilities ?? CEFR_CAPABILITIES, course);
  const ceiling = courseCoverage(options.capabilities ?? CEFR_CAPABILITIES, course);

  const { components, listeningCounted } = componentScores(state, course);
  const byId = new Map(components.map((c) => [c.id, c]));

  const weighted = components.reduce((a, c) => a + c.percent * c.weight, 0);
  const productionWeight = PRODUCTION_COMPONENTS.reduce((a, id) => a + CEFR_WEIGHTS[id], 0);
  const production = clamp(PRODUCTION_COMPONENTS.reduce((a, id) => a + (byId.get(id)?.percent ?? 0) * CEFR_WEIGHTS[id], 0) / productionWeight);

  const recurringMistakes = state.mistakes.filter((m) => !m.resolved && m.retries > 0).length;
  const penalty = Math.min(MISTAKE_PENALTY_MAX, recurringMistakes * MISTAKE_PENALTY_PER_ITEM);
  // Understanding without producing is a gap, not a level: the composite can
  // never run far ahead of what the learner can actually say.
  const score = clamp(Math.min(weighted, production + PASSIVE_HEADROOM) - penalty);

  const productionItems = Object.values(state.srs).filter((i) => PRODUCTION_KINDS.includes(i.kind));
  const gradedProduction = productionItems.reduce((a, i) => a + i.successes + i.failures, 0);
  const repeatedItems = productionItems.filter((i) => i.successes + i.failures >= 2).length;
  const skillAreas = new Set(productionItems.map((i) => i.kind)).size;
  const cumulativeChecks = state.exams.length + Object.values(state.lessons).reduce((a, l) => a + (l.checkpoints?.length ?? 0), 0);

  const sufficientEvidence =
    gradedProduction >= MIN_EVIDENCE.gradedProduction && skillAreas >= MIN_EVIDENCE.skillAreas && repeatedItems >= MIN_EVIDENCE.repeatedItems;

  const canDo: CanDoEvidence[] = capabilities.map((c) => {
    const percent = canDoScore(state, c, course);
    return { id: c.id, label: c.label, level: c.level, percent, demonstrated: percent >= CAN_DO_THRESHOLD };
  });

  // Walk up the levels, stopping at the first one the learner does not meet
  // or the course cannot evidence.
  let level: CefrLevel = 'pre-A1';
  if (sufficientEvidence) {
    for (const candidate of CEFR_LEVELS.slice(1) as Exclude<CefrLevel, 'pre-A1'>[]) {
      if (levelIndex(candidate) > levelIndex(ceiling)) break;
      const t = CEFR_THRESHOLDS[candidate];
      const atLevel = canDo.filter((c) => c.level === candidate);
      const share = atLevel.length ? atLevel.filter((c) => c.demonstrated).length / atLevel.length : 0;
      if (score < t.score || production < t.production || share < t.canDoShare) break;
      level = candidate;
    }
  }

  const judged = sufficientEvidence && level !== 'pre-A1' ? level : firstLevelAtOrBelow(ceiling);
  const atJudged = canDo.filter((c) => c.level === judged);

  const gaps = components
    .filter((c) => c.percent < 60)
    .sort((a, b) => b.weight * (100 - b.percent) - a.weight * (100 - a.percent))
    .slice(0, 3)
    .map((c) => COMPONENT_GAP_PHRASE[c.id]);

  let confidence: CefrConfidence = 'low';
  if (gradedProduction >= 120 && repeatedItems >= 40 && skillAreas >= 4 && cumulativeChecks >= 2) confidence = 'high';
  else if (gradedProduction >= 40 && repeatedItems >= 15 && skillAreas >= 3) confidence = 'medium';

  const atCourseCeiling = level !== 'pre-A1' && level === ceiling;

  return {
    level,
    stage: sufficientEvidence ? stageFor(level, score, atCourseCeiling) : 'early',
    confidence,
    score,
    sufficientEvidence,
    ceiling,
    atCourseCeiling,
    evidence: {
      components,
      production,
      canDo,
      canDoDemonstrated: atJudged.filter((c) => c.demonstrated).length,
      canDoAvailable: atJudged.length,
      missingCanDo: atJudged.filter((c) => !c.demonstrated).sort((a, b) => b.percent - a.percent),
      gradedProduction,
      repeatedItems,
      skillAreas,
      recurringMistakes,
      cumulativeChecks,
      gaps,
      listeningCounted,
    },
  };
}

/** The level whose can-do list to report against when none has been reached yet. */
function firstLevelAtOrBelow(ceiling: CefrLevel): CefrLevel {
  return ceiling === 'pre-A1' ? 'pre-A1' : (CEFR_LEVELS[1] as CefrLevel);
}
