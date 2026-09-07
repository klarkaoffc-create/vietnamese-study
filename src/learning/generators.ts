/**
 * Runtime exercise generators. Each generator returns concrete "instances"
 * that the exercise runner renders either as a typed answer task or as a
 * multiple-choice task. Instances carry every accepted answer so grading is
 * deterministic and testable.
 */
import type { GeneratorKind, Skill } from '../data/schema';
import { allVocab } from '../data/content';
import { createRng, pick, randInt, sample, shuffle, type Rng } from '../utilities/random';
import { detectTone, syllables, TONES, type ToneName } from '../utilities/vietnamese';
import {
  DIGITS,
  MONTHS_PL,
  MONTHS_PL_GEN,
  WEEKDAYS_PL,
  WEEKDAYS_VI,
  dateToWords,
  digitsToWords,
  formatClock,
  monthToWords,
  numberToWords,
  timeToWords,
  yearToWords,
} from './numbers';

export interface GeneratedInstance {
  /** Stable id inside a session, e.g. `gen:number:37`. */
  id: string;
  generator: GeneratorKind;
  skill: Skill;
  prompt: string;
  /** For typed answers. */
  answers?: string[];
  answerLang?: 'vi' | 'pl';
  /** For choice answers. */
  options?: string[];
  answer?: number;
  hint?: string;
  explanation?: string;
  /** Optional visual: analog clock or cat/box position. */
  visual?: { kind: 'clock'; hour: number; minute: number } | { kind: 'position'; position: string };
  level: 1 | 2 | 3;
}

export interface GeneratorParams {
  max?: number;
  min?: number;
  [key: string]: unknown;
}

const SKILL_OF: Record<GeneratorKind, Skill> = {
  number: 'numbers',
  phone: 'numbers',
  age: 'numbers',
  year: 'numbers',
  date: 'dates',
  weekday: 'dates',
  month: 'dates',
  time: 'time',
  classifier: 'classifier',
  pronoun: 'pronoun',
  tense: 'tense',
  comparison: 'grammar',
  position: 'grammar',
  'tone-identify': 'tone',
};

/* ------------------------------------------------------------------ */

function genNumber(rng: Rng, params: GeneratorParams): GeneratedInstance {
  const max = typeof params.max === 'number' ? params.max : 99;
  const min = typeof params.min === 'number' ? params.min : 0;
  let n = randInt(min, max, rng);
  // Prefer numbers whose form was taught (avoid "linh" unless allowed)
  if (!params.allowLinh && n >= 100 && n % 100 > 0 && n % 100 < 10) n = n - (n % 100) + 10 + (n % 10);
  const w = numberToWords(n);
  return {
    id: `gen:number:${n}`,
    generator: 'number',
    skill: 'numbers',
    prompt: `Napisz słowami: ${n}`,
    answers: w.accepted,
    answerLang: 'vi',
    explanation: w.note,
    level: 2,
  };
}

