/** @jest-environment jsdom */
// @ts-nocheck
import { showFileDetails, foldFileName, bindFileTreeLongPress } from '../../js/files/tree/details';
import { showSyncConflict } from '../../js/files/sync/conflict';
beforeEach(() => { document.body.innerHTML = ''; jest.useFakeTimers(); });
afterEach(() => jest.useRealTimers());
it('shows the complete safe path and real timestamps without inventing creation dates for old files', () => {
    const date = '2026-10-05T00:00:00Z';
    const dialog = showFileDetails({ files: [{ name: 'folder/a.md' }] }, { name: 'folder', type: 'folder', createdAt: date, lastModified: date });
    expect(dialog.textContent).toContain(new Date(date).toLocaleString()); expect(dialog.textContent).toContain('包含项目');
    dialog.querySelector('button').click(); expect(dialog.isConnected).toBe(false);
    const old = showFileDetails({}, { name: '<script>long/name</script>', type: 'file', lastModified: date });
    expect(old.textContent).toContain('未记录'); expect(old.querySelector('script')).toBeNull();
});
it('wraps long file names for ellipsis without dropping icons or menu controls', () => {
    const anchor = document.createElement('a'); anchor.innerHTML = '<i class="jstree-themeicon"></i>original<button>menu</button>';
    foldFileName(anchor, 'a very long document name'); foldFileName(anchor, 'a very long document name');
    expect(anchor.querySelectorAll('.file-node-name')).toHaveLength(1); expect(anchor.querySelector('button')).not.toBeNull();
    expect(anchor.querySelector('.file-node-name').title).toBe('a very long document name');
});
it('opens a file or folder menu on long press and cancels when scrolling', () => {
    const tree = document.createElement('div'); tree.innerHTML = '<a class="jstree-anchor">name</a>'; document.body.append(tree);
    const open = jest.fn(); bindFileTreeLongPress(tree, open);
    const pointer = (type, x) => { const event = new Event(type, { bubbles: true }); Object.assign(event, { pointerType: 'touch', button: 0, clientX: x, clientY: 20 }); tree.firstChild.dispatchEvent(event); };
    pointer('pointerdown', 10); jest.advanceTimersByTime(550); expect(open).toHaveBeenCalledTimes(1);
    pointer('pointerup', 10); pointer('pointerdown', 10); pointer('pointermove', 40); jest.advanceTimersByTime(600); expect(open).toHaveBeenCalledTimes(1);
});
it('routes cloud conflicts through the existing file comparison UI with named local/cloud sources', async () => {
    const compare = jest.fn(), resolve = jest.fn();
    await showSyncConflict({ __filesCoreHandlers: { showFileDiffComparison: compare } }, { id: 'a', name: 'note.md' }, 'local', 'cloud', resolve);
    expect(compare).toHaveBeenCalledWith(expect.objectContaining({ content: 'local', diffSource: 'local' }), expect.objectContaining({ content: 'cloud', diffSource: 'cloud', diffReadonly: true }), { syncConflict: { fileId: 'a', resolve, disk: undefined } });
    expect(document.getElementById('syncConflictPanel')).toBeNull();
});
