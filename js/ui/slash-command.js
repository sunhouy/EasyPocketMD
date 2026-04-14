const SLASH_PANEL_ID = 'slashCommandPanel';

const state = {
    initialized: false,
    panel: null,
    list: null,
    empty: null,
    title: null,
    hint: null,
    close: null,
    editorElement: null,
    items: [],
    activeIndex: 0,
    visible: false,
    slashContext: null,
    composing: false,
    executing: false,
    requestSeq: 0,
    refreshTimer: null,
    handlers: null,
    docBound: false,
    ignoreSelectionChangeUntil: 0
};

const moduleLoaders = {
    insertPicker: function() { return import('./insert-picker.js'); },
    formulaPicker: function() { return import('../formula-picker.js'); },
    chartPicker: function() { return import('./chart.js'); },
    emojiPicker: function() { return import('../emoji-picker.js'); },
    exportPanel: function() { return import('./export.js'); },
    sharePanel: function() { return import('./share.js'); },
    printPanel: function() { return import('./print.js'); },
    aiAssistant: function() { return import('./ai-assistant.js'); },
    fileManager: function() { return import('./file-manager.js'); },
    uncertaintyCalculator: function() { return import('../uncertainty-calculator.js'); }
};

const loadedModules = {};

const actionInsertFallback = {
    insertTable: '| 列1 | 列2 |\n| --- | --- |\n| 内容1 | 内容2 |',
    insertMermaid: '```mermaid\ngraph TD\n    A[开始] --> B[步骤]\n```',
    insertInlineFormula: '$x^2$',
    insertBlockFormula: '$$\nE=mc^2\n$$'
};

function isEnglish() {
    return !!(window.i18n && window.i18n.getLanguage && window.i18n.getLanguage() === 'en');
}

function currentLanguageCode() {
    return isEnglish() ? 'en' : 'zh';
}

function notify(message, type) {
    if (typeof window.showMessage === 'function') {
        window.showMessage(message, type || 'info');
    }
}

function getEditorElement() {
    var vditor = window.vditor;
    if (!vditor || !vditor.vditor) return null;

    var mode = vditor.vditor.currentMode || vditor.vditor.mode || (vditor.vditor.currentOptions && vditor.vditor.currentOptions.mode);
    if (mode === 'wysiwyg' && vditor.vditor.wysiwyg) return vditor.vditor.wysiwyg.element;
    if (mode === 'ir' && vditor.vditor.ir) return vditor.vditor.ir.element;
    if (mode === 'sv' && vditor.vditor.sv) return vditor.vditor.sv.element;
    if (vditor.vditor.wysiwyg) return vditor.vditor.wysiwyg.element;
    if (vditor.vditor.ir) return vditor.vditor.ir.element;
    if (vditor.vditor.sv) return vditor.vditor.sv.element;
    return null;
}

function isSlashFeatureEnabled() {
    return !window.userSettings || window.userSettings.enableSlashCommand !== false;
}

function activationKey() {
    return (window.userSettings && window.userSettings.slashCommandActivationKey) || 'Tab';
}

function shouldUseSlash() {
    if (!isSlashFeatureEnabled()) return false;
    var gateway = window.wasmTextEngineGateway;
    return !!(gateway && typeof gateway.ensureReady === 'function' && typeof gateway.slashPalette === 'function');
}

