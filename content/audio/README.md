# Nagrania audio

W lekcjach z DOCX nie ma żadnych nagrań. Ten katalog opisuje, jak dodać
prawdziwe nagrania nauczycielki lub native speakera.

1. Wgraj plik `.mp3` / `.m4a` do `public/audio/<lekcja>/<nazwa>.mp3`,
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

`targetId` może wskazywać słówko (`v-…`), linię dialogu (`d-…#3`, gdzie 3 to
indeks linii) albo czytankę (`r-…`). Pole `verified` ustaw na `true` tylko, gdy
nagranie pochodzi od nauczycielki / native speakera.

3. Uruchom `npm run validate-content` – sprawdzi, czy `targetId` istnieje
   i czy plik jest w `public/audio`.

Aplikacja pokazuje przycisk odtwarzania obok elementu, dla którego istnieje
klip. Syntezator mowy przeglądarki (TTS) jest osobną, wyraźnie oznaczoną
opcją i nigdy nie zastępuje nagrań.
