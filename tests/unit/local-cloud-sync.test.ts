/** @jest-environment jsdom */
// @ts-nocheck
import { createSyncRuntimeApi } from '../../js/files/sync';
import { isExternalLocalFile } from '../../js/files/external';
jest.mock('../../js/files/websocket-sync', () => ({ createWebSocketClient: jest.fn(), createSyncThrottle: jest.fn() }));
jest.mock('../../js/e2e', () => ({ resolveFileContent: async content => content }));

function fixture(write) {
    const file = { id: 'local', name: 'note.md', type: 'file', content: 'edit', isExternalLocal: true, localFileMode: 'tauri', localAccessState: 'ready' };
    const app = { files: [file], currentUser: { username: 'user', token: 'token' }, currentFileId: 'local', lastSyncedContent: {}, unsavedChanges: {}, pendingServerSync: {}, showMessage: jest.fn() };
    let text = 'edit';
    const api = createSyncRuntimeApi({ globalRef: app, g: k => app[k], isExternalLocalFile,
        getCurrentEditorContent: () => text, setEditorContentForFile: (_, value) => { text = value; },
        markPendingServerSync: (id, value) => { app.pendingServerSync[id] = value; }, tryHandleTokenExpired: async () => false,
        writeExternalLocalContent: write, isEn: () => false });
    return { file, app, api, edit: value => { text = value; } };
}
describe('local and cloud acknowledgements', () => {
    afterEach(() => jest.restoreAllMocks());
    it('does not upload or mark saved when the original cannot be written', async () => {
        const { api, file } = fixture(async () => ({ success: false }));
        global.fetch = jest.fn();
        expect(await api.syncFileToServer('local')).toBe(false);
        expect(fetch).not.toHaveBeenCalled(); expect(file.isSynced).not.toBe(true);
    });
    it('writes edits locally before cloud upload, and writes server merged content back', async () => {
        const events = [];
        const write = jest.fn(async (_, content) => { events.push(content); return { success: true }; });
        const { api, file } = fixture(write);
        global.fetch = jest.fn(async url => { if (!String(url).endsWith('/local-origin')) events.push('upload'); return { json: async () => ({ code: 200, data: { content: 'merged', content_version: 2 } }) }; });
        expect(await api.syncFileToServer('local')).toBe(true);
        expect(events).toEqual(['edit', 'upload', 'merged']);
        expect(file.localSyncedContent).toBe('merged'); expect(file.localCloudUsername).toBe('user');
        expect(file.content).toBe('merged');
    });
    it('preserves edits made while a cloud save is in flight', async () => {
        const { api, app, file, edit } = fixture(async () => ({ success: true }));
        global.fetch = jest.fn(async () => { edit('newer draft'); return { json: async () => ({ code: 200, data: { content: 'edit', content_version: 1 } }) }; });
        expect(await api.syncFileToServer('local')).toBe(true);
        expect(file.content).toBe('newer draft'); expect(file.isSynced).toBe(false);
        expect(app.unsavedChanges.local).toBe(true); expect(app.pendingServerSync.local).toBe(true);
    });
});

describe('local save wrapper retains concurrent drafts', () => {
    it('does not clear a pending newer edit after an older cloud acknowledgement', async () => {
        const { installSyncRuntime } = await import('../../js/files/sync-runtime');
        const file = { id: 'local', type: 'file', content: 'new draft', isExternalLocal: true, localAccessState: 'ready' };
        const app = { files: [file], currentFileId: 'local', currentUser: { username: 'user' },
            lastSyncedContent: { local: 'older revision' }, unsavedChanges: { local: true }, pendingServerSync: { local: true },
            syncFileToServer: async () => true };
        const rt = installSyncRuntime(app, { getCurrentEditorContent: () => 'new draft' }, {});
        expect(await rt.syncFileAfterSaveIfNeeded('local', file, 'older revision', false, true)).toBe(false);
        expect(app.unsavedChanges.local).toBe(true); expect(app.pendingServerSync.local).toBe(true);
    });
    it('restores a cached write-failure draft after a restart instead of overwriting it with disk', async () => {
        const { installSyncRuntime } = await import('../../js/files/sync-runtime');
        const file = { id: 'local', type: 'file', content: 'unsaved recovery draft', isExternalLocal: true, localFileMode: 'tauri', localPendingWrite: true };
        const app = { files: [file], unsavedChanges: {}, lastSyncedContent: {}, electron: { readLocalFile: async () => ({ success: true, content: 'old disk text' }) } };
        const rt = installSyncRuntime(app, {}, {});
        expect(await rt.ensureExternalLocalAccess(file)).toBe(true);
        expect(file.content).toBe('unsaved recovery draft'); expect(app.unsavedChanges.local).toBe(true);
    });
});