function isSlashWordDelimiter(ch) {
    if (!ch) return false;
    return /[\s\(\[\{\"'`~!@#$%^&*+=|\\:;,.<>?，。；：、！？（）【】《》]/.test(ch);
}

function hasSlashWordDelimiter(text) {
    if (!text) return false;
    for (var i = 0; i < text.length; i++) {
        if (isSlashWordDelimiter(text.charAt(i))) {
            return true;
        }
    }
    return false;
}

function canTriggerSlash(textBefore, slashIndex) {
    if (slashIndex < 0) return false;
    if (slashIndex === 0) return true;
    return isSlashWordDelimiter(textBefore.charAt(slashIndex - 1));
}

function isNodeInsideEditor(node, editorElement) {
    if (!node || !editorElement) return false;
    if (node === editorElement) return true;
    if (node.nodeType === 3) {
        return !!(node.parentNode && editorElement.contains(node.parentNode));
    }
    return editorElement.contains(node);
}

function closestBlock(node, editorElement) {
    var current = node && node.nodeType === 3 ? node.parentElement : node;
    while (current && current !== editorElement) {
        if (/^(P|DIV|LI|TD|TH|H1|H2|H3|H4|H5|H6|PRE|BLOCKQUOTE)$/.test(current.tagName || '')) {
            return current;
        }
        current = current.parentElement;
    }
    return editorElement;
}

function getSlashContext(editorElement) {
    var selection = window.getSelection ? window.getSelection() : null;
    if (!selection || selection.rangeCount === 0) return null;
    if (!selection.isCollapsed) return null;

    var anchorNode = selection.anchorNode;
    if (!isNodeInsideEditor(anchorNode, editorElement)) return null;

    var block = closestBlock(anchorNode, editorElement);
    if (!block) return null;

    var beforeRange = document.createRange();
    beforeRange.selectNodeContents(block);
    beforeRange.setEnd(selection.anchorNode, selection.anchorOffset);
    var textBefore = beforeRange.toString();

    if (!textBefore) return null;

    var slashIndex = textBefore.lastIndexOf('/');
    if (!canTriggerSlash(textBefore, slashIndex)) return null;

    var query = textBefore.slice(slashIndex + 1);
    if (query.indexOf('\n') !== -1 || query.indexOf('\r') !== -1) return null;
    if (query.length > 80) return null;
    if (hasSlashWordDelimiter(query)) return null;

    return {
        block: block,
        query: query,
        slashOffsetInBlock: slashIndex,
        caretNode: selection.anchorNode,
        caretOffset: selection.anchorOffset
    };
}

function resolveOffsetToNode(container, targetOffset) {
    var walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
    var consumed = 0;
    var node;

    while ((node = walker.nextNode())) {
        var textLength = (node.textContent || '').length;
        if (consumed + textLength >= targetOffset) {
            return {
                node: node,
                offset: Math.max(0, targetOffset - consumed)
            };
        }
        consumed += textLength;
    }

    if (container.nodeType === 3) {
        return {
            node: container,
            offset: Math.min(targetOffset, (container.textContent || '').length)
        };
    }

    return null;
}

function restoreCaretFromContext(context) {
    if (!context || !context.caretNode) return false;

    var selection = window.getSelection ? window.getSelection() : null;
    if (!selection) return false;

    try {
        var range = document.createRange();
        range.setStart(context.caretNode, context.caretOffset);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
        return true;
    } catch (error) {
        return false;
    }
}

function removeSlashQuery(context) {
    if (!context || !context.block) return false;

    restoreCaretFromContext(context);

    var selection = window.getSelection ? window.getSelection() : null;
    if (!selection) return false;

    var startPoint = resolveOffsetToNode(context.block, context.slashOffsetInBlock);
    if (!startPoint) return false;

    try {
        var range = document.createRange();
        range.setStart(startPoint.node, startPoint.offset);
        range.setEnd(context.caretNode, context.caretOffset);
        selection.removeAllRanges();
        selection.addRange(range);
        range.deleteContents();
        selection.removeAllRanges();
        selection.addRange(range);
        return true;
    } catch (error) {
        console.warn('[slash-command] remove slash query failed:', error);
        return false;
    }
}

function insertTextAtCursor(text) {
    if (!text) return false;

    var inserted = false;
    try {
        inserted = !!document.execCommand('insertText', false, text);
    } catch (error) {
        inserted = false;
    }
    if (inserted) return true;

    if (window.vditor && typeof window.vditor.insertValue === 'function') {
        window.vditor.insertValue(text);
        return true;
    }

    var selection = window.getSelection ? window.getSelection() : null;
    if (!selection || selection.rangeCount === 0) return false;

    var range = selection.getRangeAt(0);
    range.deleteContents();
    var textNode = document.createTextNode(text);
    range.insertNode(textNode);
    range.setStartAfter(textNode);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    return true;
}

async function saveCurrentFileSilently() {
    if (!window.currentFileId) return;
    if (typeof window.saveCurrentFile !== 'function') return;

    try {
        await window.saveCurrentFile(false);
    } catch (error) {
        console.warn('[slash-command] auto save failed:', error);
    }
}

function commandLabel(item) {
    if (!item) return '';
    if (isEnglish()) {
        return item.titleEn || item.title || item.titleZh || '';
    }
    return item.titleZh || item.title || item.titleEn || '';
}

function commandDescription(item) {
    if (!item) return '';
    if (isEnglish()) {
        return item.descriptionEn || item.description || item.descriptionZh || '';
    }
    return item.descriptionZh || item.description || item.descriptionEn || '';
}

function clickFirstExistingButton(ids) {
    if (!Array.isArray(ids)) return false;
    for (var i = 0; i < ids.length; i++) {
        var el = document.getElementById(ids[i]);
        if (el) {
            el.click();
            return true;
        }
    }
    return false;
}

async function ensureImported(moduleKey) {
    if (loadedModules[moduleKey]) return true;

    var loader = moduleLoaders[moduleKey];
    if (typeof loader !== 'function') {
        console.warn('[slash-command] unknown module key:', moduleKey);
        return false;
    }

    try {
        await loader();
        loadedModules[moduleKey] = true;
        return true;
    } catch (error) {
        console.warn('[slash-command] import failed:', moduleKey, error);
        return false;
    }
}

function activateUploadInput() {
    var uploadInput = document.getElementById('upload');
    if (!uploadInput) return false;
    uploadInput.click();
    return true;
}

async function runAction(action) {
    switch (action) {
        case 'openFileList': {
            var sidebar = document.getElementById('fileListSidebar');
            if (sidebar) {
                sidebar.classList.toggle('show');
                return true;
            }
            return clickFirstExistingButton(['mobileFileBtn', 'desktopFileBtn', 'mobileBottomFileListBtn']);
        }

        case 'showFileListHelp': {
            var fileListHelp = document.getElementById('fileListHelp');
            if (fileListHelp) {
                fileListHelp.click();
                return true;
            }
            return false;
        }

        case 'showFileManager':
            if (typeof window.showFileManager !== 'function') await ensureImported('fileManager');
            if (typeof window.showFileManager === 'function') {
                window.showFileManager();
                return true;
            }
            return clickFirstExistingButton(['mobileFileManagerBtn', 'desktopFileManagerBtn']);

        case 'newFile':
            if (typeof window.createNewFile === 'function') {
                window.createNewFile();
                return true;
            }
            return false;

        case 'newFolder':
            if (typeof window.createNewFolder === 'function') {
                window.createNewFolder();
                return true;
            }
            return false;

        case 'openHistory':
            if (typeof window.showHistoryModal === 'function' && window.currentFileId) {
                var current = (window.files || []).find(function(file) { return file.id === window.currentFileId; });
                window.showHistoryModal(window.currentFileId, current ? current.name : '');
                return true;
            }
            return false;

        case 'renameFile':
            if (typeof window.renameFile === 'function' && window.currentFileId) {
                window.renameFile(window.currentFileId);
                return true;
            }
            return false;

        case 'moveFile':
            if (typeof window.moveFile === 'function' && window.currentFileId) {
                window.moveFile(window.currentFileId);
                return true;
            }
            return false;

        case 'deleteFile':
            if (typeof window.deleteFile === 'function' && window.currentFileId) {
                await window.deleteFile(window.currentFileId);
                return true;
            }
            return false;

        case 'openLocalFile':
            if (typeof window.openExternalLocalFileByDialog === 'function') {
                await window.openExternalLocalFileByDialog();
                return true;
            }
            return clickFirstExistingButton(['mobileOpenLocalFileBtn', 'desktopOpenLocalFileBtn']);

        case 'openDiff':
            if (typeof window.showFileDiffDialog === 'function') {
                window.showFileDiffDialog();
                return true;
            }
            return clickFirstExistingButton(['mobileFileDiffBtn', 'desktopFileDiffBtn']);

        case 'login':
        case 'register':
            if (typeof window.handleLoginButtonClick === 'function') {
                window.handleLoginButtonClick();
                return true;
            }
            return clickFirstExistingButton(['mobileLoginBtn', 'desktopLoginBtn']);

        case 'logout':
            if (typeof window.logout === 'function') {
                await window.logout();
                return true;
            }
            return false;

        case 'showInsertPicker':
            if (typeof window.showInsertPicker !== 'function') await ensureImported('insertPicker');
            if (typeof window.showInsertPicker === 'function') {
                window.showInsertPicker();
                return true;
            }
            return clickFirstExistingButton(['mobileInsertBtn', 'desktopInsertBtn']);

        case 'showFootnotePicker':
            if (typeof window.showFootnotePicker !== 'function') await ensureImported('insertPicker');
            if (typeof window.showFootnotePicker === 'function') {
                window.showFootnotePicker();
                return true;
            }
            return clickFirstExistingButton(['mobileInsertBtn', 'desktopInsertBtn']);

        case 'showMindmapPicker':
            if (typeof window.showMindmapPicker !== 'function') await ensureImported('insertPicker');
            if (typeof window.showMindmapPicker === 'function') {
                window.showMindmapPicker();
                return true;
            }
            return clickFirstExistingButton(['mobileInsertBtn', 'desktopInsertBtn']);

        case 'showFormulaPicker':
            if (typeof window.showFormulaPicker !== 'function') await ensureImported('formulaPicker');
            if (typeof window.showFormulaPicker === 'function') {
                window.showFormulaPicker();
                return true;
            }
            return clickFirstExistingButton(['mobileFormulaBtn', 'desktopFormulaBtn']);

        case 'showChartPicker':
        case 'showEChartsPicker':
            if (typeof window.showChartPicker !== 'function') await ensureImported('chartPicker');
            if (typeof window.showChartPicker === 'function') {
                window.showChartPicker();
                return true;
            }
            return clickFirstExistingButton(['mobileChartBtn', 'desktopChartBtn']);

        case 'showEmojiPicker':
            if (typeof window.showEmojiPicker !== 'function') await ensureImported('emojiPicker');
            if (typeof window.showEmojiPicker === 'function') {
                window.showEmojiPicker();
                return true;
            }
            return false;

        case 'uploadImage':
        case 'uploadFile':
            return activateUploadInput();

        case 'saveCurrentFile':
            if (typeof window.saveCurrentFile === 'function') {
                await window.saveCurrentFile(true);
                return true;
            }
            return clickFirstExistingButton(['saveFileBtn', 'mobileBottomSaveBtn', 'desktopEditSaveBtn']);

        case 'undo':
            if (window.vditor && window.vditor.vditor && window.vditor.vditor.undo) {
                window.vditor.vditor.undo.undo(window.vditor.vditor);
                return true;
            }
            return clickFirstExistingButton(['mobileUndoBtn', 'desktopEditUndoBtn']);

        case 'redo':
            if (window.vditor && window.vditor.vditor && window.vditor.vditor.undo) {
                window.vditor.vditor.undo.redo(window.vditor.vditor);
                return true;
            }
            return clickFirstExistingButton(['mobileRedoBtn', 'desktopEditRedoBtn']);

        case 'openFindReplace':
        case 'searchFiles':
            if (typeof window.showFindDialog === 'function') {
                window.showFindDialog();
                return true;
            }
            return clickFirstExistingButton(['mobileFindBtn', 'desktopFindBtn']);

        case 'clearContent':
            if (window.vditor) {
                window.vditor.setValue('');
                return true;
            }
            return clickFirstExistingButton(['mobileClearBtn', 'desktopClearBtn']);

        case 'openSettings':
        case 'themeMode':
        case 'changeEditorMode':
        case 'changeUiMode':
        case 'changeFontSize':
        case 'toggleOutline':
        case 'changeStorageLocation':
        case 'toggleMdAssociation':
        case 'configureToolbarButtons':
        case 'toggleWasmTextEngine':
            if (typeof window.showSettingsDialog === 'function') {
                window.showSettingsDialog();
                return true;
            }
            return clickFirstExistingButton(['mobileSettingsBtn', 'desktopSettingsBtn', 'mobileBottomSettingsBtn']);

        case 'showModeSelection':
            return clickFirstExistingButton(['desktopModeBtn', 'mobileModeBtn']);

        case 'setModeWysiwyg':
        case 'setModeIr':
        case 'setModeSv': {
            var modeValue = action === 'setModeWysiwyg' ? 'wysiwyg' : (action === 'setModeIr' ? 'ir' : 'sv');
            localStorage.setItem('vditor_editor_mode', modeValue);
            window.location.reload();
            return true;
        }

        case 'setLightMode':
        case 'setDarkMode':
        case 'setSystemMode': {
            var theme = action === 'setLightMode' ? 'light' : (action === 'setDarkMode' ? 'dark' : 'system');
            window.userSettings = window.userSettings || {};
            window.userSettings.themeMode = theme;
            localStorage.setItem('vditor_settings', JSON.stringify(window.userSettings));
            window.location.reload();
            return true;
        }

        case 'exportMd':
        case 'exportTxt':
        case 'exportHtml':
        case 'exportDocx':
        case 'exportPdf':
        case 'exportPpt':
        case 'openExportMenu':
            if (typeof window.exportContent !== 'function') await ensureImported('exportPanel');
            if (typeof window.exportContent === 'function') {
                window.exportContent();
                return true;
            }
            return clickFirstExistingButton(['mobileExportBtn', 'desktopExportBtn', 'mobileBottomExportBtn']);

        case 'shareDocument':
            if (typeof window.showShareDialog !== 'function') await ensureImported('sharePanel');
            if (typeof window.showShareDialog === 'function') {
                window.showShareDialog();
                return true;
            }
            return clickFirstExistingButton(['mobileShareBtn', 'desktopShareBtn', 'mobileBottomShareBtn']);

        case 'importFiles':
            if (typeof window.importFiles === 'function') {
                window.importFiles();
                return true;
            }
            return clickFirstExistingButton(['mobileImportBtn', 'desktopImportBtn', 'mobileBottomImportBtn']);

        case 'showPrintDialog':
            if (typeof window.showPrintDialog !== 'function') await ensureImported('printPanel');
            if (typeof window.showPrintDialog === 'function') {
                window.showPrintDialog();
                return true;
            }
            return clickFirstExistingButton(['mobilePrintBtn', 'desktopPrintBtn']);

        case 'videoCall': {
            var modal = document.getElementById('videoCallModalOverlay');
            var iframe = document.getElementById('videoCallIframe');
            if (modal && iframe) {
                var isDarkMode = window.nightMode || document.body.classList.contains('night-mode');
                iframe.src = 'https://webrtc.yhsun.cn/' + (isDarkMode ? '?darkMode=true' : '');
                modal.classList.add('show');
                return true;
            }
            return clickFirstExistingButton(['mobileVideoCallBtn']);
        }

        case 'presentationMode':
            return clickFirstExistingButton(['desktopPresentationBtn', 'mobilePresentationBtn']);

        case 'openAIAssistant':
            if (typeof window.showAIPanel !== 'function') await ensureImported('aiAssistant');
            if (typeof window.showAIPanel === 'function') {
                window.showAIPanel();
                return true;
            }
            return clickFirstExistingButton(['mobileAIBtn']);

        case 'serviceStatus':
            if (typeof window.showServiceStatusDialog === 'function') {
                window.showServiceStatusDialog();
                return true;
            }
            return clickFirstExistingButton(['serviceStatusBtn']);

        case 'help':
            if (typeof window.showAboutDialog === 'function') {
                window.showAboutDialog();
                return true;
            }
            return clickFirstExistingButton(['aboutBtn', 'desktopAboutBtn']);

        case 'openUncertaintyCalculator':
            if (typeof window.showUncertaintyCalculator !== 'function') await ensureImported('uncertaintyCalculator');
            if (typeof window.showUncertaintyCalculator === 'function') {
                window.showUncertaintyCalculator();
                return true;
            }
            return clickFirstExistingButton(['mobileUncertaintyBtn']);

        default:
            return false;
    }
}

function createPanel() {
    if (state.panel && document.body.contains(state.panel)) return;

    var panel = document.createElement('div');
    panel.id = SLASH_PANEL_ID;
    panel.className = 'slash-command-panel';
    panel.style.display = 'none';

    var header = document.createElement('div');
    header.className = 'slash-command-header';

    var title = document.createElement('div');
    title.className = 'slash-command-title';
    header.appendChild(title);

    var hint = document.createElement('div');
    hint.className = 'slash-command-hint';
    header.appendChild(hint);

    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'slash-command-close';
    close.innerHTML = '<i class="fas fa-times"></i>';
    close.addEventListener('mousedown', function(event) {
        event.preventDefault();
    });
    close.addEventListener('click', function(event) {
        event.preventDefault();
        event.stopPropagation();
        hidePanel();
    });
    header.appendChild(close);

    var list = document.createElement('div');
    list.className = 'slash-command-list';

    list.addEventListener('mousedown', function(event) {
        if (event.button !== 0) return;

        var target = event.target;
        var start = target && target.nodeType === 3 ? target.parentElement : target;
        var row = start && start.closest ? start.closest('.slash-command-item') : null;
        if (!row) return;

        // Keep the editor caret alive so clicking an item does not blur the editor
        // and collapse the slash panel before the click handler runs.
        event.preventDefault();
        state.ignoreSelectionChangeUntil = Date.now() + 500;
    });

    var activateByEvent = function(event) {
        if (!event) return;

        var target = event.target;
        var start = target && target.nodeType === 3 ? target.parentElement : target;
        var row = start && start.closest ? start.closest('.slash-command-item') : null;
        if (!row) return;

        event.preventDefault();
        event.stopPropagation();

        state.ignoreSelectionChangeUntil = Date.now() + 500;

        var index = Number(row.dataset.index);
        if (!Number.isFinite(index)) return;
        executeByIndex(index);
    };

    list.addEventListener('click', function(event) {
        activateByEvent(event);
    });

    var empty = document.createElement('div');
    empty.className = 'slash-command-empty';
    empty.style.display = 'none';

    panel.addEventListener('pointerdown', function() {
        state.ignoreSelectionChangeUntil = Date.now() + 500;
    });

    panel.addEventListener('touchstart', function() {
        state.ignoreSelectionChangeUntil = Date.now() + 500;
    }, { passive: true });

    panel.appendChild(header);
    panel.appendChild(list);
    panel.appendChild(empty);

    state.panel = panel;
    state.list = list;
    state.empty = empty;
    state.title = title;
    state.hint = hint;
    state.close = close;

    updatePanelHeader();
    document.body.appendChild(panel);
}

function updatePanelHeader() {
    if (!state.panel) return;

    var en = isEnglish();
    state.title.textContent = en ? '/ Commands' : '/ 快捷操作';

    var key = activationKey();
    if (key === 'Off' || key === 'Custom') {
        state.hint.textContent = en ? 'Click to run' : '点击执行';
    } else {
        state.hint.textContent = (en ? 'Press ' : '按 ') + key + (en ? ' to run' : ' 执行');
    }

    if (state.close) {
        state.close.title = en ? 'Close' : '关闭';
        state.close.setAttribute('aria-label', en ? 'Close slash commands' : '关闭快捷操作');
    }
}

function showPanel() {
    if (!state.panel) return;
    updatePanelHeader();
    state.panel.style.display = 'block';
    state.visible = true;
}

function hidePanel() {
    if (!state.panel) return;
    state.panel.style.display = 'none';
    state.visible = false;
    state.items = [];
    state.activeIndex = 0;
    state.slashContext = null;
}

function scheduleRefresh(delay) {
    if (state.refreshTimer) {
        clearTimeout(state.refreshTimer);
    }
    state.refreshTimer = setTimeout(function() {
        state.refreshTimer = null;
        refreshFromCaret();
    }, typeof delay === 'number' ? delay : 60);
}

function renderItems() {
    if (!state.list || !state.empty) return;

    state.list.innerHTML = '';

    if (!Array.isArray(state.items) || state.items.length === 0) {
        state.empty.style.display = 'block';
        state.empty.textContent = isEnglish() ? 'No matching commands' : '未找到匹配操作';
        return;
    }

    state.empty.style.display = 'none';

    state.items.forEach(function(item, index) {
        var row = document.createElement('button');
        row.type = 'button';
        row.className = 'slash-command-item' + (index === state.activeIndex ? ' active' : '');
        row.dataset.index = String(index);

        var iconClass = item.icon || 'fas fa-terminal';
        var title = commandLabel(item);
        var desc = commandDescription(item);
        var groupLabel = item.groupLabel || item.group || '';

        row.innerHTML =
            '<span class="slash-command-item-icon"><i class="' + iconClass + '"></i></span>' +
            '<span class="slash-command-item-content">' +
                '<span class="slash-command-item-title">' + title + '</span>' +
                '<span class="slash-command-item-desc">' + desc + '</span>' +
            '</span>' +
            '<span class="slash-command-item-group">' + groupLabel + '</span>';

        row.addEventListener('mouseenter', function() {
            setActiveIndex(index, false);
        });

        state.list.appendChild(row);
    });

    updateActiveRowClasses();
    ensureActiveItemVisible();
}

function updateActiveRowClasses() {
    if (!state.list) return;
    var rows = state.list.querySelectorAll('.slash-command-item');
    rows.forEach(function(row, index) {
        if (index === state.activeIndex) {
            row.classList.add('active');
        } else {
            row.classList.remove('active');
        }
    });
}

function setActiveIndex(index, shouldScroll) {
    if (!Array.isArray(state.items) || state.items.length === 0) return;
    if (index < 0 || index >= state.items.length) return;
    if (state.activeIndex === index) return;
    state.activeIndex = index;
    updateActiveRowClasses();
    if (shouldScroll) {
        ensureActiveItemVisible();
    }
}

function ensureActiveItemVisible() {
    if (!state.list) return;

    var activeItem = state.list.querySelector('.slash-command-item.active');
    if (!activeItem) return;

    var itemTop = activeItem.offsetTop;
    var itemBottom = itemTop + activeItem.offsetHeight;
    var viewTop = state.list.scrollTop;
    var viewBottom = viewTop + state.list.clientHeight;

    if (itemTop < viewTop) {
        state.list.scrollTop = itemTop;
        return;
    }
    if (itemBottom > viewBottom) {
        state.list.scrollTop = itemBottom - state.list.clientHeight;
    }
}

function isActivationEvent(event, key) {
    if (!event || !key) return false;
    if (key === 'Tab') return event.key === 'Tab' && !event.ctrlKey && !event.metaKey && !event.altKey;
    if (key === 'Enter') return event.key === 'Enter' && !event.ctrlKey && !event.metaKey && !event.altKey;
    if (key === 'Space') return (event.code === 'Space' || event.key === ' ') && !event.ctrlKey && !event.metaKey && !event.altKey;
    if (key === 'Ctrl+K') return event.ctrlKey && !event.altKey && !event.metaKey && String(event.key).toLowerCase() === 'k';
    if (key === 'Ctrl+J') return event.ctrlKey && !event.altKey && !event.metaKey && String(event.key).toLowerCase() === 'j';
    if (key === 'Alt+Space') return event.altKey && !event.ctrlKey && !event.metaKey && (event.code === 'Space' || event.key === ' ');
    return false;
}

async function executeCommand(item, context) {
    hidePanel();
    if (!item) return;

    var editor = getEditorElement();
    if (editor && typeof editor.focus === 'function') {
        editor.focus();
    }

    var removed = removeSlashQuery(context);
    if (removed) {
        await saveCurrentFileSilently();
    }

    var action = item.action || '';
    var insertText = item.insertText || actionInsertFallback[action] || '';

    var actionHandled = await runAction(action);
    if (!actionHandled && insertText) {
        insertTextAtCursor(insertText);
        await saveCurrentFileSilently();
        return;
    }

    if (!actionHandled && !insertText) {
        notify(isEnglish() ? 'Command is not available yet' : '该操作暂未开放', 'warning');
    }
}

function executeByIndex(index) {
    if (state.executing) return;

    var item = state.items[index];
    if (!item) return;

    var context = state.slashContext;
    state.executing = true;

    Promise.resolve(executeCommand(item, context)).catch(function(error) {
        console.error('[slash-command] execute failed:', error);
        notify(isEnglish() ? 'Command execution failed' : '快捷操作执行失败', 'error');
    }).finally(function() {
        setTimeout(function() {
            state.executing = false;
        }, 0);
    });
}

async function fetchPaletteItems(query) {
    var gateway = window.wasmTextEngineGateway;
    if (!gateway) return [];

    var ready = await gateway.ensureReady();
    if (!ready || ready.code !== 200) {
        return [];
    }

    var result = gateway.slashPalette(query || '', {
        language: currentLanguageCode(),
        limit: 80,
        includeHidden: false
    });

    if (!result || result.code !== 200 || !result.data || !Array.isArray(result.data.items)) {
        return [];
    }

    return result.data.items;
}

async function refreshFromCaret() {
    if (!shouldUseSlash()) {
        hidePanel();
        return;
    }

    var editorElement = state.editorElement;
    if (!editorElement) {
        hidePanel();
        return;
    }

    var context = getSlashContext(editorElement);
    if (!context) {
        hidePanel();
        return;
    }

    state.slashContext = context;

    var requestId = ++state.requestSeq;
    var items = await fetchPaletteItems(context.query);
    if (requestId !== state.requestSeq) return;

    state.items = items;
    state.activeIndex = 0;

    if (state.items.length === 0 && !context.query) {
        hidePanel();
        return;
    }

    createPanel();
    renderItems();
    showPanel();
}

function moveActive(delta) {
    if (!state.items.length) return;
    var count = state.items.length;
    var nextIndex = (state.activeIndex + delta + count) % count;
    setActiveIndex(nextIndex, true);
}

function onEditorKeyDown(event) {
    if (state.composing) return;

    if (!state.visible) {
        if (event.key === '/' || event.key === 'Process') {
            scheduleRefresh(20);
        }
        return;
    }

    if (event.key === 'ArrowDown') {
        event.preventDefault();
        moveActive(1);
        return;
    }

    if (event.key === 'ArrowUp') {
        event.preventDefault();
        moveActive(-1);
        return;
    }

    if (event.key === 'Escape') {
        event.preventDefault();
        hidePanel();
        return;
    }

    if (isActivationEvent(event, activationKey())) {
        event.preventDefault();
        executeByIndex(state.activeIndex);
    }
}

function onEditorInput() {
    if (state.composing) return;
    scheduleRefresh();
}

function onEditorClick() {
    scheduleRefresh();
}

function onEditorCompositionStart() {
    state.composing = true;
}

function onEditorCompositionEnd() {
    state.composing = false;
    scheduleRefresh();
}

function bindEditorEvents(editorElement) {
    if (state.editorElement === editorElement && state.handlers) {
        return;
    }

    if (state.editorElement && state.handlers) {
        state.editorElement.removeEventListener('keydown', state.handlers.keydown);
        state.editorElement.removeEventListener('input', state.handlers.input);
        state.editorElement.removeEventListener('click', state.handlers.click);
        state.editorElement.removeEventListener('compositionstart', state.handlers.compositionstart);
        state.editorElement.removeEventListener('compositionend', state.handlers.compositionend);
    }

    state.editorElement = editorElement;

    if (!editorElement) {
        hidePanel();
        return;
    }

    state.handlers = {
        keydown: onEditorKeyDown,
        input: onEditorInput,
        click: onEditorClick,
        compositionstart: onEditorCompositionStart,
        compositionend: onEditorCompositionEnd
    };

    editorElement.addEventListener('keydown', state.handlers.keydown);
    editorElement.addEventListener('input', state.handlers.input);
    editorElement.addEventListener('click', state.handlers.click);
    editorElement.addEventListener('compositionstart', state.handlers.compositionstart);
    editorElement.addEventListener('compositionend', state.handlers.compositionend);
}

function bindDocumentEventsOnce() {
    if (state.docBound) return;
    state.docBound = true;

    document.addEventListener('pointerdown', function(event) {
        if (!state.visible) return;
        var target = event.target;
        if (state.panel && state.panel.contains(target)) return;
        if (state.editorElement && state.editorElement.contains(target)) return;
        hidePanel();
    }, true);

    document.addEventListener('selectionchange', function() {
        if (!state.visible) return;
        if (state.composing) return;
        if (Date.now() < state.ignoreSelectionChangeUntil) return;
        scheduleRefresh();
    });

    window.addEventListener('resize', function() {
        if (!state.visible) return;
        updatePanelHeader();
    });
}

export function initSlashCommandRuntime() {
    createPanel();
    bindDocumentEventsOnce();

    if (!shouldUseSlash()) {
        hidePanel();
        return;
    }

    bindEditorEvents(getEditorElement());
    updatePanelHeader();

    if (!state.initialized) {
        state.initialized = true;
    }
}
