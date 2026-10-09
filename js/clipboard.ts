/** Copy plain text even in WebViews or browsers without Clipboard API access. */
export async function copyText(text: string): Promise<void> {
    if (navigator.clipboard?.writeText) {
        try { await navigator.clipboard.writeText(text); return; } catch { /* Try the legacy path. */ }
    }
    const active = document.activeElement as HTMLElement | null;
    const inputSelection = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement
        ? { start: active.selectionStart, end: active.selectionEnd, direction: active.selectionDirection } : null;
    const selection = document.getSelection();
    const ranges = selection ? Array.from({length: selection.rangeCount}, (_, i) => selection.getRangeAt(i).cloneRange()) : [];
    const input = document.createElement('textarea');
    input.value = text; input.readOnly = true; input.setAttribute('aria-label', 'Copy');
    input.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none;font-size:16px;';
    (active?.closest('[role="dialog"],.modal-overlay.show') || document.body).append(input);
    try {
        input.focus({preventScroll: true}); input.select(); input.setSelectionRange(0, text.length);
        if (!document.execCommand?.('copy')) throw new Error('Clipboard unavailable');
    } finally {
        input.remove();
        if (active?.isConnected) active.focus({preventScroll: true});
        if (inputSelection && (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) && inputSelection.start !== null) {
            active.setSelectionRange(inputSelection.start, inputSelection.end, inputSelection.direction || undefined);
        } else if (selection) {
            selection.removeAllRanges();
            ranges.filter(range => range.startContainer.isConnected && range.endContainer.isConnected).forEach(range => selection.addRange(range));
        }
    }
}
