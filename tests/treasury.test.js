"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const samples = require("./fixtures/treasury-samples.json");
const live = require("./fixtures/treasury-upcoming.json");
const { ENDPOINT, normalizeTreasury, mergeEvents, validateEvent, validCusip } = require("../js/treasury-model.js");
const { generate } = require("../scripts/generate-macro-calendar.cjs");
const { buildSnapshot, parseSnapshot, selectUpcoming } = require("../js/calendar-model.js");
const now = Date.parse("2026-10-08T10:00:00Z");
const later = now + 3600000;
const bond = samples[0];
const fc = (name = "US CPI") => ({ name, category: "economic-indicators", impact: "high",
    date: "2026-10-09", time_utc: "2026-10-09T12:30:00Z" });
const response = payload => ({ ok: true, json: async () => structuredClone(payload) });
const route = (finance, treasury) => async url => {
    const value = url === ENDPOINT ? treasury : finance;
    if (value instanceof Error) throw value;
    return response(value);
};
async function workspace(t) {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "treasury-calendar-test-"));
    t.after(() => fs.rm(dir, { recursive: true, force: true }));
    return path.join(dir, "macro-calendar.json");
}

test("official fixtures select nominal 2Y/5Y/10Y/30Y by original term; exclude TIPS/FRN/bills/3Y/7Y/20Y", () => {
    const events = normalizeTreasury(samples, now);
    assert.deepEqual(events.map(e => e.originalTerm), ["30-Year", "2-Year", "5-Year", "10-Year"]);
    assert.deepEqual(events.map(e => e.impact), ["high", "medium", "medium", "high"]);
    assert.equal(events[0].remainingTerm, "29-Year 10-Month");
    assert.equal(events[3].remainingTerm, "9-Year 10-Month");
    assert.equal(events[0].reopening, true);
    assert.equal(events[1].reopening, false);
    assert.equal(normalizeTreasury(live, now).length, 1);
});

test("live 30Y fixture has confirmed auction date, CUSIP, settlement and competitive close, without confusing settlement with auction", () => {
    const e = normalizeTreasury([bond], now)[0];
    assert.equal(e.cusip, "912810UW6");
    assert.equal(e.auctionDate, "2026-10-08");
    assert.equal(e.settlementDate, "2026-10-15");
    assert.equal(e.confirmation, "announced");
    assert.equal(e.sortAt, Date.parse("2026-10-08T17:00:00Z"));
    assert.equal(e.timeBasis, "competitive-bid-close");
    assert.equal(e.timeZone, "America/New_York");
    assert.equal(e.competitiveClose, "13:00");
    assert.equal(e.noncompetitiveClose, "12:00");
    assert.equal(e.expiresAt, e.sortAt);
    assert.deepEqual(validateEvent(e, now), e);
    assert.equal(validCusip(e.cusip), true);
    assert.equal(validCusip("912810UW7"), false);
});

test("Treasury deduplication ignores object order and irrelevant provider fields, keeps separate auctions of the same CUSIP, rejects conflicts", () => {
    const reversed = Object.fromEntries(Object.entries(bond).reverse());
    assert.equal(normalizeTreasury([bond, reversed, { ...bond, updatedTimestamp: "other" }], now).length, 1);
    assert.equal(normalizeTreasury([bond, { ...bond, auctionDate: "2026-10-09T00:00:00" }], now).length, 2);
    assert.throws(() => normalizeTreasury([bond, { ...bond, closingTimeCompetitive: "02:00 PM" }], now), /Conflicting/);
});

