/**
 * Content schema for the whole application.
 *
 * Every lesson, review and exam blueprint in `content/` must satisfy these
 * schemas. `scripts/validate-content.ts` enforces them, and the app relies on
 * the inferred TypeScript types. See CONTENT_SCHEMA.md for a human description.
 */
import { z } from 'zod';

/* ----------------------------------------------------------------------- */
/* Shared primitives                                                         */
/* ----------------------------------------------------------------------- */

/** Lesson ids look like `bai-01`, `bai-12`. */
export const LessonIdSchema = z.string().regex(/^bai-\d{2}$/, 'Lesson id must look like bai-01');

/**
 * Verification status of linguistic content.
 * - verified:  taken from the teacher material, no doubt raised in the audit
 * - unverified: generated for practice, built only from verified material
 * - flagged:   listed in CONTENT_REVIEW.md, must not be the sole accepted answer
 */
export const StatusSchema = z.enum(['verified', 'unverified', 'flagged']);
export type Status = z.infer<typeof StatusSchema>;

/** Where an exercise comes from. */
export const SourceSchema = z.enum(['teacher', 'generated']);
export type Source = z.infer<typeof SourceSchema>;

/** Skill categories used for mistakes, exam breakdowns and review filters. */
export const SkillSchema = z.enum([
  'vocabulary',
  'spelling',
  'tone',
  'grammar',
  'pronoun',
  'classifier',
  'word-order',
  'tense',
  'reading',
  'listening',
  'numbers',
  'dates',
  'time',
  'dialogue',
]);
export type Skill = z.infer<typeof SkillSchema>;

export const ExampleSchema = z.object({
  vi: z.string().min(1),
  pl: z.string().optional(),
  note: z.string().optional(),
  status: StatusSchema.default('verified'),
});
export type Example = z.infer<typeof ExampleSchema>;

export const ImageRefSchema = z.object({
  /** Path relative to the site root, e.g. `images/lessons/bai-11/cat-boxes.png`. */
  src: z.string().min(1),
  alt: z.string().min(1),
  caption: z.string().optional(),
  /** Origin of the picture (teacher DOCX, external site …). */
  source: z.string().optional(),
});
export type ImageRef = z.infer<typeof ImageRefSchema>;

/* ----------------------------------------------------------------------- */
/* Vocabulary                                                                */
/* ----------------------------------------------------------------------- */

export const VocabCategorySchema = z.enum([
  'noun',
  'verb',
  'adjective',
  'adverb',
  'pronoun',
  'number',
  'phrase',
  'question-word',
  'particle',
  'preposition',
  'classifier',
  'time',
  'proper-noun',
  'other',
]);
export type VocabCategory = z.infer<typeof VocabCategorySchema>;

export const VocabItemSchema = z.object({
  /** Globally unique, e.g. `v-bai-03-nguoi`. */
  id: z.string().regex(/^v-bai-\d{2}-[a-z0-9-]+$/, 'Vocabulary id must look like v-bai-03-word'),
  vi: z.string().min(1),
  pl: z.string().min(1),
  category: VocabCategorySchema.optional(),
  /** Classifier used with this noun, e.g. `con`, `cái`, `quyển`. */
  classifier: z.string().optional(),
  /** Regional note, e.g. "północ: bố / południe: ba". */
  dialect: z.string().optional(),
  examples: z.array(ExampleSchema).default([]),
  note: z.string().optional(),
  status: StatusSchema.default('verified'),
  /** Free tags, e.g. `family`, `food`. */
  tags: z.array(z.string()).default([]),
  /** Skip in spaced repetition (e.g. vulgar/joke items or pure grammar words). */
  srs: z.boolean().default(true),
});
export type VocabItem = z.infer<typeof VocabItemSchema>;

/* ----------------------------------------------------------------------- */
/* Grammar                                                                   */
/* ----------------------------------------------------------------------- */

