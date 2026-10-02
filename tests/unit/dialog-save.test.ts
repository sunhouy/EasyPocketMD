/** @jest-environment jsdom */
import { afterDialogPaint, saveAfterDialogOpens } from '../../js/ui/dialog-save';

describe('saving after opening a dialog', () => {
    let frame: FrameRequestCallback;
    beforeEach(() => {
        jest.useFakeTimers();
        jest.spyOn(document, 'hidden', 'get').mockReturnValue(false);
        window.requestAnimationFrame = jest.fn(callback => { frame = callback; return 1; });
    });
    afterEach(() => jest.useRealTimers());
    it('does not wait for a slow save and allows a paint before starting it', async () => {
        const app = { currentFileId: 'a', saveCurrentFile: jest.fn(() => new Promise(() => {})) };
        saveAfterDialogOpens(app);
        expect(app.saveCurrentFile).not.toHaveBeenCalled();
        frame(0);
        expect(app.saveCurrentFile).not.toHaveBeenCalled();
        await jest.runOnlyPendingTimersAsync();
        expect(app.saveCurrentFile).toHaveBeenCalledWith(false);
    });
    it('does not save the wrong file if it changes before the frame', async () => {
        const app = { currentFileId: 'a', saveCurrentFile: jest.fn() };
        saveAfterDialogOpens(app); app.currentFileId = 'b'; frame(0);
        await jest.runOnlyPendingTimersAsync();
        expect(app.saveCurrentFile).not.toHaveBeenCalled();
    });
    it('surfaces background save errors', async () => {
        jest.spyOn(console, 'error').mockImplementation(() => {});
        const app = { currentFileId: 'a', saveCurrentFile: jest.fn(() => Promise.reject(new Error('offline'))), showMessage: jest.fn() };
        saveAfterDialogOpens(app); frame(0); await jest.runOnlyPendingTimersAsync();
        expect(app.showMessage).toHaveBeenCalledWith('保存失败: offline', 'error');
    });
});
