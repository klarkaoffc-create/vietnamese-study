/**
 * Vietnamese text utilities: normalisation, tone handling and tolerant
 * comparison. Tones are never discarded when deciding whether an answer is
 * fully correct – they are only stripped to detect the "almost" case.
 */

/**
 * Typography that never decides whether a Vietnamese answer is right.
 *
 * Sentence-final marks are the important part of this list — `.` `!` `?` `…`
 * and any run or mixture of them (`!!`, `?!`, `...`) — because a learner
 * writing "Bạn khỏe không" must score exactly the same as one writing
 * "Bạn khỏe không?". Commas and the remaining marks are folded too: they
 * separate, they do not carry meaning in the sentences this course teaches.
 *
 * Each run is replaced by a SPACE rather than deleted, so "đi thẳng,sau đó"
 * still tokenises into words; the following whitespace collapse then makes
 * comma-ful and comma-less versions identical.
 *
 * The rule is: IGNORE TYPOGRAPHY, PRESERVE LANGUAGE. Nothing here touches a
 * tone mark, a vowel diacritic (ă â ê ô ơ ư) or đ/d — those are letters, and
 * `stripDiacritics` is the only function that removes them, used solely to
 * detect the "almost right" case.
 */
const PUNCTUATION = /[.,!?;:"'„”“‘’…()\[\]{}«»\-–—/\\]+/g;

/** Unicode NFC, trim, collapse whitespace. Keeps tones and case. */
export function normalizeVietnamese(input: string): string {
  return input.normalize('NFC').replace(/\s+/g, ' ').trim();
}

/**
 * The form every answer comparison runs on: NFC, lower-case, punctuation
 * folded to spaces, whitespace collapsed, trimmed. Tones and vowel
 * diacritics are deliberately preserved.
 */
export function comparisonForm(input: string): string {
  return input
    .normalize('NFC')
    .toLowerCase()
    .replace(PUNCTUATION, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Remove all tone marks and vowel diacritics; đ becomes d. Used only for the
 * "almost" check. Also folds Polish "ł/Ł" (which has no NFD decomposition,
 * unlike ą/ć/ę/ń/ó/ś/ź/ż) so Polish answers typed "bez ogonków" compare
 * correctly against the Polish-tolerant grading path.
 */
export function stripDiacritics(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/ł/g, 'l')
    .replace(/Ł/g, 'L')
    .normalize('NFC');
}

export type ToneName = 'ngang' | 'huyền' | 'sắc' | 'hỏi' | 'ngã' | 'nặng';

export const TONES: { name: ToneName; label: string; combining: string; example: string; description: string }[] = [
  { name: 'ngang', label: 'ngang (równy)', combining: '', example: 'ma', description: 'bez znaku – ton równy, średni' },
  { name: 'huyền', label: 'huyền (opadający)', combining: '̀', example: 'mà', description: 'znak ` – ton nisko opadający' },
  { name: 'sắc', label: 'sắc (wznoszący)', combining: '́', example: 'má', description: 'znak ´ – ton wznoszący' },
  { name: 'hỏi', label: 'hỏi (pytający)', combining: '̉', example: 'mả', description: 'znak ̉ – ton opadająco-wznoszący' },
  { name: 'ngã', label: 'ngã (łamany)', combining: '̃', example: 'mã', description: 'znak ~ – ton łamany, ze zwarciem krtani' },
  { name: 'nặng', label: 'nặng (ciężki)', combining: '̣', example: 'mạ', description: 'znak . – ton niski, krótki, ciężki' },
];

const TONE_BY_COMBINING: Record<string, ToneName> = {
  '̀': 'huyền',
  '́': 'sắc',
  '̉': 'hỏi',
  '̃': 'ngã',
  '̣': 'nặng',
};

/** Detect the tone of a single syllable (word without spaces). */
export function detectTone(syllable: string): ToneName {
  const decomposed = syllable.normalize('NFD');
  for (const ch of decomposed) {
    const tone = TONE_BY_COMBINING[ch];
    if (tone) return tone;
  }
  return 'ngang';
}

/** Split into syllables (whitespace separated tokens without punctuation). */
export function syllables(text: string): string[] {
  return comparisonForm(text).split(' ').filter(Boolean);
}

export type MatchResult =
  | { kind: 'correct' }
  | { kind: 'tone'; words: string[] }
  | { kind: 'wrong' };

/**
 * Compare a learner answer with one accepted answer.
 * - correct: identical after normalisation (tones intact)
 * - tone: identical only when diacritics are stripped; `words` lists the
 *   expected words whose diacritics differ from what the learner typed
 * - wrong: anything else
 */
export function matchVietnamese(given: string, expected: string): MatchResult {
  const g = comparisonForm(given);
  const e = comparisonForm(expected);
  if (g === e) return { kind: 'correct' };
  if (stripDiacritics(g) === stripDiacritics(e)) {
    const gw = g.split(' ');
    const ew = e.split(' ');
    const words = ew.filter((w, i) => gw[i] !== w);
    return { kind: 'tone', words };
  }
  return { kind: 'wrong' };
}

/**
 * True when two answers say the same Vietnamese and differ only in
 * typography — spacing, capitalisation or punctuation. Used by the grading
 * tests to prove that such a difference can never cost the learner credit,
 * produce a mistake record or lower an SRS grade.
 */
export function differsOnlyInTypography(a: string, b: string): boolean {
  return a !== b && comparisonForm(a) === comparisonForm(b);
}

/** Best result across several accepted answers (correct > tone > wrong). */
export function matchAny(given: string, expected: string[]): MatchResult & { expected: string } {
  let best: (MatchResult & { expected: string }) | null = null;
  for (const exp of expected) {
    const r = matchVietnamese(given, exp);
    if (r.kind === 'correct') return { ...r, expected: exp };
    if (r.kind === 'tone' && (!best || best.kind === 'wrong')) best = { ...r, expected: exp };
    if (!best) best = { ...r, expected: exp };
  }
  return best ?? { kind: 'wrong', expected: expected[0] ?? '' };
}

/**
 * Restricted edit distance (Damerau–Levenshtein / "optimal string alignment")
 * on comparison forms: insertion, deletion, substitution, or transposition of
 * two adjacent characters each cost 1. Transposition is included because it
 * is the single most common typing slip in the source material (e.g. "nghe"
 * typed as "nhge") and plain Levenshtein would otherwise count it as two
 * edits, hiding it from the near-miss ("spelling") classification.
 */
export function editDistance(a: string, b: string): number {
  const s = comparisonForm(a);
  const t = comparisonForm(b);
  const m = s.length;
  const n = t.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const d: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) d[i][0] = i;
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      let val = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && s[i - 1] === t[j - 2] && s[i - 2] === t[j - 1]) {
        val = Math.min(val, d[i - 2][j - 2] + 1);
      }
      d[i][j] = val;
    }
  }
  return d[m][n];
}

