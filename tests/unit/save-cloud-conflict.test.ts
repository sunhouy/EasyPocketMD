/** @jest-environment jsdom */
// @ts-nocheck
import { createSyncRuntimeApi } from '../../js/files/sync';
import { installEditorRuntime } from '../../js/files/editor-runtime';
let mockCallbacks;
jest.mock('../../js/files/websocket-sync', () => ({
    createWebSocketClient: callbacks => { mockCallbacks = callbacks; return { isConnected: () => true, send: jest.fn(), disconnect: jest.fn() }; },
    createSyncThrottle: send => ({ schedule: send, cancel: jest.fn() })
}));
jest.mock('../../js/e2e', () => ({ resolveFileContent: async value => value, encrypt: async value => value }));
function fixture() {
    const file = { id: 'note', name: 'note.md', type: 'file', content: 'original', contentLoaded: true, contentVersion: 1, crdtBaseContent: 'original', crdtBaseContentVersion: 1, isSynced: true };
    const app = { files: [file], currentFileId: 'note', currentUser: { username: 'user', token: 'token' }, lastSyncedContent: { note: 'original' }, unsavedChanges: {}, pendingServerSync: {}, syncAllFiles: jest.fn() };
    let text = 'first edit';
    const api = createSyncRuntimeApi({ globalRef: app, g: key => app[key], isExternalLocalFile: () => false,
        getCurrentEditorContent: (_, fallback) => app.currentFileId === 'note' ? text : fallback,
        setEditorContentForFile: (_, value) => { text = value; }, markPendingServerSync: (id, dirty) => { app.pendingServerSync[id] = dirty; } });
    return { api, app, file, edit: value => { text = value; } };
}
beforeEach(() => { localStorage.clear(); });
afterEach(() => jest.restoreAllMocks());
it('advances both the content and version base after a websocket save, so the next manual save does not conflict', async () => {
    const { api, app, file, edit } = fixture(); api.startAutoSync();
    try {
        await api.scheduleWebSocketSync(file.id);
        await mockCallbacks.onFileSaved({ filename: file.name, content: 'first edit', content_version: 2, code: 200 });
        edit('second edit');
        global.fetch = jest.fn(async (_, options) => {
            const sent = JSON.parse(options.body);
            const correctBase = sent.base_content === 'first edit' && sent.base_content_version === 2;
            return { json: async () => ({ code: correctBase ? 200 : 409, data: { content: correctBase ? sent.content : 'first edit', content_version: correctBase ? 3 : 2 } }) };
        });
        expect(await api.syncFileToServer(file.id, { background: false })).toBe(true);
        expect(file.syncConflict).not.toBe(true); expect(file.content).toBe('second edit');
        expect(app.lastSyncedContent.note).toBe('second edit');
    } finally { api.stopAutoSync(); }
});
it('persists the confirmed local document and base even if the user switches to another document before acknowledgement', async () => {
    const { api, app, file } = fixture(); api.startAutoSync();
    try {
        await api.scheduleWebSocketSync(file.id); file.content = 'first edit'; app.currentFileId = 'other';
        await mockCallbacks.onFileSaved({ filename: file.name, content: 'first edit', content_version: 2, code: 200 });
        expect(file.crdtBaseContent).toBe('first edit'); expect(file.crdtBaseContentVersion).toBe(2);
        const snapshot = JSON.parse(localStorage.getItem('epm-file:note'))[0];
        expect(snapshot.content).toBe('first edit'); expect(snapshot.crdtBaseContentVersion).toBe(2);
    } finally { api.stopAutoSync(); }
});
it('retains newer typing in the local journal while advancing only the confirmed websocket base', async () => {
    const { api, app, file, edit } = fixture(); api.startAutoSync();
    try {
        await api.scheduleWebSocketSync(file.id); edit('newer typing');
        await mockCallbacks.onFileSaved({ filename: file.name, content: 'first edit', content_version: 2, code: 200 });
        expect(file.content).toBe('newer typing'); expect(file.crdtBaseContent).toBe('first edit');
        expect(app.unsavedChanges.note).toBe(true); expect(app.pendingServerSync.note).toBe(true);
        expect(JSON.parse(localStorage.getItem('epm-file:note'))[0].content).toBe('newer typing');
    } finally { api.stopAutoSync(); }
});
it('does not read an empty or previous editor as the next file while its contents are loading', () => {
    let value = '';
    const app = { currentFileId: 'previous', vditor: { vditor: { lute: { Md2VditorDOM() {} } }, getValue: () => value, setValue: text => { value = text; } } };
    const editor = installEditorRuntime(app, {});
    app.currentFileId = 'next';
    expect(editor.getCurrentEditorContent('next', 'cached document')).toBe('cached document');
    editor.setEditorContentForFile('next', 'cached document');
    expect(editor.getCurrentEditorContent('next', 'fallback')).toBe('cached document');
    value = ''; // An intentional deletion after loading must remain valid.
    expect(editor.getCurrentEditorContent('next', 'cached document')).toBe('');
    expect(editor.getCurrentEditorContent('previous', 'previous snapshot')).toBe('previous snapshot');
});
it('uses the pending document during deferred editor initialization instead of its temporary empty buffer', async () => {
    let value = ''; let finish;
    const editorInstance = { vditor: {}, getValue: () => value, setValue: text => { value = text; } };
    const app = { currentFileId: 'note', vditor: editorInstance, ensureVditorInitialized: () => new Promise(resolve => { finish = resolve; }) };
    const editor = installEditorRuntime(app, {});
    editor.setEditorContentForFile('note', 'loaded cloud content');
    editorInstance.vditor.lute = { Md2VditorDOM() {} };
    expect(editor.getCurrentEditorContent('note', 'old snapshot')).toBe('loaded cloud content');
    finish(editorInstance); await Promise.resolve();
    expect(editor.getCurrentEditorContent('note', 'old snapshot')).toBe('loaded cloud content');
});

