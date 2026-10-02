/** Wrapped banners must reserve their measured height, including large Android fonts. */
export function observeNoticeHeight(banner: HTMLElement): void {
    const update = () => {
        const height = Math.ceil(banner.getBoundingClientRect().height);
        if (height > 0) document.documentElement.style.setProperty('--top-notice-height', height + 'px');
    };
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(update).observe(banner);
    window.addEventListener('resize', update);
    update();
}
