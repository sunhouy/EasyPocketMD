/** @jest-environment jsdom */
// @ts-nocheck
import { checkpointCurrentFile } from '../../js/files/sync/checkpoint';
import { restoreFiles } from '../../js/files/sync/local-state';
import { createSyncRuntimeApi } from '../../js/files/sync';
import { installEditorComposition } from '../../js/editor-composition';
jest.mock('../../js/e2e', () => ({ resolveFileContent: async content => content }));
require('../../js/appLifecycle');
beforeEach(() => {
    localStorage.clear(); jest.useFakeTimers();
    window.files = [{ id: 'note', name: 'note.md', type: 'file', content: 'original', contentLoaded: true, contentVersion: 1, crdtBaseContent: 'original', crdtBaseContentVersion: 1, isSynced: true }];
    window.currentFileId = 'note'; window.currentUser = { username: 'user', token: 'token' };
    window.unsavedChanges = { note: true }; window.pendingServerSync = {}; window.lastSyncedContent = { note: 'original' };
    window.getCurrentEditorContent = (_, fallback) => fallback;
    window.markPendingServerSync = (id, value) => { window.pendingServerSync[id] = value; };
    window.draftRecovery = null; window.IndexedDBManager = null;
    window.syncCurrentFileWithBeacon = jest.fn(() => true);
    window.saveCurrentFile = jest.fn(async () => true);
    window.appLifecycle.init();
});
afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); delete window.e2eSerializeFiles; });
it.each(['pagehide', 'beforeunload', 'blur'])('checkpoints synchronously on %s before cloud save work begins', event => {
    window.getCurrentEditorContent = () => 'latest committed text';
    window.syncCurrentFileWithBeacon = jest.fn(() => { expect(JSON.parse(localStorage.getItem('epm-file:note'))[0].content).toBe('latest committed text'); });
    window.saveCurrentFile = jest.fn(async () => { expect(window.files[0].content).toBe('latest committed text'); });
    window.dispatchEvent(new Event(event));
    expect(JSON.parse(localStorage.getItem('epm-file:note'))[0].content).toBe('latest committed text');
    expect(window.pendingServerSync.note).toBe(true);
});
it('checkpoints every hidden event even during the leave-save cooldown', () => {
    jest.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    window.getCurrentEditorContent = () => 'first'; document.dispatchEvent(new Event('visibilitychange'));
    window.getCurrentEditorContent = () => 'second'; document.dispatchEvent(new Event('visibilitychange'));
    expect(JSON.parse(localStorage.getItem('epm-file:note'))[0].content).toBe('second');
});
it('uses the saved document as fallback when the editor has not loaded instead of turning it blank', () => {
    window.getCurrentEditorContent = (_, fallback) => fallback;
    window.appLifecycle.emergencySave();
    expect(window.files[0].content).toBe('original');
});
it('persists only committed content when hiding during IME input', () => {
    document.body.innerHTML = '<div id="vditor"><div contenteditable="true"></div></div>';
    const cleanup = installEditorComposition(window);
    window.getCurrentEditorContent = () => 'unfinished pin yin';
    document.querySelector('[contenteditable]').dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    expect(checkpointCurrentFile(window)).toBe(true);
    expect(JSON.parse(localStorage.getItem('epm-file:note'))[0].content).toBe('original');
    cleanup();
});
it('retains an unacknowledged beacon payload across refresh and merges a newer local draft against its own cloud save', async () => {
    const file = window.files[0]; let editor = 'first save';
    const api = createSyncRuntimeApi({ globalRef: window, g: key => window[key], isExternalLocalFile: () => false,
        getCurrentEditorContent: () => editor, setEditorContentForFile: (_, value) => { editor = value; }, markPendingServerSync: window.markPendingServerSync });
    Object.defineProperty(navigator, 'sendBeacon', { configurable: true, value: jest.fn(() => {
        expect(JSON.parse(localStorage.getItem('epm-file:note'))[0]).toMatchObject({ content: 'first save', pendingCloudContent: 'first save', pendingCloudBaseVersion: 1 }); return true;
    }) });
    expect(api.syncCurrentFileWithBeacon()).toBe(true);
    const restored = { id: 'note', name: 'note.md', type: 'file', content: '', lastModified: 0 }; restoreFiles([restored]);
    window.files = [restored]; editor = 'second save';
    await window.reconcileRemoteFile(restored, { content: 'first save', content_version: 2 });
    expect(restored.syncConflict).not.toBe(true); expect(restored.content).toBe('second save');
    expect(restored.crdtBaseContent).toBe('first save'); expect(window.pendingServerSync.note).toBe(true);
    expect(restored.pendingCloudContent).toBe('first save'); delete navigator.sendBeacon;
});
it('still preserves a genuine simultaneous remote edit for review', async () => {
    const file = window.files[0]; file.pendingCloudContent = 'first save'; file.pendingCloudBaseVersion = 1; file.isSynced = false;
    createSyncRuntimeApi({ globalRef: window, g: key => window[key], isExternalLocalFile: () => false,
        getCurrentEditorContent: () => 'local edit', markPendingServerSync: window.markPendingServerSync });
    await window.reconcileRemoteFile(file, { content: 'other device edit', content_version: 2 });
    expect(file.syncConflict).toBe(true);
});
it('a workspace quota error cannot prevent the per-file checkpoint preceding a beacon', () => {
    const set = Storage.prototype.setItem;
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(function(key, value) { if (key === 'vditor_files') throw new DOMException('quota', 'QuotaExceededError'); return set.call(this, key, value); });
    const api = createSyncRuntimeApi({ globalRef: window, g: key => window[key], isExternalLocalFile: () => false,
        getCurrentEditorContent: () => 'saved locally first', markPendingServerSync: window.markPendingServerSync });
    Object.defineProperty(navigator, 'sendBeacon', { configurable: true, value: jest.fn(() => true) });
    expect(api.syncCurrentFileWithBeacon()).toBe(true);
    expect(JSON.parse(localStorage.getItem('epm-file:note'))[0].content).toBe('saved locally first'); delete navigator.sendBeacon;
});

it('recognizes the earlier WS save when a later leave-time payload has not reached the cloud yet', async () => {
    const file = window.files[0];
    Object.assign(file, { pendingCloudContent: 'second save', pendingCloudBaseVersion: 1, previousCloudContent: 'first save', previousCloudBaseVersion: 1, isSynced: false });
    createSyncRuntimeApi({ globalRef: window, g: key => window[key], isExternalLocalFile: () => false,
        getCurrentEditorContent: () => 'third edit', setEditorContentForFile: jest.fn(), markPendingServerSync: window.markPendingServerSync });
    await window.reconcileRemoteFile(file, { content: 'first save', content_version: 2 });
    expect(file.syncConflict).not.toBe(true); expect(file.content).toBe('third edit');
    expect(file.pendingCloudContent).toBe('second save');
});
