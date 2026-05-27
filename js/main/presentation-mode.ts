/** Fullscreen presentation mode for mobile editor. */

function resetMobileChromeScroll(): void {
  const reset = (window as Window & { resetMobileChromeScroll?: () => void }).resetMobileChromeScroll;
  if (typeof reset === 'function') reset();
}

export function enterPresentationMode(): void {
  resetMobileChromeScroll();
  const mobileToolbar = document.querySelector('.mobile-toolbar-container');
  const mobileBottomBar = document.querySelector('.mobile-bottom-bar');
  const editorContainer = document.querySelector('.editor-container');

  if (mobileToolbar) {
    (mobileToolbar as HTMLElement).style.display = 'none';
  }
  if (mobileBottomBar) {
    (mobileBottomBar as HTMLElement).style.display = 'none';
  }
  if (editorContainer) {
    const el = editorContainer as HTMLElement;
    el.style.top = '0';
    el.style.height = '100vh';
  }

  const docEl = document.documentElement;
  if (docEl.requestFullscreen) {
    void docEl.requestFullscreen();
  } else if ((docEl as HTMLElement & { webkitRequestFullscreen?: () => void }).webkitRequestFullscreen) {
    (docEl as HTMLElement & { webkitRequestFullscreen: () => void }).webkitRequestFullscreen();
  } else if ((docEl as HTMLElement & { msRequestFullscreen?: () => void }).msRequestFullscreen) {
    (docEl as HTMLElement & { msRequestFullscreen: () => void }).msRequestFullscreen();
  }

  document.addEventListener('fullscreenchange', handleFullscreenChange);
  document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
  document.addEventListener('msfullscreenchange', handleFullscreenChange);

  window.showMessage(
    window.i18n ? window.i18n.t('presentationModeStarted') : '已进入演示模式，按 ESC 键退出',
    'info',
  );
}

export function exitPresentationMode(): void {
  const mobileToolbar = document.querySelector('.mobile-toolbar-container');
  const mobileBottomBar = document.querySelector('.mobile-bottom-bar');
  const editorContainer = document.querySelector('.editor-container');

  if (mobileToolbar) {
    (mobileToolbar as HTMLElement).style.display = '';
  }
  if (mobileBottomBar) {
    (mobileBottomBar as HTMLElement).style.display = '';
  }
  if (editorContainer) {
    const el = editorContainer as HTMLElement;
    el.style.top = '';
    el.style.height = '';
  }

  document.removeEventListener('fullscreenchange', handleFullscreenChange);
  document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
  document.removeEventListener('msfullscreenchange', handleFullscreenChange);

  const bind = (window as Window & { bindMobileChromeScroll?: () => void }).bindMobileChromeScroll;
  if (typeof bind === 'function') bind();

  window.showMessage(
    window.i18n ? window.i18n.t('presentationModeEnded') : '已退出演示模式',
    'info',
  );
}

function handleFullscreenChange(): void {
  const doc = document as Document & {
    webkitFullscreenElement?: Element | null;
    msFullscreenElement?: Element | null;
  };
  if (!doc.fullscreenElement && !doc.webkitFullscreenElement && !doc.msFullscreenElement) {
    exitPresentationMode();
  }
}
