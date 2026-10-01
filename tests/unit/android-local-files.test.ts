/** @jest-environment jsdom */
// @ts-nocheck
import { initBackNavigation } from '../../js/main/back-navigation';
import { ensureHandlePermission, createLocalHandleStore } from '../../js/files/external/handles';
import { normalizeExternalLocalFileRecord } from '../../js/files/external';
import { installSyncRuntime } from '../../js/files/sync-runtime';

jest.mock('../../js/files/websocket-sync', () => ({ createWebSocketClient: jest.fn(), createSyncThrottle: jest.fn() }));

function runtime(file, extras = {}) {
    const app = {
        files: [file], unsavedChanges: {}, pendingServerSync: {}, lastSyncedContent: {},
        currentUser: null, customConfirm: jest.fn(async () => false),
        showMessage: jest.fn(), syncFileToServer: jest.fn(async () => true), ...extras
    };
    const editor = { getCurrentEditorContent: (_, fallback) => fallback, setEditorContentForFile: jest.fn() };
    const hooks = { loadFiles: jest.fn() };
    return { app, editor, hooks, rt: installSyncRuntime(app, editor, hooks) };
}
const local = (extra = {}) => ({ id: 'local', name: 'note.md', type: 'file', content: 'cached',
    isExternalLocal: true, localFilePath: 'content://provider/document/primary%3Anote.md', localFileMode: 'tauri', ...extra });

describe('Android back navigation', () => {
    let back;
    beforeEach(() => {
        document.body.innerHTML = '';
        jest.useFakeTimers();
        jest.spyOn(window.history, 'pushState').mockImplementation(() => {});
        jest.spyOn(window.history, 'back').mockImplementation(() => {});
        jest.spyOn(window, 'addEventListener').mockImplementation((type, cb) => { if (type === 'popstate') back = cb; });
        window.isFileManagementMode = false;
    });
    afterEach(() => jest.useRealTimers());
    it('closes the top settings/dialog and rearms history even when closing is asynchronous', () => {
        const lower = document.createElement('div'), top = document.createElement('div');
        lower.style.zIndex = '10'; top.style.zIndex = '20';
        document.body.append(lower, top);
        const close = jest.fn(() => false);
        initBackNavigation({ getVisibleModalOverlays: () => [top, lower], closeOverlayByBackPress: close });
        back(); back();
        expect(close).toHaveBeenCalledWith(top);
        expect(window.history.back).not.toHaveBeenCalled();
        expect(window.history.pushState).toHaveBeenCalledTimes(3);
    });
    it('returns from file management to the editor before considering exit', () => {
        window.isFileManagementMode = true;
        window.enterEditorMode = jest.fn();
        initBackNavigation({ getVisibleModalOverlays: () => [], closeOverlayByBackPress: () => true });
        back();
        expect(window.enterEditorMode).toHaveBeenCalled();
        expect(window.history.back).not.toHaveBeenCalled();
    });
    it('requires two back presses on the home screen to leave', () => {
        initBackNavigation({ getVisibleModalOverlays: () => [], closeOverlayByBackPress: () => true });
        back(); expect(window.history.back).not.toHaveBeenCalled();
        back(); expect(window.history.back).toHaveBeenCalledTimes(1);
    });
});

