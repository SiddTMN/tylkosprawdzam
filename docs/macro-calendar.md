# Kalendarz makro — etap 3

## Naprawa po awarii 5 listopada 2026

FinanceCalendar zwraca HTTP 401 `api_key_required`. Zgodnie z
[dokumentacją dostawcy](https://www.financecalendar.com/api/economic-calendar/)
generator obsługuje nagłówek `X-API-Key`. Klucz należy dodać jako sekret repozytorium
`FINANCE_CALENDAR_API_KEY` (Settings → Secrets and variables → Actions).
Workflow przekazuje go tylko do kroku generowania; nie do testów ani przeglądarki.
Klucz nie trafia do URL, JSON-a ani żądania Treasury; przekierowania są odrzucane.
Bez klucza FinanceCalendar pozostaje stale/unavailable; poprawne Treasury nadal działa.
Nie zweryfikowano rzeczywistego żądania z kluczem — brak poświadczeń w tej sesji.

TreasuryDirect zwraca HTTP 200, ale aktualne pola różnią się od starszych fixtures:

| Starsze pole | Aktualne pole |
| --- | --- |
| tips | inflationProtected |
| auctionDate | competitiveAuctionCloseDate |
| closingTimeCompetitive | competitiveAuctionCloseTime |
| closingTimeNoncompetitive | noncompetitiveAuctionCloseTime |
| pdfFilenameAnnouncement | treasuryOfferingAnnouncementPressReleaseFileName |

Adapter obsługuje oba warianty i odrzuca sprzeczne wartości. Zachowuje walidację
instrumentów, CUSIP, dat, ogłoszeń i godzin. Fixture
`tests/fixtures/treasury-upcoming-2026-11-05.json` zawiera wyłącznie potrzebne pola
ośmiu rekordów pobranych z oficjalnego endpointu 5 listopada 2026.
Wynik: 10Y (10.11) i 30Y (12.11), obie o 19:00 Europe/Warsaw.

Przebieg [41955314393](https://github.com/SiddTMN/tylkosprawdzam/actions/runs/41955314393)
z 05.11 pokazał `FinanceCalendar: Calendar source HTTP 401` oraz
`TreasuryDirect: Invalid Treasury nominal flags`, lecz opublikował pusty JSON
ze statusem success. Ostatnie sukcesy źródeł: 21.10 i 30.10.
Nowy generator zgłasza błąd, jeśli wszystkie źródła zawodzą i nie ma już przyszłych
wydarzeń z kopii. Zachowuje wtedy poprzednie bajty; przeglądarka nadal usuwa minione
wiersze. Poprawna świeża pusta odpowiedź pozostaje dozwolona.

Krypto jest osobnym problemem: opublikowany `crypto-auto.json` ma datę 17.10,
trzy wydarzenia kończą się 29.10, dane ręczne są puste, a zadanie `update` w
[przebiegu 41836378232](https://github.com/SiddTMN/tylkosprawdzam/actions/runs/41836378232)
ma status skipped. Zmiany makro nie włączają automatyzacji krypto.

FinanceCalendar pozostaje źródłem publikacji makro. Generator dołącza oficjalne
aukcje nominalnych obligacji Treasury 2Y, 5Y, 10Y i 30Y, także reopenings.
Nie dodaje refundingu, buybacks, osobnego kalendarza krypto, TIPS, FRN ani bonów.

## Źródło Treasury i zakres jego informacji

Endpoint bez klucza:

    https://www.treasurydirect.gov/TA_WS/securities/upcoming?format=json

To ten sam endpoint, którego używa oficjalna strona Upcoming Auctions
w skrypcie /scripts/auctions-section/auctWidget.js. Zweryfikowano HTTP 200
8 października 2026: sześć rekordów, w tym jeden kwalifikujący się nominalny 30Y.
Endpoint /securities/announced również zwrócił HTTP 200, lecz zawierał 250 rekordów,
w tym aukcje już przeprowadzone. Dlatego nie jest źródłem przyszłego kalendarza.

Upcoming zawiera oficjalne ogłoszenia i niektóre wstępne terminy przed ogłoszeniem.
Nie obejmuje koniecznie całych kolejnych 14 dni. Nie uzupełniamy braków domysłami
z miesięcznego schematu, sześciomiesięcznego PDF-a ani planów refundingu.
Świeża pusta lista oznacza brak kwalifikujących się rekordów w odpowiedzi źródła,
a nie gwarancję, że Treasury nie ogłosi nowych aukcji.

## Pola i reguły

- securityType: Note dla 2Y/5Y/10Y, Bond dla 30Y.
- tips i floatingRate muszą być No; pozostałe instrumenty są pomijane.
- originalSecurityTerm decyduje o kwalifikacji. term, jeśli podany, musi być zgodny.
  securityTerm jest pozostałym terminem; securityTermWeekYear/DayMonth nie określają
  pierwotnego tenoru. Nie zaokrąglamy pozostałego czasu ani nie zgadujemy brakującego
  originalSecurityTerm. Weryfikujemy też długość pozostałego terminu.
- reopening: Yes/No. Ta sama emisja może mieć wiele aukcji tego samego CUSIP.
- cusip: dziewięć znaków, prefiks Treasury 912 oraz poprawna cyfra kontrolna.
- auctionDate: data aukcji; issueDate: data emisji/rozliczenia, nie wydarzenie aukcyjne.
  W modelu zapisujemy ją jako settlementDate. announcementDate jest odrębną datą.
  maturityDate może być niepodana w rekordzie wstępnym.
- Daty YYYY-MM-DDT00:00:00 bez offsetu są datami kalendarzowymi, nie chwilami UTC.
  Sprawdzamy kalendarz i kolejność: announcement ≤ auction ≤ settlement < maturity,
  gdy maturity jest podana.
- Potwierdzenie announced wymaga spójnego pdfFilenameAnnouncement, dodatniej
  offeringAmount oraz announcementDate, która już nastąpiła w Nowym Jorku.
  Sam wiersz upcoming lub zaplanowana announcementDate nie potwierdza ogłoszenia.
  Bez tych pól status jest tentative; panel pokazuje „wstępny termin”.
  Nazwa pliku jest dowodem w odpowiedzi API; generator nie pobiera każdego PDF-a.
- closingTimeCompetitive i closingTimeNoncompetitive są godzinami Eastern Time.
  Zamieniamy potwierdzoną closingTimeCompetitive na chwilę UTC z America/New_York,
  z DST. Panel wyświetla Europe/Warsaw. Nie stosujemy stałego offsetu.
  To zamknięcie ofert konkurencyjnych, nie gwarantowana chwila publikacji wyników.
- Bez potwierdzonej godziny nie przypisujemy 13:00. kind=unknown-time pokazuje „—”.
  Tak jak w dotychczasowym modelu dat bez godziny, sortowanie używa początku
  wskazanej daty w Warszawie, wygaśnięcie następnej warszawskiej północy.
  Te granice służą wyłącznie prezentacji dnia; nie są godziną aukcji.
- updatedTimestamp w API jest znacznikiem bez offsetu. Nie używamy go jako UTC
  ani jako dowodu świeżego pobrania. Własny lastSuccessAt mierzy pobranie i walidację.
- Treasury nie dostarcza ratingu HIGH/MEDIUM. Jawna polityka tego panelu:
  10Y/30Y=HIGH, 2Y/5Y=MEDIUM. FinanceCalendar zachowuje ważność dostawcy.

Zweryfikowany przykład: CUSIP 912810UW6, reopening 30Y, originalSecurityTerm
30-Year, securityTerm 29-Year 10-Month, auctionDate 2026-10-08, issueDate
2026-10-15, maturityDate 2056-08-15. Closing competitive 01:00 PM ET oznacza
2026-10-08T17:00:00Z i 19:00 w Warszawie. Noncompetitive: 12:00 PM ET.

## Deduplikacja i walidacja

Klucz Treasury to CUSIP + data aukcji. Identyczne znormalizowane rekordy są usuwane;
różnice w kolejności pól lub nieużywanych polach dostawcy nie tworzą duplikatu.
Sprzeczne używane pola tej samej aukcji unieważniają pobranie Treasury, zamiast
losowo wybierać rekord. Inna aukcja tej samej emisji pozostaje odrębna.

FinanceCalendar nadal usuwa tylko identyczne rekordy źródłowe. Przy scalaniu
Treasury ma pierwszeństwo wyłącznie dla potwierdzonej aukcji z identycznym CUSIP
i dniem albo wąskiej nazwy aukcji tego samego tenoru z dokładnie tą samą chwilą.
Podobne nazwy, TIPS i inne godziny pozostają odrębne.

Generator odrzuca błędne koperty, błędne rekordy obsługiwanych aukcji, sprzeczne
duplikaty, niemożliwe daty i godziny oraz niespójne potwierdzenie.
Walidator JSON-a ponownie odtwarza i porównuje metadata Treasury, w tym CUSIP,
term, daty, status i godzinę. Przeglądarka nie ufa dowolnym polom zapisanego pliku.

## Kontrakt JSON i świeżość

Nowy generator zapisuje schemaVersion=2, source=FinanceCalendar+TreasuryDirect.
Czytnik nadal przyjmuje schemaVersion=1 z etapu 2.

generatedAt opisuje utworzenie pliku. range.from/to nadal używa dat UTC i różnicy
14 dni, displayTimezone=Europe/Warsaw. events przechowuje wszystkie kwalifikujące
się przyszłe HIGH/MEDIUM w zakresie; dopiero panel wybiera pięć po sortowaniu.

sources.FinanceCalendar i sources.TreasuryDirect mają:
endpoint, checkedAt, lastSuccessAt i status=fresh/stale/unavailable.
checkedAt jest czasem próby w danym uruchomieniu. lastSuccessAt jest czasem
ostatniego poprawnego pobrania i pełnej walidacji danego źródła.
Nie odnawia się podczas awarii. unavailable ma lastSuccessAt=null.
Prawidłowa pusta odpowiedź jest sukcesem i zastępuje poprzednią listę źródła.

Każde wydarzenie ma source. Aukcje dodatkowo mają id, cusip, securityType,
originalTerm, remainingTerm, reopening, auctionDate, settlementDate,
announcementDate, maturityDate, confirmation, timeZone, timeBasis,
competitiveClose, noncompetitiveClose, offeringAmount oraz announcementUrl.

## Awarie i fallback

Pobrania obu źródeł są niezależne, równoległe i mają osobne timeouty 15 sekund.
Awaria Treasury nie zatrzymuje FinanceCalendar ani publikacji Pages:
generator zachowuje zwalidowane przyszłe aukcje z poprzedniego JSON-a jako stale;
jeśli ich nie ma, publikuje FinanceCalendar z Treasury=unavailable.
Także awaria FinanceCalendar może korzystać z poprawnego wcześniejszego pliku,
w tym schema 1, zachowując pierwotny lastSuccessAt i pozwalając odświeżyć Treasury.
Bez wiarygodnej kopii FinanceCalendar generator nadal publikuje poprawne Treasury,
oznaczając FinanceCalendar jako unavailable. Całkowita awaria bez przyszłych danych
kończy się błędem i pozostawia poprzednie bajty. Uszkodzony lub wygasły plik nie jest
wiarygodnym fallbackiem.

Zapis ma walidację przed publikacją, plik tymczasowy i atomową zmianę nazwy.
Błąd zapisu usuwa plik tymczasowy. Minione wydarzenia są ponownie odrzucane
przy każdym wygenerowaniu i każdym renderowaniu.

Panel nadal pobiera względne ./data/macro-calendar.json bez cache, co godzinę.
Stary plik (>6 h), brak pliku albo nieaktualny FinanceCalendar uruchamia
dotychczasowy bezpośredni fallback FinanceCalendar. Zachowuje przy tym wiarygodne
aukcje Treasury z pliku lub pamięci oraz ich oryginalne lastSuccessAt.
Przeglądarka nie odpytuje Treasury, więc nie zależy od jego CORS.

Nieaktualność lub brak Treasury przy świeżym FinanceCalendar nie uruchamia
zbędnego fallbacku i nie usuwa makro. Oznaczenie data-stale i podpowiedzi
pokazują dotknięte źródło oraz datę pobrania; wiersz aukcji ma także CUSIP,
rozliczenie i terminy w podpowiedzi. Nowa publikacja kasuje oznaczenia po odzyskaniu
źródła. Nieaktualny/niepełny pusty wynik pokazuje „kalendarz niedostępny”.

Klasy CSS, struktura wierszy, limit pięciu, HIGH/MEDIUM, chronologia i pozostałe
panele pozostają zachowane. Nowy treasury-model.js ładuje się przed
calendar-model.js i calendar.js. CSS nie wymaga zmian.

## Actions i Pages

Workflow .github/workflows/macro-calendar.yml nadal działa o 17. minucie każdej
godziny UTC, ręcznie i po zmianach main; PR-y wykonują tylko testy.
Uruchamia wszystkie tests/*.test.js na Node 24, ponownie testuje aktualny main,
następnie generuje wspólny JSON. Awaria pojedynczego źródła przy poprawnym cache
lub brak opcjonalnego Treasury daje ostrzeżenie w Actions, a nie blokadę deploy.

Bot zapisuje wyłącznie data/macro-calendar.json zwykłym pushem na main.
Konflikt zapisu zatrzymuje zadanie; nie ma force-pusha. Publikacja nadal odbywa się
w tym samym workflow przez upload-pages-artifact i deploy-pages, ponieważ zwykły
push wykonany GITHUB_TOKEN nie uruchamia kolejnego workflow.
Paczka zawiera index.html, css/, js/, data/, więc obejmuje nowy adapter.
Testy, fixtures, skrypty i dokumentacja nie trafiają do publicznego artefaktu.

Read-only weryfikacja 8 października: run 37774845709 zakończył się sukcesem,
a publiczny data/macro-calendar.json zwracał HTTP 200 i schema 1 z generatedAt
2026-10-08T12:09:18.042Z. To potwierdza dotychczasową publikację etapów 1–2,
nie wdrożenie etapu 3. Bez zatwierdzonego commita/pusha nie uruchomiono nowego
workflow ani publikacji etapu 3.

## Testy lokalne i fixtures

Wymagany Node 24, bez instalowania zależności:

    node --test tests/*.test.js
    node scripts/generate-macro-calendar.cjs

tests/fixtures/treasury-upcoming.json pochodzi z oficjalnego upcoming,
treasury-samples.json z upcoming oraz announced. Zapisano 8 października 2026;
zachowano używane pola i pola dokumentujące term, źródłowe daty i updatedTimestamp.
Warianty awarii, zmienione daty do DST i scenariusze wstępne są jawnie konstruowane
w testach, nie przedstawiane jako rzeczywisty przyszły harmonogram.

Testy obejmują kwalifikację każdego tenoru, reopenings, wykluczenia, checksum
CUSIP, rozliczenie, potwierdzenie, brak godziny, DST USA/Polska, duplikaty,
granice zakresu, pięć pozycji, schematy 1/2, awarie, timeouty, cache,
odzyskanie źródeł, atomowy zapis i rzeczywisty skrypt panelu w harnessie DOM.

## Źródła

- https://www.treasurydirect.gov/auctions/upcoming/
- https://www.treasurydirect.gov/scripts/auctions-section/auctWidget.js
- https://www.treasurydirect.gov/TA_WS/securities/upcoming?format=json
- https://www.treasurydirect.gov/auctions/reopenings/
- https://www.treasurydirect.gov/auctions/when-auctions-happen/
- https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow
- https://github.com/actions/deploy-pages
