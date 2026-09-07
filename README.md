# Tiếng Việt — nauka wietnamskiego

Aplikacja do nauki wietnamskiego zbudowana na podstawie prawdziwych lekcji
(Bài 1–11 i powtórki 1–5) w formacie notatek kursowych + aktywnego
przypominania + spaced repetition (jak Anki) + ćwiczeń interaktywnych +
egzaminów + zeszytu błędów. Wszystko działa lokalnie w przeglądarce, bez
serwera i bez konta — postęp zapisuje się na urządzeniu.

Ten plik jest napisany dla osoby, która **nie musi znać programowania**, żeby
uruchomić aplikację, dodać nową lekcję albo poprawić literówkę. Jeśli
potrzebujesz szczegółów technicznych, zobacz [ARCHITECTURE.md](ARCHITECTURE.md)
(jak to jest zbudowane), [CONTENT_SCHEMA.md](CONTENT_SCHEMA.md) (dokładny
format plików lekcji) i [CONTENT_REVIEW.md](CONTENT_REVIEW.md) (lista
wątpliwych form językowych z materiału nauczycielki).

## Ważna zasada

**`source-lessons/` nigdy nie jest modyfikowane.** To są oryginalne pliki
Word od nauczycielki — aplikacja je tylko czyta (a właściwie: nawet nie to —
czyta się je raz, ręcznie albo skryptem importu, a wynik zapisuje się jako
osobne pliki w `content/`). Nie usuwaj, nie zmieniaj nazw, nie edytuj niczego
w `source-lessons/`.

## Spis treści

