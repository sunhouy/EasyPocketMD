/** Size the mobile file list from the actual bottom toolbar and visual viewport. */
export function installFileListLayout(): () => void {
    const sidebar = document.getElementById('fileListSidebar');
    const bar = document.querySelector<HTMLElement>('.mobile-bottom-bar');
    if (!sidebar) return () => {};
    let frame = 0;
    const update = () => {
        frame = 0;
        const mobile = document.body.classList.contains('ui-mode-mobile') || document.body.classList.contains('tauri-mobile-safe-area');
        if (!mobile || document.body.classList.contains('file-management-mode')) { sidebar.style.removeProperty('max-height'); return; }
        if (!sidebar.classList.contains('show')) return;
        const viewport = window.visualViewport;
        const bottom = viewport ? viewport.offsetTop + viewport.height : window.innerHeight;
        const barRect = bar?.getBoundingClientRect();
        const boundary = barRect && barRect.height > 0 && barRect.top < bottom ? Math.min(bottom, barRect.top) : bottom;
        const top = sidebar.getBoundingClientRect().top;
        sidebar.style.maxHeight = Math.max(0, boundary - top - 10) + 'px';
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    const resize = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(schedule);
    if (bar) resize?.observe(bar);
    const mutation = new MutationObserver(schedule);
    mutation.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    mutation.observe(sidebar, { attributes: true, attributeFilter: ['class'] });
    if (bar) mutation.observe(bar, { attributes: true, attributeFilter: ['class', 'style'] });
    window.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('scroll', schedule);
    schedule();
    return () => {
        cancelAnimationFrame(frame); resize?.disconnect(); mutation.disconnect();
        window.removeEventListener('resize', schedule);
        window.visualViewport?.removeEventListener('resize', schedule);
        window.visualViewport?.removeEventListener('scroll', schedule);
    };
}
