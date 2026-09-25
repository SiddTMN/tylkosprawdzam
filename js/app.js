function updateClock() {
    const clock = document.getElementById("clock");

    const now = new Date();

    clock.textContent = now.toLocaleTimeString("pl-PL", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
    });
}

updateClock();

setInterval(updateClock, 1000);

const chartContainer = document.getElementById("tradingview-chart");
const chartTitle = document.getElementById("chart-title");
const assets = document.querySelectorAll(".asset");
const chartPricePln =
    document.getElementById("chart-price-pln");

const cryptoPricesUsd = {};

let usdPlnRate = null;
let activeCoin = "ethereum";


function loadChart(symbol, name) {

    chartContainer.innerHTML = "";

    const widgetContainer = document.createElement("div");

    widgetContainer.className = "tradingview-widget-container";
    widgetContainer.style.width = "100%";
    widgetContainer.style.height = "100%";


    const widget = document.createElement("div");

    widget.className = "tradingview-widget-container__widget";
    widget.style.width = "100%";
    widget.style.height = "100%";


    const script = document.createElement("script");

    script.src =
        "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";

    script.type = "text/javascript";
    script.async = true;

    script.textContent = JSON.stringify({
        autosize: true,

        symbol: symbol,

        interval: "60",

        timezone: "Europe/Warsaw",

        theme: "dark",

        backgroundColor: "rgba(16, 19, 25, 1)",

        gridColor: "rgba(36, 42, 52, 0.45)",

        style: "1",

        locale: "en",

        hide_top_toolbar: false,

        hide_legend: false,

        allow_symbol_change: false,

        save_image: false,

        calendar: false,

        support_host: "https://www.tradingview.com"
    });


    widgetContainer.appendChild(widget);
    widgetContainer.appendChild(script);

    chartContainer.appendChild(widgetContainer);

    chartTitle.textContent = name;
}


assets.forEach(asset => {

    asset.addEventListener("click", () => {

        assets.forEach(item => {
            item.classList.remove("active");
        });

        asset.classList.add("active");

        activeCoin = asset.dataset.coin || null;
        updateChartPricePln();

        loadChart(
            asset.dataset.symbol,
            asset.dataset.name
        );
    });

});


loadChart(
    "COINBASE:ETHUSD",
    "ETH / USD"
);

function updateChartPricePln() {

    if (!chartPricePln) {
        return;
    }

    if (!activeCoin || !usdPlnRate) {
        chartPricePln.textContent = "";
        return;
    }

    const usdPrice = cryptoPricesUsd[activeCoin];

    if (!usdPrice) {
        chartPricePln.textContent = "";
        return;
    }

    const plnPrice = usdPrice * usdPlnRate;

    let formatted;

    if (plnPrice >= 1000) {

        formatted = plnPrice.toLocaleString("pl-PL", {
            maximumFractionDigits: 0
        });

    } else if (plnPrice >= 1) {

        formatted = plnPrice.toLocaleString("pl-PL", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });

    } else {

        formatted = plnPrice.toLocaleString("pl-PL", {
            minimumFractionDigits: 4,
            maximumFractionDigits: 8
        });
    }

    chartPricePln.textContent =
        `≈ ${formatted} PLN`;
}

// --------------------------------------------------
// LIVE CRYPTO PRICES
// --------------------------------------------------

const cryptoAssets = document.querySelectorAll(".asset[data-coin]");

const coinIds = [...cryptoAssets]
    .map(asset => asset.dataset.coin)
    .join(",");

const cryptoApiUrl =
    `https://api.coingecko.com/api/v3/simple/price` +
    `?ids=${coinIds}` +
    `&vs_currencies=usd` +
    `&include_24hr_change=true`;

function formatCryptoPrice(price) {

    if (price >= 1000) {
        return "$" + price.toLocaleString("en-US", {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        });
    }

    if (price >= 1) {
        return "$" + price.toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }

    return "$" + price.toLocaleString("en-US", {
        minimumFractionDigits: 4,
        maximumFractionDigits: 8
    });
}

async function updateCryptoPrices() {

    try {

        const response = await fetch(cryptoApiUrl);

        if (!response.ok) {
            throw new Error(`CoinGecko: ${response.status}`);
        }

        const data = await response.json();

        cryptoAssets.forEach(asset => {

            const coin = asset.dataset.coin;
            const coinData = data[coin];

            if (!coinData) {
                return;
            }

            const priceElement =
                asset.querySelector(".asset-price");

            const changeElement =
                asset.querySelector(".asset-change");

            const price = coinData.usd;
            const change = coinData.usd_24h_change;
            cryptoPricesUsd[coin] = price;

            priceElement.textContent =
                formatCryptoPrice(price);

            changeElement.textContent =
                `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`;

            changeElement.classList.remove("up", "down");

            changeElement.classList.add(
                change >= 0 ? "up" : "down"
            );
            updateChartPricePln();
        });

    } catch (error) {

        console.error(
            "Nie udało się pobrać cen krypto:",
            error
        );
    }
}

updateCryptoPrices();

setInterval(updateCryptoPrices, 60 * 1000);

