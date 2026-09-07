/**
 * Import a teacher DOCX into a DRAFT lesson JSON.
 *
 *   npm run import-lesson -- "source-lessons/bài 12.docx"
 *   npm run import-lesson -- "source-lessons/bài 12.docx" --number 12 --title "Tytuł"
 *
 * The script NEVER modifies the DOCX. It writes:
 *   content/drafts/bai-12.draft.json   – structured draft (draft: true)
 *   content/drafts/bai-12.extracted.md – readable dump for review
 *   public/images/lessons/bai-12/*     – embedded images
 *
 * Heuristics extract vocabulary (two-column tables and "vi - pl" lines),
 * dialogues (A:/B: lines), headings and exercises. Every generated exercise
 * is marked source "generated" / status "unverified"; teacher exercises are
 * kept in `original` with no answer key. Review the draft, complete it, then
 * move it to content/lessons/bai-12.json and run `npm run validate-content`.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { basename, join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync, strFromU8 } from 'fflate';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');

interface Block {
  kind: 'heading' | 'paragraph' | 'table' | 'image';
  text?: string;
  rows?: string[][];
  image?: { src: string; alt: string; source: string };
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const inputArg = process.argv.slice(2).find((a) => !a.startsWith('--') && a.endsWith('.docx'));
if (!inputArg) {
  console.error('Użycie: npm run import-lesson -- "source-lessons/bài 12.docx" [--number 12] [--title "…"]');
  process.exit(1);
}
const input: string = inputArg;
const file = resolve(ROOT, input);
if (!existsSync(file)) {
  console.error(`Nie znaleziono pliku: ${file}`);
  process.exit(1);
}

const numFromName = basename(file).match(/(\d+)/)?.[1];
const number = Number(arg('--number') ?? numFromName);
if (!Number.isInteger(number) || number < 1) {
  console.error('Nie można ustalić numeru lekcji – podaj --number N');
  process.exit(1);
}
const id = `bai-${String(number).padStart(2, '0')}`;
const title = arg('--title') ?? `Bài ${number} (szkic)`;

/* ------------------------------------------------------------------ */
/* Unzip + parse document.xml                                           */
/* ------------------------------------------------------------------ */

const zip = unzipSync(new Uint8Array(readFileSync(file)));
const docXml = strFromU8(zip['word/document.xml']);
const relsXml = zip['word/_rels/document.xml.rels'] ? strFromU8(zip['word/_rels/document.xml.rels']) : '';
const rels = new Map<string, string>();
for (const m of relsXml.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
  const attrs = m[1];
  const rid = attrs.match(/Id="([^"]+)"/)?.[1];
  const target = attrs.match(/Target="([^"]+)"/)?.[1];
  if (rid && target?.startsWith('media/')) rels.set(rid, target.replace('media/', ''));
}

const imgDir = join(ROOT, 'public/images/lessons', id);
let imgCount = 0;
const savedImages: string[] = [];

function textOf(xml: string): string {
  let out = '';
  for (const m of xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:br\/>/g)) {
    if (m[0].startsWith('<w:tab')) out += '\t';
    else if (m[0].startsWith('<w:br')) out += '\n';
    else out += m[1];
  }
  return out
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .normalize('NFC');
}

function parseParagraph(xml: string): Block | null {
  const style = xml.match(/<w:pStyle w:val="([^"]+)"/)?.[1] ?? '';
  const text = textOf(xml).replace(/\s+\n/g, '\n').trim();
  const embeds = [...xml.matchAll(/r:embed="(rId\d+)"/g)].map((m) => m[1]);
  if (embeds.length) {
    for (const rid of embeds) {
      const media = rels.get(rid);
      if (!media || !zip[`word/media/${media}`]) continue;
      mkdirSync(imgDir, { recursive: true });
      imgCount++;
      const ext = media.split('.').pop() ?? 'png';
      const name = `image-${imgCount}.${ext}`;
      writeFileSync(join(imgDir, name), zip[`word/media/${media}`]);
      savedImages.push(`images/lessons/${id}/${name}`);
    }
    if (!text) return { kind: 'image', image: { src: savedImages[savedImages.length - 1], alt: `Obrazek ${imgCount} z Bài ${number}`, source: input } };
  }
  if (!text) return null;
  const bold = /<w:b\/>|<w:b w:val="1"\/>/.test(xml) && !/<w:t[^>]*>[^<]*<\/w:t>[\s\S]*<w:rPr>(?![\s\S]*<w:b\/>)/.test(xml);
  const isHeading = /Heading|Title/i.test(style) || (bold && text.length < 60 && !text.includes(' - ')) || (/^[^-–:]{2,40}:$/.test(text) && text.length < 40);
  return { kind: isHeading ? 'heading' : 'paragraph', text };
}

