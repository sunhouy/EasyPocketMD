/** @jest-environment jsdom */
// @ts-nocheck
export {};
describe('Android SAF bridge routing', () => {
    let invoke, fs;
    const uri = 'content://com.android.externalstorage.documents/document/primary%3ADownload%2Fnote.md';
    beforeEach(() => {
        invoke = jest.fn(async () => ({ success: true }));
        fs = { readTextFile: jest.fn(), writeTextFile: jest.fn(), mkdir: jest.fn() };
        window.__TAURI__ = { core: { invoke }, fs, dialog: { open: jest.fn() } };
        jest.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Android');
        jest.isolateModules(() => require('../../js/tauri-bridge'));
    });
    afterEach(() => { delete window.__TAURI__; delete window.electron; delete window.desktopRuntime; });
    it('keeps the granted content URI when reading', async () => {
        await window.electron.readLocalFile(uri);
        expect(invoke).toHaveBeenCalledWith('read_local_file', { filePath: uri });
        expect(fs.readTextFile).not.toHaveBeenCalled();
    });
    it('writes through the document provider without creating filesystem directories for the URI', async () => {
        await window.electron.writeLocalFile(uri, '# edit');
        expect(invoke).toHaveBeenCalledWith('write_local_file', { filePath: uri, content: '# edit' });
        expect(fs.mkdir).not.toHaveBeenCalled(); expect(fs.writeTextFile).not.toHaveBeenCalled();
    });
    it('uses the app picker which requests durable read/write document access', async () => {
        await window.electron.openLocalFileDialog();
        expect(invoke).toHaveBeenCalledWith('open_local_file_dialog', {});
        expect(window.__TAURI__.dialog.open).not.toHaveBeenCalled();
    });
});
