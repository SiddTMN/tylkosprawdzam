# Kalendarz krypto — kontynuacja audytu: ICS i OpenGov

Test: **11.10.2026**, okno **11.10–09.11.2026 włącznie**, Europe/Warsaw. Wydarzenia z godziną muszą również zaczynać się po chwili testu. Wynik pochodzi z rzeczywistych odpowiedzi HTTP, nie z przykładowych wydarzeń ani wyników wyszukiwarki.

**Alternatywy przyniosły 24 przyszłe spotkania Ethereum i 1 przyszły webinar SDF. Odczyt bez płatnego API jest wykonalny. Ich publiczne przetwarzanie do własnego JSON wymaga jeszcze wyjaśnienia warunków organizatorów.** Dla DOT działa dopuszczone źródło monitoringu 5 aktywnych referendów, lecz bez wiarygodnych terminów kalendarzowych.

Kontynuowano istniejący skrypt, testy oraz raport. Nie zmieniono strony, danych produkcyjnych ani workflow; bez commita, pusha i publikacji. Poprzednie wyniki zachowano.

## Liczby na następne 30 dni

| Token | Poprawnie pobrane i dopuszczone do publicznego kalendarza | Pobrane, publiczne wykorzystanie do wyjaśnienia | Dodatkowe odrzucone pozycje z przyszłą datą |
| --- | ---: | ---: | ---: |
| ETH | 0 | 24 | 0 |
| DOT | 0 | 0 | 0 |
| XLM | 0 | 1 | 5 |

Osobno: **5 aktywnych referendów DOT bez terminu**, więc nie są ani przyszłymi datowanymi wydarzeniami, ani pięcioma różnymi datami zakończenia. Meridian 2026 pozostaje ręcznie zweryfikowanym przypadkiem kontrolnym, poza powyższymi licznikami. Odrzucenia archiwalnych artykułów, protokołów i wydań z pierwszego etapu pozostają w JSON.

24 pozycje ETH to **spotkania protokołowe**, nie zapowiedzi 24 aktualizacji ani 24 formalne głosowania. Jest wśród nich 9 AllCoreDevs: 5 Testing, 2 Consensus, 2 Execution; pozostałe 15 to spotkania techniczne i procesowe. Webinar SDF ma niższy priorytet i nie jest zmianą protokołu. Jego ICS wskazuje STATUS:TENTATIVE — zachowano to oznaczenie, a wydarzenie nie weszło do dopuszczonego zbioru.

## Porównanie źródeł

