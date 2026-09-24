(() => {
    const container = document.getElementById("news-items");
    const status = document.getElementById("news-status");
    if (!container || !status) return;

    const cacheKey = "tylkosprawdzam.news.v1";
    const endpoint = "https://api.rss2json.com/v1/api.json?rss_url=" +
        encodeURIComponent("https://www.coindesk.com/arc/outboundfeeds/rss/");
    const timeFormat = new Intl.DateTimeFormat("pl-PL", {
        hour: "2-digit", minute: "2-digit", timeZone: "Europe/Warsaw"
    });
    const dateFormat = new Intl.DateTimeFormat("pl-PL", {
        day: "2-digit", month: "2-digit", timeZone: "Europe/Warsaw"
    });
    let lastResult = null;

    function normalize(items) {
        if (!Array.isArray(items)) return [];
        const seen = new Set();
        return items.flatMap(item => {
            if (!item || typeof item.title !== "string" || !item.title.trim()) return [];
            try {
                const url = new URL(item.link);
                if (url.protocol !== "https:" ||
                    !(url.hostname === "coindesk.com" || url.hostname.endsWith(".coindesk.com"))) return [];
                // rss2json returns UTC without an explicit timezone.
                const rawDate = String(item.pubDate || "");
                const date = new Date(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(rawDate)
                    ? rawDate.replace(" ", "T") + "Z" : rawDate);
                if (!Number.isFinite(date.getTime()) || seen.has(url.href)) return [];
                seen.add(url.href);
                return [{ title: item.title.trim(), link: url.href, pubDate: date.toISOString() }];
            } catch {
                return [];
            }
        }).sort((a, b) => Date.parse(b.pubDate) - Date.parse(a.pubDate)).slice(0, 5);
    }

    function render(items) {
        const fragment = document.createDocumentFragment();
        items.forEach(item => {
            const article = document.createElement("article");
            article.className = "news-item";
            const date = new Date(item.pubDate);
            const time = document.createElement("time");
            time.dateTime = item.pubDate;
            time.textContent = timeFormat.format(date);
            const day = document.createElement("span");
            day.className = "news-date";
            day.textContent = dateFormat.format(date);
            time.appendChild(day);
            const body = document.createElement("div");
            const heading = document.createElement("h3");
            const link = document.createElement("a");
            link.href = item.link;
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            link.textContent = item.title;
            heading.appendChild(link);
            body.appendChild(heading);
            article.append(time, body);
            fragment.appendChild(article);
        });
        container.replaceChildren(fragment);
    }

    function showStatus(cached) {
        status.textContent = cached ? "zapisane wiadomości" : "aktualizacja " + timeFormat.format(new Date(lastResult.fetchedAt));
        status.classList.toggle("news-stale", cached);
        status.title = "Ostatnie pobranie: " + new Date(lastResult.fetchedAt).toLocaleString("pl-PL", {
            timeZone: "Europe/Warsaw"
        }) + ". Źródło może udostępniać dane z opóźnieniem.";
    }

    try {
        const cached = JSON.parse(localStorage.getItem(cacheKey));
        const items = normalize(cached?.items);
        if (items.length && Number.isFinite(cached?.fetchedAt)) {
            lastResult = { items, fetchedAt: cached.fetchedAt };
            render(items);
            showStatus(true);
        }
    } catch { /* Storage may be unavailable; fetching still works. */ }

    async function updateNews() {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        try {
            const response = await fetch(endpoint, { signal: controller.signal });
            if (!response.ok) throw new Error(`rss2json: ${response.status}`);
            const data = await response.json();
            if (data.status !== "ok") throw new Error("Nieprawidłowa odpowiedź RSS");
            const items = normalize(data.items);
            if (!items.length) throw new Error("Brak wiadomości w kanale RSS");
            lastResult = { items, fetchedAt: Date.now() };
            render(items);
            showStatus(false);
            try { localStorage.setItem(cacheKey, JSON.stringify(lastResult)); } catch { /* Optional cache. */ }
        } catch (error) {
            console.warn("Nie udało się pobrać wiadomości:", error);
            if (lastResult) {
                showStatus(true);
            } else {
                const message = document.createElement("p");
                message.className = "news-message";
                message.textContent = "wiadomości chwilowo niedostępne";
                container.replaceChildren(message);
                status.textContent = "brak połączenia";
                status.classList.add("news-stale");
            }
        } finally {
            clearTimeout(timeout);
        }
    }

    updateNews();
    setInterval(updateNews, 15 * 60 * 1000);
})();
