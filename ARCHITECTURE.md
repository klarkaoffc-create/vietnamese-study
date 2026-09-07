# Architektura

Krótki przewodnik po tym, jak zbudowana jest aplikacja i **dlaczego** — dla
osoby, która będzie ją rozwijać (siebie za rok, albo kogoś innego).

## Zasada nadrzędna: aplikacja jest content-driven

W kodzie **nie ma** komponentu `Bai1Page`, `Bai2Page` itd. Jest jeden
`LessonPage`, który renderuje dowolną lekcję na podstawie danych z
`content/lessons/*.json`. To samo dotyczy nawigacji, bloków pięciu lekcji,
listy powtórek i egzaminów — wszystko jest **wyliczone z treści**, nie
zaszyte na sztywno. Konsekwencja: dodanie `content/lessons/bai-12.json` i
uruchomienie `npm run validate-content` wystarczy, żeby lekcja pojawiła się
w menu, w bloku 3, w bazie słownictwa, w indeksie gramatyki i (po
skompletowaniu bloku 11–15) w egzaminie — bez dotykania `src/`.

Mechanizm: `src/data/content.ts` używa `import.meta.glob('../../content/
lessons/*.json', { eager: true })`, czyli Vite w czasie builda sam znajduje
wszystkie pliki w katalogu — nie ma listy plików do ręcznego aktualizowania.

## Przepływ danych (jedna strzałka, bez skrótów)

```
content/*.json  →  src/data/schema.ts (Zod)  →  src/data/content.ts (indeksy)
                                                        │
                                    ┌───────────────────┼────────────────────┐
                                    ▼                    ▼                    ▼
                          src/learning/*.ts      src/exercises/*.tsx    src/pages/*.tsx
                          (silnik nauki:                (renderowanie          (strony, każda
                          SRS, ocenianie,                zadań, wejścia)        łączy silnik +
                          generatory, sesje,                                    komponenty)
                          egzaminy — bez React)
                                    │
                                    ▼
                          src/learning/state.ts + store.tsx
                          (reducer + localStorage, bez React
                           w samym reducerze — testowalny osobno)
```

Kluczowa decyzja projektowa: **cała logika nauki (`src/learning/`) jest
czystym TypeScriptem, bez importu React.** SRS, ocenianie odpowiedzi,
generatory ćwiczeń, budowanie sesji, losowanie egzaminu i reducer stanu to
funkcje `(dane) => wynik`, testowane w `tests/` bez renderowania
komponentów. Warstwa React (`src/pages`, `src/exercises`, `src/components`)
tylko wywołuje te funkcje i renderuje wynik. Dzięki temu 71 testów
jednostkowych działa w ułamku sekundy i nie wymaga jsdom.

## Struktura katalogów

```
source-lessons/        # oryginalne DOCX — WYŁĄCZNIE DO ODCZYTU, nigdy nie modyfikowane
content/
  lessons/              # bai-01.json … bai-11.json (jedna lekcja = jeden plik)
  reviews/              # rev-01-05.json — powtórka blokowa
  scenarios/             # sytuacje komunikacyjne (roleplay, produkcja spontaniczna)
  exams/                # exam-01.json, exam-02.json — blueprinty egzaminów
  audio/                # manifest.json + README z instrukcją dodawania nagrań
  drafts/                # szkice ze `npm run import-lesson` (gitignore nie obejmuje, ale
                          # nie są importowane przez content.ts, dopóki nie trafią do lessons/)
src/
  data/
    schema.ts            # Zod: jedyne źródło prawdy o kształcie treści
    content.ts            # import.meta.glob + wszystkie indeksy (po id, po lekcji…)
  learning/                # silnik nauki — czysty TS, bez React
    blocks.ts              # bloki po 5 lekcji, wyliczane z listy numerów lekcji
    numbers.ts              # liczby/daty/godziny na słowa (z wariantami regionalnymi)
    generators.ts            # generatory ćwiczeń w locie (liczby, klasyfikatory, zegar…)
    srs.ts                    # harmonogram powtórek (SM-2-lite) + drabina automatyzacji
    tasks.ts                   # silnik zadań: umiejętność → konkretne zadanie
    skills.ts                   # metryki umiejętności (aktywne/bierne, produkcja…)
    grading.ts                 # ocenianie każdego typu ćwiczenia
    session.ts                  # budowanie sesji (Dzisiaj / Słabe / Słownictwo / Błędy…)
    exam.ts                      # losowanie pytań egzaminu z ziarnem
    state.ts                      # AppState + reducer + (de)serializacja localStorage
    record.ts                     # zamiana wyniku ćwiczenia na akcje reducera
    store.tsx                     # jedyny plik w learning/ z Reactem — Context + useReducer
  exercises/                # renderowanie zadań (React)
    ExerciseView.tsx          # przełącznik po typie ćwiczenia → właściwy input
    inputs.tsx                 # ChoiceInput, TextInput (+ pasek znaków wietnamskich), …
    ExerciseRunner.tsx           # pętla sesji: pokaż zadanie → oceń → zapisz → następne
    (kart fiszkowych już nie ma — zastąpiły je zadania z tasks.ts)
  components/                # współdzielone komponenty UI
  pages/                     # jedna strona = jedna trasa; łączy dane + silnik + komponenty
  utilities/                 # vietnamese.ts (normalizacja/porównanie), dates.ts, random.ts, typing.ts
scripts/
  validate-content.ts        # npm run validate-content
  import-lesson.ts           # npm run import-lesson -- "source-lessons/bài 12.docx"
tests/                     # vitest, jeden plik na moduł silnika + content.test.ts
```

