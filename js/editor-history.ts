import { captureVditorCursor, getVditorEditableElement, restoreVditorCursor } from './editor-cursor';

export function cancelEditorHistoryTimers(instance: any) {
    for (const mode of ['wysiwyg', 'ir', 'sv']) {
        const surface = instance?.vditor?.[mode];
        if (!surface) continue;
        for (const timer of ['afterRenderTimeoutId', 'processTimeoutId']) {
            clearTimeout(surface[timer]); surface[timer] = undefined;
        }
    }
}

/** Wrap the shared history object so keyboard, slash commands and all toolbars agree. */
export function installEditorHistory(instance: any) {
    const history = instance?.vditor?.undo;
    if (!history || history.epmdInstalled) return;
    history.epmdInstalled = true;
    let recorded = instance.getValue();
    const add = history.addToUndoStack;
    history.addToUndoStack = function(internal: any) {
        const result = add.call(this, internal); recorded = instance.getValue(); return result;
    };
    for (const action of ['undo', 'redo']) {
        const original = history[action];
        history[action] = function(internal: any) {
            if (instance === window.vditor && window.isLongFileMode) return;
            const root = getVditorEditableElement(instance);
            if (!root || root.getAttribute('contenteditable') === 'false' || internal[internal.currentMode]?.composingLock) return;
            const cursor = captureVditorCursor(instance);
            // A quick undo must include typing that has not reached Vditor's debounce yet.
            cancelEditorHistoryTimers(instance);
            if (instance.getValue() !== recorded) this.addToUndoStack(internal);
            root.focus({preventScroll:true});
            const before = document.getSelection();
            if (!before?.rangeCount || !root.contains(before.anchorNode) || !root.contains(before.focusNode)) {
                const range = document.createRange(); range.selectNodeContents(root); range.collapse(false);
                before?.removeAllRanges(); before?.addRange(range);
            }
            const result = original.call(this, internal);
            recorded = instance.getValue();
            const selection = document.getSelection();
            // Vditor places a missing caret before the editor. Keep it inside the document.
            if (!selection?.rangeCount || !root.contains(selection.anchorNode) || !root.contains(selection.focusNode)) {
                if (cursor) { cursor.wasFocused = true; restoreVditorCursor(instance, cursor); }
                else { const range=document.createRange();range.selectNodeContents(root);range.collapse(false);selection?.removeAllRanges();selection?.addRange(range); }
            }
            return result;
        };
    }
}

export function setEditorFileValue(instance: any, content: string, switched: boolean) {
    installEditorHistory(instance);
    if (switched) cancelEditorHistoryTimers(instance);
    instance.setValue(content, switched);
    if (switched) cancelEditorHistoryTimers(instance);
}
