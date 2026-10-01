import { marked } from 'marked';
import DiffMatchPatch from 'diff-match-patch';
import { groupDiffIntoHunks, RenderDiffViewOptions } from './index';
import { createLiveDecoration } from './live-decoration';
import { bindSynchronizedScroll, ScrollAnchor } from './scroll';

type Side = { label: string | (() => string); read(): string; write?(text: string): boolean | void };
type Options = RenderDiffViewOptions & { editorConstructor?: any; markdown?: boolean; editable?: boolean; computeDiff?(left: string, right: string): any[]; onDiff?(diff: any[]): void; onError?(error: Error): void };
const cdn = () => (window as any).electron || location.protocol === 'file:' ? './vditor' : '/vditor';

function lineDiff(left: string, right: string) {
    const engine = new DiffMatchPatch(), encoded = engine.diff_linesToChars_(left + '\n', right + '\n');
    const parts = engine.diff_main(encoded.chars1, encoded.chars2, false); engine.diff_charsToLines_(parts, encoded.lineArray);
    return parts.flatMap(([kind, text]: [number, string]) => text.slice(0, -1).split('\n').map(line => ({ type: kind === 0 ? 'same' : kind < 0 ? 'removed' : 'added', left: kind <= 0 ? line : '', right: kind >= 0 ? line : '' })));
}

