import { loadFeature } from './feature-loader';
let loading: Promise<typeof import('./code-block-editor')>;
function ensureLoaded() {
    if (!loading) loading = loadFeature('code-block-editor', () => import('./code-block-editor'), false).catch(error => { loading = null; console.error('Code editor loading failed', error); throw error; });
    return loading;
}
function loadForCode() {
    if (loading) return;
    if (document.querySelector('#vditor [data-type="code-block"]')) void ensureLoaded().catch(() => {});
}
(window as any).attachCodeBlockEditors = (instance: any, root: HTMLElement) => {
    if (root.querySelector('[data-type="code-block"]')) void ensureLoaded().then(module => module.registerCodeBlockEditors(instance, root)).catch(() => {});
    // A document that initially has no code blocks can acquire them later.
    const observer = new MutationObserver(() => {
        if (!root.isConnected) { observer.disconnect(); return; }
        if (root.querySelector('[data-type="code-block"]')) {
            void ensureLoaded().then(module => module.registerCodeBlockEditors(instance, root)).catch(() => {});
            observer.disconnect();
        }
    });
    observer.observe(root, {childList:true, subtree:true});
};
new MutationObserver(loadForCode).observe(document.body, {childList:true, subtree:true});
loadForCode();
