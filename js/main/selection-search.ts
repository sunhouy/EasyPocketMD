export type SearchEngine = 'baidu' | 'google' | 'bing' | 'custom';
const engines = {
    baidu: 'https://www.baidu.com/s?wd={query}',
    google: 'https://www.google.com/search?q={query}',
    bing: 'https://www.bing.com/search?q={query}'
};
export function selectionSearchUrl(text: string, engine: SearchEngine = 'baidu', custom = '') {
    const template = engine === 'custom' ? custom.trim() : engines[engine] || engines.baidu;
    if (!template.includes('{query}')) throw Error('自定义搜索地址必须包含 {query} / Search URL must contain {query}');
    const url = new URL(template.replaceAll('{query}', encodeURIComponent(text)));
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw Error('搜索地址必须是 HTTP(S) URL / Search URL must use HTTP(S)');
    return url.href;
}