test("bad envelopes, identities, nominal flags, terms, civil dates, confirmation and deadlines are rejected", () => {
    for (const payload of [null, {}, { data: [] }, [null], new Array(1001).fill(bond)]) {
        assert.throws(() => normalizeTreasury(payload, now));
    }
    for (const extra of [
        { securityType: "Unknown" }, { cusip: "912810UW7" }, { cusip: "bad" },
        { originalSecurityTerm: "" }, { originalSecurityTerm: "29-Year 10-Month" },
        { term: "10-Year" }, { securityType: "Note" }, { securityTerm: "bad" },
        { tips: "" }, { floatingRate: "false" }, { reopening: "true" },
        { auctionDate: "2026-02-30T00:00:00" }, { auctionDate: "2026-10-08T17:00:00Z" },
        { issueDate: "2026-10-07T00:00:00" }, { announcementDate: "2026-10-09T00:00:00" },
        { maturityDate: "2026-10-10T00:00:00" }, { closingTimeCompetitive: "13:00 PM" },
        { closingTimeCompetitive: "01:60 PM" }, { closingTimeNoncompetitive: "02:00 PM" },
        { offeringAmount: "0" }, { offeringAmount: 22000000000 },
        { pdfFilenameAnnouncement: "../../fake.pdf" }, { pdfFilenameAnnouncement: "" },
        { pdfFilenameAnnouncement: "A_20261002_4.pdf" }
    ]) assert.throws(() => normalizeTreasury([{ ...bond, ...extra }], now), JSON.stringify(extra));
});

test("competitive times follow New York DST; Warsaw presentation handles weeks with different change dates", () => {
    for (const [date, expectedUtcHour, warsawTime] of [
        ["2026-01-09", 18, "19:00"], ["2026-03-13", 17, "18:00"],
        ["2026-03-30", 17, "19:00"], ["2026-10-23", 17, "19:00"],
        ["2026-10-30", 17, "18:00"], ["2026-11-06", 18, "19:00"]
    ]) {
        const announced = new Date(Date.parse(date + "T00:00:00Z") - 7 * 86400000).toISOString().slice(0, 10);
        const e = normalizeTreasury([{ ...bond, auctionDate: date, issueDate: date,
            announcementDate: announced, pdfFilenameAnnouncement: "A_" + announced.replaceAll("-", "") + "_4.pdf"
        }], Date.parse(date + "T10:00:00Z"))[0];
        assert.equal(e.sortAt, Date.parse(date + "T" + expectedUtcHour + ":00:00Z"));
        assert.equal(new Intl.DateTimeFormat("en-GB", {
            timeZone: "Europe/Warsaw", hour: "2-digit", minute: "2-digit"
        }).format(e.sortAt), warsawTime);
    }
});

test("tentative dates and missing hours stay unconfirmed, without inventing 13:00 or midnight as the auction hour", () => {
    const tentative = { ...bond, pdfFilenameAnnouncement: "", offeringAmount: "",
        announcementDate: "2026-10-08", maturityDate: "" };
    const e = normalizeTreasury([tentative], now)[0];
    assert.equal(e.confirmation, "tentative");
    assert.equal(e.kind, "unknown-time");
    assert.equal(e.competitiveClose, null);
    assert.equal(e.timeBasis, "unconfirmed");
    assert.equal(e.announcementUrl, null);
    assert.equal(e.sortAt, Date.parse("2026-10-07T22:00:00Z"));
    assert.equal(e.expiresAt, Date.parse("2026-10-08T22:00:00Z"));
    assert.deepEqual(validateEvent(e, now), e);
    assert.equal(normalizeTreasury([{ ...bond, closingTimeCompetitive: "" }], now)[0].kind, "unknown-time");
    assert.throws(() => normalizeTreasury([bond], Date.parse("2026-09-30T10:00:00Z")), /confirmation/);
});

test("exact CUSIP/day or narrow same-tenor same-instant labels deduplicate across sources; similar events and TIPS remain", () => {
    const treasury = normalizeTreasury([bond], now);
    const f = name => ({ name, kind: "timed", sortAt: treasury[0].sortAt, expiresAt: treasury[0].sortAt,
        impact: "medium", category: "economic-indicators" });
    const finance = [
        f("US 30-Year Bond Auction"), f("US Treasury Auction CUSIP 912810UW6"),
        f("US 30-Year TIPS Auction"), f("US 10-Year Bond Auction"),
        { ...f("US 30-Year Bond Auction"), sortAt: treasury[0].sortAt + 3600000 }
    ];
    const merged = mergeEvents(finance, treasury);
    assert.equal(merged.length, 4);
    assert.equal(merged[0].name, "US 30-Year TIPS Auction");
    assert.equal(mergeEvents([f("US 30-Year Bond Auction")],
        normalizeTreasury([{ ...bond, pdfFilenameAnnouncement: "", offeringAmount: "" }], now)).length, 2);
});

