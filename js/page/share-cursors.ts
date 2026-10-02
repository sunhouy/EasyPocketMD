import { createCursorMapper } from './cursor-mapper';
import { getVditorEditableElement } from '../editor-cursor';
import DiffMatchPatch from 'diff-match-patch';
const diff = new DiffMatchPatch();
const palette = ['#2563eb', '#059669', '#b45309', '#dc2626', '#7c3aed', '#db2777'];
export const cursorColor = (id: string) => palette[Array.from(id).reduce((n, c) => n + c.charCodeAt(0), 0) % palette.length];
export function contentFingerprint(text: string) {
    let value = 2166136261;
    for (let i = 0; i < text.length; i++) value = Math.imul(value ^ text.charCodeAt(i), 16777619);
    return (value >>> 0).toString(16);
}
export function pointAtTextOffset(root: HTMLElement, offset: number) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node: Node | null, last: Node | null = null, remaining = Math.max(0, offset);
    while ((node = walker.nextNode())) {
        last = node;
        if (remaining <= (node.textContent || '').length) return { node, offset: remaining };
        remaining -= (node.textContent || '').length;
    }
    return last ? { node: last, offset: (last.textContent || '').length } : { node: root as Node, offset: 0 };
}
function markedSnapshot(instance: any, node: Node, offset: number) {
    const root = getVditorEditableElement(instance);
    if (!root || !root.contains(node)) return null;
    const path: number[] = []; let current: Node = node;
    while (current !== root) { path.unshift(Array.from(current.parentNode!.childNodes).indexOf(current as ChildNode)); current = current.parentNode!; }
    const clone = root.cloneNode(true) as HTMLElement;
    let target: Node = clone; for (const index of path) target = target.childNodes[index];
    const marker = 'EPMCURSOR' + Math.random().toString(36).slice(2) + 'END';
    const insertion = document.createRange(); insertion.setStart(target, offset); insertion.collapse(true);
    insertion.insertNode(document.createTextNode(marker));
    return { html: root.innerHTML, marked: clone.innerHTML, marker };
}
export function markdownOffsetAt(instance: any, node: Node, offset: number): number | null {
    const root = getVditorEditableElement(instance);
    if (!root || !root.contains(node)) return null;
    if (instance.vditor.currentMode === 'sv') { const range = document.createRange(); range.selectNodeContents(root); range.setEnd(node, offset); return range.toString().length; }
    const snapshot = markedSnapshot(instance, node, offset); if (!snapshot) return null;
    const lute = instance.vditor.lute;
    const converted = instance.vditor.currentMode === 'ir' ? lute.VditorIRDOM2Md(snapshot.marked) : lute.VditorDOM2Md(snapshot.marked);
    const index = converted.indexOf(snapshot.marker); if (index < 0) return null;
    const withoutMarker = converted.replace(snapshot.marker, '');
    return diff.diff_xIndex(diff.diff_main(withoutMarker, instance.getValue()), index);
}
export function anchorCursorOffset(cursor: any, markdown: string) {
    const expected = Math.min(markdown.length, cursor.markdown_offset);
    const context = (cursor.context_before || '') + (cursor.context_after || '');
    if (!context) return expected;
    let position = markdown.indexOf(context), best = -1, distance = Infinity;
    while (position >= 0) {
        const candidate = position + (cursor.context_before || '').length;
        if (Math.abs(candidate - expected) < distance) { best = candidate; distance = Math.abs(candidate - expected); }
        position = markdown.indexOf(context, position + 1);
    }
    return best < 0 ? null : best;
}
export function createShareCursors(getState: () => any, getEditor: () => any, send: (payload: any) => boolean, onEdit: () => void) {
    const mapper = createCursorMapper();
    let revision = 0;
    const cursors = new Map<string, any>();
    const pointCache = new Map<string, any>();
    const layer = document.createElement('div'); layer.className = 'share-cursor-layer'; layer.setAttribute('aria-hidden', 'true'); document.body.appendChild(layer);
    let timer: any = null, frame = 0, stopped = false;
    async function capture() {
        timer = null;
        const state = getState(), editor = getEditor(), root = getVditorEditableElement(editor);
        if (!state?.canEdit || !root) return;
        if (Array.isArray(state.onlineUsers) && state.onlineUsers.every((user: any) => user.viewer_id === state.viewerId)) return;
        const selection = document.getSelection();
        if (!selection?.rangeCount || !root.contains(selection.focusNode)) { send({ type: 'cursor', cursor: null }); return; }
        const epoch = revision;
        const prefix = document.createRange(); prefix.selectNodeContents(root); prefix.setEnd(selection.focusNode!, selection.focusOffset);
        const textOffset = prefix.toString().length;
        let offset: number | null, source: string;
        try {
            if (editor.vditor.currentMode === 'sv') { offset = textOffset; source = editor.getValue(); }
            else {
                const snapshot = markedSnapshot(editor, selection.focusNode!, selection.focusOffset); if (!snapshot) return;
                const result = await mapper.convert(editor, snapshot.html, snapshot.marked, snapshot.marker);
                source = result.source; const index = result.converted!.indexOf(snapshot.marker); if (index < 0) return;
                const withoutMarker = result.converted!.replace(snapshot.marker, '');
                offset = withoutMarker === source ? index : diff.diff_xIndex(diff.diff_main(withoutMarker, source), index);
            }
        } catch { return; }
        if (epoch !== revision || stopped || editor !== getEditor() || !getState()?.canEdit) return;
        send({ type: 'cursor', cursor: { markdown_offset: offset, text_offset: textOffset,
            mode: editor.vditor.currentMode, content_version: state.contentVersion, fingerprint: contentFingerprint(source),
            context_before: source.slice(Math.max(0, offset - 40), offset), context_after: source.slice(offset, offset + 40) } });
    }
    function scheduleCapture(event?: Event) { if (event?.type === 'input') { clearTimeout(timer); timer = null; } if (!timer && getState()?.canEdit) timer = setTimeout(capture, 350); }
    async function render() {
        frame = 0; if (stopped) return;
        const instance = getEditor(), root = getVditorEditableElement(instance); layer.replaceChildren();
        if (!root || !cursors.size) return;
        const box = root.getBoundingClientRect();
        Object.assign(layer.style, { left: Math.max(0, box.left) + 'px', top: Math.max(0, box.top) + 'px', width: Math.max(0, Math.min(innerWidth, box.right) - Math.max(0, box.left)) + 'px', height: Math.max(0, Math.min(innerHeight, box.bottom) - Math.max(0, box.top)) + 'px' });
        const epoch = revision;
        let source: string;
        try { source = instance.vditor.currentMode === 'sv' ? instance.getValue() : (await mapper.convert(instance, root.innerHTML)).source; }
        catch { return; }
        if (epoch !== revision || stopped || instance !== getEditor()) return;
        const fingerprint = contentFingerprint(source);
        for (const [id, remote] of cursors) {
            if (Date.now() - remote.seen > 30000) { cursors.delete(id); pointCache.delete(id); continue; }
            const cursor = remote.cursor;
            let point;
            if (cursor.mode === instance.vditor.currentMode && cursor.fingerprint === fingerprint) point = pointAtTextOffset(root, cursor.text_offset);
            else {
                const offset = anchorCursorOffset(cursor, source); if (offset === null) continue;
                const cached = pointCache.get(id);
                if (cached?.fingerprint === fingerprint && cached.mode === instance.vditor.currentMode && cached.offset === offset && cached.root === root && root.contains(cached.point.node)) point = cached.point;
                else {
                    try {
                        let low = 0, high = (root.textContent || '').length;
                        while (low < high) {
                            const mid = Math.floor((low + high) / 2), candidate = pointAtTextOffset(root, mid);
                            const snapshot = markedSnapshot(instance, candidate.node, candidate.offset); if (!snapshot) break;
                            const result = await mapper.convert(instance, snapshot.html, snapshot.marked, snapshot.marker);
                            if (epoch !== revision || stopped) return;
                            const mapped = result.converted!.indexOf(snapshot.marker); if (mapped < 0) break;
                            if (mapped < offset) low = mid + 1; else high = mid;
                        }
                        point = pointAtTextOffset(root, low);
                    } catch { continue; }
                    if (point) pointCache.set(id, { fingerprint, mode: instance.vditor.currentMode, offset, root, point });
                }
            }
            if (!point) continue;
            const range = document.createRange(); range.setStart(point.node, point.offset); range.collapse(true);
            let rect = range.getBoundingClientRect();
            if (!rect.height && point.node.nodeType === Node.TEXT_NODE && point.offset > 0) {
                range.setStart(point.node, point.offset - 1); range.setEnd(point.node, point.offset);
                const previous = range.getBoundingClientRect(); rect = { left: previous.right, right: previous.right, top: previous.top, bottom: previous.bottom, height: previous.height } as DOMRect;
            }
            if (!rect.height || rect.bottom < box.top || rect.top > box.bottom || rect.left < box.left || rect.left > box.right) continue;
            const caret = document.createElement('div'); caret.className = 'share-remote-caret'; caret.dataset.viewerId = id;
            caret.style.setProperty('--cursor-color', cursorColor(id));
            Object.assign(caret.style, { left: rect.left - Math.max(0, box.left) + 'px', top: rect.top - Math.max(0, box.top) + 'px', height: rect.height + 'px' });
            const name = document.createElement('span'); name.textContent = remote.viewer_name; caret.appendChild(name); layer.appendChild(caret);
        }
    }
    let renderTimer: any;
    const rerender = () => { clearTimeout(renderTimer); if (!stopped) renderTimer = setTimeout(render, 350); };
    const input = (event: Event) => { if (getVditorEditableElement(getEditor())?.contains(event.target as Node)) { revision++; onEdit(); scheduleCapture(event); rerender(); } };
    document.addEventListener('selectionchange', scheduleCapture);
    document.addEventListener('input', input, true);
    document.addEventListener('scroll', rerender, true); window.addEventListener('resize', rerender);
    const cleanupTimer = setInterval(() => { rerender(); scheduleCapture(); }, 5000);
    const observer = new MutationObserver(() => { revision++; rerender(); }); const container = document.getElementById('vditor'); if (container) observer.observe(container, { childList: true, subtree: true });
    return {
        receive(payload: any) {
            if (payload.viewer_id === getState()?.viewerId) return;
            if (!payload.cursor) { cursors.delete(payload.viewer_id); pointCache.delete(payload.viewer_id); }
            else cursors.set(payload.viewer_id, { ...payload, seen: Date.now() });
            rerender();
        },
        rerender, capture: scheduleCapture,
        destroy() { stopped = true; mapper.destroy(); clearTimeout(timer); clearInterval(cleanupTimer); cancelAnimationFrame(frame); clearTimeout(renderTimer); observer.disconnect(); layer.remove();
            document.removeEventListener('selectionchange', scheduleCapture); document.removeEventListener('input', input, true); document.removeEventListener('scroll', rerender, true); window.removeEventListener('resize', rerender); }
    };
}
