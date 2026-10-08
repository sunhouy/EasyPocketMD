/** @jest-environment jsdom */
import { syncMobileWebViewport } from '../../js/main/mobile-web-viewport';
import { installMobileChromeScroll } from '../../js/main/mobile-chrome-scroll';

describe('mobile web toolbar viewport', () => {
    const originalViewport = Object.getOwnPropertyDescriptor(window, 'visualViewport');
    afterEach(() => {
        if (originalViewport) Object.defineProperty(window, 'visualViewport', originalViewport);
        else delete (window as any).visualViewport;
        document.body.className = '';
        document.documentElement.removeAttribute('style');
    });
    const viewport = (height: number, offsetTop = 0, scale = 1) => {
        Object.defineProperty(window, 'visualViewport', { configurable: true, value: { height, offsetTop, scale } });
    };
    const value = (name: string) => document.documentElement.style.getPropertyValue(name);

    it('keeps room for both bars when the keyboard resizes and pans the viewport', () => {
        viewport(window.innerHeight - 300, 40);
        syncMobileWebViewport(true);
        expect(value('--mobile-web-viewport-top')).toBe('40px');
        expect(value('--keyboard-inset-bottom')).toBe('260px');
        viewport(window.innerHeight);
        syncMobileWebViewport(true);
        expect(value('--mobile-web-viewport-top')).toBe('0px');
        expect(value('--keyboard-inset-bottom')).toBe('0px');
    });

    it('resets offsets for native/desktop modes, browser zoom and missing viewport support', () => {
        viewport(window.innerHeight - 300, 30);
        syncMobileWebViewport(true);
        syncMobileWebViewport(false);
        expect(value('--keyboard-inset-bottom')).toBe('0px');
        expect(value('--mobile-web-viewport-top')).toBe('0px');
        viewport(300, 30, 2);
        syncMobileWebViewport(true);
        expect(value('--keyboard-inset-bottom')).toBe('0px');
        Object.defineProperty(window, 'visualViewport', { configurable: true, value: undefined });
        syncMobileWebViewport(true);
        expect(value('--mobile-web-viewport-top')).toBe('0px');
    });

    it('clears old scroll hiding state for web and native editor modes', () => {
        let native = false;
        const chrome = installMobileChromeScroll({ isMobileWeb: () => !native, isMobileNative: () => native, isEnabled: () => true });
        document.body.className = 'ui-mode-mobile mobile-fullscreen mobile-top-toolbar-hidden';
        chrome.bind();
        expect(document.body.classList.contains('mobile-web-chrome')).toBe(true);
        expect(document.body.classList.contains('mobile-fullscreen')).toBe(false);
        expect(document.body.classList.contains('mobile-top-toolbar-hidden')).toBe(false);
        native = true;
        chrome.reset();
        expect(document.body.classList.contains('mobile-web-chrome')).toBe(false);
        expect(document.body.classList.contains('mobile-native-chrome')).toBe(true);
    });
});