it('recovers an existing false conflict against our own acknowledged revision without losing the local draft', async () => {
    const { api, app, file } = fixture();
    Object.assign(file, { contentVersion: 2, syncConflict: true, syncConflictVersion: 2, syncConflictRemoteContent: 'confirmed earlier edit' });
    global.fetch = jest.fn(async (_, options) => {
        expect(JSON.parse(options.body)).toMatchObject({ base_content: 'confirmed earlier edit', base_content_version: 2, content: 'first edit' });
        return { json: async () => ({ code: 200, data: { content: 'first edit', content_version: 3 } }) };
    });
    expect(await api.syncFileToServer(file.id, { background: false })).toBe(true);
    expect(file.syncConflict).toBeUndefined(); expect(file.content).toBe('first edit');
});
it('keeps a genuine existing conflict against a newer remote version for manual resolution', async () => {
    const { api, file } = fixture();
    Object.assign(file, { syncConflict: true, syncConflictVersion: 2, syncConflictRemoteContent: 'other device edit' });
    global.fetch = jest.fn();
    expect(await api.syncFileToServer(file.id, { background: false })).toBe(false);
    expect(fetch).not.toHaveBeenCalled(); expect(file.syncConflict).toBe(true);
});
it('does not interpret a metadata-only remote event as an empty document', async () => {
    const { app, file } = fixture();
    await app.reconcileRemoteFile(file, { content_version: 2 });
    expect(file.content).toBe('original'); expect(file.contentVersion).toBe(1);
    expect(file.remoteContentVersion).toBe(2); expect(file.syncConflict).not.toBe(true);
});
it('ignores an older HTTP acknowledgement after a newer websocket save was confirmed', async () => {
    const { api, app, file, edit } = fixture(); api.startAutoSync();
    try {
        global.fetch = jest.fn(async () => {
            edit('newest draft');
            await mockCallbacks.onFileSaved({ filename: file.name, content: 'first edit', content_version: 3, code: 200 });
            return { json: async () => ({ code: 200, data: { content: 'original', content_version: 2 } }) };
        });
        await api.syncFileToServer(file.id, { background: false });
        expect(file.contentVersion).toBe(3); expect(file.crdtBaseContent).toBe('first edit');
        expect(file.content).toBe('newest draft'); expect(app.pendingServerSync.note).toBe(true);
        expect(file.syncConflict).not.toBe(true);
    } finally { api.stopAutoSync(); }
});

it('does not auto-resolve an already empty recovery snapshot by deleting nonempty cloud content', async () => {
    const { api, file, edit } = fixture(); edit('');
    Object.assign(file, { content: '', contentVersion: 2, syncConflict: true, syncConflictVersion: 2, syncConflictRemoteContent: 'recoverable cloud content' });
    global.fetch = jest.fn();
    expect(await api.syncFileToServer(file.id, { background: false })).toBe(false);
    expect(fetch).not.toHaveBeenCalled(); expect(file.syncConflictRemoteContent).toBe('recoverable cloud content');
});
