/** Back must consume visible transient surfaces before changing the underlying page. */
export const modalSurfaceSelector = [
    '#customDialogContainer', '.vakata-context', '.desktop-dropdown-content.show',
    '.mobile-dropdown-content.show', '.user-menu-dropdown.show', '#fileManagementFabRing.open',
    '[aria-modal="true"]', '.share-history-overlay', '.modal-overlay', '.mobile-action-sheet-overlay',
    '.insert-picker-modal', '.insert-dialog-modal', '.footnote-picker-modal', '.formula-picker-modal',
    '.chart-picker-modal', '.echarts-picker-modal'
].join(', ');
export function isVisibleModalSurface(element: Element): boolean {
    if (!element?.isConnected) return false;
    for (let parent: Element | null = element; parent && parent !== document.body; parent = parent.parentElement) {
        const style = getComputedStyle(parent);
        if ((parent as HTMLElement).hidden || style.display === 'none' || style.visibility === 'hidden') return false;
    }
    const style = getComputedStyle(element);
    return element.classList.contains('show') || style.opacity !== '0';
}
/** Use registered cancellation handlers so prompts resolve, rather than just hiding their DOM. */
export function dismissTransientSurface(overlay: Element): boolean {
    const close = (overlay as any).epmdCloseByBackPress;
    if (typeof close === 'function') {close();return true;}
    if (overlay.matches('#fileManagementFabRing')) {
        overlay.classList.remove('open');overlay.setAttribute('aria-hidden','true');
        document.getElementById('fileManagementFab')?.classList.remove('open');return true;
    }
    if (overlay.matches('.desktop-dropdown-content, .mobile-dropdown-content, .user-menu-dropdown')) {
        overlay.classList.remove('show');return true;
    }
    if (overlay.matches('.vakata-context')) {(window as any).$?.vakata?.context?.hide();return true;}
    return false;
}
