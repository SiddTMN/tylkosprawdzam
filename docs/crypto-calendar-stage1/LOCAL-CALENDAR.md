# Lokalny automatyczny kalendarz krypto

Pierwsza wersja korzysta z istniejącego audytu i przypiętego ical.js 2.2.1. Nie dodano nowych zależności ani workflow. Obecnie aktywny jest tylko Ethereum Protocol Calls: AllCoreDevs Execution i Consensus. JSON nie zawiera fikcyjnych pozycji DOT, XLM, ATH ani BONK.

## Uruchomienie

W katalogu głównym projektu, Node.js 24:

~~~powershell
npm.cmd ci --prefix docs/crypto-calendar-stage1 --ignore-scripts --no-audit --no-fund
node scripts/generate-crypto-calendar.cjs
node scripts/preview-crypto-calendar.cjs
~~~

Podgląd: http://127.0.0.1:4173/. Serwer nasłuchuje wyłącznie lokalnie. Przy starcie generuje dane i aktualizuje je następnie co 6 godzin, przez cały czas działania procesu. Przeglądarka odczytuje JSON raz na minutę; nie pobiera bezpośrednio ICS. Ctrl+C zatrzymuje serwer uruchomiony w terminalu. Alternatywny port: --port 4174.

Sam generator zapisuje data/crypto-calendar.json. --offline korzysta wyłącznie z wcześniej rzeczywiście pobranego ICS, zachowując czas jego weryfikacji. --force wymusza pojedynczą rewalidację do testowania; nie stosować go jako regularnego harmonogramu. Serwer podglądu również obsługuje --offline, ale ten tryb nie weryfikuje informacji w sieci.

## Moduły i kontrakt

- scripts/crypto-calendar/shared.cjs: wydzielony dotychczasowy parser ICS, rozwijanie RRULE, wyjątki, anulowanie, przesunięcia, daty, deduplikacja audytowa i transport z cache. scripts/test-crypto-calendar.cjs nadal eksportuje te same funkcje i zachowuje poprzednie tryby oraz ograniczenia CLI.
- scripts/crypto-calendar/adapters/ethereum-protocol-calls.cjs: jedyny aktywny adapter. Filtruje dwie główne serie i tworzy własne krótkie opisy. Nie przenosi opisów organizatora, grafik, list uczestników ani adresów e-mail. Spotkania są MEDIUM, a nie zapowiedzianymi aktualizacjami sieci.
- scripts/crypto-calendar/sources.cjs: rejestr adapterów.
- js/crypto-calendar-model.js: wspólny model Node/przeglądarki; walidacja, deduplikacja, okno 30 dni w Europe/Warsaw, wybór maksymalnie pięciu najbliższych i ocena świeżości.
- scripts/generate-crypto-calendar.cjs: wspólny kolektor, niezależne stany źródeł, ostatnie poprawne wyniki i atomowy zapis.
- js/crypto-calendar.js: renderer dotychczasowych wierszy kalendarza. Czyta tylko wspólny JSON; nie zna nazw adapterów ani listy tokenów.

Adapter ma id, name, url oraz metodę load(options), zwracającą { events, verifiedAt, transport }. Wszystkie events mają pola id, token, date (dzień Warszawy), startsAt (UTC ISO albo null), title, description, category, priority, sourceId, sourceUrl i verifiedAt. Priorytety: high/medium/low. Dla daty bez potwierdzonej godziny startsAt=null; frontend pokazuje kreskę, a nie wymyśloną godzinę. Schemat: local-calendar.schema.json. Źródło i czas weryfikacji zachowywane są również przy błędach.

Dodanie kolejnego tokena wymaga napisania adaptera i dopisania go do rejestru. Frontend i wspólny proces nie wymagają zmian. Test integracyjny sprawdza ten kontrakt również dla DOT, XLM, ATH i BONK, używając wyłącznie jawnie syntetycznych danych testowych. Te dane nigdy nie trafiają do rzeczywistego JSON.

## Aktualizacja, awarie i cache

Transport: TTL 6 h, ETag/304, timeout 15 s, limit 2 MiB, bez logowania, przekierowań, ponowień 403/429 i zastępczych endpointów. Nowy adapter waliduje ICS przed zapisaniem odpowiedzi jako cache, dzięki czemu błędna odpowiedź nie zastępuje poprawnego pliku. Zachowano reguły organizatora i testy zmiany czasu.

