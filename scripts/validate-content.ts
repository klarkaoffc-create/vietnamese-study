/**
 * Validate every content file against the schema and cross-reference rules.
 *
 *   npm run validate-content
 *
 * Exit code 1 on any error. Warnings (e.g. flagged items) do not fail.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LessonSchema, ReviewSchema, ExamBlueprintSchema, AudioManifestSchema, ScenarioPackSchema, type Lesson, type Review, type ExamBlueprint, type Exercise, type Scenario } from '../src/data/schema';
import { findAnswerLeaks, revealsAnswer, type ContentLookup } from '../src/learning/answers';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');
const errors: string[] = [];
const warnings: string[] = [];

function readJson(file: string): unknown {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    errors.push(`${file}: niepoprawny JSON (${(e as Error).message})`);
    return null;
  }
}

function listJson(dir: string): string[] {
  const d = join(ROOT, dir);
  if (!existsSync(d)) return [];
  return readdirSync(d)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => join(d, f));
}

/* ------------------------------------------------------------------ */
/* Parse                                                                */
/* ------------------------------------------------------------------ */

const lessons: Lesson[] = [];
for (const file of listJson('content/lessons')) {
  const raw = readJson(file);
  if (!raw) continue;
  const r = LessonSchema.safeParse(raw);
  if (!r.success) {
    for (const issue of r.error.issues) errors.push(`${file}: ${issue.path.join('.')} – ${issue.message}`);
    continue;
  }
  const expectedName = `${r.data.id}.json`;
  if (!file.endsWith(expectedName)) errors.push(`${file}: nazwa pliku powinna być ${expectedName} (id lekcji)`);
  const numFromId = Number(r.data.id.slice(4));
  if (numFromId !== r.data.number) errors.push(`${file}: number=${r.data.number} nie zgadza się z id ${r.data.id}`);
  lessons.push(r.data);
}

const reviews: Review[] = [];
for (const file of listJson('content/reviews')) {
  const raw = readJson(file);
  if (!raw) continue;
  const r = ReviewSchema.safeParse(raw);
  if (!r.success) {
    for (const issue of r.error.issues) errors.push(`${file}: ${issue.path.join('.')} – ${issue.message}`);
    continue;
  }
  if (r.data.toLesson - r.data.fromLesson !== 4) errors.push(`${file}: powtórka powinna obejmować 5 lekcji (${r.data.fromLesson}–${r.data.toLesson})`);
  if (!file.endsWith(`${r.data.id}.json`)) errors.push(`${file}: nazwa pliku powinna być ${r.data.id}.json`);
  reviews.push(r.data);
}

const exams: ExamBlueprint[] = [];
for (const file of listJson('content/exams')) {
  const raw = readJson(file);
  if (!raw) continue;
  const r = ExamBlueprintSchema.safeParse(raw);
  if (!r.success) {
    for (const issue of r.error.issues) errors.push(`${file}: ${issue.path.join('.')} – ${issue.message}`);
    continue;
  }
  if (!file.endsWith(`${r.data.id}.json`)) errors.push(`${file}: nazwa pliku powinna być ${r.data.id}.json`);
  exams.push(r.data);
}

const scenarios: Scenario[] = [];
for (const file of listJson('content/scenarios')) {
  const raw = readJson(file);
  if (!raw) continue;
  const r = ScenarioPackSchema.safeParse(raw);
  if (!r.success) {
    for (const issue of r.error.issues) errors.push(`${file}: ${issue.path.join('.')} – ${issue.message}`);
    continue;
  }
  scenarios.push(...r.data.scenarios);
}

let audioClips: { targetId: string; file: string }[] = [];
const manifestFile = join(ROOT, 'content/audio/manifest.json');
if (existsSync(manifestFile)) {
  const raw = readJson(manifestFile);
  const r = AudioManifestSchema.safeParse(raw);
  if (!r.success) for (const issue of r.error.issues) errors.push(`${manifestFile}: ${issue.path.join('.')} – ${issue.message}`);
  else audioClips = r.data.clips;
}

/* ------------------------------------------------------------------ */
/* Cross checks                                                         */
/* ------------------------------------------------------------------ */

