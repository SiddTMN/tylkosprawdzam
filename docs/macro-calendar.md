# Kalendarz makro — etap 2

Źródłem pozostaje wyłącznie FinanceCalendar. Nie dodano Treasury ani innych dostawców.

## Lokalna weryfikacja

Wymagany Node.js 24, bez instalowania zależności:

    node --test tests/*.test.js
    node scripts/generate-macro-calendar.cjs

Generator pobiera zakres od dzisiejszej daty UTC do UTC + 14 dni, z limitem API 100.
Waliduje odpowiedź, usuwa tylko identyczne rekordy, wybiera przyszłe HIGH/MEDIUM,
sortuje chronologicznie i zachowuje wszystkie kwalifikujące się wydarzenia w tym
zakresie. Limit pięciu stosuje dopiero panel. Nie przypisuje własnej ważności.

## Kontrakt data/macro-calendar.json

- schemaVersion: 1, source: FinanceCalendar.
- generatedAt: czas wygenerowania w ISO 8601 UTC.
- queryTimezone: UTC, displayTimezone: Europe/Warsaw.
- range.from, range.to: daty zapytania YYYY-MM-DD, różnica 14 dni.
- events: name, category, impact, kind, sortAt, expiresAt.
- sortAt i expiresAt: liczby całkowite, milisekundy od epoki UTC.
- kind: timed, all-day lub unknown-time. Dla godzinowej publikacji oba znaczniki
  są równe. Dla dwóch pozostałych oznaczają początek dnia i kolejną północ
  w Warszawie, z uwzględnieniem DST. Panel wyświetla wtedy „—”.

Adapter js/calendar-model.js jest wspólny dla generatora i przeglądarki.
Puste poprawne odpowiedzi są dozwolone. Błędy HTTP/JSON, timeout, błędna struktura
lub choć jeden niepoprawny rekord zatrzymują generator przed zastąpieniem pliku.
Zapis odbywa się przez plik tymczasowy i zmianę nazwy; poprzedni JSON pozostaje
nietknięty po błędzie pobierania lub walidacji.

## Fallback i wygląd

Panel pobiera ./data/macro-calendar.json bez cache raz na godzinę. Ścieżka działa
również w podkatalogu GitHub Pages. Plik do sześciu godzin jest źródłem podstawowym.
Starszy, brakujący lub niepoprawny plik uruchamia dotychczasowe API FinanceCalendar.
Każde pobranie ma osobny timeout 15 sekund, z blokadą równoległych odświeżeń.

Jeżeli API również zawiedzie, panel wybiera najnowsze dostępne poprawne dane
(z pliku lub pamięci otwartej strony), ponownie odrzuca minione wydarzenia i oznacza
wynik data-stale oraz podpowiedzią z datą aktualizacji. Nieaktualny pusty wynik
pokazuje „kalendarz niedostępny”, ponieważ nie potwierdza braku przyszłych wydarzeń.
Plik poza swoim zakresem ważności nie jest używany. Udane pobranie usuwa oznaczenie.

Klasy CSS, struktura wierszy, filtr HIGH/MEDIUM, pięć pozycji, godziny Europe/Warsaw,
link źródłowy i godzinne odświeżanie pozostały zachowane. CSS nie został zmieniony.
DXY, Snapshot, wykresy i newsy nie otrzymują zmian.

## GitHub Actions i GitHub Pages

Workflow .github/workflows/macro-calendar.yml działa o 17. minucie każdej godziny
UTC, ręcznie przez workflow_dispatch oraz po zmianach strony/kalendarza na main.
GitHub może opóźniać zadania harmonogramu. PR-y uruchamiają wyłącznie testy.

Po testach workflow generuje i waliduje JSON, tworzy commit bota obejmujący tylko
ten plik i wykonuje zwykły push na main. Konflikt zapisu zatrzymuje zadanie;
nie ma force-pusha. Błąd generatora zatrzymuje publikację i pozostawia ostatni
działający plik oraz witrynę. Repozytorium z ochroną main musi dopuszczać taki
zapis tokenem workflow; bez tego zadanie zgłosi błąd.

Następnie ten sam workflow publikuje artefakt z index.html, css/, js/, data/.
Nie publikuje .git, testów, skryptów, lokalnych załączników ani dokumentacji.
Nie wymaga PAT ani dodatkowego źródła danych. Uprawnienia zapisu są ograniczone
do odpowiednich zadań. Oficjalne akcje przypięto do zweryfikowanych SHA.

Użyto bezpośredniego deploy-pages, ponieważ push z GITHUB_TOKEN nie uruchamia
kolejnego workflow. Nie trzeba polegać na automatycznym buildzie po commicie bota.

Przed pierwszym uruchomieniem po zatwierdzonym pushu:
1. Sprawdź Settings → Pages; zalecana opcja Source to **GitHub Actions**.
   Workflow korzysta z istniejącej witryny i sam nie zmienia tej konfiguracji.
2. Sprawdź dostępność zapisu contents dla GitHub Actions oraz reguły main.
3. Uruchom **Macro calendar and Pages** ręcznie i sprawdź wynik deploy.
4. Otwórz stronę i data/macro-calendar.json, sprawdź generatedAt i pięć pozycji.

Dokumentacja GitHub:
- https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow
- https://github.com/actions/deploy-pages

Samo przygotowanie tych plików lokalnie nie uruchamia Actions ani publikacji.
