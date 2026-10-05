/** @jest-environment jsdom */
// @ts-nocheck
import { showSyncConflict } from '../../js/files/sync/conflict';
let close;
beforeAll(() => {
    window.files = []; window.currentFileId = null; window.lastSyncedContent = {}; window.unsavedChanges = {}; window.pendingServerSync = {};
    window.$ = { fn: {} }; window.showMessage = jest.fn(); window.removeModal = modal => modal.remove();
    window.wasmTextEngineGateway = { isReady: () => true, diff: (left, right) => left === right ? [{ type: 'same', left, right }] : [{ type: 'removed', left, right: '' }, { type: 'added', left: '', right }], merge3: () => ({ code: 200, data: { mergedText: 'merged', conflictCount: 0, hasConflict: false } }) };
    require('../../js/files/runtime-core');
});
afterEach(() => { document.getElementById('fileDiffResultModal')?.closeComparison?.(); });
it('uses named columns, the existing styled toolbar, and resolves local/cloud choices without writing a second file', async () => {
    const resolve = jest.fn(async () => {});
    await showSyncConflict(window, { id: 'note', name: 'note.md', type: 'file' }, 'local', 'cloud', resolve);
    const modal = document.getElementById('fileDiffResultModal');
    expect(modal.querySelector('#fileDiffLeftHeader').textContent).toBe('本地：note.md');
    expect(modal.querySelector('#fileDiffRightHeader').textContent).toBe('云端：note.md');
    expect(modal.querySelector('#fileDiffSmartMergeBtn')).not.toBeNull(); expect(modal.querySelector('#fileDiffResolveBtn')).not.toBeNull();
    const cloud = [...modal.querySelectorAll('#fileDiffToolbar button')].find(b => b.textContent === '使用云端');
    cloud.click(); await Promise.resolve(); await Promise.resolve();
    expect(resolve).toHaveBeenCalledWith('cloud'); expect(window.files).toHaveLength(0);
});
it('reuses smart merge and applies its result through the sync resolver', async () => {
    const resolve = jest.fn(async () => {});
    await showSyncConflict(window, { id: 'note', name: 'note.md', type: 'file' }, 'local', 'cloud', resolve);
    document.getElementById('fileDiffSmartMergeBtn').click(); await Promise.resolve(); await Promise.resolve();
    expect(resolve).toHaveBeenCalledWith('merged');
});
