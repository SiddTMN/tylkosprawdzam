# Hybrydowy kalendarz krypto

Aktualizacja 17.10.2026: **publikacja pozostaje zablokowana**. Pages nadal ma źródło `main /` (`legacy`), niezależne od własnego workflow. Poprawione pakowanie zawiera wyłącznie 18 jawnie wybranych plików; kontrola w workflow wymaga źródła „GitHub Actions”. Dokładne ustalenia, kroki w Settings, odświeżenie bez crona i propozycja PR: [RELEASE-2026-10-17.md](RELEASE-2026-10-17.md). Poniższy opis implementacji pochodzi z 13.10; bieżące wyniki są także w [VALIDATION.md](VALIDATION.md).

Implementacja na gałęzi draftu [PR #2](https://github.com/SiddTMN/tylkosprawdzam/pull/2), przygotowana 13.10.2026. Zapis na gałęzi draftu nie aktywuje produkcyjnego kolektora ani wdrożenia Pages. Lokalny test `--preview` odczytał wyłącznie dopuszczone kanały GitHub. Jego zweryfikowany wynik skopiowano do lokalnego `data/crypto-auto.json` do przeglądu; `crypto-manual.json` jest pusty. Przykłady pozostają tylko w docs i są odrzucane przez walidator.

Istniejący panel, CSS, responsywność i skrypty pozostałych funkcji pozostają zachowane. Kalendarz makro, jego kolektor i dane nie zostały zmienione. Wspólny workflow makro/Pages pakuje stronę przez `scripts/build-pages.cjs` z jawną listą plików i walidacją danych. Odrębna kontrola źródła Pages blokuje jego publikację przy ustawieniu `legacy`; wymagana jest opisana wyżej ręczna zmiana Settings. Stary `data/crypto-calendar.json` z danymi ICS pozostaje w repozytorium, poza artefaktem. Jeden dotychczasowy renderer krypto czyta dwa niezależne pliki:

- [`data/crypto-auto.json`](../../data/crypto-auto.json): jedyny plik wydarzeń zapisywany przez automat.
- [`data/crypto-manual.json`](../../data/crypto-manual.json): wpisy użytkownika; automat nie otwiera go do zapisu.

Model v2 w dotychczasowym `js/crypto-calendar-model.js` waliduje i scala oba zbiory. Panel pokazuje najbliższych pięć wydarzeń w oknie 30 dni, zgodnie z dotychczasowym limitem panelu; w plikach pozostaje pełna populacja. Ustawienie priorytetu z dawnego prototypu nie ukrywa ręcznych spekulacyjnych zapowiedzi. Okres zaczynający się wcześniej, ale nadal trwający, może wejść do okna; zakończone wydarzenia nie są wyświetlane. Brak wpisów jest prawidłowy i nie oznacza kompletnego pokrycia ekosystemu.

## Ręczna edycja z GitHuba, także z telefonu

1. Otwórz `data/crypto-manual.json` na gałęzi roboczej i wybierz ikonę ołówka / Edit. Na telefonie można edytować ten sam plik w przeglądarce GitHuba. Korzystaj z gałęzi i PR; zapis na main mógłby uruchomić istniejące Pages.
2. Skopiuj obiekt z [`crypto-manual.template.json`](crypto-manual.template.json) do tablicy `events`. Przy kolejnych obiektach dodaj przecinek między nimi. JSON nie pozwala na komentarze ani końcowe przecinki.
3. Zastąp wszystkie `UZUPELNIJ` i `YYYY...`, wpisz prawdziwe źródło HTTPS, własny tytuł i krótki opis. Usuń pole `example`. Bez tych zmian szablon celowo nie przejdzie walidacji.
4. Wybierz `assets`: BTC, ETH, DOT, XLM, ATH (Aethir), BONK, np. `["ETH", "DOT"]`. Każde wydarzenie ma stabilny, unikalny `id`; zmiana daty nie oznacza nowego identyfikatora.
5. Ustaw `confidence`: `confirmed` = potwierdzone, `expected` = oczekiwane, `speculative` = spekulacyjne. Własna analiza lub publiczne oczekiwanie nie staje się potwierdzonym terminem. `status`: `planned`, `postponed`, `cancelled`, `completed`.
6. `verifiedAt` to data faktycznego sprawdzenia źródła, w UTC, np. `2026-10-13T18:00:00Z`. Zmiana pliku ani pobranie go przez przeglądarkę nie odnawia tej daty. `origin` zawsze `manual`. Opis ma maksymalnie 360 znaków; zalecane jedno krótkie zdanie. Nie kopiuj opisów organizatorów.
7. Zapisz zmianę na gałęzi i przejrzyj testy PR. Lokalnie: `node scripts/update-crypto-calendar.cjs --validate`. Błędny plik nie wypiera ostatnich poprawnych danych w otwartej przeglądarce; drugi zbiór nadal działa.

Format terminu (wybierz jeden; poniższe terminy są wyłącznie przykładami formatu):

| Znana precyzja | `period` | Prezentacja |
| --- | --- | --- |
| Dzień | `{"precision":"day","date":"2026-10-20"}` | 20 PAŹ |
| Miesiąc | `{"precision":"month","month":"2026-11"}` | listopad 2026 |
| Tydzień | `{"precision":"week","from":"2026-10-19","to":"2026-10-25"}` | tydz. 19–25 PAŹ |
| Przedział | `{"precision":"range","from":"2026-10-20","to":"2026-10-23"}` | 20–23 PAŹ |

Tydzień obejmuje poniedziałek–niedzielę, oba końce przedziału są włączne. Miesiąc nie otrzymuje w danych sztucznego pierwszego dnia. `startsAt` ustaw na `null`, jeśli nie ma godziny. Dokładna godzina może być wyłącznie przy `precision: day`, w UTC, z dniem zgodnym z Europe/Warsaw. Nie wpisuj północy jako zastępstwa nieznanej godziny. Niedatowane TBD nie trafia do kalendarza.

## Duplikaty i korekty

Ręczna korekta ma pierwszeństwo. Dla wydarzenia z automatu użyj tego samego `id` (np. rzeczywistego ID odczytanego z pliku auto) albo własnego `id` i `overridesId` wskazującego automatyczny identyfikator. To usuwa z widoku starą wersję nawet po zmianie daty, tytułu lub statusu. Zachowaj korektę tak długo, jak ma obowiązywać; jej usunięcie przywróci automatyczny fakt, jeżeli nadal istnieje. `completed` może służyć do wyłączenia zakończonej pozycji.

Pozostałe identyczne fakty (aktywa + znormalizowany tytuł + precyzja/termin/godzina) scalają się niezależnie od identyfikatora i źródła; ręczny wygrywa, następnie nowsza weryfikacja. Różne nazwy tego samego zdarzenia wymagają wskazania wspólnego ID albo `overridesId`; nie stosujemy ryzykownego dopasowania podobnych tytułów. Powtórzone ID wewnątrz jednego pliku i sprzeczne ręczne korekty są błędem, zamiast losowego wyboru terminu.

## Źródła automatyczne i rzeczywisty test

Podstawa: [audyt 13.10.2026](../research-source-audit-2026-10-13/AUDYT.md), osobno sprawdzone licencje repozytoriów i zasady [GitHub API](https://docs.github.com/en/site-policy/github-terms/github-terms-of-service). Publiczny HTTP 200 i `publication.approved=true` nie są dowodem licencji.

| Źródło w rejestrze | Zakres / licencja | Lokalny przebieg 13.10, 21:02 UTC |
| --- | --- | --- |
| `eth-pm` | Agendy AllCoreDevs Execution, Consensus, Testing w Issues ethereum/pm; CC BY-SA 3.0. Pierwsze 100 otwartych issues, PR odrzucone; bez wyliczania kolejnych wystąpień. | HTTP 200: licencja i lista; 3 datowane przyszłe spotkania, 9 odrzuconych rekordów. |
| `eth-glamsterdam` | Tabela aktywacji EIP-7773 w ethereum/EIPs, CC0. Nie wszystkie przyszłe hardforki. | HTTP 200: licencja i plik; 0 przyszłych. Sepolia historyczna, Hoodi/Mainnet bez ustalonej daty. |
| `xlm-protocols` | Jawne nagłówki Mainnet/Testnet w Stellar Docs, Apache 2.0. Nie cały roadmap ani konferencje. | HTTP 200: licencja i plik; 0 przyszłych. Historyczne i niejednoznaczne nagłówki odrzucone. |

Wynik wcześniejszego lokalnego sprawdzenia: 6 odczytów, zgodne SHA blobów licencji, trzy przyszłe wpisy ETH. Szczegółowe artefakty pozostają lokalnie; krótkie wyniki zawiera [VALIDATION.md](VALIDATION.md). Pełne licencje i oznaczenia są w `data/crypto-licenses/`; wszystkie cztery wymagane pliki są jawnie wymienione w pakowaniu Pages. Agendy mają wskazanych autorów w rekordach; opracowane rekordy ethereum/pm pozostają na CC BY-SA 3.0. Nie kopiujemy agend ani meeting links do danych publicznych.

**BTC, DOT, ATH i BONK nie mają wdrożonego automatycznego adaptera.** Dla BTC audyt dopuszcza repozytoria Core/Optech, ale parser przyszłych harmonogramów nie został tu zaimplementowany; sam historyczny cel wydania v32.0 nie jest przyszłym wydarzeniem. DOT wymaga dopuszczonego, poprawnie dekodowanego kanału governance. ATH/BONK nie mają potwierdzonego stabilnego kanału z odpowiednimi uprawnieniami. Dla wszystkich sześciu działają wpisy ręczne. ETH/XLM mają celowo ograniczone pokrycie.

W nowej ścieżce nie ma Google ICS, Luma, Stellar Events CMS, stron EF/bloga, forum DOT, Polkassembly, Subsquare ani Aethir. Zachowano stare adaptery/testy i `data/crypto-calendar.json` jako zapis wcześniejszego stanu; renderer go nie pobiera i pakiet Pages go wyklucza. Historyczny kolektor nie może zapisać żadnego pliku `data/`. Stary pilotaż XLM jest niezależny, nadal wymaga własnego świadomego włączenia; nie należy go uruchamiać jako element hybrydowego kalendarza. Starsze dokumenty opisują wcześniejsze etapy, a bieżąca instrukcja jest tutaj.

## Cykl i obsługa awarii

Przygotowany `.github/workflows/crypto-calendar.yml` ma jeden dzienny cron `05:43 UTC` (07:43 CEST / 06:43 CET). **Nie został aktywowany w tej sesji.** Job wymaga main, nowej zmiennej `CRYPTO_HYBRID_ENABLED=true` oraz `CRYPTO_CALENDAR_APPROVED_SOURCES=eth-pm,eth-glamsterdam,xlm-protocols`. Dawne włączenie kalendarza ICS nie włącza tego wariantu. Zmiennych nie ustawiono. Schedule zacznie działać dopiero po późniejszym zatwierdzeniu, push, merge i świadomym włączeniu; GitHub może go opóźnić/pominąć.

Kolektor działa bez API keys i bez zewnętrznych pakietów. Maksymalnie 6 zapytań GitHub na przebieg, timeout 15 sekund na zapytanie, limit odpowiedzi 2 MiB, brak ponowień ani obchodzenia 403/429/redirectów. Nie pobiera dalszych stron listy; obecność `next` jest jawnie zapisana. Przed danymi każdego źródła sprawdza znany SHA licencji oraz zgodność SHA z treścią. Zmiana licencji zatrzymuje dane tego źródła do przeglądu. Zmiana formatu lub niejednoznaczny rekord powoduje pominięcie z powodem w logu.

Awaria jednego źródła nie zatrzymuje pozostałych, ale niedostępne źródło nie dostarcza nowych wydarzeń. Przy całkowitej awarii nie nadpisujemy ostatniego pliku auto. Ostatnie dane w przeglądarce zachowują pierwotną datę weryfikacji i mają widoczne oznaczenie błędu/nieświeżości; po 36 godzinach źródło jest nieświeże również bez błędu HTTP. Stare wydarzenia znikają po terminie. Ręczne dane nie zależą od świeżości automatu. Ich weryfikacja jest redakcyjna, a nie odnawiana przez cron.

Bot zapisuje wyłącznie `data/crypto-auto.json`, używa dotychczasowej blokady konkurencji z jobem makro, sprawdza zmianę HEAD i nie wykonuje force push. Workflow nie ma zadania Pages ani jego uprawnień. Istniejące Pages może później spakować ten plik w swoim zwykłym cyklu; nie uruchomiono tego teraz. Logi/receipts pozostają w artefaktach, poza `data/`. PR z edycją plików krypto wykonuje testy i walidację bez kolekcji sieciowej, zapisów i wdrożeń.

## Lokalna weryfikacja

```powershell
node --test tests/*.test.js
node scripts/update-crypto-calendar.cjs --validate
node scripts/preview-crypto-calendar.cjs --offline
```

Podgląd: http://127.0.0.1:4173/ — serwer tylko lokalny, czyta pliki; nie odpytuje źródeł kalendarza. Pozostałe istniejące widgety dashboardu nadal mają własne połączenia sieciowe. Jednorazowy test dopuszczonej automatyzacji: `node scripts/update-crypto-calendar.cjs --preview`; zapisuje wyłącznie `docs/crypto-calendar-hybrid/preview/`, nie pliki strony. Bez flag polecenie jest produkcyjne i wymaga powyższych blokad; nie uruchamiać przed zatwierdzeniem wdrożenia.

Schemat: [`calendar.schema.json`](calendar.schema.json). Walidacja wykonawcza dodatkowo sprawdza rzeczywistą poprawność dat, tygodni, UTC/Warszawy, unikalność ID, pochodzenie, licencje i świeżość źródeł. Nie zakładamy, że sam JSON Schema dowodzi wiarygodności zapowiedzi.

Wyniki testów i zakres regresji: [VALIDATION.md](VALIDATION.md).
