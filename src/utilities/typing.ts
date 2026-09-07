/** Helpers for the on-screen Vietnamese character toolbar. */

const VOWELS = 'aăâeêioôơuưyAĂÂEÊIOÔƠUƯY';
const TONE_MARKS = ['̀', '́', '̉', '̃', '̣'];

/** Insert a character at the caret position. */
export function insertAt(text: string, pos: number, ch: string): { text: string; pos: number } {
  return { text: text.slice(0, pos) + ch + text.slice(pos), pos: pos + ch.length };
}

/**
 * Apply (or replace) a tone mark on the last vowel of the syllable that ends
 * at `pos`. Returns the new text and caret position.
 */
export function applyToneAt(text: string, pos: number, combining: string): { text: string; pos: number } {
  const before = text.slice(0, pos);
  const after = text.slice(pos);
  const m = before.match(/(\S+)$/);
  if (!m) return { text, pos };
  const syllable = m[1];
  const start = before.length - syllable.length;
  const chars = Array.from(syllable.normalize('NFD'));
  // Remove existing tone marks
  const stripped = chars.filter((c) => !TONE_MARKS.includes(c));
  // Find the vowel to carry the tone: prefer ê/ơ/â/ă/ô/ư, else the last vowel unless the syllable ends in a vowel cluster with a final consonant… keep simple: pick the vowel with diacritic, else the last vowel
  let idx = -1;
  for (let i = stripped.length - 1; i >= 0; i--) {
    const c = stripped[i];
    if (VOWELS.includes(c) || (c.normalize('NFC') !== c && VOWELS.includes(c.normalize('NFC')))) {
      idx = i;
      // Check if this vowel carries a quality diacritic (NFD gives base + mark) – prefer it.
      break;
    }
  }
  // Prefer a vowel with a quality mark (ă â ê ô ơ ư) if present in the syllable
  const joined = stripped.join('').normalize('NFC');
  const arr = Array.from(joined);
  let target = -1;
  for (let i = arr.length - 1; i >= 0; i--) {
    if ('ăâêôơưĂÂÊÔƠƯ'.includes(arr[i])) {
      target = i;
      break;
    }
  }
  if (target === -1) {
    for (let i = arr.length - 1; i >= 0; i--) {
      if (VOWELS.includes(arr[i])) {
        target = i;
        break;
      }
    }
  }
  if (target === -1 && idx === -1) return { text, pos };
  if (target === -1) target = idx;
  // If the syllable has two vowels and no final consonant, the tone usually goes on the first (e.g. "hoa" → "hòa"), except with quality-marked vowels handled above.
  const vowelIdx = arr.map((c, i) => (VOWELS.includes(c) ? i : -1)).filter((i) => i >= 0);
  if (vowelIdx.length >= 2 && !'ăâêôơưĂÂÊÔƠƯ'.includes(arr[target])) {
    const last = arr[arr.length - 1];
    if (VOWELS.includes(last) && !'iuyIUY'.includes(arr[vowelIdx[0]])) target = vowelIdx[vowelIdx.length - 2];
  }
  arr[target] = (arr[target] + (combining ? combining : '')).normalize('NFC');
  const newSyl = arr.join('');
  const newText = text.slice(0, start) + newSyl + after;
  return { text: newText, pos: start + newSyl.length };
}

export const TOOLBAR_CHARS = ['ă', 'â', 'đ', 'ê', 'ô', 'ơ', 'ư'];
export const TOOLBAR_TONES: { label: string; combining: string }[] = [
  { label: 'à', combining: '̀' },
  { label: 'á', combining: '́' },
  { label: 'ả', combining: '̉' },
  { label: 'ã', combining: '̃' },
  { label: 'ạ', combining: '̣' },
];
