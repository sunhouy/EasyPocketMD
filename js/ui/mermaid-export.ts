import { renderEChartsSvg } from './echarts-markdown';
import MarkdownIt from 'markdown-it';

export function exportMermaidSvg(svg: SVGElement) {
    if (svg.querySelector('foreignObject, image')) return null;
    const clone = svg.cloneNode(true) as SVGElement;
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const viewBox = (clone.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
    if (viewBox.length === 4 && viewBox[2] > 0 && viewBox[3] > 0) {
        clone.setAttribute('width', String(viewBox[2]));
        clone.setAttribute('height', String(viewBox[3]));
    }
    clone.querySelectorAll('script').forEach(script => script.remove());
    return clone.outerHTML;
}

/** Render only actual Mermaid fences; examples inside other code fences stay text. */
export async function prepareDocxDiagrams(markdown: string) {
    const fences = new MarkdownIt().parse(markdown, {}).filter(token => token.type === 'fence' && ['mermaid', 'echarts'].includes(token.info.trim()));
    if (!fences.length) return [];
    const globalRef = window as any;
    if (typeof globalRef.convertFormulasAndChartsToImages !== 'function') await import('./render');
    const diagrams: { code: string; language?: string; svg?: string; png?: string }[] = [];
    for (const fence of fences) {
        if (fence.info.trim() === 'echarts') {
            diagrams.push({ code: fence.content.trim(), language: 'echarts', svg: await renderEChartsSvg(JSON.parse(fence.content)) });
            continue;
        }
        const host = document.createElement('div');
        const diagram = document.createElement('div');
        diagram.className = 'mermaid';
        diagram.textContent = fence.content;
        host.appendChild(diagram);
        const rendered = await globalRef.convertFormulasAndChartsToImages(host.innerHTML, { useTempDir: true });
        host.innerHTML = rendered;
        const svg = host.querySelector('svg');
        if (svg) {
            const exported = exportMermaidSvg(svg);
            if (exported) { diagrams.push({ code: fence.content.trim(), svg: exported }); continue; }
        }
        const png = host.querySelector('img')?.getAttribute('src');
        if (png?.startsWith('data:image/png;base64,')) {
            diagrams.push({ code: fence.content.trim(), png });
        } else {
            throw new Error('Mermaid diagram could not be exported; please check its syntax');
        }
    }
    return diagrams;
}
