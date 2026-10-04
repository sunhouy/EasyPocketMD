/** @jest-environment jsdom */
// @ts-nocheck
import { readThemeMode, rememberThemeMode, isNightTheme } from '../../js/main/theme-preference';
require('../../js/ui/common');
beforeEach(() => {
    localStorage.clear(); document.cookie = 'epmd_theme=; Max-Age=0; Path=/';
    window.matchMedia = jest.fn(() => ({ matches: true }));
    window.showMessage = jest.fn(); window.i18n = { t: key => key }; window.userSettings = { themeMode: 'system' }; window.nightMode = false;
    document.body.innerHTML = '<button id="modeToggle"></button><button id="desktopThemeToggleBtn"></button>';
});
it('restores the selected theme from cookies ahead of older local settings', () => {
    rememberThemeMode(window.userSettings, 'dark');
    expect(document.cookie).toContain('epmd_theme=dark');
    expect(readThemeMode({ themeMode: 'light' })).toBe('dark');
    rememberThemeMode(window.userSettings, 'system');
    expect(isNightTheme(readThemeMode({ themeMode: 'light' }))).toBe(true);
    window.matchMedia = () => ({ matches: false });
    expect(isNightTheme(readThemeMode({}))).toBe(false);
});
it('uses the same remembered preference and updates both buttons when toggled', () => {
    window.toggleNightMode();
    expect(readThemeMode({ themeMode: 'system' })).toBe('dark');
    expect(JSON.parse(localStorage.getItem('vditor_settings')).themeMode).toBe('dark');
    expect(document.querySelector('#desktopThemeToggleBtn .fa-sun')).not.toBeNull();
    window.toggleNightMode();
    expect(readThemeMode({ themeMode: 'system' })).toBe('light');
    expect(document.querySelector('#modeToggle .fa-moon')).not.toBeNull();
});
it('ignores corrupt cookies and falls back to shell local settings or the old preference', () => {
    document.cookie = 'epmd_theme=broken; Path=/';
    expect(readThemeMode({ themeMode: 'light' })).toBe('light');
    localStorage.setItem('vditor_night_mode', 'true');
    expect(readThemeMode({})).toBe('dark');
});
