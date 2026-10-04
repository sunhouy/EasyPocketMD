/** Undo snapshots must not restore CodeMirror’s stale DOM range during blur. */
export function recordCodeBlockExit(host: HTMLElement, instance: any) {
    const selection = document.getSelection();
    if (selection?.rangeCount && host.contains(selection.getRangeAt(0).startContainer)) selection.removeAllRanges();
    instance?.vditor?.undo?.addToUndoStack(instance.vditor);
}
