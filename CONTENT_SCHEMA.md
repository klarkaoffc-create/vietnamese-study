# Schemat treści

Ten dokument opisuje strukturę plików w `content/` — czyli **wszystko, co
aplikacja pokazuje**. Pełne, wiążące definicje typów są w
[`src/data/schema.ts`](src/data/schema.ts) (Zod); ten plik jest ich czytelnym
opisem dla osoby, która nie musi znać TypeScriptu, żeby dodać lub poprawić
lekcję. Jeśli coś tu i w kodzie się rozjedzie, kod ma rację — popraw ten plik.

Wszystkie pliki treści to JSON. Poprawność każdego pliku sprawdza:

```bash
npm run validate-content
```

## Gdzie co leży

```
content/
  lessons/*.json     — jedna lekcja na plik, np. bai-07.json
  reviews/*.json     — powtórki blokowe (np. rev-01-05.json = Bài 1–5)
  exams/*.json       — blueprinty egzaminów (np. exam-01.json = blok 1)
  audio/manifest.json — lista nagrań (dialekt, mówca, źródło, weryfikacja)
  drafts/            — szkice ze `npm run import-lesson` (nie publikowane)
```

## Identyfikatory (id)

Wszystkie id są tekstowe, muszą być globalnie unikalne i mają wymuszony
prefiks, żeby walidator mógł wykryć pomyłki:

| Rodzaj | Wzór | Przykład |
|---|---|---|
| Lekcja | `bai-NN` (dwie cyfry) | `bai-07` |
| Słówko | `v-<id lekcji>-<slug>` | `v-bai-07-day` |
| Gramatyka | `g-<id lekcji>-<slug>` | `g-bai-02-la` |
| Dialog | `d-<id lekcji>-<slug>` | `d-bai-02-greeting` |
| Czytanka | `r-<id lekcji>-<slug>` | `r-bai-06-gia-dinh` |
| Ćwiczenie w lekcji | `e-<id lekcji>-<slug>` | `e-bai-05-fill-neg` |
| Ćwiczenie w powtórce | `e-<id powtórki>-<slug>` | `e-rev-01-05-tr-1` |
| Ćwiczenie w egzaminie | `e-<id egzaminu>-<slug>` | `e-exam-01-intro-typed` |
| Powtórka bloku | `rev-FF-TT` | `rev-01-05` |
| Egzamin | `exam-NN` | `exam-01` |

`npm run validate-content` odrzuci plik, jeśli prefiks się nie zgadza, jeśli
dwa elementy mają to samo id, albo jeśli coś odwołuje się (np. ćwiczenie do
gramatyki) do id, które nie istnieje.

## Pole `status`

Prawie każdy element językowy (słówko, przykład, linia dialogu, czytanka,
ćwiczenie) ma pole `status`:

| Wartość | Znaczenie |
|---|---|
| `verified` (domyślne) | Zgodne z materiałem nauczycielki, nic nie budzi wątpliwości. |
| `unverified` | Poprawne w sensie schematu, ale klucz odpowiedzi jest wygenerowany albo opracowany do nauki bez oryginalnego klucza — patrz [CONTENT_REVIEW.md](CONTENT_REVIEW.md). |
| `flagged` | Forma językowa jest oznaczona jako wątpliwa w [CONTENT_REVIEW.md](CONTENT_REVIEW.md). Aplikacja **nigdy nie wybiera takiego ćwiczenia do egzaminu** (`eligibleForExam` w `src/learning/exam.ts` je odrzuca) i pokazuje w interfejsie żółty znacznik „⚠ do weryfikacji”. |

Pole `source` (na ćwiczeniach) mówi, skąd wzięło się zadanie:

- `teacher` — treść pytania pochodzi z dokumentu nauczycielki (pokazywana jako pill „Materiał z lekcji”).
- `generated` — treść jest wygenerowana do nauki na podstawie zweryfikowanego materiału (pill „Ćwiczenie wygenerowane do nauki”).

Zasada z briefu jest wymuszona przez walidator: **ćwiczenie `source: "generated"`
nigdy nie może mieć `status: "verified"`** — wygenerowany klucz z definicji nie
jest „potwierdzony przez nauczyciela”, tylko najwyżej `unverified`.

## Lekcja (`content/lessons/*.json` → `LessonSchema`)

