(() => {
    const value = document.getElementById("btc-dominance");
    const status = document.getElementById("btc-dominance-status");
    if (!value || !status) return;

    const endpoint = "https://api.coingecko.com/api/v3/global";
    const cacheKey = "tylkosprawdzam.btc-dominance.v1";
    const refreshInterval = 5 * 60 * 1000;
    const staleAfter = 15 * 60 * 1000;
    const format = new Intl.NumberFormat("pl-PL", {
        minimumFractionDigits: 2, maximumFractionDigits: 2
    });
    const timeFormat = new Intl.DateTimeFormat("pl-PL", {
        hour: "2-digit", minute: "2-digit", timeZone: "Europe/Warsaw"
    });
    let lastResult = null;
    let lastAttempt = 0;
    let fetching = false;
    let cached = true;

    const fearGreedValue = document.getElementById("fear-greed");
    const fearGreedStatus = document.getElementById("fear-greed-status");
    const fearGreedRefreshInterval = 60 * 60 * 1000;
    const dateFormat = new Intl.DateTimeFormat("pl-PL", {
        day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Warsaw"
    });
    let fearGreedLastAttempt = 0;
    let fearGreedFetching = false;

    async function updateFearGreed() {
        if (!fearGreedValue || !fearGreedStatus || document.hidden || fearGreedFetching) return;
        fearGreedFetching = true;
        fearGreedLastAttempt = Date.now();
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        try {
            const response = await fetch("https://api.alternative.me/fng/?limit=1", { signal: controller.signal });
            if (!response.ok) throw new Error("Alternative.me: " + response.status);
            const payload = await response.json();
            const reading = Array.isArray(payload?.data) ? payload.data[0] : null;
            const numericField = field =>
                (typeof field === "string" && field.trim() !== "") || typeof field === "number";
            const index = numericField(reading?.value) ? Number(reading.value) : NaN;
            const updatedAt = numericField(reading?.timestamp) ? Number(reading.timestamp) * 1000 : NaN;
            if (payload?.metadata?.error || !Number.isInteger(index) || index < 0 || index > 100 ||
                typeof reading?.value_classification !== "string" || !reading.value_classification.trim() ||
                !Number.isFinite(updatedAt) || updatedAt <= 0 || updatedAt > Date.now() + 60 * 1000) {
                throw new Error("Nieprawidłowe dane Fear & Greed");
            }
            fearGreedValue.textContent = reading.value + " · " + reading.value_classification;
            fearGreedStatus.textContent = "dane · " + dateFormat.format(updatedAt);
        } catch (error) {
            console.warn("Nie udało się pobrać Fear & Greed:", error);
            fearGreedValue.textContent = "—";
            fearGreedStatus.textContent = "dane niedostępne";
        } finally {
            clearTimeout(timeout);
            fearGreedFetching = false;
        }
    }

    function valid(result) {
        return result && typeof result.dominance === "number" &&
            Number.isFinite(result.dominance) && result.dominance > 0 && result.dominance <= 100 &&
            Number.isFinite(result.updatedAt) && result.updatedAt > 0 &&
            result.updatedAt <= Date.now() + 60 * 1000;
    }

    function render() {
        if (!lastResult) return;
        value.textContent = format.format(lastResult.dominance) + "%";
        const stale = cached || Date.now() - lastResult.updatedAt > staleAfter;
        status.textContent = (stale ? "zapisane dane · " : "dane · ") + timeFormat.format(lastResult.updatedAt);
        status.title = "Aktualizacja danych CoinGecko: " + new Date(lastResult.updatedAt).toLocaleString("pl-PL", {
            timeZone: "Europe/Warsaw"
        }) + (stale ? ". Dane mogą być nieaktualne." : "");
    }

    try {
        const saved = JSON.parse(localStorage.getItem(cacheKey));
        if (valid(saved)) {
            lastResult = saved;
            render();
        }
    } catch { /* Cache is optional. */ }

    async function update() {
        if (document.hidden || fetching) return;
        fetching = true;
        lastAttempt = Date.now();
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        try {
            const response = await fetch(endpoint, { signal: controller.signal });
            if (!response.ok) throw new Error("CoinGecko: " + response.status);
            const { data } = await response.json();
            const result = {
                dominance: data?.market_cap_percentage?.btc,
                updatedAt: typeof data?.updated_at === "number" ? data.updated_at * 1000 : NaN
            };
            if (!valid(result)) throw new Error("Nieprawidłowe dane BTC dominance");
            lastResult = result;
            cached = false;
            render();
            try { localStorage.setItem(cacheKey, JSON.stringify(result)); } catch { /* Cache is optional. */ }
        } catch (error) {
            console.warn("Nie udało się pobrać BTC dominance:", error);
            cached = true;
            if (lastResult) {
                render();
            } else {
                value.textContent = "—%";
                status.textContent = "dane niedostępne";
            }
        } finally {
            clearTimeout(timeout);
            fetching = false;
        }
    }

    function refreshIfDue() {
        if (document.hidden) return;
        render();
        if (Date.now() - lastAttempt >= refreshInterval) update();
        if (Date.now() - fearGreedLastAttempt >= fearGreedRefreshInterval) updateFearGreed();
    }

    update();
    updateFearGreed();
    setInterval(refreshIfDue, refreshInterval);
    document.addEventListener("visibilitychange", refreshIfDue);
})();
