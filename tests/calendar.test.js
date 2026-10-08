"use strict";

// No dependencies: run with `node --test tests/calendar.test.js`.
// This harness exercises the real browser script with a minimal DOM, fake clock,
// controlled fetch and timers. It does not claim to test browser layout or CORS.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "../js/calendar.js"), "utf8");

class Element {
    constructor(tag) {
        this.tagName = tag;
        this.className = "";
        this.children = [];
        this.attributes = new Map();
        this.text = "";
    }
    set innerHTML(_) { throw new Error("Unsafe HTML rendering"); }
    set textContent(value) { this.text = String(value); this.children = []; }
    get textContent() { return this.text + this.children.map(child => child.textContent).join(""); }
    set title(value) { this.setAttribute("title", value); }
    get title() { return this.attributes.get("title") || ""; }
    setAttribute(key, value) { this.attributes.set(key, String(value)); }
    getAttribute(key) { return this.attributes.get(key) ?? null; }
    removeAttribute(key) { this.attributes.delete(key); }
    appendChild(child) {
        if (child.tagName === "#fragment") {
            this.children.push(...child.children);
            child.children = [];
        } else this.children.push(child);
        return child;
    }
    append(...children) { children.forEach(child => this.appendChild(child)); }
    replaceChildren(...children) { this.children = []; this.text = ""; this.append(...children); }
}

function record(name, time, extra = {}) {
    return {
        name, date: "2026-10-08", time_utc: time, all_day: false,
        impact: "high", category: "economic-indicators", ...extra
    };
}

function harness(data = [], options = {}) {
    let now = Date.parse(options.now || "2026-10-08T10:00:00Z");
    let handler = () => data;
    const container = new Element("div");
    const intervals = [];
    const timers = new Map();
    const requests = [];
    const warnings = [];
    let timerId = 0;
    class Clock extends Date {
        constructor(...args) { super(...(args.length ? args : [now])); }
        static now() { return now; }
    }
    const context = vm.createContext({
        Date: Clock, Intl, AbortController,
        document: {
            getElementById: id => id === "calendar-events" && !options.missingContainer ? container : null,
            createElement: tag => new Element(tag),
            createDocumentFragment: () => new Element("#fragment")
        },
        fetch: async (url, request) => {
            requests.push({ url, ...request });
            const payload = await handler(request.signal);
            return { ok: true, status: 200, json: async () => structuredClone(payload) };
        },
        console: { warn: (...args) => warnings.push(args) },
        setTimeout: (callback, ms) => { timers.set(++timerId, { callback, ms }); return timerId; },
        clearTimeout: id => timers.delete(id),
        setInterval: (callback, ms) => { intervals.push({ callback, ms }); return intervals.length; }
    });
    if (options.fetch) context.fetch = options.fetch;
    vm.runInContext(source, context, { filename: "calendar.js" });
    const flush = () => new Promise(resolve => setImmediate(resolve));
    return {
        container, intervals, timers, requests, warnings, flush,
        respond: next => { handler = typeof next === "function" ? next : () => next; },
        setNow: value => { now = Date.parse(value); },
        refresh: async () => { await intervals[0].callback(); await flush(); }
    };
}

function names(h) { return h.container.children.map(row => row.children[1].children[0].textContent); }
function time(h, index = 0) { return h.container.children[index].children[0].children[1]; }
function day(h, index = 0) { return h.container.children[index].children[0].children[0].textContent; }

test("initializes, filters HIGH/MEDIUM, sorts before limiting to five, removes exact duplicates", async () => {
    const first = record("first", "2026-10-08T11:00:00Z", { impact: "medium" });
    const h = harness({ events: [
        record("seventh", "2026-10-08T17:00:00Z"),
        record("sixth", "2026-10-08T16:00:00Z"),
        record("past", "2026-10-08T09:59:59Z"),
        record("low", "2026-10-08T10:00:00Z", { impact: "low" }),
        record("fourth", "2026-10-08T14:00:00Z"), first,
        Object.fromEntries(Object.entries(first).reverse()),
        record("third", "2026-10-08T13:00:00Z"),
        record("fifth", "2026-10-08T15:00:00Z"),
        record("second", "2026-10-08T12:00:00Z")
    ] });
    await h.flush();
    assert.deepEqual(names(h), ["first", "second", "third", "fourth", "fifth"]);
    assert.equal(h.container.children[0].className, "calendar-event");
    assert.equal(h.container.children[0].children[2].className, "calendar-impact medium");
    assert.equal(h.container.children[0].children[2].textContent, "MEDIUM");
    assert.equal(h.intervals[0].ms, 60 * 60 * 1000);
    assert.equal(h.requests[0].url, "https://www.financecalendar.com/wp-json/fc/v1/calendar?from=2026-10-08&to=2026-10-22&limit=100");
    assert.equal(h.container.getAttribute("aria-busy"), "false");
    assert.equal(h.warnings.length, 0);
    assert.equal(h.timers.size, 0);
});