function genPhone(rng: Rng): GeneratedInstance {
  const digits = Array.from({ length: 9 }, () => randInt(0, 9, rng)).join('');
  const formatted = `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
  return {
    id: `gen:phone:${digits}`,
    generator: 'phone',
    skill: 'numbers',
    prompt: `Przeczytaj numer cyfra po cyfrze: ${formatted}`,
    answers: [digitsToWords(digits)],
    answerLang: 'vi',
    hint: '0 = không',
    level: 2,
  };
}

const AGE_SUBJECTS: { pronoun: string; pl: string }[] = [
  { pronoun: 'Mình', pl: 'ja (mình)' },
  { pronoun: 'Anh ấy', pl: 'on (anh ấy)' },
  { pronoun: 'Chị ấy', pl: 'ona (chị ấy)' },
  { pronoun: 'Em', pl: 'ja – mówi osoba młodsza (em)' },
  { pronoun: 'Bố', pl: 'tata' },
  { pronoun: 'Mẹ', pl: 'mama' },
];

function genAge(rng: Rng): GeneratedInstance {
  const s = pick(AGE_SUBJECTS, rng);
  const age = randInt(5, 89, rng);
  const w = numberToWords(age);
  const answers = [...w.accepted.map((a) => `${s.pronoun} ${a} tuổi`), `${s.pronoun} ${age} tuổi`];
  return {
    id: `gen:age:${s.pronoun}:${age}`,
    generator: 'age',
    skill: 'numbers',
    prompt: `Powiedz, ile lat ma: ${s.pl} – ${age} lat (zaimek + liczba + tuổi)`,
    answers,
    answerLang: 'vi',
    explanation: w.note,
    level: 2,
  };
}

function genYear(rng: Rng): GeneratedInstance {
  const y = randInt(1950, 2030, rng);
  const w = yearToWords(y);
  return {
    id: `gen:year:${y}`,
    generator: 'year',
    skill: 'numbers',
    prompt: `Przeczytaj rok słowami: ${y}`,
    answers: w.accepted,
    answerLang: 'vi',
    hint: 'np. 2026 = hai nghìn không trăm hai mươi sáu (albo cyframi: hai không hai sáu)',
    explanation: w.note,
    level: 3,
  };
}

function genDate(rng: Rng): GeneratedInstance {
  const day = randInt(1, 28, rng);
  const month = randInt(1, 12, rng);
  const year = randInt(1990, 2030, rng);
  const w = dateToWords(day, month, year);
  return {
    id: `gen:date:${day}-${month}-${year}`,
    generator: 'date',
    skill: 'dates',
    prompt: `Zapisz datę po wietnamsku: ${day} ${MONTHS_PL_GEN[month - 1]} ${year}`,
    answers: w.accepted,
    answerLang: 'vi',
    hint: 'ngày … tháng … năm … (liczby możesz zapisać cyframi)',
    explanation: w.note,
    level: 3,
  };
}

function genWeekday(rng: Rng): GeneratedInstance {
  const i = randInt(0, 6, rng);
  return {
    id: `gen:weekday:${i}`,
    generator: 'weekday',
    skill: 'dates',
    prompt: `Napisz po wietnamsku: ${WEEKDAYS_PL[i]}`,
    answers: [WEEKDAYS_VI[i]],
    answerLang: 'vi',
    level: 2,
  };
}

function genMonth(rng: Rng): GeneratedInstance {
  const m = randInt(1, 12, rng);
  return {
    id: `gen:month:${m}`,
    generator: 'month',
    skill: 'dates',
    prompt: `Napisz po wietnamsku: ${MONTHS_PL[m - 1]}`,
    answers: monthToWords(m),
    answerLang: 'vi',
    level: 2,
  };
}

function genTime(rng: Rng): GeneratedInstance {
  const hour = randInt(0, 23, rng);
  const minute = pick([0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55], rng);
  const w = timeToWords(hour, minute);
  return {
    id: `gen:time:${hour}-${minute}`,
    generator: 'time',
    skill: 'time',
    prompt: `Która godzina? ${formatClock(hour, minute)} – odpowiedz: … giờ … phút + pora dnia`,
    answers: w.accepted,
    answerLang: 'vi',
    hint: 'sáng (rano) · trưa (południe) · chiều (po południu) · tối (wieczorem) · đêm (noc)',
    visual: { kind: 'clock', hour, minute },
    level: 2,
  };
}

const CLASSIFIER_NOUNS: { noun: string; pl: string; cl: string; alt?: string[] }[] = [
  { noun: 'nhà', pl: 'dom', cl: 'cái' },
  { noun: 'bàn', pl: 'stół', cl: 'cái' },
  { noun: 'ghế', pl: 'krzesło', cl: 'cái' },
  { noun: 'bút', pl: 'długopis', cl: 'cái' },
  { noun: 'nem rán', pl: 'sajgonka', cl: 'cái' },
  { noun: 'bánh xèo', pl: 'bánh xèo', cl: 'cái' },
  { noun: 'mèo', pl: 'kot', cl: 'con' },
  { noun: 'chó', pl: 'pies', cl: 'con' },
  { noun: 'bác sĩ', pl: 'lekarz', cl: 'người' },
  { noun: 'bạn', pl: 'przyjaciel', cl: 'người' },
  { noun: 'anh chị em', pl: 'rodzeństwo', cl: 'người' },
  { noun: 'cà phê', pl: 'kawa (w szklance)', cl: 'ly', alt: ['cốc'] },
  { noun: 'bia', pl: 'piwo (w szklance)', cl: 'ly', alt: ['cốc'] },
  { noun: 'nước', pl: 'woda (w kubku)', cl: 'cốc', alt: ['ly'] },
  { noun: 'cơm', pl: 'ryż (w miseczce)', cl: 'chén' },
  { noun: 'sách', pl: 'książka', cl: 'quyển' },
];

function genClassifier(rng: Rng): GeneratedInstance {
  const item = pick(CLASSIFIER_NOUNS, rng);
  const n = randInt(1, 9, rng);
  const nw = numberToWords(n);
  const cls = [item.cl, ...(item.alt ?? [])];
  if (rng() < 0.5) {
    const distractors = sample(['cái', 'con', 'người', 'ly', 'cốc', 'chén', 'quyển'].filter((c) => !cls.includes(c)), 3, rng);
    const options = shuffle([item.cl, ...distractors], rng);
    return {
      id: `gen:classifier:mcq:${item.noun}`,
      generator: 'classifier',
      skill: 'classifier',
      prompt: `Który klasyfikator pasuje do „${item.noun}” (${item.pl})?`,
      options,
      answer: options.indexOf(item.cl),
      explanation: `${nw.primary} ${item.cl} ${item.noun} – ${n} × ${item.pl}`,
      level: 1,
    };
  }
  const answers = cls.flatMap((c) => [...nw.accepted.map((w) => `${w} ${c} ${item.noun}`), `${n} ${c} ${item.noun}`]);
  return {
    id: `gen:classifier:typed:${item.noun}:${n}`,
    generator: 'classifier',
    skill: 'classifier',
    prompt: `Napisz: ${n} × ${item.pl} (liczebnik + klasyfikator + rzeczownik; rzeczownik: ${item.noun})`,
    answers,
    answerLang: 'vi',
    explanation: nw.note,
    level: 2,
  };
}

const PRONOUN_CASES: { desc: string; answer: string; alt?: string[] }[] = [
  { desc: 'mężczyzna w wieku 60+', answer: 'ông' },
  { desc: 'kobieta w wieku 60+', answer: 'bà' },
  { desc: 'mężczyzna lub kobieta w wieku 40–60', answer: 'bác' },
  { desc: 'mężczyzna w wieku 30–40 lat', answer: 'chú' },
  { desc: 'kobieta w wieku 30–40 lat', answer: 'cô' },
  { desc: 'mężczyzna trochę starszy od ciebie', answer: 'anh' },
  { desc: 'kobieta trochę starsza od ciebie', answer: 'chị' },
  { desc: 'osoba w twoim wieku', answer: 'bạn' },
  { desc: 'osoba młodsza od ciebie', answer: 'em' },
];
const PRONOUNS = ['ông', 'bà', 'bác', 'chú', 'cô', 'anh', 'chị', 'bạn', 'em'];

function genPronoun(rng: Rng): GeneratedInstance {
  const c = pick(PRONOUN_CASES, rng);
  const options = shuffle([c.answer, ...sample(PRONOUNS.filter((p) => p !== c.answer), 3, rng)], rng);
  return {
    id: `gen:pronoun:${c.answer}`,
    generator: 'pronoun',
    skill: 'pronoun',
    prompt: `Rozmawiasz z osobą: ${c.desc}. Jakiego zaimka użyjesz?`,
    options,
    answer: options.indexOf(c.answer),
    explanation: `${c.answer} – ${c.desc}`,
    level: 1,
  };
}

const TENSE_CASES: { sentence: string; pl: string; answer: string; options: string[] }[] = [
  { sentence: 'Hôm qua tôi ___ ăn phở.', pl: 'Wczoraj zjadłam phở.', answer: 'đã', options: ['đã', 'đang', 'sẽ'] },
  { sentence: 'Ngày mai mẹ ___ làm việc.', pl: 'Jutro mama będzie pracować.', answer: 'sẽ', options: ['đã', 'đang', 'sẽ'] },
  { sentence: 'Bây giờ em ___ học tiếng Việt.', pl: 'Teraz uczę się wietnamskiego.', answer: 'đang', options: ['đã', 'đang', 'sẽ'] },
  { sentence: 'Năm trước chị ấy ___ đi Nhật Bản.', pl: 'W zeszłym roku pojechała do Japonii.', answer: 'đã', options: ['đã', 'đang', 'sẽ'] },
  { sentence: 'Tuần sau chúng tôi ___ đi du lịch.', pl: 'W przyszłym tygodniu pojedziemy na wycieczkę.', answer: 'sẽ', options: ['đã', 'đang', 'sẽ'] },
  { sentence: 'Tôi ăn ___. (już jadłam)', pl: 'Już jadłam.', answer: 'rồi', options: ['rồi', 'chưa', 'đã'] },
  { sentence: 'Tôi ___ ăn. (jeszcze nie jadłam)', pl: 'Jeszcze nie jadłam.', answer: 'chưa', options: ['chưa', 'rồi', 'không phải'] },
  { sentence: 'Bạn ăn cơm ___? (czy już jadłaś?)', pl: 'Jadłaś już?', answer: 'chưa', options: ['chưa', 'rồi', 'không'] },
  { sentence: 'Hôm kia anh ấy ___ xem phim Mỹ.', pl: 'Przedwczoraj oglądał amerykański film.', answer: 'đã', options: ['đã', 'đang', 'sẽ'] },
  { sentence: 'Tháng sau em ___ đi Mỹ.', pl: 'W przyszłym miesiącu jadę do Ameryki.', answer: 'sẽ', options: ['đã', 'đang', 'sẽ'] },
];

function genTense(rng: Rng): GeneratedInstance {
  const c = pick(TENSE_CASES, rng);
  const options = shuffle(c.options, rng);
  return {
    id: `gen:tense:${c.sentence}`,
    generator: 'tense',
    skill: 'tense',
    prompt: `${c.sentence} — ${c.pl}`,
    options,
    answer: options.indexOf(c.answer),
    explanation: c.sentence.replace('___', c.answer),
    level: 2,
  };
}

const COMPARE_ADJ = [
  { vi: 'cao', pl: 'wysoki' },
  { vi: 'to', pl: 'duży' },
  { vi: 'đẹp', pl: 'ładny' },
  { vi: 'khó', pl: 'trudny' },
  { vi: 'nhanh', pl: 'szybki' },
  { vi: 'mới', pl: 'nowy' },
];
const COMPARE_SUBJECTS = [
  { vi: 'Anh ấy', pl: 'on' },
  { vi: 'Chị ấy', pl: 'ona' },
  { vi: 'Cái nhà này', pl: 'ten dom' },
  { vi: 'Con chó này', pl: 'ten pies' },
  { vi: 'Tiếng Việt', pl: 'wietnamski' },
];
const COMPARE_OBJECTS = [
  { vi: 'anh', pl: 'ty' },
  { vi: 'tôi', pl: 'ja' },
  { vi: 'cái nhà kia', pl: 'tamten dom' },
  { vi: 'con mèo', pl: 'kot' },
  { vi: 'tiếng Ba Lan', pl: 'polski' },
];

function genComparison(rng: Rng): GeneratedInstance {
  const adj = pick(COMPARE_ADJ, rng);
  const s = pick(COMPARE_SUBJECTS, rng);
  const o = pick(COMPARE_OBJECTS, rng);
  const kind = pick(['bằng', 'hơn', 'nhất'] as const, rng);
  if (kind === 'nhất') {
    return {
      id: `gen:comparison:nhat:${s.vi}:${adj.vi}`,
      generator: 'comparison',
      skill: 'grammar',
      prompt: `Napisz: „${s.pl} jest naj- ${adj.pl}” (użyj nhất). Podmiot: ${s.vi}, przymiotnik: ${adj.vi}`,
      answers: [`${s.vi} ${adj.vi} nhất`],
      answerLang: 'vi',
      explanation: `rzeczownik + przymiotnik + nhất`,
      level: 2,
    };
  }
  const word = kind === 'bằng' ? 'tak samo' : 'bardziej';
  const answers = kind === 'bằng' ? [`${s.vi} ${adj.vi} bằng ${o.vi}`, `${s.vi} ${adj.vi} như ${o.vi}`] : [`${s.vi} ${adj.vi} hơn ${o.vi}`];
  return {
    id: `gen:comparison:${kind}:${s.vi}:${adj.vi}:${o.vi}`,
    generator: 'comparison',
    skill: 'grammar',
    prompt: `Napisz: „${s.pl} jest ${word} ${adj.pl} ${kind === 'bằng' ? 'jak' : 'niż'} ${o.pl}”. Słowa: ${s.vi} · ${adj.vi} · ${o.vi}`,
    answers,
    answerLang: 'vi',
    explanation: kind === 'bằng' ? 'A + przymiotnik + bằng + B (tak samo jak)' : 'A + przymiotnik + hơn + B (bardziej niż)',
    level: 2,
  };
}

/**
 * Bài 11 teaches the pattern "rzecz 1 + ở + rzecz 2 + bên/phía + kierunek"
 * ("Quyển sách ở cái bàn bên cạnh"), with trên/dưới additionally allowing the
 * shortened Polish-like order ("quyển sách trên cái bàn"). `course` holds the
 * direction words used in the taught pattern; `alsoAccept` holds equally
 * reasonable alternatives (standard "ở bên cạnh cái bàn" order, and the
 * shortened form where the lesson permits it) so the learner is never marked
 * wrong for producing standard Vietnamese.
 */
const POSITIONS: { key: string; pl: string; course: string[]; shortened?: boolean }[] = [
  { key: 'trong', pl: 'W pudełku', course: ['bên trong', 'trong'] },
  { key: 'ngoài', pl: 'NA ZEWNĄTRZ pudełka', course: ['bên ngoài', 'ngoài'] },
  { key: 'trên', pl: 'NA pudełku', course: ['bên trên', 'phía trên', 'trên'], shortened: true },
  { key: 'dưới', pl: 'POD pudełkiem', course: ['bên dưới', 'phía dưới', 'dưới'], shortened: true },
  { key: 'cạnh', pl: 'OBOK pudełka', course: ['bên cạnh', 'cạnh'] },
  { key: 'trước', pl: 'PRZED pudełkiem', course: ['phía trước', 'bên trước', 'trước'] },
  { key: 'sau', pl: 'ZA pudełkiem', course: ['phía sau', 'bên sau', 'sau'] },
];

function genPosition(rng: Rng): GeneratedInstance {
  const p = pick(POSITIONS, rng);
  const nouns = ['cái hộp', 'hộp'];
  const answers: string[] = [];
  for (const noun of nouns) {
    // Pattern taught in Bài 11: subject + ở + reference noun + bên/phía + direction
    for (const dir of p.course) answers.push(`Con mèo ở ${noun} ${dir}`);
    // Standard Vietnamese order, also accepted
    for (const dir of p.course) answers.push(`Con mèo ở ${dir} ${noun}`);
    // trên / dưới may drop "ở" entirely (explicit exception in the lesson)
    if (p.shortened) answers.push(`Con mèo ${p.key} ${noun}`);
  }
  return {
    id: `gen:position:${p.key}`,
    generator: 'position',
    skill: 'grammar',
    prompt: `Kot jest ${p.pl}. Opisz to schematem z lekcji: Con mèo ở … (pudełko = cái hộp)`,
    answers,
    answerLang: 'vi',
    visual: { kind: 'position', position: p.key },
    hint: 'rzecz 1 + ở + rzecz 2 + bên/phía + kierunek',
    explanation: `Schemat z lekcji: Con mèo ở cái hộp ${p.course[0]}.${p.shortened ? ` Z „${p.key}” można też skrócić: Con mèo ${p.key} cái hộp.` : ''}`,
    level: 2,
  };
}

const TONE_POOL: string[] = (() => {
  const set = new Set<string>();
  for (const v of allVocab) {
    if (v.status === 'flagged') continue;
    for (const s of syllables(v.vi)) {
      if (/^[a-zà-ỹđ]+$/i.test(s) && s.length <= 6) set.add(s);
    }
  }
  return Array.from(set);
})();

function genToneIdentify(rng: Rng): GeneratedInstance {
  const syl = pick(TONE_POOL.length ? TONE_POOL : ['ma', 'mà', 'má', 'mả', 'mã', 'mạ'], rng);
  const tone: ToneName = detectTone(syl);
  const options = TONES.map((t) => t.label);
  const answer = TONES.findIndex((t) => t.name === tone);
  return {
    id: `gen:tone:${syl}`,
    generator: 'tone-identify',
    skill: 'tone',
    prompt: `Jaki ton ma sylaba „${syl}”?`,
    options,
    answer,
    explanation: `${syl} → ${TONES[answer].label}: ${TONES[answer].description}`,
    level: 1,
  };
}

/* ------------------------------------------------------------------ */

export function generate(kind: GeneratorKind, params: GeneratorParams = {}, count = 5, seed?: number): GeneratedInstance[] {
  const rng = createRng(seed ?? Math.floor(Math.random() * 2 ** 31));
  const out: GeneratedInstance[] = [];
  const seen = new Set<string>();
  let guard = 0;
  while (out.length < count && guard++ < count * 20) {
    const inst = generateOne(kind, rng, params);
    if (seen.has(inst.id)) continue;
    seen.add(inst.id);
    out.push({ ...inst, skill: SKILL_OF[kind] });
  }
  return out;
}

export function generateOne(kind: GeneratorKind, rng: Rng, params: GeneratorParams = {}): GeneratedInstance {
  switch (kind) {
    case 'number':
      return genNumber(rng, params);
    case 'phone':
      return genPhone(rng);
    case 'age':
      return genAge(rng);
    case 'year':
      return genYear(rng);
    case 'date':
      return genDate(rng);
    case 'weekday':
      return genWeekday(rng);
    case 'month':
      return genMonth(rng);
    case 'time':
      return genTime(rng);
    case 'classifier':
      return genClassifier(rng);
    case 'pronoun':
      return genPronoun(rng);
    case 'tense':
      return genTense(rng);
    case 'comparison':
      return genComparison(rng);
    case 'position':
      return genPosition(rng);
    case 'tone-identify':
      return genToneIdentify(rng);
  }
}

export { DIGITS };