Ostatni poprawny pełny znormalizowany wynik każdego adaptera jest w ignorowanym .cache/local/*.last-good.json; JSON widoczny dla strony ma najwyżej 5 rekordów. Przy awarii zachowane mogą być tylko wydarzenia z przyszłą datą, nadal mieszczące się w bieżącym oknie 30 dni. Nie są ponownie potwierdzane: zachowują verifiedAt i mają widoczne oznaczenie nieświeżości. Przyszła data nie gwarantuje, że organizator nie odwołał wydarzenia podczas awarii.

Po poprawnym pustym odczycie wcześniejsze rekordy są usuwane. Zdrowy pusty wynik pokazuje brak wydarzeń; pusty wynik z błędem lub po utracie świeżości pokazuje niedostępność kalendarza. Po upływie 6 godzin bez weryfikacji dane są oznaczane jako nieświeże nawet wtedy, gdy odczyt lokalnego JSON się powiódł. Błąd zapisu końcowego JSON pozostawia poprzedni plik; jego świeżość frontend ocenia na podstawie źródła, nie daty samego odczytu.

## Zakres i publikacja

To lokalny prototyp. publication.approved=false oraz reuse=review-required zachowują informację, że systematyczne pobieranie i publiczne wykorzystanie ICS nie zostały zatwierdzone. Sama integracja lokalna nie rozstrzyga tych warunków. Nie wdrożono kalendarza na GitHub Pages, nie utworzono workflow i nie wykonano commita/pusha.

Kalendarz makro: bez zmian w kodzie, danych i działaniu. Dodatkowe style mają zastosowanie wyłącznie do linków krypto i informacji o nieświeżości. Usunięto pięć statycznych przykładów z sekcji krypto, zachowując jej układ.

## Weryfikacja

~~~powershell
node --test tests/*.test.js
~~~

Zachowano wszystkie 82 poprzednie testy. Dodano 16 testów generatora/modelu oraz 9 testów realnego skryptu frontendu w kontrolowanym DOM. Pokrywają aktualizacje, ICS, przesunięcia/anulowanie, deduplikację, DST, cache/ETag, trwałe oznaczenie awarii pomimo odczytu cache, błędy i timeout, limit rozmiaru, niezatruwanie cache, znikanie minionych wpisów, pusty wynik kontra awarię oraz dodawanie tokenów bez zmian renderera.

Wizualny podgląd w przeglądarce nie został ukończony: Computer Use zatrzymał dostęp, ponieważ nie mógł wiarygodnie ustalić aktualnego URL. Dostępny jest lokalny adres podglądu; wynik testów DOM nie jest deklaracją weryfikacji wyglądu w przeglądarce.

Końcowy przebieg: **107/107 testów** (82 poprzednie + 25 nowych). HTTP: strona, JSON i skrypt zwracają 200; .git i cache są niedostępne (404). Rzeczywista próba rewalidacji ICS o 13:04:53 UTC zakończyła się fetch failed. Obecne 4 wpisy korzystają z poprzedniej weryfikacji 11.10.2026 12:23:32 UTC i są oznaczone jako nieświeże. Dowód: verification.local.json.

## Pliki tej zmiany

Zmodyfikowane: `index.html`, `css/style.css`, `scripts/test-crypto-calendar.cjs`.

Dodane:

- `scripts/crypto-calendar/shared.cjs`
- `scripts/crypto-calendar/sources.cjs`
- `scripts/crypto-calendar/adapters/ethereum-protocol-calls.cjs`
- `scripts/generate-crypto-calendar.cjs`
- `scripts/preview-crypto-calendar.cjs`
- `js/crypto-calendar-model.js`
- `js/crypto-calendar.js`
- `data/crypto-calendar.json`
- `tests/crypto-calendar-local.test.js`
- `tests/crypto-calendar-ui.test.js`
- `docs/crypto-calendar-stage1/LOCAL-CALENDAR.md`
- `docs/crypto-calendar-stage1/local-calendar.schema.json`
- `docs/crypto-calendar-stage1/verification.local.json`