test("sorts by the actual instant even if provider date and UTC date disagree", async () => {
    const h = harness([
        record("later", "2026-10-09T00:00:00+00:00"),
        record("earlier", "2026-10-08T22:30:00+02:00", { date: "2026-10-09" })
    ]);
    await h.flush();
    assert.deepEqual(names(h), ["earlier", "later"]);
    assert.equal(time(h).textContent, "22:30");
});

test("does not merge different publications with identical names or times", async () => {
    const original = record("CPI", "2026-10-08T12:30:00Z", { url: "https://example.com/us", title: "US CPI" });
    const h = harness([
        original, { ...original },
        { ...original, url: "https://example.com/ca", title: "Canada CPI" },
        { ...original, time_utc: "2026-10-09T12:30:00Z", date: "2026-10-09" },
        { ...original, period: "September" },
        { ...original, title: "US Core CPI" }
    ]);
    await h.flush();
    assert.equal(h.container.children.length, 5);
});

test("rejects malformed fields and impossible dates without changing provider importance", async () => {
    const good = record("valid", "2026-10-08T12:00:00Z");
    const h = harness([
        null, 42, [], { ...good, name: " " }, { ...good, name: 42 },
        { ...good, category: {} }, { ...good, all_day: "false" },
        { ...good, impact: "HIGH" }, { ...good, impact: "critical" },
        { ...good, date: "2026-02-30" }, { ...good, date: "bad" },
        { ...good, time_utc: "2026-02-30T12:00:00Z" },
        { ...good, time_utc: "2026-10-08T24:00:00Z" },
        { ...good, time_utc: "2026-10-08T12:00:00" },
        { ...good, time_utc: 42 }, good
    ]);
    await h.flush();
    assert.deepEqual(names(h), ["valid"]);
    assert.equal(h.container.children[0].children[2].textContent, "HIGH");
});

test("handles malformed API envelopes and fully invalid lists as initial failures", async () => {
    for (const payload of [null, {}, { events: {} }, { events: [null] }, [record("bad", "bad")]]) {
        const h = harness(payload);
        await h.flush();
        assert.equal(h.container.textContent, "kalendarz niedostępny");
        assert.equal(h.warnings.length, 1);
        assert.equal(h.container.getAttribute("aria-busy"), "false");
    }
});

test("valid empty and low-only responses display the existing empty state", async () => {
    for (const payload of [[], { events: [] }, [record("low", null, { impact: "low" })]]) {
        const h = harness(payload);
        await h.flush();
        assert.equal(h.container.textContent, "brak nadchodzących wydarzeń");
        assert.equal(h.warnings.length, 0);
    }
});

test("formats both date and time in Warsaw across spring and autumn DST changes", async () => {
    for (const [utc, expectedDay, expectedTime] of [
        ["2026-03-28T23:30:00Z", "29 MAR", "00:30"],
        ["2026-03-29T00:30:00Z", "29 MAR", "01:30"],
        ["2026-03-29T01:30:00Z", "29 MAR", "03:30"],
        ["2026-10-24T22:30:00Z", "25 PAŹ", "00:30"],
        ["2026-10-25T00:30:00Z", "25 PAŹ", "02:30"],
        ["2026-10-25T01:30:00Z", "25 PAŹ", "02:30"],
        ["2026-10-25T02:30:00Z", "25 PAŹ", "03:30"]
    ]) {
        const h = harness([record("release", utc)], { now: "2026-01-01T00:00:00Z" });
        await h.flush();
        assert.equal(day(h), expectedDay);
        assert.equal(time(h).textContent, expectedTime);
    }
});

test("repeated autumn hours sort chronologically even when displayed times are equal", async () => {
    const h = harness([
        record("second 02:30", "2026-10-25T01:30:00Z"),
        record("first 02:30", "2026-10-25T00:30:00Z")
    ], { now: "2026-10-25T00:00:00Z" });
    await h.flush();
    assert.deepEqual(names(h), ["first 02:30", "second 02:30"]);
    h.setNow("2026-10-25T00:45:00Z");
    await h.refresh();
    assert.deepEqual(names(h), ["second 02:30"]);
});

test("distinguishes all-day from unconfirmed time, ignores placeholder all-day hours", async () => {
    const h = harness([
        record("past all-day", null, { date: "2026-10-07", all_day: true }),
        record("past unknown", null, { date: "2026-10-07" }),
        record("all-day", "2026-10-08T00:00:00Z", { all_day: true }),
        record("unknown", null), record("timed", "2026-10-08T12:00:00Z")
    ]);
    await h.flush();
    assert.deepEqual(names(h), ["all-day", "unknown", "timed"]);
    assert.equal(time(h, 0).textContent, "—");
    assert.equal(time(h, 1).textContent, "—");
    assert.equal(time(h, 0).title, "wydarzenie całodniowe");
    assert.equal(time(h, 1).getAttribute("aria-label"), "godzina niepotwierdzona");
});

