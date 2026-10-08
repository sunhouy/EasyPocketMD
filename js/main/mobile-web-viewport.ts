/** Keep mobile web chrome inside the visible viewport when the keyboard opens. */
export function syncMobileWebViewport(enabled: boolean): void {
    const viewport = enabled ? window.visualViewport : null;
    // Browser zoom should keep its normal panning behavior.
    const useViewport = viewport && viewport.scale === 1;
    const top = useViewport ? Math.max(0, viewport.offsetTop) : 0;
    const bottom = useViewport ? Math.max(0, window.innerHeight - viewport.height - top) : 0;
    document.documentElement.style.setProperty('--mobile-web-viewport-top', `${top}px`);
    document.documentElement.style.setProperty('--keyboard-inset-bottom', `${bottom}px`);
}
