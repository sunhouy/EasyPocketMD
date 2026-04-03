/**
 * Vditor 初始化、界面与功能绑定
 */
import startupAsciiArt from '../ascii.md?raw';

document.addEventListener('DOMContentLoaded', function() {
    'use strict';

    console.log(startupAsciiArt);

    // 记录页面加载开始时间
    // const pageLoadStartTime = performance.now();

    // 初始化翻译系统
    if (window.i18n) {
        window.i18n.init();
        applyTranslations();
    }
g
    var isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    var isCapacitor = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
    window.isMobileEditorEnvironment = isMobile || isCapacitor;
    if (isCapacitor) {
        document.body.classList.add('is-capacitor');
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

    if (isMobile || isCapacitor) {
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
    window.autoSaveTimer = null;
    window.syncInterval = null;
    window.lastSyncedContent = {};
    window.unsavedChanges = {};
    window.vditor = null;
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
        var sidebar = document.getElementById('fileListSidebar');
        if (sidebar) sidebar.classList.toggle('show');
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
    if (typeof window.userSettings.enableWasmTextEngine !== 'boolean') {
        window.userSettings.enableWasmTextEngine = true;
    }

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
        cdn: window.electron ? './vditor' : (window.location.protocol === 'file:' ? './vditor' : '/vditor'), // 兼容 Electron 和 Web 环境的本地目录
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

            // 计算加载时间
            // const loadTime = Math.round(performance.now() - pageLoadStartTime);

            // 打印EasyPocketMD
            console.log('%c%s', 'font-size: 48px; font-weight: bold; color: #4a90e2; text-shadow: 2px 2px 4px rgba(0,0,0,0.2);', 'EasyPocketMD');
            // console.log('%cLoad time: %dms', 'font-size: 16px; font-weight: bold; color: #27ae60;', loadTime);

            // 应用字体大小设置
            applyFontSize(window.userSettings.fontSize);

            // 应用大纲视图设置
            applyOutline(window.userSettings.showOutline);

            // 初始化用户界面和移动特性
            initUserInterface();
            initMobileFeatures();
            document.addEventListener('keydown', function(e) {
                if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); window.saveCurrentFile(true); }
                if (e.ctrlKey && e.shiftKey && e.key === 'L') { e.preventDefault(); window.toggleNightMode(); }
            });
            document.addEventListener('click', function(e) {
                var dropdown = document.getElementById('mobileDropdown');
                var menuBtn = document.getElementById('mobileMenuBtn');
                var overlay = document.getElementById('mobileActionSheetOverlay');
                var userMenu = document.getElementById('userMenuDropdown');
                var fileListSidebar = document.getElementById('fileListSidebar');
                var mobileFileBtn = document.getElementById('mobileFileBtn');

                if (menuBtn && dropdown && !menuBtn.contains(e.target) && !dropdown.contains(e.target)) dropdown.classList.remove('show');
                if (overlay && e.target === overlay) window.hideMobileActionSheet();
                if (userMenu && !document.getElementById('mobileLoginBtn').contains(e.target) && !userMenu.contains(e.target)) userMenu.classList.remove('show');
            });
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
        }
    };

    window.vditor = new Vditor('vditor', editorConfig);

    if (window.wasmTextEngineGateway && typeof window.wasmTextEngineGateway.init === 'function') {
        window.wasmTextEngineGateway.init().then(function(res) {
            var status = typeof window.wasmTextEngineGateway.getStatus === 'function'
                ? window.wasmTextEngineGateway.getStatus()
                : null;
            if (res && res.code === 200) {
                console.info('[text-engine] wasm ready', { init: res, status: status });
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
            console.log('Network connected');
            // 如果当前显示的是网络错误提示，则自动关闭
            if (currentNoticeType === 'network-error') {
                hideTopNoticeBanner();
            }
        });

        // 监听网络断开事件，主动显示网络错误提示
        window.addEventListener('offline', function() {
            console.log('Network disconnected');
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

        if (window.currentUser) {
            window.showUserInfo();
            window.startAutoSync();
            window.loadFilesFromServer();
            hideTopNoticeBanner();
        } else {
            // 检查是否是分享链接
            const urlParams = new URLSearchParams(window.location.search);
            const shareId = urlParams.get('share_id');

            if (!shareId) {
                // 不是分享链接，显示未登录提示横幅
                showGuestNoticeBanner();
            }
            window.loadLocalFiles();
        }
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
        if (mobileFileBtn) mobileFileBtn.addEventListener('click', function() { document.getElementById('fileListSidebar').classList.toggle('show'); });

        // 演示模式按钮仅在桌面端显示
        var mobilePresentationBtn = document.getElementById('mobilePresentationBtn');
        if (mobilePresentationBtn) {
            if (isMobile) {
                mobilePresentationBtn.style.display = 'none';
            } else {
                mobilePresentationBtn.style.display = '';
            }
        }
    }

    function initMobileFeatures() {
        var dropdown = document.getElementById('mobileDropdown');
        function closeDrop() { if (dropdown) dropdown.classList.remove('show'); }

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

        // 渲染底部工具栏
        window.renderBottomToolbar();
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
        try {
            var currentContent = window.vditor.getValue();
            localStorage.setItem('vditor_editor_mode', mode);
            if (window.vditor.destroy) window.vditor.destroy();
            var newConfig = {
                height: editorConfig.height,
                width: editorConfig.width,
                placeholder: window.i18n ? window.i18n.t('startEditing') : '开始编辑...支持 Markdown 语法',
                cdn: window.electron ? './vditor' : (window.location.protocol === 'file:' ? './vditor' : '/vditor'), // 兼容 Electron 和 Web 环境的本地目录
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
            if (isMobile) {
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
            { id: 'mobileFileBtn', fn: function() { document.getElementById('fileListSidebar').classList.toggle('show'); } }
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

        // 生成工具栏按钮选择
        renderToolbarButtonSettings();

        // 每次打开设置都默认折叠空间管理详情
        var storageManagementDetails = document.getElementById('storageManagementDetails');
        var storageUsagePanel = document.getElementById('storageUsagePanel');
        if (storageManagementDetails) {
            storageManagementDetails.open = false;
        }
        if (storageUsagePanel) {
            storageUsagePanel.style.display = 'none';
        }

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
            fontSize: '16px',
            showOutline: false,
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
            window.location.reload(); // 重新加载以应用主题、语言或大纲视图更改
        } else {
            applyTranslations();
            window.renderBottomToolbar();
            // 重新加载文件列表以应用新的排序设置
            if (window.loadFiles) window.loadFiles();
            document.getElementById('settingsModalOverlay').classList.remove('show');
            window.showMessage(window.i18n ? window.i18n.t('settingsSaved') : '设置已保存', 'success');
        }
    });

    var cancelSettingsBtn = document.getElementById('cancelSettingsBtn');
    if(cancelSettingsBtn) cancelSettingsBtn.addEventListener('click', function() {
        document.getElementById('settingsModalOverlay').classList.remove('show');
    });

    // 关于对话框
    window.showAboutDialog = function() {
        var modal = document.getElementById('aboutModalOverlay');
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
        if (e.target === this) this.classList.remove('show');
    });

    var aboutModalOverlay = document.getElementById('aboutModalOverlay');
    if (aboutModalOverlay) aboutModalOverlay.addEventListener('click', function(e) {
        if (e.target === this) this.classList.remove('show');
    });

    // 应用字体大小设置
    function applyFontSize(fontSize) {
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
});