## Silnik nauki — jak działają poszczególne części

### Spaced repetition (`src/learning/srs.ts`)

Uproszczone SM-2: każdy element (`SrsItem`) ma `interval` (dni), `ease`
(mnożnik) i `due` (znacznik czasu). Cztery oceny:

| Ocena | Efekt |
|---|---|
| 0 „nie wyszło” | `interval` → 0, powrót w tej samej sesji (10 minut), `ease` spada |
| 1 „z trudem” | mały wzrost interwału, `ease` lekko spada |
| 2 „udało się” | 1 → 3 → `interval × ease` dni |
| 3 „bez wysiłku” | szybszy wzrost, `ease` rośnie |

**Kluczowa decyzja pedagogiczna: harmonogram planuje UMIEJĘTNOŚCI, nie
fiszki.** `SrsKind` to nie kierunki karty, tylko rzeczy, które umiesz zrobić:

| `SrsKind` | Co znaczy |
|---|---|
| `vocab-active` | potrafisz wydobyć i użyć słowa samodzielnie (to liczy się najbardziej) |
| `vocab-passive` | rozumiesz je, gdy je widzisz/słyszysz (tylko diagnostyka) |
| `grammar` | stosujesz wzorzec w żywym zdaniu |
| `sentence` | wykonujesz konkretną sytuację komunikacyjną |
| `dialogue` | reagujesz w rozmowie |
| `listening` | rozumiesz ze słuchu |

Do tego każdy element ma `level` 1–5 — **drabinę automatyzacji**
(rozpoznawanie → przypomnienie z podpowiedzią → budowanie zdania → użycie w
kontekście → produkcja spontaniczna). Sukces przesuwa o szczebel w górę,
porażka o szczebel w dół, a `tasks.ts` dobiera do bieżącego szczebla zadanie
z odpowiednią ilością podpowiedzi. Dzięki temu ta sama treść wraca coraz
mniej podparta.

`mastery()` liczy się z interwału, niezawodności **i szczebla** — element,
który był tylko rozpoznawany (poziom 1–2), nie może wyglądać na opanowany,
choćby miał długi odstęp. `masteryLevel()` przyznaje „dojrzały” dopiero przy
poziomie ≥ 4.

Migracja z wersji 1 stanu (era fiszek) mapuje `vocab-vi-pl` → `vocab-passive`
i `vocab-pl-vi` → `vocab-active`, zachowując interwały i historię.

### Silnik zadań (`src/learning/tasks.ts`)

Zamienia „umiejętność do powtórki” na **konkretne zadanie do wykonania**.
Nic tu nie wymyśla wietnamskiego — każde zadanie powstaje z materiału, który
już jest w `content/`: przykładowych zdań przy słówkach i gramatyce, linii
dialogów, scenariuszy komunikacyjnych. Gdy słowo nie ma zdania przykładowego,
silnik świadomie schodzi do słabszego zadania, zamiast fabrykować zdanie.

Każde zadanie niesie zsyntetyzowany obiekt `Exercise`, więc renderuje je i
ocenia **istniejący** silnik ćwiczeń (`ExerciseView` + `grading.ts`) bez
żadnych zmian.

### Sesje (`src/learning/session.ts`)

`buildSession('today')` buduje krótki trening mieszany w fazach:
rozgrzewka → przypomnienie (PL→VN) → rozmowa → gramatyka w użyciu → twoje
błędy → słuchanie (gdy są nagrania) → swobodna wypowiedź. To ma być
ćwiczenie języka, nie przerabianie talii kart.

### Ocenianie odpowiedzi (`src/learning/grading.ts` + `src/utilities/vietnamese.ts`)

Dla każdego typu ćwiczenia jest osobna gałąź w `gradeExercise`, ale **każda
z nich, która porównuje tekst wietnamski, przechodzi przez `matchAny` /
`matchVietnamese`**. Ta funkcja:

