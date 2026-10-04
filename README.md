# Teriash Addons

Struktura repozytorium przygotowana pod jeden loader Tampermonkey i osobne moduły.

## Ważne przed wrzuceniem
Loader zakłada repozytorium:
`https://github.com/Teriash/teriash-addons`

Jeśli repo ma inną nazwę, zmień `BASE`, `@updateURL` i `@downloadURL`
w `teriash-addons.user.js`.

## Pliki
- `teriash-addons.user.js` — jedyny plik instalowany w Tampermonkey
- `manifest.json` — lista modułów
- `core/panel.js` — panel i loader modułów
- `core/panel.css` — wygląd panelu
- `addons/legendary-pulse.js`
- `addons/player-labels.js`
- `addons/deputy-timer.js`

## Uwaga
Legendary Pulse zachowuje dotychczasowe klucze ustawień.
Player Labels i Deputy Timer zostały dołączone jako moduły w obecnej postaci.
Dla tych dwóch wyłączenie może wymagać odświeżenia strony, dopóki nie dostaną
pełnych metod start/stop.


## v1.0.4
Ładowanie plików bez cache bezpośrednio z GitHub RAW przez GM_xmlhttpRequest. Poprawione przeciąganie pointer events oraz przełączanie ustawień Legendary Pulse.


## v1.0.5
Panel Teriash Addons uruchamia się wyłącznie po wykryciu właściwego widoku gry Margonem. Na stronie głównej, logowaniu i innych stronach portalu przycisk TA nie jest tworzony.


## v1.1.0
Dodano moduł **Klanowicze Online**. Pokazuje osoby online na podstawie `Engine.clan.getMemberList()`, wraz z nickiem, poziomem, profesją, outfitem i lokalizacją. W ustawieniach można osobno wyłączyć outfit oraz mapę i koordynaty.


## v1.1.1
Klanowicze Online v1.0.1: moduł sam wywołuje natywne `_g("clan&a=members")`, więc nie wymaga ręcznego otwierania okna Klany. Outfit jest rozwiązywany przez `Engine.interface.getUrl()` zamiast bezpośredniej ścieżki z danych członka.


## v1.1.3
- Klanowicze Online: poprawione wyświetlanie outfitów jako sprite 32 px.
- Outfit jest kadrowany do górnych 24 px pierwszej klatki 32x48 (od pasa w górę).
