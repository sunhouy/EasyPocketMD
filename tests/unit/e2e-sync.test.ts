/** @jest-environment jsdom */
// @ts-nocheck
export {};
require('../../js/translations');
window.i18n.setLanguage('zh');
let mockCallbacks;
jest.mock('../../js/files/websocket-sync', () => ({
    createWebSocketClient: callbacks => {
        mockCallbacks = callbacks;
        return { isConnected: () => true, send: jest.fn(), disconnect: jest.fn() };
    },
    createSyncThrottle: send => ({ schedule: send, cancel: jest.fn() })
}));
const { createSyncRuntimeApi } = require('../../js/files/sync');
const e2e = require('../../js/e2e');

function fixture(enabled = 1) {
    const file = { id: 'note', name: 'note.md', type: 'file', content: '# 正文', e2e_enabled: enabled };
    let editor = file.content;
    const app = { files: [file], currentFileId: 'note', currentUser: { username: 'user', token: 'token', password: 'secret' },
        lastSyncedContent: { note: 'old text' }, unsavedChanges: {}, pendingServerSync: {}, syncAllFiles: jest.fn(), showMessage: jest.fn() };
    const api = createSyncRuntimeApi({ globalRef: app, g: key => app[key], isExternalLocalFile: () => false,
        getCurrentEditorContent: () => editor, setEditorContentForFile: (_, value) => { editor = value; },
        markPendingServerSync: (id, pending) => { app.pendingServerSync[id] = pending; }, tryHandleTokenExpired: async () => false, isEn: () => false });
    return { file, app, api, edit: value => { editor = value; } };
}

describe('E2E save representations', () => {
    afterEach(() => jest.restoreAllMocks());
    it('encrypts the first websocket save and keeps its acknowledgement plaintext', async () => {
        const { api, app } = fixture();
        api.startAutoSync();
        try {
            await api.scheduleWebSocketSync('note');
            const sent = app.wsClient.send.mock.calls[0][0];
            expect(sent.content).not.toContain('正文');
            expect(await e2e.decrypt(sent.content, 'secret')).toBe('# 正文');
            expect(sent.base_content).toBeUndefined();
            await mockCallbacks.onFileSaved({ filename: 'note.md', content: sent.content, code: 200, content_version: 2, e2e_enabled: 1 });
            await api.waitForFileSync();
            expect(app.lastSyncedContent.note).toBe('# 正文');
            expect(app.unsavedChanges.note).toBe(false);
        } finally { api.stopAutoSync(); }
    });
    it('decrypts inactive remote documents and never stores ciphertext as display content', async () => {
        const { api, app, file } = fixture();
        app.currentFileId = 'another';
        api.startAutoSync();
        try {
            const cipher = await e2e.encrypt('remote plaintext', 'secret');
            await mockCallbacks.onFileUpdated({ filename: 'note.md', content: cipher, e2e_enabled: 1 });
            expect(file.content).toBe('remote plaintext');
            expect(JSON.parse(localStorage.getItem('vditor_files'))[0].content).toBe('remote plaintext');
        } finally { api.stopAutoSync(); }
    });
    it('retains edits made after an encrypted websocket save', async () => {
        const { api, app, edit } = fixture();
        api.startAutoSync();
        try {
            await api.scheduleWebSocketSync('note');
            const sent = app.wsClient.send.mock.calls[0][0];
            edit('newer draft');
            await mockCallbacks.onFileSaved({ filename: 'note.md', content: sent.content, code: 200 });
            expect(app.unsavedChanges.note).toBe(true);
            expect(app.pendingServerSync.note).toBe(true);
        } finally { api.stopAutoSync(); }
    });
    it('does not send a plaintext save when encryption fails', async () => {
        const { api, app } = fixture();
        app.currentUser.password = '';
        global.fetch = jest.fn();
        expect(await api.syncFileToServer('note')).toBe(false);
        expect(fetch).not.toHaveBeenCalled();
    });
    it('saves plaintext when disabling encryption and normalizes a stale ciphertext response', async () => {
        const { api, app, file } = fixture(0);
        const cipher = await e2e.encrypt('# 正文', 'secret');
        global.fetch = jest.fn(async (_, options) => {
            const request = JSON.parse(options.body);
            expect(request.e2e_enabled).toBe(0);
            expect(request.content).toBe('# 正文');
            return { json: async () => ({ code: 200, data: { content: cipher, e2e_enabled: 0, content_version: 2 } }) };
        });
        expect(await api.syncFileToServer('note')).toBe(true);
        expect(file.content).toBe('# 正文');
        expect(app.lastSyncedContent.note).toBe('# 正文');
    });
    it('rejects undecipherable content rather than returning encrypted code for the editor', async () => {
        const cipher = await e2e.encrypt('private text', 'secret');
        await expect(e2e.resolveFileContent(cipher, 'wrong', true)).rejects.toThrow('无法解密');
        await expect(e2e.resolveFileContent(cipher, '', false)).rejects.toThrow('无法解密');
    });
});

describe('initial upload of encrypted local drafts', () => {
    it('encrypts a recovered local draft without retaining a stale ciphertext display value', async () => {
        const { installSyncRuntime } = require('../../js/files/sync-runtime');
        const { app, file } = fixture(); app.currentFileId = null; file.isSynced = false;
        file.content = await e2e.encrypt('# 正文', 'secret');
        const rt = installSyncRuntime(app, {}, {}); const serverFiles = [];
        global.fetch = jest.fn(async (_, options) => {
            const request = JSON.parse(options.body);
            expect(request.e2e_enabled).toBe(1);
            expect(await e2e.decrypt(request.content, 'secret')).toBe('# 正文');
            return { json: async () => ({ code: 200, data: { content_version: 1 } }) };
        });
        await rt.uploadLocalOnlyFilesToServerIfNeeded([file], serverFiles);
        expect(fetch).toHaveBeenCalledTimes(1);
        expect(serverFiles[0].content).toBe('# 正文');
        expect(file.content).toBe('# 正文');
    });
    it('keeps a local encrypted draft unsynced when its key is unavailable', async () => {
        const { installSyncRuntime } = require('../../js/files/sync-runtime');
        const { app, file } = fixture(); app.currentFileId = null; file.isSynced = false; app.currentUser.password = '';
        const rt = installSyncRuntime(app, {}, {});
        global.fetch = jest.fn();
        await rt.uploadLocalOnlyFilesToServerIfNeeded([file], []);
        expect(fetch).not.toHaveBeenCalled(); expect(file.isSynced).toBe(false);
    });
});