export const GrammarPointSchema = z.object({
  /** Globally unique, e.g. `g-bai-02-la`. */
  id: z.string().regex(/^g-bai-\d{2}-[a-z0-9-]+$/, 'Grammar id must look like g-bai-02-topic'),
  title: z.string().min(1),
  /** Short pattern line, e.g. `Podmiot + là + rzeczownik`. */
  pattern: z.string().optional(),
  /** Polish explanation, may contain several paragraphs separated by \n\n. */
  explanation: z.string().min(1),
  examples: z.array(ExampleSchema).default([]),
  /** Keywords for the grammar index (e.g. `là`, `không`). */
  keywords: z.array(z.string()).default([]),
  status: StatusSchema.default('verified'),
  /** Ids of exercises that practise this point. */
  practice: z.array(z.string()).default([]),
});
export type GrammarPoint = z.infer<typeof GrammarPointSchema>;

/* ----------------------------------------------------------------------- */
/* Dialogues and readings                                                    */
/* ----------------------------------------------------------------------- */

export const DialogueLineSchema = z.object({
  speaker: z.string().min(1),
  vi: z.string().min(1),
  pl: z.string().optional(),
  /** Optional per-line note (e.g. flagged form). */
  note: z.string().optional(),
  status: StatusSchema.default('verified'),
});
export type DialogueLine = z.infer<typeof DialogueLineSchema>;

export const DialogueSchema = z.object({
  id: z.string().regex(/^d-bai-\d{2}-[a-z0-9-]+$/, 'Dialogue id must look like d-bai-02-name'),
  title: z.string().min(1),
  /** Short Polish description of the situation. */
  situation: z.string().optional(),
  lines: z.array(DialogueLineSchema).min(2),
  status: StatusSchema.default('verified'),
});
export type Dialogue = z.infer<typeof DialogueSchema>;

export const ReadingSchema = z.object({
  id: z.string().regex(/^r-bai-\d{2}-[a-z0-9-]+$/, 'Reading id must look like r-bai-06-name'),
  title: z.string().min(1),
  paragraphs: z.array(z.string().min(1)).min(1),
  /** Optional Polish translation, one entry per paragraph. */
  translation: z.array(z.string()).optional(),
  /** Vocabulary ids glossed for the reading. */
  glossary: z.array(z.string()).default([]),
  note: z.string().optional(),
  status: StatusSchema.default('verified'),
});
export type Reading = z.infer<typeof ReadingSchema>;

export const PronunciationNoteSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  body: z.string().min(1),
});
export type PronunciationNote = z.infer<typeof PronunciationNoteSchema>;

/* ----------------------------------------------------------------------- */
/* Exercises                                                                 */
/* ----------------------------------------------------------------------- */

const ExerciseBase = z.object({
  /** Globally unique, e.g. `e-bai-05-verbs-1`. */
  id: z.string().regex(/^e-(bai-\d{2}|rev-\d{2}-\d{2}|exam-\d{2})-[a-z0-9-]+$/, 'Exercise id must look like e-bai-05-name'),
  skill: SkillSchema,
  source: SourceSchema,
  status: StatusSchema.default('verified'),
  /** Polish instruction shown above the task. */
  instruction: z.string().optional(),
  /** Explanation shown after answering. */
  explanation: z.string().optional(),
  /** Grammar ids this exercise practises. */
  grammar: z.array(z.string()).default([]),
  /** Vocabulary ids this exercise practises. */
  vocab: z.array(z.string()).default([]),
  /** Optional image shown with the prompt. */
  image: ImageRefSchema.optional(),
  /** Difficulty 1 (recognition) .. 3 (free production). */
  level: z.number().int().min(1).max(3).default(1),
});

export const McqExerciseSchema = ExerciseBase.extend({
  type: z.literal('mcq'),
  prompt: z.string().min(1),
  options: z.array(z.string().min(1)).min(2),
  /** Index into `options`. */
  answer: z.number().int().min(0),
});

