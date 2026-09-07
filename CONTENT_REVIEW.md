# Przegląd treści językowej

Ten dokument spisuje wszystkie wątpliwe formy, literówki i uproszczenia
znalezione w materiale nauczycielki (`source-lessons/*.docx`, **wyłącznie do
odczytu, nigdy nie modyfikowane**) podczas przenoszenia go do
`content/lessons/*.json`. Każda pozycja ma: lekcję, formę oryginalną,
proponowaną formę (jeśli jest), uzasadnienie i status weryfikacji.

**Nikt inny niż nauczycielka / native speaker nie powinien być traktowany
jako ostateczne źródło prawdy dla pozycji NEEDS TEACHER VERIFICATION.** Do
tego czasu aplikacja:

- pokazuje przy takich elementach żółty znacznik „⚠ do weryfikacji”,
- **nie wybiera ich do egzaminów** (`eligibleForExam` w `src/learning/exam.ts`),
- nie wprowadza ich cicho do spaced repetition jako jedynego poprawnego
  klucza bez ostrzeżenia (zobacz pole `flagged` na wpisach w Moich błędach).

Legenda statusów:

- **CONFIRMED TYPO** — jednoznaczna literówka (brakujący/zły znak
  diakrytyczny, przestawione litery). Poprawiono cicho w ustrukturyzowanej
  treści (z notatką `note` w JSON-ie), oryginał zostaje niezmieniony w
  sekcji „Materiał nauczycielki” każdej lekcji.
- **LIKELY ISSUE** — forma odbiega od standardowego języka na tyle wyraźnie
  (słownikowo, gramatycznie), że prawdopodobnie jest błędem, ale nie na tyle
  oczywiście, by poprawiać ją bez pytania. Oznaczono `status: "flagged"`
  albo notatką, oryginał **nie jest** cicho zamieniany.
- **NEEDS TEACHER VERIFICATION** — może być celowym uproszczeniem
  dydaktycznym, regionalizmem albo stylem nauczycielki; wymaga potwierdzenia
  osoby znającej program kursu.

## 1. Literówki (CONFIRMED TYPO)

| Lekcja | Oryginał | Poprawiona forma | Gdzie w aplikacji |
|---|---|---|---|
| Bài 5 (w tabeli słówek) | `nhge` | `nghe` (słuchać) | Tylko w „Materiał nauczycielki” (werbatym); ustrukturyzowane słówko `v-bai-05-nghe` używa poprawnej pisowni od razu. |
| Bài 7 (ćwiczenie „Em gái làm gì?”) | „Em gái nghe ngạc” | „Em gái nghe nhạc” | `e-bai-07-pic-1` — poprawiona forma jako klucz, z notatką o literówce w `explanation`. |
| Bài 7 (dialog) | „Bạn muốn đi quán ăn **vời** mình không?” | „…**với** mình…” | `d-bai-07-weekend`, linia A — poprawione z notatką `note` na linii. |
| Bài 8 (dialog, 2×) | „**Văng**, 150 000 đồng” | „**Vâng**, 150 000 đồng” | `d-bai-08-restaurant` — poprawione z notatką. Ten sam błąd (brak znaku nosowego â→ă) występuje też w oryginałach Bài 5 i Bài 9, ale tam nie trafił do żadnego gradowanego elementu — zostaje tylko w „Materiał nauczycielki”. |
| Bài 10 (tabela słówek) | `beo` | `béo` (gruby) — brak znaku sắc | `v-bai-10-beo`. |
| Bài 10 (tabela słówek) | `gấy` | `gầy` (chudy) — zły znak (sắc zamiast huyền) | `v-bai-10-gay`. |
| Bài 11 (tabela słówek) | `lến` | `lên` (w górę) — nadmiarowy znak sắc | `v-bai-11-len`. |
| wszystkie pliki | Nazwa pliku „bái N” zamiast „bài N” | — | **Nie poprawiane.** Nazwy plików DOCX nigdy nie są zmieniane (wymóg „source-lessons pozostaje read-only”); to dotyczy tylko nazw plików, nie treści lekcji. |

