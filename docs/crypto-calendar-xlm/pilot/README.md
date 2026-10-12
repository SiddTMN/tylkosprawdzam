# XLM — pilotaż do 12 listopada 2026

**Cel po korekcie:** ocena wydarzeń podczas codziennego korzystania z [produkcyjnego dashboardu](https://siddtmn.github.io/tylkosprawdzam/). Same statystyki Actions ani lokalny podgląd nie realizują tego celu. Ten PR nadal dostarcza kolektor techniczny; start rzeczywistego testu użyteczności wymaga zgodnego kanału publikacji i osobno zatwierdzonego wdrożenia. Nie przedstawiamy prób runnera jako rozpoczętego pilotażu na stronie.

Weryfikacja warunków i warianty udostępnienia: [production-plan.md](production-plan.md). Nie ma obecnie podstawy do wyłączenia blokady Stellar Events. Zmiana terminu nie jest zgodą na publikację ani na szerszy zakres pobierania.

Pilotaż jest **artifact-only**. Rejestr produkcyjny nadal zawiera wyłącznie ETH, a `publication.approved=false` i `localOnly=true` Stellar pozostają wymuszane przez adapter, model i generator. Nie ma publikacji rekordów XLM, zapisu do produkcyjnych JSON, automatycznych commitów ani wdrażania Pages. Źródło: oficjalny [Stellar Events Hub](https://stellar.org/events); nie dodano Lumen Loop.

## Przygotowanie i próba runnera

Gałąź `pilot/xlm-20261012` powstała po synchronizacji fast-forward z `origin/main`. W chwili synchronizacji bazą był `9f4f541`; sześć pobranych commitów zmieniało jedynie JSON ETH/makro. Istniejące lokalne audyty DOT i pełne rekordy XLM nie należą do tego PR i nie są wysyłane do publicznego repozytorium.

Pierwszy push na gałąź uruchamia `XLM artifact-only pilot` w trybie **probe** na `ubuntu-latest`. Ten tryb:

1. instaluje przypięty `ical.js` i uruchamia cały zestaw testów z checkoutu;
2. tworzy nowy, pusty katalog źródeł, bez restore cache treści;
3. pobiera prawdziwe HTTP 200 Stellar i ETH, waliduje wspólny kalendarz;
4. zapisuje dowód statusu HTTP, wielkości odpowiedzi i SHA-256;
5. przesyła wyłącznie statystyki i historię ze skrótami identyfikatorów jako `xlm-pilot-RUN_ID-ATTEMPT`, z retencją 45 dni dla nowych runów.

HTTP 304, stary cache i same wcześniejsze rekordy nie mogą spełnić `coldHttp200Passed`. Dowód zawiera rzeczywisty `checkedAt`, `verifiedAt`, identyfikator runa, commit i deklarację `RUNNER_ENVIRONMENT=github-hosted`. Czas odczytu cache nigdy nie zastępuje rzeczywistej weryfikacji.

Repozytorium jest publiczne: **artefakty i cache mogą być dostępne dla innych użytkowników GitHub**. Dlatego nie zawierają tytułów wydarzeń, ich URL, dat terminów, rozbudowanych opisów, surowego HTML/ICS ani pełnego wspólnego JSON. Dane te pozostają w jednorazowym prywatnym katalogu roboczym runnera i nie są przesyłane. Lokalnie można je sprawdzić w odrębnym podglądzie. Statystyki nie nadają rekordom uprawnienia do publicznej publikacji.

## Uruchomienie cyklu

[GitHub cron i workflow_dispatch wymagają workflow na domyślnej gałęzi](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow). Próba przez push działa na gałęzi testowej; **nie uruchamia jeszcze harmonogramu ani testu użyteczności na stronie**.

Aktywacja cyklu wymaga najpierw zatwierdzonego scalenia PR. Nie wykonujemy tego automatycznie: aktualna konfiguracja repozytorium uruchamia Pages po zmianach `main`. PR nie zawiera pełnych danych XLM ani ich wpisu w produkcyjnym rejestrze, ale samo scalenie zmienia kod strony i może wywołać jej istniejący deployment.

Po zatwierdzonym scaleniu, w **Settings → Secrets and variables → Actions → Variables** ustawić:

- `XLM_PILOT_START_AT`: rzeczywisty planowany początek, w UTC, np. format `YYYY-MM-DDTHH:mm:ss.sssZ`;
- `XLM_PILOT_ENABLED`: `true`.

Nie są to sekrety ani zgoda na publikację Stellar. Wartości nie zmieniają `CRYPTO_CALENDAR_APPROVED_SOURCES`. Opcjonalne ręczne uruchomienie workflow w trybie `sample` stosuje te same ograniczenia. Tryb `probe` służy wyłącznie świadomemu jednorazowemu testowi na zimnym cache.

Cron: **`43 */6 * * *`**, czyli 00:43, 06:43, 12:43, 18:43 UTC. Okno trwa **do końca 12 listopada 2026 w Europe/Warsaw włącznie**: granica wyłączna `2026-11-12T23:00:00.000Z` = 13 listopada 00:00 CET. Jest stała, niezależna od dnia startu; nie ma automatycznego zakończenia po 14 dniach. Start równy tej granicy lub późniejszy jest odrzucany. Przed startem, po końcu lub przy wyłączeniu kolektor nie odpytuje źródeł. GitHub może opóźniać harmonogram.

Kolektor wymusza co najmniej 6 godzin między próbami XLM i respektuje dłuższy `Retry-After`/reset limitu. Wcześniejsze uruchomienie lub opóźnienia powodujące krótszy odstęp mogą pominąć próbę XLM — taki przypadek jest jawnie zapisany jako `backoff-skip`, a nie udana weryfikacja. ETH nadal jest odczytywane w aktywnej próbce; produkcyjny workflow ETH pozostaje całkowicie niezależny.

Cache Actions przechowuje tylko historię liczników, skróty tożsamości i czas następnej dozwolonej próby. Nie przechowuje treści SDF. Właściwe próby wykonują nowy GET, więc statystyka stabilności nie jest odczytem starych rekordów. Przerwa po nieudanej próbie również jest zachowywana. Wspólny `calendar-data-${github.ref}` serializuje zadania tak jak istniejące workflow i zabezpieczenia commitów pozostają niezmienione. Pilotaż nie ma uprawnienia `contents:write` i niczego nie commituje.

## Zatrzymanie

- Ustawić `XLM_PILOT_ENABLED=false` — kolejne próbki będą no-op bez odczytu zewnętrznych źródeł.
- W razie potrzeby anulować aktualnie trwający run w Actions; zmiana zmiennej nie cofa żądania już wykonanego.
- Po końcu 12 listopada w Warszawie kolektor przestaje pobierać dane, nawet jeżeli zmienna nadal ma `true`. Nie zatrzymuje się wcześniej po 14 dniach.
- ETH i makro nadal działają przez swoje dotychczasowe workflow.

Nowy pilotaż powinien mieć nowy `XLM_PILOT_START_AT`; odrębny prefiks cache uniemożliwia mieszanie okresów. Nie usuwać artefaktów przed oceną.

## Ocena po zakończeniu 12 listopada

Do oceny użyteczności potrzebne są obserwacje **z produkcyjnej strony**. W czasie rzeczywistego testu zapisywać w prostym dzienniku: dzień, liczbę widocznych ETH/XLM, czy XLM pomogło podjąć działanie, co nowego wnosiło, podejrzane daty/duplikaty oraz ocenę `przydatne / rutynowe / nieprzydatne`. Nie zbieramy automatycznie danych użytkowników. Po 12 listopada zestawić ten dziennik z licznikami technicznymi poniżej. Brak dni z XLM w produkcji oznacza **brak testu użyteczności**, nawet przy poprawnych odczytach Actions. Dostępność źródła i liczba rekordów nie dowodzą ich przydatności.

Pobrać artefakty **sample** dla danego startu z zakładki Actions i rozpakować do jednej lokalnej struktury katalogów. Artefaktu jednorazowej próby `probe` nie mieszać z innym okresem. Uruchomić:

```powershell
node scripts/summarize-xlm-pilot.cjs PATH_DO_ROZPAKOWANYCH_ARTEFAKTOW
```

Skrypt łączy kumulatywne historie, deduplikuje próbki i wykrywa sprzeczności; nie sumuje wielokrotnie tego samego stanu cache. Można również podać pojedynczy `history.redacted.json`, ale brak części artefaktów lub utrata cache oznacza niepełną historię. `baselineSegments` wskazuje ponowne utworzenie baz po utracie historii; nie należy przedstawiać takiej próby jako kompletnego pomiaru całego okresu. Nowe artefakty mają retencję 45 dni, obejmującą okres 12 października–12 listopada i późniejszą ocenę. Starsze artefakty zachowują pierwotną retencję 30 dni, więc pobrać je przed wygaśnięciem.

| Pytanie | Pole wyniku | Interpretacja |
| --- | --- | --- |
| Ile wartościowych wydarzeń znaleziono? | `uniqueValuableIdentities` | Unikalne tożsamości HIGH/MEDIUM widziane w oknie 30 dni. |
| Ile było nowych? | `newIdentitiesAfterBaseline` | Tożsamości pierwszy raz zaobserwowane po pierwszej poprawnej próbce. Pierwsza baza nie jest nową podażą. |
| Czy źródło powtarzało te same wpisy? | `repeatedObservations` | Powtórne obserwacje znanych wydarzeń; nie są błędem ani nowym wydarzeniem. |
| Czy źródło miało faktyczne duplikaty? | `duplicateRecords` | Powtórne rekordy wewnątrz odpowiedzi, usunięte przez adapter. |
| Czy zmieniały się terminy/statusy? | `dateOrStatusRevisions` | Zmiany skrótu dat/statusu tej samej tożsamości. Mogą oznaczać przełożenie lub nowy termin cyklicznego spotkania. |
| Czy występowały błędne dane? | `invalidOrConflictingResponses` | Odpowiedzi odrzucone przez walidację; nie dowodzi, że każdy poprawny formalnie termin jest prawdziwy. |
| Czy dominowały rutynowe spotkania? | `routineShare`, `routineIdentities` | Udział unikalnych spotkań protokołowych, a nie udział powtórnych odczytów tych samych rekordów. |
| Czy godziny były niejasne? | `unresolvedClockObservations` | Obserwacje niepotwierdzonych etykiet godziny; nie zgadujemy stref. |
| Czy źródło działało stabilnie? | `fetchAttempts`, `availability`, `failedFetches` | Udane rzeczywiste HTTP 200 z poprawną treścią podzielone przez faktyczne próby; pominięcia backoff nie są sukcesem. |

„Nowe” oznacza nowe dla pilotażu, nie dowód nowego ogłoszenia SDF. Zmiana daty nie jest automatycznie nową konferencją lub błędem. Po zakończeniu trzeba sprawdzić lokalnie użyteczność nazw i programu wydarzeń oraz porównać podejrzane terminy z aktualną stroną organizatora; metryki nie zastępują tej oceny.

## Lokalny podgląd

```powershell
node scripts/test-xlm-calendar-live.cjs
node scripts/preview-crypto-calendar.cjs --xlm --offline --port 4174
```

Pierwsze polecenie świadomie pobiera świeże źródła do lokalnych plików, drugie pokazuje aktualny wspólny JSON pod http://127.0.0.1:4174/. Nadal obowiązuje limit **5 wspólnie** i maksymalnie **3 jednego tokena**, gdy są inne wartościowe wydarzenia. Pliki produkcyjne i adapter ETH nie są zmieniane. Podgląd nie uruchamia regularnego pobierania SDF. Po sześciu godzinach starsze weryfikacje są oznaczane jako nieświeże.

Bezpośrednia lokalna próba samego kolektora, z osobnymi wynikami w ignorowanym `.cache`:

```powershell
node scripts/run-xlm-pilot.cjs --mode probe
```

## Zabezpieczenia i warunki

Nie potwierdzono uprawnienia do publicznej republikacji informacji Stellar; pozostaje blokada opisana w [warunkach SDF](https://stellar.org/terms-of-service). Pilotaż techniczny nie oznacza takiej zgody i nie włącza XLM do GitHub Pages. Oryginalne daty, rzeczywiste `verifiedAt`, status stale/unavailable, filtr LOW i izolacja błędów są zachowane. Dłuższe opisy źródłowe nie trafiają do UI ani artefaktów.

Nie wykonuje się scalenia ani publicznego wdrożenia bez dodatkowego potwierdzenia użytkownika. Wynik faktycznej próby runnera, identyfikatory runa i artefaktu powinny być sprawdzane w Actions; lokalnego wyniku nie można przedstawiać jako GitHub-hosted testu.
