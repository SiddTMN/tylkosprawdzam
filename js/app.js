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

            priceElement.textContent =
                formatCryptoPrice(price);

            changeElement.textContent =
                `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`;

            changeElement.classList.remove("up", "down");

            changeElement.classList.add(
                change >= 0 ? "up" : "down"
            );
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