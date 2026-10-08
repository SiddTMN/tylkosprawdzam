"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { generate } = require("../scripts/generate-macro-calendar.cjs");
const { buildSnapshot, parseSnapshot, selectUpcoming } = require("../js/calendar-model.js");
const now = Date.parse("2026-10-08T10:00:00Z");
const record = (name, extra = {}) => ({ name, date: "2026-10-08",
    time_utc: "2026-10-08T12:00:00Z", impact: "high", all_day: false, ...extra });
const response = payload => ({ ok: true, json: async () => payload });

async function workspace(t) {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "macro-calendar-test-"));
    t.after(() => fs.rm(dir, { recursive: true, force: true }));
    return path.join(dir, "macro-calendar.json");
}

test("generator writes validated sorted JSON, removes only exact duplicates, keeps more than five", async t => {
    const outputPath = await workspace(t);
    const payload = Array.from({ length: 8 }, (_, i) => record("release " + i, {
        time_utc: "2026-10-08T" + (18 - i) + ":00:00Z"
    }));
    payload.push({ ...payload[0] }, record("low", { impact: "low" }), record("past", { time_utc: "2026-10-08T09:00:00Z" }));
    const snapshot = await generate({ now, outputPath, fetchImpl: async (url, options) => {
        assert.equal(url, "https://www.financecalendar.com/wp-json/fc/v1/calendar?from=2026-10-08&to=2026-10-22&limit=100");
        assert.ok(options.signal instanceof AbortSignal);
        return response({ events: payload });
    } });
    const saved = JSON.parse(await fs.readFile(outputPath, "utf8"));
    assert.deepEqual(saved, snapshot);
    assert.equal(saved.events.length, 8);
    assert.equal(saved.events[0].name, "release 7");
    assert.equal(selectUpcoming(parseSnapshot(saved, now).events, now).length, 5);
    assert.equal(saved.source, "FinanceCalendar");
    assert.equal(saved.displayTimezone, "Europe/Warsaw");
    assert.deepEqual(await fs.readdir(path.dirname(outputPath)), ["macro-calendar.json"]);
});

test("HTTP, JSON, envelope, partial and total validation errors preserve previous bytes", async t => {
    const outputPath = await workspace(t);
    const previous = JSON.stringify(buildSnapshot([record("previous")], now));
    await fs.writeFile(outputPath, previous);
    for (const fetchImpl of [
        async () => { throw new Error("offline"); },
        async () => ({ ok: false, status: 503 }),
        async () => ({ ok: true, json: async () => { throw new SyntaxError("JSON"); } }),
        async () => response({ error: "upstream error" }),
        async () => response([null]),
        async () => response([record("valid"), record("invalid", { time_utc: "bad" })]),
        async () => response([record("invalid", { date: "2026-02-30" })])
    ]) {
        await assert.rejects(generate({ now, outputPath, fetchImpl }));
        assert.equal(await fs.readFile(outputPath, "utf8"), previous);
        assert.deepEqual(await fs.readdir(path.dirname(outputPath)), ["macro-calendar.json"]);
    }
});

test("timeout preserves JSON and aborts the request", async t => {
    const outputPath = await workspace(t);
    await fs.writeFile(outputPath, "previous");
    let signal;
    await assert.rejects(generate({ now, outputPath, timeoutMs: 5, fetchImpl: async (url, options) => {
        signal = options.signal;
        return new Promise((resolve, reject) => {
            signal.addEventListener("abort", () => reject(new Error("timeout")), { once: true });
        });
    } }), /timeout/);
    assert.equal(signal.aborted, true);
    assert.equal(await fs.readFile(outputPath, "utf8"), "previous");
});

test("empty responses and low-only lists are valid, out-of-range records are excluded", async t => {
    const outputPath = await workspace(t);
    for (const payload of [[], { events: [] }, [record("low", { impact: "low" })],
        [record("outside", { date: "2026-10-30", time_utc: "2026-10-30T12:00:00Z" })]]) {
        const result = await generate({ now, outputPath, fetchImpl: async () => response(payload) });
        assert.deepEqual(result.events, []);
    }
});

test("schema freshness, horizon and exact Warsaw DST day boundaries are validated", () => {
    for (const [date, generated, nextMidnight] of [
        ["2026-03-29", "2026-03-29T10:00:00Z", "2026-03-29T22:00:00Z"],
        ["2026-10-25", "2026-10-25T10:00:00Z", "2026-10-25T23:00:00Z"]
    ]) {
        const instant = Date.parse(generated);
        const snapshot = buildSnapshot([
            record("all-day", { date, all_day: true, time_utc: null }),
            record("unknown", { date, time_utc: null })
        ], instant);
        const parsed = parseSnapshot(snapshot, instant);
        assert.equal(parsed.events[0].expiresAt, Date.parse(nextMidnight));
        assert.deepEqual(parsed.events.map(e => e.kind), ["all-day", "unknown-time"]);
        assert.equal(selectUpcoming(parsed.events, Date.parse(nextMidnight)).length, 0);
        assert.throws(() => parseSnapshot({ ...snapshot, events: [
            { ...snapshot.events[0], expiresAt: snapshot.events[0].expiresAt + 3600000 }
        ] }, instant), /granice/);
    }
    const snapshot = buildSnapshot([record("event")], now);
    assert.equal(parseSnapshot(snapshot, now + 6 * 3600000).stale, false);
    assert.equal(parseSnapshot(snapshot, now + 6 * 3600000 + 1).stale, true);
    assert.throws(() => parseSnapshot(snapshot, Date.parse("2026-10-23T00:00:00Z")), /wygasły/);
});

test("normalization preserves distinct provider publications and literal HTML", () => {
    const a = record("<img src=x onerror=alert(1)>", { url: "https://example.com/a" });
    const snapshot = buildSnapshot([a, { ...a }, { ...a, url: "https://example.com/b" }], now);
    assert.equal(snapshot.events.length, 2);
    assert.equal(parseSnapshot(snapshot, now).events[0].name, a.name);
});

test("failed first fetch creates no file; a later successful run recovers", async t => {
    const outputPath = await workspace(t);
    await assert.rejects(generate({ now, outputPath, fetchImpl: async () => response({ events: "bad" }) }));
    await assert.rejects(fs.stat(outputPath), { code: "ENOENT" });
    await generate({ now, outputPath, fetchImpl: async () => response([record("recovery")]) });
    assert.equal(JSON.parse(await fs.readFile(outputPath, "utf8")).events[0].name, "recovery");
});
