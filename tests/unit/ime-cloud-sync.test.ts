/** @jest-environment jsdom */
// @ts-nocheck
import { installEditorComposition, isEditorComposing } from '../../js/editor-composition';
import { AutoSaveScheduler } from '../../js/files/autoSave';
import { createSyncRuntimeApi } from '../../js/files/sync';
jest.mock('../../js/files/websocket-sync', () => ({ createWebSocketClient: jest.fn(), createSyncThrottle: jest.fn() }));
jest.mock('../../js/e2e', () => ({ resolveFileContent: async content => content }));
let cleanup, scheduler;
function fixture() {
    document.body.innerHTML = '<div id="vditor"><div class="main-editor" contenteditable="true"></div><div class="epmd-code-editor"><div class="cm-content" contenteditable="true"></div></div></div><input id="filename"><textarea id="longFileTextarea"></textarea>';
    const file = { id: 'note', name: 'note.md', type: 'file', content: '标题\n', contentLoaded: true, contentVersion: 1, crdtBaseContent: '标题\n', crdtBaseContentVersion: 1, isSynced: true };
    const app = { files: [file], currentFileId: 'note', currentUser: { username: 'owner', token: 'token' }, lastSyncedContent: { note: '标题\n' }, unsavedChanges: {}, pendingServerSync: {}, wsThrottle: { cancel: jest.fn(), schedule: jest.fn() } };
    let text = file.content;
    const api = createSyncRuntimeApi({ globalRef: app, g: key => app[key], isExternalLocalFile: () => false,
        getCurrentEditorContent: () => text, setEditorContentForFile: (_id, value) => { text = value; },
        markPendingServerSync: (id, value) => { app.pendingServerSync[id] = value; },
        tryHandleTokenExpired: async () => false, writeExternalLocalContent: async () => ({ success: true }), isEn: () => false });
    const persist = jest.fn();
    scheduler = new AutoSaveScheduler({ current: () => app.currentFileId, dirty: id => !!app.unsavedChanges[id], blocked: () => isEditorComposing(app), persist, save: () => api.syncFileToServer('note', { background: true }), debounceMs: 1000, forceMs: 5000 });
    app.startAutoSave = () => scheduler.trigger(); app.clearAutoSave = () => scheduler.clear();
    cleanup = installEditorComposition(app);
    global.fetch = jest.fn(async (_url, options) => ({ json: async () => ({ code: 200, data: { content: JSON.parse(options.body).content, content_version: 2 } }) }));
    const input = (value, target = document.querySelector('.main-editor'), composing = false) => { text = value; app.unsavedChanges.note = true; target.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: composing })); app.startAutoSave(); };
    return { app, api, file, persist, input, edit: value => { text = value; }, text: () => text, root: document.querySelector('.main-editor') };
}
beforeEach(() => { jest.useFakeTimers(); localStorage.clear(); });
afterEach(() => { cleanup?.(); scheduler?.clear(); jest.useRealTimers(); });
it.each(['.main-editor', '.cm-content', '#longFileTextarea'])('does not persist or upload preedit from %s even beyond the force deadline, then saves final Chinese text', async selector => {
    const f = fixture(), target = document.querySelector(selector);
    target.parentElement.addEventListener('compositionstart', event => event.stopPropagation());
    f.input('标题\n已确认'); // A previously scheduled autosave must also be cancelled.
    target.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    f.input('标题\nlie biao', target, true);
    await jest.advanceTimersByTimeAsync(10000);
    expect(f.persist).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
    expect(await f.api.syncFileToServer('note', { background: true })).toBe(false);
    await f.api.scheduleWebSocketSync('note'); expect(f.app.wsThrottle.schedule).not.toHaveBeenCalled();
    expect(f.api.syncCurrentFileWithBeacon()).toBe(false);
    target.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    // The final input happens after compositionend; an immediate manual save must still wait.
    expect(await f.api.syncFileToServer('note', { background: false })).toBe(false);
    f.input('标题\n列表', target);
    await jest.advanceTimersByTimeAsync(1000);
    expect(JSON.parse(fetch.mock.calls[0][1].body).content).toBe('标题\n列表');
    expect(fetch).toHaveBeenCalledTimes(1); expect(f.file.syncConflict).not.toBe(true);
});
it('defers a remote reconciliation until final input and does not report a conflict against preedit', async () => {
    const f = fixture();
    f.root.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })); f.input('标题\nlie biao', f.root, true);
    const pending = f.app.reconcileRemoteFile(f.file, { content: '标题\n', content_version: 2 });
    await Promise.resolve(); expect(f.file.contentVersion).toBe(1); expect(f.file.syncConflict).not.toBe(true);
    f.root.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })); f.input('标题\n列表');
    await jest.advanceTimersByTimeAsync(0); await pending;
    expect(f.text()).toBe('标题\n列表'); expect(f.file.contentVersion).toBe(2); expect(f.file.syncConflict).not.toBe(true);
});
it('applies an in-flight cloud acknowledgement only after composition commits, preserving the newer draft', async () => {
    const f = fixture(); f.edit('标题\n已确认'); f.app.unsavedChanges.note = true;
    let respond;
    fetch.mockImplementation(() => new Promise(resolve => { respond = resolve; }));
    const pending = f.api.syncFileToServer('note', { background: true });
    for (let i = 0; i < 20 && !respond; i++) await Promise.resolve();
    expect(respond).toBeDefined();
    f.root.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })); f.input('标题\n已确认 lie biao', f.root, true);
    respond({ json: async () => ({ code: 200, data: { content: '标题\n已确认', content_version: 2 } }) });
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(f.file.contentVersion).toBe(1); expect(f.file.syncConflict).not.toBe(true);
    f.root.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })); f.input('标题\n已确认 列表');
    await jest.advanceTimersByTimeAsync(0); await pending;
    expect(f.text()).toBe('标题\n已确认 列表'); expect(f.app.unsavedChanges.note).toBe(true); expect(f.file.isSynced).toBe(false); expect(f.file.syncConflict).not.toBe(true);
});
it('does not pause document sync for composition in unrelated filename inputs', () => {
    const f = fixture(); document.getElementById('filename').dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    expect(isEditorComposing(f.app)).toBe(false);
});
it('still detects a genuine conflict after both sides edit the same committed text', async () => {
    const f = fixture(); f.file.crdtBaseContent = f.file.content = 'same'; f.file.isSynced = false; f.edit('local'); f.app.unsavedChanges.note = true;
    await f.app.reconcileRemoteFile(f.file, { content: 'remote', content_version: 2 });
    expect(f.file.syncConflict).toBe(true);
});

it('continues syncing other documents while the active document is composing', async () => {
    const f = fixture();
    const other = { ...f.file, id: 'other', name: 'other.md', content: 'another document', crdtBaseContent: 'another document' };
    f.app.files.push(other);
    f.root.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })); f.input('标题\nlie biao', f.root, true);
    expect(await f.api.syncFileToServer('other', { background: true })).toBe(true);
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({ filename: 'other.md', content: 'another document' });
    expect(f.file.contentVersion).toBe(1);
});
