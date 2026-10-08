"use strict";
const fs = require("node:fs/promises");
const path = require("node:path");
const { parseSnapshot, getRange, normalizeFinanceCalendar, buildCombinedSnapshot } = require("../js/calendar-model.js");
const { ENDPOINT, normalizeTreasury } = require("../js/treasury-model.js");
const FINANCE_ENDPOINT = "https://www.financecalendar.com/wp-json/fc/v1/calendar";

async function fetchJson(url, fetchImpl, timeoutMs) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetchImpl(url, { signal: controller.signal, headers: { Accept: "application/json" } });
        if (!response.ok) throw new Error("Calendar source HTTP " + response.status);
        return await response.json();
    } finally {
        clearTimeout(timeout);
    }
}

async function readPrevious(outputPath, now) {
    try { return parseSnapshot(JSON.parse(await fs.readFile(outputPath, "utf8")), now); }
    catch { return null; } // Missing, corrupt or expired snapshots never become trusted fallback data.
}

function financeEvents(payload) {
    const records = Array.isArray(payload) ? payload : payload?.events;
    if (!Array.isArray(records) || records.length > 100) throw new Error("Invalid FinanceCalendar envelope");
    for (const record of records) normalizeFinanceCalendar([record]);
    return normalizeFinanceCalendar(payload);
}

async function generate({ now = Date.now(), fetchImpl = fetch,
    outputPath = path.join(__dirname, "../data/macro-calendar.json"), timeoutMs = 15000,
    onWarning = () => {} } = {}) {
    const { from, to } = getRange(now);
    const previous = await readPrevious(outputPath, now);
    const results = await Promise.allSettled([
        fetchJson(FINANCE_ENDPOINT + "?from=" + from + "&to=" + to + "&limit=100", fetchImpl, timeoutMs)
            .then(financeEvents),
        fetchJson(ENDPOINT, fetchImpl, timeoutMs).then(payload => normalizeTreasury(payload, now))
    ]);
    const sources = {};
    const lists = {};
    const checkedAt = new Date(now).toISOString();
    for (const [index, name] of ["FinanceCalendar", "TreasuryDirect"].entries()) {
        const result = results[index];
        const endpoint = index === 0 ? FINANCE_ENDPOINT : ENDPOINT;
        if (result.status === "fulfilled") {
            sources[name] = { endpoint, status: "fresh", checkedAt, lastSuccessAt: checkedAt };
            lists[name] = result.value;
        } else {
            const cachedAt = previous?.sources
                ? previous.sources[name]?.lastSuccessAt
                : name === "FinanceCalendar" && previous ? new Date(previous.generatedAt).toISOString() : null;
            if (cachedAt) {
                lists[name] = previous.events.filter(e => (e.source || "FinanceCalendar") === name);
                sources[name] = { endpoint, status: "stale", checkedAt, lastSuccessAt: cachedAt };
            } else {
                if (name === "FinanceCalendar") throw result.reason;
                lists[name] = [];
                sources[name] = { endpoint, status: "unavailable", checkedAt, lastSuccessAt: null };
            }
            onWarning(name + ": " + result.reason.message + "; " + sources[name].status);
        }
    }
    const snapshot = buildCombinedSnapshot(lists.FinanceCalendar, lists.TreasuryDirect, sources, now);
    let temporaryPath;
    try {
        await fs.mkdir(path.dirname(outputPath), { recursive: true });
        temporaryPath = outputPath + ".tmp-" + process.pid;
        await fs.writeFile(temporaryPath, JSON.stringify(snapshot, null, 2) + "\n", "utf8");
        await fs.rename(temporaryPath, outputPath);
        temporaryPath = null;
        return snapshot;
    } finally {
        if (temporaryPath) await fs.rm(temporaryPath, { force: true });
    }
}

if (require.main === module) {
    generate({ onWarning: message => console.warn("::warning::" + message) })
        .then(snapshot => console.log("MacroCalendar: " + snapshot.events.length + " events; " +
            snapshot.generatedAt + "; " + Object.entries(snapshot.sources)
                .map(([name, source]) => name + "=" + source.status).join(", ")))
        .catch(error => { console.error("Calendar update failed; previous JSON preserved:", error.message); process.exitCode = 1; });
}
module.exports = { generate };