export const TypedExerciseSchema = ExerciseBase.extend({
  type: z.literal('typed'),
  prompt: z.string().min(1),
  /** Language of the expected answer. Vietnamese answers get tone-aware grading. */
  answerLang: z.enum(['vi', 'pl']),
  /** All accepted answers. First one is shown as the model answer. */
  answers: z.array(z.string().min(1)).min(1),
  hint: z.string().optional(),
});

export const FillBlankExerciseSchema = ExerciseBase.extend({
  type: z.literal('fill-blank'),
  /** Sentence with `___` where the blank is (exactly one blank). */
  sentence: z.string().regex(/___/, 'fill-blank sentence must contain ___'),
  answers: z.array(z.string().min(1)).min(1),
  /** Optional word bank; if present the learner can pick instead of typing. */
  bank: z.array(z.string().min(1)).optional(),
  translation: z.string().optional(),
});

export const MatchingExerciseSchema = ExerciseBase.extend({
  type: z.literal('matching'),
  prompt: z.string().min(1),
  pairs: z.array(z.object({ left: z.string().min(1), right: z.string().min(1) })).min(2),
});

export const OrderingExerciseSchema = ExerciseBase.extend({
  type: z.literal('ordering'),
  prompt: z.string().min(1),
  /** Tokens in the correct order. They are shuffled for the learner. */
  tokens: z.array(z.string().min(1)).min(2),
  translation: z.string().optional(),
});

export const ErrorCorrectionExerciseSchema = ExerciseBase.extend({
  type: z.literal('error-correction'),
  prompt: z.string().optional(),
  wrong: z.string().min(1),
  answers: z.array(z.string().min(1)).min(1),
});

export const DiacriticsExerciseSchema = ExerciseBase.extend({
  type: z.literal('diacritics'),
  /** Text without tones/diacritics. */
  stripped: z.string().min(1),
  answers: z.array(z.string().min(1)).min(1),
  translation: z.string().optional(),
});

/** A question about a reading; the reading is shown beside the question. */
export const ReadingQuestionExerciseSchema = ExerciseBase.extend({
  type: z.literal('reading-question'),
  readingId: z.string().min(1),
  prompt: z.string().min(1),
  options: z.array(z.string().min(1)).optional(),
  answer: z.number().int().min(0).optional(),
  answers: z.array(z.string().min(1)).optional(),
  answerLang: z.enum(['vi', 'pl']).optional(),
});

/** Fill a missing line of a dialogue (typed or chosen). */
export const DialogueCompletionExerciseSchema = ExerciseBase.extend({
  type: z.literal('dialogue-completion'),
  dialogueId: z.string().min(1),
  /** Index of the hidden line. */
  lineIndex: z.number().int().min(0),
  /** Distractors for choice mode; the correct line is added automatically. */
  distractors: z.array(z.string().min(1)).default([]),
});

/** Runtime generated exercise (numbers, dates, times, classifiers …). */
export const GeneratorKindSchema = z.enum([
  'number',
  'phone',
  'age',
  'year',
  'date',
  'weekday',
  'month',
  'time',
  'classifier',
  'pronoun',
  'tense',
  'comparison',
  'position',
  'tone-identify',
]);
export type GeneratorKind = z.infer<typeof GeneratorKindSchema>;

export const GeneratorExerciseSchema = ExerciseBase.extend({
  type: z.literal('generator'),
  generator: GeneratorKindSchema,
  /** Generator-specific options (e.g. `{ "max": 99 }`). */
  params: z.record(z.any()).default({}),
  /** How many instances to produce in a session. */
  count: z.number().int().min(1).max(20).default(5),
});

/** Free answer to a personal question; graded loosely against patterns. */
export const OpenAnswerExerciseSchema = ExerciseBase.extend({
  type: z.literal('open-answer'),
  prompt: z.string().min(1),
  /** Model answers / patterns. `{x}` means "any word(s) here". */
  patterns: z.array(z.string().min(1)).min(1),
  /** Example answer shown after the attempt. */
  sample: z.string().optional(),
});

