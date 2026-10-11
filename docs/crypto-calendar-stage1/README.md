# Kalendarz krypto — etap 1: wynik testu

**Kontynuacja audytu:** [ICS i OpenGov — 24 spotkania ETH, 1 webinar XLM i 5 aktywnych referendów DOT](ALTERNATIVES.md). Pierwotny wynik poniżej zachowano jako zapis pierwszego testu.

Test wykonano **11 października 2026**. Bieżące okno: **11.10–09.11.2026 włącznie**, Europe/Warsaw; górna granica wyłączna 10.11.2026. Dla wydarzeń z godziną odrzucamy także te, które już minęły dzisiaj. Zakres to 30 dni kalendarzowych, a nie 30 × 24 godziny; obejmuje zmianę czasu w Warszawie.

**Wniosek: można bezpłatnie automatyzować odczyt wybranych harmonogramów protokołów, ale ten test nie uzasadnia uruchomienia kompletnego kalendarza ETH/DOT/XLM co 6 godzin.** Główne problemy to warunki korzystania ze stron, brak stabilnego wspólnego formatu i niedatowane decyzje governance. Przygotowano osobny, działający prototyp o celowo ograniczonym pokryciu.

Nie zmieniono index.html, js, css, istniejących danych ani workflow. Nie wykonano commita, pusha ani publikacji. Artefakty testu są w docs, poza katalogiem data pakowanym przez istniejący workflow Pages.

## 1. Co rzeczywiście zadziałało

Dowód odczytów: [source-audit.json](source-audit.json), [events.sample.json](events.sample.json). Testy HTTP wykonywano bez nagłówka Authorization i bez kluczy. Nie utożsamiamy HTTP 200 ze zgodą na wykorzystanie źródła.