/**
 * Polish feedback string for a match result.
 */
export function feedbackFor(result: MatchResult, expected: string): string {
  switch (result.kind) {
    case 'correct':
      return 'Dobrze!';
    case 'tone': {
      const words = result.words.map((w) => `„${w}”`).join(', ');
      return `Prawie dobrze — sprawdź znak/ton w słowie ${words || `„${expected}”`}.`;
    }
    default:
      return `Niepoprawnie. Poprawna odpowiedź: ${expected}`;
  }
}

/**
 * Split a `{x}` pattern into its literal segments, each run through
 * `comparisonForm` (and optionally `stripDiacritics`) independently. This
 * must happen BEFORE the segments are rejoined, because `comparisonForm`
 * treats `{` and `}` as punctuation and would otherwise erase the
 * placeholder itself before it can be turned into a capture group.
 */
function patternSegments(pattern: string, strip = false): string[] {
  return pattern.split('{x}').map((s) => (strip ? stripDiacritics(comparisonForm(s)) : comparisonForm(s)));
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Build a pattern regexp from `{x}` placeholders (open-answer exercises). */
export function patternToRegExp(pattern: string, strip = false): RegExp {
  const body = patternSegments(pattern, strip).map(escapeRegExp).join('(.+?)');
  return new RegExp(`^${body}$`, 'u');
}

/**
 * The concrete Vietnamese forms a dictionary headword can take in a sentence.
 *
 * Most entries are plain lemmas, but the course also stores alternatives and
 * one scaffolding formula, and a pattern built naively from the raw string can
 * then never match a real sentence:
 *
 *   "có thể, được"                 → ["có thể", "được"]
 *   "bố / ba"                      → ["bố", "ba"]
 *   "(tuần / tháng / năm) này"     → ["tuần này", "tháng này", "năm này"]
 *   "mỗi (ngày / tuần / tháng)"    → ["mỗi ngày", "mỗi tuần", "mỗi tháng"]
 *   "zaimek + ơi!"                 → ["ơi!"]
 *
 * The `+` case is a formula whose left side is a Polish part-of-speech label,
 * so pure-ASCII fragments are dropped — safe here because `+` appears in
 * exactly one headword and Vietnamese text in this course always carries
 * diacritics somewhere in the phrase.
 */
export function headwordForms(vi: string): string[] {
  const base = vi.includes('+')
    ? vi
        .split('+')
        .map((part) => part.trim())
        .filter((part) => part && /[^\u0000-\u007F]/.test(part))
        .join(' ')
    : vi;
  const bracket = base.match(/^(.*)\(([^)]*\/[^)]*)\)(.*)$/);
  const seeds = bracket ? bracket[2].split('/').map((alt) => `${bracket[1]}${alt.trim()}${bracket[3]}`) : [base];
  const out = new Set<string>();
  for (const seed of seeds) {
    for (const part of seed.split(/[/,]/)) {
      const t = part.replace(/\s+/g, ' ').trim();
      if (t) out.add(t);
    }
  }
  return out.size ? [...out] : [vi];
}

/**
 * Scenario patterns say "your answer should contain these fragments, in this
 * order". `{x}` matches one-or-more characters, which would wrongly reject an
 * answer that simply *starts* or *ends* on one of those fragments ("Cho chị
 * một ly cà phê trứng" against `{x}cho{x}ly{x}`). Rather than loosening `{x}`
 * globally — that would also weaken the authored lesson exercises — the edge
 * placeholders are expanded into optional variants here.
 */
export function withOptionalEdges(patterns: string[]): string[] {
  const out = new Set<string>();
  for (const p of patterns) {
    const variants = [p];
    if (p.startsWith('{x}')) variants.push(p.slice(3));
    for (const v of [...variants]) if (v.endsWith('{x}')) variants.push(v.slice(0, -3));
    for (const v of variants) if (v.trim()) out.add(v);
  }
  return [...out];
}

/** Match a free answer against `{x}` patterns. */
export function matchPatterns(given: string, patterns: string[]): MatchResult {
  const g = comparisonForm(given);
  for (const p of patterns) {
    if (patternToRegExp(p).test(g)) return { kind: 'correct' };
  }
  const gs = stripDiacritics(g);
  for (const p of patterns) {
    if (patternToRegExp(p, true).test(gs)) {
      // Find the fixed (non-{x}) words of the pattern that lost their tones.
      const fixed = patternSegments(p).join(' ').split(' ').filter(Boolean);
      const words = fixed.filter((w) => !g.includes(w));
      return { kind: 'tone', words };
    }
  }
  return { kind: 'wrong' };
}
