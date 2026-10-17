# Weryfikacja implementacji

## Ponowna weryfikacja 17.10.2026

- Pełny zestaw lokalny: **189/189**, bez błędów i pominięć; dodatkowy lokalny audyt XLM: **7/7**.
- Symulacja `git merge-tree --write-tree origin/main HEAD`, bez commita, zmiany indeksu, referencji ani roboczego scalenia. `origin/main`: `310297b9416dd73d406505ac60cc2b4fe0e50b91`; HEAD: `e44a5210a90e45485f560b57e9ec6d499eff5b73`. Nowe obiekty symulacji zapisano poza `.git`, w lokalnym katalogu dowodowym.
- Na wyeksportowany wynik symulacji nałożono lokalne poprawki (bez kolizji z plikami zmienionymi na main). Testy odpowiadające PR: **170/170**. Różnica 19 testów pochodzi z zachowanych, nieśledzonych lokalnych testów DOT.
- Walidacja wykonawcza obu zbiorów krypto oraz danych makro: sukces. Wszystkie cztery JSON-y w `data/` symulacji parsują się poprawnie. Stary JSON jest wyłącznie historyczny; poprawny składniowo nie oznacza dopuszczonego do publikacji.
- Końcowo sparsowano **62 JSON-y** w `data/` i `docs/` (bez cache i `node_modules`), sprawdzono składnię dziewięciu publicznych skryptów JS i obu bloków Node z instrukcji jednorazowego odświeżenia. Końcowy fetch nie zmienił SHA origin/main. `git diff --check` poprawny.
- Rzeczywista lista plików testowego TAR Pages: **18 plików**, bez starego JSON, `docs/`, `tests/`, `scripts/`, cache i plików projektu. Oba JSON-y hybrydowe oraz cztery pliki licencyjne obecne. Dane makro w artefakcie odpowiadają aktualnemu main; przy porównaniu Git/Windows uwzględniono LF/CRLF.
- Kod i dane makro, index, CSS i skrypty pozostałych paneli niezmienione. Sprawdzono kompletność lokalnych zależności HTML i zachowanie bajtów plików podczas pakowania. Testy obejmują kalendarz makro, Treasury, renderery i obsługę awarii. Nowej kontroli wizualnej ani działania usług zewnętrznych w rzeczywistej przeglądarce nie wykonano: inwentarz narzędzia przeglądarkowego jest pusty.
- GitHub API: Pages `build_type=legacy`, `source=main /`. Wykonane wcześniej przez GitHuba niezależne buildy własnego workflow i Jekylla miały sukces. Pobrany istniejący artefakt Jekylla ma 73 wpisy TAR, w tym stary JSON, 29 wpisów pod `docs/`, 12 pod `tests/`, 12 pod `scripts/` (liczby uwzględniają katalogi). Nie jest objęty listą dozwoloną własnego workflow.
- Nowe testy regresyjne odrzucają mieszane korekty `id`/`overridesId` w obu kolejnościach, również przy braku automatycznego wydarzenia w bieżącym zbiorze. Poprawne korekty i niezależne cele nadal przechodzą.
- Nie pobierano nowych danych krypto do plików produkcyjnych. Snapshot auto z 13.10 jest nieświeży; konieczne jest jednorazowe odświeżenie i przegląd według instrukcji wydania.

Dowody lokalne zachowano w `.cache/release-2026-10-17/`, w tym `tests-local.tap`, `tests-final.tap`, `json-and-syntax.json`, `github-settings.json`, `existing-deployments.json`, pobrany artefakt Jekylla i jego lista. Udana końcowa symulacja: `merge-check-MuZfO6/` (`verification-local.json`, `tests-simulated-merge.tap`, `pages-files.txt`, `pages-artifact.tar`). Zachowano też wcześniejsze próbne artefakty. Żaden z tych plików nie trafia do Pages.

**Gotowość: NIE — wymagana ręczna decyzja o przełączeniu źródła Pages i przegląd świeżych danych.** Nie wykonano commita, push, merge, deploy, uruchomienia produkcyjnego workflow ani zmiany ustawień GitHuba. Pełna procedura i propozycja PR są w [RELEASE-2026-10-17.md](RELEASE-2026-10-17.md).