## 2. Formy językowe do weryfikacji (LIKELY ISSUE)

| Lekcja | Oryginał | Uwaga | Status w aplikacji |
|---|---|---|---|
| Bài 2 | „Bạn tên là Anna **không**?” (pytanie o to, czy ktoś ma na imię Anna) | W standardowym języku pytanie potwierdzające o konkretną wartość częściej brzmi „…**phải không**?”. Forma z samym „không” jest w tym kontekście niejednoznaczna (może być odczytana jak pytanie o zaprzeczenie całego zdania). | Notatka na przykładzie w `g-bai-02-khong-question` i na linii dialogu `d-bai-02-greeting`. |
| Bài 3 | „Em là người Ba Lan **không**?” | Jak wyżej — podręcznikowa forma to „Em **có phải là** người Ba Lan không?”. | Notatka na przykładzie w `g-bai-03-nationality`. |
| Bài 3 | 21 = „hai mươi một” (materiał nie podaje „mốt”) | Standardowo liczby 21, 31, 41… kończą się na „mốt”, nie „một” (np. hai mươi **mốt**). Forma „một” bywa też używana, więc to nie jest błąd, tylko niepełny obraz. | Generator liczb (`src/learning/numbers.ts`) akceptuje obie formy i pokazuje wyjaśnienie; materiał lekcji zostaje bez zmian. |
| Bài 5 | „Bạn **sinh ra** năm bao nhiêu?” | Częstsza forma pytania o rok urodzenia to „Bạn **sinh** năm bao nhiêu?” (bez „ra”); „sinh ra” częściej znaczy „urodzić się” w sensie ogólnym/opisowym. | `v-bai-05-sinh-ra`, przykład oznaczony `flagged`; ćwiczenie `e-bai-05-teacher-qa-born` akceptuje obie formy. |
| Bài 7 | „Không phải, hôm nay là thứ Bảy…” (odpowiedź na „Idziesz dzisiaj do pracy?”) | Na pytanie o czynność („czy robisz X?”) naturalniejsza krótka odpowiedź przecząca to „Không”, bez „phải” (które neguje rzeczownik/tożsamość, nie czynność). | Notatka na linii dialogu `d-bai-07-weekend`. |
| Bài 7 | „**Ăn sau**, chúng mình sẽ đi quán cà phê không?” | Prawdopodobnie miało być „**Sau khi ăn**” (po jedzeniu) — „ăn sau” samo w sobie czytelnie znaczy raczej „zjeść później”. | Notatka na linii dialogu. |
| Bài 8 | „**mắt tiền**” (gotówka) — w słowniczku i w dialogu | Standardowo „**tiền mặt**” (przestawiona kolejność członów złożenia). | `v-bai-08-tien-mat` ma `status: "flagged"` i jest wyłączone z SRS (`srs: false`); linia dialogu oznaczona. |
| Bài 9 | „trưa” = „wczesnym popołudniem” w słowniczku | „trưa” to raczej pora **południowa** (ok. 11:00–13:00), nie wczesne popołudnie — to ostatnie bliżej „chiều”. | Notatka na `v-bai-09-trua`. |
| Bài 9 | „thường (thường)” = „często” | „thường” samo w sobie znaczy raczej „zwykle”; „często” to bliżej „thường xuyên”. Drobna nieścisłość glosy. | Notatka na `v-bai-09-thuong`. |
| Bài 9, czytanka „Một tuần của tôi” | „Thường **cho** ăn sáng tôi ăn bánh mì.” / „**Sau** ăn sáng, tôi đi làm việc.” / „Tôi 7 giờ tối thường ăn tối…” | Brzmi jak kalka: brak „lúc” przed godziną zegarową (którego materiał w ogóle nie wprowadza), „cho” w tym miejscu jest nietypowe, a szyk „Tôi 7 giờ tối” z pominiętym „lúc” jest niestandardowy. | Czytanka `r-bai-09-mot-tuan` ma `status: "flagged"` i zbiorczą notatkę; treść zostaje niezmieniona. |
| Bài 10 | „ngắn” = „niski (wg lekcji); krótki” | „ngắn” to standardowo „krótki” (o długości), nie „niski” (o wzroście — to „thấp” / „lùn”). | `v-bai-10-ngan`, `status: "flagged"`. |
| Bài 10 | „không đẹp quá” podane jako = „niezbyt ładny” | Materiał podaje zarówno „không đẹp lắm”, jak i „không đẹp quá” jako „niezbyt”; w standardzie „không … quá” częściej czyta się dosłowniej („nie za bardzo/nie aż tak”), a nie jako pełny synonim „lắm”. Subtelna różnica, nie sprostowana w treści — tylko odnotowana w wyjaśnieniu gramatyki. | Wzmianka w `g-bai-10-rat-qua-lam`. |
| Bài 10 | „cư tê” = „cute (gen z slang)” | Pisownia fonetyczna angielskiego slangu — nietypowa, może być błędnym zapisem innego wyrażenia. | `v-bai-10-cu-te`, `status: "flagged"`, wyłączone z SRS. |
| Bài 11 | „(**mắt** trước)” w tabeli przyimków | Najprawdopodobniej literówka za „(**mặt**) trước” (przód) albo miało być „phía trước”. Zaklasyfikowane jako LIKELY ISSUE, nie CONFIRMED TYPO, bo nie da się jednoznacznie rozstrzygnąć, którą z dwóch standardowych form (mặt trước / phía trước) nauczycielka miała na myśli. | `v-bai-11-truoc`, `status: "flagged"`. |
| Bài 11 | „người ngoài” = „obcokrajowiec” | Standardowo „obcokrajowiec” to „người **nước** ngoài”; „người ngoài” bez „nước” znaczy „osoba z zewnątrz/obca” (niekoniecznie z innego kraju). | `v-bai-11-nguoi-ngoai`, `status: "flagged"`, wyłączone z SRS. |
| Bài 11 | „Con chó ngủ ở con mèo bên cạnh” oraz odpowiedź ćwiczeniowa „cái ghế ở cái bàn bên trên” | Nietypowy szyk — przyimek położenia stoi PO rzeczowniku odniesienia zamiast przed nim; oczekiwany szyk to „ở (bên) cạnh con mèo” / „ở (bên) trên cái bàn”. | Przykład w `g-bai-11-position` oznaczony `flagged`; ćwiczenia generowane w aplikacji używają oczekiwanego (poprawnego) szyku, nie kopiują tej konstrukcji. |

