
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
    document.getElementById('saveSettingsBtn').addEventListener('click', function() {
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
    
    document.getElementById('cancelSettingsBtn').addEventListener('click', function() {
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