| Pole | Typ | Opis |
|---|---|---|
| `id`, `number` | string, number | `bai-07`, `7` — muszą się zgadzać. |
| `title`, `titleVi` | string | Tytuł po polsku / oryginalne „Bài N”. |
| `summary` | string | Krótki opis na kartę lekcji. |
| `icon` | string | Jeden emoji. |
| `sourceFile` | string | Ścieżka do oryginalnego DOCX (tylko informacyjnie — plik nigdy nie jest czytany w runtime). |
| `draft` | boolean | `true` dla szkiców ze skryptu importu — lekcja jest widoczna, ale oznaczona jako nieprzejrzana. |
| `objectives` | string[] | Lista „Po tej lekcji potrafię…”. |
| `vocabulary` | `VocabItem[]` | Patrz niżej. |
| `grammar` | `GrammarPoint[]` | Patrz niżej. |
| `dialogues` | `Dialogue[]` | Patrz niżej (może być pusta). |
| `readings` | `Reading[]` | Patrz niżej (może być pusta). |
| `pronunciation` | `{id,title,body}[]` | Notatki o wymowie (może być pusta). |
| `images` | `ImageRef[]` | Obrazki z lekcji (ścieżka względem `public/`). |
| `exercises` | `Exercise[]` | Patrz „Ćwiczenia” niżej. |
| `checkpoint` | string[] | Id ćwiczeń wchodzących w skład checkpointu na końcu lekcji. |
| `reviewLinks` | string[] | Id struktur gramatycznych z wcześniejszych lekcji, które warto powtórzyć. |
| `original` | `OriginalBlock[]` | Werbatym przepisany materiał nauczycielki — patrz niżej. |

### `VocabItem`

```json
{
  "id": "v-bai-03-nguoi",
  "vi": "người",
  "pl": "człowiek, ludzie",
  "category": "noun",
  "classifier": "con",
  "dialect": "północ: bố · południe: ba",
  "examples": [{ "vi": "...", "pl": "...", "status": "verified" }],
  "note": "...",
  "status": "verified",
  "tags": ["family"],
  "srs": true
}
```

`category` to jedna z: `noun, verb, adjective, adverb, pronoun, number, phrase,
question-word, particle, preposition, classifier, time, proper-noun, other`.
`srs: false` wyklucza słówko z powtórek (np. żartobliwe/wulgarne pozycje z
materiału nauczycielki) — nadal widoczne w bazie słownictwa, ale nie
generuje kart Anki-style.

### `GrammarPoint`

```json
{
  "id": "g-bai-06-tense",
  "title": "Czasy: đã / đang / sẽ",
  "pattern": "đã + czasownik (przeszłość) · ...",
  "explanation": "Akapity oddzielone \\n\\n.",
  "examples": [{ "vi": "...", "pl": "..." }],
  "keywords": ["đã", "đang", "sẽ"],
  "status": "verified",
  "practice": ["e-bai-06-tense-gen", "..."]
}
```

`practice` to lista id ćwiczeń powiązanych z tą strukturą — używana przez
`/gramatyka` i przez sesje powtórkowe. Ćwiczenie może też samo zadeklarować
`grammar: ["g-..."]` w swoim polu — obie ścieżki są sumowane
(`exercisesForGrammar` w `src/data/content.ts`).

### `Dialogue` i `Reading`

Dialog to lista `{ speaker, vi, pl?, note?, status? }`. Czytanka to lista
akapitów (`paragraphs`) z opcjonalnym tłumaczeniem `translation` (musi mieć
tyle samo elementów co `paragraphs` — walidator to sprawdza) oraz
`glossary` — lista id słówek.

### `OriginalBlock`

Werbatym zapis materiału nauczycielki, blok po bloku, w kolejności
występowania w dokumencie:

```json
{ "kind": "heading", "text": "..." }
{ "kind": "paragraph", "text": "..." }
{ "kind": "table", "rows": [["kol1", "kol2"], ...] }
{ "kind": "image", "image": { "src": "images/lessons/bai-09/clocks.png", "alt": "...", "source": "source-lessons/bái 9.docx" } }
```

To pole istnieje właśnie po to, żeby **nigdy nie trzeba było otwierać
DOCX-a**, a jednocześnie żeby nic z oryginału nie zostało ukryte — każda
lekcja ma zakładkę „Materiał nauczycielki” pokazującą to один do jednego.

## Ćwiczenia (`Exercise`, unia rozróżniana przez `type`)

Wspólne pola każdego ćwiczenia: `id, skill, source, status, instruction?,
explanation?, grammar[], vocab[], image?, level (1-3)`.

| `type` | Pola specyficzne | Jak oceniane |
|---|---|---|
| `mcq` | `prompt, options[], answer` (indeks) | dokładne dopasowanie indeksu |
| `typed` | `prompt, answerLang, answers[], hint?` | `matchAny` (patrz niżej) |
| `fill-blank` | `sentence` (dokładnie jedno `___`), `answers[], bank?, translation?` | jak `typed`, po wietnamsku |
| `matching` | `prompt, pairs[{left,right}]` | ocena częściowa, % trafionych par |
| `ordering` | `prompt, tokens[], translation?` | dokładna kolejność tokenów |
| `error-correction` | `wrong, answers[]` | jak `typed` |
| `diacritics` | `stripped, answers[], translation?` | jak `typed`, kategoria zawsze `tone` |
| `reading-question` | `readingId, prompt`, + (`options[], answer`) **lub** (`answers[], answerLang?`) | wybór albo tekst |
| `dialogue-completion` | `dialogueId, lineIndex, distractors[]` | tekst linii dialogu |
| `generator` | `generator (GeneratorKind), params, count` | generowane w locie, patrz niżej |
| `open-answer` | `prompt, patterns[]` (z `{x}`), `sample?` | dopasowanie do wzorca |