test("generator merges, sorts before five-row selection, excludes past and out-of-range auctions, stores source freshness", async t => {
    const outputPath = await workspace(t);
    const finance = Array.from({ length: 7 }, (_, i) => fc("release " + i));
    const result = await generate({ now, outputPath, fetchImpl: route(finance, samples) });
    assert.equal(result.schemaVersion, 2);
    assert.equal(result.events.length, 8);
    assert.equal(result.events[0].cusip, bond.cusip);
    assert.equal(selectUpcoming(parseSnapshot(result, now).events, now).length, 5);
    assert.equal(result.sources.TreasuryDirect.status, "fresh");
    assert.equal(result.sources.TreasuryDirect.lastSuccessAt, new Date(now).toISOString());
    const outside = { ...bond, auctionDate: "2026-10-23", issueDate: "2026-10-30" };
    const next = await generate({ now, outputPath, fetchImpl: route([fc()], [outside]) });
    assert.equal(next.events.length, 1);
});

test("Treasury HTTP/JSON/envelope/partial-validation failures preserve cached auctions and fresh FinanceCalendar", async t => {
    const outputPath = await workspace(t);
    await generate({ now, outputPath, fetchImpl: route([fc("original")], [bond]) });
    for (const failure of [
        async () => { throw new Error("offline"); },
        async () => ({ ok: false, status: 503 }),
        async () => ({ ok: true, json: async () => { throw new SyntaxError("broken JSON"); } }),
        async () => response({ error: "bad" }),
        async () => response([bond, { ...bond, cusip: "invalid" }]),
        async () => response([bond, { ...bond, closingTimeCompetitive: "02:00 PM" }])
    ]) {
        const result = await generate({ now: later, outputPath, fetchImpl: async url =>
            url === ENDPOINT ? failure() : response([fc("fresh")]) });
        assert.ok(result.events.some(e => e.cusip === bond.cusip));
        assert.ok(result.events.some(e => e.name === "fresh"));
        assert.equal(result.sources.FinanceCalendar.status, "fresh");
        assert.equal(result.sources.TreasuryDirect.status, "stale");
        assert.equal(result.sources.TreasuryDirect.lastSuccessAt, new Date(now).toISOString());
        assert.equal(parseSnapshot(result, later).stale, false);
        assert.equal(parseSnapshot(result, later).partialStale, true);
    }
    const recovered = await generate({ now: later + 1000, outputPath, fetchImpl: route([fc("recovered")], []) });
    assert.equal(recovered.sources.TreasuryDirect.status, "fresh");
    assert.ok(recovered.events.every(e => e.source === "FinanceCalendar")); // Fresh empty source replaces old rows.
});

test("Treasury failure on first run still publishes FinanceCalendar, marking source unavailable", async t => {
    const outputPath = await workspace(t);
    const result = await generate({ now, outputPath, fetchImpl: route([fc()], new Error("offline")) });
    assert.equal(result.events.length, 1);
    assert.equal(result.sources.TreasuryDirect.status, "unavailable");
    assert.equal(result.sources.TreasuryDirect.lastSuccessAt, null);
});

test("independent Treasury timeout aborts only that request and publishes FinanceCalendar", async t => {
    const outputPath = await workspace(t);
    let treasurySignal, financeSignal;
    const result = await generate({ now, outputPath, timeoutMs: 10, fetchImpl: async (url, options) => {
        if (url !== ENDPOINT) { financeSignal = options.signal; return response([fc()]); }
        treasurySignal = options.signal;
        return new Promise((resolve, reject) => {
            options.signal.addEventListener("abort", () => reject(new Error("timeout")), { once: true });
        });
    } });
    assert.equal(treasurySignal.aborted, true);
    assert.equal(financeSignal.aborted, false);
    assert.equal(result.sources.FinanceCalendar.status, "fresh");
    assert.equal(result.sources.TreasuryDirect.status, "unavailable");
});

