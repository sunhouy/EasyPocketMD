
(function(global) {
    'use strict';

    function g(name) { return global[name]; }

    function isEn() {
        return !!(window.i18n && window.i18n.getLanguage && window.i18n.getLanguage() === 'en');
    }

    function t(key, fallbackZh, fallbackEn) {
        if (window.i18n && typeof window.i18n.t === 'function') {
            var value = window.i18n.t(key);
            if (value && value !== key) return value;
        }
        return isEn() ? (fallbackEn || fallbackZh) : fallbackZh;
    }

    var activeModal = null;

    function closeActiveModal() {
        if (activeModal && activeModal.parentNode) {
            activeModal.parentNode.removeChild(activeModal);
        }
        activeModal = null;
    }

    function insertMarkdown(text) {
        try {
            if (g('vditor') && typeof g('vditor').insertValue === 'function') {
                g('vditor').insertValue(text + '\n\n');
                return true;
            }
        } catch (e) {
            console.error('插入内容错误', e);
        }
        if (typeof global.showMessage === 'function') {
            global.showMessage(t('insertFailed', '插入失败，请重试', 'Insert failed, please try again'), 'error');
        }
        return false;
    }

    function clampInt(value, min, max, fallback) {
        var n = parseInt(String(value), 10);
        if (!Number.isFinite(n)) return fallback;
        return Math.min(max, Math.max(min, n));
    }

    function createModalShell(titleText) {
        var nightMode = g('nightMode') === true;
        closeActiveModal();

        var modal = document.createElement('div');
        modal.className = 'insert-dialog-modal';
        modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:2100;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;';

        var container = document.createElement('div');
        container.style.cssText = 'position:relative;background:' + (nightMode ? '#2d2d2d' : '#fff') + ';border-radius:12px;padding:20px;width:100%;max-width:560px;max-height:90vh;overflow:auto;display:flex;flex-direction:column;gap:12px;';

        var title = document.createElement('div');
        title.textContent = titleText;
        title.style.cssText = 'font-size:18px;font-weight:600;text-align:center;color:' + (nightMode ? '#eee' : '#333') + ';';

        var closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.innerHTML = '<i class="fas fa-times"></i>';
        closeBtn.style.cssText = 'position:absolute;top:12px;right:12px;width:32px;height:32px;background:' + (nightMode ? '#444' : '#f5f5f5') + ';color:' + (nightMode ? '#eee' : '#333') + ';border:none;border-radius:50%;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;';
        closeBtn.onclick = closeActiveModal;

        container.appendChild(closeBtn);
        container.appendChild(title);

        modal.appendChild(container);
        document.body.appendChild(modal);
        activeModal = modal;

        function onKeydown(e) {
            if (e.key === 'Escape') {
                closeActiveModal();
                document.removeEventListener('keydown', onKeydown);
            }
        }
        document.addEventListener('keydown', onKeydown);

        return { modal: modal, container: container, nightMode: nightMode };
    }

    function fieldStyle(nightMode) {
        return 'width:100%;padding:10px 12px;border:1px solid ' + (nightMode ? '#444' : '#ccc') + ';border-radius:6px;font-size:14px;background:' + (nightMode ? '#222' : '#fafafa') + ';color:' + (nightMode ? '#eee' : '#333') + ';box-sizing:border-box;outline:none;';
    }

    function labelStyle(nightMode) {
        return 'display:block;margin-bottom:6px;font-size:14px;color:' + (nightMode ? '#ddd' : '#333') + ';';
    }

    function addField(container, nightMode, labelText, inputEl) {
        var label = document.createElement('label');
        label.textContent = labelText;
        label.style.cssText = labelStyle(nightMode);
        container.appendChild(label);
        container.appendChild(inputEl);
    }

    function addButtonBar(container, nightMode, onInsert) {
        var bar = document.createElement('div');
        bar.style.cssText = 'display:flex;gap:10px;justify-content:flex-end;margin-top:4px;';

        var cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.textContent = t('cancel', '取消', 'Cancel');
        cancelBtn.style.cssText = 'padding:10px 20px;background:' + (nightMode ? '#444' : '#f5f5f5') + ';color:' + (nightMode ? '#eee' : '#333') + ';border:none;border-radius:6px;cursor:pointer;font-size:14px;';
        cancelBtn.onclick = closeActiveModal;

        var insertBtn = document.createElement('button');
        insertBtn.type = 'button';
        insertBtn.innerHTML = '<i class="fas fa-plus"></i> ' + t('insert', '插入', 'Insert');
        insertBtn.style.cssText = 'padding:10px 20px;background:#4a90e2;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px;';
        insertBtn.onclick = function() {
            if (onInsert() !== false) closeActiveModal();
        };

        bar.appendChild(cancelBtn);
        bar.appendChild(insertBtn);
        container.appendChild(bar);
    }

    var CODE_LANGUAGES = [
        '', 'javascript', 'typescript', 'python', 'java', 'html', 'css', 'bash', 'json',
        'sql', 'go', 'rust', 'cpp', 'c', 'csharp', 'php', 'markdown', 'plaintext'
    ];

    function showInsertCodeBlockDialog() {
        var shell = createModalShell(t('insertCodeBlockTitle', '插入代码块', 'Insert Code Block'));
        var nightMode = shell.nightMode;
        var container = shell.container;

        var langInput = document.createElement('input');
        langInput.type = 'text';
        langInput.setAttribute('list', 'insert-code-lang-list');
        langInput.placeholder = t('codeLanguagePlaceholder', '如：javascript、python（可留空）', 'e.g. javascript, python (optional)');
        langInput.style.cssText = fieldStyle(nightMode);
        addField(container, nightMode, t('codeLanguageLabel', '编程语言', 'Language'), langInput);

        var datalist = document.createElement('datalist');
        datalist.id = 'insert-code-lang-list';
        CODE_LANGUAGES.forEach(function(lang) {
            if (!lang) return;
            var opt = document.createElement('option');
            opt.value = lang;
            datalist.appendChild(opt);
        });
        container.appendChild(datalist);

        var codeInput = document.createElement('textarea');
        codeInput.rows = 10;
        codeInput.placeholder = t('codeContentPlaceholder', '输入代码…', 'Enter code…');
        codeInput.style.cssText = fieldStyle(nightMode) + 'resize:vertical;font-family:monospace;min-height:160px;';
        addField(container, nightMode, t('codeContentLabel', '代码内容', 'Code'), codeInput);

        addButtonBar(container, nightMode, function() {
            var lang = langInput.value.trim();
            var code = codeInput.value;
            if (!code.trim()) {
                global.showMessage(t('codeContentRequired', '请输入代码内容', 'Please enter code'), 'warning');
                return false;
            }
            var markdown = '```' + lang + '\n' + code.replace(/\n$/, '') + '\n```';
            if (insertMarkdown(markdown)) {
                global.showMessage(t('codeBlockInserted', '代码块已插入', 'Code block inserted'));
            }
            return true;
        });

        langInput.focus();
    }

    function showInsertLinkDialog() {
        var shell = createModalShell(t('insertLinkTitle', '插入链接', 'Insert Link'));
        var nightMode = shell.nightMode;
        var container = shell.container;

        var textInput = document.createElement('input');
        textInput.type = 'text';
        textInput.placeholder = t('linkTextPlaceholder', '链接显示文字', 'Link text');
        textInput.style.cssText = fieldStyle(nightMode);
        addField(container, nightMode, t('linkTextLabel', '链接文字', 'Link text'), textInput);

        var urlInput = document.createElement('input');
        urlInput.type = 'url';
        urlInput.placeholder = 'https://';
        urlInput.style.cssText = fieldStyle(nightMode);
        addField(container, nightMode, t('linkUrlLabel', '链接地址', 'URL'), urlInput);

        addButtonBar(container, nightMode, function() {
            var text = textInput.value.trim() || t('defaultLinkText', '链接', 'Link');
            var url = urlInput.value.trim();
            if (!url) {
                global.showMessage(t('linkUrlRequired', '请输入链接地址', 'Please enter a URL'), 'warning');
                return false;
            }
            if (!/^https?:\/\//i.test(url) && !url.startsWith('mailto:') && !url.startsWith('/')) {
                url = 'https://' + url;
            }
            if (insertMarkdown('[' + text + '](' + url + ')')) {
                global.showMessage(t('linkInserted', '链接已插入', 'Link inserted'));
            }
            return true;
        });

        textInput.focus();
    }

    function showInsertWebImageDialog() {
        var shell = createModalShell(t('insertWebImageTitle', '插入网络图片', 'Insert Web Image'));
        var nightMode = shell.nightMode;
        var container = shell.container;

        var urlInput = document.createElement('input');
        urlInput.type = 'url';
        urlInput.placeholder = 'https://example.com/image.png';
        urlInput.style.cssText = fieldStyle(nightMode);
        addField(container, nightMode, t('imageUrlLabel', '图片地址', 'Image URL'), urlInput);

        var altInput = document.createElement('input');
        altInput.type = 'text';
        altInput.placeholder = t('imageAltPlaceholder', '图片描述（可选）', 'Description (optional)');
        altInput.style.cssText = fieldStyle(nightMode);
        addField(container, nightMode, t('imageAltLabel', '图片描述', 'Alt text'), altInput);

        addButtonBar(container, nightMode, function() {
            var url = urlInput.value.trim();
            if (!url) {
                global.showMessage(t('imageUrlRequired', '请输入图片地址', 'Please enter image URL'), 'warning');
                return false;
            }
            if (!/^https?:\/\//i.test(url) && !url.startsWith('/')) {
                url = 'https://' + url;
            }
            if (url.includes(' ')) url = encodeURI(url);
            var alt = altInput.value.trim() || t('defaultImageAlt', '图片', 'Image');
            if (insertMarkdown('![' + alt + '](' + url + ')')) {
                global.showMessage(t('imageInserted', '图片已插入', 'Image inserted'));
            }
            return true;
        });

        urlInput.focus();
    }

    function buildTableMarkdown(rows, cols) {
        var headerCells = [];
        var sepCells = [];
        for (var c = 0; c < cols; c++) {
            headerCells.push(isEn() ? ('Col ' + (c + 1)) : ('列' + (c + 1)));
            sepCells.push('---');
        }
        var lines = ['| ' + headerCells.join(' | ') + ' |', '| ' + sepCells.join(' | ') + ' |'];
        for (var r = 0; r < rows; r++) {
            var body = [];
            for (var c2 = 0; c2 < cols; c2++) {
                body.push(' ');
            }
            lines.push('| ' + body.join(' | ') + ' |');
        }
        return '\n' + lines.join('\n');
    }

    function showInsertTableDialog() {
        var shell = createModalShell(t('insertTableTitle', '插入表格', 'Insert Table'));
        var nightMode = shell.nightMode;
        var container = shell.container;

        var rows = 3;
        var cols = 3;

        var controls = document.createElement('div');
        controls.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:12px;';

        function makeCounter(labelText, getValue, setValue, min, max) {
            var wrap = document.createElement('div');
            var label = document.createElement('div');
            label.textContent = labelText;
            label.style.cssText = labelStyle(nightMode);

            var row = document.createElement('div');
            row.style.cssText = 'display:flex;align-items:center;gap:8px;';

            var minus = document.createElement('button');
            minus.type = 'button';
            minus.textContent = '−';
            minus.style.cssText = 'width:36px;height:36px;border:1px solid ' + (nightMode ? '#555' : '#ccc') + ';border-radius:6px;background:' + (nightMode ? '#333' : '#fff') + ';color:' + (nightMode ? '#eee' : '#333') + ';cursor:pointer;font-size:18px;';

            var input = document.createElement('input');
            input.type = 'number';
            input.min = String(min);
            input.max = String(max);
            input.value = String(getValue());
            input.style.cssText = fieldStyle(nightMode) + 'text-align:center;';

            var plus = document.createElement('button');
            plus.type = 'button';
            plus.textContent = '+';
            plus.style.cssText = minus.style.cssText;

            function apply(next) {
                setValue(clampInt(next, min, max, getValue()));
                input.value = String(getValue());
                renderPreview();
            }

            minus.onclick = function() { apply(getValue() - 1); };
            plus.onclick = function() { apply(getValue() + 1); };
            input.onchange = function() { apply(input.value); };

            row.appendChild(minus);
            row.appendChild(input);
            row.appendChild(plus);
            wrap.appendChild(label);
            wrap.appendChild(row);
            return wrap;
        }

        controls.appendChild(makeCounter(
            t('tableRowsLabel', '行数', 'Rows'),
            function() { return rows; },
            function(v) { rows = v; },
            1, 30
        ));
        controls.appendChild(makeCounter(
            t('tableColsLabel', '列数', 'Columns'),
            function() { return cols; },
            function(v) { cols = v; },
            1, 20
        ));
        container.appendChild(controls);

        var previewWrap = document.createElement('div');
        previewWrap.style.cssText = 'border:1px solid ' + (nightMode ? '#444' : '#ddd') + ';border-radius:8px;padding:10px;overflow:auto;max-height:280px;background:' + (nightMode ? '#1f1f1f' : '#fafafa') + ';';

        var previewHint = document.createElement('div');
        previewHint.style.cssText = 'font-size:12px;color:' + (nightMode ? '#aaa' : '#666') + ';margin-bottom:8px;';
        previewHint.textContent = t('tablePreviewHint', '预览（可用 ± 调整行列）', 'Preview (use ± to adjust rows/columns)');
        previewWrap.appendChild(previewHint);

        var previewTable = document.createElement('table');
        previewTable.style.cssText = 'width:100%;border-collapse:collapse;font-size:12px;';
        previewWrap.appendChild(previewTable);
        container.appendChild(previewWrap);

        function renderPreview() {
            previewTable.innerHTML = '';
            var thead = document.createElement('thead');
            var headRow = document.createElement('tr');
            for (var c = 0; c < cols; c++) {
                var th = document.createElement('th');
                th.textContent = isEn() ? ('Col ' + (c + 1)) : ('列' + (c + 1));
                th.style.cssText = 'border:1px solid ' + (nightMode ? '#555' : '#ccc') + ';padding:6px 8px;background:' + (nightMode ? '#333' : '#eef4fc') + ';color:' + (nightMode ? '#eee' : '#333') + ';';
                headRow.appendChild(th);
            }
            thead.appendChild(headRow);
            previewTable.appendChild(thead);

            var tbody = document.createElement('tbody');
            for (var r = 0; r < rows; r++) {
                var tr = document.createElement('tr');
                for (var c2 = 0; c2 < cols; c2++) {
                    var td = document.createElement('td');
                    td.textContent = isEn() ? ('…') : ('…');
                    td.style.cssText = 'border:1px solid ' + (nightMode ? '#555' : '#ccc') + ';padding:6px 8px;text-align:center;color:' + (nightMode ? '#bbb' : '#888') + ';min-width:48px;';
                    tr.appendChild(td);
                }
                tbody.appendChild(tr);
            }
            previewTable.appendChild(tbody);
        }

        renderPreview();

        addButtonBar(container, nightMode, function() {
            try {
                var markdown = buildTableMarkdown(rows, cols);
                if (insertMarkdown(markdown)) {
                    global.showMessage(t('tableInserted', '表格已插入，可编辑表格内容', 'Table inserted, you can edit the content'));
                }
            } catch (e) {
                console.error('插入表格错误', e);
                global.showMessage(t('insertTableFailed', '插入表格失败，请重试', 'Failed to insert table'), 'error');
                return false;
            }
            return true;
        });
    }

    global.showInsertCodeBlockDialog = showInsertCodeBlockDialog;
    global.showInsertLinkDialog = showInsertLinkDialog;
    global.showInsertWebImageDialog = showInsertWebImageDialog;
    global.showInsertTableDialog = showInsertTableDialog;
    global.buildTableMarkdown = buildTableMarkdown;

})(typeof window !== 'undefined' ? window : this);
