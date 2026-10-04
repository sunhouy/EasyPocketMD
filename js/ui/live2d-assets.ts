// Public model assets only: never cache AI requests, credentials or document text here.
export const LIVE2D_CACHE = 'epmd-live2d-models-v1';
export const LIVE2D_MODELS = {
    shizuku: 'https://cdn.jsdelivr.net/npm/live2d-widget-model-shizuku@1.0.5/assets/shizuku.model.json',
    koharu: 'https://cdn.jsdelivr.net/npm/live2d-widget-model-koharu@1.0.5/assets/koharu.model.json'
};
function check(signal: AbortSignal) { if (signal.aborted) throw new DOMException('Cancelled', 'AbortError'); }
export async function cachedModelAsset(url: string, signal: AbortSignal): Promise<Response> {
    check(signal);
    let cache: Cache | undefined;
    try { cache = await caches.open(LIVE2D_CACHE); const hit = await cache.match(url); if (hit?.ok) return hit; } catch { /* Storage unavailable: use the HTTP cache. */ }
    const response = await fetch(url, { signal, credentials: 'omit', cache: 'force-cache' });
    if (!response.ok) throw new Error('Live2D resource failed: ' + response.status);
    check(signal);
    try { await cache?.put(url, response.clone()); } catch { /* Full cache must not break the renderer. */ }
    return response;
}

/** Cubism 2 accepts a slash-free data URL, so all resources can use cached blob URLs. */
export async function prepareCachedModel(model: keyof typeof LIVE2D_MODELS, signal: AbortSignal) {
    const manifestUrl = LIVE2D_MODELS[model];
    const manifest = await (await cachedModelAsset(manifestUrl, signal)).json();
    if (!manifest.model || !Array.isArray(manifest.textures)) throw new Error('Invalid Live2D model');
    const urls: string[] = [];
    const dispose = () => { for (const url of urls) URL.revokeObjectURL(url); urls.length = 0; };
    const jobs: Array<() => Promise<void>> = [];
    const seen = new Map<string, Promise<string>>();
    function replace(object: any, key: string | number) {
        const path = object[key]; if (typeof path !== 'string' || !path) return;
        const url = new URL(path, manifestUrl).href;
        jobs.push(async () => {
            let job = seen.get(url);
            if (!job) {
                job = (async () => {
                    const blob = await (await cachedModelAsset(url, signal)).blob(); check(signal);
                    const local = URL.createObjectURL(blob); urls.push(local); return local;
                })(); seen.set(url, job);
            }
            object[key] = await job;
        });
    }
    replace(manifest, 'model'); replace(manifest, 'physics'); replace(manifest, 'pose');
    manifest.textures.forEach((_: string, index: number) => replace(manifest.textures, index));
    for (const entry of manifest.expressions || []) replace(entry, 'file');
    for (const entries of Object.values(manifest.motions || {}) as any[][]) for (const entry of entries) {
        replace(entry, 'file'); delete entry.sound; // Muted companion avoids downloading unused audio.
    }
    try {
        let index = 0;
        // Settle every worker before revoking URLs after an error or cancellation.
        const workers = await Promise.allSettled(Array.from({ length: Math.min(4, jobs.length) }, async () => {
            while (index < jobs.length) { check(signal); await jobs[index++](); }
        }));
        const failed = workers.find(result => result.status === 'rejected') as PromiseRejectedResult;
        if (failed) throw failed.reason;
        check(signal);
        return { path: 'data:,' + encodeURIComponent(JSON.stringify(manifest)), dispose };
    } catch (error) { dispose(); throw error; }
}
