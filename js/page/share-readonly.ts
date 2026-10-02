/** Lock document input while leaving selection, scrolling and chart interaction intact. */
export function createSharedReadOnlyGuard(container: HTMLElement) {
    let locked = false;
    const original = new Map<Element, { editable?: string; readonly?: boolean; disabled?: boolean }>();
    function apply() {
        if (!locked) return;
        container.dataset.sharedReadonly = 'true';
        container.classList.remove('vditor-readonly');
        // A file-open loading layer must not survive into the shared reading surface.
        document.getElementById('fileSwitchLoadingOverlay')?.remove();
        container.querySelectorAll('.vditor-readonly-mask, .vditor-mask').forEach(node => node.remove());
        container.querySelectorAll('[contenteditable]').forEach(node => {
            if (!original.has(node)) original.set(node, { editable: node.getAttribute('contenteditable')! });
            if (node.getAttribute('contenteditable') !== 'false') node.setAttribute('contenteditable', 'false');
        });
        container.querySelectorAll<HTMLInputElement>('textarea, input').forEach(node => {
            if (!original.has(node)) original.set(node, { readonly: node.readOnly, disabled: node.disabled });
            if (!node.readOnly) node.readOnly = true;
            if (node.matches('input[type="checkbox"], input[type="radio"]')) node.disabled = true;
        });
        container.querySelectorAll<HTMLButtonElement>('.vditor-toolbar button, .vditor-toolbar__item').forEach(node => {
            if (!original.has(node)) original.set(node, { disabled: node.disabled });
            if ('disabled' in node && !node.disabled) node.disabled = true;
        });
    }
    const blockInput = (event: Event) => { if (locked) { event.preventDefault(); event.stopImmediatePropagation(); } };
    const blockTaskToggle = (event: Event) => {
        if (locked && (event.target as Element)?.closest('input[type="checkbox"], input[type="radio"]')) blockInput(event);
    };
    const blockKeys = (event: KeyboardEvent) => {
        const shortcut = (event.ctrlKey || event.metaKey) && /^[vxzybiu]$/i.test(event.key);
        const typing = !event.ctrlKey && !event.metaKey && !event.altKey && (event.key.length === 1 || ['Backspace', 'Delete', 'Enter', 'Tab'].includes(event.key));
        if (locked && (shortcut || typing)) blockInput(event);
    };
    for (const type of ['beforeinput', 'paste', 'cut', 'drop']) container.addEventListener(type, blockInput, true);
    container.addEventListener('keydown', blockKeys, true);
    container.addEventListener('click', blockTaskToggle, true);
    const observer = new MutationObserver(apply);
    observer.observe(container, { childList: true, subtree: true, attributes: true, attributeFilter: ['contenteditable'] });
    function setLocked(value: boolean) {
        locked = value;
        if (locked) apply();
        else {
            delete container.dataset.sharedReadonly;
            for (const [node, state] of original) {
                if (state.editable !== undefined) node.setAttribute('contenteditable', state.editable);
                if (state.readonly !== undefined) (node as HTMLInputElement).readOnly = state.readonly;
                if (state.disabled !== undefined) (node as HTMLButtonElement).disabled = state.disabled;
            }
            original.clear();
        }
    }
    return { setLocked, destroy() {
        setLocked(false); observer.disconnect();
        for (const type of ['beforeinput', 'paste', 'cut', 'drop']) container.removeEventListener(type, blockInput, true);
        container.removeEventListener('keydown', blockKeys, true);
        container.removeEventListener('click', blockTaskToggle, true);
    } };
}
