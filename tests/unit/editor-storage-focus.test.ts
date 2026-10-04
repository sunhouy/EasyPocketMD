/** @jest-environment jsdom */
// @ts-nocheck
import { materializeParentFolders } from '../../js/files/tree/parent-folders';
import { recordCodeBlockExit } from '../../js/code-block-focus';
import { restoreFiles, restoreFileFromDB } from '../../js/files/sync/local-state';
require('../../js/appLifecycle');

describe('Storage quota and code block focus regressions', () => {
    beforeEach(() => {
        localStorage.clear();
        window.files = [{ id: 'current', name: 'large.md', type: 'file', content: 'old', lastModified: 0 }];
        window.currentFileId = 'current'; window.vditor = { getValue: () => 'latest draft' };
        window.unsavedChanges = { current: true }; window.currentUser = null;
        window.draftRecovery = { backupNow: jest.fn(), clearDraft: jest.fn() };
        window.IndexedDBManager = { saveFile: jest.fn(async () => {}) };
        delete window.e2eSerializeFiles;
    });
    it('emergency save journals the current file without rewriting the entire workspace', () => {
        const original = Storage.prototype.setItem;
        const writes = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(function(key, value) {
            if (key === 'vditor_files') throw new DOMException('quota', 'QuotaExceededError');
            return original.call(this, key, value);
        });
        expect(window.appLifecycle.emergencySave()).toBe(true);
        expect(writes.mock.calls.some(([key]) => key === 'vditor_files')).toBe(false);
        const reloaded = [{ id: 'current', content: 'old', lastModified: 0 }]; restoreFiles(reloaded);
        expect(reloaded[0].content).toBe('latest draft');
    });
    it('retains dirty state during IndexedDB fallback and restores the journal after reload', async () => {
        let stored;
        window.IndexedDBManager.saveFile = jest.fn(async (_, data) => { stored = data; });
        jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('quota', 'QuotaExceededError'); });
        expect(window.appLifecycle.emergencySave()).toBe(false);
        expect(window.unsavedChanges.current).toBe(true);
        await Promise.resolve();
        const file = { id: 'current', content: 'old', lastModified: 0 };
        await restoreFileFromDB(file, { getFile: async () => ({ data: stored }) });
        expect(file.content).toBe('latest draft');
    });
    it('does not serialize plaintext when encrypted journals are used', () => {
        window.e2eSerializeFiles = jest.fn(() => '[{"content":"EPMD2:cipher"}]');
        window.appLifecycle.emergencySave();
        expect(localStorage.getItem('epm-file:current')).not.toContain('latest draft');
    });
    it('creates reusable real folders for every level and rejects file-parent collisions atomically', () => {
        const files = [];
        expect(materializeParentFolders(files, 'docs/notes/item.md').map(item => item.name)).toEqual(['docs', 'docs/notes']);
        expect(files.every(file => file.type === 'folder' && file.id)).toBe(true);
        expect(materializeParentFolders(files, 'docs/notes/second.md')).toEqual([]);
        const collision = [{ name: 'a/b', type: 'file' }];
        expect(() => materializeParentFolders(collision, 'a/b/c.md')).toThrow('Parent path');
        expect(collision).toHaveLength(1);
    });
    it('synchronizes every automatically materialized folder as its own record', async () => {
        const { installSyncRuntime } = await import('../../js/files/sync-runtime');
        const app = { files: [], currentUser: { username: 'owner', token: 'token' }, customAlert: jest.fn() };
        const runtime = installSyncRuntime(app, {}, {});
        app.syncFileToServer = jest.fn();
        expect(runtime.ensureParentFolders('docs/notes/new.md')).toBe(true);
        expect(app.syncFileToServer.mock.calls.map(([id]) => app.files.find(file => file.id === id).name)).toEqual(['docs', 'docs/notes']);
        expect(runtime.ensureParentFolders('docs/notes/another.md')).toBe(true);
        expect(app.syncFileToServer).toHaveBeenCalledTimes(2);
    });
    it('backs up drafts to IndexedDB even when localStorage has no space and makes them recoverable', async () => {
        const { draftRecoveryApi } = await import('../../js/draftRecovery');
        let stored;
        window.appSessionId = 'writing-session';
        window.IndexedDBManager = { saveDraft: jest.fn(async draft => { stored = draft; }), getAllDrafts: async () => stored ? [stored] : [] };
        jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('quota', 'QuotaExceededError'); });
        draftRecoveryApi.backupNow(); await Promise.resolve();
        expect(stored.content).toBe('latest draft');
        window.appSessionId = 'after-reload'; window.unsavedChanges = {};
        const status = await draftRecoveryApi.checkDraftRecoveryStatus();
        expect(status.hasDraft).toBe(true);
        expect(draftRecoveryApi.getDraftInfo().fileId).toBe('current');
    });
    it('lets a filename input acquire focus when leaving a CodeMirror selection', () => {
        document.body.innerHTML = '<div id="code" contenteditable="true"><span>code</span></div><input id="filename">';
        const host = document.getElementById('code'), input = document.getElementById('filename');
        const range = document.createRange(); range.selectNodeContents(host.querySelector('span'));
        document.getSelection().removeAllRanges(); document.getSelection().addRange(range);
        const snapshot = jest.fn(() => { if (document.getSelection().rangeCount && host.contains(document.getSelection().getRangeAt(0).startContainer)) host.focus(); });
        recordCodeBlockExit(host, { vditor: { undo: { addToUndoStack: snapshot } } });
        input.focus(); input.value = 'docs/new.md';
        expect(document.activeElement).toBe(input); expect(snapshot).toHaveBeenCalledTimes(1);
        // Clicking an already focused external input must also remain safe.
        recordCodeBlockExit(host, { vditor: { undo: { addToUndoStack: snapshot } } });
        expect(document.activeElement).toBe(input);
    });
});
