# Automatyzacja kalendarza krypto — przygotowanie bez wdrożenia

Gałąź `feature/crypto-calendar`, oparta na `origin/main` 9305c97 i prototypie e7af5cb.
Kod strony i kalendarza makro nie został przebudowany. Nie połączono gałęzi z main,
nie uruchomiono publikacji danych ani Pages, nie zmieniono zmiennych repozytorium.

## Ręczny test na gałęzi feature

Osobny `.github/workflows/crypto-calendar-test.yml` obsługuje workflow_dispatch i workflow_call.
Ponieważ nowy workflow nie jest jeszcze na gałęzi domyślnej, użyto zarejestrowanego
`macro-calendar.yml`: **Run workflow → branch feature/crypto-calendar**.
Warunkowy job wywołuje osobny test; build i deploy mają warunek main i są pomijane.
Wariant na main pozostaje niezmieniony do zatwierdzenia scalenia.

Test instaluje przypięty ical.js, uruchamia wszystkie testy i
`scripts/test-crypto-calendar-live.cjs`. Każda próba używa nowego pustego katalogu,
bez odtworzenia cache. Zaliczana jest tylko świeża odpowiedź HTTP 200 z treścią,
SHA-256, rozmiarem, zgodnym czasem weryfikacji i poprawnym JSON. HTTP 304,
stary cache, awaria, błędny ICS i pozornie świeży adapter bez potwierdzenia pobrania
nie zaliczają testu. Poprawny pusty ICS może dać zero wydarzeń bez tworzenia fikcyjnych wpisów.

Artefakt: crypto-calendar.json, verification.json, tests.tap; retencja 7 dni.
Nie zawiera surowego ICS, cache, list uczestników ani poświadczeń.
Test nie zapisuje data/crypto-calendar.json i ma wyłącznie contents:read.

Pierwszy potwierdzony test:
https://github.com/SiddTMN/tylkosprawdzam/actions/runs/38143347883
Commit 2138bc6990d8e9dd5d9290b7bd9c8f0e8af672bf.
11.10.2026 13:29:14.936 UTC: HTTP 200, 345433 bajty, jedno zapytanie,
4 przyszłe wydarzenia ETH, 111/111 testów, build/deploy pominięte.
Końcowy test: https://github.com/SiddTMN/tylkosprawdzam/actions/runs/38143946012
Commit kodu 3ad5125cfa0b9db3e3c3bbf5f040bb2d7aa5ccee.
11.10.2026 13:38:04.871 UTC: świeże HTTP 200, 345433 bajty, jedno zapytanie,
4 rzeczywiste wydarzenia, 115/115 testów, build/deploy pominięte.
Pobrano i sprawdzono wszystkie trzy pliki artefaktu.
Dowód: verification.actions.json; artefakt:
https://github.com/SiddTMN/tylkosprawdzam/actions/runs/38143946012/artifacts/11703767744

| Wydarzenie | Data | Europe/Warsaw |
| --- | --- | --- |
| AllCoreDevs Consensus | 2026-10-15 | 16:00 |
| AllCoreDevs Execution | 2026-10-22 | 16:00 |
| AllCoreDevs Consensus | 2026-10-29 | 15:00 |
| AllCoreDevs Execution | 2026-11-05 | 15:00 |

Wszystkie są MEDIUM; są spotkaniami protokołowymi, nie zapowiedziami aktywacji aktualizacji.
Źródło i godzina aktualizacji znajdują się w artefakcie. Zmiana czasu w Warszawie jest
obsługiwana przez Intl/Europe/Warsaw, bez stałego przesunięcia UTC.

## Przygotowany harmonogram — nadal wyłączony

`.github/workflows/crypto-calendar.yml`: 00:43, 06:43, 12:43, 18:43 UTC
(`43 */6 * * *`) oraz ręczny workflow_dispatch. GitHub może opóźniać harmonogram;
nie gwarantuje wykonania dokładnie co sześć godzin.
Workflow nie ma uprawnień Pages ani kroków wdrożenia.

Job wykonuje się wyłącznie na main i wymaga zmiennych repozytorium:
- `CRYPTO_CALENDAR_ENABLED=true`;
- `CRYPTO_CALENDAR_APPROVED_SOURCES=eth-protocol-calls`.

**Nie ustawiono tych zmiennych.** Ich ustawienie po zatwierdzeniu wdrożenia oznacza
osobną decyzję operatora o regularnym pobieraniu i publicznym wykorzystaniu wskazanych
źródeł. Pomyślny test techniczny nie rozstrzyga warunków ICS.
Nowy adapter wymaga również dopisania swojego id do zatwierdzonej listy; nie uzyskuje
automatycznie zgody na publikację. Nie wymaga zmian workflow ani renderera.

