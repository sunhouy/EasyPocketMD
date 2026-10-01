/** Serialize browser-only image URLs before handing HTML to the native converter. */
export async function preparePdfResources(html: string, baseUrl: string): Promise<string> {
    const template = document.createElement('template');
    template.innerHTML = html;
    const resources = template.content.querySelectorAll('img[src], image[href], image[xlink\\:href], embed[src]');
    const cache = new Map<string, Promise<string>>();
    for (const node of resources) {
        const attr = node.hasAttribute('src') ? 'src' : node.hasAttribute('href') ? 'href' : 'xlink:href';
        const src = node.getAttribute(attr) || '';
        if (!src || src.startsWith('#') || src.startsWith('data:')) continue;
        const resolved = window.resolveResourceUrl ? window.resolveResourceUrl(src, baseUrl) : new URL(src, baseUrl).href;
        if (resolved.startsWith('blob:')) {
            if (!cache.has(resolved)) cache.set(resolved, (async () => {
                const response = await fetch(resolved);
                if (!response.ok) throw new Error('无法读取文档图片，请重新插入后导出');
                const blob = await response.blob();
                if (blob.size > 5 * 1024 * 1024) throw new Error('PDF images exceed the export size limit');
                return new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(String(reader.result));
                    reader.onerror = () => reject(new Error('无法读取文档图片'));
                    reader.readAsDataURL(blob);
                });
            })());
            node.setAttribute(attr, await cache.get(resolved)!);
        } else node.setAttribute(attr, resolved);
    }
    return template.innerHTML;
}