/**
 * Say it aloud, optionally record yourself, compare with the model.
 * Deliberately NOT auto-scored: browser speech scoring is not reliable
 * enough to grade pronunciation, so the learner self-assesses after
 * hearing the comparison. This is the only task type where self-rating is
 * the primary control.
 */
export const SpeakingExerciseSchema = ExerciseBase.extend({
  type: z.literal('speaking'),
  prompt: z.string().min(1),
  /** The Vietnamese the learner should end up saying. */
  target: z.string().min(1),
  translation: z.string().optional(),
  /** False for de-scaffolded practice: produce it before seeing the model. */
  showTarget: z.boolean().default(true),
});

export const ExerciseSchema = z.discriminatedUnion('type', [
  McqExerciseSchema,
  TypedExerciseSchema,
  FillBlankExerciseSchema,
  MatchingExerciseSchema,
  OrderingExerciseSchema,
  ErrorCorrectionExerciseSchema,
  DiacriticsExerciseSchema,
  ReadingQuestionExerciseSchema,
  DialogueCompletionExerciseSchema,
  GeneratorExerciseSchema,
  OpenAnswerExerciseSchema,
  SpeakingExerciseSchema,
]);
export type Exercise = z.infer<typeof ExerciseSchema>;
export type ExerciseType = Exercise['type'];

/* ----------------------------------------------------------------------- */
/* Original teacher material (kept verbatim for reference)                  */
/* ----------------------------------------------------------------------- */

export const OriginalBlockSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('heading'), text: z.string().min(1) }),
  z.object({ kind: z.literal('paragraph'), text: z.string().min(1) }),
  z.object({ kind: z.literal('table'), rows: z.array(z.array(z.string())).min(1) }),
  z.object({ kind: z.literal('image'), image: ImageRefSchema }),
]);
export type OriginalBlock = z.infer<typeof OriginalBlockSchema>;

/* ----------------------------------------------------------------------- */
/* Lesson                                                                    */
/* ----------------------------------------------------------------------- */

export const LessonSchema = z.object({
  id: LessonIdSchema,
  number: z.number().int().min(1),
  /** Polish lesson title. */
  title: z.string().min(1),
  /** Optional Vietnamese title. */
  titleVi: z.string().optional(),
  /** Short Polish summary shown on lesson cards. */
  summary: z.string().min(1),
  /** Emoji used on cards. */
  icon: z.string().min(1),
  /** Name of the source DOCX (read-only material). */
  sourceFile: z.string().min(1),
  /** Draft lessons are visible but marked as not yet reviewed. */
  draft: z.boolean().default(false),
  objectives: z.array(z.string().min(1)).min(1),
  vocabulary: z.array(VocabItemSchema),
  grammar: z.array(GrammarPointSchema),
  dialogues: z.array(DialogueSchema).default([]),
  readings: z.array(ReadingSchema).default([]),
  pronunciation: z.array(PronunciationNoteSchema).default([]),
  images: z.array(ImageRefSchema).default([]),
  exercises: z.array(ExerciseSchema),
  /** Exercise ids forming the end-of-lesson checkpoint. */
  checkpoint: z.array(z.string().min(1)).min(1),
  /** Grammar ids from earlier lessons worth revisiting. */
  reviewLinks: z.array(z.string()).default([]),
  /** Verbatim teacher material. */
  original: z.array(OriginalBlockSchema).default([]),
});
export type Lesson = z.infer<typeof LessonSchema>;

/* ----------------------------------------------------------------------- */
/* Five-lesson reviews and exam blueprints                                  */
/* ----------------------------------------------------------------------- */

