/** Native dialogs occupy the WebView viewport, above the app toolbar. */
export function applyNativeModalLayout(overlay: HTMLElement) {
    if (!overlay?.matches('.modal-overlay, .mobile-action-sheet-overlay')) return;
    // Keep dialogs outside editor/toolbars that create fixed-position containing blocks.
    if (overlay.parentElement !== document.body) document.body.appendChild(overlay);
    const set = (element: HTMLElement, key: string, value: string) => {
        if (element.style.getPropertyValue(key) !== value || element.style.getPropertyPriority(key) !== 'important') {
            element.style.setProperty(key, value, 'important');
        }
    };
    set(overlay, 'top', '0px'); set(overlay, 'bottom', '0px');
    set(overlay, 'z-index', '20000');
    const modal = overlay.querySelector<HTMLElement>('.modal');
    const full = overlay.id === 'settingsModalOverlay' || modal?.matches('.diff-modal, .history-modal, .file-diff-modal');
    if (full && modal) {
        set(overlay, 'padding', '0px');
        set(overlay, 'align-items', 'stretch');
        set(modal, 'height', '100%'); set(modal, 'max-height', '100%');
        set(modal, 'width', '100%'); set(modal, 'max-width', 'none');
        set(modal, 'margin', '0px'); set(modal, 'border-radius', '0px');
        // Insets protect content, while the dialog background covers the toolbar area.
        set(modal, 'padding-top', 'calc(var(--safe-area-top, 0px) + 16px)');
        set(modal, 'padding-bottom', 'calc(var(--safe-area-bottom, 0px) + 16px)');
    } else {
        set(overlay, 'padding-top', 'calc(var(--safe-area-top, 0px) + 10px)');
        set(overlay, 'padding-bottom', 'calc(var(--safe-area-bottom, 0px) + 10px)');
        if (modal) set(modal, 'max-height', 'calc(100% - var(--safe-area-top, 0px) - var(--safe-area-bottom, 0px) - 20px)');
    }
}
