// Shared browser/generator model. No DOM or network access.
(function (root, factory) {
    if (typeof module === "object" && module.exports) module.exports = factory(require("./treasury-model.js"));
    else root.MacroCalendarModel = factory(root.TreasuryCalendarModel);
})(typeof globalThis !== "undefined" ? globalThis : this, (treasury) => {
    "use strict";
    const TIME_ZONE = "Europe/Warsaw";
    const DAY_MS = 86400000;
    const MAX_AGE_MS = 6 * 60 * 60 * 1000;
    const civilFormat = new Intl.DateTimeFormat("en-GB", {
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
        hourCycle: "h23", timeZone: TIME_ZONE
    });
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


    function getRange(now) {
        // Preserve stage 1's UTC query dates and provider's 14-day horizon.
        const from = new Date(now).toISOString().slice(0, 10);
        return { from, to: new Date(parseDay(from) + 14 * DAY_MS).toISOString().slice(0, 10) };
    }

    function selectUpcoming(events, now, limit = 5) {
        return events.filter(event =>
            (event.impact === "high" || event.impact === "medium") &&
            (event.kind === "timed" ? event.expiresAt >= now : event.expiresAt > now))
            .sort((a, b) => a.sortAt - b.sortAt).slice(0, limit);
    }

    function buildSnapshot(data, now) {
        const range = getRange(now);
        const end = warsawMidnight(parseDay(range.to) + DAY_MS);
        return {
            schemaVersion: 1, source: "FinanceCalendar",
            generatedAt: new Date(now).toISOString(),
            queryTimezone: "UTC", displayTimezone: TIME_ZONE, range,
            events: selectUpcoming(normalizeFinanceCalendar(data), now, Infinity)
                .filter(event => event.sortAt < end)
        };
    }


    function sourceIsStale(source, now) {
        return source.status !== "fresh" || source.lastSuccessAt === null ||
            now - parseTimestamp(source.lastSuccessAt) > MAX_AGE_MS;
    }

    function validateSources(sources, generatedAt) {
        if (!sources || typeof sources !== "object" || Array.isArray(sources))
            throw new Error("Invalid calendar source metadata");
        const result = {};
        for (const name of ["FinanceCalendar", "TreasuryDirect"]) {
            const s = sources[name];
            const checkedAt = parseTimestamp(s?.checkedAt);
            const successAt = s?.lastSuccessAt === null ? null : parseTimestamp(s?.lastSuccessAt);
            if (!s || !["fresh", "stale", "unavailable"].includes(s.status) ||
                checkedAt !== generatedAt || (s.lastSuccessAt !== null && successAt === null) ||
                (successAt !== null && successAt > checkedAt) ||
                (s.status === "unavailable") !== (successAt === null) ||
                (s.status === "fresh" && successAt !== checkedAt) ||
                s.endpoint !== (name === "FinanceCalendar"
                    ? "https://www.financecalendar.com/wp-json/fc/v1/calendar" : treasury.ENDPOINT))
                throw new Error("Invalid calendar source freshness");
            result[name] = { endpoint: s.endpoint, status: s.status, checkedAt: s.checkedAt,
                lastSuccessAt: s.lastSuccessAt };
        }
        return result;
    }

    function buildCombinedSnapshot(financeEvents, treasuryEvents, sources, now) {
        const range = getRange(now);
        const end = warsawMidnight(parseDay(range.to) + DAY_MS);
        const start = warsawMidnight(parseDay(range.from));
        const events = treasury.mergeEvents(financeEvents.map(e => ({ ...e, source: "FinanceCalendar" })),
            treasuryEvents);
        const snapshot = {
            schemaVersion: 2, source: "FinanceCalendar+TreasuryDirect",
            generatedAt: new Date(now).toISOString(), queryTimezone: "UTC",
            displayTimezone: TIME_ZONE, range, sources,
            events: selectUpcoming(events, now, Infinity).filter(e => e.sortAt >= start && e.sortAt < end)
        };
        parseSnapshot(snapshot, now);
        return snapshot;
    }

    function parseSnapshot(data, now) {
        const generatedAt = parseTimestamp(data?.generatedAt);
        const from = parseDay(data?.range?.from);
        const to = parseDay(data?.range?.to);
        if (!([1, 2].includes(data?.schemaVersion)) ||
            data.source !== (data.schemaVersion === 1 ? "FinanceCalendar" : "FinanceCalendar+TreasuryDirect") ||
            data.queryTimezone !== "UTC" || data.displayTimezone !== TIME_ZONE ||
            generatedAt === null || generatedAt > now + 5 * 60 * 1000 ||
            from === null || to !== from + 14 * DAY_MS ||
            new Date(generatedAt).toISOString().slice(0, 10) !== data.range.from ||
            !Array.isArray(data.events) || data.events.length > (data.schemaVersion === 1 ? 100 : 300) ||
            now >= warsawMidnight(to + DAY_MS)) {
            throw new Error("Nieprawidłowy lub wygasły plik kalendarza");
        }
        const end = warsawMidnight(to + DAY_MS);
        const sources = data.schemaVersion === 2 ? validateSources(data.sources, generatedAt) : null;
        const treasuryIds = new Set();
        const events = data.events.map(event => {
            if (!event || typeof event.name !== "string" || !event.name.trim() ||
                typeof event.category !== "string" || !["high", "medium"].includes(event.impact) ||
                !["timed", "all-day", "unknown-time"].includes(event.kind) ||
                !Number.isSafeInteger(event.sortAt) || !Number.isSafeInteger(event.expiresAt) ||
                event.sortAt < warsawMidnight(from) || event.sortAt >= end ||
                event.expiresAt < event.sortAt || event.expiresAt > end) {
                throw new Error("Nieprawidłowe wydarzenie w pliku kalendarza");
            }
            if (event.kind === "timed") {
                if (event.expiresAt !== event.sortAt || event.sortAt < generatedAt) {
                    throw new Error("Nieprawidłowy czas publikacji");
                }
            } else {
                const parts = Object.fromEntries(civilFormat.formatToParts(event.sortAt)
                    .filter(part => part.type !== "literal").map(part => [part.type, part.value]));
                const day = parseDay(parts.year + "-" + parts.month + "-" + parts.day);
                if (day === null || event.sortAt !== warsawMidnight(day) ||
                    event.expiresAt !== warsawMidnight(day + DAY_MS) || event.expiresAt <= generatedAt) {
                    throw new Error("Nieprawidłowe granice dnia wydarzenia");
                }
            }
            if (sources) {
                if (!["FinanceCalendar", "TreasuryDirect"].includes(event.source) ||
                    sources[event.source].lastSuccessAt === null) throw new Error("Invalid event source");
                if (event.source === "TreasuryDirect") {
                    const normalized = treasury.validateEvent(event, parseTimestamp(sources.TreasuryDirect.lastSuccessAt));
                    if (treasuryIds.has(normalized.id)) throw new Error("Duplicate Treasury snapshot identity");
                    treasuryIds.add(normalized.id);
                    return normalized;
                }
            }
            return { name: event.name, category: event.category, impact: event.impact,
                kind: event.kind, sortAt: event.sortAt, expiresAt: event.expiresAt,
                ...(sources ? { source: "FinanceCalendar" } : {}) };
        });
        return { events, generatedAt, sources,
            stale: now - generatedAt > MAX_AGE_MS || Boolean(sources && sourceIsStale(sources.FinanceCalendar, now)),
            partialStale: Boolean(sources && sourceIsStale(sources.TreasuryDirect, now)) };
    }
    return { normalizeFinanceCalendar, getRange, selectUpcoming, buildSnapshot, buildCombinedSnapshot,
        parseSnapshot, sourceIsStale, MAX_AGE_MS };
});
