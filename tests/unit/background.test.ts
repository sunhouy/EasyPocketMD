/** @jest-environment jsdom */
// @ts-nocheck
export {};
const { applyBackground, createBackgroundControls, normalizeBackground, readBackgroundImage } = require('../../js/main/background');

describe('custom backgrounds', () => {
    beforeEach(() => {
        document.body.className = 'night-mode'; document.body.removeAttribute('style');
        document.body.innerHTML = '<select id="backgroundModeSelect"><option value="default">Default</option><option value="color">Color</option><option value="image">Image</option></select><input id="backgroundColorInput" type="color"><input id="backgroundImageInput" type="file"><div id="backgroundPreview"></div><div id="backgroundStatus"></div><button id="backgroundResetBtn">Reset</button>';
        localStorage.clear();
        URL.createObjectURL = jest.fn(() => 'blob:test'); URL.revokeObjectURL = jest.fn();
        window.i18n = { t: key => key };
    });
    it('persists a selected color and restores the theme default', () => {
        const controls = createBackgroundControls(); controls.open(null);
        const mode = document.getElementById('backgroundModeSelect'); mode.value = 'color'; mode.dispatchEvent(new Event('change'));
        const color = document.getElementById('backgroundColorInput'); color.value = '#315b81'; color.dispatchEvent(new Event('input'));
        expect(document.body.classList.contains('custom-background')).toBe(false);
        localStorage.setItem('vditor_settings', JSON.stringify({ background: controls.get() }));
        applyBackground(JSON.parse(localStorage.getItem('vditor_settings')).background);
        expect(document.body.style.getPropertyValue('--app-background-color')).toBe('#315b81');
        expect(document.body.classList.contains('night-mode')).toBe(true);
        document.getElementById('backgroundResetBtn').click(); applyBackground(controls.get());
        expect(document.body.classList.contains('custom-background')).toBe(false);
        expect(document.body.style.getPropertyValue('--app-background-color')).toBe('');
    });
    it('preserves a selected image when reopening settings and rejects external CSS URLs', () => {
        const value = { mode: 'image', color: '#123456', image: 'data:image/jpeg;base64,YWJj' };
        const controls = createBackgroundControls(); controls.open(value);
        expect(controls.get()).toEqual(value);
        applyBackground(value); expect(document.body.style.getPropertyValue('--app-background-image')).toContain('data:image/jpeg');
        expect(normalizeBackground({ mode: 'image', image: 'https://example.com/tracker.jpg' }).mode).toBe('default');
        expect(normalizeBackground({ mode: 'color', color: 'red; background:url(x)' }).color).toBe('#f5f7fa');
    });
    it('rejects unsupported files and oversized uploads', async () => {
        await expect(readBackgroundImage(new File(['svg'], 'image.svg', { type: 'image/svg+xml' }))).rejects.toThrow('backgroundInvalidImage');
        await expect(readBackgroundImage({ type: 'image/png', size: 11 * 1024 * 1024 })).rejects.toThrow('backgroundInvalidImage');
        expect(URL.createObjectURL).not.toHaveBeenCalled();
    });
    it('resizes and compresses images and releases their temporary URL', async () => {
        const OriginalImage = window.Image;
        window.Image = class { naturalWidth = 4000; naturalHeight = 3000; set src(value) { queueMicrotask(() => this.onload()); } };
        const context = { fillRect: jest.fn(), drawImage: jest.fn() };
        const ctx = jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context);
        const encode = jest.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,YWJj');
        try {
            expect(await readBackgroundImage(new File(['image'], 'photo.png', { type: 'image/png' }))).toContain('data:image/jpeg');
            expect(context.drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1600, 1200);
            expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test');
        } finally { window.Image = OriginalImage; ctx.mockRestore(); encode.mockRestore(); }
    });
    it('does not let an unfinished upload overwrite a reset', async () => {
        const OriginalImage = window.Image; let pending;
        window.Image = class { naturalWidth = 10; naturalHeight = 10; set src(value) { pending = this; } };
        const ctx = jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ fillRect() {}, drawImage() {} });
        const encode = jest.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,YWJj');
        try {
            const controls = createBackgroundControls(); controls.open(null);
            const input = document.getElementById('backgroundImageInput');
            Object.defineProperty(input, 'files', { value: [new File(['image'], 'photo.png', { type: 'image/png' })] }); input.dispatchEvent(new Event('change'));
            expect(controls.isLoading()).toBe(true);
            document.getElementById('backgroundResetBtn').click(); pending.onload();
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(controls.get().mode).toBe('default'); expect(controls.get().image).toBe(''); expect(controls.isLoading()).toBe(false);
        } finally { window.Image = OriginalImage; ctx.mockRestore(); encode.mockRestore(); }
    });
});
