import { selectionSearchUrl } from '../../js/main/selection-search';
it('defaults to Baidu and encodes the exact selection for each engine', () => {
    const text = '中文 & # /?';
    expect(new URL(selectionSearchUrl(text)).searchParams.get('wd')).toBe(text);
    for (const engine of ['google', 'bing'] as const) expect(new URL(selectionSearchUrl(text, engine)).searchParams.get('q')).toBe(text);
    expect(new URL(selectionSearchUrl(text, 'custom', 'https://example.com/?term={query}')).searchParams.get('term')).toBe(text);
});
it('rejects unsafe URLs and missing placeholders', () => {
    expect(() => selectionSearchUrl('x', 'custom', 'javascript:{query}')).toThrow('HTTP(S)');
    expect(() => selectionSearchUrl('x', 'custom', 'https://example.com/')).toThrow('{query}');
});