1. Normalizuje NFC, usuwa interpunkcję, składa białe znaki, ignoruje
   wielkość liter — **nigdy nie usuwa tonów** na tym etapie.
2. Porównuje: identyczne → `correct`.
3. Jeśli nieidentyczne, porównuje wersje **bez** tonów
   (`stripDiacritics`) — jeśli te się zgadzają, wynik to `tone` (nie
   `correct`!) z listą słów, które straciły znak.
4. W przeciwnym razie → `wrong`.

Odpowiedzi błędne blisko oczekiwanej (dystans edycji ≤ ~1/5 długości słowa,
licząc transpozycję sąsiednich liter jako jeden koszt — algorytm
Damerau–Levenshteina) są przeklasyfikowywane z `vocabulary`/`grammar` na
kategorię `spelling` w zeszycie błędów.

Odpowiedzi po polsku (np. tłumaczenie na polski) idą inną ścieżką: tam
**są** ignorowane polskie znaki diakrytyczne (ą, ę, ć, ł…), bo tolerancja na
brak „ogonków” przy pisaniu po polsku jest zamierzona — inaczej niż przy
tonach wietnamskich, które są częścią znaczenia słowa.

### Generatory (`src/learning/generators.ts`, `src/learning/numbers.ts`)

Ćwiczenie typu `generator` nie ma zapisanej treści w JSON-ie — w runtime
`generate(kind, params, count, seed)` losuje `count` instancji (z ziarnem
PRNG z `src/utilities/random.ts`, więc powtarzalne w testach i w
egzaminie). `numbers.ts` zawiera samą logikę językową (liczby, daty,
godziny na słowa) jako czyste funkcje zwracające **listę** akceptowanych
form — np. `numberToWords(24)` zwraca zarówno formę z lekcji („hai mươi
bốn”), jak i standardowy wariant („hai mươi tư”), z wyjaśnieniem różnicy.

### Sesje (`src/learning/session.ts`)

`buildSession(state, mode)` miesza kilka źródeł w jedną listę `SessionItem[]`:
zaległe powtórki (`dueVocab`/`dueGrammar`), nowe słówka z bieżącej lekcji
(`newVocab`), próbkę otwartych błędów, ćwiczenia gramatyczne i kilka zadań
produktywnych z ostatnich lekcji. Tryb `today` (Dzisiaj) używa wszystkich
naraz; pozostałe tryby (`weak`, `vocab`, `grammar`, `mistakes`, `overdue`)
zawężają się do jednego źródła. To tutaj żyje decyzja „ile nowych słówek
dziennie” (`settings.dailyNewLimit`).

### Egzaminy (`src/learning/exam.ts`)

`sampleExam(pool, block, count, minProductionShare, seed)` dobiera pytania
round-robin po lekcjach bloku, najpierw zadania produktywne (żeby spełnić
`minProductionShare`), potem resztę, z ziarnem PRNG per podejście — stąd
różny zestaw za każdym razem, ale odtwarzalny dla testów. Pytania typu
`flagged` są odrzucane na wejściu (`eligibleForExam`).

### Stan i persystencja (`src/learning/state.ts`, `store.tsx`)

`AppState` to jeden obiekt: `srs` (mapa id→SrsItem), `lessons` (checkpointy,
odwiedziny, ukończenie), `mistakes`, `exams` (historia podejść), `sessions`
(log do statystyk), `settings`. `reducer(state, action)` jest czystą
funkcją — testowaną bez żadnego DOM-u. `StoreProvider` (jedyny komponent
Reactowy w `learning/`) trzyma to w `useReducer`, zapisuje do
`localStorage` z 150 ms debounce i wczytuje przy starcie. Eksport/import to
`JSON.stringify`/`JSON.parse` z polem `app: "vietnamese-study"` jako
zabezpieczeniem przed wczytaniem cudzego pliku.

## Dlaczego HashRouter

Strona jest statycznym zbiorem plików wrzucanym na GitHub Pages pod
`/<repo>/`. Bez konfiguracji serwera (Pages tego nie oferuje) przeglądarka
próbująca wejść bezpośrednio pod `/postep` dostałaby 404 z routera opartego
na `BrowserRouter`. `HashRouter` (`#/postep`) nigdy nie trafia do serwera po
ścieżce po `#`, więc działa bez żadnej konfiguracji przekierowań i bez pliku
`404.html`-hack. Cena: adresy mają `#` w środku — akceptowalna dla aplikacji
tego typu.

## Base path pod GitHub Pages

`vite.config.ts` czyta zmienną środowiskową `BASE_PATH` (ustawianą przez
workflow CI na `/<nazwa-repo>/`, domyślnie `/` lokalnie). Wszystkie
odwołania do obrazków w kodzie (`AudioButton`, `LessonPage`, `ExerciseView`)
idą przez `import.meta.env.BASE_URL`, a nie przez zapisane na sztywno `/`,
więc obrazki i audio działają identycznie w `npm run dev` i pod
`https://user.github.io/vietnamese-study/`.