1. [Jak uruchomić stronę lokalnie](#1-jak-uruchomić-stronę-lokalnie)
2. [Jak dodać nową lekcję (ręcznie)](#2-jak-dodać-nową-lekcję-ręcznie)
3. [Jak zaimportować DOCX (np. Bài 12)](#3-jak-zaimportować-docx-np-bài-12)
4. [Jak zweryfikować wygenerowaną treść](#4-jak-zweryfikować-wygenerowaną-treść)
5. [Jak dodać nagranie audio](#5-jak-dodać-nagranie-audio)
6. [Jak poprawić błąd w istniejącej treści](#6-jak-poprawić-błąd-w-istniejącej-treści)
7. [Jak zbudować wersję produkcyjną](#7-jak-zbudować-wersję-produkcyjną)
8. [Jak opublikować na GitHub Pages](#8-jak-opublikować-na-github-pages)
9. [Jak eksportować/importować swój postęp](#9-jak-eksportowaćimportować-swój-postęp)
10. [Struktura projektu w skrócie](#10-struktura-projektu-w-skrócie)
11. [Rozwiązywanie problemów](#11-rozwiązywanie-problemów)

---

## 1. Jak uruchomić stronę lokalnie

Potrzebujesz [Node.js](https://nodejs.org) (wersja 20 lub nowsza) i npm
(instaluje się razem z Node.js).

```bash
npm install
npm run dev
```

Terminal pokaże adres, zwykle `http://localhost:5173` — otwórz go w
przeglądarce. Strona przeładowuje się automatycznie po każdej zmianie pliku.

Żeby zatrzymać serwer: `Ctrl+C` w terminalu.

## 2. Jak dodać nową lekcję (ręcznie)

Jeśli nie masz pliku DOCX albo wolisz wpisać treść od razu w finalnej
postaci (np. dla krótkiej lekcji), utwórz plik `content/lessons/bai-12.json`
na wzór istniejących lekcji (np. `content/lessons/bai-11.json` — skopiuj go
i zmień zawartość). Dokładny opis każdego pola jest w
[CONTENT_SCHEMA.md](CONTENT_SCHEMA.md).

Minimalny szkielet:

```json
{
  "id": "bai-12",
  "number": 12,
  "title": "Tytuł po polsku",
  "titleVi": "Bài 12",
  "summary": "Jedno zdanie streszczenia na kartę lekcji.",
  "icon": "🎓",
  "sourceFile": "source-lessons/bái 12.docx",
  "objectives": ["Po tej lekcji potrafię…"],
  "vocabulary": [],
  "grammar": [],
  "dialogues": [],
  "readings": [],
  "pronunciation": [],
  "images": [],
  "exercises": [],
  "checkpoint": [],
  "reviewLinks": [],
  "original": []
}
```

Po zapisaniu pliku uruchom:

```bash
npm run validate-content
```

Skrypt powie dokładnie, czego brakuje albo co jest źle sformatowane (np. złe
id, brakujący klucz odpowiedzi, odwołanie do nieistniejącego słówka).
Lekcja 12 **automatycznie** pojawi się w menu, w bloku 11–15 i w bazie
słownictwa/gramatyki — nie trzeba nic więcej zmieniać.

## 3. Jak zaimportować DOCX (np. Bài 12)

Jeśli masz gotowy plik Worda od nauczycielki:

```bash
npm run import-lesson -- "source-lessons/bái 12.docx"
```

(Numer lekcji skrypt odgadnie z nazwy pliku; możesz też wymusić go ręcznie:
`npm run import-lesson -- "source-lessons/bái 12.docx" --number 12`.)

To **nie publikuje** lekcji automatycznie. Skrypt:

1. Otwiera DOCX **tylko do odczytu** (nic w `source-lessons/` się nie zmienia).
2. Wyciąga akapity, nagłówki, tabele, obrazki i próbuje rozpoznać pary
   słówek („wietnamski - polski”) oraz linie dialogu.
3. Zapisuje wynik jako **szkic**:
   - `content/drafts/bai-12.draft.json` — dane w formacie lekcji, ale z
     `"draft": true` i wieloma polami do uzupełnienia ręcznie (gramatyka,
     cele, streszczenie — tego skrypt nie potrafi sam wymyślić sensownie).
   - `content/drafts/bai-12.extracted.md` — czytelny podgląd tego, co
     skrypt znalazł, plus lista „Do zrobienia przed publikacją”.
   - Obrazki z dokumentu trafiają do `public/images/lessons/bai-12/`.

**Żaden wygenerowany klucz odpowiedzi nie jest publikowany bez przeglądu.**
Zanim lekcja stanie się dostępna w aplikacji:

1. Otwórz `content/drafts/bai-12.extracted.md` i porównaj z oryginalnym
   dokumentem — sprawdź, czy słówka i dialog zostały rozpoznane poprawnie.
2. Popraw `content/drafts/bai-12.draft.json`: dopisz `summary`,
   `objectives`, opisz `grammar` (skrypt tego nie robi — gramatyka wymaga
   zrozumienia treści, nie samej ekstrakcji tekstu), dodaj tłumaczenia do
   dialogów/czytanek, zamień prowizoryczne `exercises` na właściwe zadania.
3. Wątpliwe formy językowe dopisz do [CONTENT_REVIEW.md](CONTENT_REVIEW.md)
   (zobacz sekcję 6 poniżej).
4. Usuń `"draft": true` i przenieś plik: `content/drafts/bai-12.draft.json`
   → `content/lessons/bai-12.json`.
5. `npm run validate-content` — popraw wszystko, co zgłosi.

## 4. Jak zweryfikować wygenerowaną treść

Trzy niezależne sita, wszystkie warto uruchomić przed uznaniem lekcji za
gotową:

```bash
npm run validate-content   # struktura: id, odwołania, kompletność pól
npm run typecheck           # czy dane pasują do typów TypeScript
npm test                     # testy silnika nauki (nie sprawdzają treści lekcji,
                              # ale muszą przechodzić, żeby aplikacja działała)
```

Albo wszystko naraz plus build produkcyjny:

```bash
npm run check
```

Żadne z powyższych **nie sprawdza poprawności językowej** — to musi ocenić
człowiek znający wietnamski (najlepiej nauczycielka albo native speaker).
Dlatego każde ćwiczenie ma pole `source` (`"teacher"` = z dokumentu,
`"generated"` = wygenerowane do nauki) i `status` (`"verified"` /
`"unverified"` / `"flagged"`) widoczne w aplikacji jako kolorowe znaczniki —
zobacz [CONTENT_SCHEMA.md](CONTENT_SCHEMA.md#pole-status).

## 5. Jak dodać nagranie audio

W materiałach od nauczycielki **nie ma żadnych nagrań** — cały mechanizm
audio w aplikacji istnieje po to, żebyś mogła/mógł dodać je później, kiedy
będą dostępne (np. nagrania z lekcji albo od native speakera). Aplikacja
**nigdy nie generuje ani nie udaje** nagrań natywnych — jedyna sztuczna
wymowa to opcjonalny syntezator mowy przeglądarki, wyraźnie oznaczony jako
„🤖 Syntezator (niezweryfikowany)” i domyślnie wyłączony (włącza się w
Ustawieniach na stronie Postęp albo w zakładce Tony i słuchanie → Audio).

Żeby dodać prawdziwe nagranie:

1. Wgraj plik `.mp3` lub `.m4a` do `public/audio/<lekcja>/<nazwa>.mp3`,
   np. `public/audio/bai-01/xin-chao.mp3`.
2. Dopisz wpis do `content/audio/manifest.json`:

   ```json
   {
     "targetId": "v-bai-01-xin-chao",
     "file": "bai-01/xin-chao.mp3",
     "dialect": "north",
     "speaker": "nauczycielka (Hanoi)",
     "source": "nagranie z zajęć 2026-09",
     "lesson": "bai-01",
     "verified": true
   }
   ```

   `targetId` może wskazywać słówko (`v-...`), konkretną linię dialogu
   (`d-...#3`, gdzie `3` to numer linii licząc od zera) albo czytankę
   (`r-...`). Ustaw `"verified": true` tylko wtedy, gdy nagranie faktycznie
   pochodzi od nauczycielki/native speakera.
3. `npm run validate-content` sprawdzi, że plik istnieje i że `targetId`
   wskazuje coś, co naprawdę jest w treści.

Pełna instrukcja i przykłady: [content/audio/README.md](content/audio/README.md).

## 6. Jak poprawić błąd w istniejącej treści

- **Literówka, którą jesteś pewna/pewien** (zła/brakująca litera, zły
  znak tonu): popraw w odpowiednim pliku `content/lessons/*.json`, dodaj
  krótką notatkę `"note": "W oryginale «X» — CONFIRMED TYPO."` i dopisz
  wiersz w sekcji 1 [CONTENT_REVIEW.md](CONTENT_REVIEW.md). **Nie zmieniaj**
  odpowiadającego fragmentu w polu `"original"` tej samej lekcji — to ma
  zostać wiernym zapisem dokumentu.
- **Forma wątpliwa, ale nie oczywisty błąd**: ustaw na elemencie
  `"status": "flagged"` zamiast go zmieniać. Taki element dostaje w
  aplikacji żółty znacznik „⚠ do weryfikacji”, nigdy nie trafia do
  egzaminu i (dla słówek) można go dodatkowo wyłączyć z powtórek przez
  `"srs": false`. Dopisz wiersz w sekcji 2 lub 3 CONTENT_REVIEW.md.
- Zawsze kończ przez `npm run validate-content`.

## 7. Jak zbudować wersję produkcyjną

```bash
npm run build
```

To po kolei: waliduje treść, sprawdza typy, buduje statyczne pliki do
`dist/`. Podejrzeć wynik lokalnie (dokładnie tak, jak zobaczy go
przeglądarka na serwerze):

```bash
npm run preview
```

## 8. Jak opublikować na GitHub Pages

Repozytorium ma gotowy workflow (`.github/workflows/deploy.yml`), który przy
każdym push na `main` automatycznie: instaluje zależności, waliduje treść,
sprawdza typy, uruchamia testy, buduje i publikuje stronę pod GitHub Pages.

Jednorazowe kroki, jeśli projekt nie jest jeszcze w repozytorium Git:

```bash
git init
git add -A
git commit -m "Pierwsza wersja aplikacji do nauki wietnamskiego"
```

Następnie na GitHub:

1. Utwórz puste repozytorium (bez README/licencji — masz już swoje pliki).
2. Podłącz je lokalnie i wypchnij:

   ```bash
   git remote add origin https://github.com/<twoj-login>/<nazwa-repo>.git
   git branch -M main
   git push -u origin main
   ```

3. W ustawieniach repozytorium na GitHubie: **Settings → Pages → Build and
   deployment → Source: GitHub Actions**. (Wystarczy zrobić to raz —
   workflow jest już w repo.)
4. Po pierwszym pushu zakładka **Actions** pokaże przebieg wdrożenia. Po
   zakończeniu adres strony to `https://<twoj-login>.github.io/<nazwa-repo>/`.

Ścieżka bazowa (`/nazwa-repo/`) jest wyliczana automatycznie w workflow z
nazwy repozytorium — nie trzeba niczego ręcznie ustawiać w kodzie. Wyjątek:
jeśli repozytorium nazywa się dokładnie `<twoj-login>.github.io` (strona
główna konta), workflow sam wykrywa ten przypadek i używa `/` zamiast
`/nazwa-repo/`.

Każda kolejna zmiana: `git add -A && git commit -m "..." && git push` —
strona zaktualizuje się automatycznie po przejściu wszystkich sprawdzeń.
Jeśli walidacja, typy albo testy nie przejdą, publikacja się **nie odbędzie**
— to zamierzone zabezpieczenie przed wrzuceniem zepsutej wersji.

## 9. Jak eksportować/importować swój postęp

Postęp (ukończone lekcje, harmonogram powtórek, błędy, historia egzaminów)
jest zapisany **tylko w przeglądarce** (localStorage) — nie synchronizuje
się między urządzeniami ani między osobami. Osoba, która otworzy publiczny
link do Twojej strony, zaczyna od zera we własnej przeglądarce.

Żeby przenieść postęp na inne urządzenie albo zrobić kopię zapasową: strona
**Postęp** → przycisk **„Exportuj postęp”** pobiera plik `.json`. Na drugim
urządzeniu: **Postęp** → **„Importuj postęp”** → wybierz ten plik. Import
**zastępuje** obecny postęp w tej przeglądarce (aplikacja prosi o
potwierdzenie przed nadpisaniem).

## 10. Struktura projektu w skrócie

```
source-lessons/    oryginalne DOCX — tylko do odczytu
content/            treść lekcji, powtórek i egzaminów (JSON)
src/                kod aplikacji (React + TypeScript)
scripts/            npm run validate-content / import-lesson
tests/              testy silnika nauki (vitest)
public/             obrazki z lekcji i (docelowo) nagrania audio
```

Szczegóły: [ARCHITECTURE.md](ARCHITECTURE.md).

## 11. Rozwiązywanie problemów

- **`npm run dev` nic nie pokazuje / błąd w terminalu** — sprawdź, czy
  `npm install` zakończyło się bez błędów, i czy masz Node.js 20+
  (`node --version`).
- **Strona na GitHub Pages jest pusta / błędy 404 w konsoli** — najpewniej
  workflow wdrożenia nie ukończył się poprawnie (zakładka Actions na
  GitHubie pokaże, na którym kroku). Częsta przyczyna: treść nie przeszła
  `validate-content` — napraw błąd lokalnie, zacommituj, wypchnij ponownie.
- **Dodałam/em lekcję, a nie widać jej w menu** — sprawdź, czy numeracja
  lekcji jest ciągła (nie może być np. Bài 1, 2, **4** bez Bài 3) i czy plik
  nazywa się dokładnie tak jak `id` w środku (`bai-04.json` dla
  `"id": "bai-04"`). `npm run validate-content` to wykryje.
- **Chcę zacząć naukę od nowa** — strona Postęp → „Wyzeruj postęp” (poprosi
  o potwierdzenie, bo to nieodwracalne w tej przeglądarce — rozważ eksport
  najpierw).