describe('version-aware offline reconciliation', () => {
    beforeEach(() => localStorage.clear());
    afterEach(() => jest.restoreAllMocks());
    it('automatically merges independent edits and writes them to the original', async () => {
        const write = jest.fn(async () => ({ success: true }));
        const { app, file, edit } = fixture(write);
        const base = 'one\ntwo\nthree', local = 'ONE\ntwo\nthree', remote = 'one\ntwo\nTHREE';
        Object.assign(file, { content: local, crdtBaseContent: base, contentVersion: 1, isSynced: false }); edit(local); app.unsavedChanges.local = true;
        await app.reconcileRemoteFile(file, { content: remote, content_version: 2 });
        expect(file.content).toBe('ONE\ntwo\nTHREE'); expect(file.crdtBaseContent).toBe(remote); expect(file.contentVersion).toBe(2);
        expect(write).toHaveBeenCalledWith(file, 'ONE\ntwo\nTHREE'); expect(app.pendingServerSync.local).toBe(true);
    });
    it('retains both versions and does not advance the base on overlapping edits', async () => {
        const { app, file } = fixture(async () => ({ success: true })); app.currentFileId = 'other';
        Object.assign(file, { content: 'local', crdtBaseContent: 'original', contentVersion: 1, isSynced: false });
        await app.reconcileRemoteFile(file, { content: 'remote', content_version: 2 });
        expect(file.content).toBe('local'); expect(file.contentVersion).toBe(1); expect(file.syncConflict).toBe(true);
        expect(file.syncConflictRemoteContent).toBe('remote'); expect(JSON.parse(localStorage.getItem('epm-file:local'))[0].content).toBe('local');
    });
    it('does not attempt network writes while offline', async () => {
        jest.spyOn(navigator, 'onLine', 'get').mockReturnValue(false); global.fetch = jest.fn();
        const { api } = fixture(async () => ({ success: true })); expect(await api.syncFileToServer('local')).toBe(false); expect(fetch).not.toHaveBeenCalled();
    });
    it('treats other-device local sources as editable cloud copies', () => {
        expect(isExternalLocalFile({ type: 'file', isExternalLocal: true, localFileMode: 'remote' })).toBe(false);
    });
});

test('metadata refresh retains dirty drafts even if the cloud document was deleted', async () => {
    const { installSyncRuntime } = await import('../../js/files/sync-runtime');
    localStorage.clear(); jest.useFakeTimers();
    const file = { id: 'deleted-cloud', name: 'a.md', type: 'file', content: 'offline edit', isSynced: true, contentLoaded: true };
    const app = { files: [file], currentUser: { username: 'user', token: 'token' }, unsavedChanges: { 'deleted-cloud': true }, pendingServerSync: {}, lastSyncedContent: { 'deleted-cloud': 'original' }, showSyncStatus: jest.fn() };
    const rt = installSyncRuntime(app, { syncCurrentEditorSnapshotIntoFiles: () => {} }, { loadFiles: () => {}, shouldAutoOpenInitialFile: () => false });
    global.fetch = jest.fn(async () => ({ json: async () => ({ code: 200, data: { files: [] } }) }));
    try { await rt.loadFilesFromServer(); expect(app.files).toHaveLength(1); expect(app.files[0].content).toBe('offline edit'); }
    finally { jest.clearAllTimers(); jest.useRealTimers(); }
});
