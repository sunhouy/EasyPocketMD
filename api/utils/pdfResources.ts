import { parse, serialize } from 'parse5';

/** stdin HTML has no base URL. Never let WebKit resolve resources as local files. */
export function normalizePdfResources(html: string, baseUrl: string, inlineAsset: (src: string) => string | null) {
    const document: any = parse(html);
    let base: URL | undefined;
    try { const url = new URL(baseUrl); if (/^https?:$/.test(url.protocol)) base = url; } catch {}
    const resolve = (value: string): string | null => {
        const src = value.trim();
        if (!src) return null;
        if (src.startsWith('#') || /^data:image\//i.test(src) || /^data:font\//i.test(src) || /^data:application\/(?:font|x-font|vnd.ms-fontobject)/i.test(src)) return src;
        const local = inlineAsset(src);
        if (local) return local;
        try {
            const url = new URL(src, base);
            return /^https?:$/.test(url.protocol) ? url.href : null;
        } catch { return null; }
    };
    const css = (value: string) => value.replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, (_full, _quote, src) => {
        const url = resolve(src);
        return url ? 'url("' + url.replace(/"/g, '%22') + '")' : 'none';
    }).replace(/@import\s+(['"])(.*?)\1/gi, (_full, _quote, src) => {
        const url = resolve(src);
        return url ? '@import "' + url.replace(/"/g, '%22') + '"' : '@import url("data:text/css,")';
    });
    const visit = (node: any) => {
        // Ignore document-supplied bases and active documents; neither is printable content.
        if (node.childNodes) node.childNodes = node.childNodes.filter((child: any) => !['base', 'script', 'iframe', 'object'].includes(child.tagName));
        if (node.attrs) node.attrs = node.attrs.filter((attr: any) => {
            if (attr.name === 'srcset') return false;
            if (attr.name === 'style') attr.value = css(attr.value);
            const resource = attr.name === 'src' || attr.name === 'poster' ||
                (attr.name === 'href' && ['link', 'image', 'use'].includes(node.tagName));
            if (resource) {
                const url = resolve(attr.value);
                if (!url) return false;
                attr.value = url;
            }
            return true;
        });
        if (node.tagName === 'style') for (const child of node.childNodes || []) if (child.nodeName === '#text') child.value = css(child.value);
        for (const child of node.childNodes || []) visit(child);
    };
    visit(document);
    return serialize(document);
}
