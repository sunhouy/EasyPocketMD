import type { QueryDocument } from './ai-query';
import { checkQuery, visibleDocument } from './ai-query';
import { looksLikeE2ECiphertext, resolveFileContent } from '../e2e';
import { createLocalHandleStore } from '../files/external/handles';

export interface QueryCorpus { documents: QueryDocument[]; skipped: string[]; }
/** Read only: never switch the editor, overwrite a draft or persist decrypted text. */
export async function collectQueryDocuments(options: { signal?: AbortSignal; includeEncrypted?: boolean; progress?: (done: number, total: number) => void }, app: Window = window): Promise<QueryCorpus> {
    const user = app.currentUser;
    const username = user?.username;
    const token = user?.token;
    const check = () => {
        checkQuery(options.signal);
        if (app.currentUser?.username !== username || app.currentUser?.token !== token) throw new Error('账号已切换，请重新查询 / Account changed; retry the query');
    };
    const api = app.getApiBaseUrl?.() || 'api';
    const request = async (path: string) => {
        check();
        const response = await fetch(api + path, { headers: { Authorization: 'Bearer ' + token }, signal: options.signal });
        const result = await response.json(); check();
        if (response.status === 401 || result.code === 401 || (app.isTokenError as ((value: any) => boolean) | undefined)?.(result)) throw new Error('登录已过期，请重新登录 / Please sign in again');
        if (!response.ok || result.code !== 200) throw new Error(result.message || '文件读取失败 / File read failed');
        return result.data;
    };
    const local = (app.files || []).filter(file => file.type === 'file' && visibleDocument(file.name) && (!file.localCloudUsername || file.localCloudUsername === username));
    const byPath = new Map(local.map(file => [file.name.replace(/^\//, ''), file]));
    const remote = new Map<string, any>();
    const result: QueryCorpus = { documents: [], skipped: [] };
    if (username) {
        // Failure of the authoritative cloud listing must not masquerade as a full search.
        if (!token) throw new Error('请重新登录后查询云端文档 / Please sign in again');
        const data = await request('/files?username=' + encodeURIComponent(username));
        if (!Array.isArray(data?.files)) throw new Error('文件列表无效 / Invalid file list');
        for (const file of data.files) if (visibleDocument(file.name) && file.type !== 'folder') remote.set(file.name.replace(/^\//, ''), file);
    }
    const paths = [...new Set([...byPath.keys(), ...remote.keys()])];
    if (options.includeEncrypted && paths.some(path => {
        const file = byPath.get(path);
        return [remote.get(path)?.e2e_enabled, file?.e2e_enabled, file?.e2eEnabled].some(value => [true, 1, '1', 'true'].includes(value)) || looksLikeE2ECiphertext(file?.content);
    })) {
        await app.E2EVault?.ensureUnlocked(); check();
    }
    for (let i = 0; i < paths.length; i++) {
        check();
        const path = paths[i], file = byPath.get(path), server = remote.get(path);
        try {
            const isCurrent = file?.id === app.currentFileId && (!app.sharedDocState || app.sharedDocState.ownerFileId === file?.id);
            const live = isCurrent ? app.vditor?.getValue() : undefined;
            const dirty = file && (app.unsavedChanges?.[file.id] || app.pendingServerSync?.[file.id] || file.isSynced === false || file.syncConflict || (typeof live === 'string' && live !== file.content));
            let content: string;
            let encrypted = [server?.e2e_enabled, file?.e2e_enabled, file?.e2eEnabled].some(value => [true, 1, '1', 'true'].includes(value as any));
            if (file?.e2eTransition) { result.skipped.push(path); continue; }
            if (!options.includeEncrypted && encrypted) { result.skipped.push(path); continue; }
            if (!dirty && file?.isExternalLocal && file.localFileMode === 'electron') {
                const disk = await (app as any).electron?.readLocalFile?.(file.localFilePath); check();
                if (!disk?.success || typeof disk.content !== 'string') throw new Error('本机文件读取失败');
                content = disk.content;
            } else if (!dirty && file?.isExternalLocal && file.localFileMode === 'browser-fsa') {
                const handle = await createLocalHandleStore().get(file.id); check();
                if (!handle?.getFile) throw new Error('本机文件访问权限不可用');
                const disk = await handle.getFile();
                content = await disk.text(); check();
            } else if (dirty || !server || (file?.isExternalLocal && file.localFileMode !== 'remote')) {
                if (file?.contentLoaded === false && typeof live !== 'string') throw new Error('本地内容尚未加载');
                content = typeof live === 'string' ? live : file?.content;
                if (typeof content !== 'string') throw new Error('本地内容不可用');
            } else {
                const data = await request('/files/content?username=' + encodeURIComponent(username) + '&filename=' + encodeURIComponent(path));
                if (typeof data?.content !== 'string') throw new Error('文件内容无效');
                content = data.content;
                encrypted ||= [true, 1, '1', 'true'].includes(data.e2e_enabled);
            }
            if (!options.includeEncrypted && (encrypted || looksLikeE2ECiphertext(content))) { result.skipped.push(path); continue; }
            content = await resolveFileContent(content, user?.password, encrypted); check();
            if (content === '{"meta":"folder"}' || content === '{"type":"folder"}') continue;
            if (content.trim()) result.documents.push({ path, content, fileId: file?.id });
        } catch (error) {
            check();
            // Authentication errors abort rather than silently omit cloud documents.
            if (String(error.message).includes('sign in again')) throw error;
            result.skipped.push(path);
        } finally { options.progress?.(i + 1, paths.length); }
    }
    check();
    return result;
}
