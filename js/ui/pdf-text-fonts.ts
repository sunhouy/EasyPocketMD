/** Preserve formatting while choosing Latin / CJK fonts per text run. */
export function applyMixedPdfFonts(value: unknown, latinFont: string, chineseFont: string): unknown {
    if (typeof value === 'string') return value.match(/[\u0000-\u024f]+|[^\u0000-\u024f]+/g)?.map(text => ({ text,
        font: /^[\u0000-\u024f]+$/.test(text) ? latinFont : chineseFont })) || '';
    if (Array.isArray(value)) return value.map(item => applyMixedPdfFonts(item, latinFont, chineseFont));
    if (!value || typeof value !== 'object') return value;
    const node = value as Record<string, unknown>;
    const inherited = typeof node.font === 'string' ? node.font : chineseFont;
    const result = { ...node };
    for (const [key, child] of Object.entries(node)) {
        if (key === 'text') result[key] = applyMixedPdfFonts(child, latinFont, inherited);
        else if (child && typeof child === 'object' && ['stack', 'columns', 'ul', 'ol', 'table', 'body', 'content'].includes(key))
            result[key] = applyMixedPdfFonts(child, latinFont, inherited);
    }
    return result;
}
