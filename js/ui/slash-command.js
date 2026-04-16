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
let builtinSlashEntries = null;
let builtinSlashLoadPromise = null;

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
    // Try to use the upload.js functions first
    if (typeof window.triggerImageUpload === 'function') {
        window.triggerImageUpload();
        return true;
    }
    if (typeof window.triggerFileUpload === 'function') {
        window.triggerFileUpload();
        return true;
    }
    // Fallback: try to find upload input
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
            return clickFirstExistingButton(['fileManagementFabNewFile']);

        case 'newFolder':
            if (typeof window.createNewFolder === 'function') {
                window.createNewFolder();
                return true;
            }
            return clickFirstExistingButton(['fileManagementFabNewFolder']);

        case 'openHistory':
            if (typeof window.showHistoryModal === 'function' && window.currentFileId) {
                var current = (window.files || []).find(function(file) { return file.id === window.currentFileId; });
                window.showHistoryModal(window.currentFileId, current ? current.name : '');
                return true;
            }
            // Fallback: try to show history if currentFileId is available but function wasn't loaded
            if (window.currentFileId) {
                if (typeof window.showHistoryModal !== 'function') await ensureImported('fileManager');
                if (typeof window.showHistoryModal === 'function') {
                    var current = (window.files || []).find(function(file) { return file.id === window.currentFileId; });
                    window.showHistoryModal(window.currentFileId, current ? current.name : '');
                    return true;
                }
            }
            return false;

        case 'renameFile':
            if (typeof window.renameFile === 'function' && window.currentFileId) {
                window.renameFile(window.currentFileId);
                return true;
            }
            // Fallback: if current file exists, try to trigger file management
            if (window.currentFileId) {
                var current = (window.files || []).find(function(file) { return file.id === window.currentFileId; });
                if (current) {
                    global.showMessage('请在文件列表中右键文件进行重命名', 'info');
                    return true;
                }
            }
            return false;

        case 'moveFile':
            if (typeof window.moveFile === 'function' && window.currentFileId) {
                window.moveFile(window.currentFileId);
                return true;
            }
            // Fallback: if current file exists, try to trigger file management
            if (window.currentFileId) {
                var current = (window.files || []).find(function(file) { return file.id === window.currentFileId; });
                if (current) {
                    global.showMessage('请在文件列表中右键文件进行移动', 'info');
                    return true;
                }
            }
            return false;

        case 'deleteFile':
            if (typeof window.deleteFile === 'function' && window.currentFileId) {
                await window.deleteFile(window.currentFileId);
                return true;
            }
            // Fallback: if current file exists, try to trigger file management
            if (window.currentFileId) {
                var current = (window.files || []).find(function(file) { return file.id === window.currentFileId; });
                if (current) {
                    global.showMessage('请在文件列表中右键文件进行删除', 'info');
                    return true;
                }
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
            return clickFirstExistingButton(['mobileLogoutBtn', 'desktopLogoutBtn']);

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
            // Fallback: try to trigger via Vditor's toolbar or direct insert
            if (window.vditor && typeof window.vditor.insertValue === 'function') {
                window.vditor.insertValue('😀');
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
            if (typeof window.showSettingsDialog === 'function') {
                window.showSettingsDialog();
                return true;
            }
            return clickFirstExistingButton(['mobileSettingsBtn', 'desktopSettingsBtn', 'mobileBottomSettingsBtn']);

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
    }

    if (!actionHandled && !insertText) {
        notify(isEnglish() ? 'Command is not available yet' : '该操作暂未开放', 'warning');
    }

    // Record usage in IndexedDB for history-based ordering
    var actionId = item.id || action || '';
    var titleZh = item.titleZh || '';
    var titleEn = item.titleEn || '';
    if (actionId && window.IndexedDBManager && typeof window.IndexedDBManager.incrementSlashUsage === 'function') {
        window.IndexedDBManager.incrementSlashUsage(actionId, titleZh, titleEn).catch(function() {});
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
    var normalizedQuery = (query || '').trim();
    var remoteItems = [];

    if (gateway) {
        var ready = await gateway.ensureReady();
        if (ready && ready.code === 200) {
            var result = gateway.slashPalette(normalizedQuery, {
                language: currentLanguageCode(),
                limit: 80,
                includeHidden: false
            });

            if (result && result.code === 200 && result.data && Array.isArray(result.data.items)) {
                remoteItems = result.data.items;
            }
        }
    }

    var localItems = await searchBuiltinEntries(normalizedQuery, 80);
    if (!remoteItems.length) return localItems;
    if (!localItems.length) return remoteItems;
    return mergePaletteItems(remoteItems, localItems, 80);
}

async function loadBuiltinSlashEntries() {
    if (Array.isArray(builtinSlashEntries)) return builtinSlashEntries;

    if (!builtinSlashLoadPromise) {
        builtinSlashLoadPromise = import('./slash-builtin-index.js').then(function(mod) {
            if (mod && typeof mod.getBuiltinSlashEntries === 'function') {
                builtinSlashEntries = mod.getBuiltinSlashEntries();
            }
            if (!Array.isArray(builtinSlashEntries)) {
                builtinSlashEntries = [];
            }
            return builtinSlashEntries;
        }).catch(function(error) {
            console.warn('[slash-command] load builtin slash index failed:', error);
            builtinSlashEntries = [];
            return builtinSlashEntries;
        });
    }

    return builtinSlashLoadPromise;
}

function normalizeForMatch(text) {
    return String(text || '').toLowerCase();
}

// 汉语转拼音映射（常用汉字）
var chinesePinyinMap = {
    '图': 'tu', '片': 'pian', '插': 'cha', '入': 'ru', '文': 'wen', '件': 'jian',
    '上': 'shang', '传': 'chuan', '链': 'lian', '接': 'jie', '表': 'biao', '格': 'ge',
    '无': 'wu', '序': 'xu', '列': 'lie', '有': 'you', '任': 'ren', '务': 'wu',
    '分': 'fen', '隔': 'ge', '线': 'xian', '情': 'qing', '公': 'gong',
    '式': 'shi', '脚': 'jiao', '注': 'zhu', '脑': 'nao',
    '思': 'si', '维': 'wei', '导': 'dao', '新': 'xin', '建': 'jian',
    '夹': 'jia', '打': 'da', '开': 'kai', '历': 'li',
    '史': 'shi', '重': 'zhong', '命': 'ming', '名': 'ming', '移': 'yi', '动': 'dong',
    '删': 'shan', '除': 'chu', '登': 'deng', '录': 'lu', '册': 'ce',
    '退': 'tui', '出': 'chu', '设': 'she', '置': 'zhi', '模': 'mo',
    '轻': 'qing', '暗': 'an', '主': 'zhu', '题': 'ti', '编': 'bian', '辑': 'ji',
    '撤': 'che', '销': 'xiao', '做': 'zuo', '清': 'qing', '空': 'kong',
    '内': 'nei', '容': 'rong', '享': 'xiang',
    '印': 'yin', '帮': 'bang', '助': 'zhu', '关': 'guan', '于': 'yu',
    '服': 'fu', '状': 'zhuang', '态': 'tai', '计': 'ji', '算': 'suan',
    '器': 'qi', '演': 'yan', '示': 'shi',
    '语': 'yu', '音': 'yin', '频': 'pin', '通': 'tong', '话': 'hua', '搜': 'sou',
    '索': 'suo', '查': 'cha', '找': 'zhao', '替': 'ti', '换': 'huan', '保': 'bao',
    '存': 'cun', '另': 'ling', '页': 'ye', '全': 'quan', '屏': 'ping', '预': 'yu',
    '览': 'lan', '网': 'wang', '络': 'luo', '地': 'di',
    '址': 'zhi', '描': 'miao', '述': 'shu', '代': 'dai', '码': 'ma',
    '块': 'kuai', '行': 'xing', '引': 'yin', '用': 'yong', '粗': 'cu',
    '体': 'ti', '斜': 'xie', '级': 'ji', '签': 'qian', '像': 'xiang',
    '视': 'shi', '附': 'fu',
    '加': 'jia', '载': 'zai', '卸': 'xie',
    '点': 'dian', '赞': 'zan', '踩': 'cai', '好': 'hao', '评': 'ping',
    '差': 'cha', '论': 'lun', '回': 'hui', '复': 'fu',
    '留': 'liu', '言': 'yan', '价': 'jia',
    '投': 'tou', '票': 'piao', '选': 'xuan',
    '举': 'ju', '调': 'diao', '问': 'wen',
    '卷': 'juan', '统': 'tong', '数': 'shu',
    '据': 'ju', '析': 'xi', '报': 'bao', '告': 'gao',
    '管': 'guan', '理': 'li', '相': 'xiang',
    '集': 'ji', '画': 'hua', '库': 'ku', '廊': 'lang',
    '展': 'zhan', '橱': 'chu', '窗': 'chuang',
    '广': 'guang', '推': 'tui', '营': 'ying', '销': 'xiao',
    '荐': 'jian', '精': 'jing', '品': 'pin', '热': 're', '门': 'men',
    '榜': 'bang', '单': 'dan', '次': 'ci',
    '顺': 'shun', '逆': 'ni', '正': 'zheng', '倒': 'dao', '随': 'sui',
    '机': 'ji', '乱': 'luan', '混': 'hun',
    '显': 'xian', '呈': 'cheng', '现': 'xian',
    '的': 'de', '了': 'le', '在': 'zai', '是': 'shi', '我': 'wo', '不': 'bu',
    '人': 'ren', '们': 'men', '中': 'zhong', '来': 'lai', '到': 'dao', '说': 'shuo',
    '会': 'hui', '和': 'he', '也': 'ye', '后': 'hou', '过': 'guo', '自': 'zi',
    '而': 'er', '前': 'qian', '他': 'ta', '这': 'zhe', '那': 'na', '里': 'li',
    '看': 'kan', '听': 'ting', '写': 'xie', '读': 'du', '学': 'xue', '做': 'zuo',
    '想': 'xiang', '知': 'zhi', '道': 'dao', '见': 'jian', '问': 'wen', '答': 'da',
    '买': 'mai', '卖': 'mai', '吃': 'chi', '喝': 'he', '睡': 'shui', '走': 'zou',
    '跑': 'pao', '飞': 'fei', '坐': 'zuo', '站': 'zhan', '停': 'ting', '等': 'deng',
    '给': 'gei', '送': 'song', '拿': 'na', '放': 'fang', '找': 'zhao', '用': 'yong',
    '开': 'kai', '关': 'guan', '闭': 'bi', '始': 'shi', '终': 'zhong',
    '高': 'gao', '低': 'di', '大': 'da', '小': 'xiao', '多': 'duo', '少': 'shao',
    '长': 'chang', '短': 'duan', '远': 'yuan', '近': 'jin', '新': 'xin', '旧': 'jiu',
    '老': 'lao', '男': 'nan', '女': 'nv', '父': 'fu', '母': 'mu',
    '子': 'zi', '儿': 'er', '兄': 'xiong', '弟': 'di', '姐': 'jie',
    '妹': 'mei', '家': 'jia', '国': 'guo', '城': 'cheng', '市': 'shi', '村': 'cun',
    '校': 'xiao', '公': 'gong', '司': 'si', '店': 'dian', '厂': 'chang',
    '医': 'yi', '院': 'yuan', '银': 'yin', '行': 'xing', '餐': 'can', '馆': 'guan',
    '酒': 'jiu', '宾': 'bin', '旅': 'lv', '游': 'you',
    '景': 'jing', '区': 'qu', '园': 'yuan', '博': 'bo', '物': 'wu',
    '书': 'shu', '电': 'dian', '影': 'ying',
    '乐': 'yue', '体': 'ti', '育': 'yu', '场': 'chang', '健': 'jian',
    '身': 'shen', '房': 'fang', '美': 'mei', '容': 'rong', '理': 'li',
    '发': 'fa', '超': 'chao', '商': 'shang',
    '百': 'bai', '货': 'huo', '楼': 'lou', '菜': 'cai',
    '花': 'hua', '鸟': 'niao', '鱼': 'yu', '虫': 'chong', '猫': 'mao', '狗': 'gou',
    '猪': 'zhu', '牛': 'niu', '羊': 'yang', '马': 'ma', '鸡': 'ji', '鸭': 'ya',
    '鹅': 'e', '虎': 'hu', '狮': 'shi', '豹': 'bao', '熊': 'xiong', '狼': 'lang',
    '狐': 'hu', '狸': 'li', '兔': 'tu', '鼠': 'shu', '蛇': 'she', '龙': 'long',
    '凤': 'feng', '凰': 'huang', '鹤': 'he', '鹰': 'ying', '燕': 'yan', '雀': 'que',
    '鸽': 'ge', '鹏': 'peng', '鸦': 'ya', '鹊': 'que', '莺': 'ying', '蝉': 'chan',
    '蝶': 'die', '蜂': 'feng', '蚁': 'yi', '蚊': 'wen', '蝇': 'ying', '虾': 'xia',
    '蟹': 'xie', '贝': 'bei', '鲸': 'jing', '鲨': 'sha', '豚': 'tun', '鳄': 'e',
    '龟': 'gui', '鳖': 'bie', '螺': 'luo', '蚌': 'bang', '蚕': 'can', '蛹': 'yong',
    '蛙': 'wa', '蟾': 'chan', '蝌': 'ke', '蚪': 'dou', '蚯': 'qiu', '蚓': 'yin',
    '蛆': 'qu', '蛾': 'e', '萤': 'ying',
    '天': 'tian', '日': 'ri', '月': 'yue', '星': 'xing', '辰': 'chen',
    '云': 'yun', '雨': 'yu', '雪': 'xue', '风': 'feng', '雷': 'lei', '电': 'dian',
    '雾': 'wu', '露': 'lu', '霜': 'shuang', '冰': 'bing', '雹': 'bao', '虹': 'hong',
    '霞': 'xia', '晴': 'qing', '阴': 'yin', '阳': 'yang', '光': 'guang', '明': 'ming',
    '暗': 'an', '黑': 'hei', '白': 'bai', '红': 'hong', '绿': 'lv',
    '蓝': 'lan', '黄': 'huang', '紫': 'zi', '橙': 'cheng', '粉': 'fen', '灰': 'hui',
    '金': 'jin', '银': 'yin', '铜': 'tong', '铁': 'tie', '钢': 'gang', '铝': 'lv',
    '锡': 'xi', '铅': 'qian', '锌': 'xin', '汞': 'gong', '硫': 'liu', '磷': 'lin',
    '硅': 'gui', '硼': 'peng', '碳': 'tan', '氮': 'dan', '氧': 'yang', '氢': 'qing',
    '氦': 'hai', '锂': 'li', '铍': 'pi', '钠': 'na', '镁': 'mei', '钙': 'gai',
    '山': 'shan', '河': 'he', '湖': 'hu', '海': 'hai', '江': 'jiang', '溪': 'xi',
    '泉': 'quan', '瀑': 'pu', '潭': 'tan', '池': 'chi', '塘': 'tang', '沼': 'zhao',
    '泽': 'ze', '洋': 'yang', '湾': 'wan', '港': 'gang', '岛': 'dao', '屿': 'yu',
    '礁': 'jiao', '岩': 'yan', '石': 'shi', '土': 'tu', '沙': 'sha', '泥': 'ni',
    '尘': 'chen', '埃': 'ai', '灰': 'hui', '炭': 'tan', '煤': 'mei', '柴': 'chai',
    '草': 'cao', '木': 'mu', '树': 'shu', '林': 'lin', '森': 'sen',
    '松': 'song', '柏': 'bai', '柳': 'liu', '杨': 'yang', '桃': 'tao', '李': 'li',
    '杏': 'xing', '梅': 'mei', '梨': 'li', '枣': 'zao', '橘': 'ju', '柑': 'gan',
    '橙': 'cheng', '柚': 'you', '檬': 'meng', '樱': 'ying', '蕉': 'jiao', '椰': 'ye',
    '棕': 'zong', '榈': 'lv', '藤': 'teng', '蔓': 'man', '竹': 'zhu', '竿': 'gan',
    '笋': 'sun', '芦': 'lu', '苇': 'wei', '蒲': 'pu', '蒿': 'hao', '艾': 'ai',
    '莲': 'lian', '藕': 'ou', '菱': 'ling', '荷': 'he', '菊': 'ju',
    '兰': 'lan', '桂': 'gui', '桐': 'tong',
    '枫': 'feng', '橡': 'xiang', '樟': 'zhang', '楠': 'nan', '檀': 'tan', '槐': 'huai',
    '榆': 'yu', '桑': 'sang', '椿': 'chun', '槿': 'jin', '榕': 'rong',
    '杉': 'shan', '桦': 'hua',
    '柿': 'shi', '栗': 'li',
    '柠': 'ning', '枇': 'pi', '杷': 'pa', '荔': 'li', '枝': 'zhi', '芒': 'mang', '果': 'guo',
    '榴': 'liu', '蓬': 'peng',
    '蔗': 'zhe', '棉': 'mian', '麻': 'ma', '丝': 'si', '绸': 'chou', '缎': 'duan',
    '纱': 'sha', '布': 'bu', '帛': 'bo', '锦': 'jin', '绣': 'xiu', '线': 'xian',
    '针': 'zhen', '缝': 'feng', '纫': 'ren', '织': 'zhi', '编': 'bian', '结': 'jie',
    '网': 'wang', '绳': 'sheng', '索': 'suo', '缆': 'lan', '弦': 'xian', '琴': 'qin',
    '瑟': 'se', '琵': 'pi', '琶': 'pa', '筝': 'zheng', '笛': 'di', '箫': 'xiao',
    '笙': 'sheng', '管': 'guan', '号': 'hao', '角': 'jiao', '鼓': 'gu', '锣': 'luo',
    '钹': 'bo', '钟': 'zhong', '铃': 'ling', '铛': 'dang', '铎': 'duo', '磬': 'qing',
    '革': 'ge',
    '画': 'hua', '棋': 'qi', '牌': 'pai', '球': 'qiu', '棒': 'bang',
    '杆': 'gan', '拍': 'pai', '篮': 'lan', '框': 'kuang', '桌': 'zhuo',
    '椅': 'yi', '凳': 'deng', '床': 'chuang', '柜': 'gui', '箱': 'xiang', '盒': 'he',
    '包': 'bao', '袋': 'dai', '瓶': 'ping', '罐': 'guan', '桶': 'tong', '盆': 'pen',
    '碗': 'wan', '盘': 'pan', '碟': 'die', '杯': 'bei', '壶': 'hu', '锅': 'guo',
    '勺': 'shao', '筷': 'kuai', '叉': 'cha', '刀': 'dao', '剑': 'jian', '枪': 'qiang',
    '炮': 'pao', '弹': 'dan', '药': 'yao',
    '纸': 'zhi', '笔': 'bi', '墨': 'mo', '砚': 'yan', '印': 'yin', '刷': 'shua',
    '漆': 'qi', '胶': 'jiao', '蜡': 'la', '烛': 'zhu', '灯': 'deng', '火': 'huo',
    '水': 'shui', '冰': 'bing', '油': 'you', '盐': 'yan', '酱': 'jiang', '醋': 'cu',
    '茶': 'cha', '酒': 'jiu', '奶': 'nai', '糖': 'tang',
    '米': 'mi', '面': 'mian', '粉': 'fen', '粥': 'zhou', '饭': 'fan',
    '菜': 'cai', '汤': 'tang', '羹': 'geng', '糕': 'gao', '饼': 'bing', '饺': 'jiao',
    '馒': 'man', '粽': 'zong', '元': 'yuan',
    '宵': 'xiao', '蛋': 'dan', '肉': 'rou',
    '禽': 'qin', '畜': 'chu', '兽': 'shou'
};

// 将中文字符串转换为完整拼音
function textToPinyin(text) {
    var result = '';
    for (var i = 0; i < text.length; i++) {
        var ch = text[i];
        if (chinesePinyinMap[ch]) {
            result += chinesePinyinMap[ch];
        } else {
            result += ch.toLowerCase();
        }
    }
    return result;
}

// 获取拼音首字母
function textToPinyinInitials(text) {
    var result = '';
    for (var i = 0; i < text.length; i++) {
        var ch = text[i];
        if (chinesePinyinMap[ch]) {
            result += chinesePinyinMap[ch][0];
        } else {
            result += ch.toLowerCase();
        }
    }
    return result;
}

function scoreBuiltinItem(item, query) {
    if (!query) return -1;

    var q = normalizeForMatch(query);
    var compactQ = q.replace(/\s+/g, '');
    if (!compactQ) return -1;

    var fields = [
        { value: item.titleZh, exact: 280, prefix: 180 },
        { value: item.titleEn, exact: 270, prefix: 170 },
        { value: item.descriptionZh, exact: 90, prefix: 70 },
        { value: item.descriptionEn, exact: 90, prefix: 70 },
        { value: item.insertText, exact: 120, prefix: 90 }
    ];

    var best = -1;

    for (var i = 0; i < fields.length; i++) {
        var fieldValue = fields[i].value;
        if (!fieldValue) continue;
        
        var field = normalizeForMatch(fieldValue);
        if (!field) continue;

        var compactField = field.replace(/\s+/g, '');
        
        // 精确匹配
        if (field === q || compactField === compactQ) {
            best = Math.max(best, fields[i].exact);
            continue;
        }
        
        // 开头匹配（原文）
        if (field.indexOf(q) === 0 || compactField.indexOf(compactQ) === 0) {
            best = Math.max(best, fields[i].prefix);
            continue;
        }
        
        // 拼音开头匹配（对于中文文本）
        if (/[一-龥]/.test(fieldValue)) {
            // 完整拼音匹配标题时给非常高的加分
            var pinyinFull = textToPinyin(fieldValue);
            if (pinyinFull && pinyinFull.indexOf(compactQ) === 0) {
                if (fields[i].value === item.titleZh) {
                    best = Math.max(best, fields[i].prefix + 2000);
                } else {
                    best = Math.max(best, fields[i].prefix + 500);
                }
                continue;
            }
            // 拼音首字母匹配标题时给非常高的加分
            var pinyinInitials = textToPinyinInitials(fieldValue);
            if (pinyinInitials && pinyinInitials.indexOf(compactQ) === 0) {
                if (fields[i].value === item.titleZh) {
                    best = Math.max(best, fields[i].prefix + 1800);
                } else {
                    best = Math.max(best, fields[i].prefix + 400);
                }
                continue;
            }
        }
    }

    var aliases = Array.isArray(item.aliases) ? item.aliases : [];
    for (var j = 0; j < aliases.length; j++) {
        var alias = normalizeForMatch(aliases[j]);
        if (!alias) continue;

        var compactAlias = alias.replace(/\s+/g, '');
        
        // 精确匹配
        if (alias === q || compactAlias === compactQ) {
            best = Math.max(best, 230);
            continue;
        }
        
        // 开头匹配
        if (alias.indexOf(q) === 0 || compactAlias.indexOf(compactQ) === 0) {
            best = Math.max(best, 170);
            continue;
        }
        
        // 拼音开头匹配（对于中文别名）
        if (/[一-龥]/.test(aliases[j])) {
            var pinyinFullAlias = textToPinyin(aliases[j]);
            if (pinyinFullAlias && pinyinFullAlias.indexOf(compactQ) === 0) {
                best = Math.max(best, 190);
                continue;
            }
            var pinyinInitialsAlias = textToPinyinInitials(aliases[j]);
            if (pinyinInitialsAlias && pinyinInitialsAlias.indexOf(compactQ) === 0) {
                best = Math.max(best, 180);
                continue;
            }
        }
    }

    var keywords = Array.isArray(item.keywords) ? item.keywords : [];
    for (var k = 0; k < keywords.length; k++) {
        var keyword = normalizeForMatch(keywords[k]);
        if (!keyword) continue;

        var compactKeyword = keyword.replace(/\s+/g, '');
        
        // 精确匹配
        if (keyword === q || compactKeyword === compactQ) {
            best = Math.max(best, 160);
            continue;
        }
        
        // 开头匹配
        if (keyword.indexOf(q) === 0 || compactKeyword.indexOf(compactQ) === 0) {
            best = Math.max(best, 120);
            continue;
        }
        
        // 拼音开头匹配（对于中文关键词）
        if (/[一-龥]/.test(keywords[k])) {
            var pinyinFullKw = textToPinyin(keywords[k]);
            if (pinyinFullKw && pinyinFullKw.indexOf(compactQ) === 0) {
                best = Math.max(best, 130);
                continue;
            }
            var pinyinInitialsKw = textToPinyinInitials(keywords[k]);
            if (pinyinInitialsKw && pinyinInitialsKw.indexOf(compactQ) === 0) {
                best = Math.max(best, 120);
                continue;
            }
        }
    }

    return best;
}

async function searchBuiltinEntries(query, limit) {
    if (!query) return [];

    var entries = await loadBuiltinSlashEntries();
    if (!Array.isArray(entries) || !entries.length) return [];

    var matched = [];
    for (var i = 0; i < entries.length; i++) {
        var item = entries[i];
        var score = scoreBuiltinItem(item, query);
        if (score < 0) continue;

        var cloned = Object.assign({}, item);
        cloned.score = score;
        matched.push(cloned);
    }

    matched.sort(function(a, b) {
        if ((b.score || 0) !== (a.score || 0)) return (b.score || 0) - (a.score || 0);
        return commandLabel(a).localeCompare(commandLabel(b));
    });

    return matched.slice(0, typeof limit === 'number' ? limit : 80);
}

function mergePaletteItems(primaryItems, secondaryItems, limit) {
    var merged = [];
    var seen = new Set();

    function keyOf(item) {
        if (!item) return '';
        if (item.id) return 'id:' + item.id;
        if (item.action) return 'action:' + item.action + '|text:' + (item.insertText || '');
        return 'text:' + (item.title || item.titleZh || item.titleEn || '') + '|' + (item.insertText || '');
    }

    function append(items) {
        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            var key = keyOf(item);
            if (!key || seen.has(key)) continue;

            seen.add(key);
            merged.push(item);
            if (merged.length >= limit) return;
        }
    }

    append(primaryItems || []);
    if (merged.length < limit) {
        append(secondaryItems || []);
    }

    return merged;
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
