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


## v1.1.4
- Klanowicze Online: usunięto informację pomocniczą z ustawień.
- Lokalizacja ma teraz dwa tryby: dokładna pozycja (mapa + X,Y) albo tylko mapa.
- Tryby lokalizacji są wzajemnie wykluczające; można też wyłączyć oba.

## v1.1.5
- Klanowicze Online: bardziej kompaktowe okno.
- Zmniejszone odstępy między outfitem, nickiem, poziomem i lokalizacją.
- Mniejszy nagłówek i padding wierszy.

## v1.1.6
- Klanowicze Online: okno można dowolnie rozszerzać i zwężać, przeciągając prawy dolny róg.
- Szerokość i wysokość okna są zapamiętywane po odświeżeniu gry.
- Lista automatycznie dopasowuje się do ustawionej wysokości i dostaje przewijanie, gdy brakuje miejsca.

## v1.1.7
- Klanowicze Online: jeszcze mniejsze odstępy między outfitem, nickiem, poziomem i lokalizacją.
- Paski przewijania są ciemne i dopasowane do stylistyki okna.

## v1.1.8
- Klanowicze Online: listę można przewijać kółkiem myszy po najechaniu na okno.
- Scroll jest przechwytywany przez listę, więc nie powinien przewijać/zoomować elementów gry pod oknem.

## v1.1.9
- Klanowicze Online: zmniejszono minimalny dozwolony rozmiar okna.
- Minimalna szerokość: 210 px.
- Minimalna wysokość: 75 px.

## v1.2.0
- Usunięto zbędne komunikaty diagnostyczne z konsoli.
- Klanowicze Online: naprawiono wielokrotne opakowywanie `Engine.communication.parseJSON`.
- Dodano blokadę jednego aktywnego zapytania `clan&a=members` naraz.
- Podczas przelogowania dodatek czeka na gotowy obiekt bohatera i komunikacji.
- Automatyczne pobieranie listy jest ograniczone do jednego zapytania na 10 sekund.

## v1.2.1
- Klanowicze Online: dodano sortowanie listy.
- Dostępne tryby: nazwa A-Z, nazwa Z-A, level rosnąco i level malejąco.
- Wybrany sposób sortowania jest zapamiętywany.

## v1.2.2
- Naprawiono niewidoczną opcję sortowania w ustawieniach Klanowicze Online.
- Panel ustawień dopasowuje wysokość do zawartości.
- Na mniejszych ekranach panel ustawień można przewijać.

## v1.2.3
- Klanowicze Online: dodano mini widget do szybkiego otwierania i zamykania listy.
- Widget można przeciągać, a jego pozycja jest zapamiętywana.
- Zamknięcie głównego okna nie usuwa mini widgetu.

## v1.2.4
- Mini widget Klanowicze Online zmniejszony do 32x32 px, czyli rozmiaru widgetu TA.
- Zmniejszono również ikonę i zaokrąglenie, aby zachować proporcje.