## Wyniki historyczne z 13.10.2026

13.10.2026, gałąź `pilot/xlm-20261012`, bazowy commit PR #2: `c6e5a7a`.

- Pełny lokalny zestaw: **182/182**, bez błędów i pominięć.
- Pliki testowe istniejącego PR + nowe testy tej implementacji, bez dwóch wcześniejszych nieśledzonych lokalnych zestawów DOT: **163/163**. Różnica 19 testów pochodzi z istniejących lokalnych audytów DOT, nie z nowej implementacji.
- `node scripts/update-crypto-calendar.cjs --validate`: oba zbiory poprawne, ręczny pusty, trzy rzeczywiste zweryfikowane wpisy ETH. Szablon w docs celowo nie może przejść walidacji jako rzeczywisty wpis.
- Lokalny cold probe: **6 × HTTP 200**, trzy licencje oraz trzy odpowiedzi z danymi. Licencje zgodne z przypiętymi SHA; ETH = 3, XLM = 0, BTC/DOT/ATH/BONK = 0. Szczegółowy wynik pozostaje lokalnie. Nie wykonywano przebiegu produkcyjnego ani joba Actions.
- Testy obejmują pierwszeństwo ręcznych korekt, deduplikację, sprzeczne ID, wszystkie aktywa, dni/tygodnie/miesiące/przedziały, granice okna i zmianę czasu, XSS/niebezpieczne URL, przyszłą lub błędną weryfikację, szablony, ochronę ręcznych/makro/starych danych, licencje i blokady publikacji, częściowe/całkowite awarie, 304 bez nowej treści, zamknięte agendy i przesunięcie daty.
- Zachowano historyczne testy ICS i XLM jako lokalne testy z fikcyjnymi fixture. Testy produkcyjnej ścieżki zaktualizowano do licencjonowanych kanałów; dawny test świadomie dopuszczający publikację przy `licenseConfirmed=false` zastąpiono testem odrzucającym taki przypadek.
- Podgląd przeglądarkowy: 1280 px oraz 390 px, trzy rekordy krypto i pięć makro. Przy 390 px brak poziomego overflow. Zrzuty pozostają lokalnie. Nie zmieniono CSS, siatki ani breakpointów. Wysokość treści kalendarza nadal zależy od liczby i długości wydarzeń, tak jak w dotychczasowym układzie.
- `git diff --check`: poprawny. `git diff HEAD` potwierdza brak zmian CSS, kodu i danych makro oraz danych starego kalendarza. Wspólny workflow makro/Pages ma wyłącznie trzy dodatkowe linie pakowania, które wykluczają stary JSON ICS z publicznego `_site`; kolekcja makro, jej harmonogram i deploy pozostają bez zmian. Pozostałe widgety dashboardu były widoczne w podglądzie; regresje modeli i funkcji obejmuje cały zestaw testów.
- Lokalnie wykonano dokładny blok Bash `Package public site` wyodrębniony z workflow, w oddzielnym katalogu testowym. Wynik wcześniejszej lokalnej weryfikacji pakietu: nowe oba zbiory i licencje obecne, stary JSON ICS wykluczony, oryginał zachowany, SHA-256 danych makro niezmienione. Nie uruchomiono workflow ani deploy.

Zakres zapisu: implementacja hybrydowa, niezbędne testy, dane, licencje oraz dokumentacja źródeł i obsługi ręcznej. Wcześniejsze audyty DOT/XLM, logi TAP, PNG i szczegółowe wyniki prób pozostają lokalnie. Do commita wybrano pliki selektywnie.

Zapis na gałęzi draftu nie aktywuje crona ani Pages. Merge, wdrożenie i świadome włączenie nowego crona pozostają osobnymi decyzjami. Rozszerzenie BTC/DOT/ATH/BONK jest osobną decyzją dotyczącą źródeł oraz adapterów; brak wpisów tych aktywów nie jest dowodem ich braku w ekosystemie.