`skill` to jedna z kategorii błędów: `vocabulary, spelling, tone, grammar,
pronoun, classifier, word-order, tense, reading, listening, numbers, dates,
time, dialogue` — ta sama lista zasila zeszyt błędów i rozbicie wyników
egzaminu.

### Ćwiczenia generowane

`type: "generator"` nie ma zaszytej treści — w runtime `src/learning/
generators.ts` losuje (z ziarnem, więc odtwarzalnie) konkretne instancje.
`generator` to jedna z: `number, phone, age, year, date, weekday, month,
time, classifier, pronoun, tense, comparison, position, tone-identify`.
`count` mówi, ile instancji wygenerować w jednej sesji (`expandExercise` w
`src/learning/session.ts` to rozwija na osobne karty).

### Wzorce `{x}` w `open-answer`

`patterns` to lista wzorców typu `"Mình tên là {x}"` — `{x}` dopasowuje
dowolny niepusty fragment. Odpowiedź jest oceniana jako `correct`, jeśli
pasuje do któregoś wzorca po normalizacji, albo jako `tone`, jeśli pasuje
dopiero po zdjęciu tonów (czyli struktura zdania jest dobra, ale np. brakuje
znaku diakrytycznego w stałej części wzorca). Zobacz `matchPatterns` w
`src/utilities/vietnamese.ts`.

## Powtórka blokowa (`content/reviews/*.json` → `ReviewSchema`)

```json
{
  "id": "rev-01-05",
  "fromLesson": 1, "toLesson": 5,
  "title": "Powtórka 1–5",
  "sourceFile": "source-lessons/Powtórka 1-5 vn.docx",
  "intro": "...",
  "readings": [...], "vocabulary": [...], "exercises": [...],
  "original": [...]
}
```

`toLesson - fromLesson` musi być równe 4 (blok pięciu lekcji) — walidator to
wymusza. Powtórka jest powiązana z blokiem automatycznie przez zakres
numerów lekcji, nie przez nazwę pliku.

## Blueprint egzaminu (`content/exams/*.json` → `ExamBlueprintSchema`)

```json
{
  "id": "exam-01",
  "block": 1,
  "title": "Egzamin 1 (Bài 1–5)",
  "questionCount": 25,
  "minProductionShare": 0.5,
  "exercises": [ /* opcjonalne zadania tylko-egzaminowe */ ]
}
```

Egzamin **nie ma własnej puli pytań** — `questionCount` pytań jest losowanych
(z ziarnem per podejście) ze wszystkich ćwiczeń lekcji danego bloku, powtórki
tego bloku (jeśli istnieje) i ewentualnych `exercises` zdefiniowanych tu na
sztywno. `minProductionShare` to minimalny udział zadań produktywnych
(wpisywanie, szyk zdania, poprawianie błędu…) — algorytm w
`src/learning/exam.ts` (`sampleExam`) najpierw dobiera zadania produktywne,
dopiero potem uzupełnia resztę.

## Manifest audio (`content/audio/manifest.json`)

```json
{ "clips": [
  { "targetId": "v-bai-01-xin-chao", "file": "bai-01/xin-chao.mp3",
    "dialect": "north", "speaker": "nauczycielka", "source": "nagranie z zajęć",
    "lesson": "bai-01", "verified": true }
] }
```

`targetId` wskazuje słówko (`v-...`), linię dialogu (`d-...#3`, gdzie `3` to
indeks linii) albo czytankę (`r-...`). `file` jest względem `public/audio/`.
Zobacz [content/audio/README.md](content/audio/README.md) po krokową
instrukcję dodawania nagrań i sekcję „Jak dodać nagranie” w
[README.md](README.md).

## Co sprawdza `npm run validate-content`

- Każdy plik parsuje się zgodnie ze schematem Zod (błąd = dokładna ścieżka pola).
- Numeracja lekcji jest ciągła od 1, bez dziur i duplikatów.
- Wszystkie id (słówka, gramatyka, dialogi, czytanki, ćwiczenia, powtórki,
  egzaminy) są globalnie unikalne i mają poprawny prefiks.
- Każde odwołanie (checkpoint → ćwiczenie, ćwiczenie → gramatyka/słówko,
  czytanka → glosariusz, dialog-completion → dialog+linia,
  reading-question → czytanka, `reviewLinks` → gramatyka, `practice` →
  ćwiczenie, klip audio → element treści) wskazuje na coś, co istnieje.
- Każdy obrazek (`images`, `original[].kind==="image"`, `exercise.image`)
  ma odpowiadający plik w `public/`.
- Typowe błędy strukturalne per typ ćwiczenia (np. `mcq.answer` w zakresie
  opcji, `fill-blank.sentence` z dokładnie jedną luką, brak pustych list
  odpowiedzi tam, gdzie ocenianie tego wymaga).
- Ćwiczenie `source: "generated"` nie ma `status: "verified"`.
- Ostrzeżenia (nie blokują builda): elementy `flagged`, bloki powtórki bez
  odpowiadającej lekcji, egzamin dla niekompletnego bloku.

Uruchom z `--verbose`, żeby zobaczyć pełną listę ostrzeżeń:

```bash
npm run validate-content -- --verbose
```