| Ekosystem / kanał | Rzeczywisty wynik | Przydatność i decyzja |
| --- | --- | --- |
| ETH: [EIP-7773 w GitHub](https://github.com/ethereum/EIPs/blob/master/EIPS/eip-7773.md), przez Contents API | HTTP 200, poprawny plik Markdown; licencja CC0 | Adapter odczytuje tabelę aktywacji Glamsterdam. Sepolia ma konkretny timestamp; Hoodi/Mainnet mają puste terminy. |
| ETH: [go-ethereum Releases](https://github.com/ethereum/go-ethereum/releases) | REST HTTP 200, 10 rekordów; Atom HTTP 200 | Dobre źródło monitorowania klientów. published_at jest datą wydania, więc nie trafia do wydarzeń. |
| ETH: params/config.go w oficjalnym repozytorium | Contents API HTTP 200 | Konfiguracja techniczna z aktywacjami; pomocniczy dowód, bez dodatkowego adaptera. Nie używamy dat commitów. |
| ETH: [kalendarz ethereum.org](https://ethereum.org/en/community/events/) | Czytelna strona w narzędziu web; sekcja Upcoming zawiera terminy konferencji | Wyłączony z kolektora po sprawdzeniu regulaminu. Lista ma również wydarzenie już zakończone. |
| ETH: blog/feed.xml | Czytelne artykuły w web; odczyt XML przez web zakończył się unsupported content-type | To ograniczenie czytnika XML, a nie dowód blokady serwera RSS. Po sprawdzeniu regulaminu nie kontynuowano pobierania. Nie uznano RSS za zatwierdzony kanał automatyzacji. |
| DOT: [Polkadot SDK Releases](https://github.com/paritytech/polkadot-sdk/releases) | REST HTTP 200, 10 rekordów; Atom HTTP 200 | Monitorowanie oprogramowania, bez utożsamiania wydania SDK z aktualizacją sieci. |
| DOT: [Fellowship runtime Releases](https://github.com/polkadot-fellows/runtimes/releases) | REST HTTP 200, 10 rekordów | Ważniejsze dla runtime, lecz samo wydanie nie określa czasu wykonania referendum. |
| DOT: [Polkadot Forum RSS](https://forum.polkadot.network/latest.rss) | HTTP 200, poprawny RSS | Wyłączony po odczytaniu ToS: zakaz automatycznego monitorowania. robots.txt nie uchyla tego zakazu. |
| DOT: polkadot.com | HTTP 200; /community/events/ w web: 404; robots.txt: 404 | Główna strona nie dostarczyła serwerowej listy datowanych wydarzeń. Wyniki wyszukiwarki wskazywały również archiwalną stronę w domenie vercel.app; nie przyjęto jej za aktualny oficjalny kanał. |
| DOT: https://rpc.polkadot.io | HTTP 200 dla chain_getHeader; prawidłowy nagłówek bloku | Publiczny odczyt sieci działa. Nie jest API kalendarza; brak implementacji odczytu i dekodowania governance. |
| XLM: [Stellar Docs w GitHub](https://github.com/stellar/stellar-docs/blob/main/docs/networks/software-versions.mdx) | Contents API HTTP 200; 22 nagłówki protokołów, 16 z jednoznaczną datą i siecią | Adapter odczytuje wyłącznie datowane nagłówki Mainnet/Testnet. Repozytorium ma [Apache 2.0](https://github.com/stellar/stellar-docs/blob/main/LICENSE). Pozostałe nagłówki, m.in. preview/phase, nie kwalifikują się. |
| XLM: [stellar-core Releases](https://github.com/stellar/stellar-core/releases) | REST HTTP 200, 10 rekordów; Atom HTTP 200 | Wersja Core nie oznacza terminu głosowania ani aktywacji protokołu. |
| XLM: https://horizon.stellar.org/ | HTTP 200, JSON HAL; current_protocol_version=29 | Informacja o bieżącej sieci. Brak harmonogramu przyszłych głosowań w tej odpowiedzi. |
| XLM: [strona wydarzeń](https://stellar.org/events) i Meridian | Czytelne strony w web z datami Meridian i HackMeridian | Nie użyte w kolektorze ani publicznym JSON: nie potwierdzono prawa do takiego wykorzystania na podstawie warunków strony. |

HTTP 200 dla kanałów Atom potwierdza dostęp do danych, ale nie dodaje samodzielnie przyszłych wydarzeń. Dokumentacja Stellar network-upgrades również została pobrana z repozytorium; wyjaśnia mechanizm głosowania, lecz nie podaje konkretnego przyszłego terminu do tego okna.

## 2. Liczby przyszłych wydarzeń

| Token | Wynik prototypu dla 11.10–09.11 | Co dokładnie sprawdzono |
| --- | ---: | --- |
| ETH | **0** | Tabela aktywacji EIP-7773 oraz 10 wydań Geth jako materiał pomocniczy. |
| DOT | **0** | Po 10 wydań SDK i runtime; nie znaleziono potwierdzonego kalendarzowego terminu kwalifikującego się do okna. Brak adaptera governance. |
| XLM | **0** | Datowane nagłówki protokołów Stellar Docs oraz 10 wydań Core jako materiał pomocniczy. |

**Zero oznacza brak zaakceptowanych rekordów w zbadanym zakresie źródeł. Nie oznacza, że w całym ekosystemie nie będzie wydarzeń.** events.sample.json jawnie ma complete=false i opis coverage osobno dla każdego tokena. Wyłączone źródła i powody odrzucenia są zapisane w JSON. Awaria odczytu dostaje status unavailable i kod zakończenia 2; nie jest przedstawiana jako pomyślne puste źródło.

Na stronie ETH, przed odrzuceniem jej z automatyzacji, widocznych było **7 pozycji konferencyjnych w sekcji Upcoming z dniami przypadającymi w badanym oknie**: Paradigm Frontiers, EDCON2026, ETHVenice 2026, Encode London, Ethereum Cypherpunk Congress, Devcon India i Pragma Mumbai. To obserwacja listy, bez pełnej ponownej weryfikacji każdego organizatora — nie liczba zatwierdzonych rekordów. Dla XLM potwierdzono na oficjalnych stronach **2 przyszłe wydarzenia z pełną datą** opisane niżej. Dla DOT nie potwierdzono odpowiedniego przyszłego wydarzenia. Przykłady archiwalne Sub0 z 2025 odrzucono, nie przenosząc ich dat do 2026.

## 3. Przykłady i powody wyłączenia

| Token | Wydarzenie | Termin źródłowy | Wynik |
| --- | --- | --- | --- |
| ETH | [Devcon India, oficjalny kalendarz](https://ethereum.org/en/community/events/) | 3–6 listopada 2026 | Kandydat konferencyjny; wyłączony kanał stron EF, nie dodano do prototypu. |
| XLM | [Meridian 2026](https://meridian.stellar.org/event-details) | 28–29 października 2026 | Potwierdzona przyszła konferencja; wyłączona ze względu na niezatwierdzone publiczne wykorzystanie treści strony. |
| XLM | [HackMeridian, oficjalne FAQ](https://meridian.stellar.org/event-details) | 25–26 października 2026 | Potwierdzony hackathon; ten sam problem wykorzystania źródła. Nie liczymy osobno imprez towarzyszących Meridian. |
| ETH | [Glamsterdam — Sepolia, EIP-7773](https://github.com/ethereum/EIPs/blob/master/EIPS/eip-7773.md) | 6 października 2026, 13:53:36 UTC | Poprawne zdarzenie protokołu, już poza bieżącym oknem. Hoodi/Mainnet bez daty: pominięte. |
| XLM | [Protocol 29 — Mainnet, Stellar Docs](https://github.com/stellar/stellar-docs/blob/main/docs/networks/software-versions.mdx) | 1 października 2026; brak godziny | Poprawna data sieci, już poza bieżącym oknem. Wydanie Core v29 z 5 października nie zastępuje daty sieci. |

## 4. Warunki źródeł i problemy

- [Warunki EF](https://ethereum.org/terms-of-use/) obejmują m.in. ethereum.org, blog.ethereum.org i devcon.org. Zawierają zakaz automatycznego dostępu. Licencja CC BY 4.0 wskazana dla treści nie usuwa tego odrębnego ograniczenia dostępu. Dlatego nie implementowano scrapera stron ani feedu bloga.
- [Warunki Stellar](https://stellar.org/terms-of-service) ograniczają wykorzystanie stron do użytku osobistego i niekomercyjnego oraz publiczne kopiowanie/publikowanie bez odpowiedniego uprawnienia. Nie przyjęto własnego streszczenia jako sposobu obejścia ograniczenia. W prototypie użyto odrębnego, jawnie licencjonowanego repozytorium dokumentacji; nie pobiera on stron Stellar ani Meridian.
- [Warunki forum DOT](https://forum.polkadot.network/tos), Acceptable Use, zabraniają automatycznego monitorowania. Wstępny jednorazowy test RSS dał 200; po sprawdzeniu treści regulaminu kanał został wyłączony. Nie użyto proxy, rotacji adresów, ukrywania klienta ani alternatywnego formatu tego forum.
- W GitHub Releases wykryto jedynie daty publikacji lub niedatowane zmiany. GitHub Atom ma również daty wpisów, a nie harmonogram aktywacji.
- Governance Polkadot może być wyrażone numerem bloku i warunkami decyzyjnymi. Prototyp nie zamienia przyszłych bloków na prognozowane daty UTC. RPC testuje tylko odczyt nagłówka, nie dowodzi kompletnego odczytu referendów na aktualnej właściwej sieci.
- Nie istnieje wykaz wszystkich datowanych istotnych zmian w tych sześciu endpointach. EIP adapter obsługuje konkretnie Glamsterdam; przyszły kolejny hardfork wymaga dodania właściwego źródła. Stellar adapter jest konserwatywny wobec formatu nagłówków. Zmiana schematu daje błąd źródła.
- Nie testowano płatnych agregatorów ani źródeł wymagających klucza. Nie zakładamy ich cen czy praw publikacji. Pierwszy odczyt Node w sandboxie nie miał sieci (EACCES); zatwierdzony odczyt sieciowy zadziałał. Nie jest to blokada po stronie GitHub.
- Test wykonano lokalnie; nie uruchomiono nowego joba GitHub Actions. Jego sieci, limitów współdzielonego IP i późniejszej dostępności źródeł nie można uznać za sprawdzone.

## 5. Prototyp i powtarzalność

Wymagania: Node.js 24, bez npm install, tokenów i dodatkowych bibliotek.

Z katalogu projektu:

~~~powershell
node scripts/test-crypto-calendar.cjs
node --test tests/crypto-calendar-prototype.test.js
~~~

Domyślny wynik: docs/crypto-calendar-stage1/events.sample.json. Skrypt ma sześć stałych endpointów GitHub, maksymalnie sześć zapytań na przebieg, limit odpowiedzi 2 MiB, timeout 15 s, brak automatycznych ponowień i brak obchodzenia 403/429. Releases to tylko pierwsze 10 rekordów z każdego repozytorium; hasMorePages jawnie sygnalizuje dalsze strony. To nie skan całej historii.

Cache w .cache ma TTL 6 godzin, jest lokalny i wyłączony z git przez nowy .gitignore w katalogu testu. Ponowne uruchomienie przed upływem TTL nie odpytuje sieci i nie odnawia verifiedAt. Po TTL wysyłane jest If-None-Match. Przebieg --force wymusza zapytanie warunkowe, nie omija limitów dostawcy.

- events.sample.json: realny pierwszy przebieg, 6 × HTTP 200, ETH/DOT/XLM = 0/0/0.
- events.revalidation-check.json: 6 × HTTP 304; weryfikacja aktualności bez ponownego pobierania treści.
- events.cache-check.json: 0 zapytań; zachowane wcześniejsze znaczniki weryfikacji.
- events.historical-check.json: **osobny test historycznego okna 01–30.10**, nie bieżący kalendarz. Dwie poprawnie odczytane aktywacje: XLM 01.10 i ETH 06.10. Nie wolno używać tego pliku jako listy przyszłych wydarzeń.
- event.schema.json: pola pojedynczego wydarzenia.
- source-audit.json: statusy i skróty SHA-256 odpowiedzi HTTP. Usunięto tymczasowe pełne odpowiedzi i skrypty audytu, w tym pobrany RSS forum; w dostarczanych plikach nie ma kopii artykułów, zdjęć ani opisów konferencji.

Odtworzenie historii lub test cache:

~~~powershell
node scripts/test-crypto-calendar.cjs --offline --from 2026-10-01 --output docs/crypto-calendar-stage1/events.historical-check.json
node scripts/test-crypto-calendar.cjs --force --output docs/crypto-calendar-stage1/events.revalidation-check.json
~~~

Przykład rzeczywistego rekordu z testu historycznego, **odrzuconego z bieżącego okna**, pokazujący wymagane pola:

~~~json
{
  "token": "ETH",
  "date": "2026-10-06",
  "time": "13:53:36",
  "timezone": "UTC",
  "startsAt": "2026-10-06T13:53:36Z",
  "title": "Glamsterdam — aktywacja na Sepolia",
  "type": "protocol-upgrade",
  "priority": "medium",
  "sourceUrl": "https://github.com/ethereum/EIPs/blob/master/EIPS/eip-7773.md",
  "verifiedAt": "2026-10-11T11:57:01.626Z"
}
~~~

Dla terminu bez godziny time/timezone/startsAt mają null. Nie wpisujemy północy jako godziny wydarzenia. Priorytet to jawna polityka prototypu: Mainnet=high, Testnet/Sepolia=medium; nie jest ratingiem dostarczonym przez projekt. Tytuły są naszym krótkim opracowaniem. Rekordy zawierają też network, id, sourceBlobSha, license i licenseUrl. Fakty z EIP pochodzą z CC0, a Stellar Docs z Apache 2.0; dołączono licencję i notices dokumentacji. W późniejszej publikacji należy dołączyć odpowiednie oznaczenia źródła/licencji do pakietu Pages.

Deduplikacja opiera się na token + sieć + tożsamość aktualizacji, niezależnie od daty wydania klienta. Identyczne zdarzenia scalają się; sprzeczne daty tej samej tożsamości zatrzymują zapis, zamiast wybierać losowy termin. Różne sieci pozostają różnymi zdarzeniami. Nie ma heurystycznego wydobywania dat z całych artykułów ani zamiany dat publication/created/published_at w wydarzenia.

Walidacja: **12/12 nowych testów** (okno, DST, minione godziny, niemożliwe daty, TBD, zgodność daty z UNIX timestamp, zmiana formatu, preview, daty wydań, duplikaty, ochrona ścieżek). Istniejące testy: **57/57**. Osobno sprawdzono rzeczywiste odpowiedzi 200/304 i cache. Sumy kontrolne istniejących plików przed/po potwierdzają brak zmian.

## 6. Czy aktualizacja co 6 godzin może być darmowa i w pełni automatyczna?

**Darmowe cykliczne pobieranie wybranych dopuszczonych źródeł: tak, technicznie wykonalne. Pełne pokrycie wymaganych rodzajów wydarzeń ETH/DOT/XLM: niepotwierdzone i obecnie niegotowe.**

[GitHub REST](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api) pozwala pobierać dane publiczne bez logowania z limitem 60 zapytań na godzinę na adres IP. Ten prototyp potrzebuje maksymalnie 6 na przebieg, około 24 na dobę przy czterech odświeżeniach. Runner może dzielić IP z innymi procesami; trzeba obsłużyć limit i nie ponawiać odrzuconych żądań. Revalidation ETag ogranicza transfer; nie zakładamy, że nieuwierzytelnione 304 nigdy nie zużywa limitu.

[Standardowe GitHub-hosted runners w publicznych repozytoriach są darmowe](https://docs.github.com/en/actions/how-tos/write-workflows/choose-where-workflows-run/choose-the-runner-for-a-job). Dla prywatnego repozytorium trzeba uwzględnić limity planu. Przykładowy harmonogram na kolejny etap: cron 17 */6 * * * (UTC). Nie dodano go do workflow. Każdy runner jest świeży; cache wymagałby świadomego zachowania między przebiegami, choć nawet sześć pełnych odczytów na job jest niewielkim obciążeniem.

[GitHub schedule](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule) może się opóźnić, a czasem zostać pominięty; działa na domyślnej gałęzi. W publicznym repozytorium po 60 dniach braku aktywności harmonogram może zostać wyłączony. Nie obiecujemy więc gwarantowanej aktualizacji dokładnie co sześć godzin.

Do pełnego wdrożenia pozostają: dopuszczone źródła wydarzeń ekosystemów, adapter datowanego governance DOT, reguły istotności i rozpoznawania zmian ekonomicznych/technologicznych oraz kontrola zmian formatu i warunków źródeł. Jeśli termin jest tylko orientacyjny, blokowy lub TBD, nadal nie trafia do kalendarza. Na tym etapie rekomendacja to ocenić ten raport i zakres prototypu przed integracją.
