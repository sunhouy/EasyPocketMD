/**
 * 草稿恢复模块 - 防止应用强制关闭导致数据丢失
 * 支持 Web、Capacitor 和 Electron 环境
 */
(function(global) {
    'use strict';

    const DRAFT_KEY = 'vditor_draft_backup';
    const DRAFT_META_KEY = 'vditor_draft_meta';
    const BACKUP_INTERVAL = 1000; // 每1秒备份一次
    let backupTimer = null;
    let isDirty = false;

    /**
     * 获取当前编辑器内容的草稿数据
     */
    function captureDraft() {
        const vditor = global.vditor;
        const currentFileId = global.currentFileId;
        if (!vditor || !currentFileId) return null;

        try {
            const content = vditor.getValue();
            const files = global.files || [];
            const currentFile = files.find(f => f.id === currentFileId);

            if (!currentFile) return null;

            return {
                fileId: currentFileId,
                fileName: currentFile.name,
                content: content,
                timestamp: Date.now(),
                lastModified: Date.now()
            };
        } catch (e) {
            console.error('[Draft] Failed to capture draft:', e);
            return null;
        }
    }

    /**
     * 保存草稿到 localStorage
     */
    function saveDraft() {
        const draft = captureDraft();
        if (!draft) return;

        try {
            // 保存草稿内容
            localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));

            // 更新元数据
            const meta = {
                lastBackupTime: Date.now(),
                fileId: draft.fileId,
                fileName: draft.fileName
            };
            localStorage.setItem(DRAFT_META_KEY, JSON.stringify(meta));

            isDirty = false;
        } catch (e) {
            console.error('[Draft] Failed to save draft:', e);
        }
    }

    /**
     * 标记需要备份
     */
    function markDirty() {
        isDirty = true;
    }

    /**
     * 启动定期备份定时器
     */
    function startBackupTimer() {
        if (backupTimer) return;

        backupTimer = setInterval(function() {
            if (isDirty) {
                saveDraft();
            }
        }, BACKUP_INTERVAL);
    }

    /**
     * 停止备份定时器
     */
    function stopBackupTimer() {
        if (backupTimer) {
            clearInterval(backupTimer);
            backupTimer = null;
        }
    }

    /**
     * 立即执行一次备份
     */
    function backupNow() {
        saveDraft();
    }

    /**
     * 检查是否有可恢复的草稿
     */
    function hasRecoverableDraft() {
        try {
            const draftJson = localStorage.getItem(DRAFT_KEY);
            if (!draftJson) return false;

            const draft = JSON.parse(draftJson);
            if (!draft || !draft.fileId || !draft.content) return false;

            // 检查草稿是否比当前文件更新（先通过ID匹配，再通过文件名匹配）
            const files = global.files || [];
            let currentFile = files.find(f => f.id === draft.fileId);
            if (!currentFile && draft.fileName) {
                currentFile = files.find(f => f.name === draft.fileName);
            }

            if (!currentFile) {
                // 文件可能被删除了，但草稿还在，仍然可以恢复
                return true;
            }

            // 如果草稿比当前文件内容更新，则可以恢复
            return draft.timestamp > (currentFile.lastModified || 0);
        } catch (e) {
            return false;
        }
    }

    /**
     * 获取草稿信息
     */
    function getDraftInfo() {
        try {
            const draftJson = localStorage.getItem(DRAFT_KEY);
            if (!draftJson) return null;

            const draft = JSON.parse(draftJson);
            return {
                fileId: draft.fileId,
                fileName: draft.fileName,
                timestamp: draft.timestamp,
                date: new Date(draft.timestamp).toLocaleString()
            };
        } catch (e) {
            return null;
        }
    }

    /**
     * 获取云端文件修改时间
     * @param {string} fileId - 文件ID
     * @returns {Promise<number|null>} - 云端修改时间戳，如果获取失败返回null
     */
    async function getCloudFileModifiedTime(fileId) {
        try {
            const files = global.files || [];
            const currentFile = files.find(f => f.id === fileId);
            if (!currentFile) return null;

            // 如果用户未登录，无法获取云端版本
            if (!global.currentUser) return null;

            const apiBase = global.getApiBaseUrl ? global.getApiBaseUrl() : '';
            const response = await fetch(`${apiBase}/api/files/content?username=${encodeURIComponent(global.currentUser.username)}&filename=${encodeURIComponent(currentFile.name)}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${global.currentUser.token || global.currentUser.username}`
                }
            });

            if (!response.ok) return null;

            const result = global.parseJsonResponse ? await global.parseJsonResponse(response) : await response.json();
            if (result.code === 200 && result.data && result.data.last_modified) {
                return new Date(result.data.last_modified).getTime();
            }
            return null;
        } catch (e) {
            console.error('[Draft] Failed to get cloud file modified time:', e);
            return null;
        }
    }

    /**
     * 检查草稿恢复状态
     * @returns {Promise<{hasDraft: boolean, draftInfo: object|null, cloudModified: number|null, shouldAutoRecover: boolean, hasConflict: boolean}>}
     */
    async function checkDraftRecoveryStatus() {
        try {
            const draftJson = localStorage.getItem(DRAFT_KEY);
            if (!draftJson) {
                return { hasDraft: false, draftInfo: null, cloudModified: null, shouldAutoRecover: false, hasConflict: false };
            }

            const draft = JSON.parse(draftJson);
            if (!draft || !draft.fileId || !draft.content) {
                return { hasDraft: false, draftInfo: null, cloudModified: null, shouldAutoRecover: false, hasConflict: false };
            }

            const draftInfo = {
                fileId: draft.fileId,
                fileName: draft.fileName,
                timestamp: draft.timestamp,
                date: new Date(draft.timestamp).toLocaleString(),
                content: draft.content
            };

            // 获取云端文件修改时间
            const cloudModified = await getCloudFileModifiedTime(draft.fileId);

            // 如果没有云端版本（文件可能被删除或未同步过）
            if (cloudModified === null) {
                // 检查本地文件是否存在（先通过ID匹配，再通过文件名匹配）
                const files = global.files || [];
                let currentFile = files.find(f => f.id === draft.fileId);
                if (!currentFile && draft.fileName) {
                    currentFile = files.find(f => f.name === draft.fileName);
                }
                if (!currentFile) {
                    // 文件被删除了，但草稿还在，可以恢复
                    return { hasDraft: true, draftInfo, cloudModified: null, shouldAutoRecover: true, hasConflict: false };
                }
                // 本地文件存在，比较草稿和本地文件
                const shouldAutoRecover = draft.timestamp > (currentFile.lastModified || 0);
                return { hasDraft: true, draftInfo, cloudModified: null, shouldAutoRecover, hasConflict: false };
            }

            // 比较草稿时间和云端时间
            const draftTime = draft.timestamp;
            const CONFLICT_THRESHOLD = 5000; // 5秒内视为可能冲突

            // 如果云端版本更新（草稿比云端旧）
            if (cloudModified > draftTime) {
                return { hasDraft: true, draftInfo, cloudModified, shouldAutoRecover: false, hasConflict: true };
            }

            // 如果草稿版本更新（草稿比云端新）
            if (draftTime > cloudModified) {
                // 检查内容是否真正不同（先通过ID匹配，再通过文件名匹配）
                const files = global.files || [];
                let currentFile = files.find(f => f.id === draft.fileId);
                if (!currentFile && draft.fileName) {
                    currentFile = files.find(f => f.name === draft.fileName);
                }
                if (currentFile && currentFile.content === draft.content) {
                    // 内容相同，无需恢复
                    return { hasDraft: true, draftInfo, cloudModified, shouldAutoRecover: false, hasConflict: false };
                }
                // 草稿更新且内容不同，自动恢复
                return { hasDraft: true, draftInfo, cloudModified, shouldAutoRecover: true, hasConflict: false };
            }

            // 时间完全相同，检查内容是否不同（先通过ID匹配，再通过文件名匹配）
            const files = global.files || [];
            let currentFile = files.find(f => f.id === draft.fileId);
            if (!currentFile && draft.fileName) {
                currentFile = files.find(f => f.name === draft.fileName);
            }
            if (currentFile && currentFile.content !== draft.content) {
                // 时间相同但内容不同，可能是并发修改，显示冲突
                return { hasDraft: true, draftInfo, cloudModified, shouldAutoRecover: false, hasConflict: true };
            }

            // 时间和内容都相同，无需恢复
            return { hasDraft: true, draftInfo, cloudModified, shouldAutoRecover: false, hasConflict: false };
        } catch (e) {
            console.error('[Draft] Failed to check draft recovery status:', e);
            return { hasDraft: false, draftInfo: null, cloudModified: null, shouldAutoRecover: false, hasConflict: false };
        }
    }

    /**
     * 恢复草稿到编辑器
     */
    function recoverDraft() {
        try {
            const draftJson = localStorage.getItem(DRAFT_KEY);
            if (!draftJson) return null;

            const draft = JSON.parse(draftJson);
            if (!draft || !draft.fileId || !draft.content) return null;

            const files = global.files || [];
            let fileIndex = files.findIndex(f => f.id === draft.fileId);
            
            // 如果通过ID找不到，尝试通过文件名匹配
            if (fileIndex === -1 && draft.fileName) {
                fileIndex = files.findIndex(f => f.name === draft.fileName);
            }

            if (fileIndex === -1) {
                // 文件不存在，需要重新创建
                return {
                    action: 'recreate',
                    draft: draft
                };
            }

            // 恢复内容到文件
            files[fileIndex].content = draft.content;
            files[fileIndex].lastModified = draft.timestamp;
            localStorage.setItem('vditor_files', JSON.stringify(files));

            // 如果当前打开的就是这个文件（或通过文件名匹配），更新编辑器内容
            const isCurrentFile = global.currentFileId === draft.fileId || 
                                  (draft.fileName && files[fileIndex].name === draft.fileName);
            if (isCurrentFile && global.vditor) {
                global.vditor.setValue(draft.content);
            }

            // 清除草稿
            clearDraft();

            return {
                action: 'restored',
                fileName: draft.fileName
            };
        } catch (e) {
            console.error('[Draft] Failed to recover draft:', e);
            return null;
        }
    }

    /**
     * 清除草稿
     */
    function clearDraft() {
        try {
            localStorage.removeItem(DRAFT_KEY);
            localStorage.removeItem(DRAFT_META_KEY);
        } catch (e) {
            console.error('[Draft] Failed to clear draft:', e);
        }
    }

    /**
     * 监听编辑器变化
     */
    function setupEditorListener() {
        // 使用 MutationObserver 监听编辑器内容变化
        const observer = new MutationObserver(function(mutations) {
            markDirty();
        });

        // 延迟设置，等待 Vditor 初始化完成
        setTimeout(function() {
            const editorElement = document.getElementById('vditor');
            if (editorElement) {
                observer.observe(editorElement, {
                    childList: true,
                    subtree: true,
                    characterData: true
                });
            }
        }, 2000);
    }

    /**
     * 初始化草稿恢复模块
     */
    function init() {
        startBackupTimer();
        setupEditorListener();

        // 监听编辑器输入事件
        document.addEventListener('keydown', function() {
            markDirty();
        });

        console.log('[Draft] Draft recovery module initialized');
    }

    // 导出公共 API
    global.draftRecovery = {
        init: init,
        markDirty: markDirty,
        backupNow: backupNow,
        hasRecoverableDraft: hasRecoverableDraft,
        getDraftInfo: getDraftInfo,
        checkDraftRecoveryStatus: checkDraftRecoveryStatus,
        recoverDraft: recoverDraft,
        clearDraft: clearDraft,
        startBackupTimer: startBackupTimer,
        stopBackupTimer: stopBackupTimer
    };

})(window);