/** One pair of native Vditor documents for both viewing and WYSIWYG/source editing. */
export function createDiffEditors(host: HTMLElement, sides: [Side, Side], onEdit?: () => void, initial: Options = {}) {
    let options: Options = { markdown: true, editable: true, collapseSame: false, ...initial };
    const instances: any[] = [], roots: HTMLElement[] = [], scrollers: HTMLElement[] = [];
    const panes = sides.map(() => { const pane = document.createElement('div'); pane.className = 'diff-edit-pane'; host.append(pane); return pane; }) as unknown as [HTMLElement, HTMLElement];
    const decoration = createLiveDecoration(host, panes);
    host.classList.add('diff-editors', 'diff-live-surface');
    let destroyed = false, generation = 0, frame = 0, diff: any[] = [], observers: MutationObserver[] = [], disconnectScroll: (() => void) | undefined;
    let resizeObserver: ResizeObserver | undefined;
    const values = sides.map(side => side.read()), composing = [false, false], dirty = [false, false], expanded = new Set<string>();
    let ready: Promise<void>;

    const label = (index: number) => typeof sides[index].label === 'function' ? (sides[index].label as () => string)() : sides[index].label as string;
    function queuePaint() { if (!destroyed) { cancelAnimationFrame(frame); frame = requestAnimationFrame(paint); } }
    function save(index: number, value: string) {
        if (destroyed || !options.editable || !sides[index].write || composing[index] || host.dataset.ready !== 'true') return;
        if (value === values[index]) { dirty[index] = false; queuePaint(); return; }
        if (sides[index].write!(value) === false) return;
        values[index] = value; dirty[index] = false; onEdit?.(); queuePaint();
    }
    function flush() {
        if (!options.editable) return;
        instances.forEach((instance, index) => { if (roots[index] && dirty[index]) { composing[index] = false; save(index, instance.getValue()); } });
    }
    function applyEditable() {
        instances.forEach((instance, index) => {
            if (!roots[index]) return;
            if (options.editable && sides[index].write) instance.enable(); else instance.disabled();
            panes[index].dataset.readonly = String(!options.editable || !sides[index].write);
            roots[index].setAttribute('aria-label', label(index)); roots[index].setAttribute('aria-readonly', String(!options.editable || !sides[index].write));
        });
    }
    function blocks(index: number) {
        const root = roots[index]; if (!root) return [];
        const nodes = Array.from(root.children).filter(node => (node as HTMLElement).hasAttribute('data-block')) as HTMLElement[];
        return nodes.filter(node => nodes.length === 1 || !!node.textContent?.replace(/\u200b/g, '').trim() || node.matches('hr') || !!node.querySelector('img, svg, audio, video'));
    }
    function annotate(index: number) {
        const map: number[] = [];
        diff.forEach((row, at) => { if (row.type !== (index ? 'removed' : 'added')) map.push(at); });
        const hunks = groupDiffIntoHunks(diff), resolved = new Set(options.resolvedHunkIds || []);
        const nodes = blocks(index);
        const tokenLines: { start: number; end: number }[] = [];
        let line = 0;
        if (options.markdown) {
            for (const token of marked.lexer(values[index], { gfm: true })) {
                const count = (token.raw.match(/\n/g) || []).length;
                if (token.type !== 'space') tokenLines.push({ start: line, end: line + (token.raw.replace(/\n+$/, '').match(/\n/g) || []).length });
                line += count;
            }
        }
        let sourceLine = 0;
        const runs: HTMLElement[][] = [];
        let run: HTMLElement[] = [];
        const foldRun = () => { if (run.length) runs.push(run); run = []; };
        nodes.forEach((node, at) => {
            const text = node.textContent || '';
            const range = options.markdown ? tokenLines[at] : { start: sourceLine, end: sourceLine + (text.replace(/\n+$/, '').match(/\n/g) || []).length };
            sourceLine += (text.match(/\n/g) || []).length;
            const start = map[range?.start ?? Math.max(0, map.length - 1)] ?? diff.length;
            const end = map[range?.end ?? Math.max(0, map.length - 1)] ?? start;
            const ids = hunks.filter(hunk => hunk.startIndex <= end && hunk.startIndex + hunk.items.length - 1 >= start).map(hunk => hunk.id);
            node.dataset.diffLine = range ? (range.start === range.end ? String(range.start + 1) : (range.start + 1) + '–' + (range.end + 1)) : '';
            node.dataset.diffStart = String(start); node.dataset.diffHunks = ids.join(' ');
            node.classList.toggle('diff-live-changed', ids.length > 0);
            node.classList.toggle('diff-live-active', !!options.markHunks && ids.includes(options.activeHunkId!));
            node.classList.toggle('diff-live-resolved', !!options.markHunks && ids.length > 0 && ids.every(id => resolved.has(id)));
            node.removeAttribute('data-diff-folded'); node.removeAttribute('data-diff-fold-start'); node.removeAttribute('data-diff-fold-label');
            if (ids.length) { foldRun(); } else run.push(node);
        });
        foldRun(); return runs;
    }
    function paint() {
        if (destroyed || !roots[0] || !roots[1] || composing.some(Boolean)) return;
        diff = (options.computeDiff || lineDiff)(values[0], values[1]);
        const runs = [annotate(0), annotate(1)];
        const caret = getSelection()?.anchorNode;
        if (options.editable && caret) runs.forEach(groups => groups?.forEach(group => {
            if (group.some(node => node.contains(caret))) expanded.add(group[0].dataset.diffStart!);
        }));
        runs.forEach(groups => groups?.forEach(group => {
            if (!options.collapseSame || expanded.has(group[0].dataset.diffStart!)) return;
            group.forEach(node => node.setAttribute('data-diff-folded', '1'));
            group[0].setAttribute('data-diff-fold-start', '1');
            group[0].setAttribute('data-diff-fold-label', (window as any).i18n?.getLanguage() === 'en' ? 'Unchanged content · click to expand' : '相同内容 · 点击展开');
        }));
        decoration.paint(roots as [HTMLElement, HTMLElement]); options.onDiff?.(diff);
    }
    function anchors(index: number): ScrollAnchor[] {
        const pane = scrollers[index], max = Math.max(0, pane.scrollHeight - pane.clientHeight), rect = pane.getBoundingClientRect();
        const points: ScrollAnchor[] = [{ key: 0, top: 0 }];
        blocks(index).forEach(node => {
            if (node.getAttribute('data-diff-folded') && !node.hasAttribute('data-diff-fold-start')) return;
            const key = Number(node.dataset.diffStart), top = node.getBoundingClientRect().top - rect.top + pane.scrollTop;
            const previous = points[points.length - 1];
            if (key > previous.key && top > previous.top && top < max) points.push({ key, top });
        });
        points.push({ key: diff.length + 1, top: max }); return points;
    }
    function unmount() {
        disconnectScroll?.(); disconnectScroll = undefined; observers.forEach(observer => observer.disconnect()); observers = [];
        resizeObserver?.disconnect(); resizeObserver = undefined;
        instances.forEach(instance => { try { instance.destroy(); } catch (error) { console.warn('[Diff] Editor cleanup failed', error); } });
        instances.length = roots.length = scrollers.length = 0;
        panes.forEach(pane => pane.querySelector('.diff-vditor')?.remove());
    }
    async function mount() {
        const current = ++generation; host.dataset.ready = 'false';
        // The bundled class keeps its resize callback separate from the main editor's global script.
        const Vditor = options.editorConstructor || (await import('@sunhouyun/vditor')).default;
        if (destroyed || current !== generation) return;
        await Promise.all(sides.map((side, index) => new Promise<void>(resolve => {
            const el = document.createElement('div'); el.className = 'diff-vditor'; panes[index].prepend(el);
            const instance = new Vditor(el, {
                cdn: cdn(), value: values[index], mode: options.markdown ? 'wysiwyg' : 'sv', customWysiwygToolbar: () => {}, toolbar: [], height: '100%', minHeight: 0,
                lang: 'en_US',
                theme: (window as any).nightMode ? 'dark' : 'classic', cache: { enable: false }, resize: { enable: false }, outline: { enable: false },
                undoDelay: 150, preview: { delay: 0, hljs: { enable: false } }, input: (value: string) => { if (current === generation) save(index, value); },
                after: () => {
                    if (destroyed || current !== generation) { resolve(); return; }
                    const mode = options.markdown ? 'wysiwyg' : 'sv', root = instances[index].vditor[mode].element as HTMLElement;
                    roots[index] = root; scrollers[index] = root;
                    root.classList.add('diff-document');
                    root.addEventListener('input', () => {
                        if (!options.editable || !sides[index].write) return;
                        dirty[index] = true;
                        Promise.resolve().then(() => { if (!destroyed && current === generation) save(index, instances[index].getValue()); });
                    }, true);
                    root.addEventListener('click', event => {
                        if ((!options.editable || !sides[index].write) && (event.target as Element).closest('input, button')) { event.preventDefault(); event.stopImmediatePropagation(); }
                    }, true);
                    root.addEventListener('compositionstart', () => { composing[index] = true; });
                    root.addEventListener('compositionend', () => { composing[index] = false; requestAnimationFrame(() => { if (!destroyed && current === generation) save(index, instances[index].getValue()); }); });
                    root.addEventListener('click', event => {
                        const fold = (event.target as HTMLElement).closest('[data-diff-fold-start]') as HTMLElement;
                        if (fold) { event.preventDefault(); expanded.add(fold.dataset.diffStart!); paint(); }
                    });
                    const observer = new MutationObserver(queuePaint); observer.observe(root, { childList: true, characterData: true, subtree: true }); observers.push(observer);
                    applyEditable(); resolve();
                }
            });
            instances[index] = instance;
        })));
        if (destroyed || current !== generation) return;
        disconnectScroll = bindSynchronizedScroll(scrollers as [HTMLElement, HTMLElement], anchors, () => { if (decoration.needsScrollPaint) queuePaint(); });
        if (typeof ResizeObserver !== 'undefined') { resizeObserver = new ResizeObserver(queuePaint); panes.forEach(pane => resizeObserver!.observe(pane)); }
        host.dataset.ready = 'true'; paint();
        instances.forEach(instance => instance.vditor.undo?.addToUndoStack?.(instance.vditor));
    }
    const start = () => mount().catch(error => { host.dataset.ready = 'error'; options.onError?.(error); console.error('[Diff] Editor failed:', error); });
    ready = start();
    return {
        get ready() { return ready; }, get instances() { return instances; }, get roots() { return roots; }, get scrollers() { return scrollers; },
        flush,
        setEditable(editable: boolean) { flush(); options.editable = editable; applyEditable(); queuePaint(); },
        setMarkdown(markdown: boolean) {
            if (markdown === options.markdown) return ready;
            flush(); options.markdown = markdown; const positions = scrollers.map(pane => pane.scrollTop / Math.max(1, pane.scrollHeight - pane.clientHeight));
            unmount(); ready = start().then(() => { scrollers.forEach((pane, index) => { pane.scrollTop = (positions[index] || 0) * Math.max(0, pane.scrollHeight - pane.clientHeight); }); }); return ready;
        },
        refresh(next: Options = {}) {
            options = { ...options, ...next };
            instances.forEach((instance, index) => {
                const value = sides[index].read();
                if (value !== values[index] && roots[index]) { values[index] = value; instance.setValue(value); }
            });
            applyEditable(); queuePaint();
        },
        scrollToHunk(id: number) {
            roots.forEach((root, index) => { const node = root.querySelector<HTMLElement>(`[data-diff-hunks~="${id}"]`); if (node) scrollers[index].scrollTop += node.getBoundingClientRect().top - scrollers[index].getBoundingClientRect().top - scrollers[index].clientHeight / 3; });
        },
        destroy() { flush(); destroyed = true; generation++; cancelAnimationFrame(frame); unmount(); decoration.destroy(); host.replaceChildren(); host.classList.remove('diff-editors', 'diff-live-surface'); }
    };
}