Proces: instalacja przypiętych zależności → pełne testy aktualnie pobranego main →
kolektor → walidacja całego JSON → atomowy zapis → sprawdzenie, czy main nie
zmienił się w trakcie → commit wyłącznie data/crypto-calendar.json → zwykły push.
Nigdy force-push. Jeśli zewnętrzny commit zmieni main podczas generowania, kandydat
nie zostanie wypchnięty; kolejny przebieg pobierze aktualny kod i ponownie wygeneruje dane.

Macro i crypto mają wspólną grupę concurrency `calendar-data-${{ github.ref }}`,
z cancel-in-progress:false. Zapobiega to równoczesnym commitom obu automatów na main.
Harmonogramy, kolektory, błędy źródeł i pliki wynikowe pozostają niezależne.
Makro instaluje teraz ten sam parser przed pełnym zestawem testów; jego logika, dane
i kroki Pages pozostają zachowane. Zmiany tego workflow istnieją tylko na gałęzi feature.
Po ewentualnym przyszłym scaleniu istniejący workflow Pages nadal pakuje katalog data;
dlatego samo scalenie jest granicą publikacji i wymaga odrębnej zgody.

## Zachowanie przy awarii

`scripts/update-crypto-calendar.cjs` odzyskuje ostatnie opublikowane fakty ze
zwalidowanego JSON również na zupełnie czystym runnerze. Weryfikuje tożsamość i URL
źródła, zachowuje oryginalny verifiedAt i odrzuca wpisy minione/poza oknem 30 dni.
Nie potrzebuje cache surowego ICS do bezpiecznego fallbacku. Każdy zaplanowany
przebieg wykonuje jedną aktualną próbę odczytu na adapter, bez ponowień i obchodzenia ograniczeń.
Cache prototypu lokalnego i jego dotychczasowe reguły pozostają zachowane.

Po błędzie może zapisać tylko ponownie zwalidowany dokument ze starymi przyszłymi
faktami i statusami stale/unavailable. Nie dodaje nowych niepotwierdzonych zdarzeń.
Zmiana generatedAt nie zmienia verifiedAt. Frontend zaznacza nieświeżość od razu
dla statusu stale, a także samodzielnie po ponad 6 godzinach bez potwierdzenia.
Jeśli runner lub zapis całkowicie zawiedzie, poprzedni JSON pozostaje i starzeje się
według verifiedAt. Bez poprawnego fallbacku i bez sukcesu żadnego źródła plik nie
jest zastępowany. Poprawny pusty odczyt usuwa poprzednie wydarzenia.
Awaria jednego przyszłego adaptera nie zatrzymuje poprawnych danych pozostałych.

Obecny JSON data/crypto-calendar.json nadal ma local-prototype i approved:false.
Dopiero jawnie autoryzowany proces produkcyjny zapisuje automated-calendar,
approved:true i approved-by-repository-setting. Wspólny model i schemat przyjmują
oba warianty; renderer i interfejs nie wymagają przebudowy.

## Testy i ograniczenia

Końcowy zestaw: 115 testów, w tym wszystkie 107 testów prototypu.
Dodatkowo sprawdzono świeże HTTP 200 zamiast cache, 304 bez treści, błędy sieci/ICS,
poprawną pustą odpowiedź, pozornie świeży adapter, blokadę niezatwierdzonej produkcji,
fallback na czystym runnerze, natychmiastowy status stale, zachowanie verifiedAt,
usuwanie minionych wpisów, odzyskanie po awarii, błędny poprzedni JSON i zmianę URL.
Dotychczasowe testy DST, anulowania, przesunięć, deduplikacji, limitów, timeoutów i DOM zachowano.

Produkcyjny commit/push i harmonogram nie zostały uruchomione na main.
Blokada concurrency i brak force-push zostały przygotowane; faktyczne publikowanie
wymaga osobnej akceptacji i weryfikacji uprawnień/protekcji gałęzi po niej.
Nie istnieje gwarancja, że podczas awarii organizator nie zmieni/anuluje starego terminu.

Lokalne fetch failed (EACCES/connect) wskazywało ograniczenie sieci środowiska wykonania.
Świeże pobranie na runnerze GitHub zakończyło się HTTP 200. Nie jest to dowód
całkowitej niezawodności źródła, ale nie potwierdza trwałej blokady adresu ICS przez Google.