test("date-only events expire at Warsaw midnight on 23-hour and 25-hour DST days", async () => {
    for (const [date, before, midnight] of [
        ["2026-03-29", "2026-03-29T21:59:59Z", "2026-03-29T22:00:00Z"],
        ["2026-10-25", "2026-10-25T22:59:59Z", "2026-10-25T23:00:00Z"]
    ]) {
        const h = harness([
            record("all-day", null, { date, all_day: true }), record("unknown", "", { date })
        ], { now: before });
        await h.flush();
        assert.deepEqual(names(h), ["all-day", "unknown"]);
        h.setNow(midnight);
        await h.refresh();
        assert.equal(h.container.textContent, "brak nadchodzących wydarzeń");
    }
});

test("preserves the last list on failed refresh and clears stale state after recovery", async () => {
    const h = harness([record("original", "2026-10-08T12:00:00Z")]);
    await h.flush();
    const row = h.container.children[0];
    h.respond(() => { throw new Error("API unavailable"); });
    await h.refresh();
    assert.equal(h.container.children[0], row);
    assert.equal(h.container.getAttribute("data-stale"), "true");
    assert.match(h.container.title, /zachowano/);
    h.respond({ events: "bad" });
    await h.refresh();
    assert.equal(h.container.children[0], row);
    h.respond([record("recovered", "2026-10-08T13:00:00Z")]);
    await h.refresh();
    assert.deepEqual(names(h), ["recovered"]);
    assert.equal(h.container.getAttribute("data-stale"), null);
    assert.equal(h.container.title, "");
});

test("preserves a valid empty result on failure and recovers from an initial failure", async () => {
    const h = harness(null);
    await h.flush();
    assert.equal(h.container.textContent, "kalendarz niedostępny");
    h.respond([]);
    await h.refresh();
    assert.equal(h.container.textContent, "brak nadchodzących wydarzeń");
    h.respond(() => { throw new Error("offline"); });
    await h.refresh();
    assert.equal(h.container.textContent, "brak nadchodzących wydarzeń");
    assert.equal(h.container.getAttribute("data-stale"), "true");
});

test("renders API HTML as literal text without creating additional elements", async () => {
    const name = '<img src=x onerror="alert(1)"><script>alert(2)</script>';
    const category = '<b onclick="alert(3)">category</b>';
    const h = harness([record(name, "2026-10-08T12:00:00Z", { category })]);
    await h.flush();
    const info = h.container.children[0].children[1];
    assert.equal(info.children[0].textContent, name);
    assert.equal(info.children[1].textContent, category);
    assert.equal(info.children[0].children.length, 0);
    assert.equal(info.children[1].children.length, 0);
    assert.equal(h.warnings.length, 0);
});

test("prevents overlapping refreshes and aborts after 15 seconds, then permits recovery", async () => {
    const h = harness([record("old", "2026-10-08T12:00:00Z")]);
    await h.flush();
    h.respond(signal => new Promise((resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("timeout")), { once: true });
    }));
    const pending = h.intervals[0].callback();
    await h.flush();
    await h.refresh();
    assert.equal(h.requests.length, 2);
    assert.equal(h.container.getAttribute("aria-busy"), "true");
    const timeout = [...h.timers.values()][0];
    assert.equal(timeout.ms, 15000);
    timeout.callback();
    await pending;
    assert.equal(h.requests[1].signal.aborted, true);
    assert.deepEqual(names(h), ["old"]);
    assert.equal(h.container.getAttribute("aria-busy"), "false");
    assert.equal(h.timers.size, 0);
    h.respond([record("new", "2026-10-08T13:00:00Z")]);
    await h.refresh();
    assert.deepEqual(names(h), ["new"]);
});

test("handles HTTP and JSON errors without initialization rejection", async () => {
    for (const response of [
        { ok: false, status: 503 },
        { ok: true, json: async () => { throw new SyntaxError("bad JSON"); } }
    ]) {
        const h = harness([], { fetch: async () => response });
        await h.flush();
        assert.equal(h.container.textContent, "kalendarz niedostępny");
        assert.equal(h.warnings.length, 1);
        assert.equal(h.timers.size, 0);
    }
});

test("does nothing when the calendar container is absent", async () => {
    const h = harness([], { missingContainer: true });
    await h.flush();
    assert.equal(h.requests.length, 0);
    assert.equal(h.intervals.length, 0);
    assert.equal(h.warnings.length, 0);
});

test("index loads the classic script once and app.js no longer owns the calendar", () => {
    const html = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");
    const app = fs.readFileSync(path.join(__dirname, "../js/app.js"), "utf8");
    assert.equal((html.match(/src="js\/calendar\.js"/g) || []).length, 1);
    assert.ok(html.indexOf('id="calendar-events"') < html.indexOf('src="js/calendar.js"'));
    assert.equal(/updateCalendar|financecalendar\.com/.test(app), false);
    assert.match(html, /CAPITALCOM:DXY/);
});