// Lesson numbering: unique, contiguous from 1
const numbers = lessons.map((l) => l.number).sort((a, b) => a - b);
for (let i = 0; i < numbers.length; i++) {
  if (numbers[i] !== i + 1) {
    errors.push(`Numeracja lekcji nie jest ciągła: oczekiwano ${i + 1}, jest ${numbers[i]}`);
    break;
  }
}

const ids = new Map<string, string>();
function registerId(id: string, where: string) {
  if (ids.has(id)) errors.push(`Zduplikowane id „${id}” (${ids.get(id)} i ${where})`);
  else ids.set(id, where);
}

const vocabIds = new Set<string>();
const grammarIds = new Set<string>();
const dialogues = new Map<string, number>();
const readingIds = new Set<string>();
const exerciseIds = new Set<string>();
const allExercises: { ex: Exercise; where: string }[] = [];

for (const l of lessons) {
  registerId(l.id, l.id);
  for (const v of l.vocabulary) {
    registerId(v.id, l.id);
    if (!v.id.startsWith(`v-${l.id}-`)) errors.push(`${l.id}: słówko ${v.id} powinno zaczynać się od v-${l.id}-`);
    vocabIds.add(v.id);
    if (v.status === 'flagged') warnings.push(`${l.id}: słówko „${v.vi}” oznaczone do weryfikacji`);
  }
  for (const g of l.grammar) {
    registerId(g.id, l.id);
    if (!g.id.startsWith(`g-${l.id}-`)) errors.push(`${l.id}: gramatyka ${g.id} powinna zaczynać się od g-${l.id}-`);
    grammarIds.add(g.id);
  }
  for (const d of l.dialogues) {
    registerId(d.id, l.id);
    dialogues.set(d.id, d.lines.length);
  }
  for (const r of l.readings) {
    registerId(r.id, l.id);
    readingIds.add(r.id);
    if (r.translation && r.translation.length !== r.paragraphs.length) errors.push(`${l.id}: czytanka ${r.id} ma ${r.paragraphs.length} akapitów i ${r.translation.length} tłumaczeń`);
  }
  for (const e of l.exercises) {
    registerId(e.id, l.id);
    if (!e.id.startsWith(`e-${l.id}-`)) errors.push(`${l.id}: ćwiczenie ${e.id} powinno zaczynać się od e-${l.id}-`);
    exerciseIds.add(e.id);
    allExercises.push({ ex: e, where: l.id });
  }
  for (const cid of l.checkpoint) if (!l.exercises.some((e) => e.id === cid)) errors.push(`${l.id}: checkpoint odwołuje się do nieistniejącego ćwiczenia ${cid}`);
  for (const im of l.images) if (!existsSync(join(ROOT, 'public', im.src))) errors.push(`${l.id}: brak pliku obrazka public/${im.src}`);
  for (const b of l.original) if (b.kind === 'image' && !existsSync(join(ROOT, 'public', b.image.src))) errors.push(`${l.id}: brak pliku obrazka public/${b.image.src}`);
}
for (const rv of reviews) {
  registerId(rv.id, rv.id);
  for (const r of rv.readings) {
    registerId(r.id, rv.id);
    readingIds.add(r.id);
  }
  for (const v of rv.vocabulary) {
    registerId(v.id, rv.id);
    vocabIds.add(v.id);
  }
  for (const e of rv.exercises) {
    registerId(e.id, rv.id);
    if (!e.id.startsWith(`e-${rv.id}-`)) errors.push(`${rv.id}: ćwiczenie ${e.id} powinno zaczynać się od e-${rv.id}-`);
    exerciseIds.add(e.id);
    allExercises.push({ ex: e, where: rv.id });
  }
  if (!lessons.some((l) => l.number === rv.toLesson)) warnings.push(`${rv.id}: lekcja ${rv.toLesson} jeszcze nie istnieje`);
}
for (const ex of exams) {
  registerId(ex.id, ex.id);
  for (const e of ex.exercises) {
    registerId(e.id, ex.id);
    if (!e.id.startsWith(`e-${ex.id}-`)) errors.push(`${ex.id}: ćwiczenie ${e.id} powinno zaczynać się od e-${ex.id}-`);
    exerciseIds.add(e.id);
    allExercises.push({ ex: e, where: ex.id });
  }
  const maxLesson = Math.max(0, ...lessons.map((l) => l.number));
  if (ex.block * 5 > maxLesson) warnings.push(`${ex.id}: blok ${ex.block} nie ma jeszcze wszystkich lekcji (max lekcja ${maxLesson})`);
}

