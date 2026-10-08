type Route = 'domestic' | 'overseas' | 'unknown' | 'loading';
const labels = {
    zh: {domestic:'当前线路：国内', overseas:'当前线路：境外', unknown:'当前线路：未识别', loading:'当前线路：识别中…'},
    en: {domestic:'Current route: Mainland China', overseas:'Current route: Overseas', unknown:'Current route: Unknown', loading:'Current route: Checking…'}
};
export function deploymentRouteEndpoint(app:Window):URL {
    const page = new URL(app.location.href);
    const native = !!(app.__TAURI__ || app.electron || app.desktopRuntime?.type === 'tauri') || page.protocol === 'file:';
    // Web: ask the gateway that served this page, even when API calls use another host.
    // Packaged apps: static assets are local, so report the configured service gateway.
    const base = native ? new URL(app.getApiBaseUrl?.() || 'https://md.yhsun.cn/api', page) : page;
    return new URL('/deployment-route.json',base);
}
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
                const endpoint = deploymentRouteEndpoint(app);
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
