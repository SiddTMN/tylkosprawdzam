(() => {
    "use strict";

    const container = document.getElementById("calendar-events");
    if (!container) return;

    const TIME_ZONE = "Europe/Warsaw";
    const REFRESH_MS = 60 * 60 * 1000;
    const TIMEOUT_MS = 15000;
    const DAY_MS = 24 * 60 * 60 * 1000;
    const dateFormat = new Intl.DateTimeFormat("pl-PL", {
        day: "2-digit", month: "short", timeZone: TIME_ZONE
    });
    const timeFormat = new Intl.DateTimeFormat("pl-PL", {
        hour: "2-digit", minute: "2-digit", timeZone: TIME_ZONE
    });
    const civilFormat = new Intl.DateTimeFormat("en-GB", {
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
        hourCycle: "h23", timeZone: TIME_ZONE
    });
    let refreshing = false;
    let lastResult = null;

    function parseDay(value) {
        if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
        const timestamp = Date.parse(value + "T00:00:00Z");
        return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value
            ? timestamp : null;
    }

    function parseTimestamp(value) {
        if (typeof value !== "string") return null;
        // Require an explicit timezone: never let the browser interpret an API time as local.
        const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-](\d{2}):(\d{2}))$/.exec(value);
        if (!match || parseDay(match[1]) === null || Number(match[2]) > 23 ||
            Number(match[3]) > 59 || Number(match[4] || 0) > 59 ||
            Number(match[6] || 0) > 23 || Number(match[7] || 0) > 59) return null;
        const timestamp = Date.parse(value);
        return Number.isFinite(timestamp) ? timestamp : null;
    }

    function warsawMidnight(day) {
        // Resolve a civil midnight with Intl offsets, not fixed UTC+1/UTC+2.
        // Warsaw's DST transitions do not occur at midnight. Resolve the next midnight
        // separately too: a Warsaw civil day can be 23 or 25 hours long.
        let timestamp = day;
        for (let step = 0; step < 3; step += 1) {
            const parts = Object.fromEntries(civilFormat.formatToParts(timestamp)
                .filter(part => part.type !== "literal")
                .map(part => [part.type, Number(part.value)]));
            const localAsUtc = new Date(0);
            localAsUtc.setUTCFullYear(parts.year, parts.month - 1, parts.day);
            localAsUtc.setUTCHours(parts.hour, parts.minute, parts.second, 0);
            const next = day - (localAsUtc.getTime() - timestamp);
            if (next === timestamp) break;
            timestamp = next;
        }
        return timestamp;
    }

    function recordKey(value) {
        // Conservative deduplication: compare all source fields (including URL, title,
        // country/period if supplied), independent of object key order. Similar names,
        // different releases or conflicting provider records must remain separate.
        if (Array.isArray(value)) return "[" + value.map(recordKey).join(",") + "]";
        if (value && typeof value === "object") {
            return "{" + Object.keys(value).sort()
                .map(key => JSON.stringify(key) + ":" + recordKey(value[key])).join(",") + "}";
        }
        return JSON.stringify(value);
    }

    function normalizeFinanceCalendar(data) {
        const records = Array.isArray(data) ? data : data?.events;
        if (!Array.isArray(records)) throw new Error("Nieprawidłowa odpowiedź FinanceCalendar");

        const events = [];
        const seen = new Set();
        let validRecords = 0;
        records.forEach(record => {
            if (!record || typeof record !== "object" || Array.isArray(record) ||
                typeof record.name !== "string" || !record.name.trim() ||
                !["high", "medium", "low"].includes(record.impact) ||
                (record.category != null && typeof record.category !== "string") ||
                (record.all_day != null && typeof record.all_day !== "boolean")) return;

            const day = parseDay(record.date);
            if (day === null) return;
            const hasTime = record.time_utc != null && record.time_utc !== "";
            const kind = record.all_day === true ? "all-day" : hasTime ? "timed" : "unknown-time";
            const timestamp = kind === "timed" ? parseTimestamp(record.time_utc) : null;
            // A malformed supplied time is a bad record, not an unconfirmed schedule.
            if (kind === "timed" && timestamp === null) return;

            validRecords += 1;
            const key = recordKey(record);
            if (seen.has(key)) return;
            seen.add(key);

            // Date-only policy: date is a civil day in Europe/Warsaw, not an instant
            // at UTC midnight. All-day and unknown-time records remain distinct.
            // Both sort at the start of that day and expire at the next local midnight;
            // midnight is only a sorting boundary, never a claimed release time.
            const sortAt = timestamp ?? warsawMidnight(day);
            events.push({
                name: record.name, category: record.category || "", impact: record.impact,
                kind, sortAt, expiresAt: timestamp ?? warsawMidnight(day + DAY_MS)
            });
        });
        // An empty list is valid; an entirely malformed nonempty response is an outage.
        // Valid low-impact or past events can legitimately yield no visible events.
        if (records.length && !validRecords) throw new Error("Brak poprawnych rekordów FinanceCalendar");
        return events;
    }

    async function fetchFinanceCalendar(now, signal) {
        // Keep the existing UTC date parameters, 14-day horizon and limit=100.
        const from = new Date(now).toISOString().slice(0, 10);
        const to = new Date(parseDay(from) + 14 * DAY_MS).toISOString().slice(0, 10);
        const url = "https://www.financecalendar.com/wp-json/fc/v1/calendar" +
            `?from=${from}&to=${to}&limit=100`;
        const response = await fetch(url, { signal });
        if (!response.ok) throw new Error(`FinanceCalendar: ${response.status}`);
        return normalizeFinanceCalendar(await response.json());
    }

    function selectUpcoming(events, now) {
        return events.filter(event =>
            (event.impact === "high" || event.impact === "medium") &&
            (event.kind === "timed" ? event.expiresAt >= now : event.expiresAt > now))
            .sort((a, b) => a.sortAt - b.sortAt)
            .slice(0, 5);
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

    function renderEvents(events) {
        // Renderer consumes only the internal event model; fetching and FinanceCalendar
        // field validation stay above this boundary for a future source replacement.
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
            const info = element("div", "calendar-info");
            info.append(element("strong", "", event.name), element("span", "", event.category));
            row.append(date, info, element("span", "calendar-impact " + event.impact, event.impact.toUpperCase()));
            fragment.appendChild(row);
        });
        container.replaceChildren(fragment);
    }

    async function updateCalendar() {
        if (refreshing) return;
        refreshing = true;
        container.setAttribute("aria-busy", "true");
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
        try {
            const events = await fetchFinanceCalendar(Date.now(), controller.signal);
            renderEvents(selectUpcoming(events, Date.now()));
            lastResult = events;
            container.removeAttribute("title");
            container.removeAttribute("data-stale");
        } catch (error) {
            console.warn("Nie udało się pobrać kalendarza:", error);
            if (lastResult !== null) {
                // Keep the last successfully rendered list, including a valid empty list.
                container.setAttribute("data-stale", "true");
                container.title = "Odświeżenie kalendarza nie powiodło się; zachowano ostatnie poprawne dane.";
            } else {
                renderMessage("kalendarz niedostępny");
            }
        } finally {
            clearTimeout(timeout);
            container.setAttribute("aria-busy", "false");
            refreshing = false;
        }
    }

    updateCalendar();
    setInterval(updateCalendar, REFRESH_MS);
})();
