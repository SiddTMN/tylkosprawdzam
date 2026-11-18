# Kalendarz krypto — wpisy ręczne

Jedynym źródłem kalendarza jest `data/crypto-manual.json`. Plik jest obecnie pusty.
Strona pokazuje maksymalnie pięć najbliższych wpisów w oknie 30 dni,
z datami i godzinami w strefie Europe/Warsaw. Minione i zakończone wydarzenia
znikają automatycznie. Pusta lista wyświetla „brak zaplanowanych wydarzeń krypto”.

## Dodawanie wydarzenia na GitHubie

1. Otwórz `data/crypto-manual.json` na gałęzi `main` i wybierz edycję pliku.
2. Dodaj obiekt do tablicy `events`. Każdy wpis musi mieć unikalny `id`.
3. Zapisz zmianę jako commit. Istniejący workflow publikacji strony wykona testy
   i opublikuje plik. Sam kalendarz krypto nie tworzy automatycznych commitów.

Wzór poniżej jest przykładem, nie prawdziwym wydarzeniem. Przed wklejeniem usuń
`example`, zastąp tytuł, opis, termin i adres źródła, a `verifiedAt` ustaw na
rzeczywisty czas sprawdzenia informacji w UTC (nie termin przyszłego wydarzenia).
Nie wpisuj niepotwierdzonej godziny — pozostaw `startsAt: null`.

```json
{
  "example": true,
  "id": "eth-wlasny-unikalny-id",
  "assets": ["ETH"],
  "title": "Tytuł wydarzenia",
  "description": "Krótki własny opis wydarzenia.",
  "period": {"precision": "day", "date": "2026-12-01"},
  "startsAt": null,
  "confidence": "expected",
  "status": "planned",
  "sourceUrl": "https://example.org/zastap-zrodlem",
  "verifiedAt": "2026-11-18T12:00:00Z",
  "origin": "manual"
}
```

Obsługiwane aktywa: `BTC`, `ETH`, `DOT`, `XLM`, `ATH`, `BONK` (także kilka w jednym
wpisie). Pewność: `confirmed`, `expected`, `speculative`. Status: `planned`,
`postponed`, `cancelled`, `completed`. Wpis odwołany zachowuje widoczne oznaczenie;
`completed` usuwa go z listy przyszłych wydarzeń.

Zamiast dokładnego dnia można użyć miesiąca
`{"precision":"month","month":"2026-12"}`, tygodnia poniedziałek–niedziela
`{"precision":"week","from":"2026-11-23","to":"2026-11-29"}` lub zakresu
`{"precision":"range","from":"2026-12-01","to":"2026-12-03"}`.
`startsAt`, jeśli godzina jest potwierdzona, musi zawierać UTC z końcówką `Z`,
np. `2026-12-01T13:00:00Z`, i odpowiadać dacie `period.date` w Warszawie.

## Wycofana automatyzacja

Usunięto workflow `Crypto calendar data` i `XLM artifact-only pilot`. Testy krypto
nie wykonują już sieciowego podglądu ani walidacji archiwalnego automatu.
`data/crypto-auto.json`, stare kolektory, licencje i wcześniejsze audyty pozostają
w repozytorium jako archiwum. Nie są pobierane przez panel ani wymagane lub
kopiowane do paczki strony. Publikacja sprawdza poprawność ręcznego JSON-a.

Kod, źródła danych i harmonogram kalendarza makro pozostają bez zmian.
