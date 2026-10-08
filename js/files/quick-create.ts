export function quickDocumentPath(files: {name:string}[], parent = '', base = '新文档'): string {
    const names = new Set(files.map(file => file.name));
    for (let number = 1; ; number++) {
        const path = (parent ? parent + '/' : '') + base + number;
        if (!names.has(path)) return path;
    }
}
/** A held press creates once; its synthetic click must not open the creation sheet. */
export function bindFileCreationButton(button: HTMLElement, open: () => void, quick: () => void) {
    let timer: ReturnType<typeof setTimeout> | undefined, held = false, x = 0, y = 0;
    const cancel = () => { clearTimeout(timer); timer = undefined; button.classList.remove('file-press-active'); };
    button.addEventListener('pointerdown', event => {
        if (event.button !== 0 || !event.isPrimary && event.isPrimary !== undefined) return;
        cancel(); held = false; x = event.clientX; y = event.clientY;
        button.classList.add('file-press-active');
        timer = setTimeout(() => { cancel(); held = true; quick(); }, 550);
        button.setPointerCapture?.(event.pointerId);
    });
    button.addEventListener('pointermove', event => { if (Math.hypot(event.clientX-x,event.clientY-y)>12) cancel(); });
    button.addEventListener('pointerup', cancel);
    button.addEventListener('pointercancel', cancel);
    button.addEventListener('lostpointercapture', cancel);
    window.addEventListener('blur', cancel);
    document.addEventListener('visibilitychange', () => { if (document.hidden) cancel(); });
    button.addEventListener('contextmenu', event => event.preventDefault());
    button.addEventListener('click', event => { event.preventDefault();event.stopPropagation();if(held){held=false;return;}open(); });
}
