# Global Markets

Dwie równe kolumny przy szerokości prawej części ponad 580 px: po lewej Snapshot, a bezpośrednio pod nim wspólny panel Macro z DXY i złotem; po prawej Global Markets wyłącznie z CFD S&P 500 i Nasdaq 100. Na węższych ekranach kolejność jest pionowa: Snapshot, Macro, Global Markets. Bez zmian logiki kalendarzy, wykresu, kryptowalut, wiadomości, Snapshot i DXY.

## Źródła i wybór

Sprawdzenie dokumentacji i oficjalnych widgetów: 5 listopada 2026.

| Rozwiązanie | Bezpłatność / licencja | Aktualizacje | GitHub Pages / utrzymanie |
| --- | --- | --- | --- |
| TradingView Single Ticker | Bezpłatne osadzanie z brandingiem i atrybucją; dostępność poszczególnych symboli zależy od licencji dostawcy | Strumień dostawcy, bez gwarantowanego interwału sekundowego; poza sesją ostatnia cena | Oficjalny widget HTTPS już używany przez DXY; bez klucza, backendu, Actions ani nowej biblioteki aplikacji |
| TradingView Market Data | Podobne warunki i ograniczenia symboli | Zależne od źródła; widget nie odblokowuje chronionych indeksów | Więcej kolumn i ustawień; mały panel lepiej obsługują trzy Single Ticker |
| Alpha Vantage | Klucz, standardowo 25 zapytań/dzień; dane indeksowe premium, prawa do publicznej prezentacji wymagają osobnej oceny | Darmowy limit nie odpowiada ciągłemu monitorowaniu trzech instrumentów | Bezpieczny klucz wymagałby backendu lub Actions; odrzucone |
| Twelve Data | Basic: 8 kredytów/min i 800/dzień, użycie wewnętrzne bez publicznej prezentacji; publiczny display w płatnym planie biznesowym z warunkami licencyjnymi | Zależne od planu i rynku | Klucz i dodatkowa obsługa limitów / praw; odrzucone |

Źródła pierwotne:

- [Widget Single Ticker](https://www.tradingview.com/widget-docs/widgets/tickers/single-ticker/)
- [Bezpłatne widgety z brandingiem](https://www.tradingview.com/widget/)
- [Ograniczenia danych i symboli](https://www.tradingview.com/widget-docs/faq/data/)
- [Dane światowe: waluty i CFD](https://www.tradingview.com/widget-docs/markets/worldwide/)
- [Zasady atrybucji i osadzania](https://www.tradingview.com/widget-docs/faq/general/)
- [Alpha Vantage: limity](https://www.alphavantage.co/support/) i [dane premium / indeksowe](https://www.alphavantage.co/premium/)
- [Twelve Data: licencje i publiczna prezentacja](https://twelvedata.com/pricing-business)

Test oficjalnego osadzenia SP:SPX, NASDAQ:NDX, TVC:SPX i TVC:NDX zwrócił komunikat „This symbol is only available on TradingView”. Nie próbowano obchodzić ograniczeń ani pobierać surowych notowań. Użytkownik zaakceptował jawnie oznaczone CFD jako zamienniki właściwych indeksów przed ich implementacją.

Wybrane symbole:

- `OANDA:XAUUSD`: złoto / USD, cena uncji trojańskiej, dzienna zmiana procentowa.
- `FOREXCOM:SPXUSD`: CFD na S&P 500, dzienna zmiana procentowa.
- `FOREXCOM:NSXUSD`: CFD na Nasdaq 100, dzienna zmiana procentowa.

CFD mają własne ceny i sesje; nie są oficjalnym poziomem indeksu. Dostawcy figurują w wykazie TradingView jako źródła strumienia w czasie rzeczywistym. Nie oznacza to gwarancji czasu dostarczenia na stronę. Widget sam aktualizuje notowania; aplikacja nie odpytuje API, nie zapisuje cen i nie wymyśla czasu ostatniego ticka.

## Dostępność i świeżość

Każda wartość jest opisana jako ostatnia dostępna. Widget nie udostępnia aplikacji czasu aktualizacji ani wiarygodnego sygnału świeżości każdego ticka. Po zamknięciu sesji może pozostać ostatnia cena sesji; oznaczenie pod panelem wyjaśnia ten przypadek. Aplikacja nie przedstawia tych wartości jako gwarantowanej bieżącej wyceny.

Widget pozostaje ukryty do sygnału `tv-widget-ready` od własnej ramki i oczekiwanej domeny. Sama obecność iframe / load nie wystarcza. Błąd skryptu, `tv-widget-no-data`, brak potwierdzenia przez 15 sekund lub offline ukrywa notowanie i pokazuje czytelny komunikat dla danego instrumentu. Powrót sieci tworzy nowe ramki złota i indeksów w obu panelach. Przyciski ponowienia odtwarzają wyłącznie notowania własnego panelu. Monitor i ramka DXY zachowują dotychczasową obsługę. Nie ma własnej pamięci starych cen ani zastępczych notowań.

Przy awarii połączenia dostawcy wewnątrz ramki, gdy przeglądarka pozostaje online, aplikacja nie potrafi niezależnie sprawdzić wieku wyświetlonej wartości. Dlatego stale zachowuje oznaczenie „ostatnie dostępne” i informację o braku czasu aktualizacji. Nie odczytuje danych z ramki do dalszego użycia i nie opiera działania na scrapingu.

## Weryfikacja

- Pierwotna walidacja `node --test tests/*.test.js`: 180/180 testów, w tym izolowane testy Global Markets (zaufanie do wiadomości, niezależne błędy, timeout, offline/online i ponawianie).
- Test pakowania Pages obejmuje nowy plik JS; allowlista i walidacja kalendarzy pozostają aktywne.
- Lokalny Chrome / Playwright: rzeczywiste widgety, pierwotny układ 2560 × 1440, szerokość 390 px, brak poziomego przepełnienia, offline i powrót sieci, blokada skryptu i ręczne ponowienie klawiaturą. Brak błędów JavaScript w udanym przebiegu.
- `node scripts/update-crypto-calendar.cjs --validate` oraz `node scripts/build-pages.cjs <pusty-katalog>`: powodzenie. Porównanie z bazą potwierdza brak zmian chronionych skryptów, danych i workflow.

Brak nowych zależności produkcyjnych, harmonogramów i zmian workflow. PR wymaga przeglądu; nie należy scalać ani wdrażać bez zgody właściciela.

### Układ z DXY i złotem pod Snapshot

Zawartość i obsługa Snapshot oraz źródło i skrypt DXY pozostają bez zmian. Wspólny panel Macro ma zwarty nagłówek i opis źródła złota, aby ograniczyć wysokość. Wszystkie oznaczenia CFD, atrybucja i informacja o ograniczeniach świeżości pozostają widoczne. Złoto zachowuje dotychczasowy mechanizm błędów i ponawiania po przeniesieniu do oddzielnego panelu. Test niezależnego ponawiania sprawdza, że odświeżenie złota nie odtwarza indeksów i odwrotnie.

Walidacja zmiany: 181/181 testów Node; walidacja danych krypto; 19-plikowy artefakt Pages; `git diff --check`. Rzeczywiste widgety w lokalnym podglądzie: widok monitora 2560 × 1310 oraz telefon 390 × 844, poprawna kolejność paneli i brak poziomego przepełnienia. Ponowienie złota nie przerywa notowań indeksów ani DXY.
