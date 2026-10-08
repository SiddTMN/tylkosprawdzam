(() => {
    "use strict";
    const container = document.getElementById("calendar-events");
    if (!container) return;
    const { normalizeFinanceCalendar, getRange, selectUpcoming, parseSnapshot, sourceIsStale } = MacroCalendarModel;
    const TIME_ZONE = "Europe/Warsaw";
    const REFRESH_MS = 60 * 60 * 1000;
    const TIMEOUT_MS = 15000;
    const dateFormat = new Intl.DateTimeFormat("pl-PL", {
        day: "2-digit", month: "short", timeZone: TIME_ZONE
    });
    const timeFormat = new Intl.DateTimeFormat("pl-PL", {
        hour: "2-digit", minute: "2-digit", timeZone: TIME_ZONE
    });
    let refreshing = false;
    let lastResult = null;

    async function fetchJson(url) {
        // Separate timeouts: a timed-out file must not abort the API fallback.
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
        try {
            const response = await fetch(url, { signal: controller.signal, cache: "no-store" });
            if (!response.ok) throw new Error("Kalendarz HTTP " + response.status);
            return await response.json();
        } finally {
            clearTimeout(timeout);
        }
    }

    async function fetchFinanceCalendar() {
        const { from, to } = getRange(Date.now());
        const url = "https://www.financecalendar.com/wp-json/fc/v1/calendar" +
            "?from=" + from + "&to=" + to + "&limit=100";
        return { events: normalizeFinanceCalendar(await fetchJson(url)), generatedAt: Date.now(), stale: false };
    }

    function element(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    function renderMessage(text) {
        container.replaceChildren(element("div", "calendar-loading", text));
    }

    function renderEvents(events, sources) {
        // Renderer consumes only the internal event model.
        // Source validation belongs to the shared adapter.
        if (!events.length) {
            renderMessage("brak nadchodzących wydarzeń");
            return;
        }
        const fragment = document.createDocumentFragment();
        events.forEach(event => {
            const row = element("div", "calendar-event");
            const date = element("div", "calendar-date");
            const time = element("strong", "", event.kind === "timed"
                ? timeFormat.format(event.sortAt) : "—");
            if (event.kind !== "timed") {
                const description = event.kind === "all-day" ? "wydarzenie całodniowe" : "godzina niepotwierdzona";
                time.title = description;
                time.setAttribute("aria-label", description);
            }
            date.append(element("span", "", dateFormat.format(event.sortAt).toUpperCase()), time);
            if (event.source === "TreasuryDirect") {
                const description = event.kind === "timed"
                    ? "Zamknięcie ofert konkurencyjnych (America/New_York), nie godzina publikacji wyników"
                    : "Godzina aukcji niepotwierdzona";
                time.title = description;
                time.setAttribute("aria-label", description);
                row.title = "CUSIP: " + event.cusip + "; rozliczenie: " + event.settlementDate +
                    "; pierwotny termin: " + event.originalTerm + "; pozostały: " + event.remainingTerm;
            }
            const info = element("div", "calendar-info");
            info.append(element("strong", "", event.name), element("span", "", event.category));
            row.append(date, info, element("span", "calendar-impact " + event.impact, event.impact.toUpperCase()));
            if (event.source) row.setAttribute("data-source", event.source);
            if (sources?.[event.source] && sourceIsStale(sources[event.source], Date.now())) {
                row.setAttribute("data-stale", "true");
                row.title = (row.title ? row.title + "; " : "") + "Ostatnie poprawne pobranie: " +
                    new Date(sources[event.source].lastSuccessAt).toLocaleString("pl-PL", { timeZone: TIME_ZONE });
            }
            fragment.appendChild(row);
        });
        container.replaceChildren(fragment);
    }

    function showResult(result, stale) {
        const events = selectUpcoming(result.events, Date.now());
        const staleSources = result.sources ? Object.entries(result.sources)
            .filter(([, source]) => sourceIsStale(source, Date.now())) : [];
        // An unavailable source cannot prove that the complete future calendar is empty.
        if ((stale || staleSources.length) && !events.length) renderMessage("kalendarz niedostępny");
        else renderEvents(events, result.sources);
        if (stale || staleSources.length) {
            container.setAttribute("data-stale", "true");
            container.title = "Odświeżenie kalendarza nie powiodło się; zachowano ostatnie poprawne dane. Aktualizacja: " +
                new Date(result.generatedAt).toLocaleString("pl-PL", { timeZone: TIME_ZONE });
            if (staleSources.length) container.title = staleSources.map(([name, source]) => name + ": " +
                (source.lastSuccessAt ? "ostatnie poprawne pobranie " + new Date(source.lastSuccessAt)
                    .toLocaleString("pl-PL", { timeZone: TIME_ZONE }) : "dane niedostępne")).join("; ");
        } else {
            container.removeAttribute("title");
            container.removeAttribute("data-stale");
        }
    }

    async function updateCalendar() {
        if (refreshing) return;
        refreshing = true;
        container.setAttribute("aria-busy", "true");
        let candidate = lastResult;
        let snapshotLoaded = false;
        try {
            let result;
            try {
                result = parseSnapshot(await fetchJson("./data/macro-calendar.json"), Date.now());
                snapshotLoaded = true;
                if (!result.stale) {
                    lastResult = result;
                    showResult(result, false);
                    return;
                }
                if (!candidate || result.generatedAt > candidate.generatedAt) candidate = result;
            } catch (error) {
                console.warn("Plik kalendarza niedostępny; próba FinanceCalendar:", error);
            }
            result = await fetchFinanceCalendar();
            // Live fallback refreshes FinanceCalendar only; preserve trusted Treasury rows and their original freshness.
            if (candidate?.sources) {
                const treasuryEvents = candidate.events.filter(e => e.source === "TreasuryDirect");
                result.events = TreasuryCalendarModel.mergeEvents(result.events.map(e => ({ ...e, source: "FinanceCalendar" })), treasuryEvents);
                const treasurySource = { ...candidate.sources.TreasuryDirect };
                if (!snapshotLoaded && treasurySource.lastSuccessAt) treasurySource.status = "stale";
                result.sources = { ...candidate.sources, TreasuryDirect: treasurySource, FinanceCalendar: {
                    endpoint: "https://www.financecalendar.com/wp-json/fc/v1/calendar", status: "fresh",
                    checkedAt: new Date(result.generatedAt).toISOString(), lastSuccessAt: new Date(result.generatedAt).toISOString()
                } };
            }
            lastResult = result;
            showResult(result, false);
        } catch (error) {
            console.warn("Nie udało się pobrać kalendarza:", error);
            if (candidate) {
                lastResult = candidate;
                // Never retain an expired publication row during an outage.
                showResult(candidate, true);
            } else renderMessage("kalendarz niedostępny");
        } finally {
            container.setAttribute("aria-busy", "false");
            refreshing = false;
        }
    }

    updateCalendar();
    setInterval(updateCalendar, REFRESH_MS);
})();