// Second pass: references inside grammar / exercises
for (const l of lessons) {
  for (const g of l.grammar) for (const pid of g.practice) if (!exerciseIds.has(pid)) errors.push(`${l.id}: ${g.id}.practice odwołuje się do nieistniejącego ćwiczenia ${pid}`);
  for (const rl of l.reviewLinks) if (!grammarIds.has(rl)) errors.push(`${l.id}: reviewLinks odwołuje się do nieistniejącej gramatyki ${rl}`);
  for (const r of l.readings) for (const gid of r.glossary) if (!vocabIds.has(gid)) errors.push(`${l.id}: czytanka ${r.id} odwołuje się do nieistniejącego słówka ${gid}`);
}
for (const rv of reviews) for (const r of rv.readings) for (const gid of r.glossary) if (!vocabIds.has(gid)) errors.push(`${rv.id}: czytanka ${r.id} odwołuje się do nieistniejącego słówka ${gid}`);

// Answer leakage: nothing the learner reads before answering may contain the
// solution. Source DOCX lessons often ship the completed exercise, so this
// runs over every lesson, review and exam. See src/learning/answers.ts.
const dialoguesForAnswers = new Map<string, { lines: { vi: string; pl?: string }[] }>();
for (const l of lessons) for (const d of l.dialogues) dialoguesForAnswers.set(d.id, d);
const answerLookup: ContentLookup = { dialogue: (id) => dialoguesForAnswers.get(id) };
for (const { ex, where } of allExercises) {
  for (const leak of findAnswerLeaks(ex, answerLookup)) {
    errors.push(`${where}: ${ex.id} – odpowiedź „${leak.answer}” widoczna przed próbą w polu ${leak.field}: „${leak.text}”`);
  }
}
for (const sc of scenarios) {
  if (sc.hint && revealsAnswer(sc.hint, sc.sample)) {
    errors.push(`scenariusz ${sc.id} – podpowiedź zdradza całą odpowiedź „${sc.sample}”`);
  }
}

for (const { ex, where } of allExercises) {
  for (const gid of ex.grammar) if (!grammarIds.has(gid)) errors.push(`${where}: ${ex.id} odwołuje się do nieistniejącej gramatyki ${gid}`);
  for (const vid of ex.vocab) if (!vocabIds.has(vid)) errors.push(`${where}: ${ex.id} odwołuje się do nieistniejącego słówka ${vid}`);
  if (ex.image && !existsSync(join(ROOT, 'public', ex.image.src))) errors.push(`${where}: ${ex.id} – brak obrazka public/${ex.image.src}`);
  switch (ex.type) {
    case 'mcq':
      if (ex.answer >= ex.options.length) errors.push(`${where}: ${ex.id} – answer poza zakresem opcji`);
      if (new Set(ex.options).size !== ex.options.length) errors.push(`${where}: ${ex.id} – zduplikowane opcje`);
      break;
    case 'reading-question':
      if (!readingIds.has(ex.readingId)) errors.push(`${where}: ${ex.id} odwołuje się do nieistniejącej czytanki ${ex.readingId}`);
      if (ex.options) {
        if (typeof ex.answer !== 'number') errors.push(`${where}: ${ex.id} – pytanie z opcjami wymaga pola answer`);
        else if (ex.answer >= ex.options.length) errors.push(`${where}: ${ex.id} – answer poza zakresem opcji`);
      } else if (!ex.answers || ex.answers.length === 0) errors.push(`${where}: ${ex.id} – brak odpowiedzi (answers) do oceny`);
      break;
    case 'dialogue-completion': {
      const n = dialogues.get(ex.dialogueId);
      if (n === undefined) errors.push(`${where}: ${ex.id} odwołuje się do nieistniejącego dialogu ${ex.dialogueId}`);
      else if (ex.lineIndex >= n) errors.push(`${where}: ${ex.id} – lineIndex ${ex.lineIndex} poza dialogiem (${n} linii)`);
      break;
    }
    case 'fill-blank':
      if ((ex.sentence.match(/___/g) ?? []).length !== 1) errors.push(`${where}: ${ex.id} – zdanie musi mieć dokładnie jedną lukę ___`);
      if (ex.bank && !ex.bank.some((b) => ex.answers.some((a) => a.toLowerCase() === b.toLowerCase()))) errors.push(`${where}: ${ex.id} – bank nie zawiera poprawnej odpowiedzi`);
      break;
    case 'matching':
      if (new Set(ex.pairs.map((p) => p.left)).size !== ex.pairs.length) errors.push(`${where}: ${ex.id} – zduplikowane lewe strony par`);
      if (new Set(ex.pairs.map((p) => p.right)).size !== ex.pairs.length) errors.push(`${where}: ${ex.id} – zduplikowane prawe strony par`);
      break;
    case 'typed':
    case 'error-correction':
    case 'diacritics':
      if (ex.answers.length === 0) errors.push(`${where}: ${ex.id} – brak odpowiedzi`);
      break;
    case 'open-answer':
      if (!ex.patterns.some((p) => p.includes('{x}'))) warnings.push(`${where}: ${ex.id} – wzorce bez {x} będą wymagać dokładnego dopasowania`);
      break;
    default:
      break;
  }
  if (ex.status === 'flagged' && ex.source === 'teacher') warnings.push(`${where}: ${ex.id} (materiał z lekcji) oznaczone do weryfikacji`);
  if (ex.status === 'verified' && ex.source === 'generated') errors.push(`${where}: ${ex.id} – ćwiczenie wygenerowane nie może mieć statusu verified`);
}

