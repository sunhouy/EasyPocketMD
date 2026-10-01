export const DEFAULT_THEME_COLOR = '#4a90e2';

export function normalizeThemeColor(value: unknown): string {
    return typeof value === 'string' && /^#[\da-f]{6}$/i.test(value) ? value.toLowerCase() : DEFAULT_THEME_COLOR;
}

export function applyThemeColor(value: unknown) {
    const color = normalizeThemeColor(value);
    document.documentElement.classList.toggle('custom-theme-color', color !== DEFAULT_THEME_COLOR);
    const style = document.documentElement.style;
    const properties = ['--theme-accent', '--theme-accent-hover', '--theme-accent-deep', '--theme-accent-rgb', '--theme-accent-light'];
    properties.forEach(property => style.removeProperty(property));
    if (color === DEFAULT_THEME_COLOR) return;
    const rgb = [1, 3, 5].map(offset => parseInt(color.slice(offset, offset + 2), 16));
    const shade = (factor: number) => '#' + rgb.map(channel => Math.round(channel * factor).toString(16).padStart(2, '0')).join('');
    style.setProperty('--theme-accent', color);
    style.setProperty('--theme-accent-hover', shade(0.82));
    style.setProperty('--theme-accent-deep', shade(0.65));
    style.setProperty('--theme-accent-rgb', rgb.join(', '));
    style.setProperty('--theme-accent-light', '#' + rgb.map(channel => Math.round(channel + (255 - channel) * 0.45).toString(16).padStart(2, '0')).join(''));
}

export function createThemeColorControls() {
    const input = document.getElementById('themeColorInput') as HTMLInputElement;
    document.getElementById('themeColorResetBtn')!.addEventListener('click', () => { input.value = DEFAULT_THEME_COLOR; });
    return {
        open(value: unknown) { input.value = normalizeThemeColor(value); },
        get() { return normalizeThemeColor(input.value); }
    };
}
