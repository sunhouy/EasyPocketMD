/** Size the mobile file list from the visual viewport. */
export function installFileListLayout(): () => void {
    const sidebar = document.getElementById('fileListSidebar');
    if (!sidebar) return () => {};
    let frame = 0;
    const update = () => {
        frame = 0;
        const mobile = document.body.classList.contains('ui-mode-mobile') || document.body.classList.contains('tauri-mobile-safe-area');
        if (!mobile || document.body.classList.contains('file-management-mode')) { sidebar.style.removeProperty('max-height'); return; }
        if (!sidebar.classList.contains('show')) return;
        const viewport = window.visualViewport;
        const bottom = viewport ? viewport.offsetTop + viewport.height : window.innerHeight;
        const top = sidebar.getBoundingClientRect().top;
        sidebar.style.maxHeight = Math.max(0, bottom - top - 10) + 'px';
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    const mutation = new MutationObserver(schedule);
    mutation.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    mutation.observe(sidebar, { attributes: true, attributeFilter: ['class'] });
    window.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('scroll', schedule);
    schedule();
    return () => {
        cancelAnimationFrame(frame); mutation.disconnect();
        window.removeEventListener('resize', schedule);
        window.visualViewport?.removeEventListener('resize', schedule);
        window.visualViewport?.removeEventListener('scroll', schedule);
    };
}