| Źródło | Rzeczywisty dostęp | Dane przyszłe w oknie | Ocena publicznego wykorzystania |
| --- | --- | --- | --- |
| ETH: [Ethereum Protocol Calls](https://github.com/ethereum/pm), publiczny Google ICS | HTTP 200, text/calendar, 516 komponentów VEVENT; 24 przyszłe wystąpienia po deduplikacji | 24 | Subskrypcja i osadzanie publicznego kalendarza są dokumentowane. Ponowna publikacja opracowanych rekordów w naszym JSON: do wyjaśnienia z właścicielem kalendarza. |
| ETH: [Ethereum Event Gardeners](https://luma.com/ethereumeg), publiczny Luma ICS | HTTP 200, text/calendar, 2 wpisy archiwalne | 0 | Udokumentowany kanał ICS; nie jest blokowany technicznie. Prawa do publicznej agregacji do wyjaśnienia, jeśli pojawią się przyszłe wydarzenia. EEG to grupa organizatorów społecznościowych, nie kalendarz samej Ethereum Foundation. |
| DOT: [Parity Dotlake](https://api.data.parity.io/docs), publiczne JSON OpenGov | HTTP 200 bez klucza; zapytanie dla polkadot_asset_hub zwróciło 9 rekordów, w tym 5 Ongoing | 0 dat; 5 aktywnych | Dokumentacja dopuszcza publiczny odczyt i wymaga atrybucji. Monitoring faktów dopuszczony z podpisem Data: Parity Dotlake API. |
| DOT: [Polkassembly API](https://docs.polkassembly.io/jekyll/2023-10-17-api-and-resources.html) | Udokumentowany GET on-chain-post #1950: HTTP 200, JSON bez Authorization; nagłówek x-network: polkadot | Kontrola 1 aktywnego referenda: brak daty końca | Odczyt udokumentowanego interfejsu wspierany dla integracji zewnętrznych. Republika treści forum podlega ograniczeniom; publiczne wykorzystanie odpowiedzi wymaga wyjaśnienia. Nie odrzucono API tylko z powodu zasad dotyczących scrapingowania forum. |
| DOT: [Subsquare](https://polkadot.subsquare.io) | HTTP 200; publiczny HTML zawiera strukturalne dane 5 aktywnych referendów | Brak potwierdzonych dat UTC | [Warunki](https://polkadot.subsquare.io/terms) ograniczają scraping i wykorzystanie treści poza usługą. Nie dodano regularnego adaptera ani nie szukano sposobu obejścia ograniczeń. |
| XLM: [SDF na Luma](https://luma.com/stellar.org), publiczny ICS | HTTP 200, text/calendar, 31 wpisów, 1 przyszły | 1 | Publiczny ICS działa bez klucza. Zakres wyjątku dla wspieranych interfejsów Luma oraz warunków organizatora przy własnej agregacji: do wyjaśnienia. |
| XLM: [Meridian Community Side Events](https://luma.com/meridian-2026-side-events), publiczny ICS | HTTP 200, text/calendar; oficjalna strona Meridian wskazuje ten kalendarz | 5 | Dostęp techniczny działa; warunki organizatorów do wyjaśnienia. Obecne wpisy odrzucono niezależnie ze względu na charakter towarzyski. Głównej konferencji nie ma w feedzie. |

Dokładne adresy ICS, statusy, czas weryfikacji, rozmiary i SHA-256: [source-audit.alternatives.json](source-audit.alternatives.json). Dane wydarzeń, odrzuceń i monitoringu: [events.alternatives.json](events.alternatives.json). Surowe odpowiedzi badawcze i cache pozostają lokalnie w ignorowanym katalogu .cache; nie są przygotowane do publikacji.

## ETH: praktyczny kanał ICS

Repozytorium [ethereum/pm](https://github.com/ethereum/pm) prowadzone przez Protocol Support i osoby organizujące AllCoreDevs wskazuje publiczny kalendarz. Zadziałał jego publiczny adres iCalendar, bez logowania, tokenu i formalnego Calendar API. [Google dokumentuje](https://support.google.com/calendar/answer/37083) synchronizację oraz osadzanie publicznych kalendarzy na stronach.

Wyjaśnienia wymaga zakres **samodzielnej publikacji opracowanych rekordów**. Nie uznano, że licencja CC-BY-SA-3.0 repozytorium ethereum/pm automatycznie obejmuje zewnętrzny kalendarz. Status review-required oznacza brak dostatecznie jednoznacznej podstawy w audycie, a nie stwierdzenie, że taka publikacja jest zabroniona. Osadzenie kalendarza przez funkcję Google jest osobnym, udokumentowanym wariantem prezentacji.

Przykłady pobrane z ICS, wymagające wyjaśnienia publikacji:

| Termin UTC | Warszawa | Wydarzenie | Źródło |
| --- | --- | --- | --- |
| 12.10.2026 14:00 | 16:00 | All Core Devs — Testing | [publiczny kalendarz](https://calendar.google.com/calendar/embed?src=c_upaofong8mgrmrkegn7ic7hk5s%40group.calendar.google.com) |
| 15.10.2026 14:00 | 16:00 | All Core Devs — Consensus | [publiczny kalendarz](https://calendar.google.com/calendar/embed?src=c_upaofong8mgrmrkegn7ic7hk5s%40group.calendar.google.com) |
| 22.10.2026 14:00 | 16:00 | All Core Devs — Execution | [publiczny kalendarz](https://calendar.google.com/calendar/embed?src=c_upaofong8mgrmrkegn7ic7hk5s%40group.calendar.google.com) |
| 29.10.2026 14:00 | 15:00 | All Core Devs — Consensus | [publiczny kalendarz](https://calendar.google.com/calendar/embed?src=c_upaofong8mgrmrkegn7ic7hk5s%40group.calendar.google.com) |

Terminy pochodzą z DTSTART, jawnych reguł RRULE i wyjątków organizatora. Rozwinięcie opublikowanej serii spotkań nie jest prognozą opartą na średnim odstępie historycznych spotkań. Uwzględniono przeniesienia, odwołania, EXDATE, strefy czasowe i zmianę czasu. Usunięto również powtórzony wpis EIPIP pod innym UID. Dat DTSTAMP i LAST-MODIFIED nie używa się jako dat wydarzenia.

## DOT: aktywne głosowania i wykonanie decyzji

[Dokumentacja Parity](https://api.data.parity.io/openapi.json) deklaruje publiczne endpointy bez kluczy, ograniczenia anonimowych zapytań per IP, HTTP 429 po przekroczeniu limitu oraz wymaganą atrybucję przy publicznym wykorzystaniu. Sprawdzono faktyczne odpowiedzi, także po wskazaniu Asset Hub. Pierwsze zapytanie z chain=polkadot było puste; zapytanie bez błędnego wyboru łańcucha ujawniło referenda na polkadot_asset_hub. Nie potraktowano pustej odpowiedzi jako dowodu braku referendów.

Aktywne #1946–1950 mają outcome=Ongoing, end_date=NaT i end_block=0. Adapter zamienia te dwie wartości na brak terminu i przechowuje pięć rekordów w sekcji monitoring. Nie wykorzystuje start_date jako przyszłego zdarzenia. Historyczne zatwierdzenia, m.in. #1944, pozostają historią.

Strukturalne dane Subsquare wykazały deciding.since, deciding.confirming, decisionPeriod, alarm oraz enactment.at. To wartości blokowe i stanowe; enactment.at=0 nie wyznacza daty wykonania. Po migracji należy ponadto rozróżniać bloki Relay Chain i Asset Hub. [Referenda SDK](https://papi.how/sdks/governance/referenda/) udostępnia monitoring tych stanów; sam numer przyszłego bloku nie jest gwarantowaną datą UTC. Osiągnięcie warunków zatwierdzenia może zmienić przebieg głosowania.

Udokumentowany odczyt Polkassembly #1950 zadziałał. end i ended_at są null, enactment_at_block=0, a confirming=null. Daty statusHistory opisują wcześniejsze zmiany stanu. Top-level status to DecisionDepositPlaced, podczas gdy historia zawiera Deciding; Parity i Subsquare pokazują referendum jako aktywne. To dodatkowy powód, aby nie interpretować dowolnego pola statusu jako aktualnego terminu głosowania. Zasady forum przewidują wyjątek dla opublikowanych interfejsów, ale ograniczają ekstrakcję do cudzej aplikacji i publiczną reprodukcję treści (§4–5 [regulaminu](https://polkadot.polkassembly.io/terms-and-conditions)).

Praktyczny rezultat: można automatycznie prezentować **monitoring aktywnych referendów** na podstawie dopuszczonych danych Parity. W tym teście nie można z nich zrobić datowanych wpisów kalendarza bez wymyślania terminu.

## XLM i przypadek kontrolny Meridian 2026

[Luma dokumentuje publiczne subskrypcje iCalendar](https://help.luma.com/p/ical-syncing) z przycisku Add iCal Subscription. To wspierany interfejs odrębny od [płatnego API wymagającego Luma Plus i klucza](https://docs.luma.com/reference/getting-started-with-your-api). Nie korzystano z wewnętrznych endpointów wydarzeń, kont ani płatnych usług.

Z SDF pobrano **Legal 101 for Stablecoin Payment Providers**, **13.10.2026 15:00 UTC / 17:00 Warszawa**, [strona wydarzenia](https://luma.com/stellar-ap4y). Data i godzina są jawne w ICS. STATUS:TENTATIVE zachowano jako dodatkową kwestię do weryfikacji; webinar ma niski priorytet. [Regulamin Luma](https://luma.com/terms) dopuszcza pewne użycia treści przez publicznie wspierane interfejsy, a nie tylko bezwzględnie zakazuje pobierania. Dokumentacja potwierdza subskrypcję, ale zakres wyjątku dla naszej publicznej agregacji oraz praw organizatorów nie został jednoznacznie rozstrzygnięty. Nie przenosimy automatycznie warunków stellar.org na każdą inną platformę.

**Meridian 2026: 28–29.10.2026**, potwierdzone w [oficjalnym FAQ](https://meridian.stellar.org/event-details). To prawdziwe przyszłe wydarzenie, ale nie zostało ręcznie dopisane do wyniku automatycznego skryptu. Nie odnaleziono głównej konferencji ani w SDF ICS, ani w oficjalnie podlinkowanym kalendarzu side events. Sprawdzona strona event-details nie zawierała odnośnika ICS ani Event JSON-LD. Nie stwierdzamy, że taki kanał nie istnieje nigdzie; w zbadanych źródłach nie udało się go ustalić.

Pięć wpisów side-event ICS odrzucono jako spotkania towarzyskie: padel, spotkanie przy winie, cocktail hour, impreza barowa i VIP dinner. Żaden nie jest automatycznie główną konferencją Meridian. Wyszukiwarka wskazała także niezależny placeholder Lumen Loop; rzeczywisty GET zwrócił 404. Nie uznano go za oficjalny kanał ani za dowód dostępnego feedu.

## Uruchomienie i zabezpieczenia

Istniejący skrypt scripts/test-crypto-calendar.cjs otrzymał opcjonalny tryb --alternatives. Zwykły tryb nadal używa sześciu poprzednich źródeł. Nowy tryb domyślnie zapisuje events.alternatives.json i nigdy nie nadpisuje pierwszego events.sample.json.

Z katalogu głównego repozytorium, Node.js 24:

~~~sh
npm ci --prefix docs/crypto-calendar-stage1 --ignore-scripts --no-audit --no-fund
node scripts/test-crypto-calendar.cjs --alternatives
node scripts/test-crypto-calendar.cjs --alternatives --offline --output docs/crypto-calendar-stage1/events.alternatives.offline-check.json
node --test tests/*.test.js
~~~

W Windows można użyć npm.cmd zamiast npm. Nowa zależność ical.js 2.2.1 jest przypięta w package-lock.json, ma licencję MPL-2.0 i nie ma zależności pośrednich. Dotyczy tylko audytu. [Dokumentacja parsera](https://github.com/kewisch/ical.js) opisuje RRULE, wyjątki i VTIMEZONE. Nie wykonuje połączeń sieciowych ani wzbogacania danych.

W JSON:

- events i counts: tylko dopuszczony zbiór, obecnie pusty;
- reviewRequiredEvents i reviewRequiredCounts: 24 ETH + 1 XLM, poza zbiorem przeznaczonym do publikacji;
- monitoring: 5 niedatowanych aktywnych referendów Parity, z atrybucją i czasem rzeczywistej weryfikacji;
- rejected: konkretne powody pominięcia; sources: dowody HTTP i niezależna ocena wykorzystania;
- complete=false: brak gwarancji pełnego pokrycia ekosystemów.

Zachowano limit 2 MiB, timeout 15 s, stałą listę endpointów, brak logowania, brak ponawiania 403/429, ETag, kontrolę schematów, cache bez sztucznego odświeżania verifiedAt, atomowy zapis oraz ograniczenie wyjścia do katalogu audytu. Rozszerzono dozwolone URL o konkretne kanały Google Calendar i HTTPS Luma; fałszywe domeny i URL z poświadczeniami są odrzucane. Nie kopiuje się opisów, list uczestników, adresów e-mail ani grafik.

Pierwszy przebieg nowych adapterów wykonał 5 pobrań HTTP 200; dalsze przetwarzanie korzystało z tych odpowiedzi bez kolejnych zapytań. Poprawiono import biblioteki i obsługę anulowanych wyjątków, po czym sprawdzono rzeczywiste feedy ponownie z cache. Ostateczny wynik ma requests=0, lecz verifiedAt i SHA-256 wskazują faktyczne odczyty z 12:23 UTC. Pozostałe jednorazowe próby badawcze są wyszczególnione osobno w audycie źródeł, nie są zapytaniami regularnego kolektora.

Zachowano bez zmian 12 testów poprzedniego prototypu. Dodano 13 testów ICS/OpenGov, m.in. zmianę czasu, anulowanie bez DTSTART, wyjątki EXDATE, deduplikację, wartości NaT/0, cache 12 h i brak obejść 403/429. Pełny zestaw: **82 testy, 82 zaliczone**. Dowód zakresu zmian i weryfikacji: [verification.alternatives.json](verification.alternatives.json).

## Czy co 6 godzin i bez opłat?

**Technicznie tak dla odczytu wskazanych kanałów; nie ma jeszcze podstaw do automatycznej publikacji całego nowego zbioru w naszym kalendarzu.** Nie jest potrzebne płatne API ani konto odbiorcy. Standardowe Actions w publicznym repozytorium mogą działać bez opłat za minuty [według GitHub](https://docs.github.com/en/billing/concepts/product-billing/github-actions); dla prywatnego repozytorium obowiązują limity planu. Harmonogram Actions może być opóźniony i nie daje gwarancji wykonania dokładnie co 6 godzin [dokumentacja schedule](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).

Feeds Luma jawnie deklarują REFRESH-INTERVAL i X-PUBLISHED-TTL równe **12 godzin**. Zadanie może uruchamiać się co 6 godzin, lecz te trzy źródła należy pobierać najwyżej raz na 12 h i korzystać z cache w pozostałych przebiegach. EIP/GitHub, Google Calendar i Parity mogą być odczytywane co 6 h z zachowaniem ich limitów. W Actions cache musi być przenoszony między efemerycznymi runnerami; lokalny cache bez jego zachowania nie ograniczy liczby pobrań pomiędzy uruchomieniami. Takiej konfiguracji nie wdrożono w tym etapie.

Praktyczna kolejność dalszych prac: wykorzystać istniejący adapter Ethereum Protocol Calls po ustaleniu zakresu publikacji minimalnych faktów (lub rozważyć udokumentowane osadzenie publicznego kalendarza), utrzymywać monitoring OpenGov z Parity obok datowanych wydarzeń, a dla Meridian uzyskać od organizatora jawny feed głównej konferencji lub zgodę na konkretny kanał strukturalny. Dla SDF należy również wyjaśnić STATUS:TENTATIVE. To konkretne działające kanały do rozwinięcia; brak płatnego API nie jest już problemem technicznym.
