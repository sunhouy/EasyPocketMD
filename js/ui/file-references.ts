/** Match complete resource paths, including encoded names and encrypted URL markers. */
export function resourceKey(url: string): string {
    try {
        const parsed = new URL(url, 'https://easypocketmd.invalid/');
        return parsed.protocol === 'local:' ? decodeURIComponent('local://' + parsed.host + parsed.pathname) : decodeURIComponent(parsed.pathname);
    } catch { return url.split(/[?#]/)[0]; }
}
export function findFileReferences(files: Array<{url:string}>, documents: Array<{path:string;content:string}>): Map<string,string[]> {
    const references=new Map<string,string[]>();
    for(const file of files) references.set(file.url,[]);
    const byKey=new Map<string,string[]>();
    for(const file of files) {const key=resourceKey(file.url);byKey.set(key,[...(byKey.get(key)||[]),file.url]);}
    for(const document of documents) {
        const urls=new Set<string>();
        const pattern=/\]\(\s*<?([^\s)]+)>?(?:\s+["'][^"']*["'])?\s*\)|(?:src|href)\s*=\s*["']([^"']+)["']|(?:https?:\/\/|local:\/\/)[^\s<>"')]+/gi;
        for(const match of document.content.matchAll(pattern)) urls.add(resourceKey((match[1]||match[2]||match[0]).replace(/>$/,'')));
        for(const key of urls) for(const url of byKey.get(key)||[]) references.get(url)!.push(document.path);
    }
    return references;
}
export function uploadDate(file: any): string | undefined {
    const timestamp=String(file.name || '').match(/(?:^|_)(\d{13})_/);
    const value=file.uploadedAt || file.date || (timestamp ? Number(timestamp[1]) : file.mtime);
    if(value==null) return undefined;
    const date=new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}
