import { isEditorComposing } from '../../editor-composition';
import { persistFile } from './local-state';

/** Synchronous local durability must precede any leave-time network request. */
export function checkpointCurrentFile(app: any): boolean {
    const file = app.files?.find((f: any) => f.id === app.currentFileId && f.type === 'file');
    if (!file) return true;
    const composing = isEditorComposing(app, file.id);
    const content = !composing && typeof app.getCurrentEditorContent === 'function'
        ? app.getCurrentEditorContent(file.id, file.content)
        : (!composing && app.vditorReady !== false && typeof app.vditor?.getValue === 'function' ? app.vditor.getValue() : file.content);
    if (typeof content !== 'string' || file.contentLoaded === false) return false;
    const changed = content !== file.content;
    if (changed) { file.content = content; file.lastModified = Date.now(); }
    const dirty = changed || app.unsavedChanges?.[file.id] || app.pendingServerSync?.[file.id] || file.isSynced === false;
    if (dirty) {
        if (app.currentUser) { file.isSynced = false; app.markPendingServerSync?.(file.id, true); }
        app.unsavedChanges ||= {}; app.unsavedChanges[file.id] = true;
    }
    try { return persistFile(file, window.e2eSerializeFiles); }
    catch (error) { console.warn('[Lifecycle] Local checkpoint failed:', error); return false; }
}
