export interface BackNavigationOptions {
  getVisibleModalOverlays: () => Element[];
  closeOverlayByBackPress: (overlay: Element) => boolean;
  prefersFileListHome?: () => boolean;
}

/** Keep Android WebView history armed while closing application surfaces. */
export function initBackNavigation(options: BackNavigationOptions): void {
  let lastBackTime = 0;
  const pushHistory = () => window.history.pushState({ title: 'prevent' }, '', '');
  pushHistory();
  window.addEventListener('popstate', () => {
    const overlays = options.getVisibleModalOverlays();
    if (overlays.length) {
      const top = overlays.map((element, index) => ({ element, index, z: Number.parseInt(getComputedStyle(element).zIndex, 10) || 0 }))
        .sort((a, b) => a.z - b.z || a.index - b.index).pop()!;
      // Even a protected or asynchronously closing dialog must consume back.
      options.closeOverlayByBackPress(top.element);
      lastBackTime = 0;
      pushHistory();
      return;
    }
    const app = window as any;
    if (options.prefersFileListHome?.()) {
      lastBackTime = 0;
      if (app.isFileManagementMode) {
        // The list is the root surface: allow native/browser navigation to leave.
        window.history.back();
      } else {
        app.enterFileManagementMode?.({ refresh: true });
        pushHistory();
      }
      return;
    }
    if (app.isFileManagementMode || document.getElementById('fileListSidebar')?.classList.contains('show')) {
      app.enterEditorMode?.();
      document.getElementById('fileListSidebar')?.classList.remove('show');
      lastBackTime = 0;
      pushHistory();
      return;
    }
    const now = Date.now();
    if (lastBackTime && now - lastBackTime < 2000) {
      window.history.back();
      return;
    }
    lastBackTime = now;
    const toast = document.createElement('div');
    toast.textContent = app.i18n?.getLanguage() === 'en' ? 'Press back again to leave' : '再按一次退出';
    toast.style.cssText = 'position:fixed;bottom:15%;left:50%;transform:translateX(-50%);background:#000c;color:white;padding:10px 20px;border-radius:25px;z-index:100100;white-space:nowrap;';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2000);
    pushHistory();
  });
}
