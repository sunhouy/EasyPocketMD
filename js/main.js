/**
 * Vditor 初始化、界面与功能绑定
 */
import { initSlashCommandRuntime } from './ui/slash-command.js';

document.addEventListener('DOMContentLoaded', function() {
    'use strict';



    // 初始化翻译系统
    if (window.i18n) {
        window.i18n.init();
        applyTranslations();
    }
    var isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    window.isMobileEditorEnvironment = isMobileDevice;
    window.editorInterfaceMode = window.isMobileEditorEnvironment ? 'mobile' : 'desktop';

    function isAndroidClient() {
        return /Android/i.test(navigator.userAgent || '');
    }

    function initAndroidViewportInsets() {
        if (!isAndroidClient()) return;

        var root = document.documentElement;
        var baselineHeight = (window.visualViewport && window.visualViewport.height)
            ? Math.round(window.visualViewport.height)
            : Math.round(window.innerHeight || 0);

        function syncInsets() {
            var viewportHeight = (window.visualViewport && window.visualViewport.height)
                ? Math.round(window.visualViewport.height)
                : Math.round(window.innerHeight || 0);

            if (viewportHeight > baselineHeight) {
                baselineHeight = viewportHeight;
            }

            var rawKeyboardInset = Math.max(0, baselineHeight - viewportHeight);
            var keyboardInset = rawKeyboardInset > 80 ? rawKeyboardInset : 0;
            var keyboardOpen = keyboardInset > 0;

            root.style.setProperty('--app-viewport-height', viewportHeight + 'px');
            root.style.setProperty('--keyboard-inset-bottom', keyboardInset + 'px');
            document.body.classList.toggle('keyboard-open', keyboardOpen);

            if (!keyboardOpen) return;

            var active = document.activeElement;
            if (!active) return;
            if (!active.matches('input, textarea, [contenteditable="true"], .vditor-ir__input, .vditor-wysiwyg')) return;

            setTimeout(function() {
                try {
                    active.scrollIntoView({ block: 'center', inline: 'nearest' });
                } catch (e) {
                    active.scrollIntoView();
                }
            }, 60);
        }

        syncInsets();
        window.addEventListener('resize', syncInsets);
        window.addEventListener('orientationchange', function() {
            baselineHeight = (window.visualViewport && window.visualViewport.height)
                ? Math.round(window.visualViewport.height)
                : Math.round(window.innerHeight || 0);
            syncInsets();
        });

        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', syncInsets);
            window.visualViewport.addEventListener('scroll', syncInsets);
        }

        document.addEventListener('focusin', syncInsets, true);
        document.addEventListener('focusout', function() {
            setTimeout(syncInsets, 90);
        }, true);
    }

    function getVisibleModalOverlays() {
        return Array.from(document.querySelectorAll('.modal-overlay, .mobile-action-sheet-overlay')).filter(function(el) {
            if (!el) return false;
            if (el.classList.contains('show')) return true;
            if (el.style.display && el.style.display !== 'none') return true;
            var computed = window.getComputedStyle(el);
            return computed.display !== 'none' && computed.visibility !== 'hidden';
        });
    }

    function applySafeAreaToOverlay(overlay) {
        if (!overlay) return;
        if (!overlay.classList.contains('modal-overlay') && !overlay.classList.contains('mobile-action-sheet-overlay')) return;

        overlay.style.setProperty('padding-top', 'calc(env(safe-area-inset-top, 0px) + 10px)', 'important');
        overlay.style.setProperty('padding-bottom', 'calc(var(--keyboard-inset-bottom, 0px) + 10px)', 'important');

        if (!overlay.classList.contains('mobile-action-sheet-overlay')) {
            overlay.style.setProperty('padding-left', '10px', 'important');
            overlay.style.setProperty('padding-right', '10px', 'important');
        }

        var modal = overlay.querySelector('.modal');
        if (!modal) return;

        var fullHeight = 'calc(var(--app-viewport-height, 100vh) - env(safe-area-inset-top, 0px) - var(--keyboard-inset-bottom, 0px) - 20px)';
        modal.style.setProperty('max-height', fullHeight, 'important');

        if (modal.classList.contains('conflict-modal') || modal.classList.contains('diff-modal') || modal.classList.contains('history-modal')) {
            modal.style.setProperty('height', 'calc(var(--app-viewport-height, 100vh) - env(safe-area-inset-top, 0px) - var(--keyboard-inset-bottom, 0px))', 'important');
        }
    }

    function initModalSafeAreaObserver() {
        Array.from(document.querySelectorAll('.modal-overlay, .mobile-action-sheet-overlay')).forEach(applySafeAreaToOverlay);

        var observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach(function(node) {
                        if (!node || node.nodeType !== 1) return;

                        if (node.matches && (node.matches('.modal-overlay') || node.matches('.mobile-action-sheet-overlay'))) {
                            applySafeAreaToOverlay(node);
                        }

                        if (node.querySelectorAll) {
                            node.querySelectorAll('.modal-overlay, .mobile-action-sheet-overlay').forEach(applySafeAreaToOverlay);
                        }
                    });
                }

                if (mutation.type === 'attributes' && mutation.target) {
                    if (mutation.target.matches && (mutation.target.matches('.modal-overlay') || mutation.target.matches('.mobile-action-sheet-overlay'))) {
                        applySafeAreaToOverlay(mutation.target);
                    }
                }
            });
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class', 'style']
        });
    }

    function closeOverlayByBackPress(overlay) {
        if (!overlay) return false;

        if (overlay.id === 'settingsModalOverlay' && typeof requestCloseSettingsDialog === 'function') {
            requestCloseSettingsDialog();
            return true;
        }

        if (overlay.id === 'videoCallModalOverlay') {
            var iframe = document.getElementById('videoCallIframe');
            if (iframe) iframe.src = '';
        }

        if (overlay.id === 'mobileActionSheetOverlay' && typeof window.hideMobileActionSheet === 'function') {
            window.hideMobileActionSheet();
            return true;
        }

        var closeBtn = overlay.querySelector('.modal-close-btn, #cancelConflictBtn, #closeDiffModalBtn, #closeHistoryBtn, #closeAboutBtn, #closeServiceStatusBtn, #cancelSettingsBtn');
        if (closeBtn) {
            closeBtn.click();
        } else {
            overlay.classList.remove('show');
            overlay.style.display = 'none';
        }

        var computed = window.getComputedStyle(overlay);
        return computed.display === 'none' || !overlay.classList.contains('show');
    }

    function initAndroidBackModalBehavior() {
        if (!isAndroidClient() || !window.history || typeof window.history.pushState !== 'function') return;

        var guardState = { epmBackGuard: true };
        var currentState = window.history.state || {};
        if (!currentState.epmBackGuard) {
            window.history.pushState(guardState, document.title, window.location.href);
        }

        window.addEventListener('popstate', function() {
            var overlays = getVisibleModalOverlays();
            if (!overlays.length) return;

            var topOverlay = overlays[overlays.length - 1];
            var closed = closeOverlayByBackPress(topOverlay);
            if (closed) {
                window.history.pushState(guardState, document.title, window.location.href);
            }
        });
    }

    function getTargetElement(target) {
        if (!target) return null;
        if (target.nodeType === 3 && target.parentElement) return target.parentElement;
        return (target.nodeType === 1 && typeof target.closest === 'function') ? target : null;
    }

    function shouldAllowNativeTextSelection(target) {
        var el = getTargetElement(target);
        if (!el) return false;
        if (el.closest('#vditor, .vditor, .vditor-content')) return true;
        if (el.closest('input, textarea, [contenteditable="true"]')) return true;
        return false;
    }

    function shouldBlockContextMenu(target) {
        var el = getTargetElement(target);
        if (!el) return false;
        if (shouldAllowNativeTextSelection(el)) return false;
        return !!el.closest('button, .mobile-action-btn, .bottom-btn, .dropdown-item, .mobile-toolbar-container, .mobile-bottom-bar, .file-list-sidebar, .modal-overlay, .sync-status, .jstree-anchor, .file-menu-btn');
    }

    if (isMobileDevice) {
        document.addEventListener('contextmenu', function(e) {
            if (!shouldBlockContextMenu(e.target)) return;
            e.preventDefault();
        }, true);
    }

    var loading = document.getElementById('loading');
    if (loading) loading.style.display = 'block';

    // 全局状态
    window.nightMode = localStorage.getItem('vditor_night_mode') === 'true';
    window.currentUser = JSON.parse(localStorage.getItem('vditor_user') || 'null');
    window.currentFileId = null;
    window.files = JSON.parse(localStorage.getItem('vditor_files') || '[]');
    window.appSessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
    window.autoSaveTimer = null;
    window.syncInterval = null;
    window.lastSyncedContent = {};
    window.unsavedChanges = {};
    window.vditor = null;
    window.vditorReady = false;
    window.vditorInitPromise = null;
    var shellInitialized = false;
    var hasBoundGlobalClickGuard = false;
    var hasBootstrappedWasmRuntime = false;
    var shareModeActive = !!(new URLSearchParams(window.location.search).get('share_id'));
    window.startInFileManagementMode = false;
    window.deferInitialFileOpen = false;
    window.isFileManagementMode = false;

    function toggleFileManagementBodyClass(enabled) {
        document.body.classList.toggle('file-management-mode', !!enabled);
    }

    window.enterFileManagementMode = function(options) {
        var opts = options || {};
        window.isFileManagementMode = true;
        toggleFileManagementBodyClass(true);

        var sidebar = document.getElementById('fileListSidebar');
        if (sidebar) sidebar.classList.add('show');

        if (opts.refresh && typeof window.loadFiles === 'function') {
            window.loadFiles();
        }
    };

    window.enterEditorMode = function() {
        window.isFileManagementMode = false;
        window.deferInitialFileOpen = false;
        toggleFileManagementBodyClass(false);

        var sidebar = document.getElementById('fileListSidebar');
        if (sidebar) sidebar.classList.remove('show');
    };

    function showPrimaryFileInterface() {
        if (window.isFileManagementMode) {
            window.enterFileManagementMode({ refresh: true });
            return;
        }
        var sidebar = document.getElementById('fileListSidebar');
        if (sidebar) sidebar.classList.toggle('show');
    }

    function initializeAppShellOnce() {
        if (shellInitialized) return;
        shellInitialized = true;
        initUserInterface();
        initMobileFeatures();
        initDesktopOpenFileBridge();
        initGlobalKeyboardShortcuts();
    }

    function ensureWasmRuntimeBootstrapped() {
        if (hasBootstrappedWasmRuntime) return;
        hasBootstrappedWasmRuntime = true;
        if (window.wasmTextEngineGateway && typeof window.wasmTextEngineGateway.init === 'function') {
            window.wasmTextEngineGateway.init().then(function(res) {
                var status = typeof window.wasmTextEngineGateway.getStatus === 'function'
                    ? window.wasmTextEngineGateway.getStatus()
                    : null;
                if (res && res.code === 200) {
                    console.info('wasm loaded successfully');
                } else {
                    console.warn('[text-engine] wasm unavailable, fallback to built-in implementation', { init: res, status: status });
                }
            }).catch(function(error) {
                var status = typeof window.wasmTextEngineGateway.getStatus === 'function'
                    ? window.wasmTextEngineGateway.getStatus()
                    : null;
                console.warn('[text-engine] wasm init failed, fallback to built-in implementation', { error: error, status: status });
            });
        }
    }

    window.ensureWasmTextEngineReady = function() {
        if (!window.wasmTextEngineReadyPromise) {
            if (!window.wasmTextEngineGateway || typeof window.wasmTextEngineGateway.ensureReady !== 'function') {
                window.wasmTextEngineReadyPromise = Promise.reject(new Error('wasm text engine gateway unavailable'));
            } else {
                window.wasmTextEngineReadyPromise = window.wasmTextEngineGateway.ensureReady().then(function(res) {
                    if (!res || res.code !== 200) {
                        throw new Error((res && res.message) || 'wasm text engine initialization failed');
                    }
                    return res;
                });
            }
        }
        return window.wasmTextEngineReadyPromise;
    };

    window.ensureVditorInitialized = function() {
        if (window.vditor && window.vditorReady) {
            return Promise.resolve(window.vditor);
        }
        if (window.vditorInitPromise) {
            return window.vditorInitPromise;
        }

        window.vditorInitPromise = new Promise(function(resolve, reject) {
            window.__resolveVditorInit = resolve;
            window.__rejectVditorInit = reject;
            try {
                window.vditor = new Vditor('vditor', editorConfig);
            } catch (error) {
                window.vditorInitPromise = null;
                window.__resolveVditorInit = null;
                window.__rejectVditorInit = null;
                reject(error);
            }
        });

        return window.vditorInitPromise;
    };

    window.onInitialFileListRendered = function() {
        // 文件列表首屏可见后立即启动编辑器初始化（异步，不阻塞当前视图）。
        window.ensureVditorInitialized().catch(function(error) {
            console.error('Failed to initialize Vditor after file list ready:', error);
        });
    };
    var TOOLBAR_EASTER_EGG_KEY = 'vditor_uncertainty_unlocked';
    var toolbarEasterEggTapCount = 0;
    var toolbarEasterEggLastTapAt = 0;
    window.toolbarUncertaintyUnlocked = localStorage.getItem(TOOLBAR_EASTER_EGG_KEY) === 'true';

    function isToolbarButtonVisible(btnConfig) {
        if (!btnConfig) return false;
        return !btnConfig.isEasterEgg || window.toolbarUncertaintyUnlocked;
    }

    function getVisibleToolbarButtons() {
        return window.allToolbarButtons.filter(isToolbarButtonVisible);
    }

    var keyboardShortcutActionDefinitions = [
        { id: 'openFileMenu', textKey: 'keyboardShortcutFileMenu', defaultValue: 'F', allowInEditor: false, toolbarButtonId: 'desktopFileBtn', toolbarTextKey: 'fileMenu' },
        { id: 'openLoginMenu', textKey: 'keyboardShortcutLoginMenu', defaultValue: 'U', allowInEditor: false, toolbarButtonId: 'desktopLoginBtn', toolbarTextKey: 'login' },
        { id: 'openInsertMenu', textKey: 'keyboardShortcutInsertMenu', defaultValue: 'I', allowInEditor: false, toolbarButtonId: 'desktopInsertBtn', toolbarTextKey: 'insert' },
        { id: 'openAIAssistant', textKey: 'keyboardShortcutAIAssistant', defaultValue: 'A', allowInEditor: false, toolbarButtonId: 'desktopAIBtn', toolbarTextKey: 'aiAssistant' },
        { id: 'openEditMenu', textKey: 'keyboardShortcutEditMenu', defaultValue: 'E', allowInEditor: false, toolbarButtonId: 'desktopEditBtn', toolbarTextKey: 'edit' },
        { id: 'openSettingsMenu', textKey: 'keyboardShortcutSettingsMenu', defaultValue: 'S', allowInEditor: false, toolbarButtonId: 'desktopSettingsBtn', toolbarTextKey: 'settings' },
        { id: 'openMoreMenu', textKey: 'keyboardShortcutMoreMenu', defaultValue: 'M', allowInEditor: false, toolbarButtonId: 'desktopMoreBtn', toolbarTextKey: 'more' },
        { id: 'saveFile', textKey: 'keyboardShortcutSaveFile', defaultValue: 'Ctrl+S', allowInEditor: true },
        { id: 'newFile', textKey: 'keyboardShortcutNewFile', defaultValue: 'Ctrl+N', allowInEditor: true },
        { id: 'findInFile', textKey: 'keyboardShortcutFindInFile', defaultValue: 'Ctrl+F', allowInEditor: true },
        { id: 'undo', textKey: 'keyboardShortcutUndo', defaultValue: 'Ctrl+Z', allowInEditor: true },
        { id: 'redo', textKey: 'keyboardShortcutRedo', defaultValue: 'Ctrl+Shift+Z', allowInEditor: true },
        { id: 'openLocalFile', textKey: 'keyboardShortcutOpenLocalFile', defaultValue: 'Ctrl+O', allowInEditor: true },
        { id: 'toggleTheme', textKey: 'keyboardShortcutToggleTheme', defaultValue: 'Ctrl+Shift+L', allowInEditor: true }
    ];
    var keyboardShortcutActionsById = {};
    var defaultKeyboardShortcuts = {};
    var keyboardShortcutListenerInitialized = false;
    var settingsDialogInitialSnapshot = null;
    var settingsDialogCloseInProgress = false;
    var erudaModulePromise = null;
    var erudaInstance = null;
    var erudaEnabled = false;

    keyboardShortcutActionDefinitions.forEach(function(definition) {
        keyboardShortcutActionsById[definition.id] = definition;
        defaultKeyboardShortcuts[definition.id] = definition.defaultValue;
    });

    window.defaultKeyboardShortcuts = Object.assign({}, defaultKeyboardShortcuts);

    function normalizeShortcutKeyToken(token) {
        var rawToken = String(token || '').trim();
        if (!rawToken) return '';

        var lowerToken = rawToken.toLowerCase();
        var aliasMap = {
            space: 'Space',
            spacebar: 'Space',
            tab: 'Tab',
            enter: 'Enter',
            return: 'Enter',
            esc: 'Escape',
            escape: 'Escape',
            up: 'ArrowUp',
            down: 'ArrowDown',
            left: 'ArrowLeft',
            right: 'ArrowRight',
            arrowup: 'ArrowUp',
            arrowdown: 'ArrowDown',
            arrowleft: 'ArrowLeft',
            arrowright: 'ArrowRight',
            delete: 'Delete',
            del: 'Delete',
            backspace: 'Backspace',
            comma: ',',
            period: '.',
            dot: '.',
            '/': '/',
            '\\': '\\',
            '-': '-',
            '_': '_',
            ',': ',',
            '.': '.'
        };

        if (aliasMap[lowerToken]) return aliasMap[lowerToken];
        if (/^f\d{1,2}$/i.test(rawToken)) return rawToken.toUpperCase();
        if (rawToken.length === 1) return rawToken.toUpperCase();
        if (lowerToken === ' ') return 'Space';

        return rawToken.charAt(0).toUpperCase() + rawToken.slice(1).toLowerCase();
    }

    function normalizeShortcut(rawShortcut) {
        if (typeof rawShortcut !== 'string') return '';

        var shortcutText = rawShortcut.trim();
        if (!shortcutText) return '';

        var tokens = shortcutText.split('+').map(function(item) {
            return item.trim();
        }).filter(Boolean);
        if (!tokens.length) return '';

        var hasCtrl = false;
        var hasAlt = false;
        var hasShift = false;
        var keyToken = '';

        for (var i = 0; i < tokens.length; i++) {
            var lower = tokens[i].toLowerCase();
            if (lower === 'ctrl' || lower === 'control' || lower === 'cmdorctrl' || lower === 'cmd' || lower === 'command' || lower === 'meta' || lower === 'super' || lower === 'win' || lower === 'windows') {
                hasCtrl = true;
                continue;
            }
            if (lower === 'alt' || lower === 'option') {
                hasAlt = true;
                continue;
            }
            if (lower === 'shift') {
                hasShift = true;
                continue;
            }
            if (keyToken) {
                return '';
            }
            keyToken = normalizeShortcutKeyToken(tokens[i]);
        }

        if (!keyToken) return '';

        var normalizedParts = [];
        if (hasCtrl) normalizedParts.push('Ctrl');
        if (hasAlt) normalizedParts.push('Alt');
        if (hasShift) normalizedParts.push('Shift');
        normalizedParts.push(keyToken);
        return normalizedParts.join('+');
    }

    function buildShortcutFromKeyboardEvent(event) {
        var rawKey = String(event.key || '').trim();
        if (!rawKey) return '';

        var lowerKey = rawKey.toLowerCase();
        if (lowerKey === 'dead' || lowerKey === 'process' || lowerKey === 'unidentified') return '';
        if (lowerKey === 'control' || lowerKey === 'shift' || lowerKey === 'alt' || lowerKey === 'meta') return '';

        var keyToken = normalizeShortcutKeyToken(rawKey);
        if (!keyToken) return '';

        var shortcutParts = [];
        if (event.ctrlKey || event.metaKey) shortcutParts.push('Ctrl');
        if (event.altKey) shortcutParts.push('Alt');
        if (event.shiftKey) shortcutParts.push('Shift');
        shortcutParts.push(keyToken);

        return shortcutParts.join('+');
    }

    function getEffectiveKeyboardShortcuts(settings) {
        var shortcuts = {};
        var customShortcuts = settings && settings.keyboardShortcuts ? settings.keyboardShortcuts : null;

        keyboardShortcutActionDefinitions.forEach(function(definition) {
            var hasCustomValue = customShortcuts && Object.prototype.hasOwnProperty.call(customShortcuts, definition.id);
            if (!hasCustomValue) {
                shortcuts[definition.id] = definition.defaultValue;
                return;
            }

            var customValue = customShortcuts[definition.id];
            if (typeof customValue === 'string' && customValue.trim() === '') {
                shortcuts[definition.id] = '';
                return;
            }

            var normalized = normalizeShortcut(String(customValue || ''));
            shortcuts[definition.id] = normalized || definition.defaultValue;
        });

        return shortcuts;
    }

    function isEditorTarget(target) {
        var el = getTargetElement(target);
        if (!el) return false;
        return !!el.closest('#vditor, .vditor, .vditor-content');
    }

    function isFormInputTarget(target) {
        var el = getTargetElement(target);
        if (!el) return false;
        if (!el.closest('input, textarea, select, [contenteditable="true"]')) return false;
        return !isEditorTarget(el);
    }

    function findShortcutActionId(shortcutValue) {
        var effectiveShortcuts = getEffectiveKeyboardShortcuts(window.userSettings);
        for (var i = 0; i < keyboardShortcutActionDefinitions.length; i++) {
            var definition = keyboardShortcutActionDefinitions[i];
            if (effectiveShortcuts[definition.id] === shortcutValue) {
                return definition.id;
            }
        }
        return '';
    }

    function clickElementById(elementId) {
        var element = document.getElementById(elementId);
        if (!element) return false;
        element.click();
        return true;
    }

    function executeKeyboardShortcutAction(actionId) {
        switch (actionId) {
        case 'openFileMenu':
            if (clickElementById('desktopFileBtn')) return;
            showPrimaryFileInterface();
            return;
        case 'openLoginMenu':
            if (clickElementById('desktopLoginBtn')) return;
            if (typeof window.handleLoginButtonClick === 'function') window.handleLoginButtonClick();
            return;
        case 'openInsertMenu':
            if (clickElementById('desktopInsertBtn')) return;
            if (typeof window.showInsertPicker === 'function') {
                window.showInsertPicker();
            } else if (typeof window.showInsertMenu === 'function') {
                window.showInsertMenu();
            }
            return;
        case 'openAIAssistant':
            if (clickElementById('desktopAIBtn')) return;
            if (typeof window.showAIPanel !== 'function') {
                import('./ui/ai-assistant.js').then(function() {
                    if (typeof window.showAIPanel === 'function') {
                        window.showAIPanel();
                    }
                }).catch(function(error) {
                    console.error('Failed to load AI assistant module:', error);
                });
                return;
            }
            window.showAIPanel();
            return;
        case 'openEditMenu':
            clickElementById('desktopEditBtn');
            return;
        case 'openSettingsMenu':
            if (clickElementById('desktopSettingsBtn')) return;
            if (typeof window.showSettingsDialog === 'function') window.showSettingsDialog();
            return;
        case 'openMoreMenu':
            clickElementById('desktopMoreBtn');
            return;
        case 'saveFile':
            if (typeof window.saveCurrentFile === 'function') window.saveCurrentFile(true);
            return;
        case 'newFile':
            if (typeof window.createNewFile === 'function') window.createNewFile();
            return;
        case 'findInFile':
            if (typeof window.showFindDialog === 'function') window.showFindDialog();
            return;
        case 'undo':
            if (window.vditor && window.vditor.vditor && window.vditor.vditor.undo) {
                window.vditor.vditor.undo.undo(window.vditor.vditor);
            }
            return;
        case 'redo':
            if (window.vditor && window.vditor.vditor && window.vditor.vditor.undo) {
                window.vditor.vditor.undo.redo(window.vditor.vditor);
            }
            return;
        case 'openLocalFile':
            if (typeof window.openExternalLocalFileByDialog === 'function') {
                return window.openExternalLocalFileByDialog();
            }
            window.showMessage(window.i18n ? window.i18n.t('localFileOpenFailed') : '打开本地文件失败', 'error');
            return;
        case 'toggleTheme':
            if (typeof window.toggleNightMode === 'function') window.toggleNightMode();
            return;
        default:
            return;
        }
    }

    function handleGlobalKeyboardShortcuts(event) {
        if (event.defaultPrevented || event.isComposing) return;
        if (isFormInputTarget(event.target)) return;

        var shortcutValue = buildShortcutFromKeyboardEvent(event);
        if (!shortcutValue) return;

        var actionId = findShortcutActionId(shortcutValue);
        if (!actionId) return;

        var actionDefinition = keyboardShortcutActionsById[actionId];
        if (!actionDefinition) return;
        if (isEditorTarget(event.target) && actionDefinition.allowInEditor === false) return;

        event.preventDefault();
        event.stopPropagation();

        try {
            var result = executeKeyboardShortcutAction(actionId);
            if (result && typeof result.catch === 'function') {
                result.catch(function(error) {
                    console.error('[KeyboardShortcut] action failed:', actionId, error);
                });
            }
        } catch (error) {
            console.error('[KeyboardShortcut] action failed:', actionId, error);
        }
    }

    function renderDesktopToolbarShortcutLabels() {
        var effectiveShortcuts = getEffectiveKeyboardShortcuts(window.userSettings);

        keyboardShortcutActionDefinitions.forEach(function(definition) {
            if (!definition.toolbarButtonId || !definition.toolbarTextKey) return;

            var button = document.getElementById(definition.toolbarButtonId);
            if (!button) return;

            var baseText = window.i18n ? window.i18n.t(definition.toolbarTextKey) : button.textContent;
            var shortcut = effectiveShortcuts[definition.id];
            var displayText = shortcut ? baseText + '(' + shortcut + ')' : baseText;

            button.textContent = displayText;
            if (shortcut) {
                button.setAttribute('title', baseText + ' [' + shortcut + ']');
            } else {
                button.removeAttribute('title');
            }
        });
    }

    function renderKeyboardShortcutSettings() {
        var container = document.getElementById('keyboardShortcutsSettings');
        if (!container) return;

        container.innerHTML = '';
        var effectiveShortcuts = getEffectiveKeyboardShortcuts(window.userSettings);

        keyboardShortcutActionDefinitions.forEach(function(definition) {
            var row = document.createElement('div');
            row.className = 'shortcut-setting-row';
            row.style.display = 'flex';
            row.style.alignItems = 'center';
            row.style.justifyContent = 'space-between';
            row.style.gap = '10px';
            row.style.marginBottom = '8px';

            var label = document.createElement('label');
            label.setAttribute('for', 'keyboardShortcutInput_' + definition.id);
            label.style.flex = '1';
            label.style.fontSize = '14px';
            label.style.color = 'inherit';
            label.textContent = window.i18n ? window.i18n.t(definition.textKey) : definition.id;

            var input = document.createElement('input');
            input.id = 'keyboardShortcutInput_' + definition.id;
            input.type = 'text';
            input.className = 'form-control';
            input.style.maxWidth = '180px';
            input.style.textAlign = 'right';
            input.value = effectiveShortcuts[definition.id] || '';
            input.placeholder = definition.defaultValue;
            input.setAttribute('data-shortcut-action-id', definition.id);

            row.appendChild(label);
            row.appendChild(input);
            container.appendChild(row);
        });
    }

    function collectKeyboardShortcutsFromSettings() {
        var shortcutInputs = document.querySelectorAll('#keyboardShortcutsSettings input[data-shortcut-action-id]');
        if (!shortcutInputs.length) {
            return getEffectiveKeyboardShortcuts(window.userSettings);
        }

        var savedShortcuts = {};
        var usedShortcuts = {};

        for (var i = 0; i < shortcutInputs.length; i++) {
            var input = shortcutInputs[i];
            var actionId = input.getAttribute('data-shortcut-action-id');
            var rawValue = String(input.value || '').trim();
            if (!actionId || !keyboardShortcutActionsById[actionId]) continue;

            if (!rawValue) {
                savedShortcuts[actionId] = '';
                continue;
            }

            var normalized = normalizeShortcut(rawValue);
            if (!normalized) {
                var invalidTemplate = window.i18n ? window.i18n.t('keyboardShortcutInvalid') : '快捷键格式无效：{value}';
                window.customAlert(invalidTemplate.replace('{value}', rawValue));
                input.focus();
                input.select();
                return null;
            }

            if (usedShortcuts[normalized]) {
                var conflictTemplate = window.i18n ? window.i18n.t('keyboardShortcutConflict') : '快捷键冲突：{shortcut} 已用于多个操作';
                window.customAlert(conflictTemplate.replace('{shortcut}', normalized));
                input.focus();
                input.select();
                return null;
            }

            usedShortcuts[normalized] = actionId;
            savedShortcuts[actionId] = normalized;
        }

        keyboardShortcutActionDefinitions.forEach(function(definition) {
            if (!Object.prototype.hasOwnProperty.call(savedShortcuts, definition.id)) {
                savedShortcuts[definition.id] = definition.defaultValue;
            }
        });

        return savedShortcuts;
    }

    function normalizeShortcutForDirtyCheck(value) {
        var rawValue = String(value || '').trim();
        if (!rawValue) return '';
        var normalized = normalizeShortcut(rawValue);
        return normalized || rawValue.toUpperCase();
    }

    function getCheckedRadioValue(name, fallbackValue) {
        var radios = document.getElementsByName(name);
        for (var i = 0; i < radios.length; i++) {
            if (radios[i].checked) {
                return radios[i].value;
            }
        }
        return fallbackValue;
    }

    function buildSettingsDialogSnapshot() {
        var toolbarButtons = [];
        var toolbarCheckboxes = document.querySelectorAll('#toolbarButtonsSettings input[type="checkbox"]');
        toolbarCheckboxes.forEach(function(cb) {
            if (cb.checked) {
                toolbarButtons.push(cb.value);
            }
        });

        var draftShortcuts = {};
        var shortcutInputs = document.querySelectorAll('#keyboardShortcutsSettings input[data-shortcut-action-id]');
        if (shortcutInputs.length) {
            for (var i = 0; i < shortcutInputs.length; i++) {
                var input = shortcutInputs[i];
                var actionId = input.getAttribute('data-shortcut-action-id');
                if (!actionId || !keyboardShortcutActionsById[actionId]) continue;
                draftShortcuts[actionId] = normalizeShortcutForDirtyCheck(input.value);
            }
        }

        var effectiveShortcuts = getEffectiveKeyboardShortcuts(window.userSettings);
        keyboardShortcutActionDefinitions.forEach(function(definition) {
            if (!Object.prototype.hasOwnProperty.call(draftShortcuts, definition.id)) {
                draftShortcuts[definition.id] = normalizeShortcutForDirtyCheck(effectiveShortcuts[definition.id]);
            }
        });

        var fontSizeSelect = document.getElementById('fontSizeSelect');
        var showOutlineCheckbox = document.getElementById('showOutlineCheckbox');
        var debugModeCheckbox = document.getElementById('debugModeCheckbox');
        var slashCommandEnabledCheckbox = document.getElementById('slashCommandEnabledCheckbox');
        var slashCommandActivationKeySelect = document.getElementById('slashCommandActivationKeySelect');
        var mdAssociationCheckbox = document.getElementById('mdAssociationCheckbox');

        return {
            editorMode: getCheckedRadioValue('editorMode', 'wysiwyg'),
            themeMode: getCheckedRadioValue('themeMode', 'system'),
            uiMode: getCheckedRadioValue('uiMode', 'auto'),
            language: getCheckedRadioValue('language', window.i18n ? window.i18n.getLanguage() : 'zh'),
            fontSize: fontSizeSelect ? fontSizeSelect.value : '16px',
            showOutline: !!(showOutlineCheckbox && showOutlineCheckbox.checked),
            enableDebugMode: !!(debugModeCheckbox && debugModeCheckbox.checked),
            enableSlashCommand: slashCommandEnabledCheckbox ? slashCommandEnabledCheckbox.checked : true,
            slashCommandActivationKey: slashCommandActivationKeySelect ? (slashCommandActivationKeySelect.value || 'Tab') : 'Tab',
            storageLocation: getCheckedRadioValue('storageLocation', 'cloud'),
            defaultFileOpening: getCheckedRadioValue('defaultFileOpening', 'lastEdited'),
            defaultSorting: getCheckedRadioValue('defaultSorting', 'modifiedTime'),
            mdFileAssociationEnabled: !!(mdAssociationCheckbox && mdAssociationCheckbox.checked),
            toolbarButtons: toolbarButtons,
            keyboardShortcuts: draftShortcuts
        };
    }

    function hasSettingsDialogUnsavedChanges() {
        if (!settingsDialogInitialSnapshot) return false;
        var currentSnapshot = buildSettingsDialogSnapshot();
        return JSON.stringify(currentSnapshot) !== JSON.stringify(settingsDialogInitialSnapshot);
    }

    async function requestCloseSettingsDialog() {
        var modal = document.getElementById('settingsModalOverlay');
        if (!modal || !modal.classList.contains('show')) return;
        if (settingsDialogCloseInProgress) return;

        if (!hasSettingsDialogUnsavedChanges()) {
            modal.classList.remove('show');
            settingsDialogInitialSnapshot = null;
            return;
        }

        settingsDialogCloseInProgress = true;
        try {
            var confirmMessage = window.i18n ? window.i18n.t('settingsUnsavedSaveConfirm') : '设置已修改，是否保存后关闭？';
            var shouldSave = await window.customConfirm(confirmMessage, {
                cancelText: window.i18n ? window.i18n.t('settingsDontSave') : '不保存',
                confirmText: window.i18n ? window.i18n.t('save') : '保存',
                dismissible: false,
                closeOnOverlay: false,
                closeOnEsc: false
            });

            if (!shouldSave) {
                modal.classList.remove('show');
                settingsDialogInitialSnapshot = null;
                return;
            }

            var saveButton = document.getElementById('saveSettingsBtn');
            if (saveButton) {
                saveButton.click();
            }
        } finally {
            settingsDialogCloseInProgress = false;
        }
    }

    async function loadErudaModule() {
        if (erudaInstance) return erudaInstance;
        if (!erudaModulePromise) {
            erudaModulePromise = import('eruda').then(function(module) {
                return module && module.default ? module.default : module;
            }).catch(function(error) {
                erudaModulePromise = null;
                throw error;
            });
        }

        erudaInstance = await erudaModulePromise;
        return erudaInstance;
    }

    async function applyDebugModeSetting(enableDebugMode, notifyOnError) {
        var shouldEnable = !!enableDebugMode;

        if (shouldEnable === erudaEnabled) {
            return true;
        }

        if (shouldEnable) {
            try {
                var eruda = await loadErudaModule();
                if (eruda && typeof eruda.init === 'function') {
                    eruda.init();
                }
                erudaEnabled = true;
                return true;
            } catch (error) {
                console.error('Failed to enable Eruda debug mode:', error);
                if (notifyOnError && typeof window.showMessage === 'function') {
                    window.showMessage(window.i18n ? window.i18n.t('debugModeLoadFailed') : '调试模式加载失败', 'error');
                }
                return false;
            }
        }

        if (erudaInstance && typeof erudaInstance.destroy === 'function') {
            erudaInstance.destroy();
        }
        erudaEnabled = false;
        return true;
    }

    function initGlobalKeyboardShortcuts() {
        if (keyboardShortcutListenerInitialized) return;
        keyboardShortcutListenerInitialized = true;
        document.addEventListener('keydown', handleGlobalKeyboardShortcuts, true);
    }

    async function handleBottomSave() {
        if (window.saveCurrentFile) {
            await window.saveCurrentFile(true);
            var t = function(key) { return window.i18n ? window.i18n.t(key) : key; };
            window.showMessage(t('saveSuccess') || '保存成功', 'success');
        }
    }

    async function handleBottomExport() {
        if (typeof window.exportContent !== 'function') {
            await import('./ui/export.js');
        }
        window.exportContent();
    }

    async function handleBottomShare() {
        if (typeof window.showShareDialog !== 'function') {
            await import('./ui/share.js');
        }
        window.showShareDialog();
    }

    function handleBottomFileList() {
        showPrimaryFileInterface();
    }

    function renderToolbarButtonSettings() {
        var toolbarSettings = document.getElementById('toolbarButtonsSettings');
        if (!toolbarSettings) return;
        toolbarSettings.innerHTML = '';

        var currentButtons = window.userSettings.toolbarButtons || window.defaultToolbarButtons;
        getVisibleToolbarButtons().forEach(function(btnConfig) {
            var label = document.createElement('label');
            var checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = btnConfig.id;
            checkbox.checked = currentButtons.includes(btnConfig.id);

            label.appendChild(checkbox);
            var buttonText = (window.i18n && btnConfig.textKey) ? window.i18n.t(btnConfig.textKey) : btnConfig.text;
            label.appendChild(document.createTextNode(' ' + buttonText));
            toolbarSettings.appendChild(label);
        });
    }

    function bindToolbarEasterEggTrigger() {
        var title = document.querySelector('#settingsModalOverlay [data-i18n="bottomToolbarButtons"]');
        if (!title || title.dataset.easterEggBound === '1') return;

        title.dataset.easterEggBound = '1';
        title.addEventListener('click', function() {
            if (window.toolbarUncertaintyUnlocked) return;

            var now = Date.now();
            if (now - toolbarEasterEggLastTapAt > 1500) {
                toolbarEasterEggTapCount = 0;
            }
            toolbarEasterEggLastTapAt = now;
            toolbarEasterEggTapCount += 1;

            if (toolbarEasterEggTapCount >= 5) {
                window.toolbarUncertaintyUnlocked = true;
                localStorage.setItem(TOOLBAR_EASTER_EGG_KEY, 'true');
                toolbarEasterEggTapCount = 0;
                renderToolbarButtonSettings();
                window.showMessage(window.i18n ? window.i18n.t('uncertaintyEasterEggUnlocked') : '彩蛋已解锁：不确定度计算器按钮已显示', 'success');
            }
        });
    }

    // 工具栏配置（使用翻译函数）
    window.allToolbarButtons = [
        { id: 'mobileInsertBtn', icon: 'fas fa-plus', textKey: 'insert', fn: function() { if (typeof window.showInsertPicker === 'function') window.showInsertPicker(); else window.showInsertMenu(); } },
        { id: 'mobileBottomSaveBtn', icon: 'fas fa-save', textKey: 'save', fn: handleBottomSave },
        { id: 'mobileBottomSettingsBtn', icon: 'fas fa-cog', textKey: 'settings', fn: function() { window.showSettingsDialog(); } },
        { id: 'mobileBottomImportBtn', icon: 'fas fa-file-import', textKey: 'import', fn: function() { window.importFiles(); } },
        { id: 'mobileBottomExportBtn', icon: 'fas fa-file-export', textKey: 'export', fn: handleBottomExport },
        { id: 'mobileBottomShareBtn', icon: 'fas fa-share-alt', textKey: 'share', fn: handleBottomShare },
        { id: 'mobileBottomFileListBtn', icon: 'fas fa-folder-open', textKey: 'fileListTitle', fn: handleBottomFileList },
        { id: 'mobileFormulaBtn', icon: 'fas fa-superscript', textKey: 'formula', fn: async function() {
            if (typeof window.showFormulaPicker !== 'function') {
                await import('./formula-picker.js');
            }
            if (typeof window.showFormulaPicker === 'function') window.showFormulaPicker();
        } },
        { id: 'mobileChartBtn', icon: 'fas fa-chart-bar', textKey: 'chart', fn: async function() {
            if (typeof window.showChartPicker !== 'function') {
                await import('./ui/chart.js');
            }
            if (typeof window.showChartPicker === 'function') window.showChartPicker();
        } },
        { id: 'mobileUncertaintyBtn', icon: 'fas fa-calculator', textKey: 'uncertainty', isEasterEgg: true, fn: async function() {
            if (typeof window.showUncertaintyCalculator !== 'function') {
                await import('./uncertainty-calculator.js');
            }
            if (typeof window.showUncertaintyCalculator === 'function') window.showUncertaintyCalculator();
        } },
        { id: 'mobileUndoBtn', icon: 'fas fa-undo', textKey: 'undo', fn: function() { if (window.vditor && window.vditor.vditor && window.vditor.vditor.undo) window.vditor.vditor.undo.undo(window.vditor.vditor); } },
        { id: 'mobileRedoBtn', icon: 'fas fa-redo', textKey: 'redo', fn: function() { if (window.vditor && window.vditor.vditor && window.vditor.vditor.undo) window.vditor.vditor.undo.redo(window.vditor.vditor); } },
        { id: 'mobileAIBtn', icon: 'fas fa-robot', textKey: 'aiAssistant', fn: async function() {
            if (typeof window.showAIPanel !== 'function') {
                // 懒加载 AI 助手模块
                await import('./ui/ai-assistant.js');
            }
            if (typeof window.showAIPanel === 'function') window.showAIPanel();
        } }
    ];

    // 默认配置（未登录时显示：插入、公式、图表、撤销、重做、AI助手）
    window.defaultToolbarButtons = ['mobileInsertBtn', 'mobileFormulaBtn', 'mobileChartBtn', 'mobileUndoBtn', 'mobileRedoBtn', 'mobileAIBtn'];

    // 加载用户配置
    window.userSettings = JSON.parse(localStorage.getItem('vditor_settings') || '{}');
    if (!window.userSettings.toolbarButtons) {
        window.userSettings.toolbarButtons = window.defaultToolbarButtons;
    }
    if (!window.userSettings.themeMode) {
        window.userSettings.themeMode = 'system'; // system, light, dark
    }
    if (!window.userSettings.fontSize) {
        window.userSettings.fontSize = '16px'; // 默认字体大小
    }
    if (typeof window.userSettings.showOutline !== 'boolean') {
        window.userSettings.showOutline = false; // 默认不显示大纲
    }
    if (typeof window.userSettings.enableDebugMode !== 'boolean') {
        window.userSettings.enableDebugMode = false;
    }
    if (typeof window.userSettings.enableSlashCommand !== 'boolean') {
        window.userSettings.enableSlashCommand = true;
    }
    if (!window.userSettings.slashCommandActivationKey) {
        window.userSettings.slashCommandActivationKey = 'Tab';
    }
    if (typeof window.userSettings.enableWasmTextEngine !== 'boolean') {
        window.userSettings.enableWasmTextEngine = true;
    }
    if (typeof window.userSettings.mdFileAssociationEnabled !== 'boolean') {
        window.userSettings.mdFileAssociationEnabled = true;
    }
    if (!window.userSettings.uiMode) {
        window.userSettings.uiMode = 'auto'; // auto, mobile, desktop
    }
    if (!window.userSettings.defaultFileOpening) {
        window.userSettings.defaultFileOpening = 'lastEdited';
    }

    var shouldOpenFileListFirst = window.userSettings.defaultFileOpening === 'fileList';
    window.startInFileManagementMode = !shareModeActive && shouldOpenFileListFirst;
    window.deferInitialFileOpen = !!window.startInFileManagementMode;
    window.isFileManagementMode = !!window.startInFileManagementMode;

    window.userSettings.keyboardShortcuts = getEffectiveKeyboardShortcuts(window.userSettings);
    applyDebugModeSetting(window.userSettings.enableDebugMode, false);

    let desktopOpenFileBridgeInitialized = false;

    async function syncMdAssociationSettingFromDesktop() {
        if (!window.electron || typeof window.electron.getMdAssociationEnabled !== 'function') return;
        try {
            const enabled = await window.electron.getMdAssociationEnabled();
            window.userSettings.mdFileAssociationEnabled = !!enabled;
            localStorage.setItem('vditor_settings', JSON.stringify(window.userSettings));
        } catch (error) {
            console.warn('Failed to load md association setting from desktop runtime:', error);
        }
    }

    function initDesktopOpenFileBridge() {
        if (!window.electron || typeof window.electron.onOpenLocalFileRequest !== 'function' || desktopOpenFileBridgeInitialized) return;
        desktopOpenFileBridgeInitialized = true;

        var lastDesktopOpenFilePath = null;

        async function handleDesktopOpenFileRequest(filePath) {
            if (!filePath || typeof window.openExternalLocalFileByPath !== 'function') return;
            if (filePath === lastDesktopOpenFilePath) return;
            lastDesktopOpenFilePath = filePath;
            try {
                await window.openExternalLocalFileByPath(filePath);
            } catch (error) {
                console.error('Failed to open local file from system event:', error);
                window.showMessage((window.i18n ? window.i18n.t('localFileOpenFailed') : '打开本地文件失败') + ': ' + error.message, 'error');
            }
        }

        window.electron.onOpenLocalFileRequest(function(filePath) {
            handleDesktopOpenFileRequest(filePath);
        });

        if (typeof window.electron.consumePendingOpenFilePath === 'function') {
            window.electron.consumePendingOpenFilePath()
                .then(function(filePath) {
                    handleDesktopOpenFileRequest(filePath);
                })
                .catch(function(error) {
                    console.warn('Failed to consume pending open file path:', error);
                });
        }
    }

    syncMdAssociationSettingFromDesktop();

    function getEffectiveInterfaceMode(settings) {
        var targetSettings = settings || window.userSettings || {};
        var configuredMode = targetSettings.uiMode || 'auto';
        if (configuredMode === 'mobile' || configuredMode === 'desktop') {
            return configuredMode;
        }
        return isMobileDevice ? 'mobile' : 'desktop';
    }

    function applyInterfaceMode(settings) {
        var mode = getEffectiveInterfaceMode(settings);
        window.editorInterfaceMode = mode;
        window.isMobileEditorEnvironment = mode === 'mobile';

        document.body.classList.remove('ui-mode-mobile', 'ui-mode-desktop');
        document.body.classList.add(mode === 'mobile' ? 'ui-mode-mobile' : 'ui-mode-desktop');
    }

    applyInterfaceMode(window.userSettings);

    bindToolbarEasterEggTrigger();

    // 初始化主题
    initTheme();

    function initTheme() {
        var mode = window.userSettings.themeMode;
        if (mode === 'system') {
            if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
                window.nightMode = true;
            } else {
                window.nightMode = false;
            }
        } else if (mode === 'dark') {
            window.nightMode = true;
        } else {
            window.nightMode = false;
        }

        // 兼容旧的 localStorage 设置
        if (localStorage.getItem('vditor_night_mode') === 'true') {
            // 忽略旧设置
        }
    }

    if (window.nightMode) {
        document.body.classList.add('night-mode');
        var modeToggleEl = document.getElementById('modeToggle');
        if (modeToggleEl) modeToggleEl.innerHTML = '<i class="fas fa-sun"></i>';
    }
    if (typeof window.syncThemeColor === 'function') {
        window.syncThemeColor();
    }

    // 应用翻译到页面元素
    function applyTranslations() {
        if (!window.i18n) return;

        // 翻译普通文本
        var elements = document.querySelectorAll('[data-i18n]');
        elements.forEach(function(el) {
            var key = el.getAttribute('data-i18n');
            if (key && window.i18n.t(key)) {
                el.textContent = window.i18n.t(key);
            }
        });

        // 翻译 title 属性
        elements = document.querySelectorAll('[data-i18n-title]');
        elements.forEach(function(el) {
            var key = el.getAttribute('data-i18n-title');
            if (key && window.i18n.t(key)) {
                el.setAttribute('title', window.i18n.t(key));
            }
        });

        // 翻译 placeholder 属性
        elements = document.querySelectorAll('[data-i18n-placeholder]');
        elements.forEach(function(el) {
            var key = el.getAttribute('data-i18n-placeholder');
            if (key && window.i18n.t(key)) {
                el.setAttribute('placeholder', window.i18n.t(key));
            }
        });

        if (Array.isArray(keyboardShortcutActionDefinitions)) {
            renderDesktopToolbarShortcutLabels();
        }
    }

    // 获取模式名称的翻译
    function getModeName(mode) {
        if (!window.i18n) {
            var names = {
                wysiwyg: '所见即所得',
                ir: '即时渲染',
                sv: '分屏预览'
            };
            return names[mode] || mode;
        }
        var keys = {
            wysiwyg: 'wysiwyg',
            ir: 'instantRender',
            sv: 'splitPreview'
        };
        return window.i18n.t(keys[mode]) || mode;
    }

    var modeMap = {
        wysiwyg: { name: getModeName('wysiwyg'), icon: 'fas fa-eye' },
        ir: { name: getModeName('ir'), icon: 'fas fa-bolt' },
        sv: { name: getModeName('sv'), icon: 'fas fa-columns' }
    };

    var editorConfig = {
        height: '100%',
        width: '100%',
        placeholder: window.i18n ? window.i18n.t('startEditing') : '开始编辑...支持 Markdown 语法',
        cdn: window.electron ? './vditor' : (window.location.protocol === 'file:' ? './vditor' : '/vditor'), // 兼容桌面壳与 Web 环境的本地目录
        lang: 'en_US', // 彻底禁用中文语言文件，使用默认英语
        toolbar: ['emoji', 'br', 'bold', 'italic', 'strike', '|', 'line', 'quote', 'list', 'ordered-list', 'check', 'outdent', 'indent', 'code', 'inline-code', 'insert-after', 'insert-before', 'upload', 'link', 'table', 'record', 'edit-mode', 'both', 'preview', 'fullscreen', 'outline', 'code-theme', 'content-theme', 'export', 'info', 'help', 'br'],
        customWysiwygToolbar: function() {}, // 修复报错
        theme: window.nightMode ? 'dark' : 'classic',
        mode: localStorage.getItem('vditor_editor_mode') || 'wysiwyg',
        cache: { enable: true, id: 'vditor-mobile-optimized' },
        outline: { enable: window.userSettings.showOutline },
        hint: { emoji: {} },
        preview: {
            math: {
                inlineDigit: true,
                engine: 'KaTeX',
                macros: {},
            }
        },
        upload: {
            accept: 'image/*,.jpg,.jpeg,.png,.gif,.bmp,.webp,.svg,.mp4,.mp3,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar,.7z',
            handler: function(files) { return window.uploadFiles(files, true); }
        },
        after: function() {
            window.vditorReady = true;
            if (loading) loading.style.display = 'none';

            if (typeof window.initInlineImageTools === 'function') {
                window.initInlineImageTools();
            }


            console.log('%c%s', 'font-size: 48px; font-weight: bold; color: #4a90e2; text-shadow: 2px 2px 4px rgba(0,0,0,0.2);', 'EasyPocketMD');

            // 应用字体大小设置
            applyFontSize(window.userSettings.fontSize);

            // 应用大纲视图设置
            applyOutline(window.userSettings.showOutline);

            // 初始化用户界面和移动特性
            var continueAfterEngineReady = function() {
                initializeAppShellOnce();
                initSlashCommandRuntime();
            };

            if (window.wasmTextEngineGateway && typeof window.wasmTextEngineGateway.ensureReady === 'function') {
                window.wasmTextEngineGateway.ensureReady().finally(continueAfterEngineReady);
            } else {
                continueAfterEngineReady();
            }
            if (!hasBoundGlobalClickGuard) {
                hasBoundGlobalClickGuard = true;
                document.addEventListener('click', function(e) {
                    var dropdown = document.getElementById('mobileDropdown');
                    var menuBtn = document.getElementById('mobileMenuBtn');
                    var overlay = document.getElementById('mobileActionSheetOverlay');
                    var userMenu = document.getElementById('userMenuDropdown');

                    var desktopDropdown = document.getElementById('desktopMoreDropdown');
                    var desktopMoreBtn = document.getElementById('desktopMoreBtn');
                    var desktopEditDropdown = document.getElementById('desktopEditDropdown');
                    var desktopEditBtn = document.getElementById('desktopEditBtn');

                    if (menuBtn && dropdown && !menuBtn.contains(e.target) && !dropdown.contains(e.target)) dropdown.classList.remove('show');
                    if (desktopDropdown && desktopMoreBtn && !desktopMoreBtn.contains(e.target) && !desktopDropdown.contains(e.target)) desktopDropdown.classList.remove('show');
                    if (desktopEditDropdown && desktopEditBtn && !desktopEditBtn.contains(e.target) && !desktopEditDropdown.contains(e.target)) desktopEditDropdown.classList.remove('show');
                    if (overlay && e.target === overlay) window.hideMobileActionSheet();
                    var mobileLoginBtn = document.getElementById('mobileLoginBtn');
                    var desktopLoginBtn = document.getElementById('desktopLoginBtn');
                    var loginTriggerClicked = (mobileLoginBtn && mobileLoginBtn.contains(e.target)) || (desktopLoginBtn && desktopLoginBtn.contains(e.target));
                    if (userMenu && !loginTriggerClicked && !userMenu.contains(e.target)) userMenu.classList.remove('show');
                });
            }
            if (window.vditor && window.vditor.vditor && window.vditor.vditor.ir) {
                window.vditor.vditor.ir.element.addEventListener('input', function() {
                    if (window.currentFileId) {
                        window.unsavedChanges[window.currentFileId] = true;
                        window.startAutoSave();
                        // 标记草稿需要备份
                        if (window.draftRecovery) {
                            window.draftRecovery.markDirty();
                        }
                    }

                    if (window.isMobileEditorEnvironment) {
                        return;
                    }

                    // 桌面端再做图片懒处理，避免移动端输入时额外抢占主线程
                    setTimeout(function() {
                        if (window.LazyImageLoader && window.LazyImageLoader.processVditorImages) {
                            window.LazyImageLoader.processVditorImages();
                        }
                    }, 300);
                });
            }

            // 初始化应用生命周期管理（草稿恢复等）
            if (window.appLifecycle) {
                window.appLifecycle.init();
            }

            // ECharts 懒加载：图表将在用户滚动到可见区域或点击时渲染
            // 不再在初始化时自动渲染所有图表，提升首屏加载性能

            if (typeof window.__resolveVditorInit === 'function') {
                window.__resolveVditorInit(window.vditor);
            }
            window.__resolveVditorInit = null;
            window.__rejectVditorInit = null;
        }
    };

    // 顶部提示横幅相关函数
    let currentNoticeType = null;
    let networkMonitoringInitialized = false;

    function initTopNoticeBanner() {
        const banner = document.getElementById('topNoticeBanner');
        const closeBtn = document.getElementById('topNoticeClose');

        if (closeBtn) {
            closeBtn.addEventListener('click', function() {
                hideTopNoticeBanner();
                // 根据横幅类型保存状态
                if (currentNoticeType === 'guest') {
                    localStorage.setItem('guestNoticeDismissed', 'true');
                }
            });
        }

        // 初始化网络状态监听
        initNetworkMonitoring();
    }

    function initNetworkMonitoring() {
        if (networkMonitoringInitialized) return;
        networkMonitoringInitialized = true;

        // 监听网络恢复事件
        window.addEventListener('online', function() {
            // 如果当前显示的是网络错误提示，则自动关闭
            if (currentNoticeType === 'network-error') {
                hideTopNoticeBanner();
            }
        });

        // 监听网络断开事件，主动显示网络错误提示
        window.addEventListener('offline', function() {
            // 网络断开时，显示网络错误提示
            showNetworkErrorBanner();
        });
    }

    function showTopNoticeBanner(type, text, icon, isHtml) {
        const banner = document.getElementById('topNoticeBanner');
        if (!banner) return;

        // 只有未登录提示检查是否已被关闭，网络错误提示始终显示
        if (type === 'guest' && localStorage.getItem('guestNoticeDismissed') === 'true') {
            return;
        }

        // 移除旧的类型类
        banner.classList.remove('type-guest', 'type-network-error');
        // 添加新的类型类
        banner.classList.add('type-' + type);

        // 设置图标
        const iconEl = banner.querySelector('.notice-icon');
        if (iconEl) {
            iconEl.className = 'notice-icon ' + icon;
        }

        // 设置文本
        const textEl = banner.querySelector('.notice-text');
        if (textEl) {
            if (isHtml) {
                textEl.innerHTML = text;
            } else {
                textEl.textContent = text;
            }
        }

        // 显示横幅
        banner.style.display = 'flex';
        document.body.classList.add('has-top-notice');
        currentNoticeType = type;
    }

    function hideTopNoticeBanner() {
        const banner = document.getElementById('topNoticeBanner');
        if (banner) {
            banner.style.display = 'none';
            document.body.classList.remove('has-top-notice');
            currentNoticeType = null;
        }
    }

    // 便捷函数：显示未登录提示
    function showGuestNoticeBanner() {
        const isEn = window.i18n && window.i18n.getLanguage() === 'en';
        const loginText = isEn ? 'Log in' : '登录';
        const dismissText = isEn ? "Don't remind again" : '不再提醒';
        const text = isEn
            ? 'As a guest user, uploaded images and files are kept for only 2 hours. <a href="#" id="guestBannerLoginLink" style="color: white; text-decoration: underline; cursor: pointer;">' + loginText + '</a> for permanent storage and automatic server sync. <a href="#" id="guestBannerDismissLink" style="color: white; text-decoration: underline; cursor: pointer; margin-left: 8px;">' + dismissText + '</a>'
            : '未登录用户，上传的图片和文件仅保证保存2小时，<a href="#" id="guestBannerLoginLink" style="color: white; text-decoration: underline; cursor: pointer;">' + loginText + '</a>后永久保存，且文件自动同步到服务器。<a href="#" id="guestBannerDismissLink" style="color: white; text-decoration: underline; cursor: pointer; margin-left: 8px;">' + dismissText + '</a>';
        showTopNoticeBanner(
            'guest',
            text,
            'fas fa-info-circle',
            true
        );

        // 添加登录链接的点击事件
        setTimeout(function() {
            const loginLink = document.getElementById('guestBannerLoginLink');
            if (loginLink) {
                loginLink.addEventListener('click', function(e) {
                    e.preventDefault();
                    if (window.showLoginModal) {
                        window.showLoginModal();
                    }
                });
            }

            const dismissLink = document.getElementById('guestBannerDismissLink');
            if (dismissLink) {
                dismissLink.addEventListener('click', function(e) {
                    e.preventDefault();
                    localStorage.setItem('guestNoticeDismissed', 'true');
                    hideTopNoticeBanner();
                });
            }
        }, 100);
    }

    // 便捷函数：显示网络错误提示
    function showNetworkErrorBanner() {
        showTopNoticeBanner(
            'network-error',
            '网络异常，请检查网络连接',
            'fas fa-exclamation-triangle'
        );
    }

    // 暴露到全局
    window.initTopNoticeBanner = initTopNoticeBanner;
    window.showTopNoticeBanner = showTopNoticeBanner;
    window.hideTopNoticeBanner = hideTopNoticeBanner;
    window.showGuestNoticeBanner = showGuestNoticeBanner;
    window.showNetworkErrorBanner = showNetworkErrorBanner;

    function initUserInterface() {
        // 初始化顶部提示横幅
        initTopNoticeBanner();

        var bootFileWorkspace = function() {
            if (window.currentUser) {
                window.showUserInfo();
                window.startAutoSync();
                window.loadFilesFromServer();
                hideTopNoticeBanner();
            } else {
                const urlParams = new URLSearchParams(window.location.search);
                const shareId = urlParams.get('share_id');

                if (!shareId) {
                    showGuestNoticeBanner();
                }
                window.loadLocalFiles();
            }
        };

        var handleStartupFailure = function(error) {
            const message = (window.i18n ? window.i18n.t('syncFailed') : '初始化失败') +
                ': ' + ((error && error.message) || 'wasm text engine unavailable');
            console.error('[startup] wasm text engine failed before file workspace boot', error);
            showTopNoticeBanner('network-error', message, 'fas fa-exclamation-triangle');
            if (window.showMessage) {
                window.showMessage(message, 'error');
            }
            var loadingEl = document.getElementById('loading');
            if (loadingEl) loadingEl.style.display = 'none';
        };

        var bootFileWorkspaceSafely = function() {
            try {
                bootFileWorkspace();
            } catch (error) {
                handleStartupFailure(error);
            }
        };

        var ensureWasmReadyBeforeWorkspaceBoot = function() {
            if (typeof window.ensureWasmTextEngineReady !== 'function') {
                return Promise.resolve();
            }
            return window.ensureWasmTextEngineReady().catch(function(error) {
                // 冷启动时 wasm 预热失败不应阻断主流程，继续走 JS 回退能力。
                console.warn('[startup] wasm prewarm failed, continue with fallback runtime', error);
            });
        };

        ensureWasmReadyBeforeWorkspaceBoot()
            .then(bootFileWorkspaceSafely)
            .catch(handleStartupFailure);
        var fileListClose = document.getElementById('fileListClose');
        if (fileListClose) fileListClose.addEventListener('click', function() { document.getElementById('fileListSidebar').classList.remove('show'); });

        // 文件列表帮助图标
        var fileListHelp = document.getElementById('fileListHelp');
        if (fileListHelp) {
            fileListHelp.addEventListener('click', function() {
                window.customAlert(window.i18n ? window.i18n.t('fileListHelpText') : '文件列表功能提示：\n\n• 点击文件：打开文件\n• 点击文件夹：展开/收起子内容\n• 右键点击或长按：显示更多操作菜单（重命名、移动、删除等）');
            });
        }

        var addFileBtn = document.getElementById('addFileBtn');
        if (addFileBtn) addFileBtn.addEventListener('click', window.createNewFile);
        var addFolderBtn = document.getElementById('addFolderBtn');
        if (addFolderBtn) addFolderBtn.addEventListener('click', window.createNewFolder);
        var mobileFileBtn = document.getElementById('mobileFileBtn');
        if (mobileFileBtn) mobileFileBtn.addEventListener('click', showPrimaryFileInterface);

        // 演示模式按钮仅在桌面端显示
        var mobilePresentationBtn = document.getElementById('mobilePresentationBtn');
        if (mobilePresentationBtn) {
            if (window.editorInterfaceMode === 'mobile') {
                mobilePresentationBtn.style.display = 'none';
            } else {
                mobilePresentationBtn.style.display = '';
            }
        }
    }

    function initMobileFeatures() {
        var dropdown = document.getElementById('mobileDropdown');
        function closeDrop() { if (dropdown) dropdown.classList.remove('show'); }
        var desktopDropdown = document.getElementById('desktopMoreDropdown');
        function closeDesktopDrop() { if (desktopDropdown) desktopDropdown.classList.remove('show'); }
        var desktopEditDropdown = document.getElementById('desktopEditDropdown');
        function closeDesktopEditDrop() { if (desktopEditDropdown) desktopEditDropdown.classList.remove('show'); }

        function bindDesktopButton(id, fn) {
            var el = document.getElementById(id);
            if (!el || !el.parentNode) return;
            var neu = el.cloneNode(true);
            el.parentNode.replaceChild(neu, el);
            neu.addEventListener('click', fn);
        }

        var mobileShareBtn = document.getElementById('mobileShareBtn');
        if (mobileShareBtn) mobileShareBtn.addEventListener('click', async function() {
            if (typeof window.showShareDialog !== 'function') {
                await import('./ui/share.js');
            }
            window.showShareDialog();
            closeDrop();
        });
        var mobileFileManagerBtn = document.getElementById('mobileFileManagerBtn');
        if (mobileFileManagerBtn) mobileFileManagerBtn.addEventListener('click', function() { window.showFileManager(); closeDrop(); });

        // 文件对比按钮
        var mobileFileDiffBtn = document.getElementById('mobileFileDiffBtn');
        if (mobileFileDiffBtn) mobileFileDiffBtn.addEventListener('click', function() {
            if (typeof window.showFileDiffDialog === 'function') {
                window.showFileDiffDialog();
            }
            closeDrop();
        });

        // 全文查找按钮
        var mobileFindBtn = document.getElementById('mobileFindBtn');
        if (mobileFindBtn) mobileFindBtn.addEventListener('click', function() {
            if (typeof window.showFindDialog === 'function') {
                window.showFindDialog();
            }
            closeDrop();
        });

        var mobilePrintBtn = document.getElementById('mobilePrintBtn');
        if (mobilePrintBtn) mobilePrintBtn.addEventListener('click', async function() {
            if (typeof window.showPrintDialog !== 'function') {
                await import('./ui/print.js');
            }
            window.showPrintDialog();
            closeDrop();
        });

        var mobilePresentationBtn = document.getElementById('mobilePresentationBtn');
        if (mobilePresentationBtn) mobilePresentationBtn.addEventListener('click', function() { enterPresentationMode(); closeDrop(); });

        var mobileMenuBtn = document.getElementById('mobileMenuBtn');
        if (mobileMenuBtn) mobileMenuBtn.addEventListener('click', function(e) { e.stopPropagation(); if (dropdown) dropdown.classList.toggle('show'); });
        var mobileModeBtn = document.getElementById('mobileModeBtn');
        if (mobileModeBtn) mobileModeBtn.addEventListener('click', function() { showModeSelection(); closeDrop(); });
        var mobileOpenLocalFileBtn = document.getElementById('mobileOpenLocalFileBtn');
        if (mobileOpenLocalFileBtn) mobileOpenLocalFileBtn.addEventListener('click', async function() {
            if (typeof window.openExternalLocalFileByDialog === 'function') {
                await window.openExternalLocalFileByDialog();
            } else {
                window.showMessage(window.i18n ? window.i18n.t('localFileOpenFailed') : '打开本地文件失败', 'error');
            }
            closeDrop();
        });
        var mobileExportBtn = document.getElementById('mobileExportBtn');
        if (mobileExportBtn) mobileExportBtn.addEventListener('click', async function() {
            if (typeof window.exportContent !== 'function') {
                await import('./ui/export.js');
            }
            window.exportContent();
            closeDrop();
        });

        var mobileUncertaintyBtn = document.getElementById('mobileUncertaintyBtn');
        if (mobileUncertaintyBtn) mobileUncertaintyBtn.addEventListener('click', async function() {
            if (typeof window.showUncertaintyCalculator !== 'function') {
                await import('./uncertainty-calculator.js');
            }
            if (typeof window.showUncertaintyCalculator === 'function') window.showUncertaintyCalculator();
            closeDrop();
        });

        var mobileImportBtn = document.getElementById('mobileImportBtn');
        if (mobileImportBtn) mobileImportBtn.addEventListener('click', function() { window.importFiles(); closeDrop(); });

        var aboutBtn = document.getElementById('aboutBtn');
        if (aboutBtn) aboutBtn.addEventListener('click', function() { window.showAboutDialog(); closeDrop(); });

        var serviceStatusBtn = document.getElementById('serviceStatusBtn');
        if (serviceStatusBtn) serviceStatusBtn.addEventListener('click', function() { window.showServiceStatusDialog(); closeDrop(); });

        var mobileVideoCallBtn = document.getElementById('mobileVideoCallBtn');
        if (mobileVideoCallBtn) mobileVideoCallBtn.addEventListener('click', function() {
            var modal = document.getElementById('videoCallModalOverlay');
            var iframe = document.getElementById('videoCallIframe');
            if (modal && iframe) {
                // 传递夜间模式参数
                var isDarkMode = window.nightMode || document.body.classList.contains('night-mode');
                var url = 'https://webrtc.yhsun.cn/' + (isDarkMode ? '?darkMode=true' : '');
                iframe.src = url;
                modal.classList.add('show');
            }
            closeDrop();
        });

        var mobileClearBtn = document.getElementById('mobileClearBtn');
        if (mobileClearBtn) mobileClearBtn.addEventListener('click', async function() {
            const confirmed = await window.customConfirm(window.i18n ? window.i18n.t('clearConfirm') : '确定要清空当前文件的内容吗？');
            if (confirmed) {
                if (window.vditor) window.vditor.setValue('');
                window.showMessage(window.i18n ? window.i18n.t('contentCleared') : '内容已清空');
            }
            closeDrop();
        });

        var mobileSettingsBtn = document.getElementById('mobileSettingsBtn');
        if (mobileSettingsBtn) mobileSettingsBtn.addEventListener('click', function() { window.showSettingsDialog(); });
        var saveFileBtn = document.getElementById('saveFileBtn');
        if (saveFileBtn) saveFileBtn.addEventListener('click', handleBottomSave);

        var mobileLoginBtn = document.getElementById('mobileLoginBtn');
        if (mobileLoginBtn) mobileLoginBtn.addEventListener('click', window.handleLoginButtonClick);
        var modeToggle = document.getElementById('modeToggle');
        if (modeToggle) modeToggle.addEventListener('click', window.toggleNightMode);

        bindDesktopButton('desktopFileBtn', function() {
            showPrimaryFileInterface();
        });
        bindDesktopButton('desktopLoginBtn', function() { window.handleLoginButtonClick(); });
        bindDesktopButton('desktopInsertBtn', function() {
            if (typeof window.showInsertPicker === 'function') window.showInsertPicker();
            else window.showInsertMenu();
        });
        bindDesktopButton('desktopAIBtn', async function() {
            if (typeof window.showAIPanel !== 'function') {
                await import('./ui/ai-assistant.js');
            }
            if (typeof window.showAIPanel === 'function') {
                window.showAIPanel();
            }
        });
        bindDesktopButton('desktopEditUndoBtn', function() {
            if (window.vditor && window.vditor.vditor && window.vditor.vditor.undo) {
                window.vditor.vditor.undo.undo(window.vditor.vditor);
            }
            closeDesktopEditDrop();
        });
        bindDesktopButton('desktopEditRedoBtn', function() {
            if (window.vditor && window.vditor.vditor && window.vditor.vditor.undo) {
                window.vditor.vditor.undo.redo(window.vditor.vditor);
            }
            closeDesktopEditDrop();
        });
        bindDesktopButton('desktopEditSaveBtn', async function() {
            await handleBottomSave();
            closeDesktopEditDrop();
        });
        bindDesktopButton('desktopSettingsBtn', function() { window.showSettingsDialog(); });
        bindDesktopButton('desktopEditBtn', function(e) {
            e.stopPropagation();
            if (desktopEditDropdown) {
                var willShowEdit = !desktopEditDropdown.classList.contains('show');
                desktopEditDropdown.classList.toggle('show');
                if (willShowEdit) {
                    var editRect = e.currentTarget.getBoundingClientRect();
                    var bodyStyles = window.getComputedStyle(document.body);
                    var toolbarOffset = parseFloat(bodyStyles.getPropertyValue('--top-toolbar-offset')) || 0;
                    var toolbarHeight = parseFloat(bodyStyles.getPropertyValue('--top-toolbar-height')) || 0;
                    desktopEditDropdown.style.position = 'fixed';
                    desktopEditDropdown.style.top = Math.max(editRect.bottom + 2, toolbarOffset + toolbarHeight + 1) + 'px';
                    desktopEditDropdown.style.left = Math.round(editRect.left) + 'px';
                    desktopEditDropdown.style.right = 'auto';
                    desktopEditDropdown.style.zIndex = '1200';
                }
            }
            closeDesktopDrop();
        });
        bindDesktopButton('desktopMoreBtn', function(e) {
            e.stopPropagation();
            if (desktopDropdown) {
                var willShowMore = !desktopDropdown.classList.contains('show');
                desktopDropdown.classList.toggle('show');
                if (willShowMore) {
                    var moreRect = e.currentTarget.getBoundingClientRect();
                    var bodyStyles = window.getComputedStyle(document.body);
                    var toolbarOffset = parseFloat(bodyStyles.getPropertyValue('--top-toolbar-offset')) || 0;
                    var toolbarHeight = parseFloat(bodyStyles.getPropertyValue('--top-toolbar-height')) || 0;
                    var moreWidth = desktopDropdown.offsetWidth || desktopDropdown.scrollWidth || 210;
                    desktopDropdown.style.position = 'fixed';
                    desktopDropdown.style.top = Math.max(moreRect.bottom + 2, toolbarOffset + toolbarHeight + 1) + 'px';
                    desktopDropdown.style.left = Math.round(moreRect.right - moreWidth) + 'px';
                    desktopDropdown.style.right = 'auto';
                    desktopDropdown.style.zIndex = '1200';
                }
            }
            closeDesktopEditDrop();
        });

        bindDesktopButton('desktopShareBtn', async function() {
            if (typeof window.showShareDialog !== 'function') {
                await import('./ui/share.js');
            }
            window.showShareDialog();
            closeDesktopDrop();
        });
        bindDesktopButton('desktopFileManagerBtn', function() { window.showFileManager(); closeDesktopDrop(); });
        bindDesktopButton('desktopFileDiffBtn', function() {
            if (typeof window.showFileDiffDialog === 'function') {
                window.showFileDiffDialog();
            }
            closeDesktopDrop();
        });
        bindDesktopButton('desktopFindBtn', function() {
            if (typeof window.showFindDialog === 'function') {
                window.showFindDialog();
            }
            closeDesktopDrop();
        });
        bindDesktopButton('desktopPrintBtn', async function() {
            if (typeof window.showPrintDialog !== 'function') {
                await import('./ui/print.js');
            }
            window.showPrintDialog();
            closeDesktopDrop();
        });
        bindDesktopButton('desktopPresentationBtn', function() { enterPresentationMode(); closeDesktopDrop(); });
        bindDesktopButton('desktopModeBtn', function() { showModeSelection(); closeDesktopDrop(); });
        bindDesktopButton('desktopOpenLocalFileBtn', async function() {
            if (typeof window.openExternalLocalFileByDialog === 'function') {
                await window.openExternalLocalFileByDialog();
            } else {
                window.showMessage(window.i18n ? window.i18n.t('localFileOpenFailed') : '打开本地文件失败', 'error');
            }
            closeDesktopDrop();
        });
        bindDesktopButton('desktopImportBtn', function() { window.importFiles(); closeDesktopDrop(); });
        bindDesktopButton('desktopExportBtn', async function() {
            if (typeof window.exportContent !== 'function') {
                await import('./ui/export.js');
            }
            window.exportContent();
            closeDesktopDrop();
        });
        bindDesktopButton('desktopClearBtn', async function() {
            const confirmed = await window.customConfirm(window.i18n ? window.i18n.t('clearConfirm') : '确定要清空当前文件的内容吗？');
            if (confirmed) {
                if (window.vditor) window.vditor.setValue('');
                window.showMessage(window.i18n ? window.i18n.t('contentCleared') : '内容已清空');
            }
            closeDesktopDrop();
        });
        bindDesktopButton('desktopAboutBtn', function() { window.showAboutDialog(); closeDesktopDrop(); });

        // 渲染底部工具栏
        window.renderBottomToolbar();
        renderDesktopToolbarShortcutLabels();
    }

    function showModeSelection() {
        var currentMode = window.vditor && window.vditor.vditor ? window.vditor.vditor.mode : 'ir';
        var nightMode = window.nightMode === true;
        var modeOptions = [
            { icon: '<i class="fas fa-eye"></i>', text: getModeName('wysiwyg'), value: 'wysiwyg', current: currentMode === 'wysiwyg' },
            { icon: '<i class="fas fa-bolt"></i>', text: getModeName('ir'), value: 'ir', current: currentMode === 'ir' },
            { icon: '<i class="fas fa-columns"></i>', text: getModeName('sv'), value: 'sv', current: currentMode === 'sv' }
        ];
        var options = modeOptions.map(function(opt) {
            return {
                icon: opt.icon,
                text: opt.text,
                action: function() { setEditorMode(opt.value); }
            };
        });
        window.showMobileActionSheet(window.i18n ? window.i18n.t('selectEditorMode') : '选择编辑器模式', options);
    }

    function setEditorMode(mode) {
        if (!window.vditor || !modeMap[mode]) return;
        if (window.isLongFileMode) {
            window.showMessage(window.i18n ? window.i18n.t('longFileModeSwitchBlocked') : '当前文件处于超长模式，暂不支持切换 Vditor 编辑模式', 'warning');
            return;
        }
        try {
            var currentContent = window.vditor.getValue();
            localStorage.setItem('vditor_editor_mode', mode);
            if (window.vditor.destroy) window.vditor.destroy();
            var newConfig = {
                height: editorConfig.height,
                width: editorConfig.width,
                placeholder: window.i18n ? window.i18n.t('startEditing') : '开始编辑...支持 Markdown 语法',
                cdn: window.electron ? './vditor' : (window.location.protocol === 'file:' ? './vditor' : '/vditor'), // 兼容桌面壳与 Web 环境的本地目录
                lang: 'en_US', // 彻底禁用中文语言文件，使用默认英语
                toolbar: ['emoji', 'br', 'bold', 'italic', 'strike', '|', 'line', 'quote', 'list', 'ordered-list', 'check', 'outdent', 'indent', 'code', 'inline-code', 'insert-after', 'insert-before', 'upload', 'link', 'table', 'record', 'edit-mode', 'both', 'preview', 'fullscreen', 'outline', 'code-theme', 'content-theme', 'export', 'info', 'help', 'br'],
                customWysiwygToolbar: function() {},
                theme: window.nightMode ? 'dark' : 'classic',
                mode: mode,
                value: currentContent,
                cache: editorConfig.cache,
                outline: editorConfig.outline,
                hint: editorConfig.hint,
                upload: editorConfig.upload,
                after: function() {
                    reinitEditorEvents();
                    reinitMenuEvents();
                    reinitMobileFeatures();
                    if (typeof window.initInlineImageTools === 'function') {
                        window.initInlineImageTools();
                    }
                    // 应用字体大小设置
                    applyFontSize(window.userSettings.fontSize);
                    // 应用大纲视图设置
                    applyOutline(window.userSettings.showOutline);
                }
            };
            window.vditor = new Vditor('vditor', newConfig);
            window.showMessage((window.i18n ? window.i18n.t('switchedTo') : '已切换到') + modeMap[mode].name, 'success');
            var mobileModeBtn = document.getElementById('mobileModeBtn');
            if (mobileModeBtn) mobileModeBtn.innerHTML = '<i class="' + modeMap[mode].icon + '"></i> <span>当前: ' + modeMap[mode].name + '</span>';
        } catch (error) {
            console.error('切换编辑器模式失败', error);
            window.showMessage((window.i18n ? window.i18n.t('switchFailed') : '切换失败: ') + error.message, 'error');
            window.vditor = new Vditor('vditor', editorConfig);
        }
    }

    function reinitEditorEvents() {
        if (window.vditor && window.vditor.vditor && window.vditor.vditor.ir) {
            window.vditor.vditor.ir.element.addEventListener('input', function() {
                if (window.currentFileId) {
                    window.unsavedChanges[window.currentFileId] = true;
                    window.startAutoSave();
                }
            });
        }

        initSlashCommandRuntime();
    }

    function reinitMenuEvents() {
        var dropdown = document.getElementById('mobileDropdown');
        function closeDrop() { if (dropdown) dropdown.classList.remove('show'); }

        var list = [

            { id: 'mobileShareBtn', fn: async function() {
                if (typeof window.showShareDialog !== 'function') {
                    await import('./ui/share.js');
                }
                window.showShareDialog();
                closeDrop();
            } },
            { id: 'mobileFileManagerBtn', fn: function() { window.showFileManager(); closeDrop(); } },
            { id: 'mobileFileDiffBtn', fn: function() { if (typeof window.showFileDiffDialog === 'function') window.showFileDiffDialog(); closeDrop(); } },
            { id: 'mobileFindBtn', fn: function() { if (typeof window.showFindDialog === 'function') window.showFindDialog(); closeDrop(); } },
            { id: 'mobilePrintBtn', fn: async function() {
                if (typeof window.showPrintDialog !== 'function') {
                    await import('./ui/print.js');
                }
                window.showPrintDialog();
                closeDrop();
            } },
            { id: 'mobilePresentationBtn', fn: function() { enterPresentationMode(); closeDrop(); } },
            { id: 'mobileMenuBtn', fn: function(e) { e.stopPropagation(); if (dropdown) dropdown.classList.toggle('show'); } },
            { id: 'mobileModeBtn', fn: function() { showModeSelection(); closeDrop(); } },
            { id: 'mobileOpenLocalFileBtn', fn: async function() {
                if (typeof window.openExternalLocalFileByDialog === 'function') {
                    await window.openExternalLocalFileByDialog();
                }
                closeDrop();
            } },
            { id: 'mobileExportBtn', fn: async function() {
                if (typeof window.exportContent !== 'function') {
                    await import('./ui/export.js');
                }
                window.exportContent();
                closeDrop();
            } },
            { id: 'mobileUncertaintyBtn', fn: async function() {
                if (typeof window.showUncertaintyCalculator !== 'function') {
                    await import('./uncertainty-calculator.js');
                }
                if (typeof window.showUncertaintyCalculator === 'function') window.showUncertaintyCalculator();
                closeDrop();
            } },
            { id: 'mobileVideoCallBtn', fn: function() {
                var modal = document.getElementById('videoCallModalOverlay');
                var iframe = document.getElementById('videoCallIframe');
                if (modal && iframe) {
                    // 传递夜间模式参数
                    var isDarkMode = window.nightMode || document.body.classList.contains('night-mode');
                    var url = 'https://webrtc.yhsun.cn/' + (isDarkMode ? '?darkMode=true' : '');
                    iframe.src = url;
                    modal.classList.add('show');
                }
                closeDrop();
            } },
            { id: 'mobileClearBtn', fn: async function() { const confirmed = await window.customConfirm(window.i18n ? window.i18n.t('clearConfirm') : '确定要清空当前文件的内容吗？'); if (confirmed) { if (window.vditor) window.vditor.setValue(''); window.showMessage(window.i18n ? window.i18n.t('contentCleared') : '内容已清空'); } closeDrop(); } },
            { id: 'serviceStatusBtn', fn: function() { window.showServiceStatusDialog(); closeDrop(); } },
            // mobileSettingsBtn 已移到顶部工具栏
            { id: 'aboutBtn', fn: function() { window.showAboutDialog(); closeDrop(); } }
        ];
        list.forEach(function(b) {
            var el = document.getElementById(b.id);
            if (el) {
                var neu = el.cloneNode(true);
                el.parentNode.replaceChild(neu, el);
                neu.addEventListener('click', b.fn);
            }
        });

        // 演示模式按钮仅在桌面端显示
        var mobilePresentationBtn = document.getElementById('mobilePresentationBtn');
        if (mobilePresentationBtn) {
            if (window.editorInterfaceMode === 'mobile') {
                mobilePresentationBtn.style.display = 'none';
            } else {
                mobilePresentationBtn.style.display = '';
            }
        }
    }

    function reinitMobileFeatures() {
        var btns = [
            { id: 'mobileLoginBtn', fn: window.handleLoginButtonClick },
            { id: 'mobileSettingsBtn', fn: window.showSettingsDialog },
            { id: 'saveFileBtn', fn: handleBottomSave },
            { id: 'modeToggle', fn: window.toggleNightMode },
            { id: 'mobileFileBtn', fn: showPrimaryFileInterface }
        ];
        btns.forEach(function(b) {
            var el = document.getElementById(b.id);
            if (el) {
                var neu = el.cloneNode(true);
                el.parentNode.replaceChild(neu, el);
                neu.addEventListener('click', b.fn);
            }
        });

        // 重新渲染底部工具栏
        window.renderBottomToolbar();
        renderDesktopToolbarShortcutLabels();
    }

    var closeHistoryBtn = document.getElementById('closeHistoryBtn');
    if (closeHistoryBtn) closeHistoryBtn.addEventListener('click', function() { var m = document.getElementById('historyModalOverlay'); if (m) m.classList.remove('show'); });
    var historyModalOverlay = document.getElementById('historyModalOverlay');
    if (historyModalOverlay) historyModalOverlay.addEventListener('click', function(e) { if (e.target === this) this.classList.remove('show'); });

    // 页面离开/切后台相关保存逻辑统一由 appLifecycle 管理，避免重复触发。

    // 渲染底部工具栏
    window.renderBottomToolbar = function() {
        var toolbarContainer = document.getElementById('bottomBarButtons');
        if (!toolbarContainer) return;

        toolbarContainer.innerHTML = '';
        var buttons = window.userSettings.toolbarButtons || window.defaultToolbarButtons;
        var visibleButtons = getVisibleToolbarButtons();

        buttons.forEach(function(btnId) {
            var btnConfig = visibleButtons.find(function(b) { return b.id === btnId; });
            if (btnConfig) {
                var btn = document.createElement('button');
                btn.className = 'bottom-btn';
                btn.id = btnConfig.id;
                var buttonText = (window.i18n && btnConfig.textKey) ? window.i18n.t(btnConfig.textKey) : btnConfig.text;
                btn.innerHTML = '<i class="' + btnConfig.icon + '"></i><span>' + buttonText + '</span>';
                btn.addEventListener('click', btnConfig.fn);
                toolbarContainer.appendChild(btn);
            }
        });
    };

    // 显示设置对话框
    window.showSettingsDialog = function() {
        var modal = document.getElementById('settingsModalOverlay');
        if (!modal) return;

        // 设置当前编辑器模式
        var currentEditorMode = localStorage.getItem('vditor_editor_mode') || 'wysiwyg';
        var modeRadios = document.getElementsByName('editorMode');
        for (var i = 0; i < modeRadios.length; i++) {
            if (modeRadios[i].value === currentEditorMode) {
                modeRadios[i].checked = true;
            }
        }

        // 设置当前主题模式
        var currentThemeMode = window.userSettings.themeMode || 'system';
        var themeRadios = document.getElementsByName('themeMode');
        for (var i = 0; i < themeRadios.length; i++) {
            if (themeRadios[i].value === currentThemeMode) {
                themeRadios[i].checked = true;
            }
        }

        // 设置界面样式模式
        var currentUiMode = window.userSettings.uiMode || 'auto';
        var uiModeRadios = document.getElementsByName('uiMode');
        for (var i = 0; i < uiModeRadios.length; i++) {
            if (uiModeRadios[i].value === currentUiMode) {
                uiModeRadios[i].checked = true;
            }
        }

        // 设置当前语言
        if (window.i18n) {
            var currentLang = window.i18n.getLanguage();
            var langRadios = document.getElementsByName('language');
            for (var i = 0; i < langRadios.length; i++) {
                if (langRadios[i].value === currentLang) {
                    langRadios[i].checked = true;
                }
            }
        }

        // 设置字体大小
        var fontSizeSelect = document.getElementById('fontSizeSelect');
        if (fontSizeSelect) {
            fontSizeSelect.value = window.userSettings.fontSize || '16px';
        }

        // 设置大纲视图
        var showOutlineCheckbox = document.getElementById('showOutlineCheckbox');
        if (showOutlineCheckbox) {
            showOutlineCheckbox.checked = window.userSettings.showOutline || false;
        }

        var debugModeCheckbox = document.getElementById('debugModeCheckbox');
        if (debugModeCheckbox) {
            debugModeCheckbox.checked = window.userSettings.enableDebugMode === true;
        }

        var slashCommandEnabledCheckbox = document.getElementById('slashCommandEnabledCheckbox');
        if (slashCommandEnabledCheckbox) {
            slashCommandEnabledCheckbox.checked = window.userSettings.enableSlashCommand !== false;
        }

        var slashCommandActivationKeySelect = document.getElementById('slashCommandActivationKeySelect');
        if (slashCommandActivationKeySelect) {
            slashCommandActivationKeySelect.value = window.userSettings.slashCommandActivationKey || 'Tab';
        }

        // 设置存储位置
        var currentStorageLoc = window.userSettings.storageLocation || 'cloud';
        var storageRadios = document.getElementsByName('storageLocation');
        for (var i = 0; i < storageRadios.length; i++) {
            if (storageRadios[i].value === currentStorageLoc) {
                storageRadios[i].checked = true;
            }
        }

        // 设置默认文件打开方式
        var currentDefaultFileOpening = window.userSettings.defaultFileOpening || 'lastEdited';
        var defaultFileOpeningRadios = document.getElementsByName('defaultFileOpening');
        for (var i = 0; i < defaultFileOpeningRadios.length; i++) {
            if (defaultFileOpeningRadios[i].value === currentDefaultFileOpening) {
                defaultFileOpeningRadios[i].checked = true;
            }
        }

        // 设置默认排序方式
        var currentDefaultSorting = window.userSettings.defaultSorting || 'modifiedTime';
        var defaultSortingRadios = document.getElementsByName('defaultSorting');
        for (var i = 0; i < defaultSortingRadios.length; i++) {
            if (defaultSortingRadios[i].value === currentDefaultSorting) {
                defaultSortingRadios[i].checked = true;
            }
        }

        var mdAssociationSetting = document.getElementById('mdAssociationSetting');
        var mdAssociationCheckbox = document.getElementById('mdAssociationCheckbox');
        if (mdAssociationSetting && mdAssociationCheckbox) {
            if (window.electron) {
                mdAssociationSetting.style.display = '';
                mdAssociationCheckbox.checked = !!window.userSettings.mdFileAssociationEnabled;
            } else {
                mdAssociationSetting.style.display = 'none';
            }
        }

        // 生成工具栏按钮选择
        renderToolbarButtonSettings();
        renderKeyboardShortcutSettings();

        // 每次打开设置都默认折叠空间管理详情
        var slashCommandDetails = document.getElementById('slashCommandDetails');
        if (slashCommandDetails) {
            slashCommandDetails.open = false;
        }
        var keyboardShortcutsDetails = document.getElementById('keyboardShortcutsDetails');
        if (keyboardShortcutsDetails) {
            keyboardShortcutsDetails.open = false;
        }
        var toolbarButtonsDetails = document.getElementById('toolbarButtonsDetails');
        if (toolbarButtonsDetails) {
            toolbarButtonsDetails.open = false;
        }

        // 每次打开设置都默认折叠空间管理详情
        var storageManagementDetails = document.getElementById('storageManagementDetails');
        var storageUsagePanel = document.getElementById('storageUsagePanel');
        if (storageManagementDetails) {
            storageManagementDetails.open = false;
        }
        if (storageUsagePanel) {
            storageUsagePanel.style.display = 'none';
        }

        settingsDialogInitialSnapshot = buildSettingsDialogSnapshot();

        modal.classList.add('show');
    };

    function formatStorageBytes(bytes) {
        if (typeof bytes !== 'number' || !isFinite(bytes) || bytes < 0) {
            return window.i18n ? window.i18n.t('storageUsageUnavailable') : 'Unavailable';
        }
        if (bytes === 0) return '0 B';
        var units = ['B', 'KB', 'MB', 'GB', 'TB'];
        var index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
        var value = bytes / Math.pow(1024, index);
        return value.toFixed(value >= 100 || index === 0 ? 0 : 1) + ' ' + units[index];
    }

    function estimateLocalStorageBytes() {
        try {
            var total = 0;
            for (var i = 0; i < localStorage.length; i++) {
                var key = localStorage.key(i);
                if (!key) continue;
                var value = localStorage.getItem(key) || '';
                total += new Blob([key]).size + new Blob([value]).size;
            }
            return total;
        } catch (error) {
            console.warn('[StorageManagement] estimateLocalStorageBytes failed:', error);
            return null;
        }
    }

    function estimateCookieBytes() {
        try {
            return new Blob([document.cookie || '']).size;
        } catch (error) {
            console.warn('[StorageManagement] estimateCookieBytes failed:', error);
            return null;
        }
    }

    async function estimateCacheStorageBytesFromEntries() {
        if (!('caches' in window)) return 0;
        var total = 0;
        var cacheNames = await caches.keys();

        for (var i = 0; i < cacheNames.length; i++) {
            var cache = await caches.open(cacheNames[i]);
            var requests = await cache.keys();

            for (var j = 0; j < requests.length; j++) {
                var response = await cache.match(requests[j]);
                if (!response) continue;

                var contentLength = parseInt(response.headers.get('content-length') || '0', 10);
                if (contentLength > 0) {
                    total += contentLength;
                    continue;
                }

                try {
                    var clonedResponse = response.clone();
                    var buffer = await clonedResponse.arrayBuffer();
                    total += buffer.byteLength || 0;
                } catch (error) {
                    // 某些响应体不可读取时忽略，继续统计其余条目
                }
            }
        }

        return total;
    }

    async function getStorageEstimateDetails() {
        if (!navigator.storage || !navigator.storage.estimate) return null;
        try {
            return await navigator.storage.estimate();
        } catch (error) {
            console.warn('[StorageManagement] navigator.storage.estimate failed:', error);
            return null;
        }
    }

    async function getServiceWorkerRegistrationCount() {
        if (!('serviceWorker' in navigator)) return 0;
        try {
            var registrations = await navigator.serviceWorker.getRegistrations();
            return registrations.length;
        } catch (error) {
            console.warn('[StorageManagement] getRegistrations failed:', error);
            return 0;
        }
    }

    function renderStorageUsageRows(rows) {
        var listEl = document.getElementById('storageUsageList');
        if (!listEl) return;

        listEl.innerHTML = rows.map(function(row) {
            return '<div style="display:flex;justify-content:space-between;gap:8px;padding:6px 8px;border:1px solid #e8e8e8;border-radius:6px;background:#fff;">' +
                '<span style="color:#666;">' + row.label + '</span>' +
                '<strong style="font-weight:600;">' + row.value + '</strong>' +
                '</div>';
        }).join('');
    }

    async function updateStorageUsageDetails() {
        var usagePanelEl = document.getElementById('storageUsagePanel');
        var loadingEl = document.getElementById('storageUsageLoading');
        if (!usagePanelEl || !loadingEl) return;

        usagePanelEl.style.display = 'block';
        loadingEl.style.display = 'block';

        var t = function(key) { return window.i18n ? window.i18n.t(key) : key; };
        loadingEl.textContent = t('storageUsageCalculating');

        try {
            var estimate = await getStorageEstimateDetails();
            var details = estimate && estimate.usageDetails ? estimate.usageDetails : {};

            var localStorageBytes = estimateLocalStorageBytes();
            var indexedDBBytes = (typeof details.indexedDB === 'number') ? details.indexedDB : null;
            var cacheStorageBytes = null;
            if (typeof details.caches === 'number') {
                cacheStorageBytes = details.caches;
            } else if (typeof details.cacheStorage === 'number') {
                cacheStorageBytes = details.cacheStorage;
            } else {
                cacheStorageBytes = await estimateCacheStorageBytesFromEntries();
            }

            var cookieBytes = estimateCookieBytes();
            var serviceWorkerCount = await getServiceWorkerRegistrationCount();

            renderStorageUsageRows([
                { label: t('storageLocalStorage'), value: formatStorageBytes(localStorageBytes) },
                { label: t('storageIndexedDBUsage'), value: formatStorageBytes(indexedDBBytes) },
                { label: t('storageCacheStorageUsage'), value: formatStorageBytes(cacheStorageBytes) },
                { label: t('storageCookiesUsage'), value: formatStorageBytes(cookieBytes) },
                { label: t('storageServiceWorkersUsage'), value: t('storageServiceWorkerCount').replace('{count}', String(serviceWorkerCount)) }
            ]);
            loadingEl.style.display = 'none';
        } catch (error) {
            console.error('[StorageManagement] updateStorageUsageDetails failed:', error);
            renderStorageUsageRows([
                { label: t('storageLocalStorage'), value: t('storageUsageUnavailable') },
                { label: t('storageIndexedDBUsage'), value: t('storageUsageUnavailable') },
                { label: t('storageCacheStorageUsage'), value: t('storageUsageUnavailable') },
                { label: t('storageCookiesUsage'), value: t('storageUsageUnavailable') },
                { label: t('storageServiceWorkersUsage'), value: t('storageUsageUnavailable') }
            ]);
            loadingEl.style.display = 'none';
        }
    }

    function initStorageManagementPanel() {
        var detailsEl = document.getElementById('storageManagementDetails');
        if (!detailsEl) return;

        detailsEl.addEventListener('toggle', function() {
            if (detailsEl.open) {
                updateStorageUsageDetails();
                return;
            }

            var usagePanelEl = document.getElementById('storageUsagePanel');
            if (usagePanelEl) usagePanelEl.style.display = 'none';
        });
    }

    async function clearAllCacheStorage() {
        if (!('caches' in window)) return;

        if ('serviceWorker' in navigator) {
            var registration = await navigator.serviceWorker.getRegistration('/');
            if (registration && registration.active) {
                await new Promise(function(resolve, reject) {
                    var channel = new MessageChannel();
                    var timeoutId = setTimeout(function() {
                        reject(new Error('Service Worker clear cache timeout'));
                    }, 2500);

                    channel.port1.onmessage = function(event) {
                        clearTimeout(timeoutId);
                        var data = event.data || {};
                        if (data.type === 'CLEAR_CACHE_ACK' && data.ok) {
                            resolve();
                            return;
                        }
                        reject(new Error(data.message || 'Service Worker clear cache failed'));
                    };

                    registration.active.postMessage({ type: 'CLEAR_CACHE_STORAGE' }, [channel.port2]);
                });
            }
        }

        // Window context fallback/second-pass to ensure all cache buckets are removed.
        var cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(function(name) { return caches.delete(name); }));
    }

    async function clearAllIndexedDB() {
        if (!('indexedDB' in window)) return;

        if (indexedDB.databases) {
            var dbs = await indexedDB.databases();
            await Promise.all((dbs || []).map(function(dbInfo) {
                if (!dbInfo || !dbInfo.name) return Promise.resolve();
                return new Promise(function(resolve, reject) {
                    var request = indexedDB.deleteDatabase(dbInfo.name);
                    request.onsuccess = function() { resolve(); };
                    request.onerror = function() { reject(request.error || new Error('Delete IndexedDB failed')); };
                    request.onblocked = function() { resolve(); };
                });
            }));
            return;
        }

        await new Promise(function(resolve, reject) {
            var fallbackRequest = indexedDB.deleteDatabase('MarkdownEditorFiles');
            fallbackRequest.onsuccess = function() { resolve(); };
            fallbackRequest.onerror = function() { reject(fallbackRequest.error || new Error('Delete IndexedDB failed')); };
            fallbackRequest.onblocked = function() { resolve(); };
        });
    }

    async function clearAllServiceWorkers() {
        if (!('serviceWorker' in navigator)) return;
        var registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map(function(registration) { return registration.unregister(); }));
    }

    function clearAllCookies() {
        var cookies = document.cookie ? document.cookie.split(';') : [];
        var hostname = window.location.hostname;
        var domainParts = hostname.split('.');
        var domainVariants = [''];

        if (domainParts.length > 1) {
            for (var i = 0; i < domainParts.length - 1; i++) {
                domainVariants.push('.' + domainParts.slice(i).join('.'));
            }
        }

        cookies.forEach(function(cookie) {
            var cookieName = cookie.split('=')[0].trim();
            if (!cookieName) return;

            domainVariants.forEach(function(domain) {
                var domainPart = domain ? '; domain=' + domain : '';
                document.cookie = cookieName + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/' + domainPart;
            });
        });
    }

    async function bindStorageManagementAction(buttonId, actionFn, confirmKey, successKey, failKey) {
        var button = document.getElementById(buttonId);
        if (!button) return;

        button.addEventListener('click', async function() {
            try {
                var confirmMessage = window.i18n ? window.i18n.t(confirmKey) : '确认执行该操作吗？';
                var confirmed = await window.customConfirm(confirmMessage);
                if (!confirmed) return;

                await actionFn();
                window.showMessage(window.i18n ? window.i18n.t(successKey) : '操作成功', 'success');
                var detailsEl = document.getElementById('storageManagementDetails');
                if (detailsEl && detailsEl.open) {
                    updateStorageUsageDetails();
                }
            } catch (error) {
                console.error('[StorageManagement] Action failed:', error);
                window.showMessage(window.i18n ? window.i18n.t(failKey) : '操作失败', 'error');
            }
        });
    }

    bindStorageManagementAction('clearCacheStorageBtn', clearAllCacheStorage, 'confirmClearCacheStorage', 'clearCacheStorageSuccess', 'clearCacheStorageFailed');
    bindStorageManagementAction('clearIndexedDBBtn', clearAllIndexedDB, 'confirmClearIndexedDB', 'clearIndexedDBSuccess', 'clearIndexedDBFailed');
    bindStorageManagementAction('clearServiceWorkerBtn', clearAllServiceWorkers, 'confirmClearServiceWorker', 'clearServiceWorkerSuccess', 'clearServiceWorkerFailed');
    bindStorageManagementAction('clearCookiesBtn', clearAllCookies, 'confirmClearCookies', 'clearCookiesSuccess', 'clearCookiesFailed');
    initStorageManagementPanel();

    // 保存设置
    var saveSettingsBtn = document.getElementById('saveSettingsBtn');
    if(saveSettingsBtn) saveSettingsBtn.addEventListener('click', function() {
        var newSettings = {
            toolbarButtons: [],
            themeMode: 'system',
            uiMode: 'auto',
            fontSize: '16px',
            showOutline: false,
            enableDebugMode: false,
            enableSlashCommand: window.userSettings.enableSlashCommand !== false,
            slashCommandActivationKey: window.userSettings.slashCommandActivationKey || 'Tab',
            keyboardShortcuts: getEffectiveKeyboardShortcuts(window.userSettings),
            mdFileAssociationEnabled: window.userSettings.mdFileAssociationEnabled,
            storageLocation: 'cloud'
        };

        // 获取选中的编辑器模式
        var modeRadios = document.getElementsByName('editorMode');
        for (var i = 0; i < modeRadios.length; i++) {
            if (modeRadios[i].checked) {
                var newMode = modeRadios[i].value;
                if (newMode !== localStorage.getItem('vditor_editor_mode')) {
                    setEditorMode(newMode);
                }
                break;
            }
        }

        // 获取选中的主题模式
        var themeRadios = document.getElementsByName('themeMode');
        for (var i = 0; i < themeRadios.length; i++) {
            if (themeRadios[i].checked) {
                newSettings.themeMode = themeRadios[i].value;
                break;
            }
        }

        // 获取界面样式模式
        var uiModeRadios = document.getElementsByName('uiMode');
        for (var i = 0; i < uiModeRadios.length; i++) {
            if (uiModeRadios[i].checked) {
                newSettings.uiMode = uiModeRadios[i].value;
                break;
            }
        }

        // 获取选中的语言
        var languageChanged = false;
        var newLanguage = null;
        if (window.i18n) {
            var langRadios = document.getElementsByName('language');
            for (var i = 0; i < langRadios.length; i++) {
                if (langRadios[i].checked) {
                    newLanguage = langRadios[i].value;
                    if (newLanguage !== window.i18n.getLanguage()) {
                        languageChanged = true;
                    }
                    break;
                }
            }
        }

        // 获取选中的工具栏按钮
        var toolbarCheckboxes = document.querySelectorAll('#toolbarButtonsSettings input[type="checkbox"]');
        toolbarCheckboxes.forEach(function(cb) {
            if (cb.checked) {
                newSettings.toolbarButtons.push(cb.value);
            }
        });

        // 获取字体大小
        var fontSizeSelect = document.getElementById('fontSizeSelect');
        if (fontSizeSelect) {
            newSettings.fontSize = fontSizeSelect.value;
        }

        // 获取大纲视图设置
        var showOutlineCheckbox = document.getElementById('showOutlineCheckbox');
        if (showOutlineCheckbox) {
            newSettings.showOutline = showOutlineCheckbox.checked;
        }

        var debugModeCheckbox = document.getElementById('debugModeCheckbox');
        if (debugModeCheckbox) {
            newSettings.enableDebugMode = debugModeCheckbox.checked;
        }

        var slashCommandEnabledCheckbox = document.getElementById('slashCommandEnabledCheckbox');
        if (slashCommandEnabledCheckbox) {
            newSettings.enableSlashCommand = slashCommandEnabledCheckbox.checked;
        }

        var slashCommandActivationKeySelect = document.getElementById('slashCommandActivationKeySelect');
        if (slashCommandActivationKeySelect) {
            newSettings.slashCommandActivationKey = slashCommandActivationKeySelect.value || 'Tab';
        }

        var mdAssociationCheckbox = document.getElementById('mdAssociationCheckbox');
        if (mdAssociationCheckbox) {
            newSettings.mdFileAssociationEnabled = mdAssociationCheckbox.checked;
        }

        // 获取选中的存储位置
        var storageRadios = document.getElementsByName('storageLocation');
        for (var i = 0; i < storageRadios.length; i++) {
            if (storageRadios[i].checked) {
                newSettings.storageLocation = storageRadios[i].value;
                break;
            }
        }

        // 获取选中的默认文件打开方式
        var defaultFileOpeningRadios = document.getElementsByName('defaultFileOpening');
        for (var i = 0; i < defaultFileOpeningRadios.length; i++) {
            if (defaultFileOpeningRadios[i].checked) {
                newSettings.defaultFileOpening = defaultFileOpeningRadios[i].value;
                break;
            }
        }

        // 获取选中的默认排序方式
        var defaultSortingRadios = document.getElementsByName('defaultSorting');
        for (var i = 0; i < defaultSortingRadios.length; i++) {
            if (defaultSortingRadios[i].checked) {
                newSettings.defaultSorting = defaultSortingRadios[i].value;
                break;
            }
        }

        var keyboardShortcuts = collectKeyboardShortcutsFromSettings();
        if (!keyboardShortcuts) {
            return;
        }
        newSettings.keyboardShortcuts = keyboardShortcuts;

        // 验证按钮数量
        if (newSettings.toolbarButtons.length < 5 || newSettings.toolbarButtons.length > 7) {
            window.customAlert(window.i18n ? window.i18n.t('buttonCountError') : '底部工具栏按钮数量必须在 5 到 7 个之间');
            return;
        }

        // 检查是否需要重新初始化编辑器来应用大纲视图设置
        var needReinitForOutline = window.userSettings.showOutline !== newSettings.showOutline;

        // 保存设置
        window.userSettings = newSettings;
        localStorage.setItem('vditor_settings', JSON.stringify(window.userSettings));

        if (window.electron && typeof window.electron.setMdAssociationEnabled === 'function') {
            window.electron.setMdAssociationEnabled(!!newSettings.mdFileAssociationEnabled).catch(function(error) {
                console.warn('Failed to persist md association setting:', error);
            });
        }

        // 应用字体大小设置
        applyFontSize(newSettings.fontSize);

        // 应用主题
        var oldNightMode = window.nightMode;
        if (newSettings.themeMode === 'system') {
            if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
                window.nightMode = true;
            } else {
                window.nightMode = false;
            }
        } else if (newSettings.themeMode === 'dark') {
            window.nightMode = true;
        } else {
            window.nightMode = false;
        }

        // 应用语言更改
        if (languageChanged && window.i18n && newLanguage) {
            window.i18n.setLanguage(newLanguage);
            // 更新 modeMap
            modeMap = {
                wysiwyg: { name: getModeName('wysiwyg'), icon: 'fas fa-eye' },
                ir: { name: getModeName('ir'), icon: 'fas fa-bolt' },
                sv: { name: getModeName('sv'), icon: 'fas fa-columns' }
            };
        }

        if (oldNightMode !== window.nightMode || languageChanged || needReinitForOutline) {
            settingsDialogInitialSnapshot = null;
            window.location.reload(); // 重新加载以应用主题、语言或大纲视图更改
        } else {
            applyTranslations();
            applyInterfaceMode(window.userSettings);
            window.renderBottomToolbar();
            initMobileFeatures();
            initSlashCommandRuntime();
            applyDebugModeSetting(window.userSettings.enableDebugMode, true);
            // 重新加载文件列表以应用新的排序设置
            if (window.loadFiles) window.loadFiles();
            settingsDialogInitialSnapshot = null;
            document.getElementById('settingsModalOverlay').classList.remove('show');
            window.showMessage(window.i18n ? window.i18n.t('settingsSaved') : '设置已保存', 'success');
        }
    });

    var cancelSettingsBtn = document.getElementById('cancelSettingsBtn');
    if(cancelSettingsBtn) cancelSettingsBtn.addEventListener('click', function() {
        requestCloseSettingsDialog();
    });

    // 关于对话框
    function isNativeClientRuntime() {
        var isElectron = !!(window.electron || (window.process && window.process.type));
        var isTauri = !!(window.desktopRuntime && window.desktopRuntime.type === 'tauri');
        return isTauri || isElectron;
    }

    function getClientDownloadLinks() {
        if (typeof window.getClientDownloadLinks === 'function') {
            return window.getClientDownloadLinks();
        }
        return {
            android: 'https://static.yhsun.cn/android/easypocketmd_android.apk',
            windows: 'https://static.yhsun.cn/tauri/win/easypocketmd_windows.exe',
            macos: 'https://static.yhsun.cn/tauri/macos/easypocketmd_macos.dmg',
            linuxAppImage: 'https://static.yhsun.cn/tauri/linux/easypocketmd_linux.appimage',
            linuxDeb: 'https://static.yhsun.cn/tauri/linux/easypocketmd_linux.deb'
        };
    }

    function getRecommendedDownloadKey() {
        var ua = String(navigator.userAgent || '').toLowerCase();
        if (ua.indexOf('android') !== -1) return 'android';
        if (ua.indexOf('win') !== -1) return 'windows';
        if (ua.indexOf('mac') !== -1) return 'macos';
        if (ua.indexOf('linux') !== -1) {
            return 'linuxDeb';
        }
        return 'windows';
    }

    function setAnchorHref(id, href) {
        var el = document.getElementById(id);
        if (!el || !href) return;
        el.setAttribute('href', href);
    }

    function getAboutDownloadConfig() {
        return {
            android: { id: 'aboutDownloadAndroidBtn', textKey: 'downloadAndroidApk' },
            windows: { id: 'aboutDownloadWindowsBtn', textKey: 'downloadWindowsExe' },
            macos: { id: 'aboutDownloadMacBtn', textKey: 'downloadMacDmg' },
            linuxAppImage: { id: 'aboutDownloadLinuxAppImageBtn', textKey: 'downloadLinuxAppImage' },
            linuxDeb: { id: 'aboutDownloadLinuxDebBtn', textKey: 'downloadLinuxDeb' }
        };
    }

    function getAboutDownloadLabelByKey(key) {
        var config = getAboutDownloadConfig()[key];
        if (!config) return window.i18n ? window.i18n.t('downloadRecommendedClient') : '下载推荐客户端';
        if (window.i18n && typeof window.i18n.t === 'function') {
            return window.i18n.t(config.textKey);
        }
        var fallback = {
            downloadAndroidApk: '下载 Android APK',
            downloadWindowsExe: '下载 Windows 安装包',
            downloadMacDmg: '下载 macOS 安装包',
            downloadLinuxAppImage: '下载 Linux AppImage',
            downloadLinuxDeb: '下载 Linux .deb'
        };
        return fallback[config.textKey] || '下载推荐客户端';
    }

    function updateAboutRuntimeSection() {
        var nativeSection = document.getElementById('aboutNativeUpdateSection');
        var browserSection = document.getElementById('aboutBrowserDownloadSection');
        var isNative = isNativeClientRuntime();

        if (nativeSection) nativeSection.style.display = isNative ? '' : 'none';
        if (browserSection) browserSection.style.display = isNative ? 'none' : '';

        var links = getClientDownloadLinks();
        var downloadConfig = getAboutDownloadConfig();
        Object.keys(downloadConfig).forEach(function(key) {
            var cfg = downloadConfig[key];
            setAnchorHref(cfg.id, links[key]);
        });

        var preferredKey = getRecommendedDownloadKey();
        var preferredHref = links[preferredKey] || links.windows;
        var recommendedBtn = document.getElementById('aboutRecommendedDownloadBtn');
        if (recommendedBtn) {
            recommendedBtn.setAttribute('href', preferredHref);
            var textSpan = recommendedBtn.querySelector('span');
            if (textSpan) {
                textSpan.textContent = getAboutDownloadLabelByKey(preferredKey);
            }
        }

        Object.keys(downloadConfig).forEach(function(key) {
            var btn = document.getElementById(downloadConfig[key].id);
            if (!btn) return;
            btn.style.display = key === preferredKey ? 'none' : '';
        });
    }

    function updateAboutVersionDisplay() {
        var versionLabel = document.getElementById('currentVersionValue');
        if (!versionLabel) return;
        var version = typeof window.getCurrentAppVersion === 'function'
            ? window.getCurrentAppVersion()
            : (typeof __APP_PACKAGE_VERSION__ === 'string' ? __APP_PACKAGE_VERSION__ : '0.0.0');
        versionLabel.textContent = version || '0.0.0';
    }

    var checkUpdateBtn = document.getElementById('checkUpdateBtn');
    if (checkUpdateBtn) {
        checkUpdateBtn.addEventListener('click', async function() {
            var btn = this;
            if (btn.disabled) return;

            var textSpan = btn.querySelector('span');
            var originalText = textSpan ? textSpan.textContent : '';
            var checkingText = window.i18n ? window.i18n.t('checkingUpdate') : '正在检测...';

            btn.disabled = true;
            if (textSpan) textSpan.textContent = checkingText;

            try {
                if (typeof window.checkNativeAppVersionUpdate !== 'function') {
                    throw new Error('version checker unavailable');
                }

                var result = await window.checkNativeAppVersionUpdate({ force: true });
                if (result && result.code === 200 && result.data && result.data.status === 'already-latest') {
                    window.showMessage(window.i18n ? window.i18n.t('alreadyLatestVersion') : '当前已是最新版本', 'success');
                } else if (!result || result.code !== 200) {
                    window.showMessage(window.i18n ? window.i18n.t('checkUpdateFailed') : '检测更新失败，请稍后重试', 'error');
                }
            } catch (error) {
                console.warn('Manual update check failed:', error);
                window.showMessage(window.i18n ? window.i18n.t('checkUpdateFailed') : '检测更新失败，请稍后重试', 'error');
            } finally {
                btn.disabled = false;
                if (textSpan) {
                    textSpan.textContent = window.i18n ? window.i18n.t('checkUpdate') : (originalText || '检测更新');
                }
            }
        });
    }

    window.showAboutDialog = function() {
        var modal = document.getElementById('aboutModalOverlay');
        updateAboutRuntimeSection();
        updateAboutVersionDisplay();
        if (modal) modal.classList.add('show');
    };

    var closeAboutBtn = document.getElementById('closeAboutBtn');
    if (closeAboutBtn) closeAboutBtn.addEventListener('click', function() {
        document.getElementById('aboutModalOverlay').classList.remove('show');
    });

    // 服务状态对话框
    window.showServiceStatusDialog = function() {
        var modal = document.getElementById('serviceStatusModalOverlay');
        if (modal) {
            modal.classList.add('show');
            loadServiceStatus();
        }
    };

    var closeServiceStatusBtn = document.getElementById('closeServiceStatusBtn');
    if (closeServiceStatusBtn) closeServiceStatusBtn.addEventListener('click', function() {
        document.getElementById('serviceStatusModalOverlay').classList.remove('show');
    });

    var serviceStatusModalOverlay = document.getElementById('serviceStatusModalOverlay');
    if (serviceStatusModalOverlay) serviceStatusModalOverlay.addEventListener('click', function(e) {
        if (e.target === this) this.classList.remove('show');
    });

    // 加载服务状态
    async function loadServiceStatus() {
        var listContainer = document.getElementById('serviceStatusList');
        if (!listContainer) return;

        // 显示加载状态
        listContainer.innerHTML = '<div class="service-status-loading" style="text-align:center;padding:30px;color:#999;"><i class="fas fa-spinner fa-spin" style="font-size:24px;margin-bottom:10px;"></i><p>' + (window.i18n ? window.i18n.t('loadingServiceStatus') : '正在加载服务状态...') + '</p></div>';

        try {
            // 获取Gatus监控数据
            // 默认使用相对路径，可以通过配置覆盖
            var gatusEndpoint = window.GATUS_ENDPOINT || '/api/v1/endpoints/statuses';
            var response = await fetch(gatusEndpoint, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error('Failed to fetch service status');
            }

            var data = await response.json();
            renderServiceStatus(data);
        } catch (error) {
            console.error('加载服务状态失败:', error);
            // 如果Gatus端点不可用，显示模拟数据或错误信息
            renderServiceStatusFallback();
        }
    }

    // 渲染服务状态
    function renderServiceStatus(data) {
        var listContainer = document.getElementById('serviceStatusList');
        if (!listContainer) return;

        if (!data || !Array.isArray(data) || data.length === 0) {
            listContainer.innerHTML = '<div style="text-align:center;padding:30px;color:#999;"><i class="fas fa-exclamation-circle" style="font-size:24px;margin-bottom:10px;"></i><p>' + (window.i18n ? window.i18n.t('noServiceStatusData') : '暂无服务状态数据') + '</p></div>';
            return;
        }

        var html = '<div class="service-status-grid">';
        data.forEach(function(endpoint) {
            var status = endpoint.status || 'unknown';
            var statusClass = 'status-' + status.toLowerCase();
            var statusIcon = status === 'healthy' ? 'fa-check-circle' : (status === 'unhealthy' ? 'fa-times-circle' : 'fa-question-circle');
            var statusColor = status === 'healthy' ? '#28a745' : (status === 'unhealthy' ? '#dc3545' : '#ffc107');

            html += '<div class="service-status-item" style="display:flex;align-items:center;padding:12px;border:1px solid #eee;border-radius:8px;margin-bottom:8px;background:#fff;">';
            html += '<div class="service-status-icon" style="margin-right:12px;font-size:20px;color:' + statusColor + ';"><i class="fas ' + statusIcon + '"></i></div>';
            html += '<div class="service-status-info" style="flex:1;">';
            html += '<div class="service-status-name" style="font-weight:500;font-size:14px;color:#333;">' + (endpoint.name || 'Unknown Service') + '</div>';
            html += '<div class="service-status-url" style="font-size:12px;color:#999;word-break:break-all;">' + (endpoint.url || '') + '</div>';
            html += '</div>';
            html += '<div class="service-status-badge" style="padding:4px 8px;border-radius:4px;font-size:12px;font-weight:500;background:' + (status === 'healthy' ? '#d4edda' : (status === 'unhealthy' ? '#f8d7da' : '#fff3cd')) + ';color:' + statusColor + ';">' + (status === 'healthy' ? (window.i18n ? window.i18n.t('statusHealthy') : '正常') : (status === 'unhealthy' ? (window.i18n ? window.i18n.t('statusUnhealthy') : '异常') : (window.i18n ? window.i18n.t('statusUnknown') : '未知'))) + '</div>';
            html += '</div>';
        });
        html += '</div>';

        listContainer.innerHTML = html;
    }

    // 渲染服务状态回退（当Gatus不可用时）
    function renderServiceStatusFallback() {
        var listContainer = document.getElementById('serviceStatusList');
        if (!listContainer) return;

        // 定义要监控的API端点列表
        var endpoints = [
            { name: 'API Health', url: '/api/health', method: 'GET' },
            { name: 'Auth Service', url: '/api/auth/login', method: 'POST' },
            { name: 'Files Service', url: '/api/files', method: 'GET' },
            { name: 'Share Service', url: '/api/share/get', method: 'POST' },
            { name: 'Convert Service', url: '/api/convert/markdown', method: 'POST' }
        ];

        var html = '<div class="service-status-grid">';
        endpoints.forEach(function(endpoint) {
            html += '<div class="service-status-item" style="display:flex;align-items:center;padding:12px;border:1px solid #eee;border-radius:8px;margin-bottom:8px;background:#fff;" data-endpoint="' + endpoint.url + '">';
            html += '<div class="service-status-icon" style="margin-right:12px;font-size:20px;color:#ffc107;"><i class="fas fa-circle-notch fa-spin"></i></div>';
            html += '<div class="service-status-info" style="flex:1;">';
            html += '<div class="service-status-name" style="font-weight:500;font-size:14px;color:#333;">' + endpoint.name + '</div>';
            html += '<div class="service-status-url" style="font-size:12px;color:#999;word-break:break-all;">' + endpoint.url + '</div>';
            html += '</div>';
            html += '<div class="service-status-badge" style="padding:4px 8px;border-radius:4px;font-size:12px;font-weight:500;background:#fff3cd;color:#856404;">' + (window.i18n ? window.i18n.t('statusChecking') : '检测中') + '</div>';
            html += '</div>';
        });
        html += '</div>';

        listContainer.innerHTML = html;

        // 逐个检测端点
        endpoints.forEach(function(endpoint) {
            checkEndpointStatus(endpoint);
        });
    }

    // 检测单个端点状态
    async function checkEndpointStatus(endpoint) {
        var item = document.querySelector('[data-endpoint="' + endpoint.url + '"]');
        if (!item) return;

        var iconEl = item.querySelector('.service-status-icon');
        var badgeEl = item.querySelector('.service-status-badge');

        try {
            var startTime = Date.now();
            var response;

            if (endpoint.method === 'GET') {
                response = await fetch(endpoint.url, { method: 'GET', cache: 'no-cache' });
            } else {
                // 对于POST请求，发送一个空的body来测试
                response = await fetch(endpoint.url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({}),
                    cache: 'no-cache'
                });
            }

            var responseTime = Date.now() - startTime;
            var isHealthy = response.ok || response.status === 401 || response.status === 403 || response.status === 400; // 这些状态码表示服务正在运行

            if (isHealthy) {
                iconEl.innerHTML = '<i class="fas fa-check-circle"></i>';
                iconEl.style.color = '#28a745';
                badgeEl.textContent = (window.i18n ? window.i18n.t('statusHealthy') : '正常') + ' (' + responseTime + 'ms)';
                badgeEl.style.background = '#d4edda';
                badgeEl.style.color = '#155724';
            } else {
                iconEl.innerHTML = '<i class="fas fa-times-circle"></i>';
                iconEl.style.color = '#dc3545';
                badgeEl.textContent = (window.i18n ? window.i18n.t('statusUnhealthy') : '异常') + ' (' + response.status + ')';
                badgeEl.style.background = '#f8d7da';
                badgeEl.style.color = '#721c24';
            }
        } catch (error) {
            iconEl.innerHTML = '<i class="fas fa-times-circle"></i>';
            iconEl.style.color = '#dc3545';
            badgeEl.textContent = window.i18n ? window.i18n.t('statusOffline') : '离线';
            badgeEl.style.background = '#f8d7da';
            badgeEl.style.color = '#721c24';
        }
    }

    // 视频通话模态框关闭
    var closeVideoCallBtn = document.getElementById('closeVideoCallBtn');
    if (closeVideoCallBtn) closeVideoCallBtn.addEventListener('click', function() {
        var modal = document.getElementById('videoCallModalOverlay');
        var iframe = document.getElementById('videoCallIframe');
        if (modal) modal.classList.remove('show');
        if (iframe) iframe.src = ''; // 清空iframe以停止视频流
    });

    var videoCallModalOverlay = document.getElementById('videoCallModalOverlay');
    if (videoCallModalOverlay) videoCallModalOverlay.addEventListener('click', function(e) {
        if (e.target === this) {
            this.classList.remove('show');
            var iframe = document.getElementById('videoCallIframe');
            if (iframe) iframe.src = '';
        }
    });

    // 点击遮罩层关闭模态框
    var settingsModalOverlay = document.getElementById('settingsModalOverlay');
    if (settingsModalOverlay) settingsModalOverlay.addEventListener('click', function(e) {
        if (e.target === this) requestCloseSettingsDialog();
    });

    var aboutModalOverlay = document.getElementById('aboutModalOverlay');
    if (aboutModalOverlay) aboutModalOverlay.addEventListener('click', function(e) {
        if (e.target === this) this.classList.remove('show');
    });

    // 应用字体大小设置
    function applyFontSize(fontSize) {
        var longFileTextarea = document.getElementById('longFileTextarea');
        if (longFileTextarea) {
            longFileTextarea.style.fontSize = fontSize;
            longFileTextarea.style.lineHeight = '1.6';
        }

        var longFilePreview = document.getElementById('longFilePreview');
        if (longFilePreview) {
            longFilePreview.style.fontSize = fontSize;
            longFilePreview.style.lineHeight = '1.6';
        }

        if (!window.vditor) return;

        var vditorElement = document.getElementById('vditor');
        if (vditorElement) {
            // 设置编辑器整体字体大小
            var contentElements = vditorElement.querySelectorAll('.vditor-wysiwyg__pre, .vditor-ir__preview, .vditor-reset, .vditor-ir__input, .vditor-sv');
            contentElements.forEach(function(el) {
                el.style.fontSize = fontSize;
                el.style.lineHeight = '1.6';
            });

            // 设置输入区字体大小
            var inputElements = vditorElement.querySelectorAll('.vditor-ir__input, textarea, .vditor-wysiwyg');
            inputElements.forEach(function(el) {
                el.style.fontSize = fontSize;
            });

            // 添加样式标签来覆盖默认样式
            var styleId = 'vditor-font-size-style';
            var existingStyle = document.getElementById(styleId);
            if (existingStyle) {
                existingStyle.remove();
            }

            var style = document.createElement('style');
            style.id = styleId;
            style.textContent = `
                .vditor-ir, .vditor-ir pre.vditor-reset,
                .vditor-wysiwyg, .vditor-wysiwyg pre.vditor-reset,
                .vditor-sv, .vditor-content,
                .vditor-reset {
                    font-size: ${fontSize} !important;
                    line-height: 1.6 !important;
                }
            `;
            document.head.appendChild(style);
        }
    }

    // 应用大纲视图设置
    function applyOutline(show) {
        if (window.isLongFileMode) return;
        if (!window.vditor) return;

        // 如果需要，重新初始化编辑器以应用大纲视图设置
        if (window.userSettings.showOutline !== show) {
            window.userSettings.showOutline = show;
            localStorage.setItem('vditor_settings', JSON.stringify(window.userSettings));

            // 重新初始化编辑器
            var currentContent = window.vditor.getValue();
            var currentMode = window.vditor.vditor ? window.vditor.vditor.mode : 'ir';
            if (window.vditor.destroy) window.vditor.destroy();

            var newConfig = {
                height: editorConfig.height,
                width: editorConfig.width,
                placeholder: window.i18n ? window.i18n.t('startEditing') : '开始编辑...支持 Markdown 语法',
                cdn: window.electron ? './vditor' : (window.location.protocol === 'file:' ? './vditor' : '/vditor'),
                lang: 'en_US', // 彻底禁用中文语言文件，使用默认英语
                toolbar: ['emoji', 'br', 'bold', 'italic', 'strike', '|', 'line', 'quote', 'list', 'ordered-list', 'check', 'outdent', 'indent', 'code', 'inline-code', 'insert-after', 'insert-before', 'upload', 'link', 'table', 'record', 'edit-mode', 'both', 'preview', 'fullscreen', 'outline', 'code-theme', 'content-theme', 'export', 'info', 'help', 'br'],
                customWysiwygToolbar: function() {},
                theme: window.nightMode ? 'dark' : 'classic',
                mode: currentMode,
                value: currentContent,
                cache: editorConfig.cache,
                outline: { enable: show },
                hint: editorConfig.hint,
                upload: editorConfig.upload,
                after: function() {
                    reinitEditorEvents();
                    reinitMenuEvents();
                    reinitMobileFeatures();
                    if (typeof window.initInlineImageTools === 'function') {
                        window.initInlineImageTools();
                    }
                    applyFontSize(window.userSettings.fontSize);
                }
            };
            window.vditor = new Vditor('vditor', newConfig);
        }
    }

    function enterPresentationMode() {
        var mobileToolbar = document.querySelector('.mobile-toolbar-container');
        var mobileBottomBar = document.querySelector('.mobile-bottom-bar');
        var editorContainer = document.querySelector('.editor-container');

        if (mobileToolbar) {
            mobileToolbar.style.display = 'none';
        }
        if (mobileBottomBar) {
            mobileBottomBar.style.display = 'none';
        }
        if (editorContainer) {
            editorContainer.style.top = '0';
            editorContainer.style.height = '100vh';
        }

        if (document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen();
        } else if (document.documentElement.webkitRequestFullscreen) {
            document.documentElement.webkitRequestFullscreen();
        } else if (document.documentElement.msRequestFullscreen) {
            document.documentElement.msRequestFullscreen();
        }

        document.addEventListener('fullscreenchange', handleFullscreenChange);
        document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
        document.addEventListener('msfullscreenchange', handleFullscreenChange);

        window.showMessage(window.i18n ? window.i18n.t('presentationModeStarted') : '已进入演示模式，按 ESC 键退出', 'info');
    }

    function exitPresentationMode() {
        var mobileToolbar = document.querySelector('.mobile-toolbar-container');
        var mobileBottomBar = document.querySelector('.mobile-bottom-bar');
        var editorContainer = document.querySelector('.editor-container');

        if (mobileToolbar) {
            mobileToolbar.style.display = '';
        }
        if (mobileBottomBar) {
            mobileBottomBar.style.display = '';
        }
        if (editorContainer) {
            editorContainer.style.top = '';
            editorContainer.style.height = '';
        }

        document.removeEventListener('fullscreenchange', handleFullscreenChange);
        document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
        document.removeEventListener('msfullscreenchange', handleFullscreenChange);

        window.showMessage(window.i18n ? window.i18n.t('presentationModeEnded') : '已退出演示模式', 'info');
    }

    function handleFullscreenChange() {
        if (!document.fullscreenElement && !document.webkitFullscreenElement && !document.msFullscreenElement) {
            exitPresentationMode();
        }
    }

    initializeAppShellOnce();
    initAndroidViewportInsets();
    initModalSafeAreaObserver();
    initAndroidBackModalBehavior();
    ensureWasmRuntimeBootstrapped();

    if (window.startInFileManagementMode) {
        window.enterFileManagementMode();
    } else {
        window.enterEditorMode();
        window.ensureVditorInitialized().catch(function(error) {
            console.error('Failed to initialize Vditor at startup:', error);
        });
    }

    // Native app update check: compare packaged version with static.yhsun.cn/version.txt.
    setTimeout(function() {
        if (typeof window.checkNativeAppVersionUpdate === 'function') {
            window.checkNativeAppVersionUpdate();
        }
    }, 1800);
});
