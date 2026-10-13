# Weryfikacja implementacji

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
