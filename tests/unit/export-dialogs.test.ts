/** @jest-environment jsdom */
// @ts-nocheck
export {};
const app = window;
require('../../js/ui/print');
require('../../js/ui/export');
require('../../js/files/runtime-core');

describe('immediate dialogs and PDF preview feedback', () => {
    let frames: Function[];
    const tick = async () => { for (const cb of frames.splice(0)) cb(0); await jest.runOnlyPendingTimersAsync(); };
    beforeEach(() => {
        jest.useFakeTimers(); document.body.innerHTML = ''; frames = [];
        jest.spyOn(document, 'hidden', 'get').mockReturnValue(false);
        window.requestAnimationFrame = jest.fn(cb => { frames.push(cb); return frames.length; });
        app.currentFileId = 'a'; app.files = [{ id: 'a', name: 'A.md', type: 'file' }, { id: 'b', name: 'B.md', type: 'file' }];
        app.vditor = { getValue: jest.fn(() => '# Latest text') };
        app.saveCurrentFile = jest.fn(() => new Promise(() => {}));
        app.showMessage = jest.fn(); app.customAlert = jest.fn(); app.escapeHtml = x => x;
        app.convertFormulasAndChartsToImages = jest.fn(async html => html);
        app.fetch = jest.fn(async () => ({ json: async () => ({ code: 200, data: '<h1>Latest text</h1>' }) }));
        app.generatePDF = jest.fn(async () => '/uploads/test.pdf');
        app.renderPDF = jest.fn(async (_url, el) => { el.innerHTML = '<canvas></canvas>'; });
    });
    afterEach(() => jest.useRealTimers());
    it('opens find, comparison and export without waiting for save', async () => {
        void app.showFindDialog();
        expect(document.querySelector('#findDialogHeader')).not.toBeNull();
        void app.showFileDiffDialog();
        expect(document.querySelector('#fileDiffSelectModal')).not.toBeNull();
        void app.exportContent();
        expect(document.body.textContent).toContain('导出格式');
        expect(app.saveCurrentFile).not.toHaveBeenCalled();
        await tick();
        expect(app.saveCurrentFile).toHaveBeenCalled();
        expect(document.querySelector('#fileDiffSelectModal')).not.toBeNull();
    });
    it('opens PDF preview feedback immediately from the preview button, even while save is pending', async () => {
        app.debounce = fn => fn;
        app.showPrintDialog('export-pdf', jest.fn());
        const button = document.querySelector('#exportPdfPreviewBtn');
        expect(button).not.toBeNull();
        button.click();
        expect(document.body.textContent).toContain('正在生成PDF预览');
        expect(app.saveCurrentFile).not.toHaveBeenCalled();
        document.querySelector('.modal-overlay button').click();
        for (const cb of frames.splice(0)) cb(0);
        await jest.advanceTimersByTimeAsync(0);
    });
    it('shows loading before reading content and keeps it visible during PDF rendering', async () => {
        let rendered;
        app.renderPDF = jest.fn((_url, el) => new Promise(resolve => { rendered = () => { el.innerHTML = '<canvas></canvas>'; resolve(); }; }));
        const pending = app.showPrintPreview({ bodyFontSize: 12 });
        expect(document.body.textContent).toContain('正在生成PDF预览');
        expect(app.vditor.getValue).not.toHaveBeenCalled();
        // Only run the paint timer; do not advance the 65-second timeout.
        for (const cb of frames.splice(0)) cb(0);
        await jest.advanceTimersByTimeAsync(0);
        expect(app.renderPDF).toHaveBeenCalled();
        expect(document.body.textContent).toContain('正在渲染PDF预览');
        rendered(); await pending;
        expect(document.querySelector('canvas')).not.toBeNull();
        expect(document.body.textContent).not.toContain('正在渲染PDF预览');
    });
    it('reports asynchronous render failures and removes loading', async () => {
        jest.spyOn(console, 'error').mockImplementation(() => {});
        app.renderPDF = jest.fn(async () => { throw new Error('corrupt PDF'); });
        const pending = app.showPrintPreview({ bodyFontSize: 13 });
        for (const cb of frames.splice(0)) cb(0);
        await jest.advanceTimersByTimeAsync(0); await pending;
        expect(app.customAlert).toHaveBeenCalledWith('预览失败: corrupt PDF');
        expect(document.querySelector('.modal-overlay')).toBeNull();
    });
    it('cancels before conversion if the loading dialog is closed', async () => {
        const pending = app.showPrintPreview({ bodyFontSize: 14 });
        document.querySelector('.modal-overlay button').click();
        for (const cb of frames.splice(0)) cb(0);
        await jest.advanceTimersByTimeAsync(0); await pending;
        expect(app.generatePDF).not.toHaveBeenCalled();
        expect(document.querySelector('.modal-overlay')).toBeNull();
    });
});
