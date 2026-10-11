# Wdrożenie ETH — instrukcja operacyjna

Zakres: tylko Ethereum Protocol Calls, AllCoreDevs Execution i Consensus z
potwierdzoną przyszłą datą i godziną. Publikowane są nazwa, ETH, termin, własny
krótki opis, priorytet spotkania i odnośnik do źródła. Bez cudzych rozbudowanych
opisów, grafik i danych uczestników.

Zgoda użytkownika obejmuje wdrożenie projektu. **Nie jest licencją właściciela ICS.**
Metadane publikacji rozróżniają tę zgodę: scope=project-publication-only,
licenseConfirmed=false, reuse=review-required. Warunki systematycznego pobierania
i publicznego wykorzystania pozostają do wyjaśnienia. Nie stosujemy kluczy,
obejścia blokad, przekierowań ani ponowień po 403/429.

## Aktywacja i wyłączenie

Workflow crypto-calendar.yml działa na main co 6 godzin:
00:43, 06:43, 12:43 i 18:43 UTC. GitHub może opóźniać wykonanie.

Zmienne repozytorium:
- CRYPTO_CALENDAR_ENABLED=true;
- CRYPTO_CALENDAR_APPROVED_SOURCES=eth-protocol-calls.

APPROVED_SOURCES oznacza projektową zgodę operatora na wskazany zakres publikacji,
nie oświadczenie o uzyskaniu licencji.

**Szybkie wyłączenie:** ustaw CRYPTO_CALENDAR_ENABLED=false. Kolejne przebiegi
nie pobiorą ICS. Makro, wiadomości, wykresy i pozostałe funkcje strony działają
niezależnie. Jeśli pobieranie jest już w toku, anuluj konkretny przebieg crypto
w Actions. Opublikowany JSON pozostaje; przyszłe wpisy starzeją się według verifiedAt
i znikają po swoim terminie. Usunięcie opublikowanych pozycji można wykonać
osobną zatwierdzoną zmianą pliku, bez ponownego odczytu ICS.

## Zapis i awarie

Nowy publiczny JSON powstaje tylko po aktualnym HTTP 200 z poprawnym ICS,
dowodem pobrania (czas, rozmiar, SHA-256) i walidacją modelu.
Przy awarii jedynego obecnego źródła workflow kończy się błędem, a poprzedni
JSON pozostaje bajt w bajt bez zmian. Nie podnosi verifiedAt.
Frontend pokazuje nieświeżość po ponad 6 godzinach od rzeczywistej weryfikacji,
odrzuca minione pozycje i rozróżnia błąd od poprawnego pustego kalendarza.
Poprawny świeży pusty ICS usuwa wcześniejsze wydarzenia.
Lokalny kolektor zachowuje dotychczasowe cache i jawne oznaczanie błędów.

Workflow publikuje wyłącznie data/crypto-calendar.json. Oba automaty współdzielą
concurrency calendar-data-${{ github.ref }} z cancel-in-progress:false.
Makro zapisuje tylko data/macro-calendar.json. Nie stosujemy force-push;
zmiana main przez innego autora w trakcie generowania zatrzymuje publikację crypto.

## GitHub Pages

Krypto nie ma własnego zadania wdrażania Pages. Istniejący workflow makro
pakuje oba pliki JSON i publikuje stronę. Aktualizacja repozytorium przez
GITHUB_TOKEN nie jest traktowana jako gwarancja uruchomienia workflow push.
Cykliczny workflow makro odświeża Pages; weryfikacja pierwszej publikacji obejmuje
jego rzeczywisty przebieg i porównanie publicznego JSON z aktualnym origin/main.
Nie przebudowano interfejsu strony.

## Dowody wdrożenia

Przed scaleniem wymagane są pełne testy lokalne oraz poprawne checki PR.
Konflikt, nieoczekiwana zmiana lub błąd testów zatrzymuje wdrożenie.
Pełny sukces wymaga produkcyjnego HTTP 200, zwalidowanego i wypchniętego JSON,
udanego Pages oraz kontroli obu kalendarzy online.
Wyniki bieżącego wdrożenia będą przedstawione w raporcie sesji.
