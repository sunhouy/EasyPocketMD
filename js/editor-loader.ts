import { loadFeature } from './feature-loader';
export async function loadEditorConstructor(foreground = true) {
    const module = await loadFeature('editor/vditor', async () => {
        await import('@sunhouyun/vditor/dist/index.css');
        return import('@sunhouyun/vditor');
    }, foreground);
    window.Vditor = module.default;
    return module.default;
}
export async function loadLegacyFileTree() {
    return loadFeature('files/legacy-tree', async () => {
        await import('jstree/dist/themes/default/style.min.css');
        await import('jstree');
    });
}
export function afterFirstPaint(callback: () => void) {
    requestAnimationFrame(() => setTimeout(() => {
        if ('requestIdleCallback' in window) window.requestIdleCallback(callback, {timeout: 2000});
        else setTimeout(callback, 200);
    }, 0));
}