for (const s of scenarios) {
  registerId(s.id, 'scenarios');
  if (!ids.has(s.lesson)) errors.push(`scenariusz ${s.id}: lekcja ${s.lesson} nie istnieje`);
  if (!s.id.startsWith(`s-${s.lesson}-`)) errors.push(`scenariusz ${s.id} powinien zaczynać się od s-${s.lesson}-`);
  for (const v of s.vocab) if (!vocabIds.has(v)) errors.push(`scenariusz ${s.id}: nieistniejące słówko ${v}`);
  for (const g of s.grammar) if (!grammarIds.has(g)) errors.push(`scenariusz ${s.id}: nieistniejąca gramatyka ${g}`);
  if (!s.patterns.some((p) => p.includes('{x}'))) warnings.push(`scenariusz ${s.id}: wzorce bez {x} wymagają dokładnego dopasowania`);
  const lessonNum = Number(s.lesson.slice(4));
  for (const c of s.combines) if (c >= lessonNum) errors.push(`scenariusz ${s.id}: combines odwołuje się do lekcji ${c}, która nie jest wcześniejsza niż ${lessonNum}`);
}

for (const clip of audioClips) {
  if (!ids.has(clip.targetId.split('#')[0])) errors.push(`audio: targetId ${clip.targetId} nie istnieje w treści`);
  if (!existsSync(join(ROOT, 'public/audio', clip.file))) errors.push(`audio: brak pliku public/audio/${clip.file}`);
}

/* ------------------------------------------------------------------ */
/* Report                                                               */
/* ------------------------------------------------------------------ */

const totalVocab = lessons.reduce((a, l) => a + l.vocabulary.length, 0);
const totalGrammar = lessons.reduce((a, l) => a + l.grammar.length, 0);
console.log(`Lekcje: ${lessons.length} · słówka: ${totalVocab} · gramatyka: ${totalGrammar} · ćwiczenia: ${allExercises.length} · scenariusze: ${scenarios.length} · powtórki: ${reviews.length} · egzaminy: ${exams.length} · nagrania: ${audioClips.length}`);
const flagged = allExercises.filter((e) => e.ex.status === 'flagged').length;
const unverified = allExercises.filter((e) => e.ex.status === 'unverified').length;
console.log(`Ćwiczenia: ${allExercises.length - flagged - unverified} zweryfikowane · ${unverified} niezweryfikowane (wygenerowane / klucz do nauki) · ${flagged} oznaczone do weryfikacji`);
if (process.argv.includes('--verbose')) for (const w of warnings) console.log(`  ⚠ ${w}`);
else if (warnings.length) console.log(`Ostrzeżenia: ${warnings.length} (użyj --verbose, aby wypisać)`);
if (errors.length) {
  console.error(`\n❌ ${errors.length} błędów:`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log('✅ Treść poprawna.');
