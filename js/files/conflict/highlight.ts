import DiffMatchPatch from 'diff-match-patch';

export const escapeText = (text: string) => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));
export type TextPart = { kind: number; text: string };

/** Compare graphemes so highlights never split emoji or combining characters. */
export function textDiff(left: string, right: string): TextPart[] {
    if (left === right) return [{ kind: 0, text: left }];
    if (!left || !right) return [{ kind: left ? -1 : 1, text: left || right }];
    const Segmenter = (Intl as any).Segmenter;
    const segmenter = Segmenter ? new Segmenter(undefined, { granularity: 'grapheme' }) : null;
    const split = (text: string): string[] => segmenter ? [...segmenter.segment(text)].map(item => item.segment) : Array.from(text);
    const ids = new Map<string, string>(), values = new Map<string, string>();
    let next = 256;
    const encode = (text: string) => split(text).map(value => {
        if (value === '\n' || value === '\t' || value === ' ') return value;
        if (!ids.has(value)) {
            if (next === 0xd800) next = 0xe000;
            const id = String.fromCharCode(next++); ids.set(value, id); values.set(id, value);
        }
        return ids.get(value)!;
    }).join('');
    const a = encode(left), b = encode(right);
    const dmp = new DiffMatchPatch(); dmp.Diff_Timeout = 0.2;
    const parts = dmp.diff_main(a, b); dmp.diff_cleanupSemantic(parts);
    return parts.map(([kind, encoded]: [number, string]) => ({ kind, text: Array.from(encoded).map(ch => values.get(ch) || ch).join('') }));
}

export function highlightedLines(parts: TextPart[], side: 'left' | 'right'): string[] {
    const lines = [''];
    for (const part of parts) {
        if (part.kind === (side === 'left' ? 1 : -1)) continue;
        const pieces = part.text.split('\n');
        pieces.forEach((piece, index) => {
            if (index) lines.push('');
            const escaped = escapeText(piece);
            lines[lines.length - 1] += part.kind && piece ? `<mark class="diff-char-${side === 'left' ? 'removed' : 'added'}">${escaped}</mark>` : escaped;
        });
    }
    return lines;
}

export function sourceHighlights(diff: any[]): Map<any, string> {
    const result = new Map<any, string>();
    for (let index = 0; index < diff.length;) {
        if (diff[index].type === 'same') { index++; continue; }
        const items: any[] = [];
        while (index < diff.length && diff[index].type !== 'same') items.push(diff[index++]);
        const left = items.filter(item => item.type === 'removed'), right = items.filter(item => item.type === 'added');
        const parts = textDiff(left.map(item => item.left || '').join('\n'), right.map(item => item.right || '').join('\n'));
        for (const [side, rows] of [['left', left], ['right', right]] as const) {
            const lines = highlightedLines(parts, side);
            rows.forEach((item, i) => result.set(item, lines[i] || ''));
        }
    }
    return result;
}

export function highlightRenderedPair(left: HTMLElement, right: HTMLElement) {
    const collect = (root: HTMLElement): Text[] => {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        const nodes: Text[] = [];
        while (walker.nextNode()) {
            const node = walker.currentNode as Text;
            if (!node.parentElement?.closest('.language-math, .katex, svg, script, style')) nodes.push(node);
        }
        return nodes;
    };
    const nodes = [collect(left), collect(right)];
    const parts = textDiff(nodes[0].map(node => node.data).join(''), nodes[1].map(node => node.data).join(''));
    nodes.forEach((texts, side) => {
        let offset = 0;
        const ranges: { start: number; end: number }[] = [];
        for (const part of parts) {
            if (part.kind === (side === 0 ? 1 : -1)) continue;
            if (part.kind) ranges.push({ start: offset, end: offset + part.text.length });
            offset += part.text.length;
        }
        offset = 0;
        texts.forEach(node => {
            const start = offset; offset += node.data.length;
            const hits = ranges.filter(range => range.start < offset && range.end > start);
            if (!hits.length) return;
            const fragment = document.createDocumentFragment(); let cursor = 0;
            for (const hit of hits) {
                const a = Math.max(0, hit.start - start), b = Math.min(node.data.length, hit.end - start);
                fragment.append(document.createTextNode(node.data.slice(cursor, a)));
                const mark = document.createElement('mark'); mark.className = 'diff-char-' + (side === 0 ? 'removed' : 'added');
                mark.textContent = node.data.slice(a, b); fragment.append(mark); cursor = b;
            }
            fragment.append(document.createTextNode(node.data.slice(cursor))); node.replaceWith(fragment);
        });
    });
    const math = [Array.from(left.querySelectorAll('.language-math')), Array.from(right.querySelectorAll('.language-math'))];
    math.forEach((formulas, side) => formulas.forEach((formula, index) => {
        if (formula.textContent !== math[1 - side][index]?.textContent) formula.classList.add('diff-char-' + (side === 0 ? 'removed' : 'added'));
    }));
}
