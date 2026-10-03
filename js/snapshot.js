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
    }

    update();
    setInterval(refreshIfDue, refreshInterval);
    document.addEventListener("visibilitychange", refreshIfDue);
})();
