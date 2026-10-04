// Only this small controller is eager. The renderer and Live2D SDK stay in lazy chunks.
export interface Live2DPreference { enabled: boolean; model: 'shizuku' | 'koharu' }
export function live2DPreference(value: any): Live2DPreference {
    return { enabled: value?.enabled === true, model: value?.model === 'koharu' ? 'koharu' : 'shizuku' };
}
export function createLive2DControls() {
    const enabled = document.getElementById('live2dEnabled') as HTMLInputElement;
    const model = document.getElementById('live2dModel') as HTMLSelectElement;
    enabled?.addEventListener('change', () => { model.disabled = !enabled.checked; });
    return {
        open(value: unknown) { const pref = live2DPreference(value); enabled.checked = pref.enabled; model.value = pref.model; model.disabled = !pref.enabled; },
        get() { return live2DPreference({ enabled: enabled?.checked, model: model?.value }); }
    };
}

let active: { destroy(): void } | null = null;
let controller: AbortController | null = null;
let pending = Promise.resolve();
let selected = '';
export function applyLive2D(value: unknown, force = false) {
    const pref = live2DPreference(value);
    const key = JSON.stringify(pref);
    if (selected === key && !force) return pending;
    selected = key;
    controller?.abort(); active?.destroy(); active = null;
    document.getElementById('live2dCompanion')?.remove();
    if (!pref.enabled) return pending;
    const request = new AbortController(); controller = request;
    pending = pending.catch(() => {}).then(async () => {
        if (request.signal.aborted) return;
        try {
            const { mountLive2D } = await import('../ui/live2d-companion');
            if (request.signal.aborted) return;
            const companion = await mountLive2D(pref.model, request.signal);
            if (request.signal.aborted) companion.destroy();
            else active = companion;
        } catch (error) {
            if (!request.signal.aborted) {
                selected = ''; // Saving again retries a failed network/model load.
                window.showMessage?.(window.i18n?.getLanguage() === 'en' ? 'Could not load Live2D. Save the setting again to retry.' : '看板娘加载失败，可重新保存设置重试。', 'error');
            }
        }
    });
    return pending;
}