export const ReviewSchema = z.object({
  /** e.g. `rev-01-05`. */
  id: z.string().regex(/^rev-\d{2}-\d{2}$/, 'Review id must look like rev-01-05'),
  fromLesson: z.number().int().min(1),
  toLesson: z.number().int().min(1),
  title: z.string().min(1),
  sourceFile: z.string().optional(),
  intro: z.string().optional(),
  readings: z.array(ReadingSchema).default([]),
  vocabulary: z.array(VocabItemSchema).default([]),
  exercises: z.array(ExerciseSchema),
  original: z.array(OriginalBlockSchema).default([]),
});
export type Review = z.infer<typeof ReviewSchema>;

export const ExamBlueprintSchema = z.object({
  /** e.g. `exam-01`. */
  id: z.string().regex(/^exam-\d{2}$/, 'Exam id must look like exam-01'),
  block: z.number().int().min(1),
  title: z.string().min(1),
  /** Number of questions per attempt. */
  questionCount: z.number().int().min(5).max(60).default(25),
  /** Minimum share of production (non-MCQ) exercises, 0..1. */
  minProductionShare: z.number().min(0).max(1).default(0.5),
  /** Extra exam-only exercises. */
  exercises: z.array(ExerciseSchema).default([]),
});
export type ExamBlueprint = z.infer<typeof ExamBlueprintSchema>;

/* ----------------------------------------------------------------------- */
/* Communicative scenarios                                                   */
/* ----------------------------------------------------------------------- */

/**
 * A real-life situation the learner has to handle in Vietnamese. Scenarios
 * are the top of the automaticity ladder: no sentence is given, only the
 * situation and the communicative goal.
 */
export const ScenarioSchema = z.object({
  /** e.g. `s-bai-08-order-coffee`. */
  id: z.string().regex(/^s-bai-\d{2}-[a-z0-9-]+$/, 'Scenario id must look like s-bai-08-name'),
  /** Lesson from which the learner has everything needed to do this. */
  lesson: LessonIdSchema,
  /** Polish description of the situation ("Jesteś w kawiarni w Hà Nội…"). */
  situation: z.string().min(1),
  /** What the learner has to achieve, in Polish. */
  goal: z.string().min(1),
  /** Accepted answer shapes; `{x}` matches any words. */
  patterns: z.array(z.string().min(1)).min(1),
  /** A model answer built only from verified lesson material. */
  sample: z.string().min(1),
  /** Optional scaffold shown at low automaticity levels. */
  hint: z.string().optional(),
  /** How many Vietnamese sentences the answer should contain. */
  minSentences: z.number().int().min(1).max(6).default(1),
  vocab: z.array(z.string()).default([]),
  grammar: z.array(z.string()).default([]),
  /** Lessons this scenario deliberately combines (cumulative practice). */
  combines: z.array(z.number().int()).default([]),
  status: StatusSchema.default('unverified'),
});
export type Scenario = z.infer<typeof ScenarioSchema>;

export const ScenarioPackSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  scenarios: z.array(ScenarioSchema),
});
export type ScenarioPack = z.infer<typeof ScenarioPackSchema>;

/* ----------------------------------------------------------------------- */
/* Audio manifest                                                            */
/* ----------------------------------------------------------------------- */

export const AudioClipSchema = z.object({
  /** Vocabulary / dialogue line / sentence id the clip belongs to. */
  targetId: z.string().min(1),
  /** File path relative to `public/audio`, e.g. `bai-01/xin-chao.mp3`. */
  file: z.string().min(1),
  dialect: z.enum(['north', 'south', 'central', 'unknown']),
  speaker: z.string().min(1),
  /** e.g. "nagranie lektorki", "nagranie native speakera". */
  source: z.string().min(1),
  lesson: LessonIdSchema.optional(),
  /** Whether a teacher/native speaker confirmed the recording. */
  verified: z.boolean().default(false),
});
export type AudioClip = z.infer<typeof AudioClipSchema>;

export const AudioManifestSchema = z.object({
  clips: z.array(AudioClipSchema),
});
export type AudioManifest = z.infer<typeof AudioManifestSchema>;
