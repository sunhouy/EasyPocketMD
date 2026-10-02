/**
 * Keep editor toolbars visible while scrolling on both mobile web and Tauri.
 * Platform classes still provide native safe-area and web layout styling.
 */

export interface MobileChromeScrollController {
  syncPlatformClass: () => void;
  bind: () => void;
  unbind: () => void;
  reset: () => void;
}

export interface MobileChromeScrollOptions {
  isMobileWeb: () => boolean;
  isMobileNative: () => boolean;
  isEnabled: () => boolean;
}

export function installMobileChromeScroll(options: MobileChromeScrollOptions): MobileChromeScrollController {
  function syncPlatformClass(): void {
    document.body.classList.toggle('mobile-web-chrome', options.isMobileWeb());
    document.body.classList.toggle('mobile-native-chrome', options.isMobileNative());
  }

  function reset(): void {
    // Clear immersive state when returning to the editor or switching UI modes.
    document.body.classList.remove('mobile-fullscreen', 'mobile-top-toolbar-hidden');
    syncPlatformClass();
  }

  return {
    syncPlatformClass,
    // Scrolling no longer needs an event listener or editor-element retry timer.
    bind: reset,
    unbind: () => {},
    reset,
  };
}
