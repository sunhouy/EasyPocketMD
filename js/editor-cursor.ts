/** Preserve the active editing surface when background sync replaces Vditor's DOM. */
export function getVditorEditableElement(instance: any): HTMLElement | null {
    const internal = instance?.vditor;
    if (!internal) return null;
    // All three surfaces exist, including hidden ones. Use the current mode.
    const mode = internal.currentMode || internal.mode;
    if (mode) return internal[mode]?.element || null;
    const elements = [internal.ir?.element, internal.sv?.element, internal.wysiwyg?.element]
        .filter(Boolean) as HTMLElement[];
    return elements.find(element => element.contains(document.activeElement)) || elements[0] || null;
}

export function getDomSelectionOffsets(root: HTMLElement) {
    const selection = document.getSelection();
    if (!root || !selection?.rangeCount || !root.contains(selection.anchorNode) ||
        !root.contains(selection.focusNode)) return null;

    const range = selection.getRangeAt(0);
    // Ranges also handle positions on elements (empty paragraphs, block boundaries).
    const prefix = document.createRange();
    prefix.selectNodeContents(root);
    prefix.setEnd(range.startContainer, range.startOffset);
    const start = prefix.toString().length;
    prefix.setEnd(range.endContainer, range.endOffset);
    return {
        start,
        end: prefix.toString().length,
        backward: !range.collapsed && selection.anchorNode === range.endContainer &&
            selection.anchorOffset === range.endOffset
    };
}

export function setDomSelectionOffsets(root: HTMLElement, start: number, end: number, backward = false) {
    const selection = document.getSelection();
    if (!root || !selection) return false;
    const length = (root.textContent || '').length;
    start = Math.max(0, Math.min(length, start));
    end = Math.max(start, Math.min(length, end));
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    let offset = 0;
    let startSet = false;
    let endSet = false;
    let node: Node | null;
    while ((node = walker.nextNode())) {
        const nextOffset = offset + (node.nodeValue || '').length;
        if (!startSet && start <= nextOffset) {
            range.setStart(node, start - offset);
            startSet = true;
        }
        if (!endSet && end <= nextOffset) {
            range.setEnd(node, end - offset);
            endSet = true;
            break;
        }
        offset = nextOffset;
    }
    if (!startSet || !endSet) {
        range.selectNodeContents(root);
        range.collapse(false);
    }
    selection.removeAllRanges();
    selection.addRange(range);
    if (backward && typeof selection.setBaseAndExtent === 'function') {
        selection.setBaseAndExtent(range.endContainer, range.endOffset, range.startContainer, range.startOffset);
    }
    return true;
}

export function captureVditorCursor(instance: any) {
    const element = getVditorEditableElement(instance) as HTMLTextAreaElement | null;
    if (!element) return null;
    const snapshot: any = {
        element,
        wasFocused: element.contains(document.activeElement),
        scrollTop: element.scrollTop,
        scrollLeft: element.scrollLeft,
        windowX: window.pageXOffset,
        windowY: window.pageYOffset
    };
    if (typeof element.selectionStart === 'number' && typeof element.selectionEnd === 'number') {
        Object.assign(snapshot, {
            type: 'input', start: element.selectionStart, end: element.selectionEnd,
            direction: element.selectionDirection
        });
    } else {
        const offsets = getDomSelectionOffsets(element);
        if (offsets) Object.assign(snapshot, { type: 'dom', ...offsets });
    }
    return snapshot;
}

export function restoreVditorCursor(instance: any, snapshot: any) {
    if (!snapshot) return;
    const element = getVditorEditableElement(instance) as HTMLTextAreaElement | null;
    if (!element || element !== snapshot.element) return;
    if (snapshot.wasFocused) {
        element.focus({ preventScroll: true });
        if (snapshot.type === 'input') {
            const length = element.value.length;
            element.setSelectionRange(Math.min(length, snapshot.start), Math.min(length, snapshot.end), snapshot.direction);
        } else if (snapshot.type === 'dom') {
            setDomSelectionOffsets(element, snapshot.start, snapshot.end, snapshot.backward);
        }
    }
    element.scrollTop = snapshot.scrollTop;
    element.scrollLeft = snapshot.scrollLeft;
    window.scrollTo(snapshot.windowX, snapshot.windowY);
}

export function setVditorValuePreservingCursor(instance: any, content: string) {
    // Save acknowledgements and polling echoes must not rebuild an unchanged document.
    if (typeof instance.getValue === 'function' && instance.getValue() === content) return;
    const cursor = captureVditorCursor(instance);
    instance.setValue(content);
    // Vditor's setValue replaces the DOM synchronously. A delayed retry would rewind
    // subsequent typing, cursor movement, scrolling, or focus changes.
    restoreVditorCursor(instance, cursor);
}
