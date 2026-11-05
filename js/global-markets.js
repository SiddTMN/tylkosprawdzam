(() => {
    'use strict';
    const panels = [...document.querySelectorAll('[data-quotes-panel]')];
    if (!panels.length) return;
    const origin = 'https://www.tradingview-widget.com';
    const rows = panels.flatMap(panel => [...panel.querySelectorAll('[data-market-symbol]')].map(element => ({
        panel,
        element,
        host: element.querySelector('.global-quote-widget'),
        status: element.querySelector('.global-quote-status'),
        timer: null,
        attempt: 0,
        failed: false
    })));
    const unavailable = (row, message) => {
        clearTimeout(row.timer);
        row.failed = true;
        row.host.hidden = true;
        row.status.textContent = message;
    };
    // A frame or its load event is not evidence that the quote is available.
    // Only the matching TradingView frame may change its own status.
    window.addEventListener('message', event => {
        if (event.origin !== origin) return;
        const row = rows.find(item => item.host.querySelector('iframe')?.contentWindow === event.source);
        if (!row || navigator.onLine === false) return;
        if (event.data?.name === 'tv-widget-no-data') {
            unavailable(row, 'Notowanie niedostępne u dostawcy.');
        } else if (event.data?.name === 'tv-widget-ready' && !row.failed) {
            clearTimeout(row.timer);
            row.host.hidden = false;
            row.status.textContent = 'Ostatnie dostępne · zmiana dzienna';
        }
    });
    const load = row => {
        clearTimeout(row.timer);
        row.host.replaceChildren();
        row.failed = false;
        row.host.hidden = true;
        if (navigator.onLine === false) {
            unavailable(row, 'Brak połączenia — notowanie niedostępne.');
            return;
        }
        row.status.textContent = 'Pobieranie notowania…';
        const container = document.createElement('div');
        container.className = 'tradingview-widget-container';
        const widget = document.createElement('div');
        widget.className = 'tradingview-widget-container__widget';
        const script = document.createElement('script');
        row.attempt += 1;
        // Chrome may reuse a failed script request within the same document.
        const retryQuery = row.attempt > 1 ? `?reload=${row.attempt}` : '';
        script.src = `https://s3.tradingview.com/external-embedding/embed-widget-single-quote.js${retryQuery}`;
        script.async = true;
        script.textContent = JSON.stringify({
            symbol: row.element.dataset.marketSymbol,
            width: '100%', isTransparent: true, colorTheme: 'dark', locale: 'en'
        });
        script.onerror = () => {
            if (container.parentNode === row.host) unavailable(row, 'TradingView zablokowany lub niedostępny.');
        };
        container.append(widget, script);
        row.host.append(container);
        row.timer = setTimeout(() => unavailable(row, 'Nie udało się potwierdzić dostępności notowania.'), 15000);
    };
    window.addEventListener('offline', () => rows.forEach(row => unavailable(row, 'Brak połączenia — notowanie niedostępne.')));
    window.addEventListener('online', () => rows.forEach(load));
    panels.forEach(panel => {
        panel.querySelector('.global-markets-retry').addEventListener('click', () => {
            rows.filter(row => row.panel === panel).forEach(load);
        });
    });
    rows.forEach(load);
})();
