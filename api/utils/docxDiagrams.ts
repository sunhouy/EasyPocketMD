import { writeFile } from 'fs/promises';
import path from 'path';
import MarkdownIt from 'markdown-it';
import { DOMParser } from '@xmldom/xmldom';

/** Materialize SVG into the per-export directory, so Pandoc embeds vector media. */
export async function prepareDocxDiagrams(markdown: string, diagrams: unknown, directory: string) {
    if (!Array.isArray(diagrams) || !diagrams.length) return markdown;
    if (diagrams.length > 64) throw new Error('Too many Mermaid diagrams');
    let totalBytes = 0;
    const assets = new Map<string, string>();
    for (const [index, diagram] of diagrams.entries()) {
        if (typeof diagram?.code !== 'string' || typeof diagram?.svg !== 'string') throw new Error('Invalid Mermaid diagram');
        const bytes = Buffer.byteLength(diagram.svg);
        totalBytes += bytes;
        if (bytes > 512 * 1024 || totalBytes > 4 * 1024 * 1024) throw new Error('Mermaid diagrams are too large');
        // Never let the XML parser resolve declarations or accept active/external assets.
        const content = diagram.svg.replace(/xmlns(?::\w+)?\s*=\s*["'][^"']*["']/g, '');
        if (/<!DOCTYPE|<!ENTITY|\bon\w+\s*=|(?:https?:|file:)\/\/|javascript:|data:/i.test(content)) {
            throw new Error('Unsupported Mermaid SVG content');
        }
        const invalid = () => { throw new Error('Unsupported Mermaid SVG content'); };
        const svg = new DOMParser({ errorHandler: { warning: invalid, error: invalid, fatalError: invalid } })
            .parseFromString(diagram.svg, 'application/xml');
        if (!svg.documentElement || svg.documentElement.localName !== 'svg' || svg.documentElement.namespaceURI !== 'http://www.w3.org/2000/svg') invalid();
        for (const element of Array.from(svg.getElementsByTagName('*'))) {
            if (/^(script|foreignObject|image)$/i.test(element.localName)) invalid();
        }
        const filename = 'mermaid-' + index + '.svg';
        await writeFile(path.join(directory, filename), diagram.svg, 'utf8');
        assets.set(diagram.code.trim(), filename);
    }
    const lines = markdown.split('\n');
    const fences = new MarkdownIt().parse(markdown, {}).filter(token => token.type === 'fence' && token.info.trim() === 'mermaid');
    for (const fence of fences.reverse()) {
        const filename = assets.get(fence.content.trim());
        if (!filename || !fence.map) continue;
        const [start, end] = fence.map;
        const prefix = lines[start].slice(0, lines[start].search(/[`~]/));
        lines.splice(start, end - start, prefix + '![Mermaid Diagram](' + filename + ')');
    }
    return lines.join('\n');
}
