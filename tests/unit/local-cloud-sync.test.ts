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
        global.fetch = jest.fn(async () => { events.push('upload'); return { json: async () => ({ code: 200, data: { content: 'merged', content_version: 2 } }) }; });
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