## 3. Do weryfikacji przez nauczyciela (NEEDS TEACHER VERIFICATION)

| Lekcja | Fragment | Pytanie do rozstrzygnięcia |
|---|---|---|
| Bài 6, czytanka „Gia đình của tôi” | „Chỉ thứ sáu và chủ nhật, chị ấy xem phim với chúng tôi, **vì vậy** làm việc rất nhiều.” | „vì vậy” znaczy „dlatego” (skutek), ale sens zdania jest przyczynowy („bo dużo pracuje, tylko w piątki/niedziele ogląda z nami filmy”) — brzmi jak miało być „**vì**” (ponieważ). Zamieniono by kierunek związku przyczynowego w zdaniu. |
| Powtórka 1–5, czytanka „Tuyết” | „Tuyết có **một Anh** và một em gái.” | Wielka litera w „Anh” sugeruje literówkę zamiast „anh (trai)” (starszy brat) — ale równie dobrze mogło to być inne słowo/skrót zamierzony przez nauczycielkę. Treść niezmieniona, tylko odnotowana. |
| Powtórka 1–5 | „**Anh em** hai mươi lăm tuổi.” (zdanie do tłumaczenia z polskiego kontekstu nieznanego) | Bez szerszego kontekstu zdanie jest wieloznaczne: „mój (starszy) brat ma 25 lat” czy „rodzeństwo (anh em jako zbiorowe) ma 25 lat” (mniej prawdopodobne przy liczbie pojedynczej czasownika). Przyjęto pierwszą interpretację w kluczu do nauki, oznaczając ćwiczenie jako wymagające weryfikacji. |
| Powtórka 1–5, ćwiczenie „Przeczytaj: 1004” | Materiał nie wprowadza słowa „linh” / „lẻ” (czytanie zera w pozycji dziesiątek), a zadanie każe przeczytać liczbę, która go wymaga. | Czy nauczycielka planowała wprowadzić „linh/lẻ” osobno, czy to nadzorowany błąd w doborze ćwiczenia? Klucz w aplikacji podaje formę z „linh” i „lẻ” jako warianty, z wyraźnym zastrzeżeniem. |
| Bài 1 | Opis głoski „ă” jako „a” przedłużające głoskę następującą | W standardowych opisach fonetyki wietnamskiej „ă” to **krótka** samogłoska /a/ (przeciwieństwo „przedłużania”) — możliwe uproszczenie dydaktyczne nauczycielki albo nieprecyzyjne sformułowanie w notatkach. Nie zmieniano opisu (jest cytatem z materiału), tylko odnotowano wątpliwość tutaj. |

