import { textDiff } from './highlight';

export function visibleTextNodes(root: HTMLElement): Text[] {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), nodes: Text[] = [];
    while (walker.nextNode()) {
        const node = walker.currentNode as Text;
        if (!node.parentElement?.closest('svg, script, style, .vditor-wysiwyg__preview, .vditor-ir__preview, .katex, [data-render="1"]')) nodes.push(node);
    }
    return nodes;
}
export function liveTextRanges(roots: [HTMLElement, HTMLElement]): [Range[], Range[]] {
    const nodes = roots.map(visibleTextNodes);
    const parts = textDiff(nodes[0].map(node => node.data).join(''), nodes[1].map(node => node.data).join(''));
    return nodes.map((texts, index) => {
        let offset = 0;
        const changes: { start: number; end: number }[] = [];
        for (const part of parts) {
            if (part.kind === (index === 0 ? 1 : -1)) continue;
            if (part.kind) changes.push({ start: offset, end: offset + part.text.length });
            offset += part.text.length;
        }
        offset = 0; const ranges: Range[] = [];
        for (const node of texts) {
            const start = offset; offset += node.data.length;
            for (const change of changes) {
                if (change.start >= offset || change.end <= start) continue;
                const range = document.createRange(); range.setStart(node, Math.max(0, change.start - start)); range.setEnd(node, Math.min(node.data.length, change.end - start)); ranges.push(range);
            }
        }
        return ranges;
    }) as [Range[], Range[]];
}
/** Paint without inserting marks into editable DOM, undo history or saved Markdown. */
export function createLiveDecoration(host: HTMLElement, panes: [HTMLElement, HTMLElement]) {
    const id = 'epmd-diff-' + Math.random().toString(36).slice(2), names = [id + '-removed', id + '-added'];
    const css = document.createElement('style');
    css.textContent = `::highlight(${names[0]}){background-color:#efb0b0}::highlight(${names[1]}){background-color:#a5dcae}body.night-mode ::highlight(${names[0]}){background-color:#813c46}body.night-mode ::highlight(${names[1]}){background-color:#286746}`;
    host.append(css);
    const registry = (window as any).CSS?.highlights, Highlight = (window as any).Highlight;
    const layers = panes.map(pane => { const layer = document.createElement('div'); layer.className = 'diff-range-layer'; pane.append(layer); return layer; });
    return {
        needsScrollPaint: !registry || !Highlight,
        paint(roots: [HTMLElement, HTMLElement]) {
            const ranges = liveTextRanges(roots);
            ranges.forEach((items, index) => {
                if (registry && Highlight) { registry.set(names[index], new Highlight(...items)); return; }
                const box = panes[index].getBoundingClientRect(), fragment = document.createDocumentFragment();
                for (const range of items) for (const rect of Array.from(range.getClientRects?.() || [])) {
                    const span = document.createElement('span'); span.className = index ? 'diff-char-added' : 'diff-char-removed';
                    span.style.cssText = `left:${rect.left - box.left}px;top:${rect.top - box.top}px;width:${rect.width}px;height:${rect.height}px`; fragment.append(span);
                }
                layers[index].replaceChildren(fragment);
            });
            return ranges;
        },
        destroy() { names.forEach(name => registry?.delete(name)); css.remove(); layers.forEach(layer => layer.remove()); }
    };
}
