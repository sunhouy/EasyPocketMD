/** @jest-environment jsdom */
import { safeMerge } from '../../api/utils/safeMerge';
import { AutoSaveScheduler } from '../../js/files/autoSave';
import { persistFile, restoreFiles, syncStatus, refreshSyncIcons } from '../../js/files/sync/local-state';
import { SyncQueue } from '../../js/files/sync/queue';

describe('conservative offline merge', () => {
    it('combines separate paragraph edits', () => expect(safeMerge('alpha\nbeta\ngamma', 'ALPHA\nbeta\ngamma', 'alpha\nbeta\nGAMMA')).toEqual({ clean: true, content: 'ALPHA\nbeta\nGAMMA' }));
    it('never concatenates overlapping replacements', () => expect(safeMerge('shopping', 'buying', 'selling')).toEqual({ clean: false }));
    it('rejects different insertions at the same point', () => expect(safeMerge('ab', 'aXb', 'aYb')).toEqual({ clean: false }));
    it('deduplicates identical changes', () => expect(safeMerge('a', 'b', 'b')).toEqual({ clean: true, content: 'b' }));
    it('requires a base for different local and remote texts', () => expect(safeMerge(undefined, 'local', 'cloud')).toEqual({ clean: false }));
});
describe('offline journals and status', () => {
    beforeEach(() => localStorage.clear());
    it('restores pending edits and original merge base after reload', () => {
        persistFile({ id: 'a', content: 'offline edit', crdtBaseContent: 'original', isSynced: false, lastModified: Date.now() });
        const files = [{ id: 'a', content: 'original', lastModified: '2026-01-01T00:00:00Z' }]; restoreFiles(files);
        expect(files[0].content).toBe('offline edit'); expect((files[0] as any).crdtBaseContent).toBe('original');
    });
    it('uses supplied E2E serialization for the entire journal', () => {
        const serialize = jest.fn(() => '[{"id":"a","content":"cipher","crdtBaseContent":"cipher-base"}]');
        persistFile({ id: 'a', content: 'secret' }, serialize); expect(localStorage.getItem('epm-file:a')).not.toContain('secret');
    });
    it('distinguishes all states', () => {
        expect(syncStatus({}, false, false)).toBe('offline'); expect(syncStatus({}, false, true)).toBe('offline-dirty');
        expect(syncStatus({ syncConflict: true }, true, true)).toBe('conflict'); expect(syncStatus({ syncBusy: true }, true, true)).toBe('syncing');
        expect(syncStatus({ remoteContentVersion: 2, contentVersion: 1 }, true, false)).toBe('remote'); expect(syncStatus({}, true, false)).toBe('synced');
    });
    it('shows icon-only status and labels another-device local files', () => {
        document.body.innerHTML = '<a id="a_anchor">note</a>';
        refreshSyncIcons({ files: [{ id: 'a', type: 'file', localOriginDeviceId: 'elsewhere', localFileMode: 'remote', isSynced: true }] });
        expect(document.querySelector('.file-sync-icon')!.textContent).toBe(''); expect(document.querySelector('.file-local-label')!.textContent).toBe('本地非本机');
    });
});
describe('nonblocking autosave', () => {
    beforeEach(() => jest.useFakeTimers()); afterEach(() => jest.useRealTimers());
    it('does no extraction on input and coalesces draft writes', async () => {
        const persist = jest.fn(), save = jest.fn(async () => {});
        const scheduler = new AutoSaveScheduler({ current: () => 'a', dirty: () => true, persist, save, debounceMs: 1000, forceMs: 5000 });
        for (let i = 0; i < 100; i++) scheduler.trigger(); expect(persist).not.toHaveBeenCalled();
        jest.advanceTimersByTime(250); expect(persist).toHaveBeenCalledTimes(1); scheduler.clear();
    });
    it('saves during continuous typing rather than resetting the force deadline', async () => {
        const save = jest.fn(async () => {});
        const scheduler = new AutoSaveScheduler({ current: () => 'a', dirty: () => true, persist: () => {}, save, debounceMs: 1000, forceMs: 5000 });
        for (let i = 0; i < 10; i++) { scheduler.trigger(); jest.advanceTimersByTime(500); }
        expect(save).toHaveBeenCalledTimes(1); scheduler.clear(); await Promise.resolve(); scheduler.clear();
    });
    it('prioritizes selected documents over pending background files', async () => {
        const queue = new SyncQueue(), order: string[] = [];
        const a = queue.enqueue('background', 0, async () => { order.push('background'); });
        const b = queue.enqueue('selected', 100, async () => { order.push('selected'); });
        await jest.runAllTimersAsync(); await Promise.all([a, b]); expect(order).toEqual(['selected', 'background']);
    });
});

test('a draft journal never reverts a completed folder move', () => {
    persistFile({ id: 'moving', name: 'old/a.md', content: 'draft', lastModified: 100 });
    const files = [{ id: 'moving', name: 'new/a.md', content: 'old', lastModified: 100 }]; restoreFiles(files);
    expect(files[0].name).toBe('new/a.md'); expect(files[0].content).toBe('draft');
});

test('falls back to IndexedDB if localStorage is full', async () => {
    const saveFile = jest.fn(async () => {}); (window as any).IndexedDBManager = { saveFile };
    const spy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    try { expect(() => persistFile({ id: 'quota', content: 'offline' })).not.toThrow(); expect(saveFile).toHaveBeenCalledWith('epm-file:quota', expect.stringContaining('offline'), 'application/json'); }
    finally { spy.mockRestore(); delete (window as any).IndexedDBManager; }
});
