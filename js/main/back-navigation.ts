export interface BackNavigationOptions {
  getVisibleModalOverlays: () => Element[];
  closeOverlayByBackPress: (overlay: Element) => boolean;
}

/** Android-style double-back-to-exit on main editor screen. */
export function initBackNavigation(options: BackNavigationOptions): void {
  let lastBackTime = 0;

  function pushHistory(): void {
    window.history.pushState({ title: 'prevent' }, '', '');
  }

  pushHistory();

  window.addEventListener(
    'popstate',
    () => {
      const overlays = options.getVisibleModalOverlays();
      if (overlays.length) {
        const topOverlay = overlays[overlays.length - 1];
        const closed = options.closeOverlayByBackPress(topOverlay);
        if (closed) {
          pushHistory();
        }
        return;
      }

      const isMainScreen = !overlays.length && !(window as Window & { isFileManagementMode?: boolean }).isFileManagementMode;
      if (isMainScreen) {
        const currentTime = Date.now();
        if (currentTime - lastBackTime < 2000) {
          window.history.back();
        } else {
          lastBackTime = currentTime;
          showToast('再按一次离开本站');
          pushHistory();
        }
      }
    },
    false,
  );

  function showToast(msg: string): void {
    const div = document.createElement('div');
    div.innerHTML = msg;
    div.style.cssText = `
      position: fixed; bottom: 15%; left: 50%; transform: translateX(-50%);
      background: rgba(0,0,0,0.8); color: white; padding: 10px 20px;
      border-radius: 25px; z-index: 9999; font-size: 14px; white-space: nowrap;
    `;
    document.body.appendChild(div);
    setTimeout(() => {
      if (div.parentNode) {
        div.parentNode.removeChild(div);
      }
    }, 2000);
  }
}
