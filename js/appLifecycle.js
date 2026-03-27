/**
 * 应用生命周期管理模块
 * 处理 Web、Capacitor 和 Electron 环境的应用生命周期事件
 * 确保应用在关闭、后台运行等情况下数据不丢失
 */
(function(global) {
    'use strict';

    // 保存原始的文件列表引用，用于紧急保存
    let isInitialized = false;
    let capacitorApp = null;

    /**
     * 检测运行环境
     */
    function detectEnvironment() {
        return {
            isCapacitor: typeof global.Capacitor !== 'undefined' && global.Capacitor.isNativePlatform(),
            isElectron: typeof global.electron !== 'undefined' || /electron/i.test(navigator.userAgent),
            isWeb: !((typeof global.Capacitor !== 'undefined' && global.Capacitor.isNativePlatform()) ||
                     (typeof global.electron !== 'undefined' || /electron/i.test(navigator.userAgent)))
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
            const vditor = global.vditor;
            if (currentFileId && vditor) {
                const content = vditor.getValue();
                const files = global.files || [];
                const fileIndex = files.findIndex(f => f.id === currentFileId);

                if (fileIndex !== -1) {
                    files[fileIndex].content = content;
                    files[fileIndex].lastModified = Date.now();
                    localStorage.setItem('vditor_files', JSON.stringify(files));
                }
            }

            // 3. 同步到服务器（如果已登录）
            if (global.currentUser && global.syncCurrentFileWithBeacon) {
                global.syncCurrentFileWithBeacon();
            }

            console.log('[Lifecycle] Emergency save completed');
            return true;
        } catch (e) {
            console.error('[Lifecycle] Emergency save failed:', e);
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
            token: global.currentUser.token || global.currentUser.username,
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
        // beforeunload: 提示用户有未保存的更改
        window.addEventListener('beforeunload', function(e) {
            const unsaved = global.unsavedChanges || {};
            const hasUnsaved = (global.files || []).some(f => unsaved[f.id]);

            if (hasUnsaved) {
                // 尝试同步保存
                emergencySave();
                syncSaveToServer();

                // 显示确认对话框
                e.preventDefault();
                e.returnValue = global.i18n ? global.i18n.t('confirmLeave') : '您有未保存的文件，确定要离开吗？';
                return e.returnValue;
            }
        });

        // pagehide: 页面即将被隐藏/卸载
        window.addEventListener('pagehide', function(e) {
            emergencySave();
        });

        // visibilitychange: 页面可见性变化
        document.addEventListener('visibilitychange', function() {
            if (document.visibilityState === 'hidden') {
                emergencySave();
            } else if (document.visibilityState === 'visible') {
                // 页面重新可见，检查是否需要恢复草稿
                checkAndOfferDraftRecovery();
            }
        });

        // 在线/离线状态变化
        window.addEventListener('online', function() {
            // 恢复在线，尝试同步待同步文件
            if (global.syncAllFiles) {
                global.syncAllFiles();
            }
        });

        console.log('[Lifecycle] Web lifecycle handlers initialized');
    }

    /**
     * 初始化 Capacitor 生命周期处理
     */
    function initCapacitorLifecycle() {
        if (!global.Capacitor) return;

        // 动态导入 Capacitor App 插件
        try {
            const { App } = require('@capacitor/app');
            capacitorApp = App;

            // 应用状态变化（前台/后台）
            App.addListener('appStateChange', function(state) {
                if (!state.isActive) {
                    // 应用进入后台
                    console.log('[Lifecycle] App going to background');
                    emergencySave();
                } else {
                    // 应用回到前台
                    console.log('[Lifecycle] App coming to foreground');
                    checkAndOfferDraftRecovery();
                }
            });

            // 应用即将被终止
            App.addListener('pause', function() {
                console.log('[Lifecycle] App pausing');
                emergencySave();
            });

            // Android 返回按钮处理
            App.addListener('backButton', function() {
                // 检查是否有未保存的更改
                const unsaved = global.unsavedChanges || {};
                const hasUnsaved = (global.files || []).some(f => unsaved[f.id]);

                if (hasUnsaved) {
                    // 显示确认对话框
                    if (confirm(global.i18n ? global.i18n.t('confirmLeave') : '您有未保存的文件，确定要离开吗？')) {
                        emergencySave();
                        App.exitApp();
                    }
                } else {
                    App.exitApp();
                }
            });

            console.log('[Lifecycle] Capacitor lifecycle handlers initialized');
        } catch (e) {
            console.warn('[Lifecycle] Failed to initialize Capacitor lifecycle:', e);
        }
    }

    /**
     * 初始化 Electron 生命周期处理
     */
    function initElectronLifecycle() {
        if (!global.electron) return;

        // 监听 Electron 的关闭事件
        if (global.electron.ipcRenderer) {
            // 主进程请求关闭窗口
            global.electron.ipcRenderer.on('app-before-close', function() {
                console.log('[Lifecycle] Electron app before close');
                emergencySave();
            });

            // 窗口即将关闭
            global.electron.ipcRenderer.on('window-before-close', function() {
                console.log('[Lifecycle] Electron window before close');
                emergencySave();
            });
        }

        console.log('[Lifecycle] Electron lifecycle handlers initialized');
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
                        console.log('[Lifecycle] Draft is newer than cloud version, auto-recovering...');
                        performDraftRecovery();
                    } else if (status.hasConflict) {
                        // 云端版本更新，显示冲突提示
                        console.log('[Lifecycle] Cloud version is newer, showing conflict dialog...');
                        showDraftConflictDialog(status.draftInfo, status.cloudModified);
                    } else {
                        // 时间相近或云端更新，清除草稿，使用云端版本
                        console.log('[Lifecycle] Cloud version is up-to-date, clearing draft...');
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

        if (env.isCapacitor && capacitorApp) {
            // Capacitor 环境使用原生对话框
            try {
                const { Dialog } = require('@capacitor/dialog');
                Dialog.confirm({
                    title: title,
                    message: message
                }).then(function(result) {
                    if (result.value) {
                        performDraftRecovery();
                    } else {
                        global.draftRecovery.clearDraft();
                    }
                });
            } catch (e) {
                // 回退到普通 confirm
                if (confirm(message)) {
                    performDraftRecovery();
                } else {
                    global.draftRecovery.clearDraft();
                }
            }
        } else {
            // Web/Electron 环境
            if (confirm(message)) {
                performDraftRecovery();
            } else {
                global.draftRecovery.clearDraft();
            }
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

        if (env.isCapacitor && capacitorApp) {
            // Capacitor 环境使用原生对话框
            try {
                const { Dialog } = require('@capacitor/dialog');
                Dialog.confirm({
                    title: title,
                    message: message
                }).then(function(result) {
                    if (result.value) {
                        // 使用云端版本，清除草稿
                        global.draftRecovery.clearDraft();
                        const msg = isEn ? 'Using server version' : '已使用云端版本';
                        if (global.showMessage) {
                            global.showMessage(msg, 'info');
                        }
                    } else {
                        // 恢复本地草稿
                        performDraftRecovery();
                    }
                });
            } catch (e) {
                // 回退到普通 confirm
                if (confirm(message)) {
                    global.draftRecovery.clearDraft();
                } else {
                    performDraftRecovery();
                }
            }
        } else {
            // Web/Electron 环境
            if (confirm(message)) {
                // 使用云端版本，清除草稿
                global.draftRecovery.clearDraft();
                const msg = isEn ? 'Using server version' : '已使用云端版本';
                if (global.showMessage) {
                    global.showMessage(msg, 'info');
                }
            } else {
                // 恢复本地草稿
                performDraftRecovery();
            }
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
        console.log('[Lifecycle] Environment detected:', env);

        // 初始化草稿恢复模块
        if (global.draftRecovery) {
            global.draftRecovery.init();
        }

        // 根据环境初始化相应的生命周期处理
        initWebLifecycle(); // Web 环境总是初始化

        if (env.isCapacitor) {
            initCapacitorLifecycle();
        }

        if (env.isElectron) {
            initElectronLifecycle();
        }

        // 启动时检查是否需要恢复草稿
        checkAndOfferDraftRecovery();

        isInitialized = true;
        console.log('[Lifecycle] Lifecycle management initialized');
    }

    // 导出公共 API
    global.appLifecycle = {
        init: init,
        emergencySave: emergencySave,
        detectEnvironment: detectEnvironment,
        checkAndOfferDraftRecovery: checkAndOfferDraftRecovery
    };

})(window);
