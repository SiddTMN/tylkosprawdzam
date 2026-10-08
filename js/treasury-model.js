// Official TreasuryDirect auction adapter, shared by CI and the browser validator.
(function (root, factory) {
    if (typeof module === "object" && module.exports) module.exports = factory();
    else root.TreasuryCalendarModel = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
    "use strict";
    const SOURCE = "TreasuryDirect";
    const ENDPOINT = "https://www.treasurydirect.gov/TA_WS/securities/upcoming?format=json";
    const ZONE = "America/New_York";
    const DAY_MS = 86400000;
    const formats = new Map();
    function day(value) {
        if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
        const n = Date.parse(value + "T00:00:00Z");
        return Number.isFinite(n) && new Date(n).toISOString().slice(0, 10) === value ? n : null;
    }
    function civilDay(value, optional = false) {
        if (optional && (value === "" || value == null)) return null;
        if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}(?:T00:00:00)?$/.test(value) ||
            day(value.slice(0, 10)) === null) throw new Error("Invalid Treasury civil date");
        return value.slice(0, 10);
    }
    function parts(timestamp, zone) {
        if (!formats.has(zone)) formats.set(zone, new Intl.DateTimeFormat("en-GB", {
            year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit",
            minute: "2-digit", second: "2-digit", hourCycle: "h23", timeZone: zone
        }));
        return Object.fromEntries(formats.get(zone).formatToParts(timestamp)
            .filter(p => p.type !== "literal").map(p => [p.type, Number(p.value)]));
    }
    function zonedInstant(date, hour = 0, minute = 0, zone = ZONE, second = 0) {
        const base = day(date);
        if (base === null || hour < 0 || hour > 23 || minute < 0 || minute > 59 ||
            second < 0 || second > 59) throw new Error("Invalid Treasury time");
        const wanted = base + hour * 3600000 + minute * 60000 + second * 1000;
        let timestamp = wanted;
        for (let i = 0; i < 4; i++) {
            const p = parts(timestamp, zone);
            const local = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
            const next = wanted - (local - timestamp);
            if (next === timestamp) break;
            timestamp = next;
        }
        const p = parts(timestamp, zone);
        if (p.year !== Number(date.slice(0, 4)) || p.month !== Number(date.slice(5, 7)) ||
            p.day !== Number(date.slice(8, 10)) || p.hour !== hour || p.minute !== minute || p.second !== second)
            throw new Error("Nonexistent Treasury local time");
        return timestamp;
    }
    function closingTime(value) {
        if (value === "" || value == null) return null;
        const m = typeof value === "string" && /^(0?[1-9]|1[0-2]):([0-5]\d) (AM|PM)$/.exec(value);
        if (!m) throw new Error("Invalid Treasury closing time");
        return String(Number(m[1]) % 12 + (m[3] === "PM" ? 12 : 0)).padStart(2, "0") + ":" + m[2];
    }
    function validCusip(value) {
        if (typeof value !== "string" || !/^912[0-9A-Z]{5}\d$/.test(value)) return false;
        let sum = 0;
        for (let i = 0; i < 8; i++) {
            let n = /\d/.test(value[i]) ? Number(value[i]) : value.charCodeAt(i) - 55;
            if (i % 2) n *= 2;
            sum += Math.floor(n / 10) + n % 10;
        }
        return (10 - sum % 10) % 10 === Number(value[8]);
    }
    function key(event) { return SOURCE + ":" + event.cusip + ":" + event.auctionDate; }
    function normalizeTreasury(data, now = Date.now()) {
        if (!Array.isArray(data) || data.length > 1000) throw new Error("Invalid Treasury envelope");
        const events = new Map();
        for (const r of data) {
            if (!r || typeof r !== "object" || Array.isArray(r) ||
                !["Bill", "Note", "Bond", "TIPS", "FRN", "CMB"].includes(r.securityType))
                throw new Error("Invalid Treasury security type");
            if (!["Note", "Bond"].includes(r.securityType)) continue;
            if (!["Yes", "No"].includes(r.tips) || !["Yes", "No"].includes(r.floatingRate))
                throw new Error("Invalid Treasury nominal flags");
            if (r.tips === "Yes" || r.floatingRate === "Yes") continue;
            // Original tenor is authoritative, including reopenings. Never round remaining maturity.
            if (typeof r.originalSecurityTerm !== "string" || !/^\d+-Year$/.test(r.originalSecurityTerm))
                throw new Error("Missing Treasury original term");
            if (!["2-Year", "5-Year", "10-Year", "30-Year"].includes(r.originalSecurityTerm)) continue;
            if ((r.originalSecurityTerm === "30-Year") !== (r.securityType === "Bond") ||
                (r.term != null && r.term !== "" && r.term !== r.originalSecurityTerm) ||
                typeof r.securityTerm !== "string" || !/^\d+-Year(?: \d+-Month)?$/.test(r.securityTerm) ||
                !["Yes", "No"].includes(r.reopening) || !validCusip(r.cusip))
                throw new Error("Invalid Treasury identity/term");
            const remaining = /^(\d+)-Year(?: (\d+)-Month)?$/.exec(r.securityTerm);
            const remainingMonths = Number(remaining[1]) * 12 + Number(remaining[2] || 0);
            const originalMonths = Number(r.originalSecurityTerm.split("-")[0]) * 12;
            if (Number(remaining[2] || 0) > 11 || remainingMonths <= 0 || remainingMonths > originalMonths ||
                (r.reopening === "No" && remainingMonths !== originalMonths))
                throw new Error("Invalid Treasury remaining term");
            const auctionDate = civilDay(r.auctionDate);
            const settlementDate = civilDay(r.issueDate);
            const announcementDate = civilDay(r.announcementDate);
            const maturityDate = civilDay(r.maturityDate, true);
            if (announcementDate > auctionDate || settlementDate < auctionDate ||
                (maturityDate && maturityDate <= settlementDate)) throw new Error("Invalid Treasury date ordering");
            const filename = r.pdfFilenameAnnouncement || "";
            if (typeof filename !== "string" || (filename && !/^A_\d{8}_\d+\.pdf$/.test(filename)))
                throw new Error("Invalid Treasury announcement");
            const offeringAmount = r.offeringAmount === "" || r.offeringAmount == null ? null : r.offeringAmount;
            if (offeringAmount !== null && (typeof offeringAmount !== "string" ||
                !/^[1-9]\d*$/.test(offeringAmount))) throw new Error("Invalid Treasury offering amount");
            const announced = Boolean(filename && offeringAmount);
            if (Boolean(filename) !== Boolean(offeringAmount) ||
                (announced && (filename.slice(2, 10) !== announcementDate.replaceAll("-", "") ||
                    zonedInstant(announcementDate) > now)))
                throw new Error("Inconsistent Treasury announcement confirmation");
            // An upcoming row without the offering announcement is tentative, even after its planned announcement date.
            const confirmation = announced ? "announced" : "tentative";
            const competitiveClose = closingTime(r.closingTimeCompetitive);
            const noncompetitiveClose = closingTime(r.closingTimeNoncompetitive);
            const officialTime = announced ? competitiveClose : null;
            if (officialTime && noncompetitiveClose && noncompetitiveClose > officialTime)
                throw new Error("Invalid Treasury bid deadlines");
            const kind = officialTime ? "timed" : "unknown-time";
            const sortAt = officialTime
                ? zonedInstant(auctionDate, Number(officialTime.slice(0, 2)), Number(officialTime.slice(3)))
                : zonedInstant(auctionDate, 0, 0, "Europe/Warsaw");
            const nextDay = new Date(day(auctionDate) + DAY_MS).toISOString().slice(0, 10);
            const reopening = r.reopening === "Yes";
            const tenor = Number(r.originalSecurityTerm.split("-")[0]);
            const event = {
                source: SOURCE, id: SOURCE + ":" + r.cusip + ":" + auctionDate,
                name: "US Treasury " + tenor + "Y Auction" + (reopening ? " (reopening)" : ""),
                category: "TreasuryDirect · " + (announced ? "potwierdzona" : "wstępny termin"),
                // Site policy, not a rating supplied by Treasury.
                impact: tenor >= 10 ? "high" : "medium", kind, sortAt,
                expiresAt: officialTime ? sortAt : zonedInstant(nextDay, 0, 0, "Europe/Warsaw"),
                cusip: r.cusip, securityType: r.securityType, originalTerm: r.originalSecurityTerm,
                remainingTerm: r.securityTerm, reopening, auctionDate, settlementDate, announcementDate,
                maturityDate, confirmation, timeZone: ZONE,
                timeBasis: officialTime ? "competitive-bid-close" : "unconfirmed",
                competitiveClose: officialTime, noncompetitiveClose, offeringAmount,
                announcementUrl: announced
                    ? "https://www.treasurydirect.gov/instit/annceresult/press/preanre/" +
                        announcementDate.slice(0, 4) + "/" + filename : null
            };
            const previous = events.get(key(event));
            if (previous && JSON.stringify(previous) !== JSON.stringify(event))
                throw new Error("Conflicting Treasury duplicate: " + event.id);
            events.set(key(event), event);
        }
        return [...events.values()];
    }
    function validateEvent(event, checkedAt) {
        if (!event || !["announced", "tentative"].includes(event.confirmation) ||
            typeof event.reopening !== "boolean") throw new Error("Invalid Treasury snapshot event");
        const filename = event.announcementUrl == null ? "" : event.announcementUrl.split("/").at(-1);
        const raw = {
            securityType: event.securityType, originalSecurityTerm: event.originalTerm,
            securityTerm: event.remainingTerm, cusip: event.cusip, tips: "No", floatingRate: "No",
            reopening: event.reopening ? "Yes" : "No", auctionDate: event.auctionDate,
            issueDate: event.settlementDate, announcementDate: event.announcementDate,
            maturityDate: event.maturityDate, pdfFilenameAnnouncement: filename,
            offeringAmount: event.offeringAmount,
            closingTimeCompetitive: event.competitiveClose == null ? "" : toAmPm(event.competitiveClose),
            closingTimeNoncompetitive: event.noncompetitiveClose == null ? "" : toAmPm(event.noncompetitiveClose)
        };
        const normalized = normalizeTreasury([raw], checkedAt)[0];
        if (!normalized || Object.keys(normalized).some(k => normalized[k] !== event[k]))
            throw new Error("Inconsistent Treasury snapshot event");
        return normalized;
    }
    function toAmPm(value) {
        if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value))
            throw new Error("Invalid Treasury normalized closing time");
        const h = Number(value.slice(0, 2));
        return String(h % 12 || 12).padStart(2, "0") + value.slice(2) + (h >= 12 ? " PM" : " AM");
    }
    function mergeEvents(finance, treasury) {
        return finance.filter(f => !treasury.some(t => {
            if (t.confirmation !== "announced") return false;
            // Only exact identity or a narrow auction label at the exact confirmed instant.
            if (f.name.includes(t.cusip)) {
                const p = parts(f.sortAt, "Europe/Warsaw");
                const displayedDay = String(p.year).padStart(4, "0") + "-" +
                    String(p.month).padStart(2, "0") + "-" + String(p.day).padStart(2, "0");
                return displayedDay === t.auctionDate;
            }
            const match = /^(?:US |U\.S\. )?(2|5|10|30)[ -](?:Year|Y) (?:Note|Bond|Treasury) Auction$/i.exec(f.name);
            return match && Number(match[1]) === Number(t.originalTerm.split("-")[0]) &&
                f.kind === "timed" && t.kind === "timed" && f.sortAt === t.sortAt;
        })).concat(treasury);
    }
    return { SOURCE, ENDPOINT, normalizeTreasury, validateEvent, mergeEvents, zonedInstant, validCusip };
});