function parseTable(xml: string): Block {
  const rows: string[][] = [];
  for (const tr of xml.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)) {
    const cells: string[] = [];
    for (const tc of tr[0].matchAll(/<w:tc\b[\s\S]*?<\/w:tc>/g)) {
      const paras = [...tc[0].matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)].map((p) => textOf(p[0]).trim()).filter(Boolean);
      cells.push(paras.join(' / '));
    }
    rows.push(cells);
  }
  return { kind: 'table', rows };
}

const body = docXml.slice(docXml.indexOf('<w:body>'), docXml.indexOf('</w:body>'));
const blocks: Block[] = [];
// Walk top-level paragraphs and tables in order (tables contain paragraphs, so match tables first at their position)
const re = /<w:tbl\b[\s\S]*?<\/w:tbl>|<w:p\b[\s\S]*?<\/w:p>/g;
for (const m of body.matchAll(re)) {
  const xml = m[0];
  if (xml.startsWith('<w:tbl')) blocks.push(parseTable(xml));
  else {
    const b = parseParagraph(xml);
    if (b) blocks.push(b);
  }
}

/* ------------------------------------------------------------------ */
/* Heuristic extraction                                                 */
/* ------------------------------------------------------------------ */

const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 30) || 'x';

const isVietnamese = (s: string) => /[ăâđêôơưàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]/i.test(s) || /\b(là|không|của|và|có|đi|ăn|tôi|mình|bạn|anh|chị|em)\b/i.test(s);

const vocabulary: { id: string; vi: string; pl: string; status: 'verified' }[] = [];
const seenVocab = new Set<string>();
function addVocab(vi: string, pl: string) {
  vi = vi.trim();
  pl = pl.trim();
  if (!vi || !pl || vi.length > 40 || pl.length > 80) return;
  const key = vi.toLowerCase();
  if (seenVocab.has(key)) return;
  seenVocab.add(key);
  let vid = `v-${id}-${slug(vi)}`;
  let n = 2;
  while (vocabulary.some((v) => v.id === vid)) vid = `v-${id}-${slug(vi)}-${n++}`;
  vocabulary.push({ id: vid, vi, pl, status: 'verified' });
}

const dialogueLines: { speaker: string; vi: string }[] = [];
const paragraphsRaw: string[] = [];

for (const b of blocks) {
  if (b.kind === 'table' && b.rows) {
    for (const row of b.rows) {
      if (row.length === 2 && row[0] && row[1]) {
        if (isVietnamese(row[0]) && !isVietnamese(row[1])) addVocab(row[0], row[1]);
        else if (isVietnamese(row[1]) && !isVietnamese(row[0])) addVocab(row[1], row[0]);
      }
    }
  } else if (b.kind === 'paragraph' && b.text) {
    for (const line of b.text.split('\n')) {
      const dm = line.match(/^([A-ZĐ][\w ]{0,20}):\s*(.+)$/);
      if (dm && isVietnamese(dm[2])) {
        dialogueLines.push({ speaker: dm[1], vi: dm[2].trim() });
        continue;
      }
      const vm = line.match(/^(.+?)\s+[-–]\s+(.+)$/);
      if (vm) {
        if (isVietnamese(vm[1]) && !isVietnamese(vm[2])) addVocab(vm[1], vm[2]);
        else if (isVietnamese(vm[2]) && !isVietnamese(vm[1])) addVocab(vm[2], vm[1]);
      }
      if (isVietnamese(line) && line.length > 60) paragraphsRaw.push(line);
    }
  }
}

/* ------------------------------------------------------------------ */
/* Draft lesson                                                          */
/* ------------------------------------------------------------------ */

const exercises: unknown[] = [];
// Generated vocabulary practice (safe: derived only from extracted pairs)
if (vocabulary.length >= 4) {
  exercises.push({
    id: `e-${id}-vocab-match`,
    type: 'matching',
    skill: 'vocabulary',
    source: 'generated',
    status: 'unverified',
    prompt: 'Dopasuj słówka.',
    pairs: vocabulary.slice(0, 6).map((v) => ({ left: v.vi, right: v.pl })),
    level: 1,
  });
}
for (const v of vocabulary.slice(0, 5)) {
  exercises.push({
    id: `e-${id}-typed-${slug(v.vi)}`,
    type: 'typed',
    skill: 'vocabulary',
    source: 'generated',
    status: 'unverified',
    prompt: `Napisz po wietnamsku: „${v.pl}”.`,
    answerLang: 'vi',
    answers: [v.vi],
    vocab: [v.id],
    level: 2,
  });
}
const dialogues =
  dialogueLines.length >= 2
    ? [
        {
          id: `d-${id}-dialog`,
          title: `Dialog z Bài ${number}`,
          lines: dialogueLines.map((l) => ({ speaker: l.speaker, vi: l.vi })),
          status: 'verified',
        },
      ]
    : [];
