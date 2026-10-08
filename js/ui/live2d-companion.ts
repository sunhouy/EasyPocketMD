import { loadFeature } from '../feature-loader';
import type { Live2DModel } from '../main/live2d-models';
import { prepareCachedModel } from './live2d-assets';

export async function openCompanionQuery() {
    if (typeof window.showAIQueryPanel !== 'function') await loadFeature('ui/ai-assistant', () => import('./ai-assistant'));
    window.showAIQueryPanel();
}

export async function mountLive2D(model: Live2DModel, signal: AbortSignal) {
    const host = document.createElement('aside'); host.id = 'live2dCompanion';
    const canvas = document.createElement('canvas');
    canvas.width = 240; canvas.height = 320;
    canvas.tabIndex = 0; canvas.setAttribute('role', 'button');
    canvas.setAttribute('data-i18n-aria-label', 'live2dAsk');
    canvas.setAttribute('aria-label', window.i18n?.t('live2dAsk') || '点击形象，查询全部文档');
    const status = document.createElement('p'); status.setAttribute('role', 'status'); status.setAttribute('data-i18n', 'live2dLoading');
    status.textContent = window.i18n?.t('live2dLoading') || '正在加载形象…';
    host.append(canvas, status); document.body.append(host);
    const ask = () => { if (!signal.aborted) void openCompanionQuery().catch(() => window.showMessage?.('AI 查询加载失败 / Could not open AI query', 'error')); };
    canvas.addEventListener('click', ask);
    canvas.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); ask(); } });
    let instance: import('l2d').L2D | null = null;
    let assets: Awaited<ReturnType<typeof prepareCachedModel>> | null = null;
    let disposed = false;
    const destroy = () => {
        if (disposed) return; disposed = true;
        signal.removeEventListener('abort', destroy); host.remove();
        try { instance?.destroy(); } catch { /* The SDK may still be initializing. */ } finally { assets?.dispose(); }
    };
    signal.addEventListener('abort', destroy, { once: true });
    try {
        const sdk = await import('l2d');
        if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
        const prepared = await prepareCachedModel(model, signal);
        assets = prepared;
        if (signal.aborted) { prepared.dispose(); throw new DOMException('Cancelled', 'AbortError'); }
        instance = sdk.init(canvas);
        instance.on('loaded', () => { if (signal.aborted || disposed) { try { instance.destroy(); } catch { /* Already released. */ } } });
        let timeout: ReturnType<typeof setTimeout>;
        try {
            await Promise.race([
                instance.load({ path: prepared.path, volume: 0, logLevel: 'error', scale: 1 }),
                new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error('Live2D loading timed out')), 25000); })
            ]);
        } finally { clearTimeout(timeout); }
        if (signal.aborted) { instance.destroy(); throw new DOMException('Cancelled', 'AbortError'); }
        status.remove();
        return { destroy };
    } catch (error) { destroy(); assets?.dispose(); throw error; }
}
