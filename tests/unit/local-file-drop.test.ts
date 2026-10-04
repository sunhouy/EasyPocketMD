/** @jest-environment jsdom */
// @ts-nocheck
import { captureDroppedFiles, manageDroppedFiles, bindFileListDrop, showDropChoice } from '../../js/files/external/drop';
const file = () => new File(['old text'], 'notes.md', { type: 'text/markdown' });
const handle = () => ({ kind: 'file', name: 'notes.md', queryPermission: jest.fn(async () => 'prompt'), requestPermission: jest.fn(async () => 'granted'), createWritable: jest.fn(), getFile: async () => ({ name: 'notes.md', text: async () => 'disk contents' }) });
it('captures writable handles during the drop event and binds an original instead of importing a copy', async () => {
    const original = handle(); const getter = jest.fn(() => Promise.resolve(original));
    const entries = captureDroppedFiles({ items: [{ kind: 'file', getAsFile: file, getAsFileSystemHandle: getter }] });
    expect(getter).toHaveBeenCalledTimes(1);
    const app = { openExternalLocalFileByPath: jest.fn(async () => true) };
    await manageDroppedFiles(entries, app);
    expect(original.requestPermission).toHaveBeenCalledWith({ mode: 'readwrite' });
    expect(app.openExternalLocalFileByPath.mock.calls[0][1]).toMatchObject({ localFileMode: 'browser-fsa', browserFileHandle: original, content: 'disk contents' });
});
it('does not register local files when write permission is denied', async () => {
    const original = handle(); original.requestPermission.mockResolvedValue('denied');
    const app = { openExternalLocalFileByPath: jest.fn() };
    await expect(manageDroppedFiles([{ file: file(), handle: Promise.resolve(original) }], app)).rejects.toThrow('permission');
    expect(app.openExternalLocalFileByPath).not.toHaveBeenCalled();
});
it('uses the existing native reader/writer on desktop and rejects read-only browser copies', async () => {
    const app = { electron: { readLocalFile: jest.fn(), writeLocalFile: jest.fn() }, openExternalLocalFileByPath: jest.fn(async () => true) };
    await manageDroppedFiles([{ file: file(), nativePath: '/notes.md', handle: Promise.resolve(null) }], app);
    expect(app.openExternalLocalFileByPath).toHaveBeenCalledWith('/notes.md');
    await expect(manageDroppedFiles([{ file: file(), handle: Promise.resolve(null) }], { openExternalLocalFileByPath: jest.fn() })).rejects.toThrow('cannot write');
});
it('offers import without touching originals and ignores internal tree drags', async () => {
    document.body.innerHTML = '<aside class="file-list-sidebar"><ul id="tree"></ul></aside>';
    const app = { files: [], importDroppedFiles: jest.fn(async () => {}) };
    bindFileListDrop(app);
    const internal = new Event('drop', { bubbles: true, cancelable: true }); Object.defineProperty(internal, 'dataTransfer', { value: { types: ['text/plain'] } });
    document.querySelector('#tree').dispatchEvent(internal); expect(internal.defaultPrevented).toBe(false);
    showDropChoice([{ file: file(), handle: Promise.resolve(null) }], 'docs', app);
    document.querySelector('#fileDropChoice button').click(); await Promise.resolve(); await Promise.resolve();
    expect(app.importDroppedFiles).toHaveBeenCalledWith([expect.any(File)], 'docs');
    expect(document.getElementById('fileDropChoice')).toBeNull();
});

it('writes successive edits through the bound original handle and reuses the same local record on another drop', async () => {
    const { installSyncRuntime } = await import('../../js/files/sync-runtime');
    localStorage.clear(); delete window.e2eSerializeFiles;
    let contents = 'old'; const writes = [];
    const original = handle(); original.queryPermission.mockResolvedValue('granted'); original.isSameEntry = async other => other === original;
    original.createWritable = jest.fn(async () => ({ write: async text => { contents = text; writes.push(text); }, close: async () => {} }));
    const app = { files: [], unsavedChanges: {}, lastSyncedContent: {}, showMessage: jest.fn() };
    const runtime = installSyncRuntime(app, {}, { loadFiles: jest.fn(), openFile: async () => {} });
    const preset = { success: true, name: 'notes.md', content: contents, localFileMode: 'browser-fsa', browserFileHandle: original };
    expect(await runtime.openExternalLocalFileByPath('browser://notes/one', preset)).toBe(true);
    const record = app.files[0];
    expect((await runtime.writeExternalLocalContent(record, 'first edit')).success).toBe(true);
    expect((await runtime.writeExternalLocalContent(record, 'second edit')).success).toBe(true);
    expect(contents).toBe('second edit'); expect(writes).toEqual(['first edit', 'second edit']);
    await runtime.openExternalLocalFileByPath('browser://notes/two', { ...preset, content: contents });
    expect(app.files).toHaveLength(1); expect(app.files[0].id).toBe(record.id);
});
