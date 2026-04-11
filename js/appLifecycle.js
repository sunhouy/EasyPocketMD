/**
 * 应用生命周期管理模块
 * 处理 Web 与桌面壳环境（Tauri）应用生命周期事件
 * 确保应用在关闭、后台运行等情况下数据不丢失
 */
(function(global) {
    'use strict';

    // 保存原始的文件列表引用，用于紧急保存
    let isInitialized = false;
    let leaveSaveInFlight = false;
    let lastLeaveSaveAt = 0;
    const LEAVE_SAVE_COOLDOWN_MS = 1200;

    /**
     * 检测运行环境
     */
    function detectEnvironment() {
        return {
            isTauri: typeof global.desktopRuntime !== 'undefined' && global.desktopRuntime && global.desktopRuntime.type === 'tauri',
            isDesktop: typeof global.electron !== 'undefined' || typeof global.__TAURI__ !== 'undefined' || /electron/i.test(navigator.userAgent),
            isWeb: !((typeof global.electron !== 'undefined' || typeof global.__TAURI__ !== 'undefined' || /electron/i.test(navigator.userAgent)))
        };
    }

    /**
     * 紧急保存所有数据
     * 在应用即将关闭时调用
     */
    function emergencySave() {
        try {
            // 1. 立即备份当前草稿
            if (global.draftRecovery) {
                global.draftRecovery.backupNow();
            }

            // 2. 保存当前文件到 localStorage
            const currentFileId = global.currentFileId;
            if (currentFileId) {
                const content = typeof global.getCurrentEditorContent === 'function'
                    ? global.getCurrentEditorContent(currentFileId, '')
                    : (global.vditor && typeof global.vditor.getValue === 'function' ? global.vditor.getValue() : '');
                const files = global.files || [];
                const fileIndex = files.findIndex(f => f.id === currentFileId);

                if (fileIndex !== -1) {
                    files[fileIndex].content = content;
                    files[fileIndex].lastModified = Date.now();
                    localStorage.setItem('vditor_files', JSON.stringify(files));
                    if (global.currentUser && typeof global.markPendingServerSync === 'function') {
                        global.markPendingServerSync(currentFileId, true);
                    }
                }
            }

            // 3. 同步到服务器（如果已登录）
            if (global.currentUser && global.syncCurrentFileWithBeacon) {
                global.syncCurrentFileWithBeacon();
            }

            // console.log('[Lifecycle] Emergency save completed');
            return true;
        } catch (e) {
            console.error('[Lifecycle] Emergency save failed:', e);
            return false;
        }
    }

    /**
     * 切后台/退出时统一调度一次保存，避免 pause 与 appStateChange 重复触发。
     */
    function scheduleLeaveSave(reason) {
        const now = Date.now();
        if (leaveSaveInFlight) return;
        if (now - lastLeaveSaveAt < LEAVE_SAVE_COOLDOWN_MS) return;

        leaveSaveInFlight = true;
        lastLeaveSaveAt = now;

        try {
            emergencySave();
        } catch (e) {
            console.warn('[Lifecycle] leave save failed (' + reason + '):', e);
        } finally {
            // 给连续事件（pause + appStateChange）一个短窗口，窗口后允许下一次保存。
            setTimeout(function() {
                leaveSaveInFlight = false;
            }, LEAVE_SAVE_COOLDOWN_MS);
        }
    }

    /**
     * 强制保存到 localStorage
     * 确保所有未保存的更改都写入 localStorage，并更新 unsavedChanges 状态
     * 返回是否保存成功
     */
    function forceSaveToLocalStorage() {
        try {
            // 1. 立即备份当前草稿
            if (global.draftRecovery) {
                global.draftRecovery.backupNow();
            }

            // 2. 保存所有未保存的文件到 localStorage
            const files = global.files || [];
            const currentFileId = global.currentFileId;
            let hasChanges = false;

            files.forEach(function(file) {
                if (file.type !== 'file') return;

                const isDirty = !!(global.unsavedChanges && global.unsavedChanges[file.id]);
                if (!isDirty) return;

                let content = file.content;
                if (file.id === currentFileId && typeof global.getCurrentEditorContent === 'function') {
                    content = global.getCurrentEditorContent(file.id, file.content);
                }

                file.content = content;
                file.lastModified = Date.now();
                global.unsavedChanges[file.id] = false;
                if (global.currentUser && typeof global.markPendingServerSync === 'function') {
                    global.markPendingServerSync(file.id, true);
                }
                hasChanges = true;
            });

            if (hasChanges) {
                localStorage.setItem('vditor_files', JSON.stringify(files));
            }

            // 3. 清除草稿（因为已经正式保存）
            if (global.draftRecovery) {
                global.draftRecovery.clearDraft();
            }

            // console.log('[Lifecycle] Force save completed');
            return true;
        } catch (e) {
            console.error('[Lifecycle] Force save failed:', e);
            return false;
        }
    }

    /**
     * 使用同步 XHR 进行最后的保存尝试
     * 在 beforeunload 等同步事件中使用
     */
    function syncSaveToServer() {
        if (!global.currentUser) return;

        const currentFileId = global.currentFileId;
        const vditor = global.vditor;
        if (!currentFileId || !vditor) return;

        const files = global.files || [];
        const file = files.find(f => f.id === currentFileId);
        if (!file) return;

        const content = vditor.getValue();
        const body = {
            username: global.currentUser.username,
            token: global.currentUser.token,
            filename: file.name,
            content: content
        };

        try {
            const api = global.getApiBaseUrl ? global.getApiBaseUrl() : 'api';
            const xhr = new XMLHttpRequest();
            xhr.open('POST', api + '/files/save', false); // 同步请求
            xhr.setRequestHeader('Content-Type', 'application/json');
            xhr.send(JSON.stringify(body));
        } catch (e) {
            console.warn('[Lifecycle] Sync save failed:', e);
        }
    }

    /**
     * 初始化 Web 环境生命周期处理
     */
    function initWebLifecycle() {
        // beforeunload: 强制保存，如果保存失败则阻止退出
        window.addEventListener('beforeunload', function(e) {
            const unsaved = global.unsavedChanges || {};
            const hasUnsaved = (global.files || []).some(f => unsaved[f.id]);

            if (hasUnsaved) {
                // 先尝试强制保存到 localStorage
                const saveSuccess = forceSaveToLocalStorage();
                
                // 尝试同步保存到服务器
                if (global.currentUser) {
                    syncSaveToServer();
                }
                
                // 检查是否保存成功（再次检查 unsavedChanges）
                const stillUnsaved = (global.files || []).some(f => global.unsavedChanges[f.id]);
                if (stillUnsaved) {
                    // 保存失败，阻止用户退出
                    e.preventDefault();
                    e.returnValue = global.i18n ? global.i18n.t('savingPleaseWait') : '正在保存，请稍候...';
                    return e.returnValue;
                }
                // 保存成功，允许退出
            }
        });

        // pagehide: 页面即将被隐藏/卸载
        window.addEventListener('pagehide', function(e) {
            forceSaveToLocalStorage();
        });

        // visibilitychange: 页面可见性变化
        document.addEventListener('visibilitychange', function() {
            if (document.visibilityState === 'hidden') {
                // 切后台时立即执行完整保存
                forceSaveToLocalStorage();
                // 如果已登录，尝试同步到服务器
                if (global.currentUser && global.syncCurrentFileWithBeacon) {
                    global.syncCurrentFileWithBeacon();
                }
            } else if (document.visibilityState === 'visible') {
                const hasUnsaved = (global.files || []).some(function(file) {
                    return file && global.unsavedChanges && global.unsavedChanges[file.id];
                });
                if (!hasUnsaved) {
                    checkAndOfferDraftRecovery();
                }
            }
        });

        // 在线/离线状态变化
        window.addEventListener('online', function() {
            // 恢复在线，尝试同步待同步文件
            if (global.syncAllFiles) {
                global.syncAllFiles();
            }
        });

        // console.log('[Lifecycle] Web lifecycle handlers initialized');
    }

    /**
     * 初始化桌面壳生命周期处理（通过桥接事件兼容）
     */
    function initDesktopLifecycle() {
        if (!global.electron) return;

        // 监听桌面壳的关闭事件
        if (global.electron.ipcRenderer) {
            // 应用即将关闭
            global.electron.ipcRenderer.on('app-before-close', function() {
                emergencySave();
            });

            // 窗口即将关闭
            global.electron.ipcRenderer.on('window-before-close', function() {
                emergencySave();
            });
        }
    }

    /**
     * 检查并提供草稿恢复
     * 自动比较云端和本地草稿的修改时间，决定是自动恢复还是显示冲突提示
     */
    function checkAndOfferDraftRecovery() {
        if (!global.draftRecovery) return;

        // 延迟检查，确保应用已完全加载
        setTimeout(async function() {
            // 使用新的检查方法，比较云端和本地草稿时间
            if (global.draftRecovery.checkDraftRecoveryStatus) {
                try {
                    const status = await global.draftRecovery.checkDraftRecoveryStatus();
                    
                    if (!status.hasDraft) {
                        return; // 没有可恢复的草稿
                    }

                    if (status.shouldAutoRecover) {
                        // 草稿版本更新，直接自动恢复
                        // console.log('[Lifecycle] Draft is newer than cloud version, auto-recovering...');
                        performDraftRecovery();
                    } else if (status.hasConflict) {
                        // 云端版本更新，显示冲突提示
                        // console.log('[Lifecycle] Cloud version is newer, showing conflict dialog...');
                        showDraftConflictDialog(status.draftInfo, status.cloudModified);
                    } else {
                        // 时间相近或云端更新，清除草稿，使用云端版本
                        // console.log('[Lifecycle] Cloud version is up-to-date, clearing draft...');
                        global.draftRecovery.clearDraft();
                    }
                } catch (e) {
                    console.error('[Lifecycle] Error checking draft recovery status:', e);
                    // 出错时回退到原来的逻辑
                    if (global.draftRecovery.hasRecoverableDraft()) {
                        const draftInfo = global.draftRecovery.getDraftInfo();
                        if (draftInfo) {
                            showDraftRecoveryDialog(draftInfo);
                        }
                    }
                }
            } else {
                // 旧版本回退
                if (global.draftRecovery.hasRecoverableDraft()) {
                    const draftInfo = global.draftRecovery.getDraftInfo();
                    if (draftInfo) {
                        showDraftRecoveryDialog(draftInfo);
                    }
                }
            }
        }, 1000);
    }

    /**
     * 格式化翻译字符串，替换变量
     */
    function formatMessage(message, vars) {
        if (!message) return message;
        let result = message;
        for (const key in vars) {
            result = result.replace(new RegExp('{' + key + '}', 'g'), vars[key]);
        }
        return result;
    }

    /**
     * 显示草稿恢复对话框（旧版，保留作为回退）
     */
    function showDraftRecoveryDialog(draftInfo) {
        const env = detectEnvironment();
        const vars = {
            fileName: draftInfo.fileName,
            date: draftInfo.date
        };

        let message;
        if (global.i18n && global.i18n.t('draftRecoveryMessage')) {
            message = formatMessage(global.i18n.t('draftRecoveryMessage'), vars);
        } else {
            message = `检测到未保存的草稿「${draftInfo.fileName}」(修改时间: ${draftInfo.date})，是否恢复？`;
        }

        const title = global.i18n ? global.i18n.t('draftRecoveryTitle') : '恢复草稿';

        if (confirm(message)) {
            performDraftRecovery();
        } else {
            global.draftRecovery.clearDraft();
        }
    }

    /**
     * 显示草稿冲突对话框
     * 当云端版本比草稿更新时显示，让用户选择使用哪个版本
     */
    function showDraftConflictDialog(draftInfo, cloudModified) {
        const env = detectEnvironment();
        const isEn = global.i18n && global.i18n.getCurrentLanguage && global.i18n.getCurrentLanguage() === 'en';
        
        const draftTime = new Date(draftInfo.timestamp).toLocaleString();
        const serverTime = cloudModified ? new Date(cloudModified).toLocaleString() : (isEn ? 'Unknown' : '未知');
        
        const title = isEn ? 'Draft Conflict Detected' : '草稿冲突检测';
        const message = isEn 
            ? `The file "${draftInfo.fileName}" has been modified on both sides:\n\n` +
              `Local draft time: ${draftTime}\n` +
              `Server version time: ${serverTime}\n\n` +
              `The server version is newer. Click OK to use the server version, or Cancel to recover your local draft.`
            : `文件「${draftInfo.fileName}」在两端都有修改：\n\n` +
              `本地草稿时间: ${draftTime}\n` +
              `云端版本时间: ${serverTime}\n\n` +
              `云端版本较新。点击"确定"使用云端版本，点击"取消"恢复本地草稿。`;

        if (confirm(message)) {
            global.draftRecovery.clearDraft();
            const msg = isEn ? 'Using server version' : '已使用云端版本';
            if (global.showMessage) {
                global.showMessage(msg, 'info');
            }
        } else {
            performDraftRecovery();
        }
    }

    /**
     * 执行草稿恢复
     */
    function performDraftRecovery() {
        const result = global.draftRecovery.recoverDraft();
        if (result) {
            if (result.action === 'recreate') {
                // 需要重新创建文件
                if (global.createFileWithContent) {
                    global.createFileWithContent(result.draft.fileName, result.draft.content);
                }
            }

            const fileName = result.fileName || result.draft.fileName;
            let successMsg;
            if (global.i18n && global.i18n.t('draftRecovered')) {
                successMsg = formatMessage(global.i18n.t('draftRecovered'), { fileName: fileName });
            } else {
                successMsg = `草稿「${fileName}」已恢复`;
            }

            if (global.showMessage) {
                global.showMessage(successMsg, 'success');
            } else {
                alert(successMsg);
            }

            // 刷新文件列表
            if (global.loadFiles) {
                global.loadFiles();
            }
        }
    }

    /**
     * 初始化生命周期管理
     */
    function init() {
        if (isInitialized) return;

        const env = detectEnvironment();
        // console.log('[Lifecycle] Environment detected:', env);

        // 初始化草稿恢复模块
        if (global.draftRecovery) {
            global.draftRecovery.init();
        }

        // 根据环境初始化相应的生命周期处理
        initWebLifecycle(); // Web 环境总是初始化

        if (env.isDesktop) {
            initDesktopLifecycle();
        }

        // 启动时检查是否需要恢复草稿
        checkAndOfferDraftRecovery();

        isInitialized = true;
        // console.log('[Lifecycle] Lifecycle management initialized');
    }

    // 导出公共 API
    global.appLifecycle = {
        init: init,
        emergencySave: emergencySave,
        detectEnvironment: detectEnvironment,
        checkAndOfferDraftRecovery: checkAndOfferDraftRecovery
    };

})(window);
