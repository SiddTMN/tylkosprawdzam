"use strict";
const fs = require("node:fs/promises");
const path = require("node:path");
const { buildSnapshot, parseSnapshot, getRange, normalizeFinanceCalendar } = require("../js/calendar-model.js");

async function generate({ now = Date.now(), fetchImpl = fetch,
    outputPath = path.join(__dirname, "../data/macro-calendar.json"), timeoutMs = 15000 } = {}) {
    const { from, to } = getRange(now);
    const url = "https://www.financecalendar.com/wp-json/fc/v1/calendar?from=" + from + "&to=" + to + "&limit=100";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let temporaryPath;
    try {
        const response = await fetchImpl(url, { signal: controller.signal, headers: { Accept: "application/json" } });
        if (!response.ok) throw new Error("FinanceCalendar HTTP " + response.status);
        const payload = await response.json();
        // CI rejects partial malformed responses; browser fallback tolerates isolated bad records.
        const records = Array.isArray(payload) ? payload : payload?.events;
        if (!Array.isArray(records) || records.length > 100) throw new Error("Invalid FinanceCalendar envelope");
        for (const record of records) normalizeFinanceCalendar([record]);
        const snapshot = buildSnapshot(payload, now);
        parseSnapshot(snapshot, now);
        await fs.mkdir(path.dirname(outputPath), { recursive: true });
        temporaryPath = outputPath + ".tmp-" + process.pid;
        await fs.writeFile(temporaryPath, JSON.stringify(snapshot, null, 2) + "\n", "utf8");
        await fs.rename(temporaryPath, outputPath);
        temporaryPath = null;
        return snapshot;
    } finally {
        clearTimeout(timeout);
        if (temporaryPath) await fs.rm(temporaryPath, { force: true });
    }
}

if (require.main === module) {
    generate().then(snapshot => console.log("FinanceCalendar: " + snapshot.events.length + " events; " + snapshot.generatedAt))
        .catch(error => { console.error("Calendar update failed; previous JSON preserved:", error.message); process.exitCode = 1; });
}
module.exports = { generate };
