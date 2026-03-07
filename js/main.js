/**
 * Vditor 初始化、界面与功能绑定
 */
document.addEventListener('DOMContentLoaded', function() {
    'use strict';

    var isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
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

    // 工具栏配置
    window.allToolbarButtons = [
        { id: 'mobileFormatBtn', icon: 'fas fa-font', text: '格式', fn: function() { window.showFormatMenu(); } },
        { id: 'mobileInsertBtn', icon: 'fas fa-plus', text: '插入', fn: function() { window.showInsertMenu(); } },
        { id: 'mobileFormulaBtn', icon: 'fas fa-superscript', text: '公式', fn: function() { if (typeof window.showFormulaPicker === 'function') window.showFormulaPicker(); } },
        { id: 'mobileChartBtn', icon: 'fas fa-chart-bar', text: '图表', fn: function() { window.showChartPicker(); } },
        { id: 'mobileUndoBtn', icon: 'fas fa-undo', text: '撤销', fn: function() { if (window.vditor) window.vditor.undo(); } },
        { id: 'mobileRedoBtn', icon: 'fas fa-redo', text: '重做', fn: function() { if (window.vditor) window.vditor.redo(); } },
        { id: 'mobileSaveBottomBtn', icon: 'fas fa-save', text: '保存', fn: function() { window.saveCurrentFile(true); } }
    ];

    // 默认配置
    window.defaultToolbarButtons = ['mobileFormatBtn', 'mobileInsertBtn', 'mobileFormulaBtn', 'mobileChartBtn', 'mobileUndoBtn', 'mobileRedoBtn', 'mobileSaveBottomBtn'];
    
    // 加载用户配置
    window.userSettings = JSON.parse(localStorage.getItem('vditor_settings') || '{}');
    if (!window.userSettings.toolbarButtons) {
        window.userSettings.toolbarButtons = window.defaultToolbarButtons;
    }
    if (!window.userSettings.themeMode) {
        window.userSettings.themeMode = 'system'; // system, light, dark
    }
    
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

    var modeMap = {
        wysiwyg: { name: '所见即所得', icon: 'fas fa-eye' },
        ir: { name: '即时渲染', icon: 'fas fa-bolt' },
        sv: { name: '分屏预览', icon: 'fas fa-columns' }
    };

    var editorConfig = {
        height: '100%',
        width: '100%',
        placeholder: '开始编辑...支持 Markdown 语法',
        cdn: '/vditor', // 使用本地目录
        toolbar: ['emoji', 'br', 'bold', 'italic', 'strike', '|', 'line', 'quote', 'list', 'ordered-list', 'check', 'outdent', 'indent', 'code', 'inline-code', 'insert-after', 'insert-before', 'upload', 'link', 'table', 'record', 'edit-mode', 'both', 'preview', 'fullscreen', 'outline', 'code-theme', 'content-theme', 'export', 'info', 'help', 'br'],
        customWysiwygToolbar: function() {}, // 修复报错
        theme: window.nightMode ? 'dark' : 'classic',
        mode: localStorage.getItem('vditor_editor_mode') || 'ir',
        cache: { enable: true, id: 'vditor-mobile-optimized' },
        outline: { enable: false },
        hint: { emoji: {} },
        upload: {
            accept: 'image/*,.jpg,.jpeg,.png,.gif,.bmp,.webp,.svg,.mp4,.mp3,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar,.7z',
            handler: function(files) { return window.uploadFiles(files, true); }
        },
        after: function() {
            if (loading) loading.style.display = 'none';
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
                if (fileListSidebar && mobileFileBtn && !mobileFileBtn.contains(e.target) && !fileListSidebar.contains(e.target)) fileListSidebar.classList.remove('show');
            });
            if (window.vditor && window.vditor.vditor && window.vditor.vditor.ir) {
                window.vditor.vditor.ir.element.addEventListener('input', function() {
                    if (window.currentFileId) {
                        window.unsavedChanges[window.currentFileId] = true;
                        window.startAutoSave();
                    }
                });
            }
        }
    };

    window.vditor = new Vditor('vditor', editorConfig);

    function initUserInterface() {
        if (window.currentUser) {
            window.showUserInfo();
            window.startAutoSync();
            window.loadFilesFromServer();
        } else {
            // 检查是否是分享链接
            const urlParams = new URLSearchParams(window.location.search);
            const shareId = urlParams.get('share_id');
            
            if (!shareId) {
                // 不是分享链接，显示未登录提示
                window.showMessage('未登录');
            }
            window.loadLocalFiles();
        }
        var fileListClose = document.getElementById('fileListClose');
        if (fileListClose) fileListClose.addEventListener('click', function() { document.getElementById('fileListSidebar').classList.remove('show'); });
        var addFileBtn = document.getElementById('addFileBtn');
        if (addFileBtn) addFileBtn.addEventListener('click', window.createNewFile);
        var mobileFileBtn = document.getElementById('mobileFileBtn');
        if (mobileFileBtn) mobileFileBtn.addEventListener('click', function() { document.getElementById('fileListSidebar').classList.toggle('show'); });
    }

    function initMobileFeatures() {
        var dropdown = document.getElementById('mobileDropdown');
        function closeDrop() { if (dropdown) dropdown.classList.remove('show'); }

        var mobileShareBtn = document.getElementById('mobileShareBtn');
        if (mobileShareBtn) mobileShareBtn.addEventListener('click', function() { window.showShareDialog(); closeDrop(); });
        var mobilePrintBtn = document.getElementById('mobilePrintBtn');
        if (mobilePrintBtn) mobilePrintBtn.addEventListener('click', function() { window.showPrintDialog(); closeDrop(); });
        
        var mobileMenuBtn = document.getElementById('mobileMenuBtn');
        if (mobileMenuBtn) mobileMenuBtn.addEventListener('click', function(e) { e.stopPropagation(); if (dropdown) dropdown.classList.toggle('show'); });
        var mobileModeBtn = document.getElementById('mobileModeBtn');
        if (mobileModeBtn) mobileModeBtn.addEventListener('click', function() { showModeSelection(); closeDrop(); });
        var mobileExportBtn = document.getElementById('mobileExportBtn');
        if (mobileExportBtn) mobileExportBtn.addEventListener('click', function() { window.exportContent(); closeDrop(); });

        var mobileImportBtn = document.getElementById('mobileImportBtn');
        if (mobileImportBtn) mobileImportBtn.addEventListener('click', function() { window.importFiles(); closeDrop(); });

        var aboutBtn = document.getElementById('aboutBtn');
        if (aboutBtn) aboutBtn.addEventListener('click', function() { window.showAboutDialog(); closeDrop(); });

        var mobileClearBtn = document.getElementById('mobileClearBtn');
        if (mobileClearBtn) mobileClearBtn.addEventListener('click', function() {
            if (confirm('确定要清空当前文件的内容吗？')) {
                if (window.vditor) window.vditor.setValue('');
                window.showMessage('内容已清空');
            }
            closeDrop();
        });
        
        var mobileSettingsBtn = document.getElementById('mobileSettingsBtn');
        if (mobileSettingsBtn) mobileSettingsBtn.addEventListener('click', function() { window.showSettingsDialog(); closeDrop(); });
        
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
            { icon: '<i class="fas fa-eye"></i>', text: '所见即所得', value: 'wysiwyg', current: currentMode === 'wysiwyg' },
            { icon: '<i class="fas fa-bolt"></i>', text: '即时渲染', value: 'ir', current: currentMode === 'ir' },
            { icon: '<i class="fas fa-columns"></i>', text: '分屏预览', value: 'sv', current: currentMode === 'sv' }
        ];
        var options = modeOptions.map(function(opt) {
            return {
                icon: opt.icon,
                text: opt.text,
                action: function() { setEditorMode(opt.value); }
            };
        });
        window.showMobileActionSheet('选择编辑器模式', options);
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
                placeholder: editorConfig.placeholder,
                cdn: '/vditor', // 使用本地目录
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
                }
            };
            window.vditor = new Vditor('vditor', newConfig);
            window.showMessage('已切换到' + modeMap[mode].name, 'success');
            var mobileModeBtn = document.getElementById('mobileModeBtn');
            if (mobileModeBtn) mobileModeBtn.innerHTML = '<i class="' + modeMap[mode].icon + '"></i> <span>当前: ' + modeMap[mode].name + '</span>';
        } catch (error) {
            console.error('切换编辑器模式失败', error);
            window.showMessage('切换失败: ' + error.message, 'error');
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

            { id: 'mobileShareBtn', fn: function() { window.showShareDialog(); closeDrop(); } },
            { id: 'mobilePrintBtn', fn: function() { window.showPrintDialog(); closeDrop(); } },
            { id: 'mobileMenuBtn', fn: function(e) { e.stopPropagation(); if (dropdown) dropdown.classList.toggle('show'); } },
            { id: 'mobileModeBtn', fn: function() { showModeSelection(); closeDrop(); } },
            { id: 'mobileExportBtn', fn: function() { window.exportContent(); closeDrop(); } },
            { id: 'mobileClearBtn', fn: function() { if (confirm('确定要清空当前文件的内容吗？')) { if (window.vditor) window.vditor.setValue(''); window.showMessage('内容已清空'); } closeDrop(); } },
            { id: 'mobileSettingsBtn', fn: function() { window.showSettingsDialog(); closeDrop(); } },
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
    }

    function reinitMobileFeatures() {
        var btns = [
            { id: 'mobileLoginBtn', fn: window.handleLoginButtonClick },
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

    window.addEventListener('beforeunload', function(e) {
        var unsaved = window.unsavedChanges || {};
        var hasUnsaved = false;
        (window.files || []).forEach(function(file) { if (unsaved[file.id]) hasUnsaved = true; });
        if (hasUnsaved) {
            e.preventDefault();
            e.returnValue = '您有未保存的文件，确定要离开吗？';
            window.saveCurrentFile(true);
            if (window.currentUser) window.syncAllFiles();
        }
    });

    // 渲染底部工具栏
    window.renderBottomToolbar = function() {
        var toolbarContainer = document.getElementById('bottomBarButtons');
        if (!toolbarContainer) return;
        
        toolbarContainer.innerHTML = '';
        var buttons = window.userSettings.toolbarButtons || window.defaultToolbarButtons;
        
        buttons.forEach(function(btnId) {
            var btnConfig = window.allToolbarButtons.find(function(b) { return b.id === btnId; });
            if (btnConfig) {
                var btn = document.createElement('button');
                btn.className = 'bottom-btn';
                btn.id = btnConfig.id;
                btn.innerHTML = '<i class="' + btnConfig.icon + '"></i><span>' + btnConfig.text + '</span>';
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
        var currentEditorMode = localStorage.getItem('vditor_editor_mode') || 'ir';
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
        
        // 生成工具栏按钮选择
        var toolbarSettings = document.getElementById('toolbarButtonsSettings');
        toolbarSettings.innerHTML = '';
        var currentButtons = window.userSettings.toolbarButtons || window.defaultToolbarButtons;
        
        window.allToolbarButtons.forEach(function(btnConfig) {
            var label = document.createElement('label');
            var checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = btnConfig.id;
            checkbox.checked = currentButtons.includes(btnConfig.id);
            
            label.appendChild(checkbox);
            label.appendChild(document.createTextNode(' ' + btnConfig.text));
            toolbarSettings.appendChild(label);
        });
        
        modal.classList.add('show');
    };

    // 保存设置
    var saveSettingsBtn = document.getElementById('saveSettingsBtn');
    if(saveSettingsBtn) saveSettingsBtn.addEventListener('click', function() {
        var newSettings = {
            toolbarButtons: [],
            themeMode: 'system'
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
        
        // 获取选中的工具栏按钮
        var toolbarCheckboxes = document.querySelectorAll('#toolbarButtonsSettings input[type="checkbox"]');
        toolbarCheckboxes.forEach(function(cb) {
            if (cb.checked) {
                newSettings.toolbarButtons.push(cb.value);
            }
        });
        
        // 验证按钮数量
        if (newSettings.toolbarButtons.length < 5 || newSettings.toolbarButtons.length > 7) {
            alert('底部工具栏按钮数量必须在 5 到 7 个之间');
            return;
        }
        
        // 保存设置
        window.userSettings = newSettings;
        localStorage.setItem('vditor_settings', JSON.stringify(window.userSettings));
        
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
        
        if (oldNightMode !== window.nightMode) {
             window.location.reload(); // 重新加载以应用主题更改（最简单的方法）
        } else {
             window.renderBottomToolbar();
             document.getElementById('settingsModalOverlay').classList.remove('show');
             window.showMessage('设置已保存', 'success');
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
    
    // 点击遮罩层关闭模态框
    var settingsModalOverlay = document.getElementById('settingsModalOverlay');
    if (settingsModalOverlay) settingsModalOverlay.addEventListener('click', function(e) {
        if (e.target === this) this.classList.remove('show');
    });
    
    var aboutModalOverlay = document.getElementById('aboutModalOverlay');
    if (aboutModalOverlay) aboutModalOverlay.addEventListener('click', function(e) {
        if (e.target === this) this.classList.remove('show');
    });
});