async function updateOilPrice() {

    try {

        const response = await fetch(
            "https://americasoilwatch.com/api/v1/wti"
        );

        if (!response.ok) {
            throw new Error(`Oil API: ${response.status}`);
        }

        const data = await response.json();

        const oilAsset =
            document.querySelector('.asset[data-market="oil"]');

        if (!oilAsset) {
        return;
        }

        const priceElement =
        oilAsset.querySelector(".asset-price");

        const changeElement =
        oilAsset.querySelector(".asset-change");

        priceElement.textContent =
        "$" + Number(data.priceUsd).toFixed(2);

        changeElement.textContent =
        `${data.changePct >= 0 ? "+" : ""}${Number(data.changePct).toFixed(2)}%`;

        changeElement.classList.remove("up", "down");

        changeElement.classList.add(
        data.changePct >= 0 ? "up" : "down"
        );

        } catch (error) {

        console.error(
            "Nie udało się pobrać ceny WTI:",
            error
        );
    }
}

updateOilPrice();
setInterval(updateOilPrice, 15 * 60 * 1000);

// --------------------------------------------------
// USD / PLN
// --------------------------------------------------

async function updateUsdPln() {

    try {

        const endDate = new Date();
        const startDate = new Date();

        startDate.setDate(endDate.getDate() - 7);

        const formatDate = date =>
            date.toISOString().split("T")[0];

        const url =
            `https://api.frankfurter.dev/v2/rates` +
            `?from=${formatDate(startDate)}` +
            `&to=${formatDate(endDate)}` +
            `&base=USD` +
            `&quotes=PLN`;

        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`Frankfurter: ${response.status}`);
        }

        const data = await response.json();

        if (!Array.isArray(data) || data.length < 2) {
            throw new Error(
                "Brak wystarczających danych USD/PLN"
            );
        }

        // Sortujemy po dacie, żeby nie polegać
        // na kolejności odpowiedzi API.
        data.sort(
            (a, b) => new Date(a.date) - new Date(b.date)
        );

        const latest = data[data.length - 1];
        const previous = data[data.length - 2];

        const rate = Number(latest.rate);
        usdPlnRate = rate;
        const previousRate = Number(previous.rate);

        const change =
            ((rate - previousRate) / previousRate) * 100;

        const usdAsset =
            document.querySelector(
                '.asset[data-market="usdpln"]'
            );

        if (!usdAsset) {
            return;
        }

        const priceElement =
            usdAsset.querySelector(".asset-price");

        const changeElement =
            usdAsset.querySelector(".asset-change");

        priceElement.textContent =
            rate.toFixed(4);

        changeElement.textContent =
            `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`;

        changeElement.classList.remove("up", "down");

        changeElement.classList.add(
            change >= 0 ? "up" : "down"
        );
        updateChartPricePln();

    } catch (error) {

        console.error(
            "Nie udało się pobrać USD/PLN:",
            error
        );
    }
}

updateUsdPln();

setInterval(updateUsdPln, 60 * 60 * 1000);

// --------------------------------------------------
// ECONOMIC CALENDAR
// --------------------------------------------------

async function updateCalendar() {

    const container =
        document.getElementById("calendar-events");

    if (!container) {
        return;
    }

    try {

        const now = new Date();
        const end = new Date();

        end.setDate(now.getDate() + 14);

        const formatDate = date =>
            date.toISOString().split("T")[0];

        const url =
            `https://www.financecalendar.com/wp-json/fc/v1/calendar` +
            `?from=${formatDate(now)}` +
            `&to=${formatDate(end)}` +
            `&limit=100`;

        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(
                `FinanceCalendar: ${response.status}`
            );
        }

        const data = await response.json();

        // API może zwrócić tablicę bezpośrednio
        // albo obiekt zawierający events.
        const events =
            Array.isArray(data)
                ? data
                : data.events || [];

        const upcoming = events

            .filter(event =>
                event.impact === "high" ||
                event.impact === "medium"
            )

            .filter(event => {

                if (event.all_day) {
                    return true;
                }

                if (!event.time_utc) {
                    return true;
                }

                return new Date(event.time_utc) >= now;
            })

            .slice(0, 5);

        container.innerHTML = "";

        if (upcoming.length === 0) {

            container.innerHTML = `
                <div class="calendar-loading">
                    brak nadchodzących wydarzeń
                </div>
            `;

            return;
        }

        upcoming.forEach(event => {

            const row =
                document.createElement("div");

            row.className = "calendar-event";

            let dateText = "";
            let timeText = "—";

            if (event.time_utc) {

                const eventDate =
                    new Date(event.time_utc);

                dateText =
                    eventDate
                        .toLocaleDateString("pl-PL", {
                            day: "2-digit",
                            month: "short"
                        })
                        .toUpperCase();

                timeText =
                    eventDate
                        .toLocaleTimeString("pl-PL", {
                            hour: "2-digit",
                            minute: "2-digit",
                            timeZone: "Europe/Warsaw"
                        });

            } else {

                dateText =
                    new Date(event.date)
                        .toLocaleDateString("pl-PL", {
                            day: "2-digit",
                            month: "short"
                        })
                        .toUpperCase();
            }

            const impact =
                event.impact.toUpperCase();

            row.innerHTML = `
                <div class="calendar-date">
                    <span>${dateText}</span>
                    <strong>${timeText}</strong>
                </div>

                <div class="calendar-info">
                    <strong>${event.name}</strong>
                    <span>${event.category || ""}</span>
                </div>

                <span class="calendar-impact ${event.impact}">
                    ${impact}
                </span>
            `;

            container.appendChild(row);
        });

    } catch (error) {

        console.error(
            "Nie udało się pobrać kalendarza:",
            error
        );

        container.innerHTML = `
            <div class="calendar-loading">
                kalendarz niedostępny
            </div>
        `;
    }
}

updateCalendar();

setInterval(
    updateCalendar,
    60 * 60 * 1000
);