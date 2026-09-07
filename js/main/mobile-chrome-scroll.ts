/**
 * Mobile editor chrome scroll behavior:
 * - Mobile web: bottom bar always visible; top bar hides on scroll down.
 * - Mobile native app (Tauri): original immersive mode — chrome hidden until near scroll bottom.
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

const SCROLL_DELTA_THRESHOLD = 8;
const BOTTOM_NEAR_THRESHOLD = 48;
const TOP_CHROME_SHOW_SCROLL_TOP = 20;

function resolveEditorScrollElement(): HTMLElement | null {
  const root = document.getElementById('vditor');
  if (!root) return null;

  const vditor = (window as Window & { vditor?: { vditor?: Record<string, { element?: HTMLElement }> } }).vditor?.vditor;
  if (vditor) {
    const modes = ['wysiwyg', 'ir', 'sv'] as const;
    for (let i = 0; i < modes.length; i++) {
      const element = vditor[modes[i]]?.element;
      if (element && element.scrollHeight > element.clientHeight + 2) {
        return element;
      }
    }
  }

  const queue: HTMLElement[] = [root];
  while (queue.length) {
    const el = queue.shift();
    if (!el) continue;
    const style = window.getComputedStyle(el);
    const scrollable =
      (style.overflowY === 'auto' || style.overflowY === 'scroll' || style.overflowY === 'overlay') &&
      el.scrollHeight > el.clientHeight + 2;
    if (scrollable) return el;
    for (let i = 0; i < el.children.length; i++) {
      const child = el.children[i];
      if (child instanceof HTMLElement) queue.push(child);
    }
  }

  const content = root.querySelector('.vditor-content');
  return content instanceof HTMLElement ? content : null;
}

export function installMobileChromeScroll(options: MobileChromeScrollOptions): MobileChromeScrollController {
  let boundEl: HTMLElement | null = null;
  let lastScrollTop = 0;
  let topToolbarHidden = false;
  let bindRetryTimer: ReturnType<typeof setTimeout> | null = null;

  function syncPlatformClass(): void {
    document.body.classList.toggle('mobile-web-chrome', options.isMobileWeb());
    document.body.classList.toggle('mobile-native-chrome', options.isMobileNative());
  }

  function setTopToolbarHidden(_hidden: boolean): void {
    // 已禁用：移动端下滑自动隐藏顶部工具栏在滚动时会触发高频 class 切换，
    // 在部分低端设备上造成明显卡顿。因此这里不再隐藏顶部工具栏，始终保持可见。
    if (topToolbarHidden) {
      topToolbarHidden = false;
      document.body.classList.remove('mobile-top-toolbar-hidden');
    }
  }

  function reset(): void {
    if (bindRetryTimer) {
      clearTimeout(bindRetryTimer);
      bindRetryTimer = null;
    }
    unbind();
    topToolbarHidden = false;
    document.body.classList.remove('mobile-fullscreen', 'mobile-top-toolbar-hidden');
    syncPlatformClass();
  }

  function onScroll(): void {
    if (!options.isEnabled()) return;

    const el = boundEl;
    if (!el) return;

    const scrollTop = el.scrollTop;
    const scrollHeight = el.scrollHeight;
    const clientHeight = el.clientHeight;
    const atBottom = scrollTop + clientHeight >= scrollHeight - BOTTOM_NEAR_THRESHOLD;
    const delta = scrollTop - lastScrollTop;

    if (options.isMobileNative()) {
      const immersive = scrollTop > TOP_CHROME_SHOW_SCROLL_TOP && !atBottom;
      document.body.classList.toggle('mobile-fullscreen', immersive);
      lastScrollTop = scrollTop;
      return;
    }

    if (!options.isMobileWeb()) {
      lastScrollTop = scrollTop;
      return;
    }

    document.body.classList.remove('mobile-fullscreen');

    if (Math.abs(delta) >= SCROLL_DELTA_THRESHOLD) {
      if (delta > 0 && scrollTop > TOP_CHROME_SHOW_SCROLL_TOP) {
        setTopToolbarHidden(true);
      } else if (delta < 0 || scrollTop <= TOP_CHROME_SHOW_SCROLL_TOP) {
        setTopToolbarHidden(false);
      }
    }

    lastScrollTop = scrollTop;
  }

  function unbind(): void {
    if (boundEl) {
      boundEl.removeEventListener('scroll', onScroll);
      boundEl = null;
    }
  }

  function bind(): void {
    syncPlatformClass();
    if (!options.isEnabled()) {
      reset();
      return;
    }

    unbind();

    const el = resolveEditorScrollElement();
    if (!el) {
      if (bindRetryTimer) clearTimeout(bindRetryTimer);
      bindRetryTimer = setTimeout(bind, 200);
      return;
    }

    boundEl = el;
    lastScrollTop = el.scrollTop;
    el.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  return {
    syncPlatformClass,
    bind,
    unbind,
    reset,
  };
}
