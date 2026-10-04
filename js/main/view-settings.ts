/** Update display settings without replacing the editor or losing its undo/caret state. */
interface ViewRuntime {
    nightMode: boolean;
    userSettings: Record<string, unknown>;
    isLongFileMode?: boolean;
    vditor?: { setTheme?: (theme: 'dark' | 'classic') => void; vditor?: any } | null;
    applyVditorThemes?: (settings: Record<string, unknown>) => void;
    syncThemeColor?: () => void;
}

export function applyEditorNightMode(runtime: ViewRuntime, enabled: boolean) {
    runtime.nightMode = enabled;
    document.body.classList.toggle('night-mode', enabled);
    try { localStorage.setItem('vditor_night_mode', String(enabled)); } catch { /* The explicit preference is also stored in a cookie. */ }
    const button = (document.getElementById('modeToggle') as HTMLButtonElement);
    if (button) button.innerHTML = '<i class="fas fa-' + (enabled ? 'sun' : 'moon') + '"></i>';
    const desktopButton = document.getElementById('desktopThemeToggleBtn');
    if (desktopButton) {
        desktopButton.innerHTML = '<i class="fas fa-' + (enabled ? 'sun' : 'moon') + '"></i>';
        const label = window.i18n?.t(enabled ? 'switchToDayMode' : 'switchToNightMode') || (enabled ? '切换到日间模式' : '切换到夜间模式');
        desktopButton.setAttribute('aria-label', label); desktopButton.title = label;
    }
    if (runtime.applyVditorThemes) runtime.applyVditorThemes(runtime.userSettings);
    else runtime.vditor?.setTheme?.(enabled ? 'dark' : 'classic');
    runtime.syncThemeColor?.();
}

export function applyEditorOutline(runtime: ViewRuntime, enabled: boolean) {
    runtime.userSettings.showOutline = enabled;
    localStorage.setItem('vditor_settings', JSON.stringify(runtime.userSettings));
    const editor = runtime.vditor?.vditor;
    if (editor && !runtime.isLongFileMode) {
        if (editor.options?.outline) editor.options.outline.enable = enabled;
        if (typeof editor.outline?.toggle === 'function') editor.outline.toggle(editor, enabled, false);
        else if (editor.outline?.element) editor.outline.element.style.display = enabled ? 'block' : 'none';
    }
    const checkbox = document.getElementById('showOutlineCheckbox') as HTMLInputElement | null;
    if (checkbox) checkbox.checked = enabled;
    (document.getElementById('desktopOutlineToggleBtn') as HTMLButtonElement)?.setAttribute('aria-pressed', String(enabled));
}
