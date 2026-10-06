(() => {
    console.log("[DXY] fallback monitor started");
    let readyFrame = null;
    let timeout;
    let observer;
    let initialized = false;
    const getFrame = () => document.querySelector(".dxy-widget iframe");
    const restoreWidget = () => {
        if (!initialized || !readyFrame || getFrame()?.contentWindow !== readyFrame) return;
        clearTimeout(timeout);
        const content = document.querySelector(".dxy-content");
        content.classList.remove("dxy-unavailable");
        content.querySelector(".dxy-fallback").hidden = true;
        observer.disconnect();
        console.log("[DXY] widget ready; normal state restored");
    };
    // Register before TradingView starts; an iframe alone does not prove readiness.
    window.addEventListener("message", event => {
        const frame = getFrame();
        if (!frame || event.source !== frame.contentWindow) return;
        let origin;
        try { origin = new URL(frame.src).origin; } catch { return; }
        if (event.origin !== origin || event.data?.name !== "tv-widget-ready") return;
        readyFrame = event.source;
        console.log("[DXY] TradingView ready signal received");
        restoreWidget();
    });
    const initialize = () => {
        const content = document.querySelector(".dxy-content");
        const widget = content?.querySelector(".dxy-widget");
        const fallback = content?.querySelector(".dxy-fallback");
        if (!widget || !fallback) {
            console.warn("[DXY] initialization aborted: DXY markup missing");
            return;
        }
        initialized = true;
        let detectedFrame = null;
        const detectFrame = () => {
            const frame = getFrame();
            if (frame && frame !== detectedFrame) {
                detectedFrame = frame;
                console.log("[DXY] iframe detected; waiting for widget ready");
            }
        };
        observer = new MutationObserver(detectFrame);
        observer.observe(widget, { childList: true, subtree: true });
        timeout = setTimeout(() => {
            console.log("[DXY] timeout reached");
            if (readyFrame && getFrame()?.contentWindow === readyFrame) {
                restoreWidget();
                return;
            }
            content.classList.add("dxy-unavailable");
            fallback.hidden = false;
            console.log("[DXY] fallback shown");
            // A late ready message can restore the widget without reloading it.
        }, 8000);
        console.log("[DXY] monitoring initialized; timeout 8000 ms");
        detectFrame();
        restoreWidget();
    };
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initialize, { once: true });
    } else {
        initialize();
    }
})();
