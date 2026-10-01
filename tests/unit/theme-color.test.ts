/** @jest-environment jsdom */
// @ts-nocheck
export {};
const { applyThemeColor, normalizeThemeColor, createThemeColorControls, DEFAULT_THEME_COLOR } = require('../../js/main/theme-color');

describe('theme color settings', () => {
    beforeEach(() => {
        document.documentElement.removeAttribute('style'); document.documentElement.className = '';
        document.body.innerHTML = '<input type="color" id="themeColorInput"><button id="themeColorResetBtn">Reset</button>';
    });
    it('keeps the color draft until save, then restores it from stored settings', () => {
        const controls = createThemeColorControls(); controls.open(null);
        const input = document.getElementById('themeColorInput'); input.value = '#cc3366';
        expect(controls.get()).toBe('#cc3366');
        expect(document.documentElement.style.getPropertyValue('--theme-accent')).toBe('');
        localStorage.setItem('vditor_settings', JSON.stringify({ themeColor: controls.get() }));
        const saved = JSON.parse(localStorage.getItem('vditor_settings'));
        controls.open(saved.themeColor); applyThemeColor(saved.themeColor);
        expect(controls.get()).toBe('#cc3366');
        expect(document.documentElement.style.getPropertyValue('--theme-accent')).toBe('#cc3366');
        expect(document.documentElement.style.getPropertyValue('--theme-accent-rgb')).toBe('204, 51, 102');
        expect(document.documentElement.style.getPropertyValue('--theme-accent-hover')).toBe('#a72a54');
    });
    it('restores every default shade when the default blue is saved', () => {
        const controls = createThemeColorControls(); controls.open('#cc3366'); applyThemeColor(controls.get());
        document.getElementById('themeColorResetBtn').click();
        expect(controls.get()).toBe(DEFAULT_THEME_COLOR);
        applyThemeColor(controls.get());
        expect(document.documentElement.classList.contains('custom-theme-color')).toBe(false);
        expect(document.documentElement.style.length).toBe(0);
    });
    it('rejects invalid colors and reopens with the saved value after cancellation', () => {
        expect(normalizeThemeColor('red; background:url(x)')).toBe(DEFAULT_THEME_COLOR);
        expect(normalizeThemeColor('#AABBCC')).toBe('#aabbcc');
        const controls = createThemeColorControls(); controls.open('#aabbcc');
        document.getElementById('themeColorInput').value = '#112233';
        controls.open('#aabbcc'); expect(controls.get()).toBe('#aabbcc');
    });
});
