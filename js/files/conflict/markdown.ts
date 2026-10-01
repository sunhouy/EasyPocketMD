import { highlightRenderedPair } from './highlight';
import { renderDiffView, RenderDiffViewOptions, escapeHtml, groupDiffIntoHunks } from './index';

const vditorCdn = () => (window as any).electron || window.location.protocol === 'file:' ? './vditor' : '/vditor';

type Block = { start: number; end: number; raw: string; side: 'left' | 'right' };
type Group = { start: number; end: number; blocks: Block[] };

/** Align complete Markdown blocks using the original line diff, preserving multiline syntax. */
export async function renderMarkdownDiff(diff: any[], isEn: boolean, options: RenderDiffViewOptions = {}): Promise<string> {
    const [{ marked }, { default: purifier }] = await Promise.all([import('marked'), import('dompurify')]);
    const lineMaps = { left: [] as number[], right: [] as number[] };
    const sources = { left: [] as string[], right: [] as string[] };
    diff.forEach((item, index) => {
        if (item.type !== 'added') { lineMaps.left.push(index); sources.left.push(item.left || ''); }
        if (item.type !== 'removed') { lineMaps.right.push(index); sources.right.push(item.right || ''); }
    });
    const intervals: Group[] = [];
    const references = { left: '', right: '' };
    for (const side of ['left', 'right'] as const) {
        const source = sources[side].join('\n').replace(/\r\n?/g, '\n');
        const tokens = marked.lexer(source, { gfm: true });
        references[side] = Object.entries(tokens.links || {}).map(([key, value]: any) => `\n[${key}]: <${value.href}>${value.title ? ' ' + JSON.stringify(value.title) : ''}`).join('');
        let cursor = 0;
        let line = 0;
        for (const token of tokens) {
            const offset = source.indexOf(token.raw, cursor);
            if (offset < 0) continue;
            line += (source.slice(cursor, offset).match(/\n/g) || []).length;
            const startLine = line;
            const endLine = startLine + (token.raw.replace(/\n+$/, '').match(/\n/g) || []).length;
            line += (token.raw.match(/\n/g) || []).length;
            cursor = offset + token.raw.length;
            if (token.type === 'space') continue;
            const start = lineMaps[side][startLine];
            const end = lineMaps[side][Math.min(endLine, lineMaps[side].length - 1)];
            if (start === undefined || end === undefined) continue;
            const block = { start, end, raw: token.raw, side };
            intervals.push({ start, end, blocks: [block] });
        }
    }
    // A removed/added pair belongs to one change, even when its blocks don't overlap.
    for (let index = 0; index < diff.length;) {
        if (diff[index].type === 'same') { index++; continue; }
        const start = index;
        while (index < diff.length && diff[index].type !== 'same') index++;
        intervals.push({ start, end: index - 1, blocks: [] });
    }
    intervals.sort((a, b) => a.start - b.start || a.end - b.end);
    const groups: Group[] = [];
    for (const interval of intervals) {
        const last = groups[groups.length - 1];
        if (last && interval.start <= last.end) { last.end = Math.max(last.end, interval.end); last.blocks.push(...interval.blocks); }
        else groups.push({ ...interval, blocks: [...interval.blocks] });
    }
    const lineNumbers = { left: new Map<number, number>(), right: new Map<number, number>() };
    for (const side of ['left', 'right'] as const) lineMaps[side].forEach((index, line) => lineNumbers[side].set(index, line + 1));
    const hunks = groupDiffIntoHunks(diff);
    const resolved = new Set(options.resolvedHunkIds || []);
    let html = '', folded = 0;
    let sameRows: string[] = [];
    const flushSame = () => {
        if (!sameRows.length) return;
        const id = 'markdown-collapse-' + (++folded);
        html += `<div class="diff-line diff-collapsed" data-collapse-id="${id}" data-markdown-collapse="1"><div class="diff-line-content" style="grid-column:1/-1">${isEn ? 'Folded unchanged blocks, click to expand' : '相同内容已折叠，点击展开'}</div></div>`;
        html += sameRows.map(row => row.replace('class="diff-line ', `hidden data-expanded-from="${id}" class="diff-line `)).join('');
        sameRows = [];
    };
    for (const group of groups) {
        const changed = diff.slice(group.start, group.end + 1).some(item => item.type !== 'same');
        const ids = hunks.filter(hunk => hunk.startIndex <= group.end && hunk.startIndex + hunk.items.length - 1 >= group.start).map(hunk => hunk.id);
        const hunkClass = options.markHunks && ids.length ? ' diff-hunk' + (ids.includes(options.activeHunkId!) ? ' diff-hunk-active' : '') + (ids.every(id => resolved.has(id)) ? ' diff-hunk-resolved' : '') : '';
        let row = '<div class="diff-line diff-markdown-row' + (changed ? '' : ' diff-same') + hunkClass + '">';
        if (options.markHunks) row += ids.map(id => `<span class="diff-hunk-anchor" data-hunk-id="${id}"></span>`).join('');
        for (const side of ['left', 'right'] as const) {
            const numbers: number[] = [];
            for (let index = group.start; index <= group.end; index++) {
                const line = lineNumbers[side].get(index);
                if (line !== undefined) numbers.push(line);
            }
            const range = numbers.length ? (numbers[0] === numbers[numbers.length - 1] ? String(numbers[0]) : `${numbers[0]}–${numbers[numbers.length - 1]}`) : '-';
            const markdown = group.blocks.filter(block => block.side === side).sort((a, b) => a.start - b.start).map(block => block.raw).join('\n');
            let rendered = '';
            if (markdown) {
                const vditor = (window as any).Vditor;
                const source = markdown + '\n' + references[side];
                rendered = vditor?.md2html ? await vditor.md2html(source, { cdn: vditorCdn(), markdown: { sanitize: true } }) : marked.parse(source, { gfm: true, breaks: true }) as string;
                rendered = purifier.sanitize(rendered, { FORBID_TAGS: ['style', 'iframe', 'form', 'input', 'button'], FORBID_ATTR: ['style'] });
            }
            const kind = changed && numbers.length ? (side === 'left' ? ' diff-removed' : ' diff-added') : '';
            row += `<div class="diff-line-num">${escapeHtml(range)}</div><div class="diff-line-content diff-markdown-content${kind}${!numbers.length ? ' diff-empty' : ''}">${rendered || '&nbsp;'}</div>`;
        }
        row += '</div>';
        if (changed) {
            const host = document.createElement('div'); host.innerHTML = row;
            const cells = host.querySelectorAll<HTMLElement>('.diff-markdown-content');
            highlightRenderedPair(cells[0], cells[1]); row = host.innerHTML;
        }
        if (!changed && options.collapseSame !== false) sameRows.push(row);
        else { flushSame(); html += row; }
    }
    flushSame();
    return html;
}

