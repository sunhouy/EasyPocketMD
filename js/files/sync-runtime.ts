// @ts-nocheck
/**
 * 同步运行时：服务器同步、自动保存、E2E、共享文档（owner 视角）、外部本地文件、
 * 历史版本辅助、token 过期恢复、pendingServerSync 一致性维护、mergeFiles。
 *
 * 从 runtime-core.ts 中抽出。通过 installSyncRuntime 与 runtime-core 共享闭包：
 *  - 取入 editorRt 暴露的编辑器读写函数；
 *  - 取入 hooks 中由 runtime-core 提供的延迟回调（loadFiles/openFile 等），
 *    因为它们的定义仍位于 runtime-core 内部。
 */
import {
    isExternalLocalFile as isExternalLocalFileCore,
    normalizeExternalLocalFileRecord as normalizeExternalLocalFileRecordCore,
    getPathBasename as getPathBasenameCore,
    createBrowserLocalPath as createBrowserLocalPathCore,
    isLikelyBrowserWritePermissionError as isLikelyBrowserWritePermissionErrorCore
} from './external/index';
import {
    normalizePath as normalizePathCore,
    getParentPath as getParentPathCore,
    getBasename as getBasenameCore,
    getAllFolderPaths as getAllFolderPathsCore,
    isWasmFileOpsReady as isWasmFileOpsReadyCore
} from './tree/index';
import {
    normalizeServerFileRecord as normalizeServerFileRecordCore,
    createSyncRuntimeApi
} from './sync/index';
import type { EditorRuntimeCtx } from './editor-runtime';

export interface SyncRuntimeHooks {
    /** 这些函数在 runtime-core 内部 IIFE 中定义。调用时按需取值，避免 install 顺序问题。 */
    loadFiles: () => void;
    openFile: (id: string) => void;
    openFirstFile: () => void;
    createDefaultFile: () => void;
    shouldAutoOpenInitialFile: () => boolean;
    loadLocalFiles: () => void;
}

