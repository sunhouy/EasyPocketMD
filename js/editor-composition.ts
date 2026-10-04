/** IME preedit text is transient: pause persistence and merges until the final input event settles. */
interface CompositionState {
    fileId: string | null;
    target: Element | null;
    ending: boolean;
    timer?: ReturnType<typeof setTimeout>;
    waiters: Set<() => void>;
    revisions: Map<string, number>;
}
const states = new WeakMap<object, CompositionState>();
export function editorCompositionId(app: any): string | null {
    return app.currentFileId || (app.sharedDocState?.shareId ? 'share:' + app.sharedDocState.shareId : null);
}
export function isEditorComposing(app: any, fileId = editorCompositionId(app)): boolean {
    const state = states.get(app);
    return !!fileId && state?.fileId === fileId;
}
export function compositionRevision(app: any, fileId: string): number {
    return states.get(app)?.revisions.get(fileId) || 0;
}
export async function waitForEditorCommit(app: any, fileId: string): Promise<void> {
    while (isEditorComposing(app, fileId)) await new Promise<void>(resolve => states.get(app)!.waiters.add(resolve));
}
export function installEditorComposition(app: any, doc: Document = document): () => void {
    if (states.has(app)) return () => {};
    const state: CompositionState = { fileId: null, target: null, ending: false, waiters: new Set(), revisions: new Map() };
    states.set(app, state);
    const editorTarget = (event: Event) => {
        const target = event.target instanceof Element ? event.target : null;
        if (!target || (!target.closest('#vditor') && target.id !== 'longFileTextarea')) return null;
        return target.closest('[contenteditable="true"], textarea') ? target : null;
    };
    const settle = () => {
        clearTimeout(state.timer);
        const id = state.fileId;
        state.fileId = null; state.target = null; state.ending = false;
        for (const resolve of state.waiters) resolve(); state.waiters.clear();
        if (id && id === editorCompositionId(app)) {
            // Some editors suppress the final input callback: explicitly resume autosave.
            if (app.currentFileId && app.unsavedChanges) app.unsavedChanges[id] = true;
            app.startAutoSave?.();
            if (app.sharedDocState?.canEdit) app.scheduleSharedDocSync?.();
        }
    };
    const start = (event: Event) => {
        const target = editorTarget(event), id = editorCompositionId(app);
        if (!target || !id) return;
        if (state.fileId && state.fileId !== id) settle();
        clearTimeout(state.timer);
        state.fileId = id; state.target = target; state.ending = false;
        state.revisions.set(id, (state.revisions.get(id) || 0) + 1);
        app.clearAutoSave?.(); app.wsThrottle?.cancel?.();
        if (app.sharedDocState?.saveTimer) { clearTimeout(app.sharedDocState.saveTimer); app.sharedDocState.saveTimer = null; }
    };
    const end = (event: Event) => {
        const target = editorTarget(event);
        if (!state.fileId || !target || (state.target && !state.target.contains(target) && !target.contains(state.target))) return;
        state.ending = true;
        clearTimeout(state.timer);
        state.timer = setTimeout(settle, 0); // compositionend may precede the final DOM/input update.
    };
    const input = (event: InputEvent) => {
        if (event.isComposing && !isEditorComposing(app)) start(event);
        else if (state.ending && editorTarget(event)) end(event);
    };
    // Capture also sees CodeMirror events stopped by its enclosing code-block host.
    doc.addEventListener('compositionstart', start, true);
    doc.addEventListener('compositionend', end, true);
    doc.addEventListener('input', input, true);
    doc.addEventListener('focusout', end, true);
    return () => {
        clearTimeout(state.timer); states.delete(app);
        for (const resolve of state.waiters) resolve(); state.waiters.clear();
        doc.removeEventListener('compositionstart', start, true); doc.removeEventListener('compositionend', end, true);
        doc.removeEventListener('input', input, true); doc.removeEventListener('focusout', end, true);
    };
}
