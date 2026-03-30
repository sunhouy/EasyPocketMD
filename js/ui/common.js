
(function(global) {
    'use strict';

    function g(name) { return global[name]; }

    function hideMobileActionSheet() {
        var actionSheet = document.getElementById('mobileActionSheet');
        var overlay = document.getElementById('mobileActionSheetOverlay');
        if (actionSheet) actionSheet.classList.remove('show');
        if (overlay) overlay.classList.remove('show');
    }

    function showMobileActionSheet(title, options) {
        var actionSheet = document.getElementById('mobileActionSheet');
        var overlay = document.getElementById('mobileActionSheetOverlay');
        if (!actionSheet || !overlay) return;
        var nightMode = g('nightMode') === true;
        actionSheet.innerHTML = '';
        var titleEl = document.createElement('div');
        titleEl.style.cssText = 'text-align:center;font-weight:600;font-size:18px;margin-bottom:15px;padding:0 20px;color:' + (nightMode ? '#eee' : '#333') + ';';
        titleEl.textContent = title;
        actionSheet.appendChild(titleEl);
        options.forEach(function(option) {
            var optionEl = document.createElement('button');
            optionEl.style.cssText = 'display:flex;align-items:center;width:100%;padding:15px 20px;background:none;border:none;text-align:left;font-size:16px;border-bottom:1px solid ' + (nightMode ? '#444' : '#eee') + ';color:' + (nightMode ? '#eee' : '#333') + ';';
            optionEl.innerHTML = '<span style="font-size:20px;margin-right:15px;width:30px;text-align:center;">' + option.icon + '</span><span>' + option.text + '</span>';
            optionEl.addEventListener('click', function() { option.action(); hideMobileActionSheet(); });
            actionSheet.appendChild(optionEl);
        });
        // 右上角关闭按钮
        var closeBtn = document.createElement('button');
        closeBtn.innerHTML = '<i class="fas fa-times"></i>';
        closeBtn.style.cssText = 'position:absolute;top:10px;right:10px;width:28px;height:28px;background:' + (nightMode ? '#555' : '#f5f5f5') + ';border:none;border-radius:50%;font-size:14px;color:' + (nightMode ? '#eee' : '#333') + ';cursor:pointer;display:flex;align-items:center;justify-content:center;';
        closeBtn.addEventListener('click', hideMobileActionSheet);
        actionSheet.appendChild(closeBtn);
        actionSheet.classList.add('show');
        overlay.classList.add('show');
        overlay.onclick = hideMobileActionSheet;
    }

    function insertText(text) {
        try {
            if (g('vditor')) {
                // 在插入内容后添加两个空行
                g('vditor').insertValue(text + '\n\n');
            }
        } catch (e) {
            console.error('插入文本错误', e);
            // 显示错误信息给用户
            if (global.showMessage) {
                global.showMessage(window.i18n ? window.i18n.t('insertFailed') : '插入失败，请重试', 'error');
            }
        }
        hideMobileActionSheet();
    }

    function insertTable() {
        var tableMarkdown = '\n| 标题1 | 标题2 | 标题3 |\n|-------|-------|-------|\n| 内容1 | 内容2 | 内容3 |\n| 内容4 | 内容5 | 内容6 |\n\n\n';
        try {
            if (g('vditor')) {
                g('vditor').insertValue(tableMarkdown);
                global.showMessage(window.i18n ? window.i18n.t('tableInserted') : '表格已插入，可编辑表格内容');
            }
        } catch (e) {
            console.error('插入表格错误', e);
            if (global.showMessage) {
                global.showMessage(window.i18n ? window.i18n.t('insertTableFailed') : '插入表格失败，请重试', 'error');
            }
        }
        hideMobileActionSheet();
    }

    function toggleNightMode() {
        global.nightMode = !global.nightMode;
        if (global.nightMode) {
            document.body.classList.add('night-mode');
            // var modeToggle = document.getElementById('modeToggle');
            // if (modeToggle) modeToggle.innerHTML = '<i class="fas fa-sun"></i>'; // Managed by UI elsewhere usually?
            // Re-enabling as per original code logic if element exists
            var modeToggle = document.getElementById('modeToggle');
            if (modeToggle) modeToggle.innerHTML = '<i class="fas fa-sun"></i>';

            localStorage.setItem('vditor_night_mode', 'true');
            if (g('vditor')) g('vditor').setTheme('dark');
            global.showMessage(window.i18n ? window.i18n.t('switchedToNight') : '已切换到夜间模式');
        } else {
            document.body.classList.remove('night-mode');
            var modeToggle = document.getElementById('modeToggle');
            if (modeToggle) modeToggle.innerHTML = '<i class="fas fa-moon"></i>';
            localStorage.setItem('vditor_night_mode', 'false');
            if (g('vditor')) g('vditor').setTheme('classic');
            global.showMessage(window.i18n ? window.i18n.t('switchedToDay') : '已切换到日间模式');
        }
    }

    function showFormatMenu() {
        var t = function(key) { return window.i18n ? window.i18n.t(key) : key; };
        var formatOptions = [
            { icon: '<i class="fas fa-heading"></i>', text: t('heading1'), action: function() { insertText('# '); } },
            { icon: '<i class="fas fa-heading"></i>', text: t('heading2'), action: function() { insertText('## '); } },
            { icon: '<i class="fas fa-heading"></i>', text: t('heading3'), action: function() { insertText('### '); } },
            { icon: '<i class="fas fa-bold"></i>', text: t('bold'), action: function() { insertText('**粗体文字**'); } },
            { icon: '<i class="fas fa-italic"></i>', text: t('italic'), action: function() { insertText('*斜体文字*'); } },
            { icon: '<i class="fas fa-strikethrough"></i>', text: t('strikethrough'), action: function() { insertText('~~删除线文字~~'); } },
            { icon: '<i class="fas fa-code"></i>', text: t('codeBlock'), action: function() { insertText('```\n代码块\n```'); } },
            { icon: '<i class="fas fa-quote-right"></i>', text: t('quote'), action: function() { insertText('> 引用文字'); } }
        ];
        showMobileActionSheet(t('selectFormat'), formatOptions);
    }

    function showInsertMenu() {
        var t = function(key) { return window.i18n ? window.i18n.t(key) : key; };
        var insertOptions = [
            { icon: '<i class="fas fa-link"></i>', text: t('link'), action: function() { insertText('[链接文字](https://)'); } },
            { icon: '<i class="fas fa-image"></i>', text: t('uploadImage'), action: function() { if(global.triggerImageUpload) global.triggerImageUpload(); } },
            { icon: '<i class="fas fa-file-upload"></i>', text: t('uploadFile'), action: function() { if(global.triggerFileUpload) global.triggerFileUpload(); } },
            { icon: '<i class="fas fa-globe"></i>', text: t('webImage'), action: function() { insertText('![图片描述](图片地址)'); } },
            { icon: '<i class="fas fa-table"></i>', text: t('table'), action: insertTable },
            { icon: '<i class="fas fa-list-ul"></i>', text: t('unorderedList'), action: function() { insertText('- 列表项'); } },
            { icon: '<i class="fas fa-list-ol"></i>', text: t('orderedList'), action: function() { insertText('1. 列表项'); } },
            { icon: '<i class="fas fa-tasks"></i>', text: t('taskList'), action: function() { insertText('- [ ] 任务项'); } },
            { icon: '<i class="fas fa-minus"></i>', text: t('divider'), action: function() { insertText('\n---\n'); } },
            { icon: '<i class="fas fa-smile"></i>', text: t('emoji'), action: function() { if (typeof window.showEmojiPicker === 'function') window.showEmojiPicker(); else console.error('Emoji picker not loaded'); } },
            { icon: '<i class="fas fa-superscript"></i>', text: t('formula'), action: function() { if (typeof window.showFormulaPicker === 'function') window.showFormulaPicker(); else console.error('Formula picker not loaded'); } }
        ];
        showMobileActionSheet(t('insertContent'), insertOptions);
    }

    function debounce(func, wait) {
        var timeout;
        return function() {
            var context = this;
            var args = arguments;
            clearTimeout(timeout);
            timeout = setTimeout(function() {
                func.apply(context, args);
            }, wait);
        };
    }
    
    function escapeHtml(text) {
        var map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, function(m) { return map[m]; });
    }

    global.showMobileActionSheet = showMobileActionSheet;
    global.hideMobileActionSheet = hideMobileActionSheet;
    global.insertText = insertText;
    global.insertTable = insertTable;
    global.toggleNightMode = toggleNightMode;
    global.showFormatMenu = showFormatMenu;
    global.showInsertMenu = showInsertMenu;
    global.debounce = debounce;
    global.escapeHtml = escapeHtml;

})(typeof window !== 'undefined' ? window : this);