if (dialogues.length) {
  exercises.push({
    id: `e-${id}-dialogue-1`,
    type: 'dialogue-completion',
    skill: 'dialogue',
    source: 'teacher',
    status: 'unverified',
    dialogueId: dialogues[0].id,
    lineIndex: 1,
    distractors: [],
    level: 2,
  });
}
const readings = paragraphsRaw.length
  ? [{ id: `r-${id}-czytanka`, title: `Czytanka z Bài ${number}`, paragraphs: paragraphsRaw, status: 'verified', note: 'SZKIC: sprawdź podział na akapity i dodaj tłumaczenie.' }]
  : [];

const draft = {
  id,
  number,
  title,
  titleVi: `Bài ${number}`,
  summary: 'SZKIC – uzupełnij streszczenie lekcji.',
  icon: '📄',
  sourceFile: input,
  draft: true,
  objectives: ['SZKIC – wpisz cele „Po tej lekcji potrafię…”'],
  vocabulary,
  grammar: [
    {
      id: `g-${id}-szkic`,
      title: 'SZKIC – nazwa struktury',
      pattern: '',
      explanation: 'SZKIC – opisz strukturę gramatyczną na podstawie sekcji „original”.',
      examples: [],
      keywords: [],
      status: 'verified',
      practice: [],
    },
  ],
  dialogues,
  readings,
  pronunciation: [],
  images: savedImages.map((src, i) => ({ src, alt: `Obrazek ${i + 1} z Bài ${number}`, source: input })),
  exercises,
  checkpoint: exercises.slice(0, 5).map((e) => (e as { id: string }).id),
  reviewLinks: [],
  original: blocks.map((b) => (b.kind === 'image' ? { kind: 'image', image: b.image } : b.kind === 'table' ? { kind: 'table', rows: b.rows } : { kind: b.kind, text: b.text })),
};

const outDir = join(ROOT, 'content/drafts');
mkdirSync(outDir, { recursive: true });
const outJson = join(outDir, `${id}.draft.json`);
const outMd = join(outDir, `${id}.extracted.md`);
writeFileSync(outJson, JSON.stringify(draft, null, 2) + '\n');

const md: string[] = [`# Ekstrakcja: ${basename(file)}`, '', `Lekcja: ${id} · słówek: ${vocabulary.length} · linii dialogu: ${dialogueLines.length} · obrazków: ${savedImages.length}`, '', '## Bloki dokumentu', ''];
for (const b of blocks) {
  if (b.kind === 'heading') md.push(`### ${b.text}`, '');
  else if (b.kind === 'paragraph') md.push(b.text!, '');
  else if (b.kind === 'table') {
    md.push(...b.rows!.map((r) => `| ${r.join(' | ')} |`), '');
  } else if (b.kind === 'image') md.push(`![${b.image!.alt}](${b.image!.src})`, '');
}
md.push('## Wykryte słówka', '', ...vocabulary.map((v) => `- ${v.vi} — ${v.pl}`), '');
if (dialogueLines.length) md.push('## Wykryty dialog', '', ...dialogueLines.map((l) => `${l.speaker}: ${l.vi}`), '');
md.push('## Do zrobienia przed publikacją', '', '- [ ] Uzupełnić title, summary, icon, objectives', '- [ ] Sprawdzić słówka (kategorie, klasyfikatory, przykłady) i usunąć błędne pary', '- [ ] Opisać gramatykę (grammar) na podstawie sekcji original', '- [ ] Dodać tłumaczenia dialogu i czytanki', '- [ ] Zamienić exercises na właściwe zadania; ćwiczenia nauczycielki bez klucza oznaczyć status "unverified"', '- [ ] Dopisać wątpliwe formy do CONTENT_REVIEW.md', '- [ ] Przenieść plik do content/lessons/' + id + '.json (usuń "draft": true) i uruchomić npm run validate-content', '');
writeFileSync(outMd, md.join('\n'));

console.log(`✅ Szkic zapisany: ${outJson}`);
console.log(`   Podgląd: ${outMd}`);
console.log(`   Słówka: ${vocabulary.length} · dialog: ${dialogueLines.length} linii · czytanki: ${readings.length} · obrazki: ${savedImages.length}`);
console.log('   Szkic NIE jest publikowany automatycznie – przejrzyj go i przenieś do content/lessons/.');
