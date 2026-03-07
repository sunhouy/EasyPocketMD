/**
 * 文件管理 - 加载、保存、同步、冲突、历史版本、文件夹
 */
(function(global) {
    'use strict';

    function g(name) { return global[name]; }

    // ---------- 辅助函数：路径处理 ----------
    function normalizePath(input) {
        let path = input.trim();
        if (path.startsWith('/')) {
            path = path.substring(1);
        }
        if (path.endsWith('.md') || path.endsWith('.txt')) {
            path = path.substring(0, path.length - 3);
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
            let path = f.name;
            while (path) {
                folderSet.add(path);
                const parent = getParentPath(path);
                if (!parent || parent === path) break;
                path = parent;
            }
        });
        return Array.from(folderSet).sort((a, b) => a.localeCompare(b));
    }

    // ---------- 服务器同步相关 ----------
    async function loadFilesFromServer() {
        if (!g('currentUser')) return;
        try {
            global.showSyncStatus('正在从服务器加载文件...');
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
                    // 检查是否为文件夹标记
                    if (content === '{"meta":"folder"}' || content === '{"type":"folder"}') {
                        type = 'folder';
                        content = '';
                    }
                    return {
                        ...f,
                        name: f.name.startsWith('/') ? f.name.substring(1) : f.name,
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
                const conflicts = detectConflicts(localFiles, serverFiles);
                if (conflicts.length > 0) {
                    showConflictResolution(conflicts, serverFiles);
                } else {
                    mergeFiles(localFiles, serverFiles);
                    loadFiles();
                    if (g('files').length > 0) openFirstFile();
                    else createDefaultFile();
                    global.showSyncStatus('文件同步完成', 'success');
                }
            } else {
                loadLocalFiles();
                global.showSyncStatus('服务器没有文件，使用本地文件', 'success');
            }
        } catch (error) {
            console.error('从服务器加载文件失败:', error);
            global.showSyncStatus('同步失败，使用本地文件', 'error');
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
                conflicts.push({
                    type: 'delete',
                    filename: localFile.name,
                    localContent: localFile.content,
                    localModified: localFile.lastModified
                });
            }
        });
        return conflicts;
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
                conflictItem.innerHTML = '<div><strong style="color: #dc3545;">⚠️ ' + conflict.filename + '</strong><div class="conflict-details"><div style="color: #dc3545;">该文件在服务器上已经删除</div><div>本地修改时间: ' + new Date(conflict.localModified).toLocaleString() + '</div></div><div style="margin-top: 8px;"><label style="margin-right: 15px;"><input type="radio" name="conflict-' + index + '" value="upload">重新上传到服务器</label><label><input type="radio" name="conflict-' + index + '" value="delete" checked>删除本地文件</label></div></div>';
            } else {
                conflictItem.innerHTML = '<div><strong>' + conflict.filename + '</strong><div class="conflict-details"><div>本地修改时间: ' + new Date(conflict.localModified).toLocaleString() + '</div><div>服务器修改时间: ' + new Date(conflict.serverModified).toLocaleString() + '</div></div><div style="margin-top: 8px;"><label style="margin-right: 15px;"><input type="radio" name="conflict-' + index + '" value="local">使用本地版本</label><label><input type="radio" name="conflict-' + index + '" value="server" checked>使用服务器版本</label></div></div>';
            }
            conflictList.appendChild(conflictItem);
        });
        conflictModal.classList.add('show');
        var resolveBtn = document.getElementById('resolveConflictsBtn');
        var cancelBtn = document.getElementById('cancelConflictBtn');
        if (resolveBtn) resolveBtn.onclick = function() { resolveConflicts(conflicts, serverFiles); conflictModal.classList.remove('show'); };
        if (cancelBtn) cancelBtn.onclick = function() { conflictModal.classList.remove('show'); loadLocalFiles(); global.showMessage('冲突解决已取消，使用本地文件'); };
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
        global.showMessage('冲突已解决，文件已同步');
        global.showSyncStatus('文件同步完成', 'success');
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

    // ---------- 树形渲染及交互 ----------
    function buildTree(files) {
        // 创建路径到条目的映射
        const pathMap = {};
        files.forEach(f => { pathMap[f.name] = f; });

        // 根节点
        const root = { name: '', basename: '/', children: [], type: 'folder', id: null };
        const map = { '': root };

        // 按路径长度排序，确保父路径先处理
        const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name));
        sorted.forEach(f => {
            const parts = f.name.split('/').filter(p => p);
            let currentPath = '';
            let parent = root;
            for (let i = 0; i < parts.length; i++) {
                const part = parts[i];
                const isLast = i === parts.length - 1;
                const fullPath = currentPath ? currentPath + '/' + part : part;

                if (!map[fullPath]) {
                    // 查找该路径是否有对应的条目
                    const entry = pathMap[fullPath];
                    const node = {
                        name: fullPath,
                        basename: part,
                        type: entry ? entry.type : (isLast ? f.type : 'folder'),
                        id: entry ? entry.id : null,
                        children: []
                    };
                    map[fullPath] = node;
                    parent.children.push(node);
                }
                parent = map[fullPath];
                currentPath = fullPath;
            }
        });
        return root.children;
    }

    function renderTree(nodes, level) {
        let html = '';
        nodes.forEach(node => {
            const isFolder = node.type === 'folder' || node.children.length > 0;
            const icon = isFolder ? '<i class="fas fa-folder"></i>' : '<i class="fas fa-file"></i>';
            const hasChildren = node.children.length > 0;
            const toggleIcon = ''; // 移除箭头图标
            const syncIcon = node.type === 'file' && node.isSynced === false ?
                '<i class="fas fa-exclamation-circle" style="color: #ff9800; margin-right:5px;" title="未同步到服务器"></i>' : '';
            let actions = '';
            if (node.id) {
                if (node.type === 'file') {
                    actions = `                                                
                         <button class="file-action-btn history-file"           
 data-id="${node.id}" data-name="${node.name}" title="历史版本"><i class="fas   
 fa-history"></i></button>                                                      
                         <button class="file-action-btn rename-file"            
 data-id="${node.id}" title="重命名"><i class="fas fa-edit"></i></button>       
                         <button class="file-action-btn move-file"              
 data-id="${node.id}" title="移动"><i class="fas fa-arrows-alt"></i></button>   
                         <button class="file-action-btn delete-file"            
 data-id="${node.id}" title="删除"><i class="fas fa-trash"></i></button>        
                     `;
                } else {
                    actions = `                                                
                         <button class="file-action-btn rename-file"            
 data-id="${node.id}" title="重命名"><i class="fas fa-edit"></i></button>       
                         <button class="file-action-btn move-file"              
 data-id="${node.id}" title="移动"><i class="fas fa-arrows-alt"></i></button>   
                         <button class="file-action-btn delete-file"            
 data-id="${node.id}" title="删除"><i class="fas fa-trash"></i></button>        
                     `;
                }
            }
            html += `<li class="file-item ${node.id === g('currentFileId') ?
                'active' : ''}" data-id="${node.id || ''}" data-type="${node.type}" data-path="${node.name}" draggable="true"           
 style="list-style:none;">`;

            // 移除原来用 level*20 计算 padding-left 的做法，仅保留微小间距
            html += `<div class="file-header" style="display:flex;             
 align-items:center; padding: 6px 4px;">`;
            html += toggleIcon;
            const nameClass = isFolder ? 'file-name folder-name' : 'file-name';
            html += `<span class="${nameClass}" title="${node.name}"              
 style="flex:1; margin-left:5px; white-space:nowrap; overflow:hidden;           
 text-overflow:ellipsis;">${icon} ${syncIcon} ${node.basename}</span>`;
            html += `<div class="file-actions">${actions}</div>`;
            html += `</div>`;

            if (hasChildren) {
                // 子级向下展开，直接在这里加左边框/左边距，而不是让每行 header 无限向右偏移
                html += `<ul class="file-sublist" style="display:none; list-style:none; padding-left: 0; margin: 0; border-left: none !important;">${renderTree(node.children, level+1)}</ul>`;
            }
            html += `</li>`;
        });
        return html;
    }

    function expandActiveFile() {
        const currentFileId = g('currentFileId');
        if (!currentFileId) return;
        
        // Find the file item in the DOM
        const fileItem = document.querySelector(`.file-item[data-id="${currentFileId}"]`);
        if (!fileItem) return;

        // Traverse up to find all parent file-sublist lists
        let parent = fileItem.parentElement;
        while (parent && (parent.classList.contains('file-sublist') || parent.tagName === 'LI')) {
            if (parent.classList.contains('file-sublist')) {
                parent.style.display = 'block';
            }
            parent = parent.parentElement;
        }
    }

    function toggleFolder(item) {
        const sublist = item.querySelector(':scope > .file-sublist'); // 只找直接子级
        if (!sublist) return;
        const isHidden = sublist.style.display === 'none';
        sublist.style.display = isHidden ? 'block' : 'none'; // 使用 block 正常向下撑开

        const icon = item.querySelector(':scope > .file-header .folder-toggle svg');
        if (icon) {
            icon.classList.toggle('fa-chevron-right', !isHidden);
            icon.classList.toggle('fa-chevron-down', isHidden);
        }
    }

    // ---------- 拖拽相关函数 ----------
    let draggedItem = null;

    function handleDragStart(e) {
        const item = e.target.closest('.file-item');
        if (!item) return;
        
        draggedItem = item;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', item.dataset.id);
        item.classList.add('dragging');
    }

    function handleDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        
        const target = e.target.closest('.file-item');
        
        // 清理之前的高亮
        document.querySelectorAll('.file-item.drag-over').forEach(el => {
            if (el !== target) el.classList.remove('drag-over');
        });
        
        if (target && target !== draggedItem) {
            // 如果目标是文件夹
            if (target.dataset.type === 'folder') {
                target.classList.add('drag-over');
            }
        }
    }

    function handleDragLeave(e) {
        const target = e.target.closest('.file-item');
        if (target) {
            target.classList.remove('drag-over');
        }
    }

    function handleDrop(e) {
        e.preventDefault();
        
        if (draggedItem) {
            draggedItem.classList.remove('dragging');
            draggedItem = null;
        }
        document.querySelectorAll('.file-item.drag-over').forEach(el => el.classList.remove('drag-over'));

        const sourceId = e.dataTransfer.getData('text/plain');
        if (!sourceId) return;

        const targetItem = e.target.closest('.file-item');
        let targetPath = '';

        if (targetItem) {
            if (targetItem.dataset.type === 'folder') {
                targetPath = targetItem.dataset.path;
            } else {
                return; // 不允许拖到文件上
            }
        } else {
            targetPath = ''; // 根目录
        }

        moveFileTo(sourceId, targetPath);
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
                alert('不能将文件夹移动到自身或其子目录中');
                return;
            }
        }

        if (files.some(f => f.name === newName && f.id !== id)) {
            alert('目标位置已存在同名项');
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
        global.showMessage(`${item.type === 'folder' ? '文件夹' : '文件'}已移动`);
        
        if (g('currentUser')) {
             if (item.type === 'folder') {
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

    function loadFiles() {
        const fileList = document.getElementById('fileList');
        if (!fileList) return;
        const files = g('files');
        const currentFileId = g('currentFileId');

        const tree = buildTree(files);
        fileList.innerHTML = renderTree(tree, 0);
        
        // 自动展开到当前文件
        expandActiveFile();

        if (!fileList._treeEventsBound) {
            fileList._treeEventsBound = true;
            
            // 绑定拖拽事件
            fileList.addEventListener('dragstart', handleDragStart);
            fileList.addEventListener('dragover', handleDragOver);
            fileList.addEventListener('dragleave', handleDragLeave);
            fileList.addEventListener('drop', handleDrop);

            fileList.addEventListener('click', function(e) {
                const target = e.target.closest('.file-item');
                if (!target) return;

                const id = target.dataset.id;
                const type = target.dataset.type;

                // 点击箭头图标
                if (e.target.closest('.folder-toggle')) {
                    e.stopImmediatePropagation();
                    toggleFolder(target);
                    return;
                }

                // 操作按钮点击
                const btn = e.target.closest('.file-action-btn');
                if (btn) {
                    e.stopImmediatePropagation();
                    if (btn.classList.contains('delete-file') && id) global.deleteFile(id);
                    else if (btn.classList.contains('rename-file') && id) global.renameFile(id);
                    else if (btn.classList.contains('move-file') && id) global.moveFile(id);
                    else if (btn.classList.contains('history-file') && id) {
                        const name = btn.dataset.name;
                        if (id) global.showHistoryModal(id, name);
                    }
                    return;
                }

                // 正常点击：文件打开 / 文件夹展开
                if (type === 'file') {
                    if (id && g('currentFileId')) global.saveCurrentFile(true);
                    if (id) openFile(id);
                } else if (type === 'folder') {
                    toggleFolder(target);
                }
            });
        }
    }

    // ---------- 文件操作函数 ----------
    function moveFile(id) {
        const files = g('files');
        const item = files.find(f => f.id === id);
        if (!item) return;

        // 动态获取当前所有可用的文件夹路径（包括没有显式建文件夹记录的虚拟路径）
        const folders = getAllFolderPaths();

        let options = '请选择目标文件夹（输入序号）：\n';
        folders.forEach((f, idx) => options += `${idx + 1}. ${f === '' ? '/' :
            f}\n`);
        const choice = prompt(options + '\n输入数字：');
        if (!choice) return;

        const idx = parseInt(choice) - 1;
        if (isNaN(idx) || idx < 0 || idx >= folders.length) {
            alert('选择无效');
            return;
        }

        const targetPath = folders[idx];
        const oldName = item.name;
        const newBasename = getBasename(oldName);
        const newName = targetPath ? targetPath + '/' + newBasename :
            newBasename;

        // 防止移动到自己或自己的子目录中
        if (item.type === 'folder' && (newName === oldName ||
            newName.startsWith(oldName + '/'))) {
            alert('不能将文件夹移动到自身或其子目录中');
            return;
        }

        if (files.some(f => f.name === newName && f.id !== id)) {
            alert('目标文件夹下已存在同名项');
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
        global.showMessage(`${item.type === 'folder' ? '文件夹' :
            '文件'}已移动`);

        if (g('currentUser')) {
            if (item.type === 'folder') {
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

    function renameFile(id) {
        const files = g('files');
        const item = files.find(f => f.id === id);
        if (!item) return;

        const isFolder = item.type === 'folder';
        const oldName = item.name;
        const parentPath = getParentPath(oldName);
        const oldBasename = getBasename(oldName);

        const newBasename = prompt(`请输入新的${isFolder ? '文件夹' : '文件'}名：`, oldBasename);
        if (!newBasename || newBasename.trim() === oldBasename) return;

        if (isNameExistsInParent(newBasename.trim(), parentPath, id)) {
            alert('该目录下已存在同名文件或文件夹，请使用其他名称');
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
        global.showMessage(`${isFolder ? '文件夹' : '文件'}已重命名`);
        if (g('currentUser')) {
            if (isFolder) {
                const affectedFiles = files.filter(f => f.type === 'file' && (f.name.startsWith(newName + '/') || f.name === newName));
                affectedFiles.forEach(f => global.syncFileToServer(f.id));
            } else {
                global.deleteFileFromServer(oldName).then(() => global.syncFileToServer(id));
            }
        }
    }

    function createDefaultFile() {
        const defaultFile = {
            id: Date.now().toString(),
            name: '未命名文档', // 无前导斜杠
            type: 'file',
            content: '# 欢迎使用 Markdown 编辑器\n\n这是一个新的文档。\n\n## 功能特性\n\n- 支持 Markdown 语法\n- 实时预览\n- 自动保存\n- 多文件管理\n\n开始编写吧！',
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

    function createNewFile() {
        const input = prompt('请输入文件名（可包含路径，例如 docs/note）\n注意：请暂时不要使用嵌套文件夹，这个功能正在开发', '新文档');
        if (!input) return;

        let path = normalizePath(input);
        ensureParentFolders(path);

        const files = g('files');
        if (files.some(f => f.name === path && f.type === 'file')) {
            alert('已存在同名文件，请使用其他名称');
            return;
        }

        const newFile = {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
            name: path,
            type: 'file',
            content: '# 新文档\n\n开始编写您的内容...',
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
        global.showMessage('已创建文件: ' + path);
    }

    function createNewFolder() {
        const input = prompt('请输入文件夹路径（例如 docs/notes）', '新文件夹');
        if (!input) return;

        let path = normalizePath(input);
        ensureParentFolders(path);

        const files = g('files');
        if (files.some(f => f.name === path)) {
            alert('该路径已存在');
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
        if (g('currentUser')) {
            global.syncFileToServer(newFolder.id);
        }
        global.showMessage('已创建文件夹: ' + path);
    }

    function openFile(fileId) {
        const files = g('files');
        const file = files.find(f => f.id === fileId && f.type === 'file');
        if (!file) {
            alert('无法打开文件夹');
            return;
        }
        global.currentFileId = fileId;
        if (g('vditor')) g('vditor').setValue(file.content);
        loadFiles();
        global.startAutoSave();
        global.showMessage('已打开文件: ' + file.name);
    }

    function deleteFile(id) {
        const files = g('files');
        const item = files.find(f => f.id === id);
        if (!item) return;

        if (item.type === 'file') {
            if (files.filter(f => f.type === 'file').length <= 1) {
                alert('至少需要保留一个文件');
                return;
            }
            if (!confirm('确定要删除这个文件吗？')) return;

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
            global.showMessage('已删除文件: ' + item.name);
        } else {
            if (!confirm(`确定要删除文件夹“${item.name}”及其所有内容吗？`)) return;

            const toDelete = files.filter(f => f.name === item.name || f.name.startsWith(item.name + '/'));
            const fileNamesToDelete = toDelete.filter(f => f.type === 'file').map(f => f.name);

            deleteFolderAndChildren(item.name);
            localStorage.setItem('vditor_files', JSON.stringify(files));

            if (g('currentUser')) {
                fileNamesToDelete.forEach(name => global.deleteFileFromServer(name));
                // 只有当文件夹本身已同步（即服务器存在记录）时，才发送删除请求
                if (item.isSynced) {
                    global.deleteFileFromServer(item.name);
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
            global.showMessage('已删除文件夹: ' + item.name);
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
            const saveResult = await global.syncFileToServer(currentFileId);
            if (isManual && contentChanged && saveResult) {
                try { await global.createHistoryVersion(file.name, content); } catch (e) { console.warn('创建历史版本失败', e); }
            }
        }
        global.showMessage('文件已保存' + (isManual && contentChanged ? '' : ''));
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
        historyList.innerHTML = '<div class="history-loading"><i class="fas fa-spinner fa-spin"></i> 正在加载历史版本...</div>';
        try {
            const history = await getFileHistory(filename);
            if (history.length === 0) {
                historyList.innerHTML = '<div class="history-loading">暂无历史版本</div>';
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
                versionEl.innerHTML = '<div class="history-version-header"><div class="history-version-title">版本 ' + version.version_id + (index === 0 ? ' <span style="color:#4CAF50;font-size:12px;">(当前)</span>' : '') + '</div><div class="history-version-date">' + date + '</div></div><div class="history-version-content">' + global.escapeHtml(contentPreview) + '</div><div class="history-version-actions"><button class="modal-btn small preview-btn"><i class="fas fa-eye"></i> 预览</button>' + (index > 0 ? '<button class="modal-btn small primary restore-btn"><i class="fas fa-history"></i> 恢复</button>' : '') + '<button class="modal-btn small delete-history-btn"><i class="fas fa-trash"></i> 删除</button></div>';
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
            historyList.innerHTML = '<div class="history-loading">加载失败: ' + error.message + '</div>';
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
        const filesToSync = files.filter(function(file) {
            if (file.type !== 'file') return false;
            const currentContent = vditor && file.id === currentFileId ? vditor.getValue() : file.content;
            return !file.isSynced || currentContent !== lastSyncedContent[file.id];
        });
        if (filesToSync.length === 0) return;
        global.showSyncStatus('正在同步 ' + filesToSync.length + ' 个文件...');
        try {
            for (var i = 0; i < filesToSync.length; i++) await global.syncFileToServer(filesToSync[i].id);
            global.showSyncStatus('所有文件同步完成', 'success');
        } catch (error) {
            console.error('同步失败', error);
            global.showSyncStatus('同步失败', 'error');
        }
    }

    async function syncFileToServer(fileId) {
        if (!g('currentUser')) return;
        const files = g('files');
        const file = files.find(function(f) { return f.id === fileId; });
        if (!file) return;
        
        let content = '';
        if (file.type === 'folder') {
            content = '{"meta":"folder"}';
        } else {
            content = (g('vditor') && file.id === g('currentFileId') ? g('vditor').getValue() : file.content);
        }

        try {
            var api = global.getApiBaseUrl ? global.getApiBaseUrl() : 'api';
            const response = await fetch(api + '/files/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (g('currentUser').token || g('currentUser').username) },
                body: JSON.stringify({ username: g('currentUser').username, filename: file.name, content: content })
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
                }
                return true;
            }
            throw new Error(result.message || '保存失败');
        } catch (error) {
            console.error('同步文件失败:', error);
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
            if (!response.ok) throw new Error('HTTP ' + response.status + ': 删除失败');
            var result;
            try { result = JSON.parse(text); } catch (e) { throw new Error('服务器响应格式错误'); }
            if (result.code !== 200) console.error('删除失败', result.message);
        } catch (error) {
            console.error('从服务器删除文件失败', error);
            alert('删除文件失败: ' + error.message);
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
        previewTitle.textContent = '预览历史版本 (ID: ' + versionId + ')';
        previewTitle.style.cssText = 'margin:0 0 5px 0;color:' + (nightMode ? '#eee' : '#333') + ';font-size:18px;';
        var previewSubtitle = document.createElement('div');
        previewSubtitle.textContent = '文件: ' + filename + ' | 保存时间: ' + new Date(timestamp).toLocaleString();
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
        if (originalContent === newContent) return { hasChanges: false, message: '内容完全相同' };
        var originalLines = originalContent.split('\n');
        var newLines = newContent.split('\n');
        var maxLines = Math.max(originalLines.length, newLines.length);
        var added = 0, removed = 0, changed = 0;
        for (var i = 0; i < maxLines; i++) {
            if (i >= originalLines.length) added++;
            else if (i >= newLines.length) removed++;
            else if (originalLines[i] !== newLines[i]) changed++;
        }
        return { hasChanges: true, message: '行数变化: 新增 ' + added + ' 行，删除 ' + removed + ' 行，修改 ' + changed + ' 行', added: added, removed: removed, changed: changed };
    }

    async function restoreFromHistory(filename, versionId, content, fileId) {
        if (!confirm('确定要恢复到此版本吗？\n当前编辑器的内容将被替换。')) return;
        try {
            global.showMessage('正在恢复历史版本...', 'info');
            var vditor = g('vditor');
            var currentContent = vditor ? vditor.getValue() : '';
            var diff = compareVersions(currentContent, content);
            if (!diff.hasChanges) { global.showMessage('当前内容与所选版本相同，无需恢复', 'info'); return; }
            if (!confirm('即将恢复历史版本，以下是变化摘要：\n' + diff.message + '\n\n确定要恢复吗？')) return;
            if (g('currentUser')) {
                var success = await restoreHistoryVersion(filename, versionId, content);
                if (!success) global.showMessage('服务器恢复失败，将在本地恢复', 'warning');
            }
            var files = g('files');
            var fileIndex = files.findIndex(function(f) { return f.id === fileId; });
            if (fileIndex === -1) throw new Error('文件不存在');
            files[fileIndex].content = content;
            files[fileIndex].lastModified = Date.now();
            files[fileIndex].isSynced = g('currentUser') ? false : true;
            localStorage.setItem('vditor_files', JSON.stringify(files));
            if (vditor && g('currentFileId') === fileId) {
                vditor.setValue(content);
                global.showMessage('已恢复到此版本（版本ID: ' + versionId + '）', 'success');
                g('unsavedChanges')[fileId] = true;
                setTimeout(function() { global.saveCurrentFile(true); }, 1000);
            }
            var modal = document.getElementById('historyModalOverlay');
            if (modal) modal.classList.remove('show');
            loadFiles();
            if (g('currentUser')) setTimeout(function() { global.syncFileToServer(fileId); }, 2000);
        } catch (error) {
            console.error('恢复失败', error);
            global.showMessage('恢复失败: ' + error.message, 'error');
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
        modalContent.innerHTML = '<div class="modal-header" style="text-align:center;margin-bottom:20px;"><h2 style="margin:0 0 10px 0;color:#dc3545;">删除确认</h2><p style="color:' + secondaryTextColor + ';margin:0;">请确认是否要删除此历史版本</p></div><div style="margin:15px 0;">文件：' + global.escapeHtml(filename) + '</div><div style="display:flex;gap:10px;justify-content:center;margin-top:25px;"><button class="delete-confirm-cancel" style="padding:10px 24px;background:' + (nightMode ? '#555' : '#6c757d') + ';color:white;border:none;border-radius:6px;cursor:pointer;">取消</button><button class="delete-confirm-ok" style="padding:10px 24px;background:#dc3545;color:white;border:none;border-radius:6px;cursor:pointer;">确认删除</button></div>';
        confirmModal.appendChild(modalContent);
        document.body.appendChild(confirmModal);
        var cancelBtn = modalContent.querySelector('.delete-confirm-cancel');
        var confirmBtn = modalContent.querySelector('.delete-confirm-ok');
        cancelBtn.onclick = function() { global.removeModal(confirmModal); };
        confirmBtn.onclick = function() {
            confirmBtn.disabled = true;
            confirmBtn.textContent = '删除中...';
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
                global.showMessage('历史版本 ' + versionId + ' 已删除', 'success');
                var historyModal = document.getElementById('historyModalOverlay');
                if (historyModal) historyModal.classList.remove('show');
                setTimeout(function() { global.showHistoryModal(fileId, filename); }, 1000);
            } else throw new Error('删除失败');
        } catch (error) {
            console.error('删除历史版本失败', error);
            global.showMessage('删除失败: ' + error.message, 'error');
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

            global.showMessage(`正在导入 ${files.length} 个文件...`, 'info');

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
                    global.showMessage(`读取文件 ${file.name} 失败: ${error.message}`, 'error');
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

                global.showMessage(`成功导入 ${importedCount} 个文件${skippedCount > 0 ? `，跳过 ${skippedCount} 个` : ''}`, 'success');
            } else {
                global.showMessage('没有导入任何文件', 'warning');
            }

            fileInput.remove();
        });

        fileInput.click();
    };

    function readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(new Error('读取文件失败'));
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
    global.previewHistoryVersion = previewHistoryVersion;
    global.restoreFromHistory = restoreFromHistory;
    global.deleteHistoryVersion = deleteHistoryVersion;
    global.moveFile = moveFile;

})(typeof window !== 'undefined' ? window : this);