test("FinanceCalendar failure reuses validated cache (including legacy v1) and allows Treasury update; both failures retain original freshness", async t => {
    const outputPath = await workspace(t);
    await fs.writeFile(outputPath, JSON.stringify(buildSnapshot([fc("legacy")], now)));
    const result = await generate({ now: later, outputPath, fetchImpl: route(new Error("FC offline"), [bond]) });
    assert.ok(result.events.some(e => e.name === "legacy"));
    assert.equal(result.sources.FinanceCalendar.lastSuccessAt, new Date(now).toISOString());
    assert.equal(result.sources.FinanceCalendar.status, "stale");
    assert.equal(result.sources.TreasuryDirect.status, "fresh");
    const both = await generate({ now: later + 1000, outputPath, fetchImpl: route(new Error("offline"), new Error("offline")) });
    assert.equal(both.sources.FinanceCalendar.lastSuccessAt, new Date(now).toISOString());
    assert.equal(both.sources.TreasuryDirect.lastSuccessAt, new Date(later).toISOString());
    assert.equal(both.sources.FinanceCalendar.status, "stale");
    assert.equal(both.sources.TreasuryDirect.status, "stale");
});

test("cache never retains expired auctions or renews source freshness during outages", async t => {
    const outputPath = await workspace(t);
    await generate({ now, outputPath, fetchImpl: route([fc()], [bond]) });
    const afterClose = Date.parse("2026-10-08T17:01:00Z");
    const result = await generate({ now: afterClose, outputPath, fetchImpl: route([fc()], new Error("offline")) });
    assert.ok(result.events.every(e => e.source === "FinanceCalendar"));
    assert.equal(result.sources.TreasuryDirect.lastSuccessAt, new Date(now).toISOString());
    assert.equal(result.sources.TreasuryDirect.status, "stale");
});

test("invalid and expired cache never supplies Treasury fallback; failure without FinanceCalendar preserves bytes", async t => {
    const outputPath = await workspace(t);
    await generate({ now, outputPath, fetchImpl: route([fc()], [bond]) });
    const saved = JSON.parse(await fs.readFile(outputPath, "utf8"));
    saved.events[0].cusip = "bad";
    const bytes = JSON.stringify(saved);
    await fs.writeFile(outputPath, bytes);
    await assert.rejects(generate({ now: later, outputPath, fetchImpl: route(new Error("offline"), []) }));
    assert.equal(await fs.readFile(outputPath, "utf8"), bytes);
    const fresh = await generate({ now: later, outputPath, fetchImpl: route([fc()], new Error("offline")) });
    assert.equal(fresh.sources.TreasuryDirect.status, "unavailable");
    await assert.rejects(generate({ now: Date.parse("2026-10-24T10:00:00Z"), outputPath,
        fetchImpl: route(new Error("offline"), []) }));
});

test("snapshot validation rejects forged auction metadata, inconsistent source freshness and duplicate identities", async t => {
    const outputPath = await workspace(t);
    const valid = await generate({ now, outputPath, fetchImpl: route([fc()], [bond]) });
    for (const extra of [
        { cusip: "912810UW7" }, { originalTerm: "10-Year" }, { settlementDate: "2026-10-07" },
        { confirmation: "tentative" }, { timeZone: "UTC" }, { timeBasis: "result-release" },
        { announcementUrl: "https://evil.example/A_20261001_4.pdf" }, { reopening: "Yes" },
        { competitiveClose: "14:00" }, { id: "fake" }, { source: "bad" }
    ]) {
        const data = structuredClone(valid);
        Object.assign(data.events[0], extra);
        assert.throws(() => parseSnapshot(data, now), JSON.stringify(extra));
    }
    for (const extra of [
        { lastSuccessAt: "2026-10-09T10:00:00Z" }, { status: "unavailable" },
        { endpoint: "https://evil.example/" }, { checkedAt: "2026-10-08T09:00:00Z" }
    ]) {
        const data = structuredClone(valid);
        Object.assign(data.sources.TreasuryDirect, extra);
        assert.throws(() => parseSnapshot(data, now));
    }
    assert.throws(() => parseSnapshot({ ...valid, events: [valid.events[0], valid.events[0]] }, now), /Duplicate/);
    assert.equal(parseSnapshot(valid, now + 6 * 3600000 + 1).partialStale, true);
});

test("atomic rename error cleans temporary file and leaves destination untouched", async t => {
    const outputPath = await workspace(t);
    await fs.mkdir(outputPath);
    await assert.rejects(generate({ now, outputPath, fetchImpl: route([fc()], [bond]) }));
    assert.equal((await fs.stat(outputPath)).isDirectory(), true);
    assert.deepEqual(await fs.readdir(path.dirname(outputPath)), ["macro-calendar.json"]);
});
