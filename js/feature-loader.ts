import { isMarketBuild } from './build-variant';
const modules = new Map<string, {promise: Promise<any>; ready: boolean}>();
let foregroundLoads = 0;
function loadingStatus() {
    let status = document.getElementById('featureLoadingStatus');
    if (!foregroundLoads) { status?.remove(); return; }
    if (!status) {
        status = document.createElement('div'); status.id = 'featureLoadingStatus';
        status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
        document.body.append(status);
    }
    status.textContent = window.i18n?.getLanguage?.() === 'en' ? 'Loading…' : '加载中…';
}
export async function loadFeature<T>(key: string, loader: () => Promise<T>, foreground = true): Promise<T> {
    let record = modules.get(key);
    if (record?.ready) return record.promise;
    if (foreground) { foregroundLoads++; loadingStatus(); }
    try {
        // Paint the status before module evaluation or a background import continuation.
        if (foreground) await new Promise<void>(resolve => requestAnimationFrame(() => { setTimeout(resolve, 0); }));
        record = modules.get(key);
        if (!record) {
            const next = {promise: null as Promise<T>, ready:false};
            next.promise = loader().then(module => { next.ready = true; return module; }).catch(error => { modules.delete(key); throw error; });
            modules.set(key, next); record = next;
        }
        return await record.promise;
    } catch (error) {
        if (foreground) window.showMessage?.(window.i18n?.getLanguage?.() === 'en' ? 'Loading failed. Please try again.' : '加载失败，请重试', 'error');
        throw error;
    } finally { if (foreground) { foregroundLoads--; loadingStatus(); } }
}
let scheduled = false;
export function preloadFeatures() {
    if (scheduled) return; scheduled = true;
    const loaders: [string, () => Promise<unknown>][] = [
        ['ui/share', () => import('./ui/share')], ['ui/export', () => import('./ui/export')],
        ['ui/print', () => import('./ui/print')], ['ui/ai', () => import('./ui/ai')],
        ['ui/slash-builtin-index', () => import('./ui/slash-builtin-index')], ['ui/ai-assistant', () => import('./ui/ai-assistant')],
        ['ui/file-manager', () => import('./ui/file-manager')], ['formula-picker', () => import('./formula-picker')],
        ['ui/chart', () => import('./ui/chart')], ['emoji-picker', () => import('./emoji-picker')],
        ['code-runner', () => import('./code-runner')], ['code-block-editor', () => import('./code-block-editor')],
        ['main/android-todo', () => import('./main/android-todo')],
        ['ui/pdf-generator', () => import('./ui/pdf-generator')], ['ui/docx-generator', () => import('./ui/docx-generator')],
        ['ui/ppt-generator', () => import('./ui/ppt-generator')], ['ui/ppt-manual-export', () => import('./ui/ppt-manual-export')],
        ['ui/xlsx-export', () => import('./ui/xlsx-export')]
    ];
    const idle = (callback: () => void) => {
        if ('requestIdleCallback' in window) (window as any).requestIdleCallback(callback, {timeout:3000});
        else setTimeout(callback, 200);
    };
    const next = () => {
        const loader = loaders.shift(); if (!loader) return;
        if (isMarketBuild && ['ui/ai','ui/ai-assistant','ui/ppt-generator'].includes(loader[0])) { next(); return; }
        idle(() => { void loadFeature(loader[0], loader[1], false).catch(() => {}).finally(next); });
    };
    next();
}
