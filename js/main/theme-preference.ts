export type ThemeMode = 'light' | 'dark' | 'system';
const COOKIE = 'epmd_theme';
const isMode = (value: unknown): value is ThemeMode => ['light', 'dark', 'system'].includes(String(value));

export function readThemeMode(settings: { themeMode?: string }): ThemeMode {
    const cookie = document.cookie.split(';').map(part => part.trim()).find(part => part.startsWith(COOKIE + '='));
    const value = cookie?.slice(COOKIE.length + 1);
    if (isMode(value)) return value;
    if (isMode(settings.themeMode)) return settings.themeMode;
    const legacy = localStorage.getItem('vditor_night_mode');
    return legacy === 'true' ? 'dark' : legacy === 'false' ? 'light' : 'system';
}

export function rememberThemeMode(settings: { themeMode?: string }, mode: ThemeMode) {
    settings.themeMode = mode;
    document.cookie = COOKIE + '=' + mode + '; Max-Age=31536000; Path=/; SameSite=Lax' + (location.protocol === 'https:' ? '; Secure' : '');
    // Desktop shells and browsers with cookies disabled retain the same choice.
    try { localStorage.setItem('vditor_settings', JSON.stringify(settings)); } catch { /* Cookie still remembers the mode. */ }
}

export function isNightTheme(mode: ThemeMode): boolean {
    return mode === 'dark' || (mode === 'system' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches);
}