## CI/CD (`.github/workflows/deploy.yml`)

Push na `main` → `npm ci` → `validate-content` → `typecheck` → `test` →
oblicz `BASE_PATH` z nazwy repo (specjalny przypadek: repo `user.github.io`
dostaje `/`, każde inne dostaje `/<repo>/`) → `vite build` → publikacja
przez `actions/deploy-pages`. Każdy z tych kroków musi przejść, żeby
deployment się powiódł — treść jest więc walidowana **przed** publikacją,
nie po.

## Skrypty pomocnicze (`scripts/`)

- **`validate-content.ts`** — czyta wszystko z `content/` (bez importu
  przez Vite, bezpośrednio `fs.readdirSync`/`JSON.parse`), parsuje przez te
  same schematy Zod co aplikacja, sprawdza krzyżowe odwołania i pliki
  obrazków/audio. Zero zależności od `src/data/content.ts`, więc nie
  wymaga builda Vite, żeby zadziałać.
- **`import-lesson.ts`** — rozpakowuje DOCX ręcznie (biblioteka `fflate` do
  ZIP, ręczny parser `word/document.xml` przez wyrażenia regularne — DOCX
  to w środku XML, nie trzeba do tego pełnego parsera XML). Wypisuje
  heurystycznie wykryte słówka/dialog/obrazki do `content/drafts/`, **nigdy
  bezpośrednio do `content/lessons/`** — patrz README, sekcja „Jak dodać
  Bài 12”.

Oba skrypty są uruchamiane przez `tsx` (TypeScript bez kompilacji do JS) w
trybie ESM — stąd `fileURLToPath(import.meta.url)` zamiast `__dirname`
(które nie istnieje w natywnych modułach ESM Node).

## Testy (`tests/`)

Jeden plik na moduł silnika, plus `content.test.ts` (schemat + unikalność id
+ ciągłość numeracji, uruchamiane na prawdziwej zawartości `content/`, nie
na fixture'ach). Najważniejsze przypadki brzegowe pokryte celowo:

- `vietnamese.test.ts` — normalizacja, wykrywanie tonu, że tony nigdy nie
  są cicho ignorowane, dopasowywanie wzorców `{x}`.
- `srs.test.ts` — wzrost/spadek interwału dla każdej z 4 ocen, próg
  „dojrzały” w `masteryLevel`.
- `grading.test.ts` — każdy typ ćwiczenia, klasyfikacja „spelling” vs
  „vocabulary”, generatory są deterministyczne dla tego samego ziarna.
- `exam.test.ts` — próbka egzaminu ma żądaną liczbę pytań, rozkłada się po
  lekcjach, spełnia `minProductionShare`, jest odtwarzalna dla ziarna.
- `session.test.ts` — regresja na realny błąd znaleziony podczas ręcznego
  testowania (`buildSession` crashował na błędzie typu `tone-identify` w
  zeszycie błędów, bo silnik zgadywał generator z rozbioru napisu `ref`
  zamiast trzymać go jawnie w rekordzie błędu).
- `state.test.ts` — reducer, round-trip przez `localStorage`, eksport/import,
  scalanie powtórzonego błędu, próg 80% w checkpointach.
- `blocks.test.ts` — bloki po 5 lekcji wyliczają się poprawnie z dowolnej
  listy numerów lekcji, w tym z dziurami.

## Znane kompromisy / co warto poprawić w przyszłości

- **Jeden bundle JS** (~525 kB / ~152 kB gzip) — Vite ostrzega przy
  buildzie. Dla obecnego zakresu (11 lekcji) czas ładowania jest akceptowalny;
  przy dalszym rozroście warto rozważyć `React.lazy` per trasa.
- **Brak Error Boundary** wokół `<Outlet />` — nieobsłużony wyjątek w
  jednej stronie aktualnie bieli cały ekran zamiast pokazać komunikat.
  Podczas budowy aplikacji znaleziono i naprawiono jeden taki przypadek
  (patrz `session.test.ts`), ale generyczna siatka bezpieczeństwa by się
  przydała.
- **Stare formy tonów** (np. „khoẻ” vs „khỏe” — różne, historycznie
  poprawne umiejscowienie znaku tonu w dyftongach) nie są ze sobą
  utożsamiane przez `matchVietnamese` — to świadoma decyzja (to naprawdę
  różne zapisy, nie warianty Unicode tego samego znaku), udokumentowana
  testem, ale użytkownik piszący „starym stylem” dostanie `wrong` zamiast
  `tone`. Do rozważenia: osobna tabela wariantów ortograficznych.
