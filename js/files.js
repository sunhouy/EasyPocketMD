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
            return JSON.parse(localStorage.getItem('vditor_pending_server_sync') || '{}') || {};
        } catch (e) {
            return {};
        }
    }

    function persistPendingServerSync(map) {
        try {
            localStorage.setItem('vditor_pending_server_sync', JSON.stringify(map || {}));
        } catch (e) {}
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

    // 【新增】获取所有可用目标文件夹（包含虚拟中间文件夹）
    function getAllFolderPaths() {
        const folderSet = new Set(['']); // 根目录
        const files = g('files');
        files.forEach(f => {
            if (f.type === 'folder') {
                folderSet.add(f.name);
            }
            // 对于文件，提取其所有的父路径作为文件夹
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
    async function loadFilesFromServer() {
        if (!g('currentUser')) return;
        try {
            global.showSyncStatus(isEn() ? 'Loading files from server...' : '正在从服务器加载文件...');
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
                        content: content
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

                const conflicts = detectConflicts(localFiles, serverFiles);
                if (conflicts.length > 0) {
                    showConflictResolution(conflicts, serverFiles);
                } else {
                    mergeFiles(localFiles, serverFiles);
                    loadFiles();
                    if (g('files').length > 0) openFirstFile();
                    else createDefaultFile();
                    global.showSyncStatus(isEn() ? 'File sync completed' : '文件同步完成', 'success');
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

    function detectConflicts(localFiles, serverFiles) {
        const conflicts = [];
        const serverFileMap = {};
        serverFiles.forEach(function(f) { serverFileMap[f.name] = f; });

        localFiles.forEach(function(localFile) {
            const serverFile = serverFileMap[localFile.name];
            if (serverFile) {
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
                // 只有当本地文件曾经同步过（isSynced=true），而服务器现在没有时，才视为“服务器删除”冲突。
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
                    token: g('currentUser').token || g('currentUser').username,
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
            token: g('currentUser').token || g('currentUser').username,
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

    function showConflictResolution(conflicts, serverFiles) {
        const conflictModal = document.getElementById('conflictModalOverlay');
        const conflictList = document.getElementById('conflictList');
        if (!conflictModal || !conflictList) return;
        conflictList.innerHTML = '';
        conflicts.forEach(function(conflict, index) {
            const conflictItem = document.createElement('div');
            conflictItem.className = 'conflict-option';

            if (conflict.type === 'delete') {
                conflictItem.innerHTML = '<div><strong style="color: #dc3545;">⚠️ ' + conflict.filename + '</strong><div class="conflict-details"><div style="color: #dc3545;">' + (isEn() ? 'This file has been deleted on the server' : '该文件在服务器上已经删除') + '</div><div>' + (isEn() ? 'Local modified time: ' : '本地修改时间: ') + new Date(conflict.localModified).toLocaleString() + '</div></div><div style="margin-top: 8px;"><label style="margin-right: 15px;"><input type="radio" name="conflict-' + index + '" value="upload">' + (isEn() ? 'Re-upload to server' : '重新上传到服务器') + '</label><label><input type="radio" name="conflict-' + index + '" value="delete" checked>' + (isEn() ? 'Delete local file' : '删除本地文件') + '</label></div></div>';
            } else {
                conflictItem.innerHTML = '<div><strong>' + conflict.filename + '</strong><div class="conflict-details"><div>' + (isEn() ? 'Local modified time: ' : '本地修改时间: ') + new Date(conflict.localModified).toLocaleString() + '</div><div>' + (isEn() ? 'Server modified time: ' : '服务器修改时间: ') + new Date(conflict.serverModified).toLocaleString() + '</div></div><div style="margin-top: 8px;"><label style="margin-right: 15px;"><input type="radio" name="conflict-' + index + '" value="local">' + (isEn() ? 'Use local version' : '使用本地版本') + '</label><label><input type="radio" name="conflict-' + index + '" value="server" checked>' + (isEn() ? 'Use server version' : '使用服务器版本') + '</label></div></div>';
            }
            conflictList.appendChild(conflictItem);
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
            resolveConflicts(conflicts, serverFiles);
            global.showMessage(isEn() ? 'Using server version by default' : '已默认使用服务器版本');
        };

        var handleEsc = function(e) {
            if (e.key === 'Escape' && conflictModal.classList.contains('show')) {
                handleDefaultResolution();
            }
        };

        if (resolveBtn) resolveBtn.onclick = function() { 
            document.removeEventListener('keydown', handleEsc);
            resolveConflicts(conflicts, serverFiles); 
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

    function resolveConflicts(conflicts, serverFiles) {
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
                const useLocal = selection.value === 'local';
                if (useLocal) {
                    const serverFileIndex = serverFiles.findIndex(function(f) { return f.name === conflict.filename; });
                    if (serverFileIndex !== -1) serverFiles[serverFileIndex].content = conflict.localContent;
                } else {
                    const localFileIndex = localFiles.findIndex(function(f) { return f.name === conflict.filename; });
                    if (localFileIndex !== -1) {
                        localFiles[localFileIndex].content = conflict.serverContent;
                        localFiles[localFileIndex].lastModified = conflict.serverModified;
                        if (currentFileId === localFiles[localFileIndex].id && vditor) vditor.setValue(conflict.serverContent);
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
        if (g('files').length > 0) openFirstFile();
        global.showMessage(isEn() ? 'Conflict resolved, files synced' : '冲突已解决，文件已同步');
        global.showSyncStatus(isEn() ? 'File sync completed' : '文件同步完成', 'success');
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

    // 打开第一个文件（忽略文件夹）
    function openFirstFile() {
        const firstFile = g('files').find(f => f.type === 'file');
        if (firstFile) openFile(firstFile.id);
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
            if (f.name === '.easypocketmd_orders') return;
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
        nodes.sort((a, b) => {
            const orderA = a.data.order;
            const orderB = b.data.order;
            if (orderA !== orderB) return orderA - orderB;
            // 如果 order 相同，文件夹排前面，然后按名称排序
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
                    'icons': true
                }
            },
            'types': {
                'default': { 'icon': 'fas fa-folder' },
                'file': { 'icon': 'fas fa-file' },
                'folder': { 'icon': 'fas fa-folder' } },
            'plugins': ['types', 'contextmenu', 'wholerow'],
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
                                g('customPrompt')(isEn() ? 'Please enter filename' : '请输入文件名', { defaultValue: isEn() ? 'New File' : '新文件' }).then(function(name) {
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
                                g('customPrompt')(isEn() ? 'Please enter folder name' : '请输入文件夹名', { defaultValue: isEn() ? 'New Folder' : '新文件夹' }).then(function(name) {
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
            g('customAlert')(isEn() ? 'An item with the same name already exists at the target location' : '目标位置已存在同名项');
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
            content: isEn() ? '# Welcome to Markdown Editor\n\nThis is a new document.\n\n## Features\n\n- Markdown syntax support\n- Real-time preview\n- Auto-save\n- Multi-file management\n\nStart writing!' : '# 欢迎使用 Markdown 编辑器\n\n这是一个新的文档。\n\n## 功能特性\n\n- 支持 Markdown 语法\n- 实时预览\n- 自动保存\n- 多文件管理\n\n开始编写吧！',
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

    function openFile(fileId) {
        const files = g('files');
        const file = files.find(f => f.id === fileId && f.type === 'file');
        if (!file) {
            g('customAlert')(isEn() ? 'Cannot open folder' : '无法打开文件夹');
            return;
        }
        global.currentFileId = fileId;
        if (g('vditor')) g('vditor').setValue(file.content);
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
        const content = vditor.getValue();
        const file = files[fileIndex];
        const contentChanged = content !== file.content;
        file.content = content;
        file.lastModified = Date.now();
        localStorage.setItem('vditor_files', JSON.stringify(files));
        g('unsavedChanges')[currentFileId] = false;
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
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (g('currentUser').token || g('currentUser').username) },
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
            const response = await fetch(api + '/files/history/list?username=' + encodeURIComponent(g('currentUser').username) + '&filename=' + encodeURIComponent(filename), {
                method: 'GET',
                headers: { 'Authorization': 'Bearer ' + (g('currentUser').token || g('currentUser').username) }
            });
            const result = global.parseJsonResponse ? await global.parseJsonResponse(response) : await response.json();
            return (result.code === 200 && result.data && result.data.history) ? result.data.history : [];
        } catch (e) { console.error('获取历史版本失败', e); return []; }
    }

    async function showHistoryModal(fileId, filename) {
        const modal = document.getElementById('historyModalOverlay');
        const historyList = document.getElementById('historyList');
        const historyFileName = document.getElementById('historyFileName');
        if (!modal || !historyList || !historyFileName) return;
        historyFileName.textContent = filename;
        modal.classList.add('show');
        historyList.innerHTML = '<div class="history-loading"><i class="fas fa-spinner fa-spin"></i> ' + (isEn() ? 'Loading history versions...' : '正在加载历史版本...') + '</div>';
        try {
            const history = await getFileHistory(filename);
            if (history.length === 0) {
                historyList.innerHTML = '<div class="history-loading">' + (isEn() ? 'No history versions' : '暂无历史版本') + '</div>';
                return;
            }
            const files = g('files');
            const currentFile = files.find(function(f) { return f.id === fileId; });
            const currentContent = currentFile ? currentFile.content : '';
            historyList.innerHTML = '';
            history.forEach(function(version, index) {
                const versionEl = document.createElement('div');
                versionEl.className = 'history-version' + (index === 0 ? ' history-version-current' : '');
                const date = new Date(version.timestamp).toLocaleString();
                const contentPreview = version.content.substring(0, 200) + (version.content.length > 200 ? '...' : '');
                versionEl.innerHTML = '<div class="history-version-header"><div class="history-version-title">' + (isEn() ? 'Version ' : '版本 ') + version.version_id + (index === 0 ? ' <span style="color:#4CAF50;font-size:12px;">(' + (isEn() ? 'Current' : '当前') + ')</span>' : '') + '</div><div class="history-version-date">' + date + '</div></div><div class="history-version-content">' + global.escapeHtml(contentPreview) + '</div><div class="history-version-actions"><button class="modal-btn small preview-btn"><i class="fas fa-eye"></i> ' + (isEn() ? 'Preview' : '预览') + '</button>' + (index > 0 ? '<button class="modal-btn small primary restore-btn"><i class="fas fa-history"></i> ' + (isEn() ? 'Restore' : '恢复') + '</button>' : '') + '<button class="modal-btn small delete-history-btn"><i class="fas fa-trash"></i> ' + (isEn() ? 'Delete' : '删除') + '</button></div>';
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

    function startAutoSave() {
        global.clearAutoSave();
        global.autoSaveTimer = setTimeout(function() { global.saveCurrentFile(); }, 3000);
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
        global.showSyncStatus(isEn() ? 'Syncing ' + filesToSync.length + ' files...' : '正在同步 ' + filesToSync.length + ' 个文件...');
        try {
            for (var i = 0; i < filesToSync.length; i++) await global.syncFileToServer(filesToSync[i].id);
            global.showSyncStatus(isEn() ? 'All files synced' : '所有文件同步完成', 'success');
        } catch (error) {
            console.error('同步失败', error);
            global.showSyncStatus(isEn() ? 'Sync failed' : '同步失败', 'error');
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
        }

        try {
            var api = global.getApiBaseUrl ? global.getApiBaseUrl() : 'api';
            const response = await fetch(api + '/files/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (g('currentUser').token || g('currentUser').username) },
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
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (g('currentUser').token || g('currentUser').username) },
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
        html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color: #3498db;">$1</a>');
        return html.replace(/\n/g, '<br>');
    }

    function previewHistoryVersion(filename, versionId, content, timestamp) {
        var nightMode = g('nightMode') === true;
        var previewModal = document.createElement('div');
        previewModal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.9);z-index:10000;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;';
        var previewContent = document.createElement('div');
        previewContent.style.cssText = 'background:' + (nightMode ? '#2d2d2d' : 'white') + ';border-radius:12px;padding:0;width:95%;max-width:900px;max-height:85vh;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 10px 40px rgba(0,0,0,0.3);';
        var previewHeader = document.createElement('div');
        previewHeader.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:20px;border-bottom:1px solid ' + (nightMode ? '#444' : '#eee') + ';background:' + (nightMode ? '#1e1e1e' : '#f8f9fa') + ';';
        var headerLeft = document.createElement('div');
        var previewTitle = document.createElement('h3');
        previewTitle.textContent = (isEn() ? 'Preview History Version (ID: ' : '预览历史版本 (ID: ') + versionId + ')';
        previewTitle.style.cssText = 'margin:0 0 5px 0;color:' + (nightMode ? '#eee' : '#333') + ';font-size:18px;';
        var previewSubtitle = document.createElement('div');
        previewSubtitle.textContent = (isEn() ? 'File: ' : '文件: ') + filename + ' | ' + (isEn() ? 'Saved at: ' : '保存时间: ') + new Date(timestamp).toLocaleString();
        previewSubtitle.style.cssText = 'color:' + (nightMode ? '#aaa' : '#666') + ';font-size:13px;';
        headerLeft.appendChild(previewTitle);
        headerLeft.appendChild(previewSubtitle);
        var closeBtn = document.createElement('button');
        closeBtn.innerHTML = '<i class="fas fa-times"></i>';
        closeBtn.style.cssText = 'background:none;border:none;color:' + (nightMode ? '#aaa' : '#666') + ';font-size:20px;cursor:pointer;padding:8px;';
        previewHeader.appendChild(headerLeft);
        previewHeader.appendChild(closeBtn);
        var previewBody = document.createElement('div');
        previewBody.style.cssText = 'flex:1;overflow-y:auto;padding:20px;font-family:Courier New,monospace;white-space:pre-wrap;word-break:break-all;color:' + (nightMode ? '#ddd' : '#333') + ';line-height:1.6;background:' + (nightMode ? '#1e1e1e' : '#fafafa') + ';';
        previewBody.innerHTML = highlightMarkdown(content);
        previewContent.appendChild(previewHeader);
        previewContent.appendChild(previewBody);
        previewModal.appendChild(previewContent);
        document.body.appendChild(previewModal);
        closeBtn.addEventListener('click', function() { previewModal.remove(); });
        previewModal.addEventListener('click', function(e) { if (e.target === previewModal) previewModal.remove(); });
        var handleKeydown = function(e) { if (e.key === 'Escape') { previewModal.remove(); document.removeEventListener('keydown', handleKeydown); } };
        document.addEventListener('keydown', handleKeydown);
    }

    async function restoreHistoryVersion(filename, versionId, content) {
        if (!g('currentUser')) return false;
        try {
            var api = global.getApiBaseUrl ? global.getApiBaseUrl() : 'api';
            var response = await fetch(api + '/files/history/restore', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (g('currentUser').token || g('currentUser').username) },
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
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (g('currentUser').token || g('currentUser').username) },
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

})(typeof window !== 'undefined' ? window : this);

