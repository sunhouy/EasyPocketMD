import { e2eError, e2eErrorText } from './e2e-i18n';
import * as vault from './e2e-vault';
const MARKER = '#epmd-e2e';
const MAGIC = 'EPMDA2\n';
const utf8 = new TextEncoder();
const cache = new Map<string, string>();
const pending = new Map<string, Promise<string>>();
export function encryptedUrl(url: string) { return typeof url === 'string' && url.endsWith(MARKER); }
export function currentFileEncrypted() {
    const f = (window.files || []).find(f => f.id === window.currentFileId);
    return f && [true,1,'1','true'].includes((f.e2e_enabled ?? f.e2eEnabled) as any);
}
async function key(salt: Uint8Array<ArrayBuffer>, mode: string) {
    await vault.ensureUnlocked();
    const material = vault.state().config ? vault.secrets() : null;
    if (mode === 'vault') {
        if (!material) throw e2eError('e2eAttachmentKeyRequired');
        const raw = await crypto.subtle.importKey('raw', vault.unbase64(material.master), 'HKDF', false, ['deriveKey']);
        return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt, info: utf8.encode('EasyPocketMD attachment v2') }, raw, { name:'AES-GCM', length:256 }, false, ['encrypt','decrypt']);
    }
    const password = material ? material.legacy : window.currentUser?.password as string;
    if (!password) throw e2eError('e2eAttachmentPasswordMissing');
    const raw = await crypto.subtle.importKey('raw', utf8.encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name:'PBKDF2', hash:'SHA-256', salt, iterations:600000 }, raw, { name:'AES-GCM', length:256 }, false, ['encrypt','decrypt']);
}
export async function encryptFile(file: File): Promise<File> {
    await vault.ensureUnlocked();
    const account = window.currentUser?.username;
    if (!account) throw e2eError('e2eAttachmentLoginRequired');
    const salt = vault.random(16), iv = vault.random(12), mode = vault.state().config ? 'vault' : 'legacy';
    const header = JSON.stringify({ salt: vault.base64(salt), iv: vault.base64(iv), mode });
    const metadata = utf8.encode(JSON.stringify({ name: file.name, type: file.type }) + '\n');
    const bytes = new Uint8Array(await file.arrayBuffer());
    const plain = new Uint8Array(metadata.length + bytes.length); plain.set(metadata); plain.set(bytes, metadata.length);
    const ciphertext = await crypto.subtle.encrypt({ name:'AES-GCM', iv, additionalData: utf8.encode(MAGIC + header) }, await key(salt, mode), plain);
    if (window.currentUser?.username !== account) throw e2eError('e2eAccountChanged');
    if (vault.state().config) vault.secrets();
    return new File([MAGIC + header + '\n', ciphertext], crypto.randomUUID() + '.epmd', { type:'application/octet-stream' });
}
export function markUrl(url: string) { return url.split('#')[0] + MARKER; }
export function markdown(file: File, url: string) {
    const name = file.name.replace(/[\\\[\]\r\n]/g, '_');
    return (/^image\/(png|jpeg|gif|webp|bmp|avif)$/.test(file.type) ? '!' : '') + '[' + name + '](' + markUrl(url) + ')';
}
export async function decryptBytes(bytes: ArrayBuffer): Promise<{ blob: Blob; name: string }> {
    const arr = new Uint8Array(bytes);
    const end = arr.indexOf(10, MAGIC.length);
    if (end < 0 || end > 1024 || new TextDecoder().decode(arr.subarray(0,MAGIC.length)) !== MAGIC) throw e2eError('e2eAttachmentInvalid');
    const header = new TextDecoder().decode(arr.subarray(MAGIC.length,end));
    const h = JSON.parse(header);
    if (!['vault','legacy'].includes(h.mode) || vault.unbase64(h.iv).length !== 12 || vault.unbase64(h.salt).length !== 16) throw e2eError('e2eAttachmentInvalid');
    const plaintext = new Uint8Array(await crypto.subtle.decrypt({ name:'AES-GCM', iv: vault.unbase64(h.iv), additionalData: utf8.encode(MAGIC + header) }, await key(vault.unbase64(h.salt), h.mode), arr.slice(end+1)));
    const metadataEnd = plaintext.indexOf(10);
    if (metadataEnd < 0 || metadataEnd > 16384) throw e2eError('e2eAttachmentMetadataInvalid');
    const meta = JSON.parse(new TextDecoder().decode(plaintext.subarray(0,metadataEnd)));
    if (typeof meta.name !== 'string' || typeof meta.type !== 'string') throw e2eError('e2eAttachmentMetadataInvalid');
    // HTML/SVG and other active content must download, never render under the app's origin.
    const type = /^image\/(png|jpeg|gif|webp|bmp|avif)$/.test(meta.type) ? meta.type : 'application/octet-stream';
    return { blob: new Blob([plaintext.slice(metadataEnd+1)], { type }), name: meta.name };
}
export async function load(url: string): Promise<string> {
    await vault.ensureUnlocked();
    if (cache.has(url)) return cache.get(url);
    if (pending.has(url)) return pending.get(url);
    const account = window.currentUser?.username, expiry = vault.state().expiresAt;
    const task = (async () => {
        const source = url.slice(0,-MARKER.length);
        let bytes: ArrayBuffer;
        if (source.startsWith('local://')) {
            const blobUrl = await (window.ResourceLoader as any).getLocalBlobUrl(source);
            bytes = await (await fetch(blobUrl)).arrayBuffer();
        } else {
            const resolved = window.resolveResourceUrl ? window.resolveResourceUrl(source) : source;
            const response = await fetch(resolved);
            if (!response.ok) throw e2eError('e2eAttachmentDownloadFailed');
            bytes = await response.arrayBuffer();
        }
        const data = await decryptBytes(bytes);
        if (window.currentUser?.username !== account || vault.state().expiresAt !== expiry) throw e2eError('e2eSessionChanged');
        if (vault.state().config) vault.secrets();
        const blobUrl = URL.createObjectURL(data.blob); cache.set(url,blobUrl);
        (window.LocalImageManager as any)?.registerUrlPair(url,blobUrl);
        return blobUrl;
    })().finally(() => pending.delete(url));
    pending.set(url,task); return task;
}
export function clear() { for (const url of cache.values()) URL.revokeObjectURL(url); cache.clear(); }
export async function migrateMarkdown(content: string) {
    // Imported/existing attachments become encrypted copies; no plaintext fallback on failure.
    const pattern = /!?\[[^\]\n]*\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g;
    const matches = [...content.matchAll(pattern)];
    const converted = new Map<string,string>();
    for (const match of matches) {
        const url = match[1];
        if (encryptedUrl(url) || url.startsWith('#') || converted.has(url)) continue;
        // Restrict migration to app-managed resources. External links are not attachments.
        if (!/(?:^|\/)(?:uploads|user_files|screenshots)\//.test(url) && !/^(local:\/\/|blob:|data:)/.test(url)) continue;
        const resolved = window.resolveResourceUrl ? window.resolveResourceUrl(url) : url;
        const source = url.startsWith('local://') ? await (window.ResourceLoader as any).getLocalBlobUrl(url) : resolved;
        const response = await fetch(source); if (!response.ok) throw e2eError('e2eMigrationDownloadFailed');
        const blob = await response.blob();
        const name = decodeURIComponent(url.split(/[?#]/)[0].split('/').pop()) || 'attachment';
        const link = await uploadEncrypted([new File([blob], name, { type:blob.type })],false);
        const newUrl = link.match(/\]\(([^)]+)\)$/)?.[1]; if (!newUrl) throw e2eError('e2eAttachmentEncryptFailed');
        converted.set(url,newUrl);
    }
    return content.replace(pattern, (match,url) => converted.has(url) ? match.replace(url,converted.get(url)) : match);
}
export async function uploadEncrypted(files: File[], local: boolean): Promise<string> {
    const owner = window.currentUser?.username, fileId = window.currentFileId;
    const encrypted = [];
    for (const file of files) encrypted.push(await encryptFile(file));
    let urls: string[];
    if (local) {
        urls = [];
        for (const file of encrypted) urls.push(await (window.ResourceLoader as any).storeLocalFile(file));
    } else {
        const form = new FormData();
        form.append('e2e_attachment','1');
        form.append('username', window.currentUser.username); form.append('token', window.currentUser.token);
        for (const file of encrypted) form.append('files[]',file);
        const response = await fetch((window.getApiBaseUrl?.() || 'api') + '/files/upload', { method:'POST', body:form });
        const result = await response.json();
        if (!response.ok || !result.success || result.urls?.length !== files.length) throw e2eError('e2eAttachmentUploadFailed');
        urls = result.urls;
    }
    if (window.currentUser?.username !== owner || window.currentFileId !== fileId) throw e2eError('e2eUploadTargetChanged');
    if (vault.state().config) vault.secrets();
    return urls.map((url,i) => markdown(files[i],url)).join('\n\n');
}
if (typeof window !== 'undefined') {
    window.E2EAttachments = { encryptedUrl,currentFileEncrypted,encryptFile,markUrl,markdown,decryptBytes,load,clear,migrateMarkdown,uploadEncrypted };
    window.addEventListener('e2e-locked',clear);
    document.addEventListener('click',async event => {
        const anchor = (event.target as Element)?.closest?.('a');
        if (!anchor || !encryptedUrl(anchor.getAttribute('href'))) return;
        event.preventDefault(); event.stopImmediatePropagation();
        try {
            const blob = await load(anchor.getAttribute('href'));
            const download = document.createElement('a'); download.href = blob; download.download = anchor.textContent || 'attachment'; download.click();
        } catch (error) { window.showMessage?.(e2eErrorText(error,'e2eAttachmentReadFailed'),'error'); }
    },true);
}
