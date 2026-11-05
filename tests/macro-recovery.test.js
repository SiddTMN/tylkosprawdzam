"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
// Relevant fields from the official upcoming endpoint, retrieved 2026-11-05.
const current = require("./fixtures/treasury-upcoming-2026-11-05.json");
const { ENDPOINT, normalizeTreasury, validateEvent } = require("../js/treasury-model.js");
const { generate } = require("../scripts/generate-macro-calendar.cjs");
const { parseSnapshot } = require("../js/calendar-model.js");
const now = Date.parse("2026-11-05T10:00:00Z");
const response = payload => ({ ok: true, json: async () => structuredClone(payload) });
async function workspace(t) {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "macro-recovery-"));
    t.after(() => fs.rm(dir, { recursive: true, force: true }));
    return path.join(dir, "macro-calendar.json");
}

test("November Treasury response restores 10Y/30Y dates, confirmation and Warsaw times", () => {
    const before = structuredClone(current);
    const events = normalizeTreasury(current, now);
    assert.deepEqual(events.map(e => [e.cusip, e.auctionDate, e.confirmation]), [
        ["91282CRX1", "2026-11-10", "announced"],
        ["912810UY2", "2026-11-12", "announced"]
    ]);
    for (const e of events) {
        assert.equal(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Warsaw",
            hour: "2-digit", minute: "2-digit" }).format(e.sortAt), "19:00");
        assert.equal(e.timeBasis, "competitive-bid-close");
        assert.deepEqual(validateEvent(e, now), e);
    }
    assert.deepEqual(current, before);
});

test("current fields retain nominal exclusions, tentative times and strict validation", () => {
    const row = current.find(r => r.originalSecurityTerm === "10-Year");
    for (const flag of ["inflationProtected", "floatingRate"]) {
        assert.deepEqual(normalizeTreasury([{ ...row, [flag]: "Yes" }], now), []);
        for (const value of [undefined, "", "false", null])
            assert.throws(() => normalizeTreasury([{ ...row, [flag]: value }], now), /nominal flags/);
    }
    const tentative = normalizeTreasury([{ ...row,
        treasuryOfferingAnnouncementPressReleaseFileName: "", offeringAmount: "" }], now)[0];
    assert.equal(tentative.confirmation, "tentative");
    assert.equal(tentative.kind, "unknown-time");
    assert.equal(tentative.competitiveClose, null);
    for (const extra of [
        { tips: "Yes" }, { auctionDate: "2026-11-11T00:00:00" },
        { closingTimeCompetitive: "02:00 PM" }, { closingTimeNoncompetitive: "11:00 AM" },
        { pdfFilenameAnnouncement: "A_20261104_99.pdf" },
        { noncompetitiveAuctionCloseDate: "2026-11-09T00:00:00" },
        { competitiveAuctionCloseTime: "bad" }, { competitiveAuctionCloseDate: "2026-02-30" },
        { treasuryOfferingAnnouncementPressReleaseFileName: "../fake.pdf" }
    ]) assert.throws(() => normalizeTreasury([{ ...row, ...extra }], now));
    assert.equal(normalizeTreasury([{ ...row, tips: "No" }], now).length, 1);
});

test("FinanceCalendar 401 cannot block healthy Treasury without a usable cache", async t => {
    const outputPath = await workspace(t);
    const result = await generate({ now, outputPath, financeApiKey: "", fetchImpl: async url =>
        url === ENDPOINT ? response(current) : { ok: false, status: 401 } });
    assert.equal(result.events.length, 2);
    assert.equal(result.sources.FinanceCalendar.status, "unavailable");
    assert.equal(result.sources.FinanceCalendar.lastSuccessAt, null);
    assert.equal(result.sources.TreasuryDirect.status, "fresh");
    assert.equal(parseSnapshot(result, now).events.length, 2);
    const empty = await generate({ now, outputPath, financeApiKey: "", fetchImpl: async url =>
        url === ENDPOINT ? response([]) : { ok: false, status: 401 } });
    assert.deepEqual(empty.events, []);
    assert.equal(empty.sources.TreasuryDirect.status, "fresh");
});

test("API key goes only to FinanceCalendar header, never URL, Treasury or saved JSON", async t => {
    const outputPath = await workspace(t), key = "test-only-secret";
    const urls = [], warnings = [];
    const result = await generate({ now, outputPath, financeApiKey: key,
        onWarning: message => warnings.push(message), fetchImpl: async (url, options) => {
            urls.push(url);
            assert.equal(options.redirect, "error");
            assert.equal(options.headers["X-API-Key"], url === ENDPOINT ? undefined : key);
            return response(url === ENDPOINT ? current : []);
        } });
    assert.equal(result.sources.FinanceCalendar.status, "fresh");
    assert.ok(!JSON.stringify([urls, warnings, result]).includes(key));
    assert.ok(!(await fs.readFile(outputPath, "utf8")).includes(key));
});

test("total outage after cached events expire fails visibly and preserves previous bytes", async t => {
    const outputPath = await workspace(t);
    await generate({ now, outputPath, financeApiKey: "", fetchImpl: async url =>
        response(url === ENDPOINT ? current : []) });
    const previous = await fs.readFile(outputPath, "utf8");
    await assert.rejects(generate({ now: Date.parse("2026-11-13T10:00:00Z"), outputPath,
        financeApiKey: "", fetchImpl: async () => ({ ok: false, status: 503 }) }),
        /All macro sources failed/);
    assert.equal(await fs.readFile(outputPath, "utf8"), previous);
    const recovered = await generate({ now: Date.parse("2026-11-13T11:00:00Z"), outputPath,
        financeApiKey: "", fetchImpl: async () => response([]) });
    assert.deepEqual(recovered.events, []);
    assert.equal(recovered.sources.FinanceCalendar.status, "fresh");
});