export function installSyncRuntime(global: any, editorRt: EditorRuntimeCtx, hooks: SyncRuntimeHooks) {
    function g(name: string) { return global[name]; }
    function isEn() { return window.i18n && window.i18n.getLanguage() === 'en'; }
    function t(key: string) { return window.i18n ? window.i18n.t(key) : key; }

    const {
        setEditorContentForFile,
        getCurrentEditorContent,
        setFileSwitchLoading,
        syncCurrentEditorSnapshotIntoFiles
    } = editorRt;

    // 共享 closure 状态
    let tokenRecoveryInProgress = false;
    let lastTokenRecoveryAt = 0;
    const browserFileHandleMap = new Map<any, any>();
    const localExternalSnapshotMap = new Map<any, any>();
    const localExternalConflictPrompting = new Set<any>();

    // ---------- token 过期恢复 ----------
    function isTokenErrorMessage(message) {
        if (!message) return false;
        const msg = String(message);
        return msg.includes('Token验证失败') || msg.includes('token') || msg.includes('Token') || msg.includes('过期') || msg.includes('expired') || msg.includes('sessionExpired');
    }

    async function tryHandleTokenExpired(source) {
        const resultLike = source && typeof source === 'object' && Object.prototype.hasOwnProperty.call(source, 'code')
            ? source
            : null;

        const matchedByResult = !!(global.isTokenError && global.isTokenError(resultLike || source));
        const matchedByMessage = isTokenErrorMessage(source && source.message ? source.message : source);
        if ((!matchedByResult && !matchedByMessage) || !g('currentUser')) return false;

        const now = Date.now();
        if (tokenRecoveryInProgress || (now - lastTokenRecoveryAt < 5000)) {
            return true;
        }

        tokenRecoveryInProgress = true;
        lastTokenRecoveryAt = now;
        try {
            if (global.handleTokenExpired) {
                await global.handleTokenExpired();
            } else {
                global.currentUser = null;
                localStorage.removeItem('vditor_user');
                global.showMessage(isEn() ? 'Session expired, please login again' : '登录会话已过期，请重新登录', 'warning');
                if (typeof global.handleLoginButtonClick === 'function') {
                    global.handleLoginButtonClick();
                }
            }
        } finally {
            tokenRecoveryInProgress = false;
        }
        return true;
    }

    // ---------- 服务器同步一致性：待同步标记 ----------
    function loadPendingServerSync() {
        try {
            const stored = localStorage.getItem('vditor_pending_server_sync');
            return stored ? JSON.parse(stored) : {};
        } catch (e) {
            console.warn('Failed to load pending server sync:', e);
            return {};
        }
    }

    function persistPendingServerSync(map) {
        try {
            localStorage.setItem('vditor_pending_server_sync', JSON.stringify(map));
        } catch (e) {
            console.warn('Failed to persist pending server sync:', e);
        }
    }

    function markPendingServerSync(fileId, pending) {
        if (!fileId) return;
        const map = g('pendingServerSync') || {};
        if (pending) map[fileId] = true;
        else delete map[fileId];
        global.pendingServerSync = map;
        persistPendingServerSync(map);
    }

    function getSaveStatusText(kind) {
        if (kind === 'saving') {
            return isEn() ? 'Saving...' : '保存中...';
        }
        if (kind === 'failed') {
            return isEn() ? 'Save failed' : '保存失败';
        }
        return isEn() ? 'Saved' : '已保存';
    }

    function showSaveStatus(kind) {
        if (typeof global.showSyncStatus !== 'function') return;
        if (kind === 'saving') {
            global.showSyncStatus(getSaveStatusText(kind), 'syncing');
        } else if (kind === 'failed') {
            global.showSyncStatus(getSaveStatusText(kind), 'error');
        } else {
            global.showSyncStatus(getSaveStatusText(kind), 'success');
        }
    }

    async function persistDraftBackup() {
        const currentFileId = g('currentFileId');
        if (!currentFileId) return false;

        const files = g('files') || [];
        const file = files.find(function(item) {
            return item && item.id === currentFileId && item.type === 'file';
        });
        if (!file) return false;

        const content = getCurrentEditorContent(currentFileId, file.content);
        const draft = {
            fileId: file.id,
            fileName: file.name,
            content: String(content || ''),
            timestamp: Date.now(),
            lastModified: Date.now(),
            sessionId: global.appSessionId || '',
            contentVersion: Number(file.contentVersion || 0)
        };

        if (global.draftRecovery && typeof global.draftRecovery.markDirty === 'function') {
            global.draftRecovery.markDirty();
        }

        if (global.IndexedDBManager && typeof global.IndexedDBManager.saveDraft === 'function') {
            try {
                await global.IndexedDBManager.saveDraft(draft);
            } catch (error) {
                console.warn('[Autosave] IndexedDB draft backup failed:', error);
            }
        }

        return true;
    }

    function getOptimisticLockPayload(file) {
        if (!file) return {};
        const baseLastModified = file.serverLastModified || file.baseLastModified || null;
        const payload: any = {
            base_content_version: Number(file.contentVersion || 0)
        };
        if (baseLastModified) {
            payload.base_last_modified = baseLastModified;
        }
        return payload;
    }

    function isCurrentFileDirty(currentFileId) {
        const dirtyMap = g('unsavedChanges') || {};
        return !!(currentFileId && dirtyMap[currentFileId]);
    }

    if (!global.pendingServerSync) {
        global.pendingServerSync = loadPendingServerSync();
    }

    // ---------- 共享在线文档（所有者视角） ----------
    let ownerShareCache: any = { updatedAt: 0, byFilename: {} };

    async function refreshOwnerShareCache(force?) {
        if (!g('currentUser')) return ownerShareCache.byFilename;
        const now = Date.now();
        if (!force && (now - ownerShareCache.updatedAt < 30000)) {
            return ownerShareCache.byFilename;
        }
        try {
            var api = global.getApiBaseUrl ? global.getApiBaseUrl() : 'api';
            const response = await fetch(api + '/share/list?username=' + encodeURIComponent(g('currentUser').username), {
                method: 'GET',
                headers: { 'Authorization': 'Bearer ' + g('currentUser').token }
            });
            const result = global.parseJsonResponse ? await global.parseJsonResponse(response) : await response.json();

            if (result.code === 401 || (global.isTokenError && global.isTokenError(result))) {
                if (await tryHandleTokenExpired(result)) {
                    return ownerShareCache.byFilename;
                }
            }

            const byFilename = {};
            if (result.code === 200 && result.data && Array.isArray(result.data.shares)) {
                result.data.shares.forEach(function(share) {
                    if (share.mode === 'edit' && !share.is_expired && share.filename) {
                        byFilename[share.filename] = share;
                    }
                });
            }
            ownerShareCache = { updatedAt: now, byFilename: byFilename };
            return byFilename;
        } catch (error) {
            await tryHandleTokenExpired(error);
            console.warn('刷新共享缓存失败:', error);
            return ownerShareCache.byFilename;
        }
    }

    async function activateOwnerSharedSession(file, fileContent) {
        if (!file || !g('currentUser')) return false;
        const byFilename = await refreshOwnerShareCache(false);
        const shareMeta = byFilename[file.name];
        if (!shareMeta || !shareMeta.share_id) {
            if (typeof global.deactivateSharedDocumentSession === 'function') {
                global.deactivateSharedDocumentSession();
            }
            return false;
        }

        try {
            var api = global.getApiBaseUrl ? global.getApiBaseUrl() : 'api';
            const response = await fetch(api + '/share/get', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    share_id: shareMeta.share_id,
                    editor_username: g('currentUser').username,
                    editor_token: g('currentUser').token,
                    editor_password: g('currentUser').password
                })
            });
            const result = global.parseJsonResponse ? await global.parseJsonResponse(response) : await response.json();
            if (result.code !== 200 || !result.data) {
                return false;
            }

            const sharedContent = result.data.content || fileContent || '';
            file.content = sharedContent;
            file.lastModified = Date.now();
            localStorage.setItem('vditor_files', JSON.stringify(g('files')));
            setEditorContentForFile(file.id, sharedContent);

            if (typeof global.activateSharedDocumentSession === 'function') {
                global.activateSharedDocumentSession(result.data, {
                    shareId: shareMeta.share_id,
                    sharePassword: '',
                    editPassword: '',
                    canEdit: true,
                    viewerId: 'owner-' + (g('currentUser').username || 'user'),
                    viewerName: g('currentUser').username,
                    ownerFileId: file.id
                });
            }
            return true;
        } catch (error) {
            console.warn('启用共享在线文档会话失败:', error);
            return false;
        }
    }

    // ---------- 辅助函数：路径处理 ----------
    function normalizePath(input) {
        return normalizePathCore(global, input || '');
    }

    function getParentPath(path) {
        return getParentPathCore(global, path || '');
    }

    function getBasename(path) {
        return getBasenameCore(global, path || '');
    }

    function ensureParentFolders(path) {
        if (!path) return;
        const files = g('files');
        const parent = getParentPath(path);
        if (parent === '') return;
        const exists = files.some(f => f.name === parent && f.type === 'folder');
        if (!exists) {
            ensureParentFolders(parent);
            const folder = {
                id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                name: parent,
                type: 'folder',
                content: '',
                lastModified: Date.now(),
                isSynced: false
            };
            files.push(folder);
        }
    }

    function deleteFolderAndChildren(folderPath) {
        const files = g('files');
        const toDelete = files.filter(f => f.name === folderPath || f.name.startsWith(folderPath + '/'));
        toDelete.forEach(f => {
            const idx = files.findIndex(ff => ff.id === f.id);
            if (idx !== -1) files.splice(idx, 1);
            delete g('lastSyncedContent')[f.id];
            delete g('unsavedChanges')[f.id];
        });
    }

    function renameFolderAndChildren(oldPath, newPath) {
        const files = g('files');
        files.forEach(f => {
            if (f.name === oldPath) {
                f.name = newPath;
            } else if (f.name.startsWith(oldPath + '/')) {
                f.name = newPath + f.name.substring(oldPath.length);
            }
        });
    }

    function isNameExistsInParent(name, parentPath, excludeId) {
        const fullPath = parentPath ? parentPath + '/' + name : name;
        return g('files').some(f => f.name === fullPath && f.id !== excludeId);
    }

    function getNextAvailableName(baseName, parentPath) {
        const files = g('files');
        let candidateName = baseName;
        let counter = 2;

        while (true) {
            const fullPath = parentPath ? parentPath + '/' + candidateName : candidateName;
            const exists = files.some(f => f.name === fullPath);
            if (!exists) {
                return candidateName;
            }
            candidateName = baseName + counter;
            counter++;
        }
    }

    // ---------- 外部本地文件 ----------
    function isExternalLocalFile(file) {
        return isExternalLocalFileCore(file);
    }

    function normalizeExternalLocalFileRecord(file) {
        normalizeExternalLocalFileRecordCore(global, file);
    }

    function getPathBasename(filePath) {
        return getPathBasenameCore(global, filePath || '');
    }

    function createBrowserLocalPath(fileName) {
        return createBrowserLocalPathCore(fileName);
    }

    async function readTextFromBrowserFile(fileObject) {
        if (!fileObject) return '';
        if (typeof fileObject.text === 'function') {
            return await fileObject.text();
        }
        return new Promise(function(resolve, reject) {
            const reader = new FileReader();
            reader.onload = function() { resolve(String(reader.result || '')); };
            reader.onerror = function() { reject(reader.error || new Error('read failed')); };
            reader.readAsText(fileObject);
        });
    }

    async function pickLocalFileByInput() {
        return new Promise(function(resolve) {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.md,.markdown,.txt,text/markdown,text/plain';
            input.style.display = 'none';
            document.body.appendChild(input);

            let settled = false;
            function finish(file) {
                if (settled) return;
                settled = true;
                window.removeEventListener('focus', onFocusBack);
                setTimeout(function() {
                    if (input.parentNode) input.parentNode.removeChild(input);
                }, 0);
                resolve(file || null);
            }

            function onFocusBack() {
                setTimeout(function() {
                    if (!settled) finish(null);
                }, 500);
            }

            input.addEventListener('change', function() {
                const file = input.files && input.files[0] ? input.files[0] : null;
                finish(file);
            }, { once: true });

            window.addEventListener('focus', onFocusBack, { once: true });
            input.click();
        });
    }

    function downloadLocalContent(fileName, content) {
        const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName || (isEn() ? 'document.md' : '文档.md');
        document.body.appendChild(link);
        link.click();
        setTimeout(function() {
            URL.revokeObjectURL(url);
            if (link.parentNode) link.parentNode.removeChild(link);
        }, 0);
    }

    function isLikelyBrowserWritePermissionError(error) {
        return isLikelyBrowserWritePermissionErrorCore(error);
    }

    async function requestBrowserWriteHandle() {
        if (typeof (global as any).showOpenFilePicker !== 'function') return null;
        try {
            const handles = await (global as any).showOpenFilePicker({
                multiple: false,
                types: [{
                    description: 'Markdown',
                    accept: {
                        'text/markdown': ['.md', '.markdown'],
                        'text/plain': ['.txt']
                    }
                }]
            });
            return handles && handles[0] ? handles[0] : null;
        } catch (error) {
            if (error && error.name === 'AbortError') return null;
            throw error;
        }
    }

    async function writeBrowserLocalFileWithRetry(fileId, content) {
        let handle = browserFileHandleMap.get(fileId);
        if (!handle) {
            handle = await requestBrowserWriteHandle();
            if (!handle) return { success: false, canceled: true };
            browserFileHandleMap.set(fileId, handle);
        }

        try {
            const writable = await handle.createWritable();
            await writable.write(content);
            await writable.close();
            localExternalSnapshotMap.set(fileId, content);
            return { success: true };
        } catch (error) {
            if (!isLikelyBrowserWritePermissionError(error)) {
                return { success: false, error: error };
            }

            global.showMessage(t('localFileNeedReauthorize'), 'warning');
            const reauthorizedHandle = await requestBrowserWriteHandle();
            if (!reauthorizedHandle) return { success: false, canceled: true };
            browserFileHandleMap.set(fileId, reauthorizedHandle);

            try {
                const writable = await reauthorizedHandle.createWritable();
                await writable.write(content);
                await writable.close();
                localExternalSnapshotMap.set(fileId, content);
                return { success: true, reauthorized: true };
            } catch (retryError) {
                return { success: false, error: retryError };
            }
        }
    }

    async function syncFileAfterSaveIfNeeded(currentFileId, file, content, isManual, contentChanged) {
        if (isExternalLocalFile(file)) {
            g('lastSyncedContent')[currentFileId] = content;
            markPendingServerSync(currentFileId, false);
            return true;
        }

        if (!g('currentUser')) {
            g('lastSyncedContent')[currentFileId] = content;
            return true;
        }

        markPendingServerSync(currentFileId, true);
        try {
            const saveResult = await global.syncFileToServer(currentFileId, { background: !isManual });
            if (isManual && contentChanged && saveResult) {
                try { await global.createHistoryVersion(file.name, content); } catch (e) { console.warn('创建历史版本失败', e); }
            }
            if (saveResult) {
                markPendingServerSync(currentFileId, false);
                return true;
            }
        } catch (e) {
            return false;
        }

        return false;
    }

    async function readExternalSourceContent(file, fileId) {
        if (!file || !file.isExternalLocal) return null;

        if (global.electron && file.localFilePath && typeof global.electron.readLocalFile === 'function') {
            const result = await global.electron.readLocalFile(file.localFilePath);
            if (!result || !result.success) return null;
            return result.content || '';
        }

        if (file.localFileMode === 'browser-fsa') {
            const handle = browserFileHandleMap.get(fileId);
            if (!handle || typeof handle.getFile !== 'function') return null;
            const browserFile = await handle.getFile();
            return await readTextFromBrowserFile(browserFile);
        }

        return null;
    }

    async function checkExternalLocalConflictForCurrentFile() {
        const currentFileId = g('currentFileId');
        if (!currentFileId) return;
        if (localExternalConflictPrompting.has(currentFileId)) return;

        const files = g('files');
        const file = files.find(function(f) { return f.id === currentFileId && f.type === 'file'; });
        if (!file || !file.isExternalLocal) return;
        if (g('unsavedChanges')[currentFileId]) return;

        if (!localExternalSnapshotMap.has(currentFileId)) {
            localExternalSnapshotMap.set(currentFileId, file.content || '');
            return;
        }

        let latestExternalContent;
        try {
            latestExternalContent = await readExternalSourceContent(file, currentFileId);
        } catch (error) {
            return;
        }
        if (latestExternalContent == null) return;

        const baselineContent = localExternalSnapshotMap.get(currentFileId);
        if (latestExternalContent === baselineContent) return;

        localExternalConflictPrompting.add(currentFileId);
        try {
            const useExternal = await g('customConfirm')(t('externalFileModifiedConfirm'));
            if (useExternal) {
                file.content = latestExternalContent;
                file.lastModified = Date.now();
                localStorage.setItem('vditor_files', JSON.stringify(files));
                setEditorContentForFile(currentFileId, latestExternalContent);
                g('unsavedChanges')[currentFileId] = false;
                localExternalSnapshotMap.set(currentFileId, latestExternalContent);
                hooks.loadFiles();
                global.showMessage(t('externalFileReloaded'), 'warning');
                await syncFileAfterSaveIfNeeded(currentFileId, file, latestExternalContent, false, true);
            } else {
                // 用户拒绝覆盖时更新快照，避免重复弹窗。
                localExternalSnapshotMap.set(currentFileId, latestExternalContent);
                global.showMessage(t('externalFileModified'), 'warning');
            }
        } finally {
            localExternalConflictPrompting.delete(currentFileId);
        }
    }

    function startExternalLocalConflictMonitor() {
        if (global.externalLocalConflictInterval) return;
        global.externalLocalConflictInterval = setInterval(function() {
            checkExternalLocalConflictForCurrentFile().catch(function() {});
        }, 4000);
    }

    async function openExternalLocalFileInBrowser() {
        try {
            if (typeof (global as any).showOpenFilePicker === 'function') {
                const handles = await (global as any).showOpenFilePicker({
                    multiple: false,
                    types: [{
                        description: 'Markdown',
                        accept: {
                            'text/markdown': ['.md', '.markdown'],
                            'text/plain': ['.txt']
                        }
                    }]
                });
                const handle = handles && handles[0];
                if (!handle) return false;
                const browserFile = await handle.getFile();
                const content = await readTextFromBrowserFile(browserFile);
                const localPath = createBrowserLocalPath(browserFile.name);
                return openExternalLocalFileByPath(localPath, {
                    success: true,
                    path: localPath,
                    name: browserFile.name,
                    content: content,
                    localFileMode: 'browser-fsa',
                    browserFileHandle: handle
                });
            }

            const fallbackFile: any = await pickLocalFileByInput();
            if (!fallbackFile) return false;
            const fallbackContent = await readTextFromBrowserFile(fallbackFile);
            const fallbackPath = createBrowserLocalPath(fallbackFile.name);
            return openExternalLocalFileByPath(fallbackPath, {
                success: true,
                path: fallbackPath,
                name: fallbackFile.name,
                content: fallbackContent,
                localFileMode: 'browser-file'
            });
        } catch (error) {
            if (error && error.name === 'AbortError') {
                return false;
            }
            global.showMessage((isEn() ? 'Failed to open local file: ' : '打开本地文件失败：') + (error && error.message ? error.message : ''), 'error');
            return false;
        }
    }

    async function openExternalLocalFileByPath(filePath, presetData?) {
        if (!filePath) return false;

        let fileData = presetData;
        if (!fileData) {
            if (!global.electron || typeof global.electron.readLocalFile !== 'function') {
                global.showMessage((isEn() ? 'Failed to open local file' : '打开本地文件失败') + ': ' + (isEn() ? 'Unsupported environment' : '当前环境不支持'), 'warning');
                return false;
            }
            fileData = await global.electron.readLocalFile(filePath);
        }

        if (!fileData || !fileData.success) {
            global.showMessage((isEn() ? 'Failed to open local file: ' : '打开本地文件失败：') + ((fileData && fileData.error) || ''), 'error');
            return false;
        }

        const resolvedPath = fileData.path || filePath || createBrowserLocalPath(fileData.name);
        const localFileMode = fileData.localFileMode || (global.electron ? 'electron' : 'browser-file');

        const files = g('files');
        let target = files.find(function(f) { return f.type === 'file' && f.isExternalLocal && f.localFilePath === resolvedPath; });
        const now = Date.now();

        if (!target) {
            const baseName = fileData.name || getPathBasename(resolvedPath) || (isEn() ? 'Local file' : '本地文件');
            const safeName = getNextAvailableName(baseName, '');
            target = {
                id: 'local-' + now + '-' + Math.random().toString(36).slice(2, 8),
                name: safeName,
                type: 'file',
                content: fileData.content || '',
                lastModified: now,
                isSynced: false,
                isExternalLocal: true,
                localFilePath: resolvedPath,
                localFileMode: localFileMode
            };
            files.push(target);
        } else {
            target.content = fileData.content || '';
            target.lastModified = now;
            target.isSynced = false;
            target.localFileMode = localFileMode;
            if (!target.localFilePath) target.localFilePath = resolvedPath;
        }

        if (fileData.browserFileHandle) {
            browserFileHandleMap.set(target.id, fileData.browserFileHandle);
        }
        localExternalSnapshotMap.set(target.id, target.content || '');

        localStorage.setItem('vditor_files', JSON.stringify(files));
        g('lastSyncedContent')[target.id] = target.content;
        g('unsavedChanges')[target.id] = false;
        hooks.loadFiles();
        hooks.openFile(target.id);
        return true;
    }

    async function openExternalLocalFileByDialog() {
        if (global.electron && typeof global.electron.openLocalFileDialog === 'function') {
            const result = await global.electron.openLocalFileDialog();
            if (!result || result.canceled) return false;
            return openExternalLocalFileByPath(result.path, result);
        }
        return openExternalLocalFileInBrowser();
    }

    function getAllFolderPaths() {
        return getAllFolderPathsCore(global, g('files') || []);
    }

    function isWasmFileOpsReady() {
        return isWasmFileOpsReadyCore(global);
    }

    function deferFileTreeWorkUntilWasmReady(callback, label) {
        if (isWasmFileOpsReady()) return false;
        if (typeof global.ensureWasmTextEngineReady !== 'function') {
            throw new Error('wasm text engine is required before ' + label);
        }
        global.ensureWasmTextEngineReady().then(function() {
            callback();
        }).catch(function(error) {
            console.error('[files] wasm gating failed before ' + label + ':', error);
            if (typeof global.showMessage === 'function') {
                global.showMessage(
                    (isEn() ? 'Initialization failed: ' : '初始化失败：') + ((error && error.message) || 'wasm text engine unavailable'),
                    'error'
                );
            }
        });
        return true;
    }

    // ---------- 服务器同步相关 ----------
    function isServerListContentMissing(content) {
        return content === undefined || content === null;
    }

    function needsServerFileContentFetch(file) {
        if (!file || file.type !== 'file' || !g('currentUser') || isExternalLocalFile(file)) return false;
        const pendingServerSync = g('pendingServerSync') || {};
        const unsavedChanges = g('unsavedChanges') || {};
        if (pendingServerSync[file.id] || unsavedChanges[file.id] || file.isSynced === false) return false;
        if (file.contentLoaded === true) {
            if (!file.contentFetchedAt && file.isSynced === true && file.content === '') return true;
            return false;
        }
        if (file.contentLoaded === false) return true;
        return isServerListContentMissing(file.content);
    }

    async function fetchServerFileContent(file) {
        if (!file || file.type !== 'file' || !g('currentUser')) {
            return typeof file?.content === 'string' ? file.content : '';
        }
        const api = global.getApiBaseUrl ? global.getApiBaseUrl() : 'api';
        const response = await fetch(
            api + '/files/content?username=' + encodeURIComponent(g('currentUser').username) +
            '&filename=' + encodeURIComponent(file.name),
            { headers: { 'Authorization': 'Bearer ' + g('currentUser').token } }
        );
        const result = global.parseJsonResponse ? await global.parseJsonResponse(response) : await response.json();
        if (result.code === 401 || (global.isTokenError && global.isTokenError(result))) {
            if (await tryHandleTokenExpired(result)) {
                return typeof file.content === 'string' ? file.content : '';
            }
        }
        if (result.code !== 200 || !result.data) {
            throw new Error(result.message || (isEn() ? 'Failed to load file content' : '加载文件内容失败'));
        }

        let content = result.data.content ?? '';
        const fileE2EEnabled = isFileE2EEnabled(file) || isFileE2EEnabled(result.data);
        if (window.currentUser && content) {
            content = await resolveE2EFileContent(content, file, result.data);
        }

        const serverLastModified = result.data.last_modified || result.data.lastModified || file.serverLastModified || null;
        const contentVersionRaw = result.data.content_version ?? result.data.contentVersion;
        file.content = content;
        file.contentLoaded = true;
        file.contentFetchedAt = Date.now();
        file.serverLastModified = serverLastModified;
        file.lastModified = serverLastModified || file.lastModified;
        if (contentVersionRaw !== undefined && contentVersionRaw !== null && contentVersionRaw !== '') {
            file.contentVersion = Number(contentVersionRaw);
        }
        if (fileE2EEnabled) {
            file.e2e_enabled = 1;
            file.e2eEnabled = true;
        }

        const lastSyncedContent = g('lastSyncedContent') || {};
        lastSyncedContent[file.id] = content;
        global.lastSyncedContent = lastSyncedContent;
        localStorage.setItem('vditor_files', JSON.stringify(g('files')));
        return content;
    }

    async function loadFilesFromServer(preserveFileName?) {
        if (!g('currentUser')) return;
        const requestUsername = g('currentUser').username;
        function isStillCurrentUser() {
            return g('currentUser') && g('currentUser').username === requestUsername;
        }

        setFileSwitchLoading(true, isEn() ? 'Loading files...' : '正在加载文件...');

        try {
            if (typeof global.ensureWasmTextEngineReady === 'function') {
                await global.ensureWasmTextEngineReady();
                if (!isStillCurrentUser()) return;
            }
            await refreshOwnerShareCache(true);
            if (!isStillCurrentUser()) return;
            var api = global.getApiBaseUrl ? global.getApiBaseUrl() : 'api';
            const response = await fetch(api + '/files?username=' + encodeURIComponent(g('currentUser').username), {
                headers: { 'Authorization': 'Bearer ' + g('currentUser').token }
            });
            const result = global.parseJsonResponse ? await global.parseJsonResponse(response) : await response.json();
            if (!isStillCurrentUser()) return;

            if (result.code === 401 || (global.isTokenError && global.isTokenError(result))) {
                if (await tryHandleTokenExpired(result)) {
                    return;
                }
            }

            if (result.code === 200 && result.data && result.data.files) {
                let serverFiles = await Promise.all(result.data.files.map(async f => {
                    let type = 'file';
                    let content = f.content;
                    let name = f.name.startsWith('/') ? f.name.substring(1) : f.name;

                    const fileE2EEnabled = isFileE2EEnabled(f);
                    if (window.currentUser && content) {
                        content = await resolveE2EFileContent(content, f);
                    }

                    if (name.endsWith('/') || content === '{"meta":"folder"}' || content === '{"type":"folder"}') {
                        type = 'folder';
                        if (content === '{"meta":"folder"}' || content === '{"type":"folder"}') {
                            content = '';
                        }
                        if (name.endsWith('/')) {
                            name = name.substring(0, name.length - 1);
                        }
                    }

                    const serverLastModified = f.last_modified || f.lastModified || null;
                    const hasServerContentVersion =
                        (f.content_version !== undefined && f.content_version !== null && f.content_version !== '') ||
                        (f.contentVersion !== undefined && f.contentVersion !== null && f.contentVersion !== '');
                    const contentLoaded = type === 'folder' || !isServerListContentMissing(content);
                    return {
                        ...f,
                        name: name,
                        type: type,
                        content: type === 'folder' ? '' : (contentLoaded ? (content ?? '') : undefined),
                        contentLoaded: contentLoaded,
                        e2e_enabled: fileE2EEnabled ? 1 : 0,
                        e2eEnabled: fileE2EEnabled,
                        lastModified: serverLastModified,
                        serverLastModified: serverLastModified,
                        contentVersion: hasServerContentVersion ? Number(f.content_version ?? f.contentVersion) : null
                    };
                }));

                const folderPaths = new Set();
                serverFiles.forEach(f => {
                    const parts = f.name.split('/');
                    if (parts.length > 1) {
                        let current = '';
                        for (let i = 0; i < parts.length - 1; i++) {
                            current = current ? current + '/' + parts[i] : parts[i];
                            folderPaths.add(current);
                        }
                    }
                });

                serverFiles.forEach(f => {
                    if (folderPaths.has(f.name)) {
                        f.type = 'folder';
                        if (f.content !== '{"meta":"folder"}') f.content = '';
                    }
                });

                const localFiles = JSON.parse(localStorage.getItem('vditor_files') || '[]');
                const pendingServerSyncState = g('pendingServerSync') || {};
                const unsavedChangesState = g('unsavedChanges') || {};
                global.pendingServerSync = pendingServerSyncState;
                global.unsavedChanges = unsavedChangesState;
                localFiles.forEach(f => {
                    if (!f.type) f.type = 'file';
                    if (typeof f.isSynced !== 'boolean') f.isSynced = false;
                    if (f.contentVersion === undefined || f.contentVersion === null) {
                        const hasLocalContentVersion = f.content_version !== undefined && f.content_version !== null && f.content_version !== '';
                        f.contentVersion = hasLocalContentVersion ? Number(f.content_version) : null;
                    }
                    if (f.e2eEnabled === undefined) f.e2eEnabled = isFileE2EEnabled(f);
                    if (f.e2e_enabled === undefined) f.e2e_enabled = f.e2eEnabled ? 1 : 0;
                    if (f.type === 'file' && f.isSynced === true && f.contentLoaded === true && !f.contentFetchedAt && f.content === '') {
                        f.contentLoaded = false;
                        if (f.id) {
                            pendingServerSyncState[f.id] = false;
                            unsavedChangesState[f.id] = false;
                        }
                    }
                    normalizeExternalLocalFileRecord(f);
                });
                syncCurrentEditorSnapshotIntoFiles(localFiles);

                // Server list is the source of truth for previously-synced files:
                // if a file existed on server before (local isSynced=true) but is missing from serverFiles now,
                // it should be deleted locally on load (instead of being re-uploaded).
                pruneLocallySyncedFilesDeletedOnServer(localFiles, serverFiles);

                await uploadLocalOnlyFilesToServerIfNeeded(localFiles, serverFiles);
                if (!isStillCurrentUser()) return;

                mergeFiles(localFiles, serverFiles);
                hooks.loadFiles();

                if (hooks.shouldAutoOpenInitialFile()) {
                    if (preserveFileName) {
                        const preservedFile = g('files').find(f => f.name === preserveFileName && f.type === 'file');
                        if (preservedFile) {
                            hooks.openFile(preservedFile.id);
                        } else if (g('files').length > 0) {
                            hooks.openFirstFile();
                        } else {
                            hooks.createDefaultFile();
                        }
                    } else {
                        if (g('files').length > 0) hooks.openFirstFile();
                        else hooks.createDefaultFile();
                    }
                }

                const pendingServerSync = g('pendingServerSync') || {};
                const pendingFileIds = Object.keys(pendingServerSync).filter(id => pendingServerSync[id]);
                if (pendingFileIds.length > 0) {
                    setTimeout(() => {
                        (async () => {
                            for (const fileId of pendingFileIds) {
                                try {
                                    await global.syncFileToServer(fileId);
                                } catch (e) {
                                    console.warn('自动同步文件失败:', fileId, e);
                                }
                            }
                        })();
                    }, 1000);
                }
            } else {
                hooks.loadLocalFiles();
                global.showSyncStatus(isEn() ? 'No files on server, using local files' : '服务器没有文件，使用本地文件', 'success');
            }
        } catch (error) {
            console.error('从服务器加载文件失败:', error);
            await tryHandleTokenExpired(error);
            global.showSyncStatus(isEn() ? 'Sync failed, using local files' : '同步失败，使用本地文件', 'error');
            hooks.loadLocalFiles();
        } finally {
            setFileSwitchLoading(false);
        }
    }

    function normalizeServerFileRecord(f) {
        return normalizeServerFileRecordCore(f);
    }

    function isFileE2EEnabled(file) {
        if (!file) return false;
        const raw = file.e2e_enabled !== undefined && file.e2e_enabled !== null && file.e2e_enabled !== ''
            ? file.e2e_enabled
            : file.e2eEnabled;
        return raw === true || raw === 1 || raw === '1' || raw === 'true';
    }

    async function resolveE2EFileContent(content, file, serverMeta?) {
        if (!content || !window.currentUser || !window.currentUser.password) return content;
        const e2eEnabled = isFileE2EEnabled(file) || (serverMeta && isFileE2EEnabled(serverMeta));
        try {
            const e2e = await import('../e2e');
            return await e2e.resolveFileContent(content, window.currentUser.password, e2eEnabled);
        } catch (e) {
            console.error('E2E content resolve error', e);
            return content;
        }
    }

    function updateCurrentFileE2EIndicator() {
        const indicators = document.querySelectorAll('.current-file-e2e-indicator');
        if (!indicators.length) return;
        const currentFile = (g('files') || []).find(function(file) {
            return file && file.id === g('currentFileId') && file.type === 'file';
        });
        const enabled = isFileE2EEnabled(currentFile);
        indicators.forEach(function(indicator: any) {
            indicator.style.display = enabled ? 'inline-flex' : 'none';
            indicator.setAttribute('aria-hidden', enabled ? 'false' : 'true');
            indicator.removeAttribute('title');
        });
    }

    function updateFileE2EMenuItems() {
        const currentFile = (g('files') || []).find(function(file) {
            return file && file.id === g('currentFileId') && file.type === 'file';
        });
        const enabled = isFileE2EEnabled(currentFile);
        [
            document.getElementById('desktopToggleFileE2EBtn'),
            document.getElementById('mobileToggleFileE2EBtn')
        ].forEach(function(btn) {
            if (!btn) return;
            btn.classList.toggle('active', enabled);
            btn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
            const text = btn.querySelector('.file-e2e-toggle-text');
            if (text) {
                text.textContent = enabled
                    ? (isEn() ? 'Disable E2E for this file' : '关闭加密')
                    : (isEn() ? 'Enable E2E for this file' : '开启加密');
            }
            const icon = btn.querySelector('i');
            if (icon) icon.className = enabled ? 'fas fa-lock' : 'fas fa-lock-open';
        });
    }

    function refreshE2EUi() {
        updateCurrentFileE2EIndicator();
        updateFileE2EMenuItems();
        setupE2EIndicatorInteractions();
    }

    // ---------- 端到端加密锁头浮窗 ----------
    let e2eIndicatorInteractionsBound = false;
    let e2eInfoPopoverHideTimer: any = null;
    let e2eInfoPopoverOpenAnchor: any = null;
    const e2eFingerprintCache = new Map<string, string>();

    async function computeKeyFingerprint(password) {
        if (!password) return '';
        if (e2eFingerprintCache.has(password)) {
            return e2eFingerprintCache.get(password);
        }
        try {
            const subtle = window.crypto && window.crypto.subtle;
            if (!subtle) return '';
            const data = new TextEncoder().encode('EasyPocketMD-E2E-Fingerprint-v1|' + password);
            const buf = await subtle.digest('SHA-256', data);
            const bytes = Array.from(new Uint8Array(buf));
            const hex = bytes.slice(0, 16).map(function(b) {
                return b.toString(16).padStart(2, '0').toUpperCase();
            }).join(':');
            e2eFingerprintCache.set(password, hex);
            return hex;
        } catch (e) {
            console.error('Fingerprint compute error', e);
            return '';
        }
    }

    function positionE2EInfoPopover(popover, anchor) {
        if (!popover || !anchor) return;
        const anchorRect = anchor.getBoundingClientRect();
        popover.style.left = '0px';
        popover.style.top = '0px';
        const popoverRect = popover.getBoundingClientRect();
        const margin = 8;
        const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight;

        let top = anchorRect.bottom + margin;
        if (top + popoverRect.height > viewportHeight - margin) {
            top = Math.max(margin, anchorRect.top - popoverRect.height - margin);
        }

        let left = anchorRect.left + (anchorRect.width / 2) - 28;
        if (left + popoverRect.width > viewportWidth - margin) {
            left = viewportWidth - popoverRect.width - margin;
        }
        if (left < margin) left = margin;

        popover.style.top = top + 'px';
        popover.style.left = left + 'px';

        const arrow = popover.querySelector('.e2e-info-popover-arrow');
        if (arrow) {
            const arrowLeft = Math.max(12,
                Math.min(popoverRect.width - 20, anchorRect.left + anchorRect.width / 2 - left - 6)
            );
            arrow.style.left = arrowLeft + 'px';
        }
    }

    async function showE2EInfoPopover(anchor) {
        const popover = document.getElementById('e2eInfoPopover');
        if (!popover || !anchor) return;
        if (e2eInfoPopoverHideTimer) {
            clearTimeout(e2eInfoPopoverHideTimer);
            e2eInfoPopoverHideTimer = null;
        }
        e2eInfoPopoverOpenAnchor = anchor;

        const titleEl = document.getElementById('e2eInfoPopoverTitle');
        const bodyEl = popover.querySelector('.e2e-info-popover-body');
        const labelEl = popover.querySelector('.e2e-info-popover-fingerprint-label');
        const fingerprintEl = document.getElementById('e2eInfoPopoverFingerprint');
        if (titleEl) titleEl.textContent = t('e2eInfoTitle') || (isEn() ? 'End-to-End Encrypted' : '端到端加密');
        if (bodyEl) bodyEl.textContent = t('e2eInfoMessage') || (isEn()
            ? 'This file is end-to-end encrypted. No one other than you can view it — not even the developer.'
            : '本文件已端到端加密，除您以外的任何用户都无法查看本文件，开发者也不例外。');
        if (labelEl) labelEl.textContent = t('e2eInfoFingerprintLabel') || (isEn() ? 'Local key fingerprint' : '本地密钥指纹');

        if (fingerprintEl) {
            const user = window.currentUser;
            if (!user || !user.password) {
                fingerprintEl.textContent = t('e2eInfoFingerprintUnavailable')
                    || (isEn() ? 'Sign in to view your key fingerprint' : '请先登录以查看密钥指纹');
            } else {
                fingerprintEl.textContent = '…';
                const requestedAnchor = anchor;
                computeKeyFingerprint(user.password).then(function(fp) {
                    if (e2eInfoPopoverOpenAnchor !== requestedAnchor) return;
                    fingerprintEl.textContent = fp || (isEn() ? 'Unavailable' : '不可用');
                });
            }
        }

        popover.setAttribute('aria-hidden', 'false');
        popover.classList.add('is-visible');
        positionE2EInfoPopover(popover, anchor);
        requestAnimationFrame(function() {
            positionE2EInfoPopover(popover, anchor);
        });
    }

    function hideE2EInfoPopover(immediate?) {
        const popover = document.getElementById('e2eInfoPopover');
        if (!popover) return;
        if (e2eInfoPopoverHideTimer) {
            clearTimeout(e2eInfoPopoverHideTimer);
            e2eInfoPopoverHideTimer = null;
        }
        const doHide = function() {
            popover.classList.remove('is-visible');
            popover.setAttribute('aria-hidden', 'true');
            e2eInfoPopoverOpenAnchor = null;
        };
        if (immediate) {
            doHide();
        } else {
            e2eInfoPopoverHideTimer = setTimeout(doHide, 140);
        }
    }

    function setupE2EIndicatorInteractions() {
        if (e2eIndicatorInteractionsBound) return;
        const indicators = document.querySelectorAll('.current-file-e2e-indicator');
        if (!indicators.length) return;
        const popover = document.getElementById('e2eInfoPopover');
        if (!popover) return;

        indicators.forEach(function(indicator) {
            indicator.removeAttribute('title');
        });

        indicators.forEach(function(indicator) {
            indicator.addEventListener('mouseenter', function() {
                showE2EInfoPopover(indicator);
            });
            indicator.addEventListener('mouseleave', function() {
                hideE2EInfoPopover(false);
            });
            indicator.addEventListener('focus', function() {
                showE2EInfoPopover(indicator);
            });
            indicator.addEventListener('blur', function() {
                hideE2EInfoPopover(false);
            });
            indicator.addEventListener('click', function(ev) {
                ev.stopPropagation();
                if (popover.classList.contains('is-visible') && e2eInfoPopoverOpenAnchor === indicator) {
                    hideE2EInfoPopover(true);
                } else {
                    showE2EInfoPopover(indicator);
                }
            });
            indicator.addEventListener('keydown', function(ev: any) {
                if (ev.key === 'Enter' || ev.key === ' ') {
                    ev.preventDefault();
                    if (popover.classList.contains('is-visible') && e2eInfoPopoverOpenAnchor === indicator) {
                        hideE2EInfoPopover(true);
                    } else {
                        showE2EInfoPopover(indicator);
                    }
                } else if (ev.key === 'Escape') {
                    hideE2EInfoPopover(true);
                }
            });
        });

        popover.addEventListener('mouseenter', function() {
            if (e2eInfoPopoverHideTimer) {
                clearTimeout(e2eInfoPopoverHideTimer);
                e2eInfoPopoverHideTimer = null;
            }
        });
        popover.addEventListener('mouseleave', function() {
            hideE2EInfoPopover(false);
        });

        document.addEventListener('click', function(ev) {
            if (!popover.classList.contains('is-visible')) return;
            const target = ev.target;
            if (popover.contains(target as Node)) return;
            let inIndicator = false;
            indicators.forEach(function(indicator) {
                if (indicator.contains(target as Node)) inIndicator = true;
            });
            if (!inIndicator) hideE2EInfoPopover(true);
        });

        window.addEventListener('resize', function() {
            if (e2eInfoPopoverOpenAnchor && popover.classList.contains('is-visible')) {
                positionE2EInfoPopover(popover, e2eInfoPopoverOpenAnchor);
            }
        });

        window.addEventListener('scroll', function() {
            if (e2eInfoPopoverOpenAnchor && popover.classList.contains('is-visible')) {
                positionE2EInfoPopover(popover, e2eInfoPopoverOpenAnchor);
            }
        }, true);

        document.addEventListener('keydown', function(ev) {
            if (ev.key === 'Escape' && popover.classList.contains('is-visible')) {
                hideE2EInfoPopover(true);
            }
        });

        e2eIndicatorInteractionsBound = true;
    }

    function getServerDeletedEditingMessage(file) {
        const name = file && file.name ? file.name : (isEn() ? 'Current file' : '当前文件');
        return isEn()
            ? `The server copy of "${name}" was deleted. It has been removed locally to match the server.`
            : `服务器上的“${name}”已被删除。为保持一致性，本地已自动删除。`;
    }

    function pruneLocallySyncedFilesDeletedOnServer(localFiles, serverFiles) {
        const serverFileMap = {};
        (serverFiles || []).forEach(function(f) {
            if (f && f.name) serverFileMap[f.name] = f;
        });

        const pendingServerSync = g('pendingServerSync') || {};
        const lastSyncedContent = g('lastSyncedContent') || {};
        const unsavedChanges = g('unsavedChanges') || {};
        let removedCurrentFile = false;

        for (let i = (localFiles || []).length - 1; i >= 0; i--) {
            const f = localFiles[i];
            if (!f || !f.name) continue;
            if (isExternalLocalFile(f)) continue;
            if (!f.isSynced) continue; // local-only files should still be eligible for upload
            if (serverFileMap[f.name]) continue;

            if (f.id) {
                delete pendingServerSync[f.id];
                delete lastSyncedContent[f.id];
                delete unsavedChanges[f.id];
                if (String(f.id) === String(g('currentFileId') || '')) {
                    removedCurrentFile = true;
                }
            }
            localFiles.splice(i, 1);
        }

        if (removedCurrentFile) {
            global.currentFileId = null;
            try {
                if (typeof global.showMessage === 'function') {
                    global.showMessage(getServerDeletedEditingMessage({ name: isEn() ? 'Current file' : '当前文件' }), 'warning');
                }
            } catch (e) {}
        }
    }

    function markOpenFileDeletedOnServer(file, editorContent) {
        if (!file || String(file.id || '') !== String(g('currentFileId') || '') || file.type !== 'file') return false;

        const wasDeleted = !!file.serverDeleted;
        const shouldNotify = !file.serverDeletedNotified;
        const previousContent = String(file.content || '');
        file.content = String(editorContent ?? file.content ?? '');
        file.lastModified = Date.now();
        file.serverLastModified = null;
        file.contentVersion = 0;
        file.isSynced = false;
        file.serverDeleted = true;
        delete file.crdtBaseContent;
        delete file.crdtBaseContentVersion;
        const lastSynced = g('lastSyncedContent') || {};
        const unsaved = g('unsavedChanges') || {};
        global.lastSyncedContent = lastSynced;
        global.unsavedChanges = unsaved;
        delete lastSynced[file.id];
        unsaved[file.id] = true;

        if (shouldNotify) {
            file.serverDeletedNotified = true;
            if (typeof global.showMessage === 'function') {
                global.showMessage(getServerDeletedEditingMessage(file), 'warning');
            } else if (typeof global.showSyncStatus === 'function') {
                global.showSyncStatus(getServerDeletedEditingMessage(file), 'warning');
            }
        }

        return shouldNotify || !wasDeleted || previousContent !== file.content;
    }

    async function pullServerUpdatesForCleanFiles() {
        if (!g('currentUser')) return;

        const files = g('files') || [];
        const currentFileId = g('currentFileId');
        const lastSyncedContent = g('lastSyncedContent') || {};
        const unsavedChanges = g('unsavedChanges') || {};
        const pendingServerSync = g('pendingServerSync') || {};

        const api = global.getApiBaseUrl ? global.getApiBaseUrl() : 'api';
        const response = await fetch(api + '/files?username=' + encodeURIComponent(g('currentUser').username), {
            method: 'GET',
            headers: { 'Authorization': 'Bearer ' + g('currentUser').token }
        });
        const result = global.parseJsonResponse ? await global.parseJsonResponse(response) : await response.json();
        if (result.code !== 200 || !result.data || !Array.isArray(result.data.files)) return;

        let initialServerFiles = await Promise.all(result.data.files.map(async f => {
            if (window.currentUser && f.content) {
                f.content = await resolveE2EFileContent(f.content, f);
            }
            return f;
        }));
        const serverFiles = initialServerFiles.map(normalizeServerFileRecord);
        const serverMap = {};
        serverFiles.forEach(function(sf) {
            serverMap[sf.name] = sf;
        });

        let hasLocalUpdate = false;
        const localByName = {};
        files.forEach(function(file) {
            if (!file || !file.name || isExternalLocalFile(file)) return;
            localByName[file.name] = file;
        });

        serverFiles.forEach(function(serverFile) {
            if (!serverFile || !serverFile.name || localByName[serverFile.name]) return;
            const serverLastModified = serverFile.serverLastModified || serverFile.lastModified || null;
            const newFile = {
                id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                name: serverFile.name,
                type: serverFile.type || 'file',
                content: serverFile.type === 'folder' ? '' : (serverFile.content ?? ''),
                contentLoaded: serverFile.type === 'folder' ? true : !isServerListContentMissing(serverFile.content),
                lastModified: serverLastModified,
                serverLastModified: serverLastModified,
                contentVersion: serverFile.contentVersion !== null && serverFile.contentVersion !== undefined
                    ? Number(serverFile.contentVersion)
                    : null,
                e2e_enabled: isFileE2EEnabled(serverFile) ? 1 : 0,
                e2eEnabled: isFileE2EEnabled(serverFile),
                isSynced: true
            };
            files.push(newFile);
            if (newFile.contentLoaded !== false) {
                lastSyncedContent[newFile.id] = newFile.content;
            }
            unsavedChanges[newFile.id] = false;
            hasLocalUpdate = true;
        });

        for (let i = files.length - 1; i >= 0; i--) {
            const file = files[i];
            if (!file || !file.name) continue;
            if (isExternalLocalFile(file)) continue;
            if (serverMap[file.name]) continue;

            const editorContent = file.id === currentFileId
                ? getCurrentEditorContent(currentFileId, file.content)
                : file.content;
            if (String(file.id || '') === String(currentFileId || '') && file.type === 'file') {
                // Keep consistent with initial load behavior: server deletion wins, remove locally.
                if (file.id) {
                    delete lastSyncedContent[file.id];
                    delete unsavedChanges[file.id];
                    delete pendingServerSync[file.id];
                }
                files.splice(i, 1);
                global.currentFileId = null;
                hasLocalUpdate = true;
                if (typeof global.showMessage === 'function') {
                    global.showMessage(getServerDeletedEditingMessage(file), 'warning');
                } else if (typeof global.showSyncStatus === 'function') {
                    global.showSyncStatus(getServerDeletedEditingMessage(file), 'warning');
                }
                continue;
            }

            if (pendingServerSync[file.id]) continue;
            const baseContent = lastSyncedContent[file.id];
            const hasLocalChanges = file.type === 'file'
                ? (!file.isSynced || unsavedChanges[file.id] || editorContent !== baseContent)
                : (!file.isSynced || unsavedChanges[file.id]);

            if (hasLocalChanges) continue;

            delete lastSyncedContent[file.id];
            delete unsavedChanges[file.id];
            delete pendingServerSync[file.id];
            files.splice(i, 1);
            if (file.id === currentFileId) {
                global.currentFileId = null;
            }
            hasLocalUpdate = true;
        }

        files.forEach(function(file) {
            if (!file || file.type !== 'file') return;
            if (isExternalLocalFile(file)) return;
            if (pendingServerSync[file.id]) return;

            const serverFile = serverMap[file.name];
            if (!serverFile || serverFile.type !== 'file') return;

            const editorContent = file.id === currentFileId
                ? getCurrentEditorContent(currentFileId, file.content)
                : file.content;
            const baseContent = lastSyncedContent[file.id];
            const hasLocalChanges = !file.isSynced || unsavedChanges[file.id] || editorContent !== baseContent;
            if (hasLocalChanges) return;

            const e2eChanged = isFileE2EEnabled(file) !== isFileE2EEnabled(serverFile);
            if (serverFile.contentLoaded === false || isServerListContentMissing(serverFile.content)) {
                return;
            }
            if (serverFile.content !== editorContent || e2eChanged) {
                file.content = serverFile.content;
                file.contentLoaded = true;
                file.lastModified = serverFile.lastModified || file.lastModified || null;
                file.serverLastModified = serverFile.serverLastModified || serverFile.lastModified || file.serverLastModified || null;
                file.contentVersion = serverFile.contentVersion !== null && serverFile.contentVersion !== undefined
                    ? Number(serverFile.contentVersion)
                    : file.contentVersion;
                file.e2e_enabled = isFileE2EEnabled(serverFile) ? 1 : 0;
                file.e2eEnabled = isFileE2EEnabled(serverFile);
                file.isSynced = true;
                delete file.serverDeleted;
                delete file.serverDeletedNotified;
                lastSyncedContent[file.id] = serverFile.content;
                unsavedChanges[file.id] = false;
                if (file.id === currentFileId) {
                    setEditorContentForFile(currentFileId, serverFile.content, { preserveCursor: true });
                }
                hasLocalUpdate = true;
            }
        });

        if (hasLocalUpdate) {
            localStorage.setItem('vditor_files', JSON.stringify(files));
            if (typeof global.loadFiles === 'function') {
                global.loadFiles();
            }
            global.showSyncStatus(isEn() ? 'Updated local files from server changes' : '已拉取服务器更新到本地', 'success');
        }
    }

    const syncRuntimeApi = createSyncRuntimeApi({
        globalRef: global,
        g,
        isExternalLocalFile,
        getCurrentEditorContent,
        setEditorContentForFile,
        markPendingServerSync,
        tryHandleTokenExpired,
        pullServerUpdatesForCleanFiles,
        fetchServerFileContent,
        isEn
    });

    async function uploadLocalOnlyFilesToServerIfNeeded(localFiles, serverFiles) {
        if (!g('currentUser')) return;
        const uploadUser = g('currentUser');
        function isStillUploadUser() {
            return g('currentUser') && g('currentUser').username === uploadUser.username;
        }

        const serverFileMap = {};
        serverFiles.forEach(function(f) { serverFileMap[f.name] = f; });

        const toUpload = localFiles.filter(function(f) {
            if (!f || !f.name) return false;
            if (f.type !== 'file' && f.type !== 'folder') return false;
            if (isExternalLocalFile(f)) return false;
            if (serverFileMap[f.name]) return false;
            return !f.isSynced;
        });

        if (toUpload.length === 0) return;

        for (let i = 0; i < toUpload.length; i++) {
            if (!isStillUploadUser()) return;
            const f = toUpload[i];
            try {
                const content =
                    f.type === 'folder'
                        ? ''
                        : (f.id === g('currentFileId') ? getCurrentEditorContent(f.id, f.content) : f.content);

                const filenameToSend = f.type === 'folder' ? (f.name.endsWith('/') ? f.name : (f.name + '/')) : f.name;
                const fileE2EEnabled = isFileE2EEnabled(f);
                let contentToSend = f.type === 'folder' ? '{"meta":"folder"}' : content;
                if (contentToSend && uploadUser.password) {
                    try {
                        const e2e = await import('../e2e');
                        if (fileE2EEnabled) {
                            contentToSend = await e2e.encrypt(contentToSend, uploadUser.password);
                        } else {
                            contentToSend = await e2e.resolveFileContent(contentToSend, uploadUser.password, false);
                        }
                    } catch(e) {
                        console.error('E2E content prepare error', e);
                    }
                }
                const body: any = {
                    username: uploadUser.username,
                    token: uploadUser.token,
                    filename: filenameToSend,
                    content: contentToSend,
                    e2e_enabled: fileE2EEnabled ? 1 : 0,
                    base_last_modified: f.serverLastModified || null
                };

                const contentVersion = Number(f.contentVersion || 0);
                if (Number.isFinite(contentVersion) && contentVersion > 0) {
                    body.base_content_version = contentVersion;
                }

                const api = global.getApiBaseUrl ? global.getApiBaseUrl() : 'api';
                const resp = await fetch(api + '/files/save', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
                const r = global.parseJsonResponse ? await global.parseJsonResponse(resp) : await resp.json();

                if (global.isTokenError && global.isTokenError(r)) {
                    const handled = await global.handleTokenExpired();
                    if (handled && isStillUploadUser()) {
                        body.token = g('currentUser').token;
                        const retryResp = await fetch(api + '/files/save', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(body)
                        });
                        const retryR = global.parseJsonResponse ? await global.parseJsonResponse(retryResp) : await retryResp.json();
                        if (retryR.code === 200) {
                            f.isSynced = true;
                            f.e2e_enabled = fileE2EEnabled ? 1 : 0;
                            f.e2eEnabled = fileE2EEnabled;
                            f.lastModified = Date.now();
                            serverFiles.push({
                                name: f.name,
                                type: f.type,
                                content: f.type === 'folder' ? '{"meta":"folder"}' : content,
                                lastModified: f.lastModified,
                                e2e_enabled: fileE2EEnabled ? 1 : 0,
                                e2eEnabled: fileE2EEnabled
                            });
                        }
                    }
                    continue;
                }

                if (r.code === 200) {
                    f.isSynced = true;
                    f.e2e_enabled = fileE2EEnabled ? 1 : 0;
                    f.e2eEnabled = fileE2EEnabled;
                    f.lastModified = Date.now();
                    f.serverLastModified = r.data && r.data.last_modified ? r.data.last_modified : f.lastModified;
                    f.contentVersion = Number(r.data && r.data.content_version ? r.data.content_version : (f.contentVersion || 1));
                    serverFiles.push({
                        name: f.name,
                        type: f.type,
                        content: f.type === 'folder' ? '{"meta":"folder"}' : content,
                        lastModified: f.lastModified,
                        serverLastModified: f.serverLastModified,
                        contentVersion: f.contentVersion,
                        e2e_enabled: fileE2EEnabled ? 1 : 0,
                        e2eEnabled: fileE2EEnabled
                    });
                } else {
                    console.warn('自动上传失败:', f.name, r.message);
                }
            } catch (e) {
                console.warn('自动上传异常:', f.name, e);
            }
        }

        try {
            localStorage.setItem('vditor_files', JSON.stringify(localFiles));
        } catch (e) {}
    }

    function syncCurrentFileWithBeacon() {
        return syncRuntimeApi.syncCurrentFileWithBeacon();
    }

    /** runtime-core 的 saveCurrentFile 在外部本地文件保存后需要同步刷新快照。 */
    function setExternalLocalSnapshot(fileId, content) {
        localExternalSnapshotMap.set(fileId, content);
    }

    // ---------- mergeFiles（属于服务器同步逻辑） ----------
    function mergeFiles(localFiles, serverFiles) {
        const mergedFiles = [];
        const fileMap = {};
        const pendingServerSync = g('pendingServerSync') || {};
        const lastSyncedContent = g('lastSyncedContent') || {};
        const unsavedChanges = g('unsavedChanges') || {};
        let removedCurrentFile = false;
        serverFiles.forEach(function(serverFile) {
            const serverLastModified = serverFile.serverLastModified || serverFile.lastModified || null;
            const hasVersion =
                (serverFile.contentVersion !== undefined && serverFile.contentVersion !== null && serverFile.contentVersion !== '') ||
                (serverFile.content_version !== undefined && serverFile.content_version !== null && serverFile.content_version !== '');
            const serverContentMissing = (serverFile.type || 'file') === 'file' && isServerListContentMissing(serverFile.content);
            const file = {
                id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                name: serverFile.name,
                type: serverFile.type || 'file',
                content: serverFile.type === 'folder' ? '' : (serverFile.content ?? ''),
                contentLoaded: serverFile.type === 'folder' ? true : !serverContentMissing,
                lastModified: serverLastModified,
                serverLastModified: serverLastModified,
                contentVersion: hasVersion ? Number(serverFile.contentVersion ?? serverFile.content_version) : null,
                e2e_enabled: isFileE2EEnabled(serverFile) ? 1 : 0,
                e2eEnabled: isFileE2EEnabled(serverFile),
                isSynced: true
            };
            mergedFiles.push(file);
            fileMap[serverFile.name] = file;
        });
        localFiles.forEach(function(localFile) {
            if (isExternalLocalFile(localFile)) {
                normalizeExternalLocalFileRecord(localFile);
                mergedFiles.push(Object.assign({}, localFile));
                return;
            }
            const mergedServerFile = fileMap[localFile.name];
            if (mergedServerFile) {
                if (localFile.id) {
                    mergedServerFile.id = localFile.id;
                }
                const localBaseContent = localFile && localFile.id ? lastSyncedContent[localFile.id] : undefined;
                if (localFile.type === 'file' && mergedServerFile.type === 'file') {
                    const e2eChanged = isFileE2EEnabled(localFile) !== isFileE2EEnabled(mergedServerFile);
                    if (mergedServerFile.contentLoaded === false) {
                        mergedServerFile.content = typeof localFile.content === 'string' ? localFile.content : '';
                        const hasPendingLocalSync = !!pendingServerSync[localFile.id];
                        const hasUnsavedLocalChanges = !!unsavedChanges[localFile.id] || localFile.isSynced === false;
                        const shouldKeepLocalAsSourceOfTruth = hasPendingLocalSync || hasUnsavedLocalChanges;

                        if (shouldKeepLocalAsSourceOfTruth) {
                            mergedServerFile.contentLoaded = true;
                            mergedServerFile.isSynced = false;
                            markPendingServerSync(mergedServerFile.id, true);
                            g('unsavedChanges')[mergedServerFile.id] = true;
                        } else {
                            mergedServerFile.contentLoaded = false;
                            mergedServerFile.isSynced = true;
                            markPendingServerSync(mergedServerFile.id, false);
                            g('unsavedChanges')[mergedServerFile.id] = false;
                        }
                        delete mergedServerFile.crdtBaseContent;
                        delete mergedServerFile.crdtBaseContentVersion;
                    } else if (localFile.content !== mergedServerFile.content || e2eChanged) {
                        const baseContent = typeof localBaseContent === 'string' ? localBaseContent : '';
                        const baseVersionRaw = Number(localFile.contentVersion);
                        mergedServerFile.content = localFile.content;
                        mergedServerFile.lastModified = localFile.lastModified || Date.now();
                        mergedServerFile.serverLastModified = mergedServerFile.serverLastModified || null;
                        mergedServerFile.contentVersion = Number.isFinite(baseVersionRaw) ? baseVersionRaw : 0;
                        mergedServerFile.e2e_enabled = isFileE2EEnabled(localFile) ? 1 : 0;
                        mergedServerFile.e2eEnabled = isFileE2EEnabled(localFile);
                        mergedServerFile.isSynced = false;
                        mergedServerFile.crdtBaseContent = baseContent;
                        mergedServerFile.crdtBaseContentVersion = Number.isFinite(baseVersionRaw) ? baseVersionRaw : 0;
                        g('unsavedChanges')[mergedServerFile.id] = true;
                        markPendingServerSync(mergedServerFile.id, true);
                    } else {
                        mergedServerFile.isSynced = true;
                        delete mergedServerFile.crdtBaseContent;
                        delete mergedServerFile.crdtBaseContentVersion;
                    }
                }
                return;
            }

            const hasPendingLocalSync = !!(localFile && localFile.id && pendingServerSync[localFile.id]);
            const localBaseContent = localFile && localFile.id ? lastSyncedContent[localFile.id] : undefined;
            const hasLocalChanges = localFile.type === 'file'
                ? (!localFile.isSynced || unsavedChanges[localFile.id] || localFile.content !== localBaseContent)
                : (!localFile.isSynced || unsavedChanges[localFile.id]);

            if (String(localFile.id || '') === String(g('currentFileId') || '') && localFile.type === 'file') {
                const localCopy = Object.assign({}, localFile);
                markOpenFileDeletedOnServer(localCopy, getCurrentEditorContent(localCopy.id, localCopy.content));
                mergedFiles.push(localCopy);
                return;
            }

            if (localFile.isSynced && !hasPendingLocalSync && !hasLocalChanges) {
                if (localFile.id) {
                    delete lastSyncedContent[localFile.id];
                    delete unsavedChanges[localFile.id];
                    delete pendingServerSync[localFile.id];
                    if (String(localFile.id) === String(g('currentFileId') || '')) {
                        removedCurrentFile = true;
                    }
                }
                return;
            }

            mergedFiles.push(Object.assign({}, localFile, { isSynced: false }));
        });
        if (removedCurrentFile) {
            global.currentFileId = null;
        }
        global.files = mergedFiles;
        localStorage.setItem('vditor_files', JSON.stringify(global.files));
        mergedFiles.forEach(function(file) {
            if (!file || !file.id || isExternalLocalFile(file)) return;
            if (file.isSynced) {
                if (file.contentLoaded !== false) {
                    lastSyncedContent[file.id] = file.content;
                    unsavedChanges[file.id] = false;
                }
                return;
            }
            if (typeof file.crdtBaseContent === 'string') {
                lastSyncedContent[file.id] = file.crdtBaseContent;
            }
            unsavedChanges[file.id] = true;
        });
    }

    return {
        tryHandleTokenExpired,
        markPendingServerSync,
        showSaveStatus,
        persistDraftBackup,
        getOptimisticLockPayload,
        isCurrentFileDirty,
        refreshOwnerShareCache,
        activateOwnerSharedSession,
        normalizePath,
        getParentPath,
        getBasename,
        ensureParentFolders,
        deleteFolderAndChildren,
        renameFolderAndChildren,
        isNameExistsInParent,
        getNextAvailableName,
        isExternalLocalFile,
        normalizeExternalLocalFileRecord,
        getPathBasename,
        createBrowserLocalPath,
        readTextFromBrowserFile,
        pickLocalFileByInput,
        downloadLocalContent,
        isLikelyBrowserWritePermissionError,
        requestBrowserWriteHandle,
        writeBrowserLocalFileWithRetry,
        syncFileAfterSaveIfNeeded,
        readExternalSourceContent,
        checkExternalLocalConflictForCurrentFile,
        startExternalLocalConflictMonitor,
        openExternalLocalFileInBrowser,
        openExternalLocalFileByPath,
        openExternalLocalFileByDialog,
        getAllFolderPaths,
        isWasmFileOpsReady,
        deferFileTreeWorkUntilWasmReady,
        isServerListContentMissing,
        needsServerFileContentFetch,
        fetchServerFileContent,
        loadFilesFromServer,
        normalizeServerFileRecord,
        isFileE2EEnabled,
        resolveE2EFileContent,
        updateCurrentFileE2EIndicator,
        updateFileE2EMenuItems,
        refreshE2EUi,
        computeKeyFingerprint,
        positionE2EInfoPopover,
        showE2EInfoPopover,
        hideE2EInfoPopover,
        setupE2EIndicatorInteractions,
        getServerDeletedEditingMessage,
        markOpenFileDeletedOnServer,
        pullServerUpdatesForCleanFiles,
        uploadLocalOnlyFilesToServerIfNeeded,
        syncCurrentFileWithBeacon,
        mergeFiles,
        syncRuntimeApi,
        setExternalLocalSnapshot
    };
}
