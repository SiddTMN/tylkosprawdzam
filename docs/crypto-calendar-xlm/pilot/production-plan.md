# XLM na produkcyjnej stronie — zakres i warunki

Zweryfikowano 12.10.2026. Cel: codzienny test na https://siddtmn.github.io/tylkosprawdzam/ do końca 12.11.2026 w Europe/Warsaw. Nie wykonano scalenia, wdrożenia ani kontaktu z organizatorami.

## Czy Stellar Events dopuszcza nasz zakres?

**Nie znaleziono wyraźnej zgody obejmującej regularne pobieranie i publiczne wyświetlanie metadanych wydarzeń.** To brak potwierdzonej podstawy, nie twierdzenie, że każda wzmianka o wydarzeniu jest zakazana.

[Warunki SDF](https://stellar.org/terms-of-service), obowiązujące od 23.03.2026, sekcja „Intellectual property rights”, dopuszczają użytek osobisty i niekomercyjny. Publiczne użycie części Services wymaga wyraźnej zgody albo podstawy wynikającej z właściwego prawa autorskiego/znaków towarowych. Warunki pobrania treści przewidują użytek osobisty, brak modyfikacji i brak dystrybucji. Sam publiczny HTTP 200, osadzony JSON CMS, mała częstotliwość czy link zwrotny nie stanowią zgody. [Meridian Addendum](https://stellar.org/meridian-addendum), obowiązujące od 11.06.2026, uzupełnia te warunki; nie znalazłem wyjątku zezwalającego na nasz agregator.

Daty jako fakty i krótkie nazwy zwykle nie są chronione prawem autorskim — por. [US Copyright Office](https://www.copyright.gov/help/faq/faq-protect.html). Własny krótki opis ogranicza kopiowanie cudzej formy wypowiedzi. Nie rozstrzyga to jednak obowiązków z regulaminu, ochrony zbioru danych ani oznaczeń. Nie przyjmujemy automatycznie, że niechroniony pojedynczy fakt daje prawo do regularnego pobierania i publikacji całej selekcji. To właśnie nierozstrzygnięty zakres, który blokuje Stellar Events w produkcji. Nie kopiujemy grafik, logotypów ani rozbudowanych opisów.

`publication.approved=false`, `localOnly=true`, blokada zapisu do `data/`, blokada schedulera i walidacja publicznego modelu pozostają bez zmian. Lista zatwierdzonych źródeł w zmiennej środowiskowej nie obchodzi tych kontroli. Próby techniczne nie tworzą uprawnienia do publicznego wykorzystania.

## Wariant docelowy: obecny adapter i wspólnych pięć pozycji

Najkrótsza droga zachowująca wszystkie wymagania to pisemne potwierdzenie SDF dla poniższego zakresu. Po otrzymaniu dowodu można przygotować oddzielną, reviewowaną zmianę publikacji tego źródła — nie usuwać ogólnych zabezpieczeń. W tym PR nie ma takiej zgody ani aktywacji.

Po potwierdzeniu:

1. Do rejestru produkcyjnego włączyć **istniejący** adapter, bez zmiany adaptera ETH. Zachować jego daty oryginalne, Europe/Warsaw, filtr LOW, deduplikację i anulowania.
2. Generować wspólny zatwierdzony JSON w dotychczasowym jobie co 6 godzin, zachowując concurrency i mechanizm commit/rebase. Nie dodawać drugiego autora commitów tego samego pliku. Z awarii XLM nadal otrzymać ETH i ostatnie poprawne XLM z prawdziwym czasem weryfikacji; przy braku ostatnich danych pominąć XLM.
3. Ten sam renderer wybiera chronologicznie najwyżej 5 wydarzeń łącznie, najwyżej 3 jednego tokena przy innych wartościowych wydarzeniach. Nie zwiększać limitu i nie przesuwać `verifiedAt` przy odczycie starego cache.
4. Zatwierdzić osobno scalenie i wdrożenie. Rozpoczęcie oceny użyteczności liczyć od pierwszego rzeczywistego pojawienia się XLM na stronie, nie od pierwszego testu runnera. Koniec pozostaje stały: 12 listopada włącznie.

### Gotowy zakres prośby do SDF — do wysłania przez właściciela

> We operate the public, non-commercial crypto dashboard https://siddtmn.github.io/tylkosprawdzam/. May we fetch the public Stellar Events Hub at https://stellar.org/events at most once every six hours through GitHub Actions, cache the response for that interval, and publish selected upcoming event names, original start/end dates, links to the official pages and short descriptions written by us? We would not copy images, logos or your extended descriptions. The shared calendar shows at most five ETH/XLM events, with source links, genuine verification times and stale-data notices. Our pilot runs through 12 November 2026, Europe/Warsaw. Please confirm whether this collection, caching and public display are permitted, any required attribution or rate limits, and whether the permission covers public GitHub JSON storage. Please specify any restrictions on continued use after the pilot.

Nie wysłano tej wiadomości. Odpowiedź musi obejmować zbieranie **i** publiczną publikację, nie tylko dostęp do strony; trzeba odnotować zakres i ewentualną datę wygaśnięcia zgody. Po pilotażu zatrzymać XLM, jeśli nie ma podstawy do kontynuowania publikacji.

## Najszybsza alternatywa bez kopiowania rekordów Stellar Events

**Oficjalny embed Luma otrzymany od właściciela kalendarza/wydarzenia**, osadzony na produkcyjnej stronie po zatwierdzeniu wdrożenia. [Dokumentacja Luma](https://help.luma.com/p/embed-luma-on-your-website) wprost opisuje osadzanie wydarzeń i kalendarzy; kod kalendarza właściciel uzyskuje w Settings → Embed. [Warunki Luma](https://luma.com/terms), „Copyright, Trademarks, and other Intellectual Property”, przewidują wyjątek dla rzeczywistego korzystania przez publicznie wspierane interfejsy. Ta podstawa dotyczy oficjalnego embedu; **nie** nadaje automatycznie prawa do eksportu ICS i republikacji w naszym JSON. Należy potwierdzić zakres konkretnego embedu z organizatorem i jego dodatkowe warunki. Nie zgadujemy prywatnych endpointów ani nie obchodzimy ograniczeń iframe.

Treści byłyby dostarczane i aktualizowane przez Luma, bez zapisu treści SDF w repozytorium. Można umieścić widget przy kalendarzu i oceniać wydarzenia podczas korzystania z dashboardu. Awaria widgetu nie powinna wpływać na istniejący ETH/makro, a nasz techniczny harmonogram co 6 godzin pozostaje bez zmian. Odświeżanie widgetu jest jednak mechanizmem Luma, nie naszym zweryfikowanym adapterem.

**Granice tej alternatywy:** nie da się bezpiecznie odczytywać i filtrować obcego iframe do wspólnych pięciu pozycji, dopisywać własnych opisów w nim ani gwarantować aktualizacji co 6 godzin. Lumen Loop nie miał głównego Meridian w audycie. Osobny embed pozwala sprawdzić ogólną przydatność wydarzeń na stronie, ale nie spełnia pełnego testu wspólnego adaptera ETH + XLM. Nie dodano go teraz do kodu produkcyjnego: brakuje kodu embedu potwierdzonego przez organizatora i decyzji o tym ograniczonym wariancie.

Jeżeli **wspólnych pięć pozycji i nasz cykl 6 godzin są obowiązkowe**, alternatywą jest mały kanał metadanych dostarczony bezpośrednio przez organizatora z wyraźną zgodą na publikację (np. jego JSON/ICS), z naszymi opisami. Taki kanał może być kolejnym źródłem XLM w obecnej architekturze. Obecnie nie mamy takiego kanału ani zgody; nie wytwarzamy jej przez ręczne skopiowanie z blokowanego hubu. To samo dotyczy „ręcznie zatwierdzonego” JSON utworzonego z niedopuszczonych danych.

## Stan faktyczny

PR przygotowuje termin końcowy i dokumentuje drogę do produkcji. **XLM nie jest jeszcze na publicznej stronie; test użyteczności nie został uruchomiony.** Pozostają dwa warunki: podstawa korzystania z danych albo zaakceptowany oficjalny embed oraz potwierdzenie scalenia/wdrożenia przez właściciela. Żaden sukces Actions nie zastępuje tych warunków.
