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


## v1.2.5
- Klanowicze Online: kliknięcie w wiersz klanowicza otwiera natywne menu Margonem.
- Menu zawiera wiadomość, ekwipunek, zaproszenie do przyjaciół, dodanie do wrogów i zaproszenie do grupy.
- Gdy `accountId` jest dostępne z `Engine.others` (gracz na tej samej mapie), menu zawiera również „Pokaż profil”.
- Naprawiono składanie adresu outfitu tak, aby nie tworzyć podwójnego ukośnika po `/postacie/`.


## v1.2.6
- Klanowicze Online 1.1.6: natywne menu gracza jest podnoszone ponad okno dodatku, dzięki czemu nie jest przez nie zasłaniane.


## v1.2.7
- Klanowicze Online 1.1.7: automatyczne i ręczne pobieranie listy klanu jest całkowicie wstrzymywane podczas odliczania wylogowania/przelogowania (`Engine.logOff` / `.log-off-wnd`).
- Zapobiega anulowaniu zmiany postaci przez okresowy request `clan&a=members`.


## v1.2.8
- Klanowicze Online 1.1.8: natywne menu gracza jest otwierane prawym przyciskiem myszy (PPM) zamiast lewym (LPM).


## v1.2.9

- Dodano eksperymentalny moduł **Depozyt+ v0.1.0**.
- Pierwszy etap jest diagnostyczny i dotyczy prywatnego depozytu.
- `TeriashDepoPlus.snapshot()` pokazuje przedmioty depozytu wraz z ID, pozycją i danymi stosu.
- Alt+PPM na przedmiocie depozytu wypisuje jego dane do konsoli.
- Ta wersja celowo nie wysyła jeszcze eksperymentalnych żądań modyfikujących przedmioty.


### v1.3.0
- Depozyt+ 0.2.0: kontrolowany test bezpośredniego dzielenia stosu w prywatnym depozycie przez pojedynczy request `depo&move=...&split=...`.
- `TeriashDepoPlus.splitTest(ID, X, Y, ILOSC)` waliduje przedmiot, ilość i pusty slot oraz loguje odpowiedź serwera.


### v1.3.2
- Depozyt+ 0.3.0: PPM na przedmiocie ma opcję „Podziel”.
- Podział jest wykonywany automatycznie przez sekwencję depozyt → torba → podział → depozyt.
- Oryginalny stos wraca na swoje miejsce, wydzielona część trafia do wolnego slotu tej samej zakładki.


### v1.3.2
- Depozyt+ v0.3.1: „Podziel” jest wstrzykiwane bezpośrednio do oryginalnego menu PPM Margonem.
- Opcja pojawia się tylko dla stosów w prywatnym depozycie z `amount > 1` i `cansplit = 1`.
- Usunięto własne zastępcze menu kontekstowe Depozyt+.


### v1.3.4
- Depozyt+ v0.4.1: przeciągnięcie jednego stosu na taki sam stos w prywatnym depozycie uruchamia scalanie. Wykrywanie dropu przeniesiono na poziom dokumentu, ponieważ natywna siatka depozytu przejmowała zdarzenie przed ikoną docelową.
- Scalanie wykonuje w tle: depozyt → torba → natywne `moveitem` → depozyt.
- Wynik wraca na pozycję stosu docelowego; nadmiar ponad `capacity` wraca na pozycję stosu źródłowego.


### v1.3.5
- Depozyt+ 0.5.0: przeciągnięcie zgodnego stosu z torby bezpośrednio na stos w prywatnym depozycie uruchamia natywne scalanie przez torbę; wynik wraca na slot docelowy, a nadmiar ponad capacity pozostaje w torbie.


### v1.3.6
- Depozyt+ 0.5.1: pełny stos (ilość >= capacity) nie przyjmuje kolejnego stosu. Drop jest przechwytywany i anulowany bez depo&put/depo&get, dzięki czemu przedmioty nie zamieniają się miejscami i nie trafiają do torby.


### v1.3.7
- Depozyt+ 0.5.2: opcja Podziel korzysta z oryginalnego okna Margonem przez `Engine.heroEquipment.splitItem`, bez `window.prompt`. Anulowanie odkłada stos z powrotem do depozytu.


### v1.3.8
- Depozyt+ 0.5.3: po PPM → Podziel stos pozostaje w depozycie podczas wyboru ilości. Dopiero kliknięcie OK uruchamia depo → torba → podział → depo. Anuluj/Esc nie przenosi przedmiotu.


### v1.3.9
- Klanowicze Online 1.1.8: stan otwarcia okna jest zapamiętywany. Jeśli zamkniesz okno X, po odświeżeniu/relogu pozostaje zamknięte; widget nadal pozwala je ponownie otworzyć.


### v1.4.0
- Depozyt+ 0.6.0: SHIFT + przeciągnięcie podzielnego stosu na pusty slot w prywatnym depozycie otwiera natywne okno Podziel. Dopiero OK uruchamia automat, a wydzielona część wraca na wskazany slot.


### v1.4.1
- Depozyt+ 0.6.1: SHIFT jest zapamiętywany od początku przeciągania, docelowy slot jest liczony z faktycznego rozmiaru siatki, a natywny ruch całego stosu jest blokowany przed obsługą dropu.


### v1.4.2
- Depozyt+ 0.6.2: SHIFT+drag nie wylicza już pola z pikseli. Dodatek przechwytuje natywne `depo&move` i wykorzystuje x/y wyliczone przez Margonem, blokując zwykłe przesunięcie i otwierając Podziel. Podział z PPM pozostaje bez zmian.


### v1.4.3
- Depozyt+ 0.6.3: poprawka SHIFT+drag — do okna Podziel przekazywany jest teraz prawdziwy obiekt Item z metodami getAmountStat/getCansplitStat, zamiast snapshotu depozytu. Usuwa błędny komunikat „Tego przedmiotu nie można podzielić” dla podzielnych stosów.


### v1.4.4
- Depozyt+ 0.6.4: SHIFT+drag na stosie, którego nie można dzielić, nie przekłada już przedmiotu. Natywny ruch jest przechwytywany i wyświetlany jest margonemski komunikat „Tego przedmiotu nie można podzielić.”