function hydrate(container: HTMLElement) {
    const api = (window as any).Vditor;
    api?.mathRender?.(container, { cdn: vditorCdn(), math: { engine: 'KaTeX' } });
    container.querySelectorAll('a').forEach(link => { link.target = '_blank'; link.rel = 'noopener noreferrer'; });
}

const revisions = new WeakMap<HTMLElement, number>();
/** Keep source diff available on failures; discard async results from old swaps/toggles. */
export function mountDiffView(container: HTMLElement, diff: any[], isEn: boolean, options: RenderDiffViewOptions & { markdown?: boolean } = {}) {
    const revision = (revisions.get(container) || 0) + 1;
    revisions.set(container, revision);
    container.innerHTML = renderDiffView(diff, isEn, options);
    if (options.markdown === false) return Promise.resolve();
    return renderMarkdownDiff(diff, isEn, options).then(html => {
        if (revisions.get(container) !== revision || !container.isConnected) return;
        container.innerHTML = html;
        container.querySelectorAll<HTMLElement>('[data-markdown-collapse]').forEach(row => {
            row.dataset.boundToggle = '1';
            row.addEventListener('click', () => {
                const expanded = row.classList.toggle('is-expanded');
                container.querySelectorAll<HTMLElement>(`[data-expanded-from="${row.dataset.collapseId}"]`).forEach(item => { item.hidden = !expanded; });
                if (expanded) hydrate(container);
            });
        });
        hydrate(container);
    }).catch(error => { console.error('[Diff] Markdown preview failed:', error); });
}

/** Render the smart-merge preview using the same safe Markdown pipeline. */
export async function renderMergePreview(container: HTMLElement, markdown: string) {
    const [{ marked }, { default: purifier }] = await Promise.all([import('marked'), import('dompurify')]);
    const api = (window as any).Vditor;
    const html = api?.md2html ? await api.md2html(markdown, { cdn: vditorCdn(), markdown: { sanitize: true } }) : marked.parse(markdown, { gfm: true, breaks: true }) as string;
    container.innerHTML = purifier.sanitize(html, { FORBID_TAGS: ['style', 'iframe', 'form', 'input', 'button'], FORBID_ATTR: ['style'] });
    hydrate(container);
}
