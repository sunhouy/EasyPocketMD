export interface BackNavigationOptions {
  getVisibleModalOverlays: () => Element[];
  closeOverlayByBackPress: (overlay: Element) => boolean;
  prefersFileListHome?: () => boolean;
  returnFromFileList?: () => boolean;
}

/** Native Back routes app state; legacy WebViews retain the history guard. */
export function initBackNavigation(options: BackNavigationOptions): void {
  let lastBackTime = 0;
  const pushHistory = () => window.history.pushState({ title: 'prevent' }, '', '');
  const nativeHost = !!(window as any).__TAURI__ && /android/i.test(navigator.userAgent);
  const route = (native = nativeHost): boolean => {
    const rearm = () => { if (!native) pushHistory(); };
    const overlays = options.getVisibleModalOverlays();
    if (overlays.length) {
      const top = overlays.map((element, index) => ({ element, index, z: Number.parseInt(getComputedStyle(element).zIndex, 10) || 0 }))
        .sort((a, b) => a.z - b.z || a.index - b.index).pop()!;
      // Even a protected or asynchronously closing dialog must consume back.
      options.closeOverlayByBackPress(top.element);
      lastBackTime = 0;
      rearm();
      return true;
    }
    const menu = document.querySelector<HTMLElement>('.mobile-dropdown-content.show,.desktop-dropdown-content.show');
    if(menu){menu.classList.remove('show');lastBackTime=0;rearm();return true;}
    const currentApp = window as any;
    if (currentApp.fileListMultiSelectMode) {
      currentApp.exitFileListMultiSelectMode?.();lastBackTime = 0;rearm();return true;
    }
    if (options.returnFromFileList?.()) {
      lastBackTime = 0;
      rearm();
      return true;
    }
    const app = window as any;
    if (options.prefersFileListHome?.()) {
      if (app.isFileManagementMode) {
        // The list is the root surface: allow native/browser navigation to leave.
        if(native) {
          const now=Date.now();
          if(lastBackTime && now-lastBackTime<2000)return false;
          lastBackTime=now;
          app.showMessage?.(app.i18n?.getLanguage()==='en'?'Press back again to leave':'再按一次退出');
          return true;
        }
        window.history.back();
      } else {
        lastBackTime=0;
        app.enterFileManagementMode?.({ refresh: true });
        rearm();
      }
      return true;
    }
    if (app.isFileManagementMode || document.getElementById('fileListSidebar')?.classList.contains('show')) {
      app.enterEditorMode?.();
      document.getElementById('fileListSidebar')?.classList.remove('show');
      lastBackTime = 0;
      rearm();
      return true;
    }
    const now = Date.now();
    if (lastBackTime && now - lastBackTime < 2000) {
      if(!native)window.history.back();
      return false;
    }
    lastBackTime = now;
    const toast = document.createElement('div');
    toast.textContent = app.i18n?.getLanguage() === 'en' ? 'Press back again to leave' : '再按一次退出';
    toast.style.cssText = 'position:fixed;bottom:15%;left:50%;transform:translateX(-50%);background:#000c;color:white;padding:10px 20px;border-radius:25px;z-index:100100;white-space:nowrap;';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2000);
    rearm();return true;
  };
  const resetBack = () => {lastBackTime=0;};
  document.addEventListener('visibilitychange',resetBack);
  window.addEventListener('pageshow',resetBack);
  window.addEventListener('epmd-native-resume',resetBack);
  (window as any).epmdAndroidBack = () => route(true);
  let legacyInstalled=false;
  const legacy = () => {if(legacyInstalled)return;legacyInstalled=true;pushHistory();window.addEventListener('popstate',()=>route(false));};
  (window as any).enableLegacyAndroidBackRoute=legacy;
  if(!nativeHost)legacy();
}
