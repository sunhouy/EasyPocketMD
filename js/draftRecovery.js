/**
 * 草稿恢复模块
 * 仅用于“异常退出/重启后恢复”，不会在当前会话中反向覆盖正在编辑的内容。
 */
(function(global) {
    'use strict';

    const DRAFT_KEY = 'vditor_draft_backup';
    const DRAFT_META_KEY = 'vditor_draft_meta';
    const BACKUP_INTERVAL = 1000;

    let backupTimer = null;
    let isDirty = false;

    function readDraft() {
        try {
            const raw = localStorage.getItem(DRAFT_KEY);
            if (!raw) return null;
            const draft = JSON.parse(raw);
            if (!draft || !draft.fileId || typeof draft.content !== 'string') {
                return null;
            }
            return draft;
        } catch (error) {
            return null;
        }
    }

    function isCurrentSessionDraft(draft) {
        if (!draft || !draft.sessionId || !global.appSessionId) return false;
        return String(draft.sessionId) === String(global.appSessionId);
    }

    function getCurrentFileRecord() {
        const currentFileId = global.currentFileId;
        if (!currentFileId) return null;
        return (global.files || []).find(function(file) {
            return file && String(file.id) === String(currentFileId);
        }) || null;
    }

    function getCurrentEditorSnapshot() {
        const currentFile = getCurrentFileRecord();
        if (!currentFile) return null;

        const content = typeof global.getCurrentEditorContent === 'function'
            ? global.getCurrentEditorContent(currentFile.id, currentFile.content)
            : (global.vditor && typeof global.vditor.getValue === 'function'
                ? global.vditor.getValue()
                : String(currentFile.content || ''));

        return {
            fileId: currentFile.id,
            fileName: currentFile.name,
            content: String(content || ''),
            timestamp: Date.now(),
            lastModified: Date.now(),
            sessionId: global.appSessionId || ''
        };
    }

    function captureDraft() {
        const snapshot = getCurrentEditorSnapshot();
        if (!snapshot) return null;

        const unsavedMap = global.unsavedChanges || {};
        if (!unsavedMap[snapshot.fileId] && snapshot.content === String((getCurrentFileRecord() || {}).content || '')) {
            return null;
        }

        return snapshot;
    }

    function saveDraft() {
        const draft = captureDraft();
        if (!draft) {
            isDirty = false;
            return;
        }

        try {
            localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
            localStorage.setItem(DRAFT_META_KEY, JSON.stringify({
                lastBackupTime: Date.now(),
                fileId: draft.fileId,
                fileName: draft.fileName,
                sessionId: draft.sessionId
            }));
            isDirty = false;
        } catch (error) {
            console.error('[Draft] Failed to save draft:', error);
        }
    }

    function markDirty() {
        isDirty = true;
    }

    function startBackupTimer() {
        if (backupTimer) return;
        backupTimer = setInterval(function() {
            if (isDirty) {
                saveDraft();
            }
        }, BACKUP_INTERVAL);
    }

    function stopBackupTimer() {
        if (!backupTimer) return;
        clearInterval(backupTimer);
        backupTimer = null;
    }

    function backupNow() {
        saveDraft();
    }

    function hasRecoverableDraft() {
        const draft = readDraft();
        if (!draft || isCurrentSessionDraft(draft)) return false;

        const files = global.files || [];
        const currentFile = files.find(function(file) {
            return file && String(file.id) === String(draft.fileId);
        }) || (draft.fileName ? files.find(function(file) { return file && file.name === draft.fileName; }) : null);

        if (!currentFile) return true;
        return String(currentFile.content || '') !== String(draft.content || '');
    }

    function getDraftInfo() {
        const draft = readDraft();
        if (!draft || isCurrentSessionDraft(draft)) return null;
        return {
            fileId: draft.fileId,
            fileName: draft.fileName,
            timestamp: draft.timestamp,
            date: new Date(draft.timestamp).toLocaleString(),
            content: draft.content
        };
    }

    async function getCloudFileModifiedTime(fileId, fileName) {
        try {
            if (!global.currentUser) return null;

            const files = global.files || [];
            const currentFile = files.find(function(file) {
                return file && String(file.id) === String(fileId);
            }) || (fileName ? files.find(function(file) { return file && file.name === fileName; }) : null);
            if (!currentFile) return null;

            const apiBase = global.getApiBaseUrl ? global.getApiBaseUrl() : '';
            const response = await fetch(
                `${apiBase}/api/files/content?username=${encodeURIComponent(global.currentUser.username)}&filename=${encodeURIComponent(currentFile.name)}`,
                {
                    method: 'GET',
                    headers: { 'Authorization': `Bearer ${global.currentUser.token || global.currentUser.username}` }
                }
            );

            if (!response.ok) return null;

            const result = global.parseJsonResponse ? await global.parseJsonResponse(response) : await response.json();
            if (result.code === 200 && result.data && result.data.last_modified) {
                return new Date(result.data.last_modified).getTime();
            }
            return null;
        } catch (error) {
            console.error('[Draft] Failed to get cloud file modified time:', error);
            return null;
        }
    }

    async function checkDraftRecoveryStatus() {
        try {
            const draft = readDraft();
            if (!draft || isCurrentSessionDraft(draft)) {
                return { hasDraft: false, draftInfo: null, cloudModified: null, shouldAutoRecover: false, hasConflict: false };
            }

            const currentFileId = global.currentFileId;
            if (currentFileId && String(currentFileId) === String(draft.fileId)) {
                const hasUnsaved = !!((global.unsavedChanges || {})[currentFileId]);
                if (hasUnsaved) {
                    return { hasDraft: false, draftInfo: null, cloudModified: null, shouldAutoRecover: false, hasConflict: false };
                }
            }

            const files = global.files || [];
            const currentFile = files.find(function(file) {
                return file && String(file.id) === String(draft.fileId);
            }) || (draft.fileName ? files.find(function(file) { return file && file.name === draft.fileName; }) : null);

            if (currentFile && String(currentFile.content || '') === String(draft.content || '')) {
                return { hasDraft: true, draftInfo: null, cloudModified: null, shouldAutoRecover: false, hasConflict: false };
            }

            const draftInfo = {
                fileId: draft.fileId,
                fileName: draft.fileName,
                timestamp: draft.timestamp,
                date: new Date(draft.timestamp).toLocaleString(),
                content: draft.content
            };

            const cloudModified = await getCloudFileModifiedTime(draft.fileId, draft.fileName);
            if (cloudModified === null) {
                return {
                    hasDraft: true,
                    draftInfo: draftInfo,
                    cloudModified: null,
                    shouldAutoRecover: !currentFile || String(currentFile.content || '') !== String(draft.content || ''),
                    hasConflict: false
                };
            }

            if (cloudModified > Number(draft.timestamp || 0)) {
                return { hasDraft: true, draftInfo: draftInfo, cloudModified: cloudModified, shouldAutoRecover: false, hasConflict: true };
            }

            return { hasDraft: true, draftInfo: draftInfo, cloudModified: cloudModified, shouldAutoRecover: true, hasConflict: false };
        } catch (error) {
            console.error('[Draft] Failed to check draft recovery status:', error);
            return { hasDraft: false, draftInfo: null, cloudModified: null, shouldAutoRecover: false, hasConflict: false };
        }
    }

    function recoverDraft() {
        try {
            const draft = readDraft();
            if (!draft || isCurrentSessionDraft(draft)) return null;

            const files = global.files || [];
            let fileIndex = files.findIndex(function(file) {
                return file && String(file.id) === String(draft.fileId);
            });

            if (fileIndex === -1 && draft.fileName) {
                fileIndex = files.findIndex(function(file) {
                    return file && file.name === draft.fileName;
                });
            }

            if (fileIndex === -1) {
                return {
                    action: 'recreate',
                    draft: draft
                };
            }

            files[fileIndex].content = draft.content;
            files[fileIndex].lastModified = draft.timestamp || Date.now();
            localStorage.setItem('vditor_files', JSON.stringify(files));

            if (global.unsavedChanges) {
                global.unsavedChanges[files[fileIndex].id] = true;
            }
            if (global.currentUser && typeof global.markPendingServerSync === 'function') {
                global.markPendingServerSync(files[fileIndex].id, true);
            }

            const isCurrentFile = String(global.currentFileId || '') === String(files[fileIndex].id || '');
            if (isCurrentFile && typeof global.setEditorContentForFile === 'function') {
                global.setEditorContentForFile(files[fileIndex].id, draft.content);
            } else if (isCurrentFile && global.vditor && typeof global.vditor.setValue === 'function') {
                global.vditor.setValue(draft.content);
            }

            clearDraft();
            return {
                action: 'restored',
                fileName: files[fileIndex].name || draft.fileName,
                draft: draft
            };
        } catch (error) {
            console.error('[Draft] Failed to recover draft:', error);
            return null;
        }
    }

    function clearDraft() {
        try {
            localStorage.removeItem(DRAFT_KEY);
            localStorage.removeItem(DRAFT_META_KEY);
            isDirty = false;
        } catch (error) {
            console.error('[Draft] Failed to clear draft:', error);
        }
    }

    function setupEditorListener() {
        const observer = new MutationObserver(function() {
            markDirty();
        });

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

    function init() {
        startBackupTimer();
        setupEditorListener();

        document.addEventListener('keydown', function() {
            markDirty();
        });
    }

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
