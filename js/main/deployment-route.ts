type Route = 'domestic' | 'overseas' | 'unknown' | 'loading';
const labels = {
    zh: {domestic:'当前线路：国内', overseas:'当前线路：境外', unknown:'当前线路：未识别', loading:'当前线路：识别中…'},
    en: {domestic:'Current route: Mainland China', overseas:'Current route: Overseas', unknown:'Current route: Unknown', loading:'Current route: Checking…'}
};
export function createDeploymentRouteStatus(app: Window = window, root: Document = document) {
    let route: Route = 'unknown', checkedAt = 0, inFlight: Promise<void> | undefined;
    const render = () => {
        const language = app.i18n?.getLanguage() === 'en' ? 'en' : 'zh';
        root.querySelectorAll<HTMLElement>('[data-deployment-route]').forEach(element => { element.textContent = labels[language][route]; });
    };
    const refresh = () => {
        if (inFlight) return inFlight;
        if (checkedAt && Date.now() - checkedAt < 15000) { render(); return Promise.resolve(); }
        route = 'loading'; render();
        inFlight = (async () => {
            const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 5000);
            try {
                const base = new URL(app.getApiBaseUrl?.() || '/', app.location.href);
                const endpoint = new URL('/deployment-route.json', base);
                const response = await fetch(endpoint.href, {cache:'no-store', signal:controller.signal});
                if (!response.ok) throw new Error('Route metadata unavailable');
                const data = await response.json();
                route = data.route === 'domestic' || data.route === 'overseas' ? data.route : 'unknown';
            } catch { route = 'unknown'; }
            finally { clearTimeout(timer); checkedAt = Date.now(); render(); inFlight = undefined; }
        })();
        return inFlight;
    };
    app.addEventListener('languagechange', render);
    render();
    return refresh;
}
