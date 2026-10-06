(() => {
    const content = document.querySelector(".dxy-content");
    const widget = content?.querySelector(".dxy-widget");
    const fallback = content?.querySelector(".dxy-fallback");
    if (!widget || !fallback) return;

    // The embed loader creates a cross-origin iframe; its quote data cannot
    // be inspected here. Only watch the DXY container for initialization.
    const hasWidget = () => Array.from(widget.querySelectorAll("iframe"))
        .some(frame => {
            const src = frame.getAttribute("src");
            return src && src !== "about:blank";
        });

    const restoreWidget = () => {
        if (!hasWidget()) return false;
        clearTimeout(timeout);
        content.classList.remove("dxy-unavailable");
        fallback.hidden = true;
        observer.disconnect();
        return true;
    };

    const observer = new MutationObserver(restoreWidget);
    const timeout = setTimeout(() => {
        if (restoreWidget()) return;
        content.classList.add("dxy-unavailable");
        fallback.hidden = false;
        // Keep watching so a slow loader can still replace the fallback.
    }, 8000);

    observer.observe(widget, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["src"]
    });
    restoreWidget();
})();