describe('durable local file access and recovery', () => {
    beforeEach(() => localStorage.clear());
    it('does not treat a cached local document as successfully opened when permission fails', async () => {
        const file = local();
        const read = jest.fn(async () => ({ success: false, error: 'Permission denied' }));
        const { rt, app } = runtime(file, { electron: { readLocalFile: read } });
        expect(await rt.ensureExternalLocalAccess(file)).toBe(false);
        expect(read).toHaveBeenCalledTimes(2);
        expect(file.content).toBe('cached');
        expect(file.localAccessState).toBe('failed');
        expect(app.customConfirm).toHaveBeenCalledTimes(1);
    });
    it('refreshes disk content after validating edit access, preserving pending drafts', async () => {
        const file = local();
        const { rt, app } = runtime(file, { electron: { readLocalFile: async () => ({ success: true, content: 'disk' }) } });
        expect(await rt.ensureExternalLocalAccess(file)).toBe(true);
        expect(file.content).toBe('disk');
        app.unsavedChanges.local = true; file.content = 'draft';
        await rt.ensureExternalLocalAccess(file);
        expect(file.content).toBe('draft');
    });
    it('converts an inaccessible file only after explicit acceptance, retaining its recovery text', async () => {
        const file = local();
        const { rt, app } = runtime(file, { customConfirm: async () => true });
        expect(await rt.ensureExternalLocalAccess(file)).toBe(true);
        expect(file.isExternalLocal).toBe(false);
        expect(file.localFilePath).toBeUndefined();
        expect(file.content).toBe('cached');
        expect(JSON.parse(localStorage.getItem('vditor_files'))[0].content).toBe('cached');
        expect(app.syncFileToServer).not.toHaveBeenCalled();
    });
    it('handles rejected native writes with bounded retries and keeps recovery metadata', async () => {
        const file = local();
        const write = jest.fn(async () => { throw new Error('revoked'); });
        const { rt } = runtime(file, { electron: { writeLocalFile: write } });
        expect((await rt.writeExternalLocalContent(file, 'edited')).success).toBe(false);
        expect(write).toHaveBeenCalledTimes(2);
        expect(file.localAccessState).toBe('failed');
    });
    it('writes clean cloud changes to the original file before updating the local view', async () => {
        const file = local({ content: 'base', localSyncedContent: 'base', localCloudUsername: 'user' });
        const write = jest.fn(async () => ({ success: true }));
        const { rt } = runtime(file, { currentUser: { username: 'user' }, electron: {
            readLocalFile: async () => ({ success: true, content: 'base' }), writeLocalFile: write
        } });
        expect(await rt.applyExternalRemoteUpdate(file, { content: 'cloud', content_version: 2 })).toBe(true);
        expect(write).toHaveBeenCalledWith(file.localFilePath, 'cloud');
        expect(file.content).toBe('cloud'); expect(file.localSyncedContent).toBe('cloud');
    });
    it('never overwrites disk edits or a newer editor draft with a remote revision', async () => {
        const file = local({ content: 'draft', localSyncedContent: 'base', localCloudUsername: 'user' });
        const write = jest.fn();
        const { rt } = runtime(file, { currentUser: { username: 'user' }, electron: {
            readLocalFile: async () => ({ success: true, content: 'disk edit' }), writeLocalFile: write
        } });
        expect(await rt.applyExternalRemoteUpdate(file, { content: 'cloud' })).toBe(false);
        expect(write).not.toHaveBeenCalled(); expect(file.content).toBe('draft');
    });
    it('rechecks direct file permissions after reload without marking a cloud link unsynced prematurely', () => {
        const file = local({ isSynced: true }); normalizeExternalLocalFileRecord({}, file);
        expect(file.localAccessState).toBe('unverified'); expect(file.isSynced).toBe(true);
        const copy = local({ localFileMode: undefined }); normalizeExternalLocalFileRecord({}, copy);
        expect(copy.localAccessState).toBe('copy');
    });
    it('requests both read and write access and rejects readonly or missing browser handles', async () => {
        const handle = { getFile: jest.fn(), createWritable: jest.fn(), queryPermission: async () => 'prompt', requestPermission: jest.fn(async () => 'denied') };
        await expect(ensureHandlePermission(handle, false)).rejects.toThrow();
        expect(handle.requestPermission).not.toHaveBeenCalled();
        await expect(ensureHandlePermission(handle, true)).rejects.toThrow();
        expect(handle.requestPermission).toHaveBeenCalledWith({ mode: 'readwrite' });
        await expect(ensureHandlePermission(null, true)).rejects.toThrow();
        await expect(createLocalHandleStore(undefined).get('id')).rejects.toThrow();
    });
});
