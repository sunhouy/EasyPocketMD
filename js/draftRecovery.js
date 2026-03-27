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

            // 检查草稿是否比当前文件更新
            const files = global.files || [];
            const currentFile = files.find(f => f.id === draft.fileId);

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
     * 恢复草稿到编辑器
     */
    function recoverDraft() {
        try {
            const draftJson = localStorage.getItem(DRAFT_KEY);
            if (!draftJson) return null;

            const draft = JSON.parse(draftJson);
            if (!draft || !draft.fileId || !draft.content) return null;

            const files = global.files || [];
            const fileIndex = files.findIndex(f => f.id === draft.fileId);

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

            // 如果当前打开的就是这个文件，更新编辑器内容
            if (global.currentFileId === draft.fileId && global.vditor) {
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
        recoverDraft: recoverDraft,
        clearDraft: clearDraft,
        startBackupTimer: startBackupTimer,
        stopBackupTimer: stopBackupTimer
    };

})(window);
