/**
 * 文件管理 - 加载、保存、同步、冲突、历史版本、文件夹
 */
(function(global) {
    'use strict';

    function g(name) { return global[name]; }
    
    function isEn() { return window.i18n && window.i18n.getLanguage() === 'en'; }
    function t(key) { return window.i18n ? window.i18n.t(key) : key; }

    // ---------- 服务器同步一致性：待同步标记 ----------
    // 记录“本地已保存但服务器尚未确认保存”的文件，避免本地/服务器长期不一致
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

    // 初始化 pendingServerSync（脚本加载即生效）
    if (!global.pendingServerSync) {
        global.pendingServerSync = loadPendingServerSync();
    }

    // ---------- 共享在线文档（所有者视角） ----------
    let ownerShareCache = { updatedAt: 0, byFilename: {} };

    async function refreshOwnerShareCache(force) {
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
            // 所有者打开共享在线文档时，以服务器内容为准，避免刷新后回退到本地旧版本。
            file.content = sharedContent;
            file.lastModified = Date.now();
            localStorage.setItem('vditor_files', JSON.stringify(g('files')));
            if (g('vditor')) {
                g('vditor').setValue(sharedContent);
            }

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
        let path = input.trim();
        if (path.startsWith('/')) {
            path = path.substring(1);
        }
        if (path.endsWith('.md')) {
            path = path.substring(0, path.length - 3);
        } else if (path.endsWith('.txt')) {
            path = path.substring(0, path.length - 4);
        } else if (path.endsWith('.markdown')) {
            path = path.substring(0, path.length - 9);
        }
        return path;
    }

    function getParentPath(path) {
        if (!path) return '';
        const lastSlash = path.lastIndexOf('/');
        if (lastSlash === -1) return '';
        return path.substring(0, lastSlash);
    }

    function getBasename(path) {
        if (!path) return '';
        const lastSlash = path.lastIndexOf('/');
        if (lastSlash === -1) return path;
        return path.substring(lastSlash + 1);
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

    // 获取所有可用目标文件夹（包含虚拟中间文件夹）
    function getAllFolderPaths() {
        const folderSet = new Set(['']); // 根目录
        const files = g('files');
        files.forEach(f => {
            if (f.type === 'folder') {
                folderSet.add(f.name);
            }
            // 对于象文件，提取其所有的父路径作为文件夹
            if (f.type === 'file') {
                let path = f.name;
                while (path.includes('/')) {
                    const parent = getParentPath(path);
                    if (!parent) break;
                    folderSet.add(parent);
                    path = parent;
                }
            }
        });
        return Array.from(folderSet).sort((a, b) => a.localeCompare(b));
    }

    // ---------- 服务器同步相关 ----------
    async function loadFilesFromServer(preserveFileName) {
        if (!g('currentUser')) return;
        try {
            await refreshOwnerShareCache(true);
            var api = global.getApiBaseUrl ? global.getApiBaseUrl() : 'api';
            const response = await fetch(api + '/files?username=' + encodeURIComponent(g('currentUser').username), {
                headers: { 'Authorization': 'Bearer ' + g('currentUser').token }
            });
            const result = global.parseJsonResponse ? await global.parseJsonResponse(response) : await response.json();
            if (result.code === 200 && result.data && result.data.files) {
                // 对服务器返回的文件名进行标准化（去除开头的 /）
                let serverFiles = result.data.files.map(f => {
                    let type = 'file';
                    let content = f.content;
                    let name = f.name.startsWith('/') ? f.name.substring(1) : f.name;

                    // 检查是否为文件夹：以 / 结尾，或者内容包含特定标记
                    if (name.endsWith('/') || content === '{"meta":"folder"}' || content === '{"type":"folder"}') {
                        type = 'folder';
                        if (content === '{"meta":"folder"}' || content === '{"type":"folder"}') {
                            content = '';
                        }
                        if (name.endsWith('/')) {
                            name = name.substring(0, name.length - 1);
                        }
                    }

                    return {
                        ...f,
                        name: name,
                        type: type,
                        content: content,
                        lastModified: f.last_modified || f.lastModified || Date.now()
                    };
                });

                // 第二遍扫描：如果一个项是其他项的父级，强制将其设为文件夹
                const folderPaths = new Set();
                serverFiles.forEach(f => {
                    const parts = f.name.split('/');
                    if (parts.length > 1) {
                        // 记录所有父路径
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
                        // 如果是隐式文件夹，内容强制为空（忽略可能的错误内容）
                        if (f.content !== '{"meta":"folder"}') f.content = '';
                    }
                });

                const localFiles = JSON.parse(localStorage.getItem('vditor_files') || '[]');
                // 迁移：给本地文件增加type字段，默认为file
                localFiles.forEach(f => { if (!f.type) f.type = 'file'; });

                // 当用户从未登录 -> 登录时，本地可能存在服务器从未见过的文件。
                // 这些文件不应弹冲突窗口，应直接上传并保存到用户服务器上。
                await uploadLocalOnlyFilesToServerIfNeeded(localFiles, serverFiles);

                // 检查是否需要保留当前编辑的文件（登录前正在编辑的文件）
                // 如果服务器上有同名文件且内容不同，需要弹冲突处理
                let currentFileConflict = null;
                if (preserveFileName) {
                    const serverFile = serverFiles.find(f => f.name === preserveFileName && f.type === 'file');
                    const localFile = localFiles.find(f => f.name === preserveFileName && f.type === 'file');
                    if (serverFile && localFile && serverFile.content !== localFile.content) {
                        // 存在同名文件且内容不同，标记为冲突
                        currentFileConflict = {
                            type: 'content',
                            filename: preserveFileName,
                            localContent: localFile.content,
                            serverContent: serverFile.content,
                            localModified: localFile.lastModified,
                            serverModified: serverFile.lastModified || Date.now()
                        };
                    }
                }

                const conflicts = detectConflicts(localFiles, serverFiles);
                if (currentFileConflict) {
                    // 确保当前文件冲突在冲突列表中
                    const existingConflict = conflicts.find(c => c.filename === preserveFileName);
                    if (!existingConflict) {
                        conflicts.push(currentFileConflict);
                    }
                }

                if (conflicts.length > 0) {
                    // 保存 preserveFileName 以便冲突解决后恢复
                    showConflictResolution(conflicts, serverFiles, preserveFileName);
                } else {
                    mergeFiles(localFiles, serverFiles);
                    loadFiles();

                    // 如果有指定要保留的文件，尝试打开它
                    if (preserveFileName) {
                        const preservedFile = g('files').find(f => f.name === preserveFileName && f.type === 'file');
                        if (preservedFile) {
                            openFile(preservedFile.id);
                        } else if (g('files').length > 0) {
                            openFirstFile();
                        } else {
                            createDefaultFile();
                        }
                    } else {
                        if (g('files').length > 0) openFirstFile();
                        else createDefaultFile();
                    }

                    // 自动同步待同步列表中的文件（用户强制退出时未同步的文件）
                    // 这些文件已经使用了本地版本，现在立即同步到服务器
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
                }
            } else {
                loadLocalFiles();
                global.showSyncStatus(isEn() ? 'No files on server, using local files' : '服务器没有文件，使用本地文件', 'success');
            }
        } catch (error) {
            console.error('从服务器加载文件失败:', error);
            global.showSyncStatus(isEn() ? 'Sync failed, using local files' : '同步失败，使用本地文件', 'error');
            loadLocalFiles();
        }
    }

    function normalizeServerFileRecord(f) {
        let type = 'file';
        let content = f.content;
        let name = (f.name || '').startsWith('/') ? f.name.substring(1) : (f.name || '');

        if (name.endsWith('/') || content === '{"meta":"folder"}' || content === '{"type":"folder"}') {
            type = 'folder';
            content = '';
            if (name.endsWith('/')) name = name.substring(0, name.length - 1);
        }

        return {
            ...f,
            name,
            type,
            content,
            lastModified: f.last_modified || f.lastModified || Date.now()
        };
    }

    async function fetchServerFileSnapshot(filename) {
        if (!g('currentUser') || !filename) return null;
        const api = global.getApiBaseUrl ? global.getApiBaseUrl() : 'api';
        const url = api + '/files/content?username=' + encodeURIComponent(g('currentUser').username) + '&filename=' + encodeURIComponent(filename);

        const response = await fetch(url, {
            method: 'GET',
            headers: { 'Authorization': 'Bearer ' + g('currentUser').token }
        });
        const result = global.parseJsonResponse ? await global.parseJsonResponse(response) : await response.json();

        if (result.code === 404) return null;
        if (result.code !== 200 || !result.data) throw new Error(result.message || 'Failed to fetch server snapshot');

        return {
            content: result.data.content || '',
            lastModified: result.data.last_modified || Date.now()
        };
    }

    async function pullServerUpdatesForCleanFiles() {
        if (!g('currentUser')) return;

        const files = g('files') || [];
        const currentFileId = g('currentFileId');
        const vditor = g('vditor');
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

        const serverMap = {};
        result.data.files.map(normalizeServerFileRecord).forEach(function(sf) {
            serverMap[sf.name] = sf;
        });

        let hasLocalUpdate = false;
        files.forEach(function(file) {
            if (!file || file.type !== 'file') return;
            if (pendingServerSync[file.id]) return;

            const serverFile = serverMap[file.name];
            if (!serverFile || serverFile.type !== 'file') return;

            const editorContent = (vditor && file.id === currentFileId) ? vditor.getValue() : file.content;
            const baseContent = lastSyncedContent[file.id];
            const hasLocalChanges = !file.isSynced || unsavedChanges[file.id] || editorContent !== baseContent;
            if (hasLocalChanges) return;

            if (serverFile.content !== editorContent) {
                file.content = serverFile.content;
                file.lastModified = serverFile.lastModified || Date.now();
                file.isSynced = true;
                lastSyncedContent[file.id] = serverFile.content;
                unsavedChanges[file.id] = false;
                if (vditor && file.id === currentFileId) {
                    vditor.setValue(serverFile.content);
                }
                hasLocalUpdate = true;
            }
        });

        if (hasLocalUpdate) {
            localStorage.setItem('vditor_files', JSON.stringify(files));
            global.showSyncStatus(isEn() ? 'Updated local files from server changes' : '已拉取服务器更新到本地', 'success');
        }
    }

    function detectConflicts(localFiles, serverFiles) {
        const conflicts = [];
        const pendingServerSync = g('pendingServerSync') || {};
        const editableSharedByFilename = ownerShareCache.byFilename || {};
        const serverFileMap = {};
        serverFiles.forEach(function(f) { serverFileMap[f.name] = f; });

        localFiles.forEach(function(localFile) {
            // 如果文件在待同步列表中（用户强制退出时未同步），跳过冲突检测，直接使用本地版本
            // 这些文件会在后续自动同步，无需用户手动解决冲突
            if (localFile.id && pendingServerSync[localFile.id]) {
                return;
            }

            const serverFile = serverFileMap[localFile.name];
            if (serverFile) {
                // 对于“所有者已开启共享编辑”的文件，刷新时始终以服务器版本为准。
                if (editableSharedByFilename[localFile.name]) {
                    localFile.content = serverFile.content;
                    localFile.lastModified = serverFile.lastModified || Date.now();
                    localFile.isSynced = true;
                    return;
                }
                if (serverFile.content !== localFile.content) {
                    conflicts.push({
                        type: 'content',
                        filename: localFile.name,
                        localContent: localFile.content,
                        serverContent: serverFile.content,
                        localModified: localFile.lastModified,
                        serverModified: serverFile.lastModified || Date.now()
                    });
                }
            } else {
                // 只有当本地文件曾经同步过（isSynced=true），而服务器现在没有时，才视为"服务器删除"冲突。
                // 本地新建但从未同步过的文件（isSynced=false）会在 loadFilesFromServer 中自动上传，不弹窗。
                if (localFile.isSynced) {
                    conflicts.push({
                        type: 'delete',
                        filename: localFile.name,
                        localContent: localFile.content,
                        localModified: localFile.lastModified
                    });
                }
            }
        });
        return conflicts;
    }

    async function uploadLocalOnlyFilesToServerIfNeeded(localFiles, serverFiles) {
        if (!g('currentUser')) return;

        const serverFileMap = {};
        serverFiles.forEach(function(f) { serverFileMap[f.name] = f; });

        const toUpload = localFiles.filter(function(f) {
            if (!f || !f.name) return false;
            if (f.type !== 'file' && f.type !== 'folder') return false;
            if (serverFileMap[f.name]) return false;
            // 只上传“从未同步过”的本地文件/文件夹
            return !f.isSynced;
        });

        if (toUpload.length === 0) return;

        try {
            global.showSyncStatus(isEn() ? 'Detected local new files, automatically uploading ' + toUpload.length + '...' : '检测到本地新文件，正在自动上传 ' + toUpload.length + ' 个...');
        } catch (e) {}

        // 逐个上传，确保顺序和稳定性
        for (let i = 0; i < toUpload.length; i++) {
            const f = toUpload[i];
            try {
                // 如果当前文件正在编辑，用编辑器内容为准
                const content =
                    f.type === 'folder'
                        ? ''
                        : (g('vditor') && f.id === g('currentFileId') ? g('vditor').getValue() : f.content);

                // 使用现有的保存接口（verifyUser 支持 body.token），避免依赖自定义 Header（sendBeacon 也可用）
                const filenameToSend = f.type === 'folder' ? (f.name.endsWith('/') ? f.name : (f.name + '/')) : f.name;
                const body = {
                    username: g('currentUser').username,
                    token: g('currentUser').token,
                    filename: filenameToSend,
                    content: f.type === 'folder' ? '{"meta":"folder"}' : content
                };

                const api = global.getApiBaseUrl ? global.getApiBaseUrl() : 'api';
                const resp = await fetch(api + '/files/save', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
                const r = global.parseJsonResponse ? await global.parseJsonResponse(resp) : await resp.json();

                // 检查 Token 错误
                if (global.isTokenError && global.isTokenError(r)) {
                    const handled = await global.handleTokenExpired();
                    if (handled) {
                        // 使用新 Token 重试
                        body.token = g('currentUser').token;
                        const retryResp = await fetch(api + '/files/save', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(body)
                        });
                        const retryR = global.parseJsonResponse ? await global.parseJsonResponse(retryResp) : await retryResp.json();
                        if (retryR.code === 200) {
                            f.isSynced = true;
                            f.lastModified = Date.now();
                            serverFiles.push({
                                name: f.name,
                                type: f.type,
                                content: f.type === 'folder' ? '{"meta":"folder"}' : content,
                                lastModified: f.lastModified
                            });
                        }
                    }
                    continue;
                }

                if (r.code === 200) {
                    // 标记本地为已同步，并把它加入 serverFiles，避免后续被当成缺失
                    f.isSynced = true;
                    f.lastModified = Date.now();
                    serverFiles.push({
                        name: f.name,
                        type: f.type,
                        content: f.type === 'folder' ? '{"meta":"folder"}' : content,
                        lastModified: f.lastModified
                    });
                } else {
                    console.warn('自动上传失败:', f.name, r.message);
                }
            } catch (e) {
                console.warn('自动上传异常:', f.name, e);
            }
        }

        // 写回 localStorage，确保后续不会重复上传
        try {
            localStorage.setItem('vditor_files', JSON.stringify(localFiles));
        } catch (e) {}
    }

    function syncCurrentFileWithBeacon() {
        const currentFileId = g('currentFileId');
        const vditor = g('vditor');
        if (!currentFileId || !vditor) return false;
        const files = g('files') || [];
        const file = files.find(f => f.id === currentFileId);
        if (!file || file.type !== 'file') return false;

        const content = vditor.getValue();

        // 关闭页面，保持“保存即同步保存（本地 + 服务器）”的一致性
        try {
            file.content = content;
            file.lastModified = Date.now();
            localStorage.setItem('vditor_files', JSON.stringify(files));
            g('unsavedChanges')[currentFileId] = false;
        } catch (e) {}

        if (!g('currentUser')) return true;

        // sendBeacon 无法等待响应，因此统一标记为 pending，后续会自动补齐同步
        markPendingServerSync(currentFileId, true);

        const body = {
            username: g('currentUser').username,
            token: g('currentUser').token,
            filename: file.name,
            content: content
        };

        try {
            const payload = new Blob([JSON.stringify(body)], { type: 'application/json' });
            const api = global.getApiBaseUrl ? global.getApiBaseUrl() : 'api';
            if (navigator.sendBeacon) {
                const ok = navigator.sendBeacon(api + '/files/save', payload);
                if (ok) return true;
            }
        } catch (e) {}

        // 兜底：keepalive fetch（如果浏览器支持）
        try {
            const api = global.getApiBaseUrl ? global.getApiBaseUrl() : 'api';
            fetch(api + '/files/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
                keepalive: true
            }).catch(e => console.warn('Beacon fetch failed:', e));
        } catch (e) {}
        return true;
    }

    // ---------- 差异对比功能 ----------
    
    /**
     * 计算两个文本的差异（基于行的简单LCS算法）
     * 返回格式：[{type: 'same'|'added'|'removed', left: string, right: string}]
     */
    function computeDiff(leftText, rightText) {
        const gateway = global.wasmTextEngineGateway;
        if (!gateway || typeof gateway.diff !== 'function') {
            return [];
        }
        const wasmDiff = gateway.diff(leftText, rightText);
        return Array.isArray(wasmDiff) ? wasmDiff : [];
    }
    
    /**
     * 渲染差异对比视图
     */
    function renderDiffView(diffResult) {
        let html = '';
        diffResult.forEach(function(item, index) {
            const lineNum = index + 1;
            if (item.type === 'same') {
                html += '<div class="diff-line diff-same">' +
                    '<div class="diff-line-num">' + lineNum + '</div>' +
                    '<div class="diff-line-content"><pre>' + escapeHtml(item.left) + '</pre></div>' +
                    '<div class="diff-line-num">' + lineNum + '</div>' +
                    '<div class="diff-line-content"><pre>' + escapeHtml(item.right) + '</pre></div>' +
                    '</div>';
            } else if (item.type === 'removed') {
                html += '<div class="diff-line diff-removed">' +
                    '<div class="diff-line-num">' + lineNum + '</div>' +
                    '<div class="diff-line-content"><pre>' + escapeHtml(item.left) + '</pre></div>' +
                    '<div class="diff-line-num">-</div>' +
                    '<div class="diff-line-content diff-empty"></div>' +
                    '</div>';
            } else if (item.type === 'added') {
                html += '<div class="diff-line diff-added">' +
                    '<div class="diff-line-num">-</div>' +
                    '<div class="diff-line-content diff-empty"></div>' +
                    '<div class="diff-line-num">' + lineNum + '</div>' +
                    '<div class="diff-line-content"><pre>' + escapeHtml(item.right) + '</pre></div>' +
                    '</div>';
            }
        });
        return html;
    }
    
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    /**
     * 显示差异对比模态窗口
     */
    function showDiffModal(conflict) {
        const diffModal = document.getElementById('diffModalOverlay');
        const diffContent = document.getElementById('diffContent');
        const diffFileName = document.getElementById('diffFileName');
        const diffLocalTime = document.getElementById('diffLocalTime');
        const diffServerTime = document.getElementById('diffServerTime');
        
        if (!diffModal || !diffContent) return;
        
        // 设置文件信息
        diffFileName.textContent = conflict.filename;
        diffLocalTime.textContent = new Date(conflict.localModified).toLocaleString();
        diffServerTime.textContent = new Date(conflict.serverModified).toLocaleString();
        
        // 计算并渲染差异
        const diffResult = computeDiff(conflict.localContent || '', conflict.serverContent || '');
        diffContent.innerHTML = renderDiffView(diffResult);
        
        // 显示模态窗口
        diffModal.classList.add('show');
        
        // 绑定关闭事件
        const closeBtn = document.getElementById('closeDiffBtn');
        const closeModalBtn = document.getElementById('closeDiffModalBtn');
        
        const closeModal = function() {
            diffModal.classList.remove('show');
        };
        
        if (closeBtn) closeBtn.onclick = closeModal;
        if (closeModalBtn) closeModalBtn.onclick = closeModal;
        
        // 点击外部关闭
        diffModal.onclick = function(e) {
            if (e.target === diffModal) closeModal();
        };
        
        // ESC键关闭
        const handleEsc = function(e) {
            if (e.key === 'Escape' && diffModal.classList.contains('show')) {
                closeModal();
                document.removeEventListener('keydown', handleEsc);
            }
        };
        document.addEventListener('keydown', handleEsc);
    }

    function showMergePreviewModal(conflict) {
        const gateway = global.wasmTextEngineGateway;
        if (!gateway || typeof gateway.merge3 !== 'function') {
            global.showMessage(isEn() ? 'Smart merge is unavailable' : '智能合并功能不可用', 'error');
            return;
        }

        const files = g('files') || [];
        const matched = files.find(function(f) {
            return f && f.type === 'file' && f.name === conflict.filename;
        });
        const baseText = matched && matched.id && g('lastSyncedContent')
            ? (g('lastSyncedContent')[matched.id] || '')
            : '';

        const res = gateway.merge3(baseText, conflict.localContent || '', conflict.serverContent || '', 'manual');
        if (!res || res.code !== 200 || !res.data) {
            global.showMessage((isEn() ? 'Merge preview failed: ' : '合并预览失败：') + ((res && res.message) || ''), 'error');
            return;
        }

        const previewConflicts = Array.isArray(res.data.conflicts) ? res.data.conflicts : [];
        const conflictListHtml = previewConflicts.length
            ? '<div class="merge-preview-conflicts">' +
                previewConflicts.map(function(item) {
                    return '<div class="merge-preview-conflict-item">' +
                        '<span class="merge-preview-conflict-line">' + (isEn() ? 'Line ' : '第 ') + escapeHtml(String(item.line || '')) + (isEn() ? '' : ' 行') + '</span>' +
                        '<span class="merge-preview-conflict-values">L: ' + escapeHtml(item.local || '') + ' | R: ' + escapeHtml(item.remote || '') + '</span>' +
                    '</div>';
                }).join('') +
            '</div>'
            : '';

        const modal = document.createElement('div');
        modal.className = 'modal-overlay show merge-preview-overlay';

        const panel = document.createElement('div');
        panel.className = 'merge-preview-panel';
        panel.innerHTML =
            '<div class="merge-preview-header">' +
                '<div><strong>' + (isEn() ? 'Smart Merge Preview' : '智能合并预览') + '</strong> - ' + escapeHtml(conflict.filename || '') + '</div>' +
                '<button id="closeMergePreviewBtn" class="merge-preview-close-btn">&times;</button>' +
            '</div>' +
            '<div class="merge-preview-meta">' +
                (isEn() ? 'Conflicts: ' : '冲突数：') + (res.data.conflictCount || 0) +
            '</div>' +
            conflictListHtml +
            '<div class="merge-preview-body">' +
                '<div class="merge-preview-column">' +
                    '<div class="merge-preview-block">' +
                        '<div class="merge-preview-block-title">' + (isEn() ? 'Local Version' : '本地版本') + '</div>' +
                        '<pre class="merge-preview-code">' + escapeHtml(conflict.localContent || '') + '</pre>' +
                    '</div>' +
                    '<div class="merge-preview-block">' +
                        '<div class="merge-preview-block-title">' + (isEn() ? 'Server Version' : '服务器版本') + '</div>' +
                        '<pre class="merge-preview-code">' + escapeHtml(conflict.serverContent || '') + '</pre>' +
                    '</div>' +
                '</div>' +
                '<div class="merge-preview-column">' +
                    '<div class="merge-preview-block merge-preview-result">' +
                        '<div class="merge-preview-block-title">' + (isEn() ? 'Merged Result' : '合并结果') + '</div>' +
                        '<pre class="merge-preview-code">' + escapeHtml(res.data.mergedText || '') + '</pre>' +
                    '</div>' +
                '</div>' +
            '</div>';

        modal.appendChild(panel);
        document.body.appendChild(modal);

        const close = function() {
            if (modal.parentNode) modal.parentNode.removeChild(modal);
        };

        const closeBtn = panel.querySelector('#closeMergePreviewBtn');
        if (closeBtn) closeBtn.onclick = close;
        modal.onclick = function(e) {
            if (e.target === modal) close();
        };

        const handleEsc = function(e) {
            if (e.key === 'Escape') {
                close();
                document.removeEventListener('keydown', handleEsc);
            }
        };
        document.addEventListener('keydown', handleEsc);
    }

    // 暴露到全局以便冲突模态窗口调用
    global.showDiffModal = showDiffModal;

    function showConflictResolution(conflicts, serverFiles, preserveFileName) {
        const conflictModal = document.getElementById('conflictModalOverlay');
        const conflictList = document.getElementById('conflictList');
        if (!conflictModal || !conflictList) return;
        conflictList.innerHTML = '';
        conflicts.forEach(function(conflict, index) {
            const conflictItem = document.createElement('div');
            conflictItem.className = 'conflict-option';

            // 当前编辑文件仅显示标识，不再使用强制高亮边框
            const isCurrentFile = preserveFileName && conflict.filename === preserveFileName;
            const currentFileClass = isCurrentFile ? ' is-current-file' : '';
            const currentFileTag = isCurrentFile
                ? '<span class="current-file-tag">' + (isEn() ? 'Currently editing' : '当前正在编辑') + '</span>'
                : '';

            if (conflict.type === 'delete') {
                conflictItem.innerHTML = '<div class="conflict-main' + currentFileClass + '" style="flex:1; padding: 8px;"><strong style="color: #dc3545;">' + (isCurrentFile ? '📝 ' : '⚠️ ') + conflict.filename + '</strong>' + currentFileTag + '<div class="conflict-details"><div style="color: #dc3545;">' + (isEn() ? 'This file has been deleted on the server' : '该文件在服务器上已经删除') + '</div><div>' + (isEn() ? 'Local modified time: ' : '本地修改时间: ') + new Date(conflict.localModified).toLocaleString() + '</div></div><div style="margin-top: 8px;"><label style="margin-right: 15px;"><input type="radio" name="conflict-' + index + '" value="upload">' + (isEn() ? 'Re-upload to server' : '重新上传到服务器') + '</label><label><input type="radio" name="conflict-' + index + '" value="delete" checked>' + (isEn() ? 'Delete local file' : '删除本地文件') + '</label></div></div>';
            } else {
                conflictItem.innerHTML = '<div class="conflict-main' + currentFileClass + '" style="flex:1; padding: 8px;"><strong>' + (isCurrentFile ? '📝 ' : '') + conflict.filename + '</strong>' + currentFileTag + '<div class="conflict-details"><div>' + (isEn() ? 'Local modified time: ' : '本地修改时间: ') + new Date(conflict.localModified).toLocaleString() + '</div><div>' + (isEn() ? 'Server modified time: ' : '服务器修改时间: ') + new Date(conflict.serverModified).toLocaleString() + '</div></div><div style="margin-top: 8px;"><label style="margin-right: 15px;"><input type="radio" name="conflict-' + index + '" value="local"' + (isCurrentFile ? ' checked' : '') + '>' + (isEn() ? 'Use local version' : '使用本地版本') + '</label><label style="margin-right: 15px;"><input type="radio" name="conflict-' + index + '" value="server"' + (isCurrentFile ? '' : ' checked') + '>' + (isEn() ? 'Use server version' : '使用服务器版本') + '</label><label><input type="radio" name="conflict-' + index + '" value="merge">' + (isEn() ? 'Use smart merge' : '使用智能合并') + '</label></div></div><button class="diff-view-btn" data-index="' + index + '" title="' + (isEn() ? 'View differences' : '查看差异') + '"><i class="fas fa-columns"></i></button><button class="merge-preview-btn" data-index="' + index + '" title="' + (isEn() ? 'Smart merge preview' : '智能合并预览') + '"><i class="fas fa-code-branch"></i></button>';
            }
            conflictList.appendChild(conflictItem);
        });

        // 绑定查看差异按钮事件
        conflictList.querySelectorAll('.diff-view-btn').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                const index = parseInt(this.getAttribute('data-index'));
                showDiffModal(conflicts[index]);
            });
        });
        conflictList.querySelectorAll('.merge-preview-btn').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                const index = parseInt(this.getAttribute('data-index'));
                const mergeInput = document.querySelector('input[name="conflict-' + index + '"][value="merge"]');
                if (mergeInput) mergeInput.checked = true;
                showMergePreviewModal(conflicts[index]);
            });
        });
        conflictModal.classList.add('show');
        var resolveBtn = document.getElementById('resolveConflictsBtn');
        var cancelBtn = document.getElementById('cancelConflictBtn');
        var closeBtn = document.getElementById('closeConflictBtn');

        var handleDefaultResolution = function() {
            conflictModal.classList.remove('show');
            document.removeEventListener('keydown', handleEsc);
            // 默认全部设为服务器版本（或删除以同步服务器）
            conflicts.forEach(function(conflict, index) {
                var serverInput = document.querySelector('input[name="conflict-' + index + '"][value="server"]');
                var deleteInput = document.querySelector('input[name="conflict-' + index + '"][value="delete"]');
                if (serverInput) serverInput.checked = true;
                if (deleteInput) deleteInput.checked = true;
            });
            resolveConflicts(conflicts, serverFiles, preserveFileName);
            global.showMessage(isEn() ? 'Using server version by default' : '已默认使用服务器版本');
        };

        var handleEsc = function(e) {
            if (e.key === 'Escape' && conflictModal.classList.contains('show')) {
                handleDefaultResolution();
            }
        };

        if (resolveBtn) resolveBtn.onclick = function() {
            document.removeEventListener('keydown', handleEsc);
            resolveConflicts(conflicts, serverFiles, preserveFileName);
            conflictModal.classList.remove('show');
        };
        if (cancelBtn) cancelBtn.onclick = handleDefaultResolution;
        if (closeBtn) closeBtn.onclick = handleDefaultResolution;

        // 点击外部区域关闭
        conflictModal.onclick = function(e) {
            if (e.target === conflictModal) handleDefaultResolution();
        };

        // 监听 Esc 键
        document.addEventListener('keydown', handleEsc);
    }

    function resolveConflicts(conflicts, serverFiles, preserveFileName) {
        const localFiles = JSON.parse(localStorage.getItem('vditor_files') || '[]');
        const vditor = g('vditor');
        const currentFileId = g('currentFileId');
        const filesToDelete = [];

        conflicts.forEach(function(conflict, index) {
            const selection = document.querySelector('input[name="conflict-' + index + '"]:checked');
            if (!selection) return;

            if (conflict.type === 'delete') {
                const action = selection.value;
                if (action === 'delete') {
                    const localFileIndex = localFiles.findIndex(function(f) { return f.name === conflict.filename; });
                    if (localFileIndex !== -1) {
                        filesToDelete.push(localFiles[localFileIndex].id);
                        localFiles.splice(localFileIndex, 1);
                    }
                } else {
                    const localFile = localFiles.find(function(f) { return f.name === conflict.filename; });
                    if (localFile) {
                        serverFiles.push({
                            name: localFile.name,
                            content: localFile.content,
                            lastModified: localFile.lastModified
                        });
                    }
                }
            } else {
                if (selection.value === 'local') {
                    const serverFileIndex = serverFiles.findIndex(function(f) { return f.name === conflict.filename; });
                    if (serverFileIndex !== -1) serverFiles[serverFileIndex].content = conflict.localContent;
                } else if (selection.value === 'server') {
                    const localFileIndex = localFiles.findIndex(function(f) { return f.name === conflict.filename; });
                    if (localFileIndex !== -1) {
                        localFiles[localFileIndex].content = conflict.serverContent;
                        localFiles[localFileIndex].lastModified = conflict.serverModified;
                        if (currentFileId === localFiles[localFileIndex].id && vditor) vditor.setValue(conflict.serverContent);
                    }
                } else if (selection.value === 'merge') {
                    const localFile = localFiles.find(function(f) { return f.name === conflict.filename; });
                    const baseText = localFile && localFile.id ? (g('lastSyncedContent')[localFile.id] || '') : '';
                    const gateway = global.wasmTextEngineGateway;
                    const mergeRes = gateway && typeof gateway.merge3 === 'function'
                        ? gateway.merge3(baseText, conflict.localContent || '', conflict.serverContent || '', 'manual')
                        : null;
                    const mergedText = mergeRes && mergeRes.code === 200 && mergeRes.data ? (mergeRes.data.mergedText || '') : (conflict.localContent || '');

                    const serverFileIndex = serverFiles.findIndex(function(f) { return f.name === conflict.filename; });
                    if (serverFileIndex !== -1) {
                        serverFiles[serverFileIndex].content = mergedText;
                        serverFiles[serverFileIndex].lastModified = Date.now();
                    }
                    const localFileIndex = localFiles.findIndex(function(f) { return f.name === conflict.filename; });
                    if (localFileIndex !== -1) {
                        localFiles[localFileIndex].content = mergedText;
                        localFiles[localFileIndex].lastModified = Date.now();
                        if (currentFileId === localFiles[localFileIndex].id && vditor) vditor.setValue(mergedText);
                    }
                }
            }
        });

        mergeFiles(localFiles, serverFiles);

        filesToDelete.forEach(function(fileId) {
            delete g('lastSyncedContent')[fileId];
            delete g('unsavedChanges')[fileId];
        });

        loadFiles();

        // 如果有指定要保留的文件，尝试打开它
        if (preserveFileName) {
            const preservedFile = g('files').find(f => f.name === preserveFileName && f.type === 'file');
            if (preservedFile) {
                openFile(preservedFile.id);
            } else if (g('files').length > 0) {
                openFirstFile();
            } else {
                createDefaultFile();
            }
        } else {
            if (g('files').length > 0) openFirstFile();
        }
        global.showMessage(isEn() ? 'Conflict resolved, files synced' : '冲突已解决，文件已同步');
    }

    function mergeFiles(localFiles, serverFiles) {
        const mergedFiles = [];
        const fileMap = {};
        serverFiles.forEach(function(serverFile) {
            const file = {
                id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                name: serverFile.name,
                type: serverFile.type || 'file',
                content: serverFile.content,
                lastModified: serverFile.lastModified || Date.now(),
                isSynced: true
            };
            mergedFiles.push(file);
            fileMap[serverFile.name] = file;
        });
        localFiles.forEach(function(localFile) {
            if (!fileMap[localFile.name]) mergedFiles.push(Object.assign({}, localFile, { isSynced: false }));
        });
        global.files = mergedFiles;
        localStorage.setItem('vditor_files', JSON.stringify(global.files));
        var lastSyncedContent = g('lastSyncedContent');
        var unsavedChanges = g('unsavedChanges');
        mergedFiles.forEach(function(file) {
            lastSyncedContent[file.id] = file.content;
            unsavedChanges[file.id] = false;
        });
    }

    function loadLocalFiles() {
        const localFiles = JSON.parse(localStorage.getItem('vditor_files') || '[]');
        localFiles.forEach(f => { if (!f.type) f.type = 'file'; });
        if (localFiles.length === 0) createDefaultFile();
        else {
            global.files = localFiles;
            loadFiles();
            if (g('files').length > 0) openFirstFile();
        }
    }

    // 打开第一个文件（忽略文件夹和系统文件）
    function openFirstFile() {
        const defaultOpening = g('userSettings') && g('userSettings').defaultFileOpening || 'lastEdited';
        
        if (defaultOpening === 'firstFile') {
            // 直接打开第一个非系统文件
            const firstFile = g('files').find(f => f.type === 'file' && f.name !== '.easypocketmd_orders');
            if (firstFile) openFile(firstFile.id);
        } else {
            // lastEdited: 优先打开上次打开的文件
            const lastOpenedFileId = localStorage.getItem('vditor_last_opened_file');
            if (lastOpenedFileId) {
                const lastFile = g('files').find(f => f.id === lastOpenedFileId && f.type === 'file' && f.name !== '.easypocketmd_orders');
                if (lastFile) {
                    openFile(lastOpenedFileId);
                    return;
                }
            }
            
            // 如果没有上次打开的文件或文件不存在，则打开第一个非系统文件
            const firstFile = g('files').find(f => f.type === 'file' && f.name !== '.easypocketmd_orders');
            if (firstFile) openFile(firstFile.id);
        }
    }

    function loadOrders() {
        const files = g('files');
        const orderFile = files.find(f => f.name === '.easypocketmd_orders');
        global.fileOrders = {};
        if (orderFile && orderFile.content) {
            try {
                global.fileOrders = JSON.parse(orderFile.content);
                files.forEach(f => {
                    if (global.fileOrders[f.name] !== undefined) {
                        f.order = global.fileOrders[f.name];
                    }
                });
            } catch (e) {
                console.error('Failed to parse orders file', e);
            }
        }
    }

    function saveOrdersFromPaths(pathOrders) {
        const files = g('files');
        let orderFile = files.find(f => f.name === '.easypocketmd_orders');
        if (!orderFile) {
            orderFile = {
                id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                name: '.easypocketmd_orders',
                type: 'file',
                content: '{}',
                lastModified: Date.now(),
                isSynced: false
            };
            files.push(orderFile);
        }
        
        if (!global.fileOrders) global.fileOrders = {};
        Object.assign(global.fileOrders, pathOrders);
        
        orderFile.content = JSON.stringify(global.fileOrders);
        orderFile.lastModified = Date.now();
        orderFile.isSynced = false;
        
        localStorage.setItem('vditor_files', JSON.stringify(files));
        
        if (g('currentUser')) {
            global.syncFileToServer(orderFile.id);
        }
    }

    function moveNodeOrder(nodeId, direction) {
        const tree = window.$.jstree.reference('#fileList');
        if (!tree) return;
        const node = tree.get_node(nodeId);
        if (!node) return;
        
        const parentId = node.parent;
        const parentNode = tree.get_node(parentId);
        const siblings = parentNode.children;
        const index = siblings.indexOf(nodeId);
        
        let targetIndex = -1;
        if (direction === 'up' && index > 0) {
            targetIndex = index - 1;
        } else if (direction === 'down' && index < siblings.length - 1) {
            targetIndex = index + 1;
        }
        
        if (targetIndex !== -1) {
            const pathOrders = {};
            // Assign base orders to spread them out
            siblings.forEach((id, i) => {
                const child = tree.get_node(id);
                child.data.order = i * 10;
            });
            
            // Swap
            const targetId = siblings[targetIndex];
            const targetNode = tree.get_node(targetId);
            
            const temp = node.data.order;
            node.data.order = targetNode.data.order;
            targetNode.data.order = temp;
            
            // Collect path orders
            siblings.forEach(id => {
                const child = tree.get_node(id);
                pathOrders[child.data.path] = child.data.order;
                const file = g('files').find(f => f.name === child.data.path);
                if (file) file.order = child.data.order;
            });
            
            saveOrdersFromPaths(pathOrders);
            loadFiles();
        }
    }

    function saveOrders() {
        const files = g('files');
        let orderFile = files.find(f => f.name === '.easypocketmd_orders');
        if (!orderFile) {
            orderFile = {
                id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                name: '.easypocketmd_orders',
                type: 'file',
                content: '{}',
                lastModified: Date.now(),
                isSynced: false
            };
            files.push(orderFile);
        }
        
        const orders = {};
        if (global.fileOrders) {
            Object.assign(orders, global.fileOrders);
        }
        
        files.forEach(f => {
            if (f.name !== '.easypocketmd_orders') {
                orders[f.name] = f.order || 0;
            }
        });
        
        orderFile.content = JSON.stringify(orders);
        orderFile.lastModified = Date.now();
        orderFile.isSynced = false;
        
        localStorage.setItem('vditor_files', JSON.stringify(files));
        
        if (g('currentUser')) {
            global.syncFileToServer(orderFile.id);
        }
    }

    // ---------- jstree 渲染及交互 ----------

    function getJsTreeData() {
        const files = g('files');
        const nodes = [];
        const pathMap = {}; // path -> id
        const existingPaths = new Set();
        
        // 1. 映射所有真实文件/文件夹的ID
        files.forEach(f => {
            pathMap[f.name] = f.id;
            existingPaths.add(f.name);
        });
        
        // 2. 收集所有需要创建节点的路径（包括中间路径）
        const allPaths = new Set();
        files.forEach(f => {
            if (f.name === '.easypocketmd_orders') return; // 过滤掉系统文件
            allPaths.add(f.name);
            let p = f.name;
            while(p.includes('/')) {
                p = getParentPath(p);
                if (p) allPaths.add(p);
            }
        });
        
        // 3. 为虚拟文件夹生成临时ID
        allPaths.forEach(p => {
            if (!pathMap[p]) {
                // 使用路径哈希生成相对稳定的ID
                let hash = 0;
                for (let i = 0; i < p.length; i++) {
                    hash = ((hash << 5) - hash) + p.charCodeAt(i);
                    hash |= 0; 
                }
                pathMap[p] = 'v_folder_' + Math.abs(hash);
            }
        });
        
        // 4. 生成节点数据
        allPaths.forEach(p => {
            const isReal = files.find(f => f.name === p);
            const parentPath = getParentPath(p);
            let parentId = parentPath ? pathMap[parentPath] : '#';
            if (parentPath && !parentId) {
                console.warn('Parent not found for path:', p, 'Parent path:', parentPath);
                parentId = '#'; // Fallback to root to make it visible
            }
            const text = getBasename(p);
            
            if (isReal) {
                nodes.push({
                    id: isReal.id,
                    parent: parentId,
                    text: text,
                    type: isReal.type,
                    state: { 
                        opened: false, // 由 state 插件管理
                        selected: isReal.id === g('currentFileId')
                    },
                    data: { path: p, type: isReal.type, isVirtual: false, order: isReal.order || 0 }
                });
            } else {
                nodes.push({
                    id: pathMap[p],
                    parent: parentId,
                    text: text,
                    type: 'folder',
                    state: { opened: false },
                    data: { path: p, type: 'folder', isVirtual: true, order: (global.fileOrders && global.fileOrders[p] !== undefined) ? global.fileOrders[p] : 0 }
                });
            }
        });

        // 按照 order 排序，同级元素比较
        const defaultSorting = g('userSettings') && g('userSettings').defaultSorting || 'modifiedTime';
        nodes.sort((a, b) => {
            const orderA = a.data.order;
            const orderB = b.data.order;
            if (orderA !== orderB) return orderA - orderB;
            
            // 如果 order 相同，根据默认排序方式排序
            if (defaultSorting === 'modifiedTime') {
                // 按修改时间排序（最新的在前）
                const fileA = g('files').find(f => f.name === a.data.path);
                const fileB = g('files').find(f => f.name === b.data.path);
                const timeA = fileA ? fileA.lastModified : 0;
                const timeB = fileB ? fileB.lastModified : 0;
                if (timeA !== timeB) return timeB - timeA; // 最新的在前
            } else if (defaultSorting === 'fileSize') {
                // 按文件大小排序（大的在前）
                const fileA = g('files').find(f => f.name === a.data.path);
                const fileB = g('files').find(f => f.name === b.data.path);
                const sizeA = fileA && fileA.type === 'file' ? (fileA.content ? fileA.content.length : 0) : 0;
                const sizeB = fileB && fileB.type === 'file' ? (fileB.content ? fileB.content.length : 0) : 0;
                if (sizeA !== sizeB) return sizeB - sizeA; // 大的在前
            }
            // alphabetical 或其他情况：按名称排序
            
            // 文件夹排前面
            if (a.data.type === 'folder' && b.data.type === 'file') return -1;
            if (a.data.type === 'file' && b.data.type === 'folder') return 1;
            return a.text.localeCompare(b.text);
        });
        
        return nodes;
    }

    function initFileTree() {
        if (!window.$ || !window.$.fn.jstree) {
            console.error('jQuery or jstree not loaded', window.$, window.$.fn.jstree);
            return;
        }

        // 确保 jstree 插件已注册
        if (!window.$.jstree) {
            console.warn('jstree object missing, attempting to re-init');
            // 这里可能无法直接重新加载，只能依赖全局加载顺序
        }

        const treeData = getJsTreeData();
        // console.log('Initializing file tree with data:', treeData);

        if (treeData.length === 0) {
            console.warn('File tree data is empty');
            document.getElementById('fileList').innerHTML = '<div style="padding:10px;color:#999;text-align:center;">' + (isEn() ? 'No files' : '暂无文件') + '</div>';
            return;
        }

        if (window.$.jstree.reference('#fileList')) {
            window.$.jstree.reference('#fileList').destroy();
        }

        let lastToggleTime = 0;
        function safeToggleNode(inst, node) {
            const now = Date.now();
            if (now - lastToggleTime < 300) return; // 300ms 内防止重复触发
            lastToggleTime = now;
            inst.toggle_node(node);
        }

        const tree = window.$('#fileList').jstree({
            'core': {
                'check_callback': true, // 允许所有操作
                'data': treeData,
                'dblclick_toggle': false, // 禁用默认的双击切换，由我们统一处理单击切换
                'themes': {
                    'name': 'default',
                    'responsive': true,
                    'dots': false,
                    'lines': false,
                    'icons': true
                }
            },
            'types': {
                'default': { 'icon': 'fas fa-folder' },
                'file': { 'icon': 'fas fa-file' },
                'folder': { 'icon': 'fas fa-folder' } },
            'plugins': ['types', 'contextmenu'],
            'contextmenu': {
                'select_node': false,
                'show_at_node': false,
                'shortcut_all': false,
                'items': function(node) {
                    const items = {
                        'rename': {
                            'label': isEn() ? 'Rename' : '重命名',
                            'action': function(data) {
                                const inst = window.$.jstree.reference(data.reference);
                                const obj = inst.get_node(data.reference);
                                
                                // 对于文件夹，如果是虚拟文件夹，则不允许重命名
                                if (obj.data.isVirtual) {
                                    g('customAlert')(isEn() ? 'Virtual folder cannot be renamed, please create as real folder first' : '虚拟文件夹不可重命名，请先创建为实体文件夹');
                                    return;
                                }

                                if (typeof renameFile === 'function') {
                                    renameFile(obj.id);
                                } else if (typeof global.renameFile === 'function') {
                                    global.renameFile(obj.id);
                                } else {
                                    console.error('renameFile function not found');
                                    g('customAlert')(isEn() ? 'Rename function not available' : '重命名功能不可用');
                                }
                            }
                        },
                        'move_up': {
                            'label': isEn() ? 'Move Up' : '上移',
                            'action': function(data) {
                                const inst = window.$.jstree.reference(data.reference);
                                const obj = inst.get_node(data.reference);
                                moveNodeOrder(obj.id, 'up');
                            }
                        },
                        'move_down': {
                            'label': isEn() ? 'Move Down' : '下移',
                            'action': function(data) {
                                const inst = window.$.jstree.reference(data.reference);
                                const obj = inst.get_node(data.reference);
                                moveNodeOrder(obj.id, 'down');
                            }
                        },
                        'move': {
                            'label': isEn() ? 'Move' : '移动',
                            'action': function(data) {
                                const inst = window.$.jstree.reference(data.reference);
                                const obj = inst.get_node(data.reference);
                                
                                // 对于文件夹，如果是虚拟文件夹，则不允许移动
                                if (obj.data.isVirtual) {
                                    g('customAlert')(isEn() ? 'Virtual folder cannot be moved, please create as real folder first' : '虚拟文件夹不可移动，请先创建为实体文件夹');
                                    return;
                                }
                                
                                global.moveFile(obj.id);
                            }
                        },
                        'history': {
                             'label': isEn() ? 'History Versions' : '历史版本',
                             'action': function(data) {
                                 const inst = window.$.jstree.reference(data.reference);
                                 const obj = inst.get_node(data.reference);
                                 if (obj.data.type === 'file') {
                                     global.showHistoryModal(obj.id, obj.data.path);
                                 }
                             }
                        },
                        'delete': {
                            'label': isEn() ? 'Delete' : '删除',
                            'action': function(data) {
                                const inst = window.$.jstree.reference(data.reference);
                                const obj = inst.get_node(data.reference);
                                if (obj.data.isVirtual) {
                                    g('customAlert')(isEn() ? 'Cannot delete virtual folder directly, please delete its contents' : '不能直接删除虚拟文件夹，请删除其子内容');
                                    return;
                                }
                                global.deleteFile(obj.id);
                            }
                        },
                        'new_file': {
                            'label': isEn() ? 'New File' : '新建文件',
                            'separator_before': true,
                            'action': function(data) {
                                const inst = window.$.jstree.reference(data.reference);
                                const obj = inst.get_node(data.reference);
                                const path = obj.data.path;
                                const baseName = isEn() ? 'New File' : '新文档';
                                const defaultName = getNextAvailableName(baseName, path);
                                g('customPrompt')(isEn() ? 'Please enter filename' : '请输入文件名', { defaultValue: defaultName }).then(function(name) {
                                    if (name) {
                                        const newPath = path + '/' + name;
                                        createFileAtPath(newPath);
                                    }
                                });
                            }
                        },
                        'new_folder': {
                            'label': isEn() ? 'New Folder' : '新建文件夹',
                            'action': function(data) {
                                const inst = window.$.jstree.reference(data.reference);
                                const obj = inst.get_node(data.reference);
                                const path = obj.data.path;
                                const baseName = isEn() ? 'New Folder' : '新文件夹';
                                const defaultName = getNextAvailableName(baseName, path);
                                g('customPrompt')(isEn() ? 'Please enter folder name' : '请输入文件夹名', { defaultValue: defaultName }).then(function(name) {
                                    if (name) {
                                        const newPath = path + '/' + name;
                                        createFolderAtPath(newPath);
                                    }
                                });
                            }
                        }
                    };
                    
                    if (node.type === 'file') {
                        delete items.new_file;
                        delete items.new_folder;
                    } else {
                        delete items.history;
                    }
                    
                    return items;
                }
            }
        })
        .on('select_node.jstree', function (e, data) {
            if (data.node.type === 'file') {
                if (g('currentFileId') !== data.node.id) {
                    if (g('currentFileId')) global.saveCurrentFile(true);
                    openFile(data.node.id);
                }
            } else if (data.node.type === 'folder') {
                safeToggleNode(data.instance, data.node);
                // 点击文件夹后，保持当前打开文件的选中状态
                const currentFileId = g('currentFileId');
                if (currentFileId && data.instance.get_node(currentFileId)) {
                    data.instance.deselect_node(data.node);
                    data.instance.select_node(currentFileId);
                }
            }
        })
        .on('click.jstree', function (e) {
            const inst = window.$.jstree.reference(e.target);
            const node = inst.get_node(e.target);
            if (node && node.type === 'folder') {
                const target = window.$(e.target);
                // 排除右侧菜单按钮和箭头（箭头 jstree 会默认处理，且不需要我们在这里 toggle）
                if ((target.hasClass('jstree-anchor') || target.closest('.jstree-anchor').length) && 
                    !target.hasClass('file-menu-btn') && 
                    !target.hasClass('jstree-ocl')) {
                    // 如果节点已经是选中状态，select_node 不会再次触发，所以我们需要在这里手动 toggle
                    if (inst.is_selected(node)) {
                        safeToggleNode(inst, node);
                    }
                }
            }
        })
        .on('rename_node.jstree', function (e, data) {
             if (data.text === data.old) return;
             if (data.node.data.isVirtual) {
                 g('customAlert')(isEn() ? 'Cannot rename virtual folder, please create as real folder first' : '无法重命名虚拟文件夹，请先创建实文件夹');
                 data.instance.refresh(); 
                 return;
             }
             renameFileInternal(data.node.id, data.text);
        })
        .on('loaded.jstree refresh.jstree open_node.jstree', function() {
            window.$('.jstree-anchor').each(function() {
                const nodeId = window.$(this).attr('id').replace('jstree_anchor_', '');
                if (!window.$(this).find('.file-menu-btn').length) {
                    const menuBtn = window.$('<i class="fas fa-ellipsis-v file-menu-btn"></i>');
                    menuBtn.click(function(e) {
                        e.stopPropagation();
                        e.preventDefault();
                        const node = window.$('#fileList').jstree(true).get_node(nodeId);
                        if (node) {
                            const rect = e.target.getBoundingClientRect();
                            let x = rect.left;
                            const y = rect.bottom;
                            
                            // 确保菜单不会超出屏幕右侧
                            const menuWidth = 200; // 估算的菜单宽度
                            if (x + menuWidth > window.innerWidth) {
                                x = window.innerWidth - menuWidth - 10;
                            }
                            
                            // 先移除已存在的菜单
                            window.$('.vakata-context').remove();
                            
                            // 显示上下文菜单
                            window.$('#fileList').jstree(true).show_contextmenu(node, x, y);
                            
                            // 阻止菜单点击事件冒泡，防止文件列表被关闭
                            setTimeout(function() {
                                const $context = window.$('.vakata-context');
                                if ($context.length) {
                                    $context.on('click', function(e) {
                                        e.stopPropagation();
                                        e.stopImmediatePropagation();
                                    });
                                }
                            }, 10);
                            
                            // 多次尝试设置位置，确保正确
                            const setPosition = function() {
                                const $context = window.$('.vakata-context');
                                if ($context.length) {
                                    // 再次检查和调整位置
                                    let finalX = x;
                                    const finalMenuWidth = $context.outerWidth() || 200;
                                    if (finalX + finalMenuWidth > window.innerWidth) {
                                        finalX = window.innerWidth - finalMenuWidth - 10;
                                    }
                                    
                                    $context.css({
                                        left: finalX,
                                        top: y,
                                        position: 'fixed',
                                        'z-index': 99999
                                    });
                                }
                            };
                            setPosition();
                            setTimeout(setPosition, 5);
                            setTimeout(setPosition, 50);
                        }
                    });
                    window.$(this).append(menuBtn);
                }
            });
        })
        .on('ready.jstree', function() {
            expandActiveFile();
            // 禁用长按和右键菜单，统一使用右侧三个点
            window.$('#fileList').on('contextmenu', function(e) {
                e.preventDefault();
                e.stopImmediatePropagation();
                return false;
            });
        });
    }

    function createFileAtPath(path) {
        path = normalizePath(path);
        ensureParentFolders(path);
        
        const files = g('files');
        if (files.some(f => f.name === path && f.type === 'file')) {
            g('customAlert')(isEn() ? 'File with the same name already exists' : '已存在同名文件');
            return;
        }

        const newFile = {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
            name: path,
            type: 'file',
            content: '# ' + getBasename(path) + '\n\n',
            lastModified: Date.now(),
            isSynced: false
        };
        files.push(newFile);
        localStorage.setItem('vditor_files', JSON.stringify(files));
        openFile(newFile.id);
        loadFiles();
        g('lastSyncedContent')[newFile.id] = newFile.content;
        g('unsavedChanges')[newFile.id] = false;
        if (g('currentUser')) global.syncFileToServer(newFile.id);
    }
    
    function createFolderAtPath(path) {
        path = normalizePath(path);
        ensureParentFolders(path);
        const files = g('files');
        if (files.some(f => f.name === path)) {
            g('customAlert')(isEn() ? 'This path already exists' : '该路径已存在');
            return;
        }
        const newFolder = {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
            name: path,
            type: 'folder',
            content: '',
            lastModified: Date.now(),
            isSynced: false
        };
        files.push(newFolder);
        localStorage.setItem('vditor_files', JSON.stringify(files));
        loadFiles();
        if (g('currentUser')) global.syncFileToServer(newFolder.id);
    }

    function renameFileInternal(id, newBasename) {
        const files = g('files');
        const item = files.find(f => f.id === id);
        if (!item) return;

        const isFolder = item.type === 'folder';
        const oldName = item.name;
        const parentPath = getParentPath(oldName);
        
        if (isNameExistsInParent(newBasename.trim(), parentPath, id)) {
            g('customAlert')(isEn() ? 'A file or folder with the same name already exists in this directory' : '该目录下已存在同名文件或文件夹');
            loadFiles(); 
            return;
        }

        const newName = parentPath ? parentPath + '/' + newBasename.trim() : newBasename.trim();

        if (isFolder) {
            renameFolderAndChildren(oldName, newName);
        } else {
            item.name = newName;
        }

        item.lastModified = Date.now();
        item.isSynced = false;
        localStorage.setItem('vditor_files', JSON.stringify(files));
        loadFiles();
        
        if (g('currentUser')) {
            if (isFolder) {
                global.deleteFileFromServer(oldName + '/').catch(e => {});
                global.syncFileToServer(id);
                const affectedFiles = files.filter(f => f.type === 'file' && (f.name.startsWith(newName + '/') || f.name === newName));
                affectedFiles.forEach(f => {
                    global.deleteFileFromServer(oldName + f.name.substring(newName.length)).catch(e=>{});
                    global.syncFileToServer(f.id);
                });
            } else {
                global.deleteFileFromServer(oldName).then(() => global.syncFileToServer(id));
            }
        }
    }

    function moveFileTo(id, targetPath) {
        const files = g('files');
        const item = files.find(f => f.id === id);
        if (!item) return;

        const oldName = item.name;
        const newBasename = getBasename(oldName);
        const newName = targetPath ? targetPath + '/' + newBasename : newBasename;

        if (newName === oldName) return;

        if (item.type === 'folder') {
            if (newName === oldName || newName.startsWith(oldName + '/')) {
                g('customAlert')(isEn() ? 'Cannot move folder to itself or its subdirectory' : '不能将文件夹移动到自身或其子目录中');
                loadFiles(); 
                return;
            }
        }

        if (files.some(f => f.name === newName && f.id !== id)) {
            g('customAlert')(isEn() ? 'An item with the same name already exists at the target location' : '目��位置已存在同名项');
            loadFiles(); 
            return;
        }

        if (item.type === 'folder') {
            renameFolderAndChildren(oldName, newName);
        } else {
            item.name = newName;
        }
        
        item.lastModified = Date.now();
        item.isSynced = false;

        localStorage.setItem('vditor_files', JSON.stringify(files));
        loadFiles();
        global.showMessage(isEn() ? `${item.type === 'folder' ? 'Folder' : 'File'} moved` : `${item.type === 'folder' ? '文件夹' : '文件'}已移动`);
        
        if (g('currentUser')) {
             if (item.type === 'folder') {
                global.deleteFileFromServer(oldName + '/').catch(e => {});
                global.syncFileToServer(id);
                const affectedFiles = files.filter(f => f.type === 'file' &&
                    (f.name.startsWith(newName + '/') || f.name === newName));
                affectedFiles.forEach(f => {
                    global.deleteFileFromServer(oldName +
                        f.name.substring(newName.length)).catch(e=>{});
                    global.syncFileToServer(f.id);
                });
            } else {
                global.deleteFileFromServer(oldName).then(() =>
                    global.syncFileToServer(item.id));
            }
        }
    }

    function expandActiveFile() {
        const currentFileId = g('currentFileId');
        if (!currentFileId) return;
        
        // 检查 jQuery 和 jstree 是否已加载
        if (!window.$ || !window.$.jstree) return;

        const tree = window.$.jstree.reference('#fileList');
        if (tree) {
            const node = tree.get_node(currentFileId);
            if (node) {
                // Ensure selection
                if (!tree.is_selected(node)) {
                    tree.deselect_all(true);
                    tree.select_node(node);
                }
                // Ensure visible (expand parents)
                if (node.parents) {
                    node.parents.forEach(function(p) {
                        tree.open_node(p);
                    });
                }
            }
        }
    }

    function loadFiles() {
        const fileListSidebar = document.getElementById('fileListSidebar');
        const wasVisible = fileListSidebar && fileListSidebar.classList.contains('show');
        loadOrders();
        initFileTree();
        if (wasVisible && fileListSidebar) {
            fileListSidebar.classList.add('show');
        }
    }

    // ---------- 文件操作函数 ----------
    function moveFile(id) {
        const files = g('files');
        const item = files.find(f => f.id === id);
        if (!item) return;

        // 动态获取当前所有可用的文件夹路径（包括没有显式建文件夹记录的虚拟路径）
        const folders = getAllFolderPaths();

        // 创建自定义模态框进行选择
        const nightMode = document.body.classList.contains('night-mode');
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10005;';
        
        const content = document.createElement('div');
        content.className = 'modal';
        const bgColor = nightMode ? '#2d2d2d' : 'white';
        const textColor = nightMode ? '#eee' : '#333';
        const borderColor = nightMode ? '#444' : '#eee';
        const itemHoverBg = nightMode ? '#3d3d3d' : '#f0f0f0';
        const itemNormalBg = nightMode ? '#2d2d2d' : 'white';
        
        content.style.cssText = `width:90%;max-width:400px;max-height:80vh;display:flex;flex-direction:column;padding:20px;background:${bgColor};color:${textColor};border-radius:8px;`;
        
        const header = document.createElement('h3');
        header.textContent = isEn() ? 'Move to...' : '移动到...';
        header.style.margin = '0 0 15px 0';
        
        const list = document.createElement('div');
        list.style.cssText = `flex:1;overflow-y:auto;border:1px solid ${borderColor};border-radius:4px;margin-bottom:15px;`;
        
        const isFolder = item.type === 'folder';
        const currentPath = item.name;

        folders.forEach((f, idx) => {
            // 如果是移动文件夹，检查是否是自己或子目录
            const isSelfOrChild = isFolder && (f === currentPath || f.startsWith(currentPath + '/'));
            
            const div = document.createElement('div');
            div.style.cssText = `padding:10px;cursor:pointer;border-bottom:1px solid ${borderColor};display:flex;align-items:center;background:${itemNormalBg};`;
            if (isSelfOrChild) {
                div.style.color = '#ccc';
                div.style.cursor = 'not-allowed';
            }
            
            div.innerHTML = `<i class="fas fa-folder" style="color:${isSelfOrChild ? '#eee' : '#f7b731'};margin-right:10px;"></i> ${f === '' ? (isEn() ? 'Root' : '根目录') : f}`;
            
            if (!isSelfOrChild) {
                div.onmouseover = () => div.style.background = itemHoverBg;
                div.onmouseout = () => div.style.background = itemNormalBg;
                div.onclick = () => {
                    moveFileTo(id, f);
                    modal.remove();
                };
            }
            list.appendChild(div);
        });
        
        const closeBtn = document.createElement('button');
        closeBtn.textContent = isEn() ? 'Cancel' : '取消';
        closeBtn.className = 'modal-btn secondary';
        closeBtn.style.alignSelf = 'flex-end';
        closeBtn.onclick = () => modal.remove();
        
        content.appendChild(header);
        content.appendChild(list);
        content.appendChild(closeBtn);
        modal.appendChild(content);
        document.body.appendChild(modal);
    }

    function renameFile(id) {
        const files = g('files');
        const item = files.find(f => f.id === id);
        if (!item) return;

        const isFolder = item.type === 'folder';
        const oldName = item.name;
        const parentPath = getParentPath(oldName);
        const oldBasename = getBasename(oldName);

        g('customPrompt')(isEn() ? `Please enter the new ${isFolder ? 'folder' : 'file'} name:` : `请输入新的${isFolder ? '文件夹' : '文件'}名：`, { defaultValue: oldBasename }).then(function(newBasename) {
            if (!newBasename || newBasename.trim() === oldBasename) return;

            if (isNameExistsInParent(newBasename.trim(), parentPath, id)) {
                g('customAlert')(isEn() ? 'A file or folder with the same name already exists in this directory, please use another name' : '该目录下已存在同名文件或文件夹，请使用其他名称');
                return;
            }

            const newName = parentPath ? parentPath + '/' + newBasename.trim() : newBasename.trim();

            if (isFolder) {
                renameFolderAndChildren(oldName, newName);
            } else {
                item.name = newName;
            }

            item.lastModified = Date.now();
            item.isSynced = false;
            localStorage.setItem('vditor_files', JSON.stringify(files));
            loadFiles();
            global.showMessage(isEn() ? `${isFolder ? 'Folder' : 'File'} renamed` : `${isFolder ? '文件夹' : '文件'}已重命名`);
            if (g('currentUser')) {
                if (isFolder) {
                    const affectedFiles = files.filter(f => f.type === 'file' && (f.name.startsWith(newName + '/') || f.name === newName));
                    affectedFiles.forEach(f => global.syncFileToServer(f.id));
                } else {
                    global.deleteFileFromServer(oldName).then(() => global.syncFileToServer(id));
                }
            }
        });
    }

    function createDefaultFile() {
        const defaultFile = {
            id: Date.now().toString(),
            name: isEn() ? 'Untitled' : '未命名文档', // 无前导斜杠
            type: 'file',
            content: isEn() ? '# Welcome to EasyPocketMD\n\nThis is a new document. \n\nStart writing!' : '# 欢迎使用 EasyPocketMD\n\n这是一个新的文档。\n\n开始编写吧！',
            lastModified: Date.now(),
            isSynced: false
        };
        global.files.push(defaultFile);
        localStorage.setItem('vditor_files', JSON.stringify(global.files));
        global.currentFileId = defaultFile.id;
        if (g('vditor')) g('vditor').setValue(defaultFile.content);
        loadFiles();
        g('lastSyncedContent')[defaultFile.id] = defaultFile.content;
        g('unsavedChanges')[defaultFile.id] = false;
    }

    function getSelectedFolderPath() {
        if (!window.$ || !window.$.jstree) return '';
        const tree = window.$.jstree.reference('#fileList');
        if (!tree) return '';
        const selected = tree.get_selected(true);
        if (selected && selected.length > 0) {
            const node = selected[0];
            if (node.data.type === 'folder') {
                return node.data.path + '/';
            } else if (node.data.type === 'file') {
                const parentPath = getParentPath(node.data.path);
                return parentPath ? parentPath + '/' : '';
            }
        }
        return '';
    }

    function createNewFile() {
        const defaultName = isEn() ? 'New Document' : '新文档';
        const defaultPath = getSelectedFolderPath() + defaultName;
        g('customPrompt')(isEn() ? 'Please enter filename (to create in a folder, ensure the folder exists, e.g., docs/note)' : '请输入文件名（如需在文件夹中创建，请确保文件夹已存在，例如 docs/note）', { defaultValue: defaultPath }).then(function(input) {
            if (!input) return;

            let path = normalizePath(input);
            
            // 检查父文件夹是否存在
            const parentPath = getParentPath(path);
            const files = g('files');
            
            if (parentPath) {
                const parentExists = files.some(f => f.name === parentPath && f.type === 'folder');
                if (!parentExists) {
                    g('customAlert')(isEn() ? 'Parent folder "' + parentPath + '" does not exist, please create it first using "New Folder"' : '父文件夹 "' + parentPath + '" 不存在，请先使用“新建文件夹”功能创建');
                    return;
                }
            }

            if (files.some(f => f.name === path && f.type === 'file')) {
                g('customAlert')(isEn() ? 'File with the same name already exists, please use another name' : '已存在同名文件，请使用其他名称');
                return;
            }

            const newFile = {
                id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                name: path,
                type: 'file',
                content: '# ' + getBasename(path) + '\n\n开始编写您的内容...',
                lastModified: Date.now(),
                isSynced: false,
                order: 0
            };
            files.push(newFile);
            localStorage.setItem('vditor_files', JSON.stringify(files));
            openFile(newFile.id);
            loadFiles();
            g('lastSyncedContent')[newFile.id] = newFile.content;
            g('unsavedChanges')[newFile.id] = false;
            if (g('currentUser')) global.syncFileToServer(newFile.id);
            global.showMessage(isEn() ? 'File created: ' + path : '已创建文件: ' + path);
        });
    }

    function createNewFolder() {
        const defaultName = isEn() ? 'New Folder' : '新文件夹';
        const defaultPath = getSelectedFolderPath() + defaultName;
        g('customPrompt')(isEn() ? 'Please enter folder path (e.g., docs/notes)' : '请输入文件夹路径（例如 docs/notes）', { defaultValue: defaultPath }).then(function(input) {
            if (!input) return;

            let path = normalizePath(input);
            ensureParentFolders(path);

            const files = g('files');
            if (files.some(f => f.name === path)) {
                g('customAlert')(isEn() ? 'This path already exists' : '该路径已存在');
                return;
            }

            const newFolder = {
                id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                name: path,
                type: 'folder',
                content: '',
                lastModified: Date.now(),
                isSynced: false,
                order: 0
            };
            files.push(newFolder);
            localStorage.setItem('vditor_files', JSON.stringify(files));
            loadFiles();
            if (g('currentUser')) {
                global.syncFileToServer(newFolder.id);
            }
            global.showMessage(isEn() ? 'Folder created: ' + path : '已创建文件夹: ' + path);
        });
    }

    async function openFile(fileId) {
        // 先保存当前文档
        if (typeof global.saveCurrentFile === 'function' && g('currentFileId')) {
            await global.saveCurrentFile(true);
        }

        const files = g('files');
        const file = files.find(f => f.id === fileId && f.type === 'file');
        if (!file) {
            g('customAlert')(isEn() ? 'Cannot open folder' : '无法打开文件夹');
            return;
        }
        global.currentFileId = fileId;
        
        // 记录最后打开的文件
        localStorage.setItem('vditor_last_opened_file', fileId);
        
        let content = file.content;
        if (global.LocalImageManager && global.LocalImageManager.convertLocalToBlob) {
            try {
                content = await global.LocalImageManager.convertLocalToBlob(content);
            } catch (e) {
                console.error('Failed to convert local images to blob:', e);
            }
        }
        
        if (g('vditor')) g('vditor').setValue(content);

        await activateOwnerSharedSession(file, content);

        expandActiveFile();
        global.startAutoSave();
        global.showMessage(isEn() ? 'File opened: ' + file.name : '已打开文件: ' + file.name);
    }

    async function deleteFile(id) {
        const files = g('files');
        const item = files.find(f => f.id === id);
        if (!item) return;

        if (item.type === 'file') {
            if (files.filter(f => f.type === 'file').length <= 1) {
                g('customAlert')(isEn() ? 'At least one file must be kept' : '至少需要保留一个文件');
                return;
            }
            const confirmed = await g('customConfirm')(isEn() ? 'Are you sure you want to delete this file?' : '确定要删除这个文件吗？');
            if (!confirmed) return;

            const idx = files.findIndex(f => f.id === id);
            files.splice(idx, 1);
            localStorage.setItem('vditor_files', JSON.stringify(files));

            if (g('currentUser')) global.deleteFileFromServer(item.name);
            delete g('lastSyncedContent')[id];
            delete g('unsavedChanges')[id];

            if (id === g('currentFileId')) {
                const firstFile = files.find(f => f.type === 'file');
                if (firstFile) openFile(firstFile.id);
                else createDefaultFile();
            }
            loadFiles();
            global.showMessage(isEn() ? 'File deleted: ' + item.name : '已删除文件: ' + item.name);
        } else {
            const confirmed = await g('customConfirm')(isEn() ? `Are you sure you want to delete the folder "${item.name}" and all its contents?` : `确定要删除文件夹“${item.name}”及其所有内容吗？`);
            if (!confirmed) return;

            const toDelete = files.filter(f => f.name === item.name || f.name.startsWith(item.name + '/'));
            const fileNamesToDelete = toDelete.filter(f => f.type === 'file').map(f => f.name);

            deleteFolderAndChildren(item.name);
            localStorage.setItem('vditor_files', JSON.stringify(files));

            if (g('currentUser')) {
                fileNamesToDelete.forEach(name => global.deleteFileFromServer(name));
                // 只有当文件夹本身已同步（即服务器存在记录）时，才发送删除请求
                if (item.isSynced) {
                    global.deleteFileFromServer(item.name + '/');
                }
            }

            toDelete.forEach(f => {
                delete g('lastSyncedContent')[f.id];
                delete g('unsavedChanges')[f.id];
            });

            if (id === g('currentFileId') || toDelete.some(f => f.id === g('currentFileId'))) {
                const firstFile = files.find(f => f.type === 'file');
                if (firstFile) openFile(firstFile.id);
                else createDefaultFile();
            }
            loadFiles();
            global.showMessage(isEn() ? 'Folder deleted: ' + item.name : '已删除文件夹: ' + item.name);
        }
    }

    async function saveCurrentFile(isManual) {
        isManual = isManual !== false;
        const currentFileId = g('currentFileId');
        const vditor = g('vditor');
        if (!currentFileId || !vditor) return;
        const files = g('files');
        const fileIndex = files.findIndex(function(f) { return f.id === currentFileId && f.type === 'file'; });
        if (fileIndex === -1) return;
        let content = vditor.getValue();

        if (global.LocalImageManager && global.LocalImageManager.convertBlobToLocal) {
            try {
                content = global.LocalImageManager.convertBlobToLocal(content);
            } catch (e) {
                console.error('Failed to convert blob images to local:', e);
            }
        }

        const file = files[fileIndex];
        const contentChanged = content !== file.content;
        file.content = content;
        file.lastModified = Date.now();
        localStorage.setItem('vditor_files', JSON.stringify(files));
        g('unsavedChanges')[currentFileId] = false;

        // 在线共享文档由 share websocket/update 通道负责写入，避免 owner 普通保存覆盖实时协作状态。
        if (
            global.sharedDocState &&
            global.sharedDocState.canEdit &&
            global.sharedDocState.ownerFileId === currentFileId &&
            typeof global.scheduleSharedDocSync === 'function'
        ) {
            global.scheduleSharedDocSync();
            return;
        }

        // 保存成功后清除草稿（因为已经正式保存到 localStorage）
        if (global.draftRecovery) {
            global.draftRecovery.clearDraft();
        }

        if (g('currentUser')) {
            // 保存即触发服务器同步；失败则保留 pending 标记，稍后会自动补齐同步
            markPendingServerSync(currentFileId, true);
            try {
                const saveResult = await global.syncFileToServer(currentFileId);
                if (isManual && contentChanged && saveResult) {
                    try { await global.createHistoryVersion(file.name, content); } catch (e) { console.warn('创建历史版本失败', e); }
                }
                if (saveResult) markPendingServerSync(currentFileId, false);
            } catch (e) {
                // 保持 pending
            }
        }
    }

    async function createHistoryVersion(filename, content) {
        if (!g('currentUser')) return false;
        try {
            var api = global.getApiBaseUrl ? global.getApiBaseUrl() : 'api';
            const response = await fetch(api + '/files/history/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + g('currentUser').token },
                body: JSON.stringify({ username: g('currentUser').username, filename: filename, content: content, timestamp: Date.now() })
            });
            const result = global.parseJsonResponse ? await global.parseJsonResponse(response) : await response.json();
            return result.code === 200;
        } catch (e) { console.error('创建历史版本失败', e); throw e; }
    }

    async function getFileHistory(filename) {
        if (!g('currentUser')) return [];
        try {
            var api = global.getApiBaseUrl ? global.getApiBaseUrl() : 'api';
            const url = api + '/files/history/list?username=' + encodeURIComponent(g('currentUser').username) + '&filename=' + encodeURIComponent(filename);

            // 使用 authenticatedFetch 自动处理 Token 过期
            let result;
            if (global.authenticatedFetch) {
                result = await global.authenticatedFetch(url, { method: 'GET' });
            } else {
                // 降级处理：使用普通 fetch
                const response = await fetch(url, {
                    method: 'GET',
                    headers: { 'Authorization': 'Bearer ' + g('currentUser').token }
                });
                result = global.parseJsonResponse ? await global.parseJsonResponse(response) : await response.json();

                // 检查 Token 错误
                if (global.isTokenError && global.isTokenError(result)) {
                    const handled = await global.handleTokenExpired();
                    if (handled) {
                        // 重试
                        const retryResponse = await fetch(url, {
                            method: 'GET',
                            headers: { 'Authorization': 'Bearer ' + g('currentUser').token }
                        });
                        result = global.parseJsonResponse ? await global.parseJsonResponse(retryResponse) : await retryResponse.json();
                    } else {
                        return [];
                    }
                }
            }

            return (result.code === 200 && result.data && result.data.history) ? result.data.history : [];
        } catch (e) {
            console.error('获取历史版本失败', e);
            // 如果是 Token 错误，显示友好提示
            if (e.message && (e.message.includes('sessionExpired') || e.message.includes('过期'))) {
                return [];
            }
            return [];
        }
    }

    // 当前历史版本选择状态
    let selectedHistoryVersions = new Set();
    let currentHistoryFileId = null;
    let currentHistoryFilename = null;

    async function showHistoryModal(fileId, filename) {
        const modal = document.getElementById('historyModalOverlay');
        const historyList = document.getElementById('historyList');
        const historyFileName = document.getElementById('historyFileName');
        if (!modal || !historyList || !historyFileName) return;

        // 重置选择状态
        selectedHistoryVersions.clear();
        currentHistoryFileId = fileId;
        currentHistoryFilename = filename;
        updateHistoryBatchToolbar();

        historyFileName.textContent = filename;
        modal.classList.add('show');
        historyList.innerHTML = '<div class="history-loading"><i class="fas fa-spinner fa-spin"></i> ' + (isEn() ? 'Loading history versions...' : '正在加载历史版本...') + '</div>';

        // 绑定批量操作事件
        bindHistoryBatchEvents(fileId, filename);

        try {
            const history = await getFileHistory(filename);
            if (history.length === 0) {
                historyList.innerHTML = '<div class="history-loading">' + (isEn() ? 'No history versions' : '暂无历史版本') + '</div>';
                // 隐藏批量操作工具栏
                const batchToolbar = document.getElementById('historyBatchToolbar');
                if (batchToolbar) batchToolbar.style.display = 'none';
                return;
            }

            // 显示批量操作工具栏
            const batchToolbar = document.getElementById('historyBatchToolbar');
            if (batchToolbar) batchToolbar.style.display = 'flex';

            const files = g('files');
            const currentFile = files.find(function(f) { return f.id === fileId; });
            const currentContent = currentFile ? currentFile.content : '';
            historyList.innerHTML = '';

            history.forEach(function(version, index) {
                const versionEl = document.createElement('div');
                versionEl.className = 'history-version' + (index === 0 ? ' history-version-current' : '');
                versionEl.dataset.versionId = version.version_id;

                const date = new Date(version.timestamp).toLocaleString();
                const contentPreview = version.content.substring(0, 200) + (version.content.length > 200 ? '...' : '');

                // 添加复选框（当前版本除外）
                const checkboxHtml = index > 0 ? '<input type="checkbox" class="history-version-checkbox" data-version-id="' + version.version_id + '">' : '';

                versionEl.innerHTML = checkboxHtml + '<div class="history-version-content-wrapper"><div class="history-version-header"><div class="history-version-title">' + (isEn() ? 'Version ' : '版本 ') + version.version_id + (index === 0 ? ' <span style="color:#4CAF50;font-size:12px;">(' + (isEn() ? 'Current' : '当前') + ')</span>' : '') + '</div><div class="history-version-date">' + date + '</div></div><div class="history-version-content">' + global.escapeHtml(contentPreview) + '</div><div class="history-version-actions"><button class="modal-btn small preview-btn"><i class="fas fa-eye"></i> ' + (isEn() ? 'Preview' : '预览') + '</button>' + (index > 0 ? '<button class="modal-btn small primary restore-btn"><i class="fas fa-history"></i> ' + (isEn() ? 'Restore' : '恢复') + '</button>' : '') + '<button class="modal-btn small delete-history-btn"><i class="fas fa-trash"></i> ' + (isEn() ? 'Delete' : '删除') + '</button></div></div>';

                // 绑定复选框事件
                if (index > 0) {
                    const checkbox = versionEl.querySelector('.history-version-checkbox');
                    if (checkbox) {
                        checkbox.addEventListener('change', function(e) {
                            e.stopPropagation();
                            if (this.checked) {
                                selectedHistoryVersions.add(version.version_id);
                                versionEl.classList.add('selected');
                            } else {
                                selectedHistoryVersions.delete(version.version_id);
                                versionEl.classList.remove('selected');
                            }
                            updateHistoryBatchToolbar();
                        });
                    }
                }

                var previewBtn = versionEl.querySelector('.preview-btn');
                if (previewBtn) previewBtn.addEventListener('click', function(e) { e.stopPropagation(); global.previewHistoryVersion(filename, version.version_id, version.content, version.timestamp); });
                if (index > 0) {
                    var restoreBtn = versionEl.querySelector('.restore-btn');
                    if (restoreBtn) restoreBtn.addEventListener('click', function(e) { e.stopPropagation(); global.restoreFromHistory(filename, version.version_id, version.content, fileId); });
                }
                var deleteBtn = versionEl.querySelector('.delete-history-btn');
                if (deleteBtn) deleteBtn.addEventListener('click', function(e) { e.stopPropagation(); e.preventDefault(); global.deleteHistoryVersion(filename, version.version_id, version.history_id || '', fileId); });

                historyList.appendChild(versionEl);
            });
        } catch (error) {
            historyList.innerHTML = '<div class="history-loading">' + (isEn() ? 'Load failed: ' : '加载失败: ') + error.message + '</div>';
        }
    }

    function bindHistoryBatchEvents(fileId, filename) {
        // 全选/取消全选
        const selectAllCheckbox = document.getElementById('historySelectAllCheckbox');
        const selectAllText = document.getElementById('historySelectAllText');
        const batchDeleteBtn = document.getElementById('historyBatchDeleteBtn');
        const clearAllBtn = document.getElementById('historyClearAllBtn');

        if (selectAllCheckbox) {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.onclick = function() {
                const checkboxes = document.querySelectorAll('.history-version-checkbox');
                const versionEls = document.querySelectorAll('.history-version');

                if (this.checked) {
                    checkboxes.forEach(function(cb, idx) {
                        cb.checked = true;
                        selectedHistoryVersions.add(parseInt(cb.dataset.versionId));
                        if (versionEls[idx]) versionEls[idx].classList.add('selected');
                    });
                    if (selectAllText) selectAllText.textContent = isEn() ? 'Deselect All' : '取消全选';
                } else {
                    checkboxes.forEach(function(cb, idx) {
                        cb.checked = false;
                        selectedHistoryVersions.delete(parseInt(cb.dataset.versionId));
                        if (versionEls[idx]) versionEls[idx].classList.remove('selected');
                    });
                    if (selectAllText) selectAllText.textContent = isEn() ? 'Select All' : '全选';
                }
                updateHistoryBatchToolbar();
            };
        }

        // 批量删除按钮
        if (batchDeleteBtn) {
            batchDeleteBtn.onclick = function() {
                if (selectedHistoryVersions.size === 0) {
                    global.showMessage(isEn() ? 'Please select history versions to delete' : '请先选择要删除的历史版本', 'warning');
                    return;
                }
                showBatchDeleteConfirmModal(filename, Array.from(selectedHistoryVersions), fileId);
            };
        }

        // 清空全部按钮
        if (clearAllBtn) {
            clearAllBtn.onclick = function() {
                showClearAllConfirmModal(filename, fileId);
            };
        }
    }

    function updateHistoryBatchToolbar() {
        const selectedCountEl = document.getElementById('historySelectedCount');
        const batchDeleteBtn = document.getElementById('historyBatchDeleteBtn');
        const selectAllText = document.getElementById('historySelectAllText');

        if (selectedHistoryVersions.size > 0) {
            if (selectedCountEl) {
                selectedCountEl.style.display = 'flex';
                selectedCountEl.textContent = (isEn() ? '' : '已选择 ') + selectedHistoryVersions.size + (isEn() ? ' selected' : ' 项');
            }
            if (batchDeleteBtn) batchDeleteBtn.style.display = 'inline-flex';
        } else {
            if (selectedCountEl) selectedCountEl.style.display = 'none';
            if (batchDeleteBtn) batchDeleteBtn.style.display = 'none';
        }

        // 更新全选文字
        const checkboxes = document.querySelectorAll('.history-version-checkbox');
        const allChecked = checkboxes.length > 0 && Array.from(checkboxes).every(function(cb) { return cb.checked; });
        if (selectAllText) {
            selectAllText.textContent = allChecked ? (isEn() ? 'Deselect All' : '取消全选') : (isEn() ? 'Select All' : '全选');
        }
    }

    function showBatchDeleteConfirmModal(filename, versionIds, fileId) {
        var nightMode = g('nightMode') === true;
        var confirmModal = document.createElement('div');
        confirmModal.className = 'modal-overlay';
        confirmModal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:10001;';
        var modalContent = document.createElement('div');
        var bgColor = nightMode ? '#2d2d2d' : 'white';
        var textColor = nightMode ? '#eee' : '#333';
        var secondaryTextColor = nightMode ? '#aaa' : '#666';
        modalContent.style.cssText = 'background:' + bgColor + ';color:' + textColor + ';border-radius:12px;padding:25px;max-width:90%;';
        modalContent.innerHTML = '<div class="modal-header" style="text-align:center;margin-bottom:20px;"><h2 style="margin:0 0 10px 0;color:#dc3545;">' + (isEn() ? 'Batch Delete Confirmation' : '批量删除确认') + '</h2><p style="color:' + secondaryTextColor + ';margin:0;">' + (isEn() ? 'Are you sure you want to delete the selected history versions?' : '确定要删除选中的历史版本吗？') + '</p></div><div style="margin:15px 0;text-align:center;"><strong style="color:#dc3545;font-size:18px;">' + versionIds.length + '</strong> ' + (isEn() ? 'versions will be deleted' : '个版本将被删除') + '</div><div style="display:flex;gap:10px;justify-content:center;margin-top:25px;"><button class="delete-confirm-cancel" style="padding:10px 24px;background:' + (nightMode ? '#555' : '#6c757d') + ';color:white;border:none;border-radius:6px;cursor:pointer;">' + (isEn() ? 'Cancel' : '取消') + '</button><button class="delete-confirm-ok" style="padding:10px 24px;background:#dc3545;color:white;border:none;border-radius:6px;cursor:pointer;">' + (isEn() ? 'Confirm Delete' : '确认删除') + '</button></div>';
        confirmModal.appendChild(modalContent);
        document.body.appendChild(confirmModal);
        var cancelBtn = modalContent.querySelector('.delete-confirm-cancel');
        var confirmBtn = modalContent.querySelector('.delete-confirm-ok');
        cancelBtn.onclick = function() { global.removeModal(confirmModal); };
        confirmBtn.onclick = function() {
            confirmBtn.disabled = true;
            confirmBtn.textContent = isEn() ? 'Deleting...' : '删除中...';
            performBatchDeleteHistory(filename, versionIds, fileId, confirmModal);
        };
        confirmModal.addEventListener('click', function(e) { if (e.target === confirmModal) global.removeModal(confirmModal); });
        var handleKeydown = function(e) { if (e.key === 'Escape') { global.removeModal(confirmModal); document.removeEventListener('keydown', handleKeydown); } };
        document.addEventListener('keydown', handleKeydown);
        confirmModal.removeKeydownHandler = function() { document.removeEventListener('keydown', handleKeydown); };
    }

    async function performBatchDeleteHistory(filename, versionIds, fileId, modalElement) {
        try {
            var success = await deleteHistoryVersionBatchAPI(filename, versionIds);
            if (success) {
                global.removeModal(modalElement);
                global.showMessage((isEn() ? 'Batch delete successful, deleted ' : '批量删除成功，已删除 ') + versionIds.length + (isEn() ? ' versions' : ' 个版本'), 'success');
                selectedHistoryVersions.clear();
                // 刷新列表
                setTimeout(function() { global.showHistoryModal(fileId, filename); }, 500);
            } else throw new Error(isEn() ? 'Delete failed' : '删除失败');
        } catch (error) {
            console.error('批量删除历史版本失败', error);
            global.showMessage((isEn() ? 'Batch delete failed: ' : '批量删除失败: ') + error.message, 'error');
        }
    }

    async function deleteHistoryVersionBatchAPI(filename, versionIds) {
        if (!g('currentUser')) return false;
        try {
            var api = global.getApiBaseUrl ? global.getApiBaseUrl() : 'api';
            var response = await fetch(api + '/files/history/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + g('currentUser').token },
                body: JSON.stringify({ username: g('currentUser').username, filename: filename, version_ids: versionIds })
            });
            var result = global.parseJsonResponse ? await global.parseJsonResponse(response) : await response.json();
            return result.code === 200;
        } catch (e) { throw e; }
    }

    function showClearAllConfirmModal(filename, fileId) {
        var nightMode = g('nightMode') === true;
        var confirmModal = document.createElement('div');
        confirmModal.className = 'modal-overlay';
        confirmModal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:10001;';
        var modalContent = document.createElement('div');
        var bgColor = nightMode ? '#2d2d2d' : 'white';
        var textColor = nightMode ? '#eee' : '#333';
        var secondaryTextColor = nightMode ? '#aaa' : '#666';
        modalContent.style.cssText = 'background:' + bgColor + ';color:' + textColor + ';border-radius:12px;padding:25px;max-width:90%;';
        modalContent.innerHTML = '<div class="modal-header" style="text-align:center;margin-bottom:20px;"><h2 style="margin:0 0 10px 0;color:#dc3545;"><i class="fas fa-exclamation-triangle"></i> ' + (isEn() ? 'Clear All History' : '清空全部历史') + '</h2><p style="color:' + secondaryTextColor + ';margin:0;">' + (isEn() ? 'Are you sure you want to clear ALL history versions?' : '确定要清空该文件的所有历史版本吗？') + '</p></div><div style="margin:15px 0;text-align:center;color:#dc3545;font-weight:bold;">' + (isEn() ? 'This action cannot be undone!' : '此操作不可恢复！') + '</div><div style="margin:10px 0;text-align:center;color:' + secondaryTextColor + ';">' + (isEn() ? 'File: ' : '文件：') + global.escapeHtml(filename) + '</div><div style="display:flex;gap:10px;justify-content:center;margin-top:25px;"><button class="delete-confirm-cancel" style="padding:10px 24px;background:' + (nightMode ? '#555' : '#6c757d') + ';color:white;border:none;border-radius:6px;cursor:pointer;">' + (isEn() ? 'Cancel' : '取消') + '</button><button class="delete-confirm-ok" style="padding:10px 24px;background:#dc3545;color:white;border:none;border-radius:6px;cursor:pointer;">' + (isEn() ? 'Confirm Clear All' : '确认清空全部') + '</button></div>';
        confirmModal.appendChild(modalContent);
        document.body.appendChild(confirmModal);
        var cancelBtn = modalContent.querySelector('.delete-confirm-cancel');
        var confirmBtn = modalContent.querySelector('.delete-confirm-ok');
        cancelBtn.onclick = function() { global.removeModal(confirmModal); };
        confirmBtn.onclick = function() {
            confirmBtn.disabled = true;
            confirmBtn.textContent = isEn() ? 'Clearing...' : '清空中...';
            performClearAllHistory(filename, fileId, confirmModal);
        };
        confirmModal.addEventListener('click', function(e) { if (e.target === confirmModal) global.removeModal(confirmModal); });
        var handleKeydown = function(e) { if (e.key === 'Escape') { global.removeModal(confirmModal); document.removeEventListener('keydown', handleKeydown); } };
        document.addEventListener('keydown', handleKeydown);
        confirmModal.removeKeydownHandler = function() { document.removeEventListener('keydown', handleKeydown); };
    }

    async function performClearAllHistory(filename, fileId, modalElement) {
        try {
            var success = await deleteHistoryVersionAPI(filename, 0); // version_id = 0 表示删除全部
            if (success) {
                global.removeModal(modalElement);
                global.showMessage(isEn() ? 'All history versions cleared' : '已清空所有历史版本', 'success');
                selectedHistoryVersions.clear();
                // 关闭模态框
                var historyModal = document.getElementById('historyModalOverlay');
                if (historyModal) historyModal.classList.remove('show');
            } else throw new Error(isEn() ? 'Clear failed' : '清空失败');
        } catch (error) {
            console.error('清空历史版本失败', error);
            global.showMessage((isEn() ? 'Clear failed: ' : '清空失败: ') + error.message, 'error');
        }
    }

    function startAutoSave() {
        global.clearAutoSave();
        // 缩短自动保存间隔到 1 秒，更快保存到 localStorage
        global.autoSaveTimer = setTimeout(function() {
            global.saveCurrentFile();
            // 保存后清除草稿（因为已经正式保存了）
            if (global.draftRecovery) {
                global.draftRecovery.clearDraft();
            }
        }, 1000);
    }

    function clearAutoSave() {
        if (global.autoSaveTimer) { clearTimeout(global.autoSaveTimer); global.autoSaveTimer = null; }
    }

    function startAutoSync() {
        if (global.syncInterval) clearInterval(global.syncInterval);
        global.syncInterval = setInterval(function() { if (g('currentUser')) global.syncAllFiles(); }, 30000);
    }

    function stopAutoSync() {
        if (global.syncInterval) { clearInterval(global.syncInterval); global.syncInterval = null; }
    }

    async function syncAllFiles() {
        if (!g('currentUser')) return;
        try {
            await pullServerUpdatesForCleanFiles();
        } catch (e) {
            console.warn('拉取服务器更新失败:', e);
        }

        const files = g('files');
        const currentFileId = g('currentFileId');
        const vditor = g('vditor');
        const lastSyncedContent = g('lastSyncedContent');
        const pendingServerSync = g('pendingServerSync') || {};
        const filesToSync = files.filter(function(file) {
            if (file.type !== 'file') return false;
            const currentContent = vditor && file.id === currentFileId ? vditor.getValue() : file.content;
            return pendingServerSync[file.id] || !file.isSynced || currentContent !== lastSyncedContent[file.id];
        });
        if (filesToSync.length === 0) return;
        try {
            for (var i = 0; i < filesToSync.length; i++) await global.syncFileToServer(filesToSync[i].id);
        } catch (error) {
            console.error('同步失败', error);
        }
    }

    async function syncFileToServer(fileId) {
        if (!g('currentUser')) return;
        const files = g('files');
        const file = files.find(function(f) { return f.id === fileId; });
        if (!file) return;
        
        let content = '';
        let filenameToSend = file.name;

        if (file.type === 'folder') {
            content = '{"meta":"folder"}';
            if (!filenameToSend.endsWith('/')) {
                filenameToSend += '/';
            }
        } else {
            content = (g('vditor') && file.id === g('currentFileId') ? g('vditor').getValue() : file.content);

            // 先检查服务器是否已被其他端更新，避免本地静默覆盖远程新内容
            const baseContent = (g('lastSyncedContent') || {})[fileId];
            if (baseContent !== undefined) {
                const serverSnapshot = await fetchServerFileSnapshot(file.name);
                if (serverSnapshot && serverSnapshot.content !== baseContent) {
                    if (content !== baseContent) {
                        markPendingServerSync(fileId, true);
                        global.showMessage(isEn() ? 'Conflict detected: server has newer content, please resolve it first' : '检测到冲突：服务器有更新内容，请先处理冲突', 'warning');
                        await loadFilesFromServer(file.name);
                        return false;
                    }

                    // 本地未改但服务器已变更：直接拉取服务器版本，保持本地最新
                    file.content = serverSnapshot.content;
                    file.lastModified = serverSnapshot.lastModified || Date.now();
                    file.isSynced = true;
                    if (g('vditor') && file.id === g('currentFileId')) {
                        g('vditor').setValue(serverSnapshot.content);
                    }
                    localStorage.setItem('vditor_files', JSON.stringify(files));
                    g('lastSyncedContent')[fileId] = serverSnapshot.content;
                    g('unsavedChanges')[fileId] = false;
                    markPendingServerSync(fileId, false);
                    return true;
                }
            }
        }

        try {
            var api = global.getApiBaseUrl ? global.getApiBaseUrl() : 'api';
            const response = await fetch(api + '/files/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + g('currentUser').token },
                body: JSON.stringify({ username: g('currentUser').username, filename: filenameToSend, content: content })
            });
            const result = global.parseJsonResponse ? await global.parseJsonResponse(response) : await response.json();
            if (result.code === 200) {
                const fileIndex = files.findIndex(function(f) { return f.id === fileId; });
                if (fileIndex !== -1) {
                    files[fileIndex].isSynced = true;
                    files[fileIndex].lastModified = Date.now();
                    localStorage.setItem('vditor_files', JSON.stringify(files));
                    g('lastSyncedContent')[fileId] = file.type === 'folder' ? '' : content;
                    g('unsavedChanges')[fileId] = false;
                    markPendingServerSync(fileId, false);
                }
                return true;
            }
            throw new Error(result.message || (isEn() ? 'Save failed' : '保存失败'));
        } catch (error) {
            console.error('同步文件失败:', error);
            if (error.message === 'Failed to fetch' || error.message.includes('NetworkError')) {
                if (global.showNetworkErrorBanner) {
                    global.showNetworkErrorBanner();
                } else {
                    global.showMessage(isEn() ? 'Network not connected, please connect to the network' : '网络未连接，请连接网络', 'error');
                }
            }
            throw error;
        }
    }

    async function deleteFileFromServer(filename) {
        if (!g('currentUser')) return;
        try {
            var api = global.getApiBaseUrl ? global.getApiBaseUrl() : 'api';
            const response = await fetch(api + '/files/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + g('currentUser').token },
                body: JSON.stringify({ username: g('currentUser').username, filename: filename })
            });
            const text = await response.text();
            if (!response.ok) throw new Error('HTTP ' + response.status + ': ' + (isEn() ? 'Delete failed' : '删除失败'));
            var result;
            try { result = JSON.parse(text); } catch (e) { throw new Error(isEn() ? 'Server response format error' : '服务器响应格式错误'); }
            if (result.code !== 200) console.error(isEn() ? 'Delete failed' : '删除失败', result.message);
        } catch (error) {
            console.error('从服务器删除文件失败', error);
            g('customAlert')((isEn() ? 'Delete file failed: ' : '删除文件失败: ') + error.message);
        }
    }

    function highlightMarkdown(content) {
        var html = content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
        html = html.replace(/^(#{1,6})\s+(.+)$/gm, function(match, hashes, text) {
            var level = hashes.length;
            var color = ['#e74c3c', '#e67e22', '#f1c40f', '#2ecc71', '#3498db', '#9b59b6'][level - 1];
            return '<span style="color: ' + color + '; font-weight: bold;">' + hashes + ' ' + text + '</span>';
        });
        html = html.replace(/\*\*(.+?)\*\*/g, '<strong style="color: #e74c3c;">$1</strong>');
        html = html.replace(/\*(.+?)\*/g, '<em style="color: #e67e22;">$1</em>');
        html = html.replace(/`([^`]+)`/g, '<code style="background: #f0f0f0; padding: 2px 4px; border-radius: 3px; color: #c7254e;">$1</code>');
        html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color: #4a90e2;">$1</a>');
        return html.replace(/\n/g, '<br>');
    }

    function previewHistoryVersion(filename, versionId, content, timestamp) {
        const diffModal = document.getElementById('diffModalOverlay');
        const diffContent = document.getElementById('diffContent');
        const diffFileName = document.getElementById('diffFileName');
        const diffLocalTime = document.getElementById('diffLocalTime');
        const diffServerTime = document.getElementById('diffServerTime');
        const diffInfo = diffModal.querySelector('.diff-info span');
        const localVersionLabel = diffModal.querySelector('.diff-version-header:first-child .diff-version-label');
        const serverVersionLabel = diffModal.querySelector('.diff-version-header:last-child .diff-version-label');
        
        if (!diffModal || !diffContent) return;
        
        // 获取当前文件内容
        const files = g('files');
        const currentFile = files.find(function(f) { return f.name === filename; });
        const currentContent = currentFile ? currentFile.content : '';
        
        // 设置文件信息
        diffFileName.textContent = filename;
        diffLocalTime.textContent = new Date(timestamp).toLocaleString();
        diffServerTime.textContent = isEn() ? 'Current Version' : '当前版本';
        
        // 更新标签文本
        if (localVersionLabel) localVersionLabel.textContent = (isEn() ? 'History Version ' : '历史版本 ') + versionId;
        if (serverVersionLabel) serverVersionLabel.textContent = isEn() ? 'Current Version' : '当前版本';
        if (diffInfo) diffInfo.textContent = isEn() ? 'Green: Added, Red: Deleted.' : '左侧为历史版本，右侧为当前版本。绿色表示新增，红色表示删除。';
        
        // 计算并渲染差异（历史版本 vs 当前版本）
        const diffResult = computeDiff(content || '', currentContent || '');
        diffContent.innerHTML = renderDiffView(diffResult);
        
        // 显示模态窗口
        diffModal.classList.add('show');
        
        // 绑定关闭事件
        const closeBtn = document.getElementById('closeDiffBtn');
        const closeModalBtn = document.getElementById('closeDiffModalBtn');
        
        const closeModal = function() {
            diffModal.classList.remove('show');
            // 恢复原始标签文本
            if (localVersionLabel) localVersionLabel.textContent = isEn() ? 'Local Version' : '本地版本';
            if (serverVersionLabel) serverVersionLabel.textContent = isEn() ? 'Server Version' : '服务器版本';
            if (diffInfo) diffInfo.textContent = isEn() ? 'Left: Local version, Right: Server version. Green: Added, Red: Deleted.' : '左侧为本地版本，右侧为服务器版本。绿色表示新增，红色表示删除。';
        };
        
        if (closeBtn) closeBtn.onclick = closeModal;
        if (closeModalBtn) closeModalBtn.onclick = closeModal;
        
        // 点击外部关闭
        diffModal.onclick = function(e) {
            if (e.target === diffModal) closeModal();
        };
        
        // ESC键关闭
        const handleEsc = function(e) {
            if (e.key === 'Escape' && diffModal.classList.contains('show')) {
                closeModal();
                document.removeEventListener('keydown', handleEsc);
            }
        };
        document.addEventListener('keydown', handleEsc);
    }

    async function restoreHistoryVersion(filename, versionId, content) {
        if (!g('currentUser')) return false;
        try {
            var api = global.getApiBaseUrl ? global.getApiBaseUrl() : 'api';
            var response = await fetch(api + '/files/history/restore', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + g('currentUser').token },
                body: JSON.stringify({ username: g('currentUser').username, filename: filename, version_id: versionId })
            });
            var result = global.parseJsonResponse ? await global.parseJsonResponse(response) : await response.json();
            return result.code === 200;
        } catch (e) { throw e; }
    }

    function compareVersions(originalContent, newContent) {
        if (originalContent === newContent) return { hasChanges: false, message: isEn() ? 'Content is identical' : '内容完全相同' };
        var originalLines = originalContent.split('\n');
        var newLines = newContent.split('\n');
        var maxLines = Math.max(originalLines.length, newLines.length);
        var added = 0, removed = 0, changed = 0;
        for (var i = 0; i < maxLines; i++) {
            if (i >= originalLines.length) added++;
            else if (i >= newLines.length) removed++;
            else if (originalLines[i] !== newLines[i]) changed++;
        }
        return { hasChanges: true, message: (isEn() ? 'Line changes: added ' : '行数变化: 新增 ') + added + (isEn() ? ' lines, removed ' : ' 行，删除 ') + removed + (isEn() ? ' lines, modified ' : ' 行，修改 ') + changed + (isEn() ? ' lines' : ' 行'), added: added, removed: removed, changed: changed };
    }

    async function restoreFromHistory(filename, versionId, content, fileId) {
        const confirmed1 = await g('customConfirm')(isEn() ? 'Are you sure you want to restore to this version?\nThe current editor content will be replaced.' : '确定要恢复到此版本吗？\n当前编辑器的内容将被替换。');
        if (!confirmed1) return;
        try {
            global.showMessage(isEn() ? 'Restoring history version...' : '正在恢复历史版本...', 'info');
            var vditor = g('vditor');
            var currentContent = vditor ? vditor.getValue() : '';
            var diff = compareVersions(currentContent, content);
            if (!diff.hasChanges) { global.showMessage(isEn() ? 'Current content is the same as the selected version, no need to restore' : '当前内容与所选版本相同，无需恢复', 'info'); return; }
            const confirmed2 = await g('customConfirm')(isEn() ? 'About to restore history version, here is the change summary:\n' + diff.message + '\n\nAre you sure you want to restore?' : '即将恢复历史版本，以下是变化摘要：\n' + diff.message + '\n\n确定要恢复吗？');
            if (!confirmed2) return;
            if (g('currentUser')) {
                var success = await restoreHistoryVersion(filename, versionId, content);
                if (!success) global.showMessage(isEn() ? 'Server restore failed, will restore locally' : '服务器恢复失败，将在本地恢复', 'warning');
            }
            var files = g('files');
            var fileIndex = files.findIndex(function(f) { return f.id === fileId; });
            if (fileIndex === -1) throw new Error(isEn() ? 'File not found' : '文件不存在');
            files[fileIndex].content = content;
            files[fileIndex].lastModified = Date.now();
            files[fileIndex].isSynced = g('currentUser') ? false : true;
            localStorage.setItem('vditor_files', JSON.stringify(files));
            if (vditor && g('currentFileId') === fileId) {
                vditor.setValue(content);
                global.showMessage((isEn() ? 'Restored to this version (Version ID: ' : '已恢复到此版本（版本ID: ') + versionId + '）', 'success');
                g('unsavedChanges')[fileId] = true;
                setTimeout(function() { global.saveCurrentFile(true); }, 1000);
            }
            var modal = document.getElementById('historyModalOverlay');
            if (modal) modal.classList.remove('show');
            loadFiles();
            if (g('currentUser')) setTimeout(function() { global.syncFileToServer(fileId); }, 2000);
        } catch (error) {
            console.error('恢复失败', error);
            global.showMessage((isEn() ? 'Restore failed: ' : '恢复失败: ') + error.message, 'error');
        }
    }

    async function deleteHistoryVersionAPI(filename, versionId) {
        if (!g('currentUser')) return false;
        try {
            var api = global.getApiBaseUrl ? global.getApiBaseUrl() : 'api';
            var response = await fetch(api + '/files/history/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + g('currentUser').token },
                body: JSON.stringify({ username: g('currentUser').username, filename: filename, version_id: versionId })
            });
            var result = global.parseJsonResponse ? await global.parseJsonResponse(response) : await response.json();
            return result.code === 200;
        } catch (e) { throw e; }
    }

    function showDeleteConfirmModal(filename, versionId, historyId, fileId) {
        var nightMode = g('nightMode') === true;
        var confirmModal = document.createElement('div');
        confirmModal.className = 'modal-overlay';
        confirmModal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:10001;';
        var modalContent = document.createElement('div');
        var bgColor = nightMode ? '#2d2d2d' : 'white';
        var textColor = nightMode ? '#eee' : '#333';
        var secondaryTextColor = nightMode ? '#aaa' : '#666';
        var lightBg = nightMode ? '#3d3d3d' : '#f5f5f5';
        var borderColor = nightMode ? '#444' : '#eee';
        modalContent.style.cssText = 'background:' + bgColor + ';color:' + textColor + ';border-radius:12px;padding:25px;max-width:90%;';
        modalContent.innerHTML = '<div class="modal-header" style="text-align:center;margin-bottom:20px;"><h2 style="margin:0 0 10px 0;color:#dc3545;">' + (isEn() ? 'Delete Confirmation' : '删除确认') + '</h2><p style="color:' + secondaryTextColor + ';margin:0;">' + (isEn() ? 'Please confirm you want to delete this history version' : '请确认是否要删除此历史版本') + '</p></div><div style="margin:15px 0;">' + (isEn() ? 'File: ' : '文件：') + global.escapeHtml(filename) + '</div><div style="display:flex;gap:10px;justify-content:center;margin-top:25px;"><button class="delete-confirm-cancel" style="padding:10px 24px;background:' + (nightMode ? '#555' : '#6c757d') + ';color:white;border:none;border-radius:6px;cursor:pointer;">' + (isEn() ? 'Cancel' : '取消') + '</button><button class="delete-confirm-ok" style="padding:10px 24px;background:#dc3545;color:white;border:none;border-radius:6px;cursor:pointer;">' + (isEn() ? 'Confirm Delete' : '确认删除') + '</button></div>';
        confirmModal.appendChild(modalContent);
        document.body.appendChild(confirmModal);
        var cancelBtn = modalContent.querySelector('.delete-confirm-cancel');
        var confirmBtn = modalContent.querySelector('.delete-confirm-ok');
        cancelBtn.onclick = function() { global.removeModal(confirmModal); };
        confirmBtn.onclick = function() {
            confirmBtn.disabled = true;
            confirmBtn.textContent = isEn() ? 'Deleting...' : '删除中...';
            performDeleteHistory(filename, versionId, historyId, fileId, confirmModal);
        };
        confirmModal.addEventListener('click', function(e) { if (e.target === confirmModal) global.removeModal(confirmModal); });
        var handleKeydown = function(e) { if (e.key === 'Escape') { global.removeModal(confirmModal); document.removeEventListener('keydown', handleKeydown); } };
        document.addEventListener('keydown', handleKeydown);
        confirmModal.removeKeydownHandler = function() { document.removeEventListener('keydown', handleKeydown); };
    }

    async function performDeleteHistory(filename, versionId, historyId, fileId, modalElement) {
        try {
            var success = await deleteHistoryVersionAPI(filename, versionId);
            if (success) {
                global.removeModal(modalElement);
                global.showMessage((isEn() ? 'History version ' : '历史版本 ') + versionId + (isEn() ? ' deleted' : ' 已删除'), 'success');
                var historyModal = document.getElementById('historyModalOverlay');
                if (historyModal) historyModal.classList.remove('show');
                setTimeout(function() { global.showHistoryModal(fileId, filename); }, 1000);
            } else throw new Error(isEn() ? 'Delete failed' : '删除失败');
        } catch (error) {
            console.error('删除历史版本失败', error);
            global.showMessage((isEn() ? 'Delete failed: ' : '删除失败: ') + error.message, 'error');
        }
    }

    function deleteHistoryVersion(filename, versionId, historyId, fileId) {
        showDeleteConfirmModal(filename, versionId, historyId, fileId);
    }

    /**
     * 导入本地文件到文件列表
     */
    global.importFiles = function() {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.multiple = true;
        fileInput.accept = '.md,.txt,.markdown,text/markdown,text/plain';

        fileInput.addEventListener('change', async function(e) {
            const files = Array.from(e.target.files);
            if (files.length === 0) return;

            global.showMessage((isEn() ? `Importing ${files.length} files...` : `正在导入 ${files.length} 个文件...`), 'info');

            let importedCount = 0;
            let skippedCount = 0;
            const newFiles = [];

            const existingNames = new Set(g('files').map(f => f.name));

            for (const file of files) {
                try {
                    const content = await readFileAsText(file);
                    let fileName = file.name;
                    fileName = normalizePath(fileName);

                    let baseName = fileName;
                    let counter = 1;
                    while (existingNames.has(fileName)) {
                        const parts = fileName.split('/');
                        const lastPart = parts.pop();
                        const newLastPart = lastPart.replace(/(\d+)?$/, (m) => m ? parseInt(m)+1 : '1');
                        parts.push(newLastPart);
                        fileName = parts.join('/');
                        counter++;
                    }

                    const newFile = {
                        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                        name: fileName,
                        type: 'file',
                        content: content,
                        lastModified: Date.now(),
                        isSynced: false
                    };

                    newFiles.push(newFile);
                    existingNames.add(fileName);
                    importedCount++;
                } catch (error) {
                    console.error(`读取文件 ${file.name} 失败:`, error);
                    global.showMessage((isEn() ? `Failed to read file ${file.name}: ` : `读取文件 ${file.name} 失败: `) + error.message, 'error');
                    skippedCount++;
                }
            }

            if (newFiles.length > 0) {
                newFiles.forEach(f => ensureParentFolders(f.name));
                g('files').push(...newFiles);
                localStorage.setItem('vditor_files', JSON.stringify(g('files')));

                newFiles.forEach(file => {
                    g('lastSyncedContent')[file.id] = file.content;
                    g('unsavedChanges')[file.id] = false;
                });

                loadFiles();
                if (newFiles.length > 0) openFile(newFiles[0].id);

                if (g('currentUser')) {
                    for (const file of newFiles) {
                        try {
                            await global.syncFileToServer(file.id);
                        } catch (syncError) {
                            console.warn(`同步文件 ${file.name} 失败`, syncError);
                        }
                    }
                }

                global.showMessage((isEn() ? `Successfully imported ${importedCount} file${importedCount !== 1 ? 's' : ''}${skippedCount > 0 ? (isEn() ? `, skipped ${skippedCount}` : `，跳过 ${skippedCount} 个`) : ''}` : `成功导入 ${importedCount} 个文件${skippedCount > 0 ? `，跳过 ${skippedCount} 个` : ''}`), 'success');
            } else {
                global.showMessage(isEn() ? 'No files imported' : '没有导入任何文件', 'warning');
            }

            fileInput.remove();
        });

        fileInput.click();
    };

    function readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(new Error(isEn() ? 'Failed to read file' : '读取文件失败'));
            reader.readAsText(file);
        });
    }

    // ========== 文件对比功能 ==========

    /**
     * 显示文件对比对话框
     */
    async function showFileDiffDialog() {
        // 先保存当前文档
        if (typeof global.saveCurrentFile === 'function' && g('currentFileId')) {
            await global.saveCurrentFile(true);
        }

        const currentFileId = g('currentFileId');
        if (!currentFileId) {
            global.showMessage(isEn() ? 'Please open a file first' : '请先打开一个文件', 'warning');
            return;
        }

        const currentFile = g('files').find(f => f.id === currentFileId && f.type === 'file');
        if (!currentFile) {
            global.showMessage(isEn() ? 'Current file not found' : '当前文件不存在', 'error');
            return;
        }

        const nightMode = g('nightMode') === true;
        const bgColor = nightMode ? '#2d2d2d' : 'white';
        const textColor = nightMode ? '#eee' : '#333';
        const secondaryTextColor = nightMode ? '#aaa' : '#666';
        const borderColor = nightMode ? '#444' : '#ddd';
        const inputBg = nightMode ? '#3d3d3d' : '#f5f5f5';

        // 创建模态框
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.id = 'fileDiffSelectModal';
        modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:10001;';

        const modalContent = document.createElement('div');
        modalContent.style.cssText = 'background:' + bgColor + ';color:' + textColor + ';border-radius:12px;padding:25px;max-width:90%;width:400px;max-height:80vh;display:flex;flex-direction:column;';

        // 获取所有可对比的文件（排除当前文件和.开头的隐藏文件）
        const otherFiles = g('files').filter(f => f.id !== currentFileId && f.type === 'file' && !f.name.startsWith('.'));

        // 格式化日期函数
        function formatDate(dateValue) {
            if (!dateValue) return '';
            try {
                const date = new Date(dateValue);
                if (isNaN(date.getTime())) return '';
                return date.toLocaleString();
            } catch (e) {
                return '';
            }
        }

        let fileListHtml = '';
        if (otherFiles.length === 0) {
            fileListHtml = '<div style="padding:20px;text-align:center;color:' + secondaryTextColor + ';">' + (isEn() ? 'No other files available' : '没有其他文件可对比') + '</div>';
        } else {
            fileListHtml = '<div style="max-height:300px;overflow-y:auto;border:1px solid ' + borderColor + ';border-radius:6px;margin:10px 0;">';
            otherFiles.forEach(file => {
                const dateStr = formatDate(file.updatedAt || file.createdAt);
                fileListHtml += '<div class="diff-file-item" data-file-id="' + file.id + '" style="padding:12px 15px;cursor:pointer;border-bottom:1px solid ' + borderColor + ';transition:background 0.2s;">' +
                    '<div style="font-weight:500;">' + global.escapeHtml(file.name) + '</div>' +
                    (dateStr ? '<div style="font-size:12px;color:' + secondaryTextColor + ';margin-top:3px;">' + dateStr + '</div>' : '') +
                    '</div>';
            });
            fileListHtml += '</div>';
        }

        modalContent.innerHTML =
            '<div style="margin-bottom:15px;">' +
                '<h3 style="margin:0 0 5px 0;">' + (isEn() ? 'Select File to Compare' : '选择要对比的文件') + '</h3>' +
                '<div style="font-size:13px;color:' + secondaryTextColor + ';">' +
                    (isEn() ? 'Current: ' : '当前文件：') + '<strong>' + global.escapeHtml(currentFile.name) + '</strong>' +
                '</div>' +
            '</div>' +
            fileListHtml +
            '<div style="display:flex;gap:10px;justify-content:flex-end;margin-top:15px;">' +
                '<button id="cancelFileDiffBtn" style="padding:8px 16px;background:' + (nightMode ? '#555' : '#6c757d') + ';color:white;border:none;border-radius:6px;cursor:pointer;">' + (isEn() ? 'Cancel' : '取消') + '</button>' +
            '</div>';

        modal.appendChild(modalContent);
        document.body.appendChild(modal);

        // 绑定取消按钮
        const cancelBtn = modalContent.querySelector('#cancelFileDiffBtn');
        if (cancelBtn) {
            cancelBtn.onclick = function() {
                global.removeModal(modal);
            };
        }

        // 绑定文件选择事件
        const fileItems = modalContent.querySelectorAll('.diff-file-item');
        fileItems.forEach(item => {
            item.onclick = function() {
                const selectedFileId = this.getAttribute('data-file-id');
                const selectedFile = g('files').find(f => f.id === selectedFileId);
                if (selectedFile) {
                    global.removeModal(modal);
                    showFileDiffComparison(currentFile, selectedFile);
                }
            };

            // 添加悬停效果
            item.onmouseenter = function() {
                this.style.background = nightMode ? '#4a4a4a' : '#f0f0f0';
            };
            item.onmouseleave = function() {
                this.style.background = 'transparent';
            };
        });

        // 点击外部关闭
        modal.onclick = function(e) {
            if (e.target === modal) {
                global.removeModal(modal);
            }
        };

        // ESC键关闭
        const handleEsc = function(e) {
            if (e.key === 'Escape') {
                global.removeModal(modal);
                document.removeEventListener('keydown', handleEsc);
            }
        };
        document.addEventListener('keydown', handleEsc);
    }

    /**
     * 显示两个文件的差异对比
     */
    function showFileDiffComparison(file1, file2) {
        const nightMode = g('nightMode') === true;

        // 获取文件内容
        const content1 = file1.content || '';
        const content2 = file2.content || '';

        // 计算差异
        const diffResult = computeDiff(content1, content2);

        // 创建差异对比模态框（复用现有样式）
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.id = 'fileDiffResultModal';
        modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;z-index:10002;';

        const modalContent = document.createElement('div');
        modalContent.style.cssText = 'background:' + (nightMode ? '#2d2d2d' : 'white') + ';color:' + (nightMode ? '#eee' : '#333') + ';border-radius:8px;width:95vw;height:90vh;display:flex;flex-direction:column;overflow:hidden;';

        const headerHtml =
            '<div style="padding:15px 20px;border-bottom:1px solid ' + (nightMode ? '#444' : '#eee') + ';display:flex;justify-content:space-between;align-items:center;flex-shrink:0;">' +
                '<div>' +
                    '<h3 style="margin:0;">' + (isEn() ? 'File Diff Comparison' : '文件差异对比') + '</h3>' +
                    '<div style="font-size:12px;color:' + (nightMode ? '#aaa' : '#666') + ';margin-top:5px;">' +
                        global.escapeHtml(file1.name) + ' ↔ ' + global.escapeHtml(file2.name) +
                    '</div>' +
                '</div>' +
                '<button id="closeFileDiffResultBtn" style="background:none;border:none;font-size:24px;cursor:pointer;color:' + (nightMode ? '#eee' : '#333') + ';">×</button>' +
            '</div>' +
            '<div style="padding:10px 20px;background:' + (nightMode ? '#3d3d3d' : '#f8f9fa') + ';font-size:13px;color:' + (nightMode ? '#aaa' : '#666') + ';flex-shrink:0;">' +
                '<i class="fas fa-info-circle"></i> ' + (isEn() ? 'Green = added, Red = removed' : '绿色表示新增，红色表示删除') +
            '</div>' +
            '<div style="display:flex;padding:10px 20px;background:' + (nightMode ? '#363636' : '#f0f0f0') + ';border-bottom:1px solid ' + (nightMode ? '#444' : '#ddd') + ';flex-shrink:0;">' +
                '<div style="flex:1;font-weight:500;text-align:center;">' + (isEn() ? 'Current: ' : '当前：') + global.escapeHtml(file1.name) + '</div>' +
                '<div style="flex:1;font-weight:500;text-align:center;">' + (isEn() ? 'Compare: ' : '对比：') + global.escapeHtml(file2.name) + '</div>' +
            '</div>';

        const diffHtml = renderDiffView(diffResult);

        modalContent.innerHTML = headerHtml +
            '<div style="flex:1;overflow:auto;padding:0;">' +
                '<div style="display:flex;min-width:100%;">' +
                    '<div style="flex:1;">' + diffHtml + '</div>' +
                '</div>' +
            '</div>';

        modal.appendChild(modalContent);
        document.body.appendChild(modal);

        // 绑定关闭按钮
        const closeBtn = modalContent.querySelector('#closeFileDiffResultBtn');
        if (closeBtn) {
            closeBtn.onclick = function() {
                global.removeModal(modal);
            };
        }

        // 点击外部关闭
        modal.onclick = function(e) {
            if (e.target === modal) {
                global.removeModal(modal);
            }
        };

        // ESC键关闭
        const handleEsc = function(e) {
            if (e.key === 'Escape') {
                global.removeModal(modal);
                document.removeEventListener('keydown', handleEsc);
            }
        };
        document.addEventListener('keydown', handleEsc);
    }

    // ========== 全文查找功能 ==========

    /**
     * 显示全文查找对话框
     */
    async function showFindDialog() {
        // 先保存当前文档
        if (typeof global.saveCurrentFile === 'function' && g('currentFileId')) {
            await global.saveCurrentFile(true);
        }

        const nightMode = g('nightMode') === true;
        const bgColor = nightMode ? '#2d2d2d' : 'white';
        const textColor = nightMode ? '#eee' : '#333';
        const secondaryTextColor = nightMode ? '#aaa' : '#666';
        const borderColor = nightMode ? '#444' : '#ddd';
        const inputBg = nightMode ? '#3d3d3d' : '#f5f5f5';
        // 如果已存在查找框，先移除
        const existingModal = document.getElementById('findDialogModal');
        if (existingModal) {
            existingModal.remove();
        }
        // 创建非模态的浮动对话框
        const dialog = document.createElement('div');
        dialog.id = 'findDialogModal';
        dialog.style.cssText = 'position:fixed;top:80px;right:40px;background:' + bgColor + ';color:' + textColor + ';border-radius:12px;padding:20px;width:380px;box-shadow:0 4px 20px rgba(0,0,0,0.3);z-index:10001;border:1px solid ' + borderColor + ';display:flex;flex-direction:column;';
        dialog.innerHTML =
            '<div id="findDialogHeader" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:15px;cursor:move;user-select:none;touch-action:none;">' +
                '<h3 style="margin:0;font-size:16px;">' + (isEn() ? 'Find and Replace' : '查找和替换') + '</h3>' +
                '<button id="closeFindBtn" style="background:none;border:none;font-size:20px;cursor:pointer;color:' + secondaryTextColor + ';padding:0;">&times;</button>' +
            '</div>' +
            '<div style="margin-bottom:10px;display:flex;align-items:center;gap:8px;">' +
                '<button id="toggleReplaceBtn" style="background:none;border:none;cursor:pointer;color:' + secondaryTextColor + ';padding:4px;font-size:14px;transition:transform 0.2s;">' +
                    '<i class="fas fa-chevron-right" id="toggleReplaceIcon"></i>' +
                '</button>' +
                '<input type="text" id="findInput" placeholder="' + (isEn() ? 'Enter search text...' : '输入查找内容...') + '" ' +
                    'style="flex:1;padding:8px 12px;border:1px solid ' + borderColor + ';border-radius:6px;font-size:13px;background:' + inputBg + ';color:' + textColor + ';box-sizing:border-box;outline:none;">' +
            '</div>' +
            '<div id="replaceContainer" style="margin-bottom:15px;display:none;">' +
                '<input type="text" id="replaceInput" placeholder="' + (isEn() ? 'Enter replacement...' : '输入替换内容...') + '" ' +
                    'style="width:100%;padding:8px 12px;border:1px solid ' + borderColor + ';border-radius:6px;font-size:13px;background:' + inputBg + ';color:' + textColor + ';box-sizing:border-box;outline:none;">' +
            '</div>' +
            '<div id="replaceButtonsContainer" style="display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end;margin-bottom:10px;display:none;">' +
                '<button id="replaceBtn" style="padding:6px 12px;background:' + (nightMode ? '#3d3d3d' : '#f0f0f0') + ';color:' + textColor + ';border:1px solid ' + borderColor + ';border-radius:6px;cursor:pointer;font-size:12px;">' + (isEn() ? 'Replace' : '替换') + '</button>' +
                '<button id="replaceAllBtn" style="padding:6px 12px;background:' + (nightMode ? '#3d3d3d' : '#f0f0f0') + ';color:' + textColor + ';border:1px solid ' + borderColor + ';border-radius:6px;cursor:pointer;font-size:12px;">' + (isEn() ? 'Replace All' : '全部替换') + '</button>' +
            '</div>' +
            '<div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end;margin-bottom:10px;">' +
                '<button id="findPrevBtn" style="padding:6px 12px;background:' + (nightMode ? '#4a90e2' : '#4a90e2') + ';color:white;border:none;border-radius:6px;cursor:pointer;font-size:12px;">' + (isEn() ? 'Prev' : '上一个') + '</button>' +
                '<button id="findNextBtn" style="padding:6px 12px;background:' + (nightMode ? '#4a90e2' : '#4a90e2') + ';color:white;border:none;border-radius:6px;cursor:pointer;font-size:12px;">' + (isEn() ? 'Next' : '下一个') + '</button>' +
            '</div>' +
            '<div id="findStatus" style="font-size:12px;color:' + secondaryTextColor + ';"></div>' +
            '<div id="wasmSearchPanel" style="margin-top:12px;border-top:1px solid ' + borderColor + ';padding-top:10px;display:none;">' +
                '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">' +
                    '<span style="font-size:12px;color:' + secondaryTextColor + ';">' + (isEn() ? 'Cross-file search' : '跨文件搜索') + '</span>' +
                    '<button id="wasmSearchBtn" style="padding:4px 10px;background:' + (nightMode ? '#3d3d3d' : '#f0f0f0') + ';color:' + textColor + ';border:1px solid ' + borderColor + ';border-radius:6px;cursor:pointer;font-size:12px;">' + (isEn() ? 'Search Files' : '搜索文件') + '</button>' +
                '</div>' +
                '<div id="wasmSearchResults" style="max-height:180px;overflow:auto;font-size:12px;"></div>' +
            '</div>';
        document.body.appendChild(dialog);
        // 拖动逻辑（支持鼠标和触摸）
        const header = dialog.querySelector('#findDialogHeader');
        let isDragging = false;
        let startX, startY, startLeft, startTop;

        // 鼠标拖动
        header.addEventListener('mousedown', function(e) {
            if (e.target.id === 'closeFindBtn') return;
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            const rect = dialog.getBoundingClientRect();
            startLeft = rect.left;
            startTop = rect.top;
            document.body.style.userSelect = 'none';
        });

        document.addEventListener('mousemove', function(e) {
            if (!isDragging) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            let newLeft = startLeft + dx;
            let newTop = startTop + dy;
            newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - dialog.offsetWidth));
            newTop = Math.max(0, Math.min(newTop, window.innerHeight - dialog.offsetHeight));
            dialog.style.left = newLeft + 'px';
            dialog.style.top = newTop + 'px';
            dialog.style.right = 'auto';
        });

        document.addEventListener('mouseup', function() {
            if (isDragging) {
                isDragging = false;
                document.body.style.userSelect = '';
            }
        });

        // 触摸拖动（手机支持）
        header.addEventListener('touchstart', function(e) {
            if (e.target.id === 'closeFindBtn') return;
            isDragging = true;
            const touch = e.touches[0];
            startX = touch.clientX;
            startY = touch.clientY;
            const rect = dialog.getBoundingClientRect();
            startLeft = rect.left;
            startTop = rect.top;
            document.body.style.userSelect = 'none';
        }, { passive: false });

        document.addEventListener('touchmove', function(e) {
            if (!isDragging) return;
            e.preventDefault();
            const touch = e.touches[0];
            const dx = touch.clientX - startX;
            const dy = touch.clientY - startY;
            let newLeft = startLeft + dx;
            let newTop = startTop + dy;
            newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - dialog.offsetWidth));
            newTop = Math.max(0, Math.min(newTop, window.innerHeight - dialog.offsetHeight));
            dialog.style.left = newLeft + 'px';
            dialog.style.top = newTop + 'px';
            dialog.style.right = 'auto';
        }, { passive: false });

        document.addEventListener('touchend', function() {
            if (isDragging) {
                isDragging = false;
                document.body.style.userSelect = '';
            }
        });

        // 替换区域显示/隐藏控制
        const toggleReplaceBtn = dialog.querySelector('#toggleReplaceBtn');
        const toggleReplaceIcon = dialog.querySelector('#toggleReplaceIcon');
        const replaceContainer = dialog.querySelector('#replaceContainer');
        const replaceButtonsContainer = dialog.querySelector('#replaceButtonsContainer');
        let isReplaceVisible = false;

        toggleReplaceBtn.addEventListener('click', function() {
            isReplaceVisible = !isReplaceVisible;
            if (isReplaceVisible) {
                toggleReplaceIcon.style.transform = 'rotate(90deg)';
                replaceContainer.style.display = 'block';
                replaceButtonsContainer.style.display = 'flex';
            } else {
                toggleReplaceIcon.style.transform = 'rotate(0deg)';
                replaceContainer.style.display = 'none';
                replaceButtonsContainer.style.display = 'none';
            }
        });
        // 查找状态
        let matches = [];
        let visibleMatches = [];
        let currentMatchIndex = -1;
        let searchText = '';
        let activeHighlightOverlays = [];
        const findInput = dialog.querySelector('#findInput');
        const replaceInput = dialog.querySelector('#replaceInput');
        const findStatus = dialog.querySelector('#findStatus');
        const findNextBtn = dialog.querySelector('#findNextBtn');
        const findPrevBtn = dialog.querySelector('#findPrevBtn');
        const replaceBtn = dialog.querySelector('#replaceBtn');
        const replaceAllBtn = dialog.querySelector('#replaceAllBtn');
        const closeBtn = dialog.querySelector('#closeFindBtn');
        const wasmSearchPanel = dialog.querySelector('#wasmSearchPanel');
        const wasmSearchBtn = dialog.querySelector('#wasmSearchBtn');
        const wasmSearchResults = dialog.querySelector('#wasmSearchResults');

        const gateway = global.wasmTextEngineGateway;
        const smartEngineAvailable = gateway && typeof gateway.ensureReady === 'function';
        if (wasmSearchPanel) wasmSearchPanel.style.display = 'block';

        function normalizeForSearch(text, caseSensitive) {
            const source = String(text || '');
            return caseSensitive ? source : source.toLocaleLowerCase();
        }

        function jsFindInText(text, query, options) {
            const sourceText = String(text || '');
            const keyword = String(query || '');
            if (!keyword) return { code: 200, message: 'ok', data: { query: '', count: 0, matches: [] } };
            const opts = options || {};
            const source = normalizeForSearch(sourceText, !!opts.caseSensitive);
            const needle = normalizeForSearch(keyword, !!opts.caseSensitive);
            const out = [];
            let startAt = 0;
            while (startAt <= source.length) {
                const idx = source.indexOf(needle, startAt);
                if (idx === -1) break;
                const end = idx + keyword.length;
                out.push({
                    start: idx,
                    end: end,
                    snippet: sourceText.slice(Math.max(0, idx - 30), Math.min(sourceText.length, end + 30))
                });
                startAt = idx + Math.max(1, keyword.length);
            }
            return { code: 200, message: 'ok', data: { query: keyword, count: out.length, matches: out } };
        }

        function jsSearchFilesDetailed(query, options) {
            const rows = [];
            let totalMatches = 0;
            (g('files') || []).forEach(function(file) {
                if (!file || file.type !== 'file') return;
                const res = jsFindInText(file.content || '', query || '', options || {});
                const list = res && res.data && Array.isArray(res.data.matches) ? res.data.matches : [];
                if (list.length === 0) return;
                const hits = list.map(function(hit, index) {
                    return { index: index, start: hit.start, end: hit.end, snippet: hit.snippet || '' };
                });
                totalMatches += hits.length;
                rows.push({ docId: String(file.id), filename: file.name || '', matchCount: hits.length, hits: hits });
            });
            return { code: 200, message: 'ok', data: { query: query || '', files: rows, fileCount: rows.length, totalMatches: totalMatches } };
        }

        async function smartFindInText(text, query, options) {
            if (smartEngineAvailable) {
                const readyRes = await gateway.ensureReady();
                if (readyRes && readyRes.code === 200) {
                    const engineRes = gateway.findInText(text || '', query || '', options || {});
                    if (engineRes && engineRes.code === 200 && engineRes.data && Array.isArray(engineRes.data.matches)) {
                        console.info('[cross-search] findInText handled by wasm', {
                            query: query || '',
                            count: engineRes.data.matches.length
                        });
                        return engineRes;
                    }
                    console.warn('[cross-search] findInText wasm returned invalid result, fallback to js', {
                        query: query || '',
                        code: engineRes && engineRes.code,
                        message: engineRes && engineRes.message
                    });
                } else {
                    console.warn('[cross-search] findInText wasm not ready, fallback to js', {
                        query: query || '',
                        code: readyRes && readyRes.code,
                        message: readyRes && readyRes.message
                    });
                }
            } else {
                console.info('[cross-search] findInText wasm unavailable, using js fallback', { query: query || '' });
            }
            const fallbackRes = jsFindInText(text || '', query || '', options || {});
            console.info('[cross-search] findInText handled by js fallback', {
                query: query || '',
                count: fallbackRes && fallbackRes.data ? (fallbackRes.data.count || 0) : 0
            });
            return fallbackRes;
        }

        async function smartSearchFilesDetailed(query, options) {
            if (smartEngineAvailable) {
                const readyRes = await gateway.ensureReady();
                if (readyRes && readyRes.code === 200) {
                    const engineRes = gateway.searchFilesDetailed(query || '', options || {});
                    if (engineRes && engineRes.code === 200 && engineRes.data) {
                        console.info('[cross-search] searchFilesDetailed handled by wasm', {
                            query: query || '',
                            fileCount: engineRes.data.fileCount || 0,
                            totalMatches: engineRes.data.totalMatches || 0
                        });
                        return engineRes;
                    }
                    console.warn('[cross-search] searchFilesDetailed wasm returned invalid result, fallback to js', {
                        query: query || '',
                        code: engineRes && engineRes.code,
                        message: engineRes && engineRes.message
                    });
                } else {
                    console.warn('[cross-search] searchFilesDetailed wasm not ready, fallback to js', {
                        query: query || '',
                        code: readyRes && readyRes.code,
                        message: readyRes && readyRes.message
                    });
                }
            } else {
                console.info('[cross-search] searchFilesDetailed wasm unavailable, using js fallback', { query: query || '' });
            }
            const fallbackRes = jsSearchFilesDetailed(query || '', options || {});
            console.info('[cross-search] searchFilesDetailed handled by js fallback', {
                query: query || '',
                fileCount: fallbackRes.data ? (fallbackRes.data.fileCount || 0) : 0,
                totalMatches: fallbackRes.data ? (fallbackRes.data.totalMatches || 0) : 0
            });
            return fallbackRes;
        }

        async function smartReplaceAll(text, query, replacement, options) {
            if (smartEngineAvailable) {
                const readyRes = await gateway.ensureReady();
                if (readyRes && readyRes.code === 200) {
                    const engineRes = gateway.replaceAllText(text || '', query || '', replacement || '', options || {});
                    if (engineRes && engineRes.code === 200 && engineRes.data) return engineRes;
                }
            }
            const sourceText = String(text || '');
            const keyword = String(query || '');
            if (!keyword) return { code: 200, message: 'ok', data: { text: sourceText, replaced: 0 } };
            const findRes = jsFindInText(sourceText, keyword, options || {});
            const count = findRes && findRes.data ? (findRes.data.count || 0) : 0;
            if (count === 0) return { code: 200, message: 'ok', data: { text: sourceText, replaced: 0 } };
            const caseSensitive = !!(options && options.caseSensitive);
            const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const flags = caseSensitive ? 'g' : 'gi';
            return { code: 200, message: 'ok', data: { text: sourceText.replace(new RegExp(escaped, flags), replacement || ''), replaced: count } };
        }

        function getCurrentEditorText() {
            const vditor = g('vditor');
            return vditor ? (vditor.getValue() || '') : '';
        }
        // 获取编辑器可搜索的DOM节点
        function getEditorElement() {
            const vditor = g('vditor');
            if (!vditor || !vditor.vditor) return null;
            const mode = vditor.vditor.currentMode || vditor.vditor.mode || vditor.vditor.currentOptions.mode;
            if (mode === 'wysiwyg' && vditor.vditor.wysiwyg) return vditor.vditor.wysiwyg.element;
            if (mode === 'ir' && vditor.vditor.ir) return vditor.vditor.ir.element;
            if (mode === 'sv' && vditor.vditor.sv) return vditor.vditor.sv.element;
            if (vditor.vditor.wysiwyg) return vditor.vditor.wysiwyg.element;
            if (vditor.vditor.ir) return vditor.vditor.ir.element;
            if (vditor.vditor.sv) return vditor.vditor.sv.element;
            return null;
        }
        // 聚焦输入框
        setTimeout(() => findInput.focus(), 100);
        // 执行查找
        async function performFind() {
            searchText = findInput.value.trim();
            if (!searchText) {
                findStatus.textContent = '';
                clearHighlights();
                if (wasmSearchResults) wasmSearchResults.innerHTML = '';
                return;
            }

            const res = await smartFindInText(getCurrentEditorText(), searchText, { caseSensitive: false });
            matches = (res && res.code === 200 && res.data && Array.isArray(res.data.matches)) ? res.data.matches : [];
            visibleMatches = findMatchesInVisibleText(searchText);
            if (matches.length === 0) {
                findStatus.textContent = isEn() ? 'No matches found' : '未找到匹配内容';
                findStatus.style.color = '#dc3545';
            } else {
                findStatus.textContent = (isEn() ? 'Found ' : '找到 ') + matches.length + (isEn() ? ' matches' : ' 个匹配');
                findStatus.style.color = secondaryTextColor;
                if (currentMatchIndex < 0 || currentMatchIndex >= matches.length) {
                    currentMatchIndex = 0;
                }
                highlightMatch(currentMatchIndex);
            }
        }

        function renderWasmSearchResults(data) {
            if (!wasmSearchResults) return;
            const rows = (data && Array.isArray(data.files)) ? data.files : [];
            if (rows.length === 0 || !data.totalMatches) {
                wasmSearchResults.innerHTML = '<div style="color:' + secondaryTextColor + ';">' + (isEn() ? 'No file matches' : '没有匹配文件') + '</div>';
                return;
            }

            let html = '<div style="margin-bottom:8px;color:' + secondaryTextColor + ';">' +
                (isEn() ? 'Matched files: ' : '匹配文件数：') + data.fileCount + '，' +
                (isEn() ? 'total matches: ' : '总匹配数：') + data.totalMatches +
                '</div>';

            rows.forEach(function(item) {
                html += '<div style="padding:6px 8px;border:1px solid ' + borderColor + ';border-radius:6px;margin-bottom:8px;">' +
                    '<div style="font-weight:600;">' + escapeHtml(item.filename || '') + ' (' + item.matchCount + ')</div>';
                (item.hits || []).forEach(function(hit) {
                    html += '<div class="cross-search-hit" data-file-id="' + String(item.docId) + '" data-start="' + hit.start + '" data-end="' + hit.end + '" style="margin-top:5px;padding:5px 6px;border-radius:5px;background:' + (nightMode ? '#3a3a3a' : '#f6f6f6') + ';cursor:pointer;white-space:pre-wrap;word-break:break-word;">' +
                        escapeHtml(hit.snippet || '') +
                    '</div>';
                });
                html += '</div>';
            });
            wasmSearchResults.innerHTML = html;

            wasmSearchResults.querySelectorAll('.cross-search-hit').forEach(function(el) {
                el.addEventListener('click', async function() {
                    const fileId = this.getAttribute('data-file-id');
                    const start = parseInt(this.getAttribute('data-start') || '0', 10);
                    if (fileId && typeof global.openFile === 'function') {
                        await global.openFile(fileId);
                        await performFind();
                        if (matches.length > 0) {
                            let bestIndex = 0;
                            let bestDistance = Math.abs((matches[0] && matches[0].start) - start);
                            for (let i = 1; i < matches.length; i++) {
                                const distance = Math.abs((matches[i] && matches[i].start) - start);
                                if (distance < bestDistance) {
                                    bestDistance = distance;
                                    bestIndex = i;
                                }
                            }
                            currentMatchIndex = bestIndex;
                            highlightMatch(currentMatchIndex);
                        }
                    }
                });
            });
        }

        async function runWasmSearch() {
            const keyword = findInput.value.trim();
            if (!keyword) {
                if (wasmSearchResults) wasmSearchResults.innerHTML = '';
                return;
            }

            const res = await smartSearchFilesDetailed(keyword, { caseSensitive: false });
            if (!res || res.code !== 200) {
                if (wasmSearchResults) {
                    wasmSearchResults.innerHTML = '<div style="color:#dc3545;">' + escapeHtml((res && res.message) || (isEn() ? 'Search failed' : '搜索失败')) + '</div>';
                }
                return;
            }

            renderWasmSearchResults(res.data);
        }
        function clearVisualHighlights() {
            activeHighlightOverlays.forEach(function(el) {
                if (el && el.parentNode) el.parentNode.removeChild(el);
            });
            activeHighlightOverlays = [];

            const selection = window.getSelection();
            if (selection) selection.removeAllRanges();
        }

        function normalizeSearchText(text) {
            return String(text || '').toLocaleLowerCase();
        }

        function findMatchesInVisibleText(keyword) {
            const editorElement = getEditorElement();
            if (!editorElement) return [];

            const originalText = editorElement.textContent || '';
            const needle = String(keyword || '');
            if (!needle) return [];

            const source = normalizeSearchText(originalText);
            const target = normalizeSearchText(needle);
            const out = [];
            let cursor = 0;

            while (cursor <= source.length) {
                const idx = source.indexOf(target, cursor);
                if (idx === -1) break;
                out.push({ start: idx, end: idx + needle.length });
                cursor = idx + Math.max(1, needle.length);
            }
            return out;
        }

        function addRangeHighlightOverlay(range) {
            const rects = Array.from(range.getClientRects());
            rects.forEach(function(rect) {
                if (!rect || rect.width <= 0 || rect.height <= 0) return;
                const overlay = document.createElement('div');
                overlay.className = 'find-highlight-overlay';
                overlay.style.cssText = [
                    'position:fixed',
                    'left:' + rect.left + 'px',
                    'top:' + rect.top + 'px',
                    'width:' + rect.width + 'px',
                    'height:' + rect.height + 'px',
                    'background:rgba(255,235,59,0.55)',
                    'border-radius:2px',
                    'pointer-events:none',
                    'z-index:10002'
                ].join(';');
                document.body.appendChild(overlay);
                activeHighlightOverlays.push(overlay);
            });
        }

        function pickHighlightByIndex(index) {
            if (visibleMatches.length > index) return visibleMatches[index];
            if (visibleMatches.length > 0) return visibleMatches[0];
            return null;
        }

        // 高亮匹配项
        function highlightMatch(index) {
            if (matches.length === 0 || index < 0 || index >= matches.length) return;
            // 更新状态
            findStatus.textContent = (isEn() ? 'Match ' : '匹配 ') + (index + 1) + ' / ' + matches.length;
            try {
                const inputSelStart = findInput.selectionStart;
                const inputSelEnd = findInput.selectionEnd;
                const editorElement = getEditorElement();
                if (editorElement) {
                    const highlight = pickHighlightByIndex(index);
                    if (!highlight) return;

                    clearVisualHighlights();
                    // 创建范围并选择文本
                    const textNodes = [];
                    const walker = document.createTreeWalker(
                        editorElement,
                        NodeFilter.SHOW_TEXT,
                        null,
                        false
                    );
                    let node;
                    let currentPos = 0;
                    while (node = walker.nextNode()) {
                        const nodeLength = node.textContent.length;
                        if (currentPos + nodeLength > highlight.start && currentPos < highlight.end) {
                            textNodes.push({
                                node: node,
                                start: Math.max(0, highlight.start - currentPos),
                                end: Math.min(nodeLength, highlight.end - currentPos)
                            });
                        }
                        currentPos += nodeLength;
                        if (currentPos > highlight.end) break;
                    }
                    if (textNodes.length > 0) {
                        const range = document.createRange();
                        range.setStart(textNodes[0].node, textNodes[0].start);
                        range.setEnd(textNodes[textNodes.length - 1].node, textNodes[textNodes.length - 1].end);
                        let rect = null;
                        let targetNode = null;
                        try {
                            addRangeHighlightOverlay(range);
                            rect = range.getBoundingClientRect();
                            targetNode = textNodes[0].node.parentElement;
                        } catch (e) {
                            addRangeHighlightOverlay(range);
                            rect = range.getBoundingClientRect();
                            targetNode = textNodes[0].node.parentElement;
                        }
                        // 滚动到可视区域
                        if (rect && rect.height > 0) {
                            const container = editorElement.closest('.vditor-ir') || editorElement.closest('.vditor-wysiwyg') || editorElement.closest('.vditor-sv') || editorElement;
                            if (container && targetNode) {
                                const containerRect = container.getBoundingClientRect();
                                if (rect.top < containerRect.top || rect.bottom > containerRect.bottom) {
                                    if (targetNode.scrollIntoView) {
                                        targetNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                    }
                                }
                            }
                        }

                        // Keep typing focus in find box; do not move caret into editor content.
                        findInput.focus();
                        if (typeof inputSelStart === 'number' && typeof inputSelEnd === 'number') {
                            findInput.setSelectionRange(inputSelStart, inputSelEnd);
                        }
                    }
                }
            } catch (e) {
                console.error('Highlight error:', e);
            }
        }
        // 清除高亮
        function clearHighlights() {
            clearVisualHighlights();
            matches = [];
            visibleMatches = [];
            currentMatchIndex = -1;
        }
        // 查找下一个
        async function findNext() {
            if (matches.length === 0 || searchText !== findInput.value.trim()) {
                await performFind();
                return;
            }
            currentMatchIndex = (currentMatchIndex + 1) % matches.length;
            highlightMatch(currentMatchIndex);
        }
        // 查找上一个
        async function findPrev() {
            if (matches.length === 0 || searchText !== findInput.value.trim()) {
                await performFind();
                return;
            }
            currentMatchIndex = (currentMatchIndex - 1 + matches.length) % matches.length;
            highlightMatch(currentMatchIndex);
        }
        // 执行替换功能
        async function doReplace() {
            if (matches.length === 0 || currentMatchIndex < 0) {
                await performFind();
                if (matches.length === 0) return; // 还是没匹配到就算了
            }
            const replaceText = replaceInput.value;
            const vditor = g('vditor');
            if (!vditor) return;
            const currentText = vditor.getValue() || '';
            const target = matches[currentMatchIndex];
            const newText = currentText.slice(0, target.start) + replaceText + currentText.slice(target.end);
            vditor.setValue(newText, true);
            await performFind();
            if (matches.length > 0) {
                currentMatchIndex = Math.min(currentMatchIndex, matches.length - 1);
                highlightMatch(currentMatchIndex);
            }
        }
        // 全部替换
        async function doReplaceAll() {
            await performFind();
            if (matches.length === 0) return;
            const replaceText = replaceInput.value;
            const vditor = g('vditor');
            if (!vditor) return;
            const replaceRes = await smartReplaceAll(vditor.getValue() || '', searchText, replaceText, { caseSensitive: false });
            if (!replaceRes || replaceRes.code !== 200 || !replaceRes.data) return;
            vditor.setValue(replaceRes.data.text || '', true);
            findStatus.textContent = (isEn() ? 'Replaced ' : '已替换 ') + (replaceRes.data.replaced || 0) + (isEn() ? ' occurrences' : ' 处');
            findStatus.style.color = '#28a745';
            clearHighlights();
            matches = [];
            currentMatchIndex = -1;
        }
        // 绑定事件
        let findTimeout;
        findInput.addEventListener('input', function() {
            clearTimeout(findTimeout);
            findTimeout = setTimeout(function() { performFind(); }, 200);
        });
        findInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                findNext();
            }
        });
        replaceInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                doReplace();
            }
        });
        findNextBtn.onclick = findNext;
        findPrevBtn.onclick = findPrev;
        replaceBtn.onclick = doReplace;
        replaceAllBtn.onclick = doReplaceAll;
        if (wasmSearchBtn) wasmSearchBtn.onclick = runWasmSearch;
        // 关闭对话框并清除高亮
        function closeFindDialog() {
            clearVisualHighlights();
            dialog.remove();
        }
        closeBtn.onclick = closeFindDialog;
        // ESC键关闭
        const handleEsc = function(e) {
            if (e.key === 'Escape') {
                closeFindDialog();
                document.removeEventListener('keydown', handleEsc);
            }
        };
        document.addEventListener('keydown', handleEsc);
    }


    // 导出函数到全局对象
    global.loadFilesFromServer = loadFilesFromServer;
    global.loadLocalFiles = loadLocalFiles;
    global.loadFiles = loadFiles;
    global.expandActiveFile = expandActiveFile;
    global.renameFile = renameFile;
    global.createDefaultFile = createDefaultFile;
    global.createNewFile = createNewFile;
    global.createNewFolder = createNewFolder;
    global.openFile = openFile;
    global.deleteFile = deleteFile;
    global.saveCurrentFile = saveCurrentFile;
    global.createHistoryVersion = createHistoryVersion;
    global.getFileHistory = getFileHistory;
    global.showHistoryModal = showHistoryModal;
    global.startAutoSave = startAutoSave;
    global.clearAutoSave = clearAutoSave;
    global.startAutoSync = startAutoSync;
    global.stopAutoSync = stopAutoSync;
    global.syncAllFiles = syncAllFiles;
    global.syncFileToServer = syncFileToServer;
    global.deleteFileFromServer = deleteFileFromServer;
    global.syncCurrentFileWithBeacon = syncCurrentFileWithBeacon;
    global.markPendingServerSync = markPendingServerSync;
    global.previewHistoryVersion = previewHistoryVersion;
    global.restoreFromHistory = restoreFromHistory;
    global.deleteHistoryVersion = deleteHistoryVersion;
    global.moveFile = moveFile;

    // 导出文件对比和全文查找功能
    global.showFileDiffDialog = showFileDiffDialog;
    global.showFindDialog = showFindDialog;

})(typeof window !== 'undefined' ? window : this);

