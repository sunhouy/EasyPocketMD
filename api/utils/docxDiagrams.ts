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
        if (typeof diagram?.code !== 'string') throw new Error('Invalid Mermaid diagram');
        if (typeof diagram.png === 'string' && !diagram.svg) {
            const encoded = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(diagram.png);
            if (!encoded || encoded[1].length > 3 * 1024 * 1024) throw new Error('Invalid Mermaid PNG');
            const png = Buffer.from(encoded[1], 'base64');
            totalBytes += png.length;
            if (png.length > 2 * 1024 * 1024 || totalBytes > 4 * 1024 * 1024) throw new Error('Mermaid diagrams are too large');
            if (!png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error('Invalid Mermaid PNG');
            const filename = 'mermaid-' + index + '.png';
            await writeFile(path.join(directory, filename), png);
            assets.set(diagram.code.trim(), filename);
            continue;
        }
        if (typeof diagram.svg !== 'string' || diagram.png) throw new Error('Invalid Mermaid diagram');
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