## 4. Elementy celowo pominięte lub oznaczone poza powtórkami

- **Bài 8**: „một con đì” (żartobliwe/wulgarne wyrażenie z oryginalnej tabeli
  klasyfikatorów) — pominięte w ustrukturyzowanym słownictwie. Zostaje
  wyłącznie w sekcji „Materiał nauczycielki” (werbatym), nie trafia do bazy
  słówek ani do SRS.
- **Bài 6**: żartobliwa/potencjalnie krzywdząca dopowiedź przy „không có”
  („bo jestem gejem”) — zachowana **tylko** w werbatym „Materiał
  nauczycielki” (bo tam nic się nie usuwa), pominięta w ustrukturyzowanym
  wyjaśnieniu gramatyki `g-bai-06-roi-chua`.
- **Bài 10, 11**: słówka oznaczone `srs: false` (`cư tê`, `mắt tiền`,
  `người ngoài`) — widoczne w bazie słownictwa i w lekcji, ale nie
  generują kart powtórkowych, dopóki forma nie zostanie potwierdzona.

## 5. Literówki i nieścisłości po stronie polskiej

Materiał nauczycielki miejscami zawiera też polskie literówki/niekonsekwencje
(np. „Wrzeń” zamiast „Wrzesień” w Bài 4, „bố (pł.)” jako skrót od „północ”,
„jesc”/„pic” bez polskich znaków w Bài 5). Są one przepisane wiernie w
sekcji „Materiał nauczycielki”, natomiast w ustrukturyzowanym tłumaczeniu
polskim (`pl`) użyto poprawnej polszczyzny — te miejsca nie są odrębnie
numerowane w tym dokumencie, bo dotyczą tylko strony polskiej, nie treści
językowej do nauki wietnamskiego.

## Jak dopisać kolejną pozycję

Przy imporcie nowej lekcji (`npm run import-lesson`, zobacz README) albo przy
ręcznym uzupełnianiu treści:

1. Jeśli coś wygląda jak literówka i jesteś **pewna/pewien** poprawnej formy
   (brakujący/zły znak diakrytyczny, oczywista pomyłka klawiszowa) — popraw
   w polach `vi`/tekście ustrukturyzowanym, dodaj `"note"` z dopiskiem
   „CONFIRMED TYPO” i wpisz wiersz w sekcji 1 tego pliku.
2. Jeśli forma odbiega od standardu, ale mogła być zamierzona — ustaw
   `"status": "flagged"` na tym elemencie (słówko, przykład, linia dialogu,
   ćwiczenie…), zostaw oryginalną treść i dopisz wiersz w sekcji 2.
3. Jeśli nie potrafisz ocenić bez kontekstu kursu — dopisz wiersz w sekcji 3
   i rozważ `"status": "flagged"`, żeby element nie trafiał do egzaminów.
4. Uruchom `npm run validate-content` — sprawdzi poprawność struktury (nie
   poprawność językową, tę ocenia tylko człowiek).
