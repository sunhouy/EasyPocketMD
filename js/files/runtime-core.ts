/**
 * 文件管理 - 加载、保存、同步、冲突、历史版本、文件夹
 */
// @ts-nocheck
import {
    computeDiff as computeDiffCore,
    bindCollapsedDiffInteractions as bindCollapsedDiffInteractionsCore,
    renderDiffView as renderDiffViewCore,
    escapeHtml as escapeHtmlCore
} from './conflict/index';
import {
    normalizeServerFileRecord as normalizeServerFileRecordCore,
    createSyncRuntimeApi
} from './sync/index';
import {
    normalizePath as normalizePathCore,
    getParentPath as getParentPathCore,
    getBasename as getBasenameCore,
    getAllFolderPaths as getAllFolderPathsCore,
    isWasmFileOpsReady as isWasmFileOpsReadyCore
} from './tree/index';
import {
    isExternalLocalFile as isExternalLocalFileCore,
    normalizeExternalLocalFileRecord as normalizeExternalLocalFileRecordCore,
    getPathBasename as getPathBasenameCore,
    createBrowserLocalPath as createBrowserLocalPathCore,
    isLikelyBrowserWritePermissionError as isLikelyBrowserWritePermissionErrorCore
} from './external/index';

(function(global) {
    'use strict';

    function g(name) { return global[name]; }
    
    function isEn() { return window.i18n && window.i18n.getLanguage() === 'en'; }
    function t(key) { return window.i18n ? window.i18n.t(key) : key; }

    function formatDiffTime(value) {
        if (value === undefined || value === null || value === '') {
            return isEn() ? 'Unknown time' : '未知时间';
        }
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return isEn() ? 'Unknown time' : '未知时间';
        }
        return date.toLocaleString();
    }

    let tokenRecoveryInProgress = false;
    let lastTokenRecoveryAt = 0;
    const browserFileHandleMap = new Map();
    const localExternalSnapshotMap = new Map();
    const localExternalConflictPrompting = new Set();
    const LONG_FILE_MODE_CHAR_THRESHOLD = 220000;
    const LONG_FILE_MODE_LINE_THRESHOLD = 6000;
    const LONG_FILE_MODE_PREVIEW_DEBOUNCE = 180;
    const AUTO_SAVE_DEBOUNCE_MS = 500;
    const AUTO_SAVE_FORCE_MS = 5000;

    let markedParserPromise = null;
    let longFilePreviewTimer = null;
    let fileOpenRequestToken = 0;
    let autoSaveDebounceTimer = null;
    let autoSaveForceTimer = null;
    let autoSaveInFlight = false;
    function ensureFileSwitchLoadingOverlay() {
        let overlay = document.getElementById('fileSwitchLoadingOverlay');
        if (overlay) return overlay;

        const editorContainer = document.querySelector('.editor-container');
        if (!editorContainer) return null;

        overlay = document.createElement('div');
        overlay.id = 'fileSwitchLoadingOverlay';
        overlay.className = 'file-switch-loading-overlay';
        overlay.style.display = 'none';
        overlay.innerHTML =
            '<div class="file-switch-loading-card">' +
                '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i>' +
                '<span id="fileSwitchLoadingText"></span>' +
            '</div>';
        editorContainer.appendChild(overlay);
        return overlay;
    }

    function setEditorInteractionLocked(locked) {
        const vditorContainer = document.getElementById('vditor');
        if (vditorContainer) {
            setVditorInteractionLocked(global.vditor, !!locked);

            const editableNodes = vditorContainer.querySelectorAll('[contenteditable]');
            editableNodes.forEach(function(node) {
                node.setAttribute('contenteditable', locked ? 'false' : 'true');
            });

            const textInputs = vditorContainer.querySelectorAll('textarea, input');
            textInputs.forEach(function(node) {
                node.readOnly = !!locked;
            });

            const toolbarBtns = vditorContainer.querySelectorAll('.vditor-toolbar__item, .vditor-toolbar__btn');
            toolbarBtns.forEach(function(btn) {
                btn.style.pointerEvents = locked ? 'none' : '';
                btn.style.opacity = locked ? '0.5' : '';
            });
        }

        const longTextarea = getLongFileTextarea();
        if (longTextarea) {
            longTextarea.readOnly = !!locked;
        }

        const longPreviewToggle = document.getElementById('longFilePreviewToggle');
        if (longPreviewToggle) {
            longPreviewToggle.disabled = !!locked;
        }
    }

    function isVditorInteractionApiReady(vditorInstance) {
        const internal = vditorInstance && vditorInstance.vditor;
        if (!internal || !internal.toolbar || !internal.toolbar.elements || !internal.currentMode) {
            return false;
        }
        return !!(internal[internal.currentMode] && internal[internal.currentMode].element);
    }

    function setVditorInteractionLocked(vditorInstance, locked) {
        if (!isVditorInteractionApiReady(vditorInstance)) {
            return false;
        }

        try {
            if (locked && typeof vditorInstance.disabled === 'function') {
                vditorInstance.disabled();
                return true;
            }
            if (!locked && typeof vditorInstance.enable === 'function') {
                vditorInstance.enable();
                return true;
            }
        } catch (error) {
            console.warn('Failed to update Vditor interaction state:', error);
        }
        return false;
    }

    function setFileSwitchLoading(loading) {
        const isLoading = !!loading;
        const overlay = ensureFileSwitchLoadingOverlay();
        const text = document.getElementById('fileSwitchLoadingText');
        if (text) {
            text.textContent = isEn() ? 'Loading file...' : '正在加载文件...';
        }

        if (overlay) {
            overlay.style.display = isLoading ? 'flex' : 'none';
        }

        setEditorInteractionLocked(isLoading);
        global.isFileSwitchLoading = isLoading;
    }

    function getLongFileEditorState() {
        if (!global.longFileEditorState) {
            global.longFileEditorState = {
                active: false,
                fileId: null,
                previewEnabled: true,
                renderToken: 0
            };
        }
        return global.longFileEditorState;
    }

    function syncLongFileModeFlag() {
        const state = getLongFileEditorState();
        global.isLongFileMode = !!state.active;
        if (typeof document !== 'undefined' && document.body) {
            document.body.classList.toggle('long-file-mode-active', !!state.active);
        }
    }

    function isLongFileEditorActiveFor(fileId) {
        const state = getLongFileEditorState();
        if (!state.active) return false;
        return String(state.fileId || '') === String(fileId || g('currentFileId') || '');
    }

    function countTextLinesFast(text) {
        if (!text) return 1;
        let lines = 1;
        for (let i = 0; i < text.length; i++) {
            if (text.charCodeAt(i) === 10) lines += 1;
        }
        return lines;
    }

    function shouldUseLongFileMode(content) {
        const text = String(content || '');
        if (text.length >= LONG_FILE_MODE_CHAR_THRESHOLD) return true;
        return countTextLinesFast(text) >= LONG_FILE_MODE_LINE_THRESHOLD;
    }

    function ensureLongFileEditorElements() {
        let host = document.getElementById('longFileEditorHost');
        if (host) return host;

        const editorContainer = document.querySelector('.editor-container');
        if (!editorContainer) return null;

        host = document.createElement('div');
        host.id = 'longFileEditorHost';
        host.className = 'long-file-editor-host';
        host.style.display = 'none';
        host.innerHTML =
            '<div class="long-file-toolbar">' +
                '<div id="longFileModeHint" class="long-file-mode-hint"></div>' +
                '<button id="longFilePreviewToggle" type="button" class="long-file-preview-toggle"></button>' +
            '</div>' +
            '<div id="longFileEditorBody" class="long-file-editor-body">' +
                '<textarea id="longFileTextarea" class="long-file-textarea" spellcheck="false"></textarea>' +
                '<div id="longFilePreview" class="long-file-preview"></div>' +
            '</div>';
        editorContainer.appendChild(host);

        const textarea = document.getElementById('longFileTextarea');
        const previewToggle = document.getElementById('longFilePreviewToggle');

        if (textarea) {
            textarea.addEventListener('input', function() {
                const state = getLongFileEditorState();
                if (!state.active) return;

                const currentFileId = g('currentFileId');
                if (currentFileId) {
                    g('unsavedChanges')[currentFileId] = true;
                    if (typeof global.startAutoSave === 'function') {
                        global.startAutoSave();
                    }
                    if (global.draftRecovery && typeof global.draftRecovery.markDirty === 'function') {
                        global.draftRecovery.markDirty();
                    }
                }

                scheduleLongFilePreviewRender();
            });
        }

        if (previewToggle) {
            previewToggle.addEventListener('click', function() {
                const state = getLongFileEditorState();
                state.previewEnabled = !state.previewEnabled;
                applyLongFilePreviewVisibility();
                updateLongFileEditorLabels();
                if (state.previewEnabled) {
                    scheduleLongFilePreviewRender();
                }
            });
        }

        return host;
    }

    function applyLongFilePreviewVisibility() {
        const body = document.getElementById('longFileEditorBody');
        const state = getLongFileEditorState();
        if (!body) return;
        body.classList.toggle('preview-disabled', !state.previewEnabled);
    }

    function updateLongFileEditorLabels() {
        const hint = document.getElementById('longFileModeHint');
        const toggle = document.getElementById('longFilePreviewToggle');
        const state = getLongFileEditorState();
        const bannerText = window.i18n ? t('longFileModeBanner') : '超长文件模式：高性能文本编辑 + 快速预览';
        const toggleShowText = window.i18n ? t('longFilePreviewShow') : '显示预览';
        const toggleHideText = window.i18n ? t('longFilePreviewHide') : '隐藏预览';
        if (hint) {
            hint.textContent = bannerText;
        }
        if (toggle) {
            toggle.textContent = state.previewEnabled ? toggleHideText : toggleShowText;
        }
    }

    function getLongFileTextarea() {
        return document.getElementById('longFileTextarea');
    }

    function getLongFilePreview() {
        return document.getElementById('longFilePreview');
    }

    async function loadMarkedParser() {
        if (!markedParserPromise) {
            markedParserPromise = import('marked').then(function(mod) {
                const marked = mod && (mod.marked || mod.default || mod);
                if (!marked) {
                    throw new Error('marked module unavailable');
                }

                if (typeof marked.setOptions === 'function') {
                    marked.setOptions({ gfm: true, breaks: true });
                }

                if (typeof marked.parse === 'function') {
                    return function(source) {
                        return marked.parse(source || '');
                    };
                }

                if (typeof marked === 'function') {
                    return function(source) {
                        return marked(source || '');
                    };
                }

                throw new Error('marked parser not found');
            }).catch(function(error) {
                markedParserPromise = null;
                throw error;
            });
        }

        return markedParserPromise;
    }

    async function renderLongFilePreviewNow() {
        const state = getLongFileEditorState();
        if (!state.active || !state.previewEnabled) return;

        const preview = getLongFilePreview();
        const textarea = getLongFileTextarea();
        if (!preview || !textarea) return;

        const markdownText = String(textarea.value || '');
        state.renderToken += 1;
        const token = state.renderToken;

        try {
            const parse = await loadMarkedParser();
            if (token !== getLongFileEditorState().renderToken) return;
            const html = parse(markdownText);
            preview.innerHTML = html;
        } catch (error) {
            if (token !== getLongFileEditorState().renderToken) return;
            preview.innerHTML = '<pre>' + escapeHtml(markdownText) + '</pre>';
        }
    }

    function scheduleLongFilePreviewRender() {
        const state = getLongFileEditorState();
        if (!state.active || !state.previewEnabled) return;
        if (longFilePreviewTimer) clearTimeout(longFilePreviewTimer);
        longFilePreviewTimer = setTimeout(function() {
            longFilePreviewTimer = null;
            renderLongFilePreviewNow();
        }, LONG_FILE_MODE_PREVIEW_DEBOUNCE);
    }

    function activateLongFileEditor(fileId, content) {
        const host = ensureLongFileEditorElements();
        if (!host) return false;

        const vditorEl = document.getElementById('vditor');
        const textarea = getLongFileTextarea();
        const state = getLongFileEditorState();

        state.active = true;
        state.fileId = fileId;

        if (vditorEl) vditorEl.style.display = 'none';
        host.style.display = 'flex';

        if (textarea) {
            textarea.value = String(content || '');
            textarea.scrollTop = 0;
            textarea.scrollLeft = 0;
        }

        applyLongFilePreviewVisibility();
        updateLongFileEditorLabels();
        syncLongFileModeFlag();
        scheduleLongFilePreviewRender();
        return true;
    }

    function deactivateLongFileEditor() {
        const host = document.getElementById('longFileEditorHost');
        const vditorEl = document.getElementById('vditor');
        const state = getLongFileEditorState();

        state.active = false;
        state.fileId = null;
        state.renderToken += 1;

        if (longFilePreviewTimer) {
            clearTimeout(longFilePreviewTimer);
            longFilePreviewTimer = null;
        }

        if (host) host.style.display = 'none';
        if (vditorEl) vditorEl.style.display = '';

        syncLongFileModeFlag();
    }

    function getVditorEditableElement(vditorInstance) {
        const internal = vditorInstance && vditorInstance.vditor ? vditorInstance.vditor : {};
        return (internal.ir && internal.ir.element) ||
            (internal.sv && internal.sv.element) ||
            (internal.wysiwyg && internal.wysiwyg.element) ||
            null;
    }

    function getDomSelectionOffsets(root) {
        const selection = document.getSelection ? document.getSelection() : null;
        if (!selection || selection.rangeCount === 0 || !root || !root.contains(selection.anchorNode)) return null;

        const range = selection.getRangeAt(0);
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        let offset = 0;
        let start = 0;
        let end = 0;
        let foundStart = false;
        let foundEnd = false;
        let node;

        while ((node = walker.nextNode())) {
            const length = node.nodeValue ? node.nodeValue.length : 0;
            if (node === range.startContainer) {
                start = offset + range.startOffset;
                foundStart = true;
            }
            if (node === range.endContainer) {
                end = offset + range.endOffset;
                foundEnd = true;
            }
            offset += length;
        }

        if (!foundStart || !foundEnd) return null;
        return { start, end };
    }

    function setDomSelectionOffsets(root, start, end) {
        if (!root || !document.createRange || !document.getSelection) return false;
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        const range = document.createRange();
        let offset = 0;
        let startSet = false;
        let endSet = false;
        let node;

        while ((node = walker.nextNode())) {
            const length = node.nodeValue ? node.nodeValue.length : 0;
            const nextOffset = offset + length;
            if (!startSet && start <= nextOffset) {
                range.setStart(node, Math.max(0, Math.min(length, start - offset)));
                startSet = true;
            }
            if (!endSet && end <= nextOffset) {
                range.setEnd(node, Math.max(0, Math.min(length, end - offset)));
                endSet = true;
                break;
            }
            offset = nextOffset;
        }

        if (!startSet || !endSet) {
            range.selectNodeContents(root);
            range.collapse(false);
        }

        const selection = document.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        return true;
    }

    function captureVditorCursor(vditorInstance) {
        const element = getVditorEditableElement(vditorInstance);
        if (!element) return null;
        const activeElement = document.activeElement;
        const wasFocused = activeElement === element || (element.contains && element.contains(activeElement));
        const snapshot = {
            wasFocused,
            scrollTop: typeof element.scrollTop === 'number' ? element.scrollTop : 0,
            scrollLeft: typeof element.scrollLeft === 'number' ? element.scrollLeft : 0,
            windowX: window.pageXOffset,
            windowY: window.pageYOffset
        };

        if (typeof element.selectionStart === 'number' && typeof element.selectionEnd === 'number') {
            snapshot.type = 'input';
            snapshot.start = element.selectionStart;
            snapshot.end = element.selectionEnd;
            return snapshot;
        }

        const domOffsets = getDomSelectionOffsets(element);
        if (domOffsets) {
            snapshot.type = 'dom';
            snapshot.start = domOffsets.start;
            snapshot.end = domOffsets.end;
            return snapshot;
        }

        return snapshot;
    }

    function restoreVditorCursor(vditorInstance, snapshot) {
        if (!snapshot) return;
        const restore = function() {
            const element = getVditorEditableElement(vditorInstance);
            if (!element) return;
            const length = typeof element.value === 'string'
                ? element.value.length
                : String(element.textContent || '').length;
            const start = Math.max(0, Math.min(length, Number(snapshot.start || 0)));
            const end = Math.max(start, Math.min(length, Number(snapshot.end ?? start)));

            try {
                if (snapshot.type === 'input' && typeof element.setSelectionRange === 'function') {
                    element.setSelectionRange(start, end);
                } else if (snapshot.type === 'dom') {
                    setDomSelectionOffsets(element, start, end);
                }
                if (snapshot.wasFocused && typeof element.focus === 'function') {
                    try {
                        element.focus({ preventScroll: true });
                    } catch (e) {
                        element.focus();
                    }
                }
                if (typeof element.scrollTop === 'number') element.scrollTop = snapshot.scrollTop || 0;
                if (typeof element.scrollLeft === 'number') element.scrollLeft = snapshot.scrollLeft || 0;
                if (typeof window.scrollTo === 'function') {
                    window.scrollTo(snapshot.windowX || 0, snapshot.windowY || 0);
                }
            } catch (error) {
                console.warn('恢复编辑器光标失败:', error);
            }
        };

        requestAnimationFrame(restore);
        setTimeout(restore, 40);
    }

    function setVditorValuePreservingCursor(vditorInstance, content) {
        const cursor = captureVditorCursor(vditorInstance);
        vditorInstance.setValue(content);
        restoreVditorCursor(vditorInstance, cursor);
    }

    function setEditorContentForFile(fileId, content, options) {
        const opts = options || {};
        const normalizedContent = String(content || '');
        const currentFileId = g('currentFileId');
        const isCurrentFile = String(fileId || '') === String(currentFileId || '');

        if (isCurrentFile) {
            if (shouldUseLongFileMode(normalizedContent)) {
                activateLongFileEditor(fileId, normalizedContent);
                return;
            }

            if (isLongFileEditorActiveFor(fileId)) {
                deactivateLongFileEditor();
            }
        }

        if (isLongFileEditorActiveFor(fileId)) {
            const textarea = getLongFileTextarea();
            if (textarea) {
                const start = opts.preserveCursor && typeof textarea.selectionStart === 'number' ? textarea.selectionStart : null;
                const end = opts.preserveCursor && typeof textarea.selectionEnd === 'number' ? textarea.selectionEnd : null;
                const scrollTop = textarea.scrollTop || 0;
                const scrollLeft = textarea.scrollLeft || 0;
                textarea.value = normalizedContent;
                if (start !== null && typeof textarea.setSelectionRange === 'function') {
                    const length = normalizedContent.length;
                    textarea.setSelectionRange(Math.min(start, length), Math.min(end ?? start, length));
                    textarea.scrollTop = scrollTop;
                    textarea.scrollLeft = scrollLeft;
                }
                scheduleLongFilePreviewRender();
            }
            return;
        }

        const vditor = g('vditor');
        if (vditor && typeof vditor.setValue === 'function') {
            if (!isVditorValueBridgeReady(vditor)) {
                scheduleDeferredVditorValueApply(fileId, normalizedContent);
                return;
            }

            try {
                if (isCurrentFile && typeof vditor.getValue === 'function' && vditor.getValue() === normalizedContent) {
                    return;
                }
                if (isCurrentFile && opts.preserveCursor) {
                    setVditorValuePreservingCursor(vditor, normalizedContent);
                } else {
                    vditor.setValue(normalizedContent);
                }
            } catch (error) {
                console.warn('设置编辑器内容失败，等待编辑器就绪后重试:', error);
                scheduleDeferredVditorValueApply(fileId, normalizedContent);
            }
            return;
        }

        if (isCurrentFile) {
            scheduleDeferredVditorValueApply(fileId, normalizedContent);
        }
    }

    function isVditorValueBridgeReady(vditorInstance) {
        const vditor = vditorInstance || g('vditor');
        if (!vditor || typeof vditor.getValue !== 'function' || typeof vditor.setValue !== 'function') {
            return false;
        }

        const internal = vditor.vditor;
        if (!internal || !internal.lute) {
            return false;
        }

        return typeof internal.lute.Md2VditorDOM === 'function';
    }

    function scheduleDeferredVditorValueApply(fileId, content) {
        if (typeof global.ensureVditorInitialized !== 'function') {
            return;
        }

        Promise.resolve(global.ensureVditorInitialized()).then(function(instance) {
            const activeFileId = g('currentFileId');
            if (String(activeFileId || '') !== String(fileId || '')) {
                return;
            }
            if (isLongFileEditorActiveFor(fileId)) {
                return;
            }
            if (!isVditorValueBridgeReady(instance)) {
                return;
            }
            instance.setValue(String(content || ''));
        }).catch(function(error) {
            console.warn('延迟设置编辑器内容失败:', error);
        });
    }

    function syncCurrentEditorSnapshotIntoFiles(targetFiles, options) {
        const files = Array.isArray(targetFiles) ? targetFiles : [];
        const currentFileId = options && options.fileId ? options.fileId : g('currentFileId');
        if (!currentFileId) return;

        const fileIndex = files.findIndex(function(file) {
            return file && file.type === 'file' && String(file.id) === String(currentFileId);
        });
        if (fileIndex === -1) return;

        const currentFile = files[fileIndex];
        const editorContent = getCurrentEditorContent(currentFileId, currentFile.content);
        if (editorContent === currentFile.content) return;

        currentFile.content = editorContent;
        currentFile.lastModified = Date.now();
    }

    function getCurrentEditorContent(fileId, fallbackContent) {
        const fallback = String(fallbackContent || '');

        if (isLongFileEditorActiveFor(fileId)) {
            const textarea = getLongFileTextarea();
            return textarea ? String(textarea.value || '') : fallback;
        }

        const vditor = g('vditor');
        if (!vditor || typeof vditor.getValue !== 'function') {
            return fallback;
        }

        // 冷启动阶段可能存在实例对象已创建但内部 Lute 尚未就绪的窗口期。
        if (global.vditorReady === false || !isVditorValueBridgeReady(vditor)) {
            return fallback;
        }

        try {
            return vditor.getValue();
        } catch (error) {
            console.warn('读取编辑器内容失败，回退到本地快照:', error);
            return fallback;
        }
    }

    function isTokenErrorMessage(message) {
        if (!message) return false;
        const msg = String(message);
        return msg.includes('Token验证失败') || msg.includes('token') || msg.includes('Token') || msg.includes('过期') || msg.includes('expired') || msg.includes('sessionExpired');
    }

    async function tryHandleTokenExpired(source) {
        const resultLike = source && typeof source === 'object' && Object.prototype.hasOwnProperty.call(source, 'code')
            ? source
            : null;

        const matchedByResult = !!(global.isTokenError && global.isTokenError(resultLike || source));
        const matchedByMessage = isTokenErrorMessage(source && source.message ? source.message : source);
        if ((!matchedByResult && !matchedByMessage) || !g('currentUser')) return false;

        const now = Date.now();
        if (tokenRecoveryInProgress || (now - lastTokenRecoveryAt < 5000)) {
            return true;
        }

        tokenRecoveryInProgress = true;
        lastTokenRecoveryAt = now;
        try {
            if (global.handleTokenExpired) {
                await global.handleTokenExpired();
            } else {
                global.currentUser = null;
                localStorage.removeItem('vditor_user');
                global.showMessage(isEn() ? 'Session expired, please login again' : '登录会话已过期，请重新登录', 'warning');
                if (typeof global.handleLoginButtonClick === 'function') {
                    global.handleLoginButtonClick();
                }
            }
        } finally {
            tokenRecoveryInProgress = false;
        }
        return true;
    }

    // ---------- 服务器同步一致性：待同步标记 ----------
    // 记录“本地已保存但服务器尚未确认保存”的文件，避免本地/服务器长期不一致
    function loadPendingServerSync() {
        try {
            const stored = localStorage.getItem('vditor_pending_server_sync');
            return stored ? JSON.parse(stored) : {};
        } catch (e) {
            console.warn('Failed to load pending server sync:', e);
            return {};
        }
    }

    function persistPendingServerSync(map) {
        try {
            localStorage.setItem('vditor_pending_server_sync', JSON.stringify(map));
        } catch (e) {
            console.warn('Failed to persist pending server sync:', e);
        }
    }

    function markPendingServerSync(fileId, pending) {
        if (!fileId) return;
        const map = g('pendingServerSync') || {};
        if (pending) map[fileId] = true;
        else delete map[fileId];
        global.pendingServerSync = map;
        persistPendingServerSync(map);
    }

    function getSaveStatusText(kind) {
        if (kind === 'saving') {
            return isEn() ? 'Saving...' : '保存中...';
        }
        if (kind === 'failed') {
            return isEn() ? 'Save failed' : '保存失败';
        }
        return isEn() ? 'Saved' : '已保存';
    }

    function showSaveStatus(kind) {
        if (typeof global.showSyncStatus !== 'function') return;
        if (kind === 'saving') {
            global.showSyncStatus(getSaveStatusText(kind), 'syncing');
        } else if (kind === 'failed') {
            global.showSyncStatus(getSaveStatusText(kind), 'error');
        } else {
            global.showSyncStatus(getSaveStatusText(kind), 'success');
        }
    }

    async function persistDraftBackup() {
        const currentFileId = g('currentFileId');
        if (!currentFileId) return false;

        const files = g('files') || [];
        const file = files.find(function(item) {
            return item && item.id === currentFileId && item.type === 'file';
        });
        if (!file) return false;

        const content = getCurrentEditorContent(currentFileId, file.content);
        const draft = {
            fileId: file.id,
            fileName: file.name,
            content: String(content || ''),
            timestamp: Date.now(),
            lastModified: Date.now(),
            sessionId: global.appSessionId || '',
            contentVersion: Number(file.contentVersion || 0)
        };

        if (global.draftRecovery && typeof global.draftRecovery.markDirty === 'function') {
            global.draftRecovery.markDirty();
        }

        if (global.IndexedDBManager && typeof global.IndexedDBManager.saveDraft === 'function') {
            try {
                await global.IndexedDBManager.saveDraft(draft);
            } catch (error) {
                console.warn('[Autosave] IndexedDB draft backup failed:', error);
            }
        }

        return true;
    }

    function getOptimisticLockPayload(file) {
        if (!file) return {};
        const baseLastModified = file.serverLastModified || file.baseLastModified || null;
        const payload = {
            base_content_version: Number(file.contentVersion || 0)
        };
        if (baseLastModified) {
            payload.base_last_modified = baseLastModified;
        }
        return payload;
    }

    function isCurrentFileDirty(currentFileId) {
        const dirtyMap = g('unsavedChanges') || {};
        return !!(currentFileId && dirtyMap[currentFileId]);
    }

    if (!global.pendingServerSync) {
        global.pendingServerSync = loadPendingServerSync();
    }

    // ---------- 共享在线文档（所有者视角） ----------
    let ownerShareCache = { updatedAt: 0, byFilename: {} };

    async function refreshOwnerShareCache(force) {
        if (!g('currentUser')) return ownerShareCache.byFilename;
        const now = Date.now();
        if (!force && (now - ownerShareCache.updatedAt < 30000)) {
            return ownerShareCache.byFilename;
        }
        try {
            var api = global.getApiBaseUrl ? global.getApiBaseUrl() : 'api';
            const response = await fetch(api + '/share/list?username=' + encodeURIComponent(g('currentUser').username), {
                method: 'GET',
                headers: { 'Authorization': 'Bearer ' + g('currentUser').token }
            });
            const result = global.parseJsonResponse ? await global.parseJsonResponse(response) : await response.json();

            // 处理 Token 过期
            if (result.code === 401 || (global.isTokenError && global.isTokenError(result))) {
                if (await tryHandleTokenExpired(result)) {
                    return ownerShareCache.byFilename;
                }
            }

            const byFilename = {};
            if (result.code === 200 && result.data && Array.isArray(result.data.shares)) {
                result.data.shares.forEach(function(share) {
                    if (share.mode === 'edit' && !share.is_expired && share.filename) {
                        byFilename[share.filename] = share;
                    }
                });
            }
            ownerShareCache = { updatedAt: now, byFilename: byFilename };
            return byFilename;
        } catch (error) {
            await tryHandleTokenExpired(error);
            console.warn('刷新共享缓存失败:', error);
            return ownerShareCache.byFilename;
        }
    }

    async function activateOwnerSharedSession(file, fileContent) {
        if (!file || !g('currentUser')) return false;
        const byFilename = await refreshOwnerShareCache(false);
        const shareMeta = byFilename[file.name];
        if (!shareMeta || !shareMeta.share_id) {
            if (typeof global.deactivateSharedDocumentSession === 'function') {
                global.deactivateSharedDocumentSession();
            }
            return false;
        }

        try {
            var api = global.getApiBaseUrl ? global.getApiBaseUrl() : 'api';
            const response = await fetch(api + '/share/get', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    share_id: shareMeta.share_id,
                    editor_username: g('currentUser').username,
                    editor_token: g('currentUser').token,
                    editor_password: g('currentUser').password
                })
            });
            const result = global.parseJsonResponse ? await global.parseJsonResponse(response) : await response.json();
            if (result.code !== 200 || !result.data) {
                return false;
            }

            const sharedContent = result.data.content || fileContent || '';
            // 所有者打开共享在线文档时，以服务器内容为准，避免刷新后回退到本地旧版本。
            file.content = sharedContent;
            file.lastModified = Date.now();
            localStorage.setItem('vditor_files', JSON.stringify(g('files')));
            setEditorContentForFile(file.id, sharedContent);

            if (typeof global.activateSharedDocumentSession === 'function') {
                global.activateSharedDocumentSession(result.data, {
                    shareId: shareMeta.share_id,
                    sharePassword: '',
                    editPassword: '',
                    canEdit: true,
                    viewerId: 'owner-' + (g('currentUser').username || 'user'),
                    viewerName: g('currentUser').username,
                    ownerFileId: file.id
                });
            }
            return true;
        } catch (error) {
            console.warn('启用共享在线文档会话失败:', error);
            return false;
        }
    }

    // ---------- 辅助函数：路径处理 ----------
    function normalizePath(input) {
        return normalizePathCore(global, input || '');
    }

    function getParentPath(path) {
        return getParentPathCore(global, path || '');
    }

    function getBasename(path) {
        return getBasenameCore(global, path || '');
    }

    function ensureParentFolders(path) {
        if (!path) return;
        const files = g('files');
        const parent = getParentPath(path);
        if (parent === '') return;
        const exists = files.some(f => f.name === parent && f.type === 'folder');
        if (!exists) {
            ensureParentFolders(parent);
            const folder = {
                id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                name: parent,
                type: 'folder',
                content: '',
                lastModified: Date.now(),
                isSynced: false
            };
            files.push(folder);
        }
    }

    function deleteFolderAndChildren(folderPath) {
        const files = g('files');
        const toDelete = files.filter(f => f.name === folderPath || f.name.startsWith(folderPath + '/'));
        toDelete.forEach(f => {
            const idx = files.findIndex(ff => ff.id === f.id);
            if (idx !== -1) files.splice(idx, 1);
            delete g('lastSyncedContent')[f.id];
            delete g('unsavedChanges')[f.id];
        });
    }

    function renameFolderAndChildren(oldPath, newPath) {
        const files = g('files');
        files.forEach(f => {
            if (f.name === oldPath) {
                f.name = newPath;
            } else if (f.name.startsWith(oldPath + '/')) {
                f.name = newPath + f.name.substring(oldPath.length);
            }
        });
    }

    function isNameExistsInParent(name, parentPath, excludeId) {
        const fullPath = parentPath ? parentPath + '/' + name : name;
        return g('files').some(f => f.name === fullPath && f.id !== excludeId);
    }

    function getNextAvailableName(baseName, parentPath) {
        const files = g('files');
        let candidateName = baseName;
        let counter = 2;
        
        while (true) {
            const fullPath = parentPath ? parentPath + '/' + candidateName : candidateName;
            const exists = files.some(f => f.name === fullPath);
            if (!exists) {
                return candidateName;
            }
            candidateName = baseName + counter;
            counter++;
        }
    }

    function isExternalLocalFile(file) {
        return isExternalLocalFileCore(file);
    }

    function normalizeExternalLocalFileRecord(file) {
        normalizeExternalLocalFileRecordCore(global, file);
    }

    function getPathBasename(filePath) {
        return getPathBasenameCore(global, filePath || '');
    }

    function createBrowserLocalPath(fileName) {
        return createBrowserLocalPathCore(fileName);
    }

    async function readTextFromBrowserFile(fileObject) {
        if (!fileObject) return '';
        if (typeof fileObject.text === 'function') {
            return await fileObject.text();
        }
        return new Promise(function(resolve, reject) {
            const reader = new FileReader();
            reader.onload = function() { resolve(String(reader.result || '')); };
            reader.onerror = function() { reject(reader.error || new Error('read failed')); };
            reader.readAsText(fileObject);
        });
    }

    async function pickLocalFileByInput() {
        return new Promise(function(resolve) {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.md,.markdown,.txt,text/markdown,text/plain';
            input.style.display = 'none';
            document.body.appendChild(input);

            let settled = false;
            function finish(file) {
                if (settled) return;
                settled = true;
                window.removeEventListener('focus', onFocusBack);
                setTimeout(function() {
                    if (input.parentNode) input.parentNode.removeChild(input);
                }, 0);
                resolve(file || null);
            }

            function onFocusBack() {
                setTimeout(function() {
                    if (!settled) finish(null);
                }, 500);
            }

            input.addEventListener('change', function() {
                const file = input.files && input.files[0] ? input.files[0] : null;
                finish(file);
            }, { once: true });

            window.addEventListener('focus', onFocusBack, { once: true });
            input.click();
        });
    }

    function downloadLocalContent(fileName, content) {
        const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName || (isEn() ? 'document.md' : '文档.md');
        document.body.appendChild(link);
        link.click();
        setTimeout(function() {
            URL.revokeObjectURL(url);
            if (link.parentNode) link.parentNode.removeChild(link);
        }, 0);
    }

    function isLikelyBrowserWritePermissionError(error) {
        return isLikelyBrowserWritePermissionErrorCore(error);
    }

    async function requestBrowserWriteHandle() {
        if (typeof global.showOpenFilePicker !== 'function') return null;
        try {
            const handles = await global.showOpenFilePicker({
                multiple: false,
                types: [{
                    description: 'Markdown',
                    accept: {
                        'text/markdown': ['.md', '.markdown'],
                        'text/plain': ['.txt']
                    }
                }]
            });
            return handles && handles[0] ? handles[0] : null;
        } catch (error) {
            if (error && error.name === 'AbortError') return null;
            throw error;
        }
    }

    async function writeBrowserLocalFileWithRetry(fileId, content) {
        let handle = browserFileHandleMap.get(fileId);
        if (!handle) {
            handle = await requestBrowserWriteHandle();
            if (!handle) return { success: false, canceled: true };
            browserFileHandleMap.set(fileId, handle);
        }

        try {
            const writable = await handle.createWritable();
            await writable.write(content);
            await writable.close();
            localExternalSnapshotMap.set(fileId, content);
            return { success: true };
        } catch (error) {
            if (!isLikelyBrowserWritePermissionError(error)) {
                return { success: false, error: error };
            }

            global.showMessage(t('localFileNeedReauthorize'), 'warning');
            const reauthorizedHandle = await requestBrowserWriteHandle();
            if (!reauthorizedHandle) return { success: false, canceled: true };
            browserFileHandleMap.set(fileId, reauthorizedHandle);

            try {
                const writable = await reauthorizedHandle.createWritable();
                await writable.write(content);
                await writable.close();
                localExternalSnapshotMap.set(fileId, content);
                return { success: true, reauthorized: true };
            } catch (retryError) {
                return { success: false, error: retryError };
            }
        }
    }

    async function syncFileAfterSaveIfNeeded(currentFileId, file, content, isManual, contentChanged) {
        if (isExternalLocalFile(file)) {
            g('lastSyncedContent')[currentFileId] = content;
            markPendingServerSync(currentFileId, false);
            return true;
        }

        if (!g('currentUser')) {
            g('lastSyncedContent')[currentFileId] = content;
            return true;
        }

        markPendingServerSync(currentFileId, true);
        try {
            const saveResult = await global.syncFileToServer(currentFileId, { background: !isManual });
            if (isManual && contentChanged && saveResult) {
                try { await global.createHistoryVersion(file.name, content); } catch (e) { console.warn('创建历史版本失败', e); }
            }
            if (saveResult) {
                markPendingServerSync(currentFileId, false);
                return true;
            }
        } catch (e) {
            // 保持 pending
            return false;
        }

        return false;
    }

    async function readExternalSourceContent(file, fileId) {
        if (!file || !file.isExternalLocal) return null;

        if (global.electron && file.localFilePath && typeof global.electron.readLocalFile === 'function') {
            const result = await global.electron.readLocalFile(file.localFilePath);
            if (!result || !result.success) return null;
            return result.content || '';
        }

        if (file.localFileMode === 'browser-fsa') {
            const handle = browserFileHandleMap.get(fileId);
            if (!handle || typeof handle.getFile !== 'function') return null;
            const browserFile = await handle.getFile();
            return await readTextFromBrowserFile(browserFile);
        }

        return null;
    }

    async function checkExternalLocalConflictForCurrentFile() {
        const currentFileId = g('currentFileId');
        if (!currentFileId) return;
        if (localExternalConflictPrompting.has(currentFileId)) return;

        const files = g('files');
        const file = files.find(function(f) { return f.id === currentFileId && f.type === 'file'; });
        if (!file || !file.isExternalLocal) return;
        if (g('unsavedChanges')[currentFileId]) return;

        if (!localExternalSnapshotMap.has(currentFileId)) {
            localExternalSnapshotMap.set(currentFileId, file.content || '');
            return;
        }

        let latestExternalContent;
        try {
            latestExternalContent = await readExternalSourceContent(file, currentFileId);
        } catch (error) {
            return;
        }
        if (latestExternalContent == null) return;

        const baselineContent = localExternalSnapshotMap.get(currentFileId);
        if (latestExternalContent === baselineContent) return;

        localExternalConflictPrompting.add(currentFileId);
        try {
            const useExternal = await g('customConfirm')(t('externalFileModifiedConfirm'));
            if (useExternal) {
                file.content = latestExternalContent;
                file.lastModified = Date.now();
                localStorage.setItem('vditor_files', JSON.stringify(files));
                setEditorContentForFile(currentFileId, latestExternalContent);
                g('unsavedChanges')[currentFileId] = false;
                localExternalSnapshotMap.set(currentFileId, latestExternalContent);
                loadFiles();
                global.showMessage(t('externalFileReloaded'), 'warning');
                await syncFileAfterSaveIfNeeded(currentFileId, file, latestExternalContent, false, true);
            } else {
                // 用户拒绝覆盖时更新快照，避免重复弹窗。
                localExternalSnapshotMap.set(currentFileId, latestExternalContent);
                global.showMessage(t('externalFileModified'), 'warning');
            }
        } finally {
            localExternalConflictPrompting.delete(currentFileId);
        }
    }

    function startExternalLocalConflictMonitor() {
        if (global.externalLocalConflictInterval) return;
        global.externalLocalConflictInterval = setInterval(function() {
            checkExternalLocalConflictForCurrentFile().catch(function() {});
        }, 4000);
    }

    async function openExternalLocalFileInBrowser() {
        try {
            if (typeof global.showOpenFilePicker === 'function') {
                const handles = await global.showOpenFilePicker({
                    multiple: false,
                    types: [{
                        description: 'Markdown',
                        accept: {
                            'text/markdown': ['.md', '.markdown'],
                            'text/plain': ['.txt']
                        }
                    }]
                });
                const handle = handles && handles[0];
                if (!handle) return false;
                const browserFile = await handle.getFile();
                const content = await readTextFromBrowserFile(browserFile);
                const localPath = createBrowserLocalPath(browserFile.name);
                return openExternalLocalFileByPath(localPath, {
                    success: true,
                    path: localPath,
                    name: browserFile.name,
                    content: content,
                    localFileMode: 'browser-fsa',
                    browserFileHandle: handle
                });
            }

            const fallbackFile = await pickLocalFileByInput();
            if (!fallbackFile) return false;
            const fallbackContent = await readTextFromBrowserFile(fallbackFile);
            const fallbackPath = createBrowserLocalPath(fallbackFile.name);
            return openExternalLocalFileByPath(fallbackPath, {
                success: true,
                path: fallbackPath,
                name: fallbackFile.name,
                content: fallbackContent,
                localFileMode: 'browser-file'
            });
        } catch (error) {
            if (error && error.name === 'AbortError') {
                return false;
            }
            global.showMessage((isEn() ? 'Failed to open local file: ' : '打开本地文件失败：') + (error && error.message ? error.message : ''), 'error');
            return false;
        }
    }

    async function openExternalLocalFileByPath(filePath, presetData) {
        if (!filePath) return false;

        let fileData = presetData;
        if (!fileData) {
            if (!global.electron || typeof global.electron.readLocalFile !== 'function') {
                global.showMessage((isEn() ? 'Failed to open local file' : '打开本地文件失败') + ': ' + (isEn() ? 'Unsupported environment' : '当前环境不支持'), 'warning');
                return false;
            }
            fileData = await global.electron.readLocalFile(filePath);
        }

        if (!fileData || !fileData.success) {
            global.showMessage((isEn() ? 'Failed to open local file: ' : '打开本地文件失败：') + ((fileData && fileData.error) || ''), 'error');
            return false;
        }

        const resolvedPath = fileData.path || filePath || createBrowserLocalPath(fileData.name);
        const localFileMode = fileData.localFileMode || (global.electron ? 'electron' : 'browser-file');

        const files = g('files');
        let target = files.find(function(f) { return f.type === 'file' && f.isExternalLocal && f.localFilePath === resolvedPath; });
        const now = Date.now();

        if (!target) {
            const baseName = fileData.name || getPathBasename(resolvedPath) || (isEn() ? 'Local file' : '本地文件');
            const safeName = getNextAvailableName(baseName, '');
            target = {
                id: 'local-' + now + '-' + Math.random().toString(36).slice(2, 8),
                name: safeName,
                type: 'file',
                content: fileData.content || '',
                lastModified: now,
                isSynced: false,
                isExternalLocal: true,
                localFilePath: resolvedPath,
                localFileMode: localFileMode
            };
            files.push(target);
        } else {
            target.content = fileData.content || '';
            target.lastModified = now;
            target.isSynced = false;
            target.localFileMode = localFileMode;
            if (!target.localFilePath) target.localFilePath = resolvedPath;
        }

        if (fileData.browserFileHandle) {
            browserFileHandleMap.set(target.id, fileData.browserFileHandle);
        }
        localExternalSnapshotMap.set(target.id, target.content || '');

        localStorage.setItem('vditor_files', JSON.stringify(files));
        g('lastSyncedContent')[target.id] = target.content;
        g('unsavedChanges')[target.id] = false;
        loadFiles();
        openFile(target.id);
        return true;
    }

    async function openExternalLocalFileByDialog() {
        if (global.electron && typeof global.electron.openLocalFileDialog === 'function') {
            const result = await global.electron.openLocalFileDialog();
            if (!result || result.canceled) return false;
            return openExternalLocalFileByPath(result.path, result);
        }
        return openExternalLocalFileInBrowser();
    }

    // 获取所有可用目标文件夹（包含虚拟中间文件夹）
    function getAllFolderPaths() {
        return getAllFolderPathsCore(global, g('files') || []);
    }

    function isWasmFileOpsReady() {
        return isWasmFileOpsReadyCore(global);
    }

    function deferFileTreeWorkUntilWasmReady(callback, label) {
        if (isWasmFileOpsReady()) return false;
        if (typeof global.ensureWasmTextEngineReady !== 'function') {
            throw new Error('wasm text engine is required before ' + label);
        }
        global.ensureWasmTextEngineReady().then(function() {
            callback();
        }).catch(function(error) {
            console.error('[files] wasm gating failed before ' + label + ':', error);
            if (typeof global.showMessage === 'function') {
                global.showMessage(
                    (isEn() ? 'Initialization failed: ' : '初始化失败：') + ((error && error.message) || 'wasm text engine unavailable'),
                    'error'
                );
            }
        });
        return true;
    }

    // ---------- 服务器同步相关 ----------
    async function loadFilesFromServer(preserveFileName) {
        if (!g('currentUser')) return;
        const requestUsername = g('currentUser').username;
        function isStillCurrentUser() {
            return g('currentUser') && g('currentUser').username === requestUsername;
        }

        try {
            if (typeof global.ensureWasmTextEngineReady === 'function') {
                await global.ensureWasmTextEngineReady();
                if (!isStillCurrentUser()) return;
            }
            await refreshOwnerShareCache(true);
            if (!isStillCurrentUser()) return;
            var api = global.getApiBaseUrl ? global.getApiBaseUrl() : 'api';
            const response = await fetch(api + '/files?username=' + encodeURIComponent(g('currentUser').username), {
                headers: { 'Authorization': 'Bearer ' + g('currentUser').token }
            });
            const result = global.parseJsonResponse ? await global.parseJsonResponse(response) : await response.json();
            if (!isStillCurrentUser()) return;

            // 处理 Token 过期
            if (result.code === 401 || (global.isTokenError && global.isTokenError(result))) {
                if (await tryHandleTokenExpired(result)) {
                    return;
                }
            }

            if (result.code === 200 && result.data && result.data.files) {
                // 对服务器返回的文件名进行标准化（去除开头的 /）
                let serverFiles = result.data.files.map(f => {
                    let type = 'file';
                    let content = f.content;
                    let name = f.name.startsWith('/') ? f.name.substring(1) : f.name;

                    // 检查是否为文件夹：以 / 结尾，或者内容包含特定标记
                    if (name.endsWith('/') || content === '{"meta":"folder"}' || content === '{"type":"folder"}') {
                        type = 'folder';
                        if (content === '{"meta":"folder"}' || content === '{"type":"folder"}') {
                            content = '';
                        }
                        if (name.endsWith('/')) {
                            name = name.substring(0, name.length - 1);
                        }
                    }

                    const serverLastModified = f.last_modified || f.lastModified || null;
                    const hasServerContentVersion =
                        (f.content_version !== undefined && f.content_version !== null && f.content_version !== '') ||
                        (f.contentVersion !== undefined && f.contentVersion !== null && f.contentVersion !== '');
                    return {
                        ...f,
                        name: name,
                        type: type,
                        content: content,
                        lastModified: serverLastModified,
                        serverLastModified: serverLastModified,
                        contentVersion: hasServerContentVersion ? Number(f.content_version ?? f.contentVersion) : null
                    };
                });

                // 第二遍扫描：如果一个项是其他项的父级，强制将其设为文件夹
                const folderPaths = new Set();
                serverFiles.forEach(f => {
                    const parts = f.name.split('/');
                    if (parts.length > 1) {
                        // 记录所有父路径
                        let current = '';
                        for (let i = 0; i < parts.length - 1; i++) {
                            current = current ? current + '/' + parts[i] : parts[i];
                            folderPaths.add(current);
                        }
                    }
                });

                serverFiles.forEach(f => {
                    if (folderPaths.has(f.name)) {
                        f.type = 'folder';
                        // 如果是隐式文件夹，内容强制为空（忽略可能的错误内容）
                        if (f.content !== '{"meta":"folder"}') f.content = '';
                    }
                });

                const localFiles = JSON.parse(localStorage.getItem('vditor_files') || '[]');
                // 迁移：给本地文件增加type字段，默认为file
                localFiles.forEach(f => {
                    if (!f.type) f.type = 'file';
                    if (typeof f.isSynced !== 'boolean') f.isSynced = false;
                    if (f.contentVersion === undefined || f.contentVersion === null) {
                        const hasLocalContentVersion = f.content_version !== undefined && f.content_version !== null && f.content_version !== '';
                        f.contentVersion = hasLocalContentVersion ? Number(f.content_version) : null;
                    }
                    normalizeExternalLocalFileRecord(f);
                });
                syncCurrentEditorSnapshotIntoFiles(localFiles);

                // 当用户从未登录 -> 登录时，本地可能存在服务器从未见过的文件。
                // 这些文件不应弹冲突窗口，应直接上传并保存到用户服务器上。
                await uploadLocalOnlyFilesToServerIfNeeded(localFiles, serverFiles);
                if (!isStillCurrentUser()) return;

                mergeFiles(localFiles, serverFiles);
                loadFiles();

                if (shouldAutoOpenInitialFile()) {
                    if (preserveFileName) {
                        const preservedFile = g('files').find(f => f.name === preserveFileName && f.type === 'file');
                        if (preservedFile) {
                            openFile(preservedFile.id);
                        } else if (g('files').length > 0) {
                            openFirstFile();
                        } else {
                            createDefaultFile();
                        }
                    } else {
                        if (g('files').length > 0) openFirstFile();
                        else createDefaultFile();
                    }
                }

                const pendingServerSync = g('pendingServerSync') || {};
                const pendingFileIds = Object.keys(pendingServerSync).filter(id => pendingServerSync[id]);
                if (pendingFileIds.length > 0) {
                    setTimeout(() => {
                        (async () => {
                            for (const fileId of pendingFileIds) {
                                try {
                                    await global.syncFileToServer(fileId);
                                } catch (e) {
                                    console.warn('自动同步文件失败:', fileId, e);
                                }
                            }
                        })();
                    }, 1000);
                }
            } else {
                loadLocalFiles();
                global.showSyncStatus(isEn() ? 'No files on server, using local files' : '服务器没有文件，使用本地文件', 'success');
            }
        } catch (error) {
            console.error('从服务器加载文件失败:', error);
            await tryHandleTokenExpired(error);
            global.showSyncStatus(isEn() ? 'Sync failed, using local files' : '同步失败，使用本地文件', 'error');
            loadLocalFiles();
        }
    }

    function normalizeServerFileRecord(f) {
        return normalizeServerFileRecordCore(f);
    }

    function getServerDeletedEditingMessage(file) {
        const name = file && file.name ? file.name : (isEn() ? 'Current file' : '当前文件');
        return isEn()
            ? `The server copy of "${name}" was deleted. Your local editing copy is kept; saving will upload it again.`
            : `服务器上的“${name}”已被删除。本地正在编辑的副本已保留，保存后会重新上传。`;
    }

    function markOpenFileDeletedOnServer(file, editorContent) {
        if (!file || String(file.id || '') !== String(g('currentFileId') || '') || file.type !== 'file') return false;

        const wasDeleted = !!file.serverDeleted;
        const shouldNotify = !file.serverDeletedNotified;
        const previousContent = String(file.content || '');
        file.content = String(editorContent ?? file.content ?? '');
        file.lastModified = Date.now();
        file.serverLastModified = null;
        file.contentVersion = 0;
        file.isSynced = false;
        file.serverDeleted = true;
        delete file.crdtBaseContent;
        delete file.crdtBaseContentVersion;
        const lastSynced = g('lastSyncedContent') || {};
        const unsaved = g('unsavedChanges') || {};
        global.lastSyncedContent = lastSynced;
        global.unsavedChanges = unsaved;
        delete lastSynced[file.id];
        unsaved[file.id] = true;

        if (shouldNotify) {
            file.serverDeletedNotified = true;
            if (typeof global.showMessage === 'function') {
                global.showMessage(getServerDeletedEditingMessage(file), 'warning');
            } else if (typeof global.showSyncStatus === 'function') {
                global.showSyncStatus(getServerDeletedEditingMessage(file), 'warning');
            }
        }

        return shouldNotify || !wasDeleted || previousContent !== file.content;
    }

    async function pullServerUpdatesForCleanFiles() {
        if (!g('currentUser')) return;

        const files = g('files') || [];
        const currentFileId = g('currentFileId');
        const lastSyncedContent = g('lastSyncedContent') || {};
        const unsavedChanges = g('unsavedChanges') || {};
        const pendingServerSync = g('pendingServerSync') || {};

        const api = global.getApiBaseUrl ? global.getApiBaseUrl() : 'api';
        const response = await fetch(api + '/files?username=' + encodeURIComponent(g('currentUser').username), {
            method: 'GET',
            headers: { 'Authorization': 'Bearer ' + g('currentUser').token }
        });
        const result = global.parseJsonResponse ? await global.parseJsonResponse(response) : await response.json();
        if (result.code !== 200 || !result.data || !Array.isArray(result.data.files)) return;

        const serverFiles = result.data.files.map(normalizeServerFileRecord);
        const serverMap = {};
        serverFiles.forEach(function(sf) {
            serverMap[sf.name] = sf;
        });

        let hasLocalUpdate = false;
        const localByName = {};
        files.forEach(function(file) {
            if (!file || !file.name || isExternalLocalFile(file)) return;
            localByName[file.name] = file;
        });

        serverFiles.forEach(function(serverFile) {
            if (!serverFile || !serverFile.name || localByName[serverFile.name]) return;
            const serverLastModified = serverFile.serverLastModified || serverFile.lastModified || null;
            const newFile = {
                id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                name: serverFile.name,
                type: serverFile.type || 'file',
                content: serverFile.type === 'folder' ? '' : (serverFile.content || ''),
                lastModified: serverLastModified,
                serverLastModified: serverLastModified,
                contentVersion: serverFile.contentVersion !== null && serverFile.contentVersion !== undefined
                    ? Number(serverFile.contentVersion)
                    : null,
                isSynced: true
            };
            files.push(newFile);
            lastSyncedContent[newFile.id] = newFile.content;
            unsavedChanges[newFile.id] = false;
            hasLocalUpdate = true;
        });

        for (let i = files.length - 1; i >= 0; i--) {
            const file = files[i];
            if (!file || !file.name) continue;
            if (isExternalLocalFile(file)) continue;
            if (serverMap[file.name]) continue;

            const editorContent = file.id === currentFileId
                ? getCurrentEditorContent(currentFileId, file.content)
                : file.content;
            if (String(file.id || '') === String(currentFileId || '') && file.type === 'file') {
                hasLocalUpdate = markOpenFileDeletedOnServer(file, editorContent) || hasLocalUpdate;
                continue;
            }

            if (pendingServerSync[file.id]) continue;
            const baseContent = lastSyncedContent[file.id];
            const hasLocalChanges = file.type === 'file'
                ? (!file.isSynced || unsavedChanges[file.id] || editorContent !== baseContent)
                : (!file.isSynced || unsavedChanges[file.id]);

            if (hasLocalChanges) continue;

            delete lastSyncedContent[file.id];
            delete unsavedChanges[file.id];
            delete pendingServerSync[file.id];
            files.splice(i, 1);
            if (file.id === currentFileId) {
                global.currentFileId = null;
            }
            hasLocalUpdate = true;
        }

        files.forEach(function(file) {
            if (!file || file.type !== 'file') return;
            if (isExternalLocalFile(file)) return;
            if (pendingServerSync[file.id]) return;

            const serverFile = serverMap[file.name];
            if (!serverFile || serverFile.type !== 'file') return;

            const editorContent = file.id === currentFileId
                ? getCurrentEditorContent(currentFileId, file.content)
                : file.content;
            const baseContent = lastSyncedContent[file.id];
            const hasLocalChanges = !file.isSynced || unsavedChanges[file.id] || editorContent !== baseContent;
            if (hasLocalChanges) return;

            if (serverFile.content !== editorContent) {
                file.content = serverFile.content;
                file.lastModified = serverFile.lastModified || file.lastModified || null;
                file.serverLastModified = serverFile.serverLastModified || serverFile.lastModified || file.serverLastModified || null;
                file.contentVersion = serverFile.contentVersion !== null && serverFile.contentVersion !== undefined
                    ? Number(serverFile.contentVersion)
                    : file.contentVersion;
                file.isSynced = true;
                delete file.serverDeleted;
                delete file.serverDeletedNotified;
                lastSyncedContent[file.id] = serverFile.content;
                unsavedChanges[file.id] = false;
                if (file.id === currentFileId) {
                    setEditorContentForFile(currentFileId, serverFile.content, { preserveCursor: true });
                }
                hasLocalUpdate = true;
            }
        });

        if (hasLocalUpdate) {
            localStorage.setItem('vditor_files', JSON.stringify(files));
            if (typeof global.loadFiles === 'function') {
                global.loadFiles();
            }
            global.showSyncStatus(isEn() ? 'Updated local files from server changes' : '已拉取服务器更新到本地', 'success');
        }
    }

    const syncRuntimeApi = createSyncRuntimeApi({
        globalRef: global,
        g,
        isExternalLocalFile,
        getCurrentEditorContent,
        setEditorContentForFile,
        markPendingServerSync,
        tryHandleTokenExpired,
        pullServerUpdatesForCleanFiles,
        isEn
    });

    async function uploadLocalOnlyFilesToServerIfNeeded(localFiles, serverFiles) {
        if (!g('currentUser')) return;
        const uploadUser = g('currentUser');
        function isStillUploadUser() {
            return g('currentUser') && g('currentUser').username === uploadUser.username;
        }

        const serverFileMap = {};
        serverFiles.forEach(function(f) { serverFileMap[f.name] = f; });

        const toUpload = localFiles.filter(function(f) {
            if (!f || !f.name) return false;
            if (f.type !== 'file' && f.type !== 'folder') return false;
            if (isExternalLocalFile(f)) return false;
            if (serverFileMap[f.name]) return false;
            // 只上传“从未同步过”的本地文件/文件夹
            return !f.isSynced;
        });

        if (toUpload.length === 0) return;

        try {
            // global.showSyncStatus(isEn() ? 'Detected local new files, automatically uploading ' + toUpload.length + '...' : '检测到本地新文件，正在自动上传 ' + toUpload.length + ' 个...');
        } catch (e) {}

        // 逐个上传，确保顺序和稳定性
        for (let i = 0; i < toUpload.length; i++) {
            if (!isStillUploadUser()) return;
            const f = toUpload[i];
            try {
                // 如果当前文件正在编辑，用编辑器内容为准
                const content =
                    f.type === 'folder'
                        ? ''
                        : (f.id === g('currentFileId') ? getCurrentEditorContent(f.id, f.content) : f.content);

                // 使用现有的保存接口（verifyUser 支持 body.token），避免依赖自定义 Header（sendBeacon 也可用）
                const filenameToSend = f.type === 'folder' ? (f.name.endsWith('/') ? f.name : (f.name + '/')) : f.name;
                const body = {
                    username: uploadUser.username,
                    token: uploadUser.token,
                    filename: filenameToSend,
                    content: f.type === 'folder' ? '{"meta":"folder"}' : content,
                    base_last_modified: f.serverLastModified || null
                };

                const contentVersion = Number(f.contentVersion || 0);
                if (Number.isFinite(contentVersion) && contentVersion > 0) {
                    body.base_content_version = contentVersion;
                }

                const api = global.getApiBaseUrl ? global.getApiBaseUrl() : 'api';
                const resp = await fetch(api + '/files/save', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
                const r = global.parseJsonResponse ? await global.parseJsonResponse(resp) : await resp.json();

                // 检查 Token 错误
                if (global.isTokenError && global.isTokenError(r)) {
                    const handled = await global.handleTokenExpired();
                    if (handled && isStillUploadUser()) {
                        // 使用新 Token 重试
                        body.token = g('currentUser').token;
                        const retryResp = await fetch(api + '/files/save', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(body)
                        });
                        const retryR = global.parseJsonResponse ? await global.parseJsonResponse(retryResp) : await retryResp.json();
                        if (retryR.code === 200) {
                            f.isSynced = true;
                            f.lastModified = Date.now();
                            serverFiles.push({
                                name: f.name,
                                type: f.type,
                                content: f.type === 'folder' ? '{"meta":"folder"}' : content,
                                lastModified: f.lastModified
                            });
                        }
                    }
                    continue;
                }

                if (r.code === 200) {
                    // 标记本地为已同步，并把它加入 serverFiles，避免后续被当成缺失
                    f.isSynced = true;
                    f.lastModified = Date.now();
                    f.serverLastModified = r.data && r.data.last_modified ? r.data.last_modified : f.lastModified;
                    f.contentVersion = Number(r.data && r.data.content_version ? r.data.content_version : (f.contentVersion || 1));
                    serverFiles.push({
                        name: f.name,
                        type: f.type,
                        content: f.type === 'folder' ? '{"meta":"folder"}' : content,
                        lastModified: f.lastModified,
                        serverLastModified: f.serverLastModified,
                        contentVersion: f.contentVersion
                    });
                } else {
                    console.warn('自动上传失败:', f.name, r.message);
                }
            } catch (e) {
                console.warn('自动上传异常:', f.name, e);
            }
        }

        // 写回 localStorage，确保后续不会重复上传
        try {
            localStorage.setItem('vditor_files', JSON.stringify(localFiles));
        } catch (e) {}
    }

    function syncCurrentFileWithBeacon() {
        return syncRuntimeApi.syncCurrentFileWithBeacon();
    }

    // ---------- 差异对比功能 ----------
    
    /**
     * 计算两个文本的差异（基于行的简单LCS算法）
     * 返回格式：[{type: 'same'|'added'|'removed', left: string, right: string}]
     */
    function computeDiff(leftText, rightText) {
        return computeDiffCore(global, leftText, rightText);
    }

    function renderSameDiffRowHTML(leftLineNo, rightLineNo, leftText, rightText, extraClass, expandedFromId) {
        const cls = extraClass ? (' ' + extraClass) : '';
        const expandedAttr = expandedFromId ? (' data-expanded-from="' + expandedFromId + '"') : '';
        return '<div class="diff-line diff-same' + cls + '"' + expandedAttr + '>' +
            '<div class="diff-line-num">' + leftLineNo + '</div>' +
            '<div class="diff-line-content"><pre>' + escapeHtml(leftText) + '</pre></div>' +
            '<div class="diff-line-num">' + rightLineNo + '</div>' +
            '<div class="diff-line-content"><pre>' + escapeHtml(rightText) + '</pre></div>' +
            '</div>';
    }

    function bindCollapsedDiffInteractions(diffContainer) {
        bindCollapsedDiffInteractionsCore(diffContainer);
    }

    function renderDiffView(diffResult, options) {
        const opts = options || {};
        return renderDiffViewCore(diffResult || [], isEn(), opts.collapseSame !== false);
    }

    function escapeHtml(text) {
        return escapeHtmlCore(text);
    }

    function showDiffModal(conflict) {
        const diffModal = document.getElementById('diffModalOverlay');
        const diffContent = document.getElementById('diffContent');
        const diffFileName = document.getElementById('diffFileName');
        const diffLocalTime = document.getElementById('diffLocalTime');
        const diffServerTime = document.getElementById('diffServerTime');

        if (!diffModal || !diffContent) return;

        diffFileName.textContent = conflict.filename;
        diffLocalTime.textContent = formatDiffTime(conflict.localModified);
        diffServerTime.textContent = formatDiffTime(conflict.serverModified);

        const diffResult = computeDiff(conflict.localContent || '', conflict.serverContent || '');
        diffContent.innerHTML = renderDiffView(diffResult, { collapseSame: true });
        bindCollapsedDiffInteractions(diffContent);

        diffModal.classList.add('show');

        const closeBtn = document.getElementById('closeDiffBtn');
        const closeModalBtn = document.getElementById('closeDiffModalBtn');
        const closeModal = function() {
            diffModal.classList.remove('show');
        };

        if (closeBtn) closeBtn.onclick = closeModal;
        if (closeModalBtn) closeModalBtn.onclick = closeModal;
        diffModal.onclick = function(e) {
            if (e.target === diffModal) closeModal();
        };
    }

    function showMergePreviewModal(conflict) {
        showDiffModal(conflict);
    }

    function mergeFiles(localFiles, serverFiles) {
        const mergedFiles = [];
        const fileMap = {};
        const pendingServerSync = g('pendingServerSync') || {};
        const lastSyncedContent = g('lastSyncedContent') || {};
        const unsavedChanges = g('unsavedChanges') || {};
        let removedCurrentFile = false;
        serverFiles.forEach(function(serverFile) {
            const serverLastModified = serverFile.serverLastModified || serverFile.lastModified || null;
            const hasVersion =
                (serverFile.contentVersion !== undefined && serverFile.contentVersion !== null && serverFile.contentVersion !== '') ||
                (serverFile.content_version !== undefined && serverFile.content_version !== null && serverFile.content_version !== '');
            const file = {
                id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                name: serverFile.name,
                type: serverFile.type || 'file',
                content: serverFile.content,
                lastModified: serverLastModified,
                serverLastModified: serverLastModified,
                contentVersion: hasVersion ? Number(serverFile.contentVersion ?? serverFile.content_version) : null,
                isSynced: true
            };
            mergedFiles.push(file);
            fileMap[serverFile.name] = file;
        });
        localFiles.forEach(function(localFile) {
            if (isExternalLocalFile(localFile)) {
                normalizeExternalLocalFileRecord(localFile);
                mergedFiles.push(Object.assign({}, localFile));
                return;
            }
            const mergedServerFile = fileMap[localFile.name];
            if (mergedServerFile) {
                if (localFile.id) {
                    mergedServerFile.id = localFile.id;
                }
                const localBaseContent = localFile && localFile.id ? lastSyncedContent[localFile.id] : undefined;
                if (localFile.type === 'file' && mergedServerFile.type === 'file') {
                    if (localFile.content !== mergedServerFile.content) {
                        const baseContent = typeof localBaseContent === 'string' ? localBaseContent : '';
                        const baseVersionRaw = Number(localFile.contentVersion);
                        mergedServerFile.content = localFile.content;
                        mergedServerFile.lastModified = localFile.lastModified || Date.now();
                        mergedServerFile.serverLastModified = mergedServerFile.serverLastModified || null;
                        mergedServerFile.contentVersion = Number.isFinite(baseVersionRaw) ? baseVersionRaw : 0;
                        mergedServerFile.isSynced = false;
                        mergedServerFile.crdtBaseContent = baseContent;
                        mergedServerFile.crdtBaseContentVersion = Number.isFinite(baseVersionRaw) ? baseVersionRaw : 0;
                        g('unsavedChanges')[mergedServerFile.id] = true;
                        markPendingServerSync(mergedServerFile.id, true);
                    } else {
                        mergedServerFile.isSynced = true;
                        delete mergedServerFile.crdtBaseContent;
                        delete mergedServerFile.crdtBaseContentVersion;
                    }
                }
                return;
            }

            const hasPendingLocalSync = !!(localFile && localFile.id && pendingServerSync[localFile.id]);
            const localBaseContent = localFile && localFile.id ? lastSyncedContent[localFile.id] : undefined;
            const hasLocalChanges = localFile.type === 'file'
                ? (!localFile.isSynced || unsavedChanges[localFile.id] || localFile.content !== localBaseContent)
                : (!localFile.isSynced || unsavedChanges[localFile.id]);

            if (String(localFile.id || '') === String(g('currentFileId') || '') && localFile.type === 'file') {
                const localCopy = Object.assign({}, localFile);
                markOpenFileDeletedOnServer(localCopy, getCurrentEditorContent(localCopy.id, localCopy.content));
                mergedFiles.push(localCopy);
                return;
            }

            if (localFile.isSynced && !hasPendingLocalSync && !hasLocalChanges) {
                if (localFile.id) {
                    delete lastSyncedContent[localFile.id];
                    delete unsavedChanges[localFile.id];
                    delete pendingServerSync[localFile.id];
                    if (String(localFile.id) === String(g('currentFileId') || '')) {
                        removedCurrentFile = true;
                    }
                }
                return;
            }

            mergedFiles.push(Object.assign({}, localFile, { isSynced: false }));
        });
        if (removedCurrentFile) {
            global.currentFileId = null;
        }
        global.files = mergedFiles;
        localStorage.setItem('vditor_files', JSON.stringify(global.files));
        mergedFiles.forEach(function(file) {
            if (!file || !file.id || isExternalLocalFile(file)) return;
            if (file.isSynced) {
                lastSyncedContent[file.id] = file.content;
                unsavedChanges[file.id] = false;
                return;
            }
            if (typeof file.crdtBaseContent === 'string') {
                lastSyncedContent[file.id] = file.crdtBaseContent;
            }
            unsavedChanges[file.id] = true;
        });
    }

    let hasNotifiedInitialFileListRendered = false;
    let hasBoundFabRingDismiss = false;
    const FILE_LIST_SEARCH_DEBOUNCE = 180;
    const fileListSearchState = {
        query: '',
        scope: 'title',
        timer: null,
        token: 0,
        matchedNodeIds: new Set(),
        totalMatches: 0,
        applyingVisibility: false
    };

    function shouldAutoOpenInitialFile() {
        return !global.deferInitialFileOpen;
    }

    function notifyInitialFileListRendered() {
        if (hasNotifiedInitialFileListRendered) return;
        hasNotifiedInitialFileListRendered = true;

        if (global.startInFileManagementMode) {
            const loadingEl = document.getElementById('loading');
            if (loadingEl) loadingEl.style.display = 'none';
        }

        if (typeof global.onInitialFileListRendered === 'function') {
            global.onInitialFileListRendered();
        }
    }

    function closeFileManagementFabRing() {
        const fab = document.getElementById('fileManagementFab');
        const ring = document.getElementById('fileManagementFabRing');
        if (fab) fab.classList.remove('open');
        if (ring) {
            ring.classList.remove('open');
            ring.setAttribute('aria-hidden', 'true');
        }
    }

    function toggleFileManagementFabRing() {
        const fab = document.getElementById('fileManagementFab');
        const ring = document.getElementById('fileManagementFabRing');
        if (!fab || !ring) return;

        const willOpen = !ring.classList.contains('open');
        if (!willOpen) {
            closeFileManagementFabRing();
            return;
        }

        fab.classList.add('open');
        ring.classList.add('open');
        ring.setAttribute('aria-hidden', 'false');
    }

    function bindFileManagementFabIfNeeded() {
        const fab = document.getElementById('fileManagementFab');
        const ring = document.getElementById('fileManagementFabRing');
        const newFileBtn = document.getElementById('fileManagementFabNewFile');
        const newFolderBtn = document.getElementById('fileManagementFabNewFolder');
        if (!fab || fab.dataset.bound === '1') return;

        fab.dataset.bound = '1';
        fab.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            if (ring) {
                toggleFileManagementFabRing();
                return;
            }
            global.createNewFile();
        });

        if (newFileBtn) {
            newFileBtn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                closeFileManagementFabRing();
                global.createNewFile();
            });
        }

        if (newFolderBtn) {
            newFolderBtn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                closeFileManagementFabRing();
                global.createNewFolder();
            });
        }

        if (!hasBoundFabRingDismiss) {
            hasBoundFabRingDismiss = true;
            document.addEventListener('click', function(e) {
                const fabEl = document.getElementById('fileManagementFab');
                const ringEl = document.getElementById('fileManagementFabRing');
                if (!ringEl || !ringEl.classList.contains('open')) return;

                if ((fabEl && fabEl.contains(e.target)) || ringEl.contains(e.target)) {
                    return;
                }

                closeFileManagementFabRing();
            });

            document.addEventListener('keydown', function(e) {
                if (e.key === 'Escape') closeFileManagementFabRing();
            });
        }
    }

    function setFileListSearchResult(message, isError) {
        const resultEl = document.getElementById('fileListSearchResult');
        if (!resultEl) return;
        resultEl.textContent = message || '';
        resultEl.classList.toggle('error', !!isError);
    }

    function collectTitleNodeMatches(gateway, query) {
        const matchedNodeIds = new Set();
        let totalMatches = 0;

        let nodes = [];
        const tree = window.$ ? window.$('#fileList').jstree(true) : null;
        if (tree && typeof tree.get_json === 'function') {
            nodes = tree.get_json('#', { flat: true }) || [];
        } else {
            nodes = getJsTreeData();
        }

        nodes.forEach(function(node) {
            if (!node) return;
            const id = String(node.id || '');
            if (!id || id === '#') return;

            const data = node.data || {};
            const path = String(data.path || '').trim();
            if (path === '.easypocketmd_orders') return;
            if (data.type === 'file' && isHiddenCrossSearchFile(path)) return;

            const title = getBasename(path || String(node.text || '').trim());
            if (!title) return;

            const titleRes = gateway.findInText(String(title), query, { caseSensitive: false });
            if (!titleRes || titleRes.code !== 200 || !titleRes.data) return;

            const count = Number(titleRes.data.count || 0);
            if (count > 0) {
                matchedNodeIds.add(id);
                totalMatches += count;
            }
        });

        return {
            matchedNodeIds: matchedNodeIds,
            totalMatches: totalMatches
        };
    }

    function clearFileListSearchFilter() {
        fileListSearchState.query = '';
        fileListSearchState.matchedNodeIds = new Set();
        fileListSearchState.totalMatches = 0;
        if (fileListSearchState.timer) {
            clearTimeout(fileListSearchState.timer);
            fileListSearchState.timer = null;
        }
        setFileListSearchResult('');
        reapplyFileListSearchVisibility();
    }

    function reapplyFileListSearchVisibility() {
        if (fileListSearchState.applyingVisibility || !window.$) return;
        const tree = window.$('#fileList').jstree(true);
        const root = document.getElementById('fileList');
        if (!tree || !root) return;

        const query = String(fileListSearchState.query || '').trim();
        const nodeEls = root.querySelectorAll('li.jstree-node');

        if (!query) {
            nodeEls.forEach(function(el) { el.classList.remove('file-list-search-hidden'); });
            return;
        }

        fileListSearchState.applyingVisibility = true;
        try {
            const visibleNodeIds = new Set();
            fileListSearchState.matchedNodeIds.forEach(function(nodeId) {
                const node = tree.get_node(String(nodeId));
                if (!node) return;
                visibleNodeIds.add(String(node.id));
                let parentId = node.parent;
                while (parentId && parentId !== '#') {
                    visibleNodeIds.add(String(parentId));
                    const parentNode = tree.get_node(parentId);
                    if (!parentNode) break;
                    parentId = parentNode.parent;
                }
            });

            nodeEls.forEach(function(el) {
                const id = String(el.id || '');
                if (!id) return;
                el.classList.toggle('file-list-search-hidden', !visibleNodeIds.has(id));
            });

            visibleNodeIds.forEach(function(id) {
                const node = tree.get_node(id);
                if (node && node.data && node.data.type === 'folder') {
                    tree.open_node(id);
                }
            });
        } finally {
            fileListSearchState.applyingVisibility = false;
        }
    }

    async function runFileListSearchNow() {
        const query = String(fileListSearchState.query || '').trim();
        if (!query) {
            clearFileListSearchFilter();
            return;
        }

        const gateway = global.wasmTextEngineGateway;
        if (!gateway || typeof gateway.ensureReady !== 'function') {
            setFileListSearchResult(isEn() ? 'WASM search is unavailable' : 'WASM 搜索不可用', true);
            return;
        }

        const token = ++fileListSearchState.token;
        setFileListSearchResult(isEn() ? 'Searching...' : '搜索中...', false);

        const readyRes = await gateway.ensureReady();
        if (token !== fileListSearchState.token) return;

        if (!readyRes || readyRes.code !== 200) {
            setFileListSearchResult((readyRes && readyRes.message) || (isEn() ? 'Search failed' : '搜索失败'), true);
            return;
        }

        const titleMatchInfo = collectTitleNodeMatches(gateway, query);
        const matchedNodeIds = new Set(titleMatchInfo.matchedNodeIds || []);
        let totalMatches = Number(titleMatchInfo.totalMatches || 0);

        if (fileListSearchState.scope === 'fullText') {
            const fullTextRes = gateway.searchFilesDetailed(query, { caseSensitive: false });
            if (token !== fileListSearchState.token) return;

            if (!fullTextRes || fullTextRes.code !== 200 || !fullTextRes.data) {
                setFileListSearchResult((fullTextRes && fullTextRes.message) || (isEn() ? 'Search failed' : '搜索失败'), true);
                return;
            }

            const rows = Array.isArray(fullTextRes.data.files) ? fullTextRes.data.files : [];
            rows.forEach(function(row) {
                const docId = String((row && row.docId) || '');
                if (!docId) return;
                matchedNodeIds.add(docId);
                totalMatches += Number((row && row.matchCount) || 0);
            });
        }

        fileListSearchState.matchedNodeIds = matchedNodeIds;
        fileListSearchState.totalMatches = totalMatches;
        reapplyFileListSearchVisibility();

        if (!matchedNodeIds.size) {
            setFileListSearchResult(isEn() ? 'No matching nodes' : '未匹配到文件或文件夹', false);
            return;
        }

        if (fileListSearchState.scope === 'fullText') {
            setFileListSearchResult(
                (isEn() ? 'Matched nodes: ' : '匹配节点：') + matchedNodeIds.size + '，' +
                (isEn() ? 'total title/content hits: ' : '标题/全文总命中：') + totalMatches,
                false
            );
        } else {
            setFileListSearchResult(
                (isEn() ? 'Matched titles (files and folders): ' : '标题匹配（文件+文件夹）：') + matchedNodeIds.size,
                false
            );
        }
    }

    function scheduleFileListSearch() {
        if (fileListSearchState.timer) clearTimeout(fileListSearchState.timer);
        fileListSearchState.timer = setTimeout(function() {
            fileListSearchState.timer = null;
            runFileListSearchNow().catch(function(error) {
                console.error('file list search failed:', error);
                setFileListSearchResult(isEn() ? 'Search failed' : '搜索失败', true);
            });
        }, FILE_LIST_SEARCH_DEBOUNCE);
    }

    function bindFileListSearchIfNeeded() {
        const toggleBtn = document.getElementById('fileListSearchBtn');
        const panel = document.getElementById('fileListSearchPanel');
        const input = document.getElementById('fileListSearchInput');
        const scopeSelect = document.getElementById('fileListSearchScope');
        if (!toggleBtn || !panel || !input || !scopeSelect || toggleBtn.dataset.bound === '1') return;

        toggleBtn.dataset.bound = '1';
        scopeSelect.value = 'title';
        fileListSearchState.scope = 'title';

        const closeSearchPanel = function() {
            panel.style.display = 'none';
            toggleBtn.classList.remove('active');
            input.value = '';
            clearFileListSearchFilter();
        };

        toggleBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            const isOpen = panel.style.display !== 'none';
            if (isOpen) {
                closeSearchPanel();
                return;
            }

            panel.style.display = '';
            toggleBtn.classList.add('active');
            setFileListSearchResult(isEn() ? 'Title search by default' : '默认仅搜索标题', false);
            setTimeout(function() { input.focus(); }, 0);
        });

        input.addEventListener('input', function() {
            fileListSearchState.query = String(input.value || '');
            scheduleFileListSearch();
        });

        input.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                runFileListSearchNow().catch(function(error) {
                    console.error('file list search failed:', error);
                    setFileListSearchResult(isEn() ? 'Search failed' : '搜索失败', true);
                });
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                closeSearchPanel();
            }
        });

        scopeSelect.addEventListener('change', function() {
            fileListSearchState.scope = String(scopeSelect.value || 'title');
            if (!String(fileListSearchState.query || '').trim()) {
                setFileListSearchResult(
                    fileListSearchState.scope === 'fullText'
                        ? (isEn() ? 'Full-text search mode' : '全文搜索模式')
                        : (isEn() ? 'Title-only search mode' : '仅标题搜索模式'),
                    false
                );
                return;
            }
            scheduleFileListSearch();
        });
    }

    function getFileListPreview(content) {
        const text = String(content || '')
            .replace(/```[\s\S]*?```/g, ' ')
            .replace(/`[^`]*`/g, ' ')
            .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
            .replace(/\[[^\]]*\]\([^)]*\)/g, ' ')
            .replace(/[>#*_~|\-]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        if (!text) return isEn() ? 'No content' : '暂无内容';
        return text.length > 26 ? (text.slice(0, 26) + '...') : text;
    }

    function formatFileListModifiedTime(ts) {
        const value = Number(ts || Date.now());
        if (!Number.isFinite(value)) return '';
        try {
            return new Date(value).toLocaleString();
        } catch (error) {
            return '';
        }
    }

    function renderFileNodeInlineMeta(anchorEl, nodeId) {
        if (!anchorEl || !nodeId || !window.$) return;

        const $anchor = window.$(anchorEl);
        const tree = window.$('#fileList').jstree(true);
        if (!tree) return;

        const node = tree.get_node(nodeId);
        if (!node || !node.data || node.data.type !== 'file') {
            return;
        }

        const file = (g('files') || []).find(function(item) {
            return String(item.id) === String(nodeId) && item.type === 'file';
        });
        if (!file) return;

        let $meta = $anchor.find('.file-list-inline-meta');
        if (!$meta.length) {
            $meta = window.$(
                '<span class="file-list-inline-meta">' +
                    '<span class="file-list-inline-preview"></span>' +
                    '<span class="file-list-inline-time"></span>' +
                '</span>'
            );
            $anchor.append($meta);
        }

        $meta.find('.file-list-inline-preview').text(getFileListPreview(file.content));
        $meta.find('.file-list-inline-time').text(formatFileListModifiedTime(file.lastModified));
    }

    function resolveNodeIdFromAnchorId(anchorId) {
        const raw = String(anchorId || '').trim();
        if (!raw) return '';

        if (raw.startsWith('jstree_anchor_')) {
            return raw.slice('jstree_anchor_'.length);
        }

        if (raw.endsWith('_anchor')) {
            return raw.slice(0, -('_anchor'.length));
        }

        return raw;
    }

    function loadLocalFiles() {
        if (deferFileTreeWorkUntilWasmReady(loadLocalFiles, 'loadLocalFiles')) return;
        const localFiles = JSON.parse(localStorage.getItem('vditor_files') || '[]');
        localFiles.forEach(f => {
            if (!f.type) f.type = 'file';
            if (typeof f.isSynced !== 'boolean') f.isSynced = false;
            normalizeExternalLocalFileRecord(f);
        });
        syncCurrentEditorSnapshotIntoFiles(localFiles);
        if (localFiles.length === 0) {
            global.files = [];
            if (shouldAutoOpenInitialFile()) {
                createDefaultFile();
            } else {
                loadFiles();
            }
        } else {
            global.files = localFiles;
            loadFiles();
            if (g('files').length > 0 && shouldAutoOpenInitialFile()) openFirstFile();
        }
    }

    // 打开第一个文件（忽略文件夹和系统文件）
    function openFirstFile() {
        const currentFileId = g('currentFileId');
        if (currentFileId) {
            const activeFile = g('files').find(f => f.id === currentFileId && f.type === 'file' && f.name !== '.easypocketmd_orders');
            if (activeFile) return;
        }

        const defaultOpening = g('userSettings') && g('userSettings').defaultFileOpening || 'lastEdited';

        if (defaultOpening === 'fileList') {
            return;
        }
        
        if (defaultOpening === 'firstFile') {
            // 直接打开第一个非系统文件
            const firstFile = g('files').find(f => f.type === 'file' && f.name !== '.easypocketmd_orders');
            if (firstFile) openFile(firstFile.id);
        } else {
            // lastEdited: 优先打开上次打开的文件
            const lastOpenedFileId = localStorage.getItem('vditor_last_opened_file');
            if (lastOpenedFileId) {
                const lastFile = g('files').find(f => f.id === lastOpenedFileId && f.type === 'file' && f.name !== '.easypocketmd_orders');
                if (lastFile) {
                    openFile(lastOpenedFileId);
                    return;
                }
            }
            
            // 如果没有上次打开的文件或文件不存在，则打开第一个非系统文件
            const firstFile = g('files').find(f => f.type === 'file' && f.name !== '.easypocketmd_orders');
            if (firstFile) openFile(firstFile.id);
        }
    }

    function loadOrders() {
        const files = g('files');
        const orderFile = files.find(f => f.name === '.easypocketmd_orders');
        global.fileOrders = {};
        if (orderFile && orderFile.content) {
            try {
                global.fileOrders = JSON.parse(orderFile.content);
                files.forEach(f => {
                    if (global.fileOrders[f.name] !== undefined) {
                        f.order = global.fileOrders[f.name];
                    }
                });
            } catch (e) {
                console.error('Failed to parse orders file', e);
            }
        }
    }

    function saveOrdersFromPaths(pathOrders) {
        const files = g('files');
        let orderFile = files.find(f => f.name === '.easypocketmd_orders');
        if (!orderFile) {
            orderFile = {
                id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                name: '.easypocketmd_orders',
                type: 'file',
                content: '{}',
                lastModified: Date.now(),
                isSynced: false
            };
            files.push(orderFile);
        }
        
        if (!global.fileOrders) global.fileOrders = {};
        Object.assign(global.fileOrders, pathOrders);
        
        orderFile.content = JSON.stringify(global.fileOrders);
        orderFile.lastModified = Date.now();
        orderFile.isSynced = false;
        
        localStorage.setItem('vditor_files', JSON.stringify(files));
        
        if (g('currentUser')) {
            global.syncFileToServer(orderFile.id);
        }
    }

    function moveNodeOrder(nodeId, direction) {
        const tree = window.$.jstree.reference('#fileList');
        if (!tree) return;
        const node = tree.get_node(nodeId);
        if (!node) return;
        
        const parentId = node.parent;
        const parentNode = tree.get_node(parentId);
        const siblings = parentNode.children;
        const index = siblings.indexOf(nodeId);
        
        let targetIndex = -1;
        if (direction === 'up' && index > 0) {
            targetIndex = index - 1;
        } else if (direction === 'down' && index < siblings.length - 1) {
            targetIndex = index + 1;
        }
        
        if (targetIndex !== -1) {
            const pathOrders = {};
            // Assign base orders to spread them out
            siblings.forEach((id, i) => {
                const child = tree.get_node(id);
                child.data.order = i * 10;
            });
            
            // Swap
            const targetId = siblings[targetIndex];
            const targetNode = tree.get_node(targetId);
            
            const temp = node.data.order;
            node.data.order = targetNode.data.order;
            targetNode.data.order = temp;
            
            // Collect path orders
            siblings.forEach(id => {
                const child = tree.get_node(id);
                pathOrders[child.data.path] = child.data.order;
                const file = g('files').find(f => f.name === child.data.path);
                if (file) file.order = child.data.order;
            });
            
            saveOrdersFromPaths(pathOrders);
            loadFiles();
        }
    }

    function saveOrders() {
        const files = g('files');
        let orderFile = files.find(f => f.name === '.easypocketmd_orders');
        if (!orderFile) {
            orderFile = {
                id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                name: '.easypocketmd_orders',
                type: 'file',
                content: '{}',
                lastModified: Date.now(),
                isSynced: false
            };
            files.push(orderFile);
        }
        
        const orders = {};
        if (global.fileOrders) {
            Object.assign(orders, global.fileOrders);
        }
        
        files.forEach(f => {
            if (f.name !== '.easypocketmd_orders') {
                orders[f.name] = f.order || 0;
            }
        });
        
        orderFile.content = JSON.stringify(orders);
        orderFile.lastModified = Date.now();
        orderFile.isSynced = false;
        
        localStorage.setItem('vditor_files', JSON.stringify(files));
        
        if (g('currentUser')) {
            global.syncFileToServer(orderFile.id);
        }
    }

    // ---------- jstree 渲染及交互 ----------

    function getJsTreeData() {
        const files = g('files');
        const nodes = [];
        const pathMap = {}; // path -> id
        const existingPaths = new Set();
        
        // 1. 映射所有真实文件/文件夹的ID
        files.forEach(f => {
            pathMap[f.name] = f.id;
            existingPaths.add(f.name);
        });
        
        // 2. 收集所有需要创建节点的路径（包括中间路径）
        const allPaths = new Set();
        files.forEach(f => {
            if (f.name === '.easypocketmd_orders') return; // 过滤掉系统文件
            allPaths.add(f.name);
            let p = f.name;
            while(p.includes('/')) {
                p = getParentPath(p);
                if (p) allPaths.add(p);
            }
        });
        
        // 3. 为虚拟文件夹生成临时ID
        allPaths.forEach(p => {
            if (!pathMap[p]) {
                // 使用路径哈希生成相对稳定的ID
                let hash = 0;
                for (let i = 0; i < p.length; i++) {
                    hash = ((hash << 5) - hash) + p.charCodeAt(i);
                    hash |= 0; 
                }
                pathMap[p] = 'v_folder_' + Math.abs(hash);
            }
        });
        
        // 4. 生成节点数据
        allPaths.forEach(p => {
            const isReal = files.find(f => f.name === p);
            const parentPath = getParentPath(p);
            let parentId = parentPath ? pathMap[parentPath] : '#';
            if (parentPath && !parentId) {
                console.warn('Parent not found for path:', p, 'Parent path:', parentPath);
                parentId = '#'; // Fallback to root to make it visible
            }
            const text = getBasename(p);
            
            if (isReal) {
                nodes.push({
                    id: isReal.id,
                    parent: parentId,
                    text: text,
                    type: isReal.type,
                    state: { 
                        opened: false, // 由 state 插件管理
                        selected: isReal.id === g('currentFileId')
                    },
                    data: { path: p, type: isReal.type, isVirtual: false, order: isReal.order || 0 }
                });
            } else {
                nodes.push({
                    id: pathMap[p],
                    parent: parentId,
                    text: text,
                    type: 'folder',
                    state: { opened: false },
                    data: { path: p, type: 'folder', isVirtual: true, order: (global.fileOrders && global.fileOrders[p] !== undefined) ? global.fileOrders[p] : 0 }
                });
            }
        });

        // 按照 order 排序，同级元素比较
        const defaultSorting = g('userSettings') && g('userSettings').defaultSorting || 'modifiedTime';
        nodes.sort((a, b) => {
            const orderA = a.data.order;
            const orderB = b.data.order;
            if (orderA !== orderB) return orderA - orderB;
            
            // 如果 order 相同，根据默认排序方式排序
            if (defaultSorting === 'modifiedTime') {
                // 按修改时间排序（最新的在前）
                const fileA = g('files').find(f => f.name === a.data.path);
                const fileB = g('files').find(f => f.name === b.data.path);
                const timeA = fileA ? fileA.lastModified : 0;
                const timeB = fileB ? fileB.lastModified : 0;
                if (timeA !== timeB) return timeB - timeA; // 最新的在前
            } else if (defaultSorting === 'fileSize') {
                // 按文件大小排序（大的在前）
                const fileA = g('files').find(f => f.name === a.data.path);
                const fileB = g('files').find(f => f.name === b.data.path);
                const sizeA = fileA && fileA.type === 'file' ? (fileA.content ? fileA.content.length : 0) : 0;
                const sizeB = fileB && fileB.type === 'file' ? (fileB.content ? fileB.content.length : 0) : 0;
                if (sizeA !== sizeB) return sizeB - sizeA; // 大的在前
            }
            // alphabetical 或其他情况：按名称排序

            return a.text.localeCompare(b.text);
        });
        
        return nodes;
    }

    function initFileTree() {
        if (!window.$ || !window.$.fn.jstree) {
            console.error('jQuery or jstree not loaded', window.$, window.$.fn.jstree);
            return;
        }

        // 确保 jstree 插件已注册
        if (!window.$.jstree) {
            console.warn('jstree object missing, attempting to re-init');
            // 这里可能无法直接重新加载，只能依赖全局加载顺序
        }

        const treeData = getJsTreeData();

        if (treeData.length === 0) {
            console.warn('File tree data is empty');
            document.getElementById('fileList').innerHTML = '<div style="padding:10px;color:#999;text-align:center;">' + (isEn() ? 'No files' : '暂无文件') + '</div>';
            return;
        }

        if (window.$.jstree.reference('#fileList')) {
            window.$.jstree.reference('#fileList').destroy();
        }

        let lastToggleTime = 0;
        function safeToggleNode(inst, node) {
            const now = Date.now();
            if (now - lastToggleTime < 300) return; // 300ms 内防止重复触发
            lastToggleTime = now;
            inst.toggle_node(node);
        }

        const tree = window.$('#fileList').jstree({
            'core': {
                'check_callback': true, // 允许所有操作
                'data': treeData,
                'dblclick_toggle': false, // 禁用默认的双击切换，由我们统一处理单击切换
                'themes': {
                    'name': 'default',
                    'responsive': true,
                    'dots': false,
                    'lines': false,
                    'icons': true
                }
            },
            'types': {
                'default': { 'icon': 'fas fa-folder' },
                'file': { 'icon': 'fas fa-file' },
                'folder': { 'icon': 'fas fa-folder' } },
            'plugins': ['types', 'contextmenu'],
            'contextmenu': {
                'select_node': false,
                'show_at_node': false,
                'shortcut_all': false,
                'items': function(node) {
                    const items = {
                        'rename': {
                            'label': isEn() ? 'Rename' : '重命名',
                            'action': function(data) {
                                const inst = window.$.jstree.reference(data.reference);
                                const obj = inst.get_node(data.reference);
                                
                                // 对于文件夹，如果是虚拟文件夹，则不允许重命名
                                if (obj.data.isVirtual) {
                                    g('customAlert')(isEn() ? 'Virtual folder cannot be renamed, please create as real folder first' : '虚拟文件夹不可重命名，请先创建为实体文件夹');
                                    return;
                                }

                                if (typeof renameFile === 'function') {
                                    renameFile(obj.id);
                                } else if (typeof global.renameFile === 'function') {
                                    global.renameFile(obj.id);
                                } else {
                                    console.error('renameFile function not found');
                                    g('customAlert')(isEn() ? 'Rename function not available' : '重命名功能不可用');
                                }
                            }
                        },
                        'move_up': {
                            'label': isEn() ? 'Move Up' : '上移',
                            'action': function(data) {
                                const inst = window.$.jstree.reference(data.reference);
                                const obj = inst.get_node(data.reference);
                                moveNodeOrder(obj.id, 'up');
                            }
                        },
                        'move_down': {
                            'label': isEn() ? 'Move Down' : '下移',
                            'action': function(data) {
                                const inst = window.$.jstree.reference(data.reference);
                                const obj = inst.get_node(data.reference);
                                moveNodeOrder(obj.id, 'down');
                            }
                        },
                        'move': {
                            'label': isEn() ? 'Move' : '移动',
                            'action': function(data) {
                                const inst = window.$.jstree.reference(data.reference);
                                const obj = inst.get_node(data.reference);
                                
                                // 对于文件夹，如果是虚拟文件夹，则不允许移动
                                if (obj.data.isVirtual) {
                                    g('customAlert')(isEn() ? 'Virtual folder cannot be moved, please create as real folder first' : '虚拟文件夹不可移动，请先创建为实体文件夹');
                                    return;
                                }
                                
                                global.moveFile(obj.id);
                            }
                        },
                        'history': {
                             'label': isEn() ? 'History Versions' : '历史版本',
                             'action': function(data) {
                                 const inst = window.$.jstree.reference(data.reference);
                                 const obj = inst.get_node(data.reference);
                                 if (obj.data.type === 'file') {
                                     global.showHistoryModal(obj.id, obj.data.path);
                                 }
                             }
                        },
                        'delete': {
                            'label': isEn() ? 'Delete' : '删除',
                            'action': function(data) {
                                const inst = window.$.jstree.reference(data.reference);
                                const obj = inst.get_node(data.reference);
                                if (obj.data.isVirtual) {
                                    g('customAlert')(isEn() ? 'Cannot delete virtual folder directly, please delete its contents' : '不能直接删除虚拟文件夹，请删除其子内容');
                                    return;
                                }
                                global.deleteFile(obj.id);
                            }
                        },
                        'new_file': {
                            'label': isEn() ? 'New File' : '新建文件',
                            'separator_before': true,
                            'action': function(data) {
                                const inst = window.$.jstree.reference(data.reference);
                                const obj = inst.get_node(data.reference);
                                const path = obj.data.path;
                                const baseName = isEn() ? 'New File' : '新文档';
                                const defaultName = getNextAvailableName(baseName, path);
                                g('customPrompt')(isEn() ? 'Please enter filename' : '请输入文件名', { defaultValue: defaultName }).then(function(name) {
                                    if (name) {
                                        const newPath = path + '/' + name;
                                        createFileAtPath(newPath);
                                    }
                                });
                            }
                        },
                        'new_folder': {
                            'label': isEn() ? 'New Folder' : '新建文件夹',
                            'action': function(data) {
                                const inst = window.$.jstree.reference(data.reference);
                                const obj = inst.get_node(data.reference);
                                const path = obj.data.path;
                                const baseName = isEn() ? 'New Folder' : '新文件夹';
                                const defaultName = getNextAvailableName(baseName, path);
                                g('customPrompt')(isEn() ? 'Please enter folder name' : '请输入文件夹名', { defaultValue: defaultName }).then(function(name) {
                                    if (name) {
                                        const newPath = path + '/' + name;
                                        createFolderAtPath(newPath);
                                    }
                                });
                            }
                        }
                    };
                    
                    if (node.type === 'file') {
                        delete items.new_file;
                        delete items.new_folder;
                    } else {
                        delete items.history;
                    }
                    
                    return items;
                }
            }
        })
        .on('select_node.jstree', function (e, data) {
            if (data.node.type === 'file') {
                if (g('currentFileId') !== data.node.id) {
                    if (g('currentFileId')) global.saveCurrentFile(true);
                    openFile(data.node.id);
                }
            } else if (data.node.type === 'folder') {
                safeToggleNode(data.instance, data.node);
                // 点击文件夹后，保持当前打开文件的选中状态
                const currentFileId = g('currentFileId');
                if (currentFileId && data.instance.get_node(currentFileId)) {
                    data.instance.deselect_node(data.node);
                    data.instance.select_node(currentFileId);
                }
            }
        })
        .on('click.jstree', function (e) {
            const inst = window.$.jstree.reference(e.target);
            const node = inst.get_node(e.target);
            if (node && node.type === 'folder') {
                const target = window.$(e.target);
                // 排除右侧菜单按钮和箭头（箭头 jstree 会默认处理，且不需要我们在这里 toggle）
                if ((target.hasClass('jstree-anchor') || target.closest('.jstree-anchor').length) && 
                    !target.hasClass('file-menu-btn') && 
                    !target.hasClass('jstree-ocl')) {
                    // 如果节点已经是选中状态，select_node 不会再次触发，所以我们需要在这里手动 toggle
                    if (inst.is_selected(node)) {
                        safeToggleNode(inst, node);
                    }
                }
            }
        })
        .on('rename_node.jstree', function (e, data) {
             if (data.text === data.old) return;
             if (data.node.data.isVirtual) {
                 g('customAlert')(isEn() ? 'Cannot rename virtual folder, please create as real folder first' : '无法重命名虚拟文件夹，请先创建实文件夹');
                 data.instance.refresh(); 
                 return;
             }
             renameFileInternal(data.node.id, data.text);
        })
        .on('loaded.jstree refresh.jstree open_node.jstree', function() {
            window.$('#fileList .jstree-anchor').each(function() {
                const anchorId = window.$(this).attr('id');
                const nodeId = resolveNodeIdFromAnchorId(anchorId);
                renderFileNodeInlineMeta(this, nodeId);

                if (!window.$(this).find('.file-menu-btn').length) {
                    const menuBtn = window.$('<i class="fas fa-ellipsis-v file-menu-btn"></i>');
                    menuBtn.click(function(e) {
                        e.stopPropagation();
                        e.preventDefault();
                        const node = window.$('#fileList').jstree(true).get_node(nodeId);
                        if (node) {
                            const rect = e.target.getBoundingClientRect();
                            let x = rect.left;
                            const y = rect.bottom;
                            
                            // 确保菜单不会超出屏幕右侧
                            const menuWidth = 200; // 估算的菜单宽度
                            if (x + menuWidth > window.innerWidth) {
                                x = window.innerWidth - menuWidth - 10;
                            }
                            
                            // 先移除已存在的菜单
                            window.$('.vakata-context').remove();
                            
                            // 显示上下文菜单
                            window.$('#fileList').jstree(true).show_contextmenu(node, x, y);
                            
                            // 阻止菜单点击事件冒泡，防止文件列表被关闭
                            setTimeout(function() {
                                const $context = window.$('.vakata-context');
                                if ($context.length) {
                                    $context.on('click', function(e) {
                                        e.stopPropagation();
                                        e.stopImmediatePropagation();
                                    });
                                }
                            }, 10);
                            
                            // 多次尝试设置位置，确保正确
                            const setPosition = function() {
                                const $context = window.$('.vakata-context');
                                if ($context.length) {
                                    // 再次检查和调整位置
                                    let finalX = x;
                                    const finalMenuWidth = $context.outerWidth() || 200;
                                    if (finalX + finalMenuWidth > window.innerWidth) {
                                        finalX = window.innerWidth - finalMenuWidth - 10;
                                    }
                                    
                                    $context.css({
                                        left: finalX,
                                        top: y,
                                        position: 'fixed',
                                        'z-index': 99999
                                    });
                                }
                            };
                            setPosition();
                            setTimeout(setPosition, 5);
                            setTimeout(setPosition, 50);
                        }
                    });
                    window.$(this).append(menuBtn);
                }
            });

            reapplyFileListSearchVisibility();
        })
        .on('ready.jstree', function() {
            expandActiveFile();
            // 禁用长按和右键菜单，统一使用右侧三个点
            window.$('#fileList').on('contextmenu', function(e) {
                e.preventDefault();
                e.stopImmediatePropagation();
                return false;
            });
        });
    }

    function createFileAtPath(path) {
        path = normalizePath(path);
        ensureParentFolders(path);
        
        const files = g('files');
        if (files.some(f => f.name === path && f.type === 'file')) {
            g('customAlert')(isEn() ? 'File with the same name already exists' : '已存在同名文件');
            return;
        }

        const newFile = {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
            name: path,
            type: 'file',
            content: '# ' + getBasename(path) + '\n\n',
            lastModified: Date.now(),
            isSynced: false
        };
        files.push(newFile);
        localStorage.setItem('vditor_files', JSON.stringify(files));
        openFile(newFile.id);
        loadFiles();
        g('lastSyncedContent')[newFile.id] = newFile.content;
        g('unsavedChanges')[newFile.id] = false;
        if (g('currentUser')) global.syncFileToServer(newFile.id);
    }
    
    function createFolderAtPath(path) {
        path = normalizePath(path);
        ensureParentFolders(path);
        const files = g('files');
        if (files.some(f => f.name === path)) {
            g('customAlert')(isEn() ? 'This path already exists' : '该路径已存在');
            return;
        }
        const newFolder = {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
            name: path,
            type: 'folder',
            content: '',
            lastModified: Date.now(),
            isSynced: false
        };
        files.push(newFolder);
        localStorage.setItem('vditor_files', JSON.stringify(files));
        loadFiles();
        if (g('currentUser')) global.syncFileToServer(newFolder.id);
    }

    function renameFileInternal(id, newBasename) {
        const files = g('files');
        const item = files.find(f => f.id === id);
        if (!item) return;

        const isFolder = item.type === 'folder';
        const oldName = item.name;
        const parentPath = getParentPath(oldName);
        
        if (isNameExistsInParent(newBasename.trim(), parentPath, id)) {
            g('customAlert')(isEn() ? 'A file or folder with the same name already exists in this directory' : '该目录下已存在同名文件或文件夹');
            loadFiles(); 
            return;
        }

        const newName = parentPath ? parentPath + '/' + newBasename.trim() : newBasename.trim();

        if (isFolder) {
            renameFolderAndChildren(oldName, newName);
        } else {
            item.name = newName;
        }

        item.lastModified = Date.now();
        item.isSynced = false;
        localStorage.setItem('vditor_files', JSON.stringify(files));
        loadFiles();
        
        if (g('currentUser')) {
            if (isFolder) {
                global.deleteFileFromServer(oldName + '/').catch(e => {});
                global.syncFileToServer(id);
                const affectedFiles = files.filter(f => f.type === 'file' && (f.name.startsWith(newName + '/') || f.name === newName));
                affectedFiles.forEach(f => {
                    global.deleteFileFromServer(oldName + f.name.substring(newName.length)).catch(e=>{});
                    global.syncFileToServer(f.id);
                });
            } else {
                global.deleteFileFromServer(oldName).then(() => global.syncFileToServer(id));
            }
        }
    }

    function moveFileTo(id, targetPath) {
        const files = g('files');
        const item = files.find(f => f.id === id);
        if (!item) return;

        const oldName = item.name;
        const newBasename = getBasename(oldName);
        const newName = targetPath ? targetPath + '/' + newBasename : newBasename;

        if (newName === oldName) return;

        if (item.type === 'folder') {
            if (newName === oldName || newName.startsWith(oldName + '/')) {
                g('customAlert')(isEn() ? 'Cannot move folder to itself or its subdirectory' : '不能将文件夹移动到自身或其子目录中');
                loadFiles(); 
                return;
            }
        }

        if (files.some(f => f.name === newName && f.id !== id)) {
            g('customAlert')(isEn() ? 'An item with the same name already exists at the target location' : '目��位置已存在同名项');
            loadFiles(); 
            return;
        }

        if (item.type === 'folder') {
            renameFolderAndChildren(oldName, newName);
        } else {
            item.name = newName;
        }
        
        item.lastModified = Date.now();
        item.isSynced = false;

        localStorage.setItem('vditor_files', JSON.stringify(files));
        loadFiles();
        global.showMessage(isEn() ? `${item.type === 'folder' ? 'Folder' : 'File'} moved` : `${item.type === 'folder' ? '文件夹' : '文件'}已移动`);
        
        if (g('currentUser')) {
             if (item.type === 'folder') {
                global.deleteFileFromServer(oldName + '/').catch(e => {});
                global.syncFileToServer(id);
                const affectedFiles = files.filter(f => f.type === 'file' &&
                    (f.name.startsWith(newName + '/') || f.name === newName));
                affectedFiles.forEach(f => {
                    global.deleteFileFromServer(oldName +
                        f.name.substring(newName.length)).catch(e=>{});
                    global.syncFileToServer(f.id);
                });
            } else {
                global.deleteFileFromServer(oldName).then(() =>
                    global.syncFileToServer(item.id));
            }
        }
    }

    function expandActiveFile() {
        const currentFileId = g('currentFileId');
        if (!currentFileId) return;
        
        // 检查 jQuery 和 jstree 是否已加载
        if (!window.$ || !window.$.jstree) return;

        const tree = window.$.jstree.reference('#fileList');
        if (tree) {
            const node = tree.get_node(currentFileId);
            if (node) {
                // Ensure selection
                if (!tree.is_selected(node)) {
                    tree.deselect_all(true);
                    tree.select_node(node);
                }
                // Ensure visible (expand parents)
                if (node.parents) {
                    node.parents.forEach(function(p) {
                        tree.open_node(p);
                    });
                }
            }
        }
    }

    function loadFiles() {
        if (deferFileTreeWorkUntilWasmReady(loadFiles, 'loadFiles')) return;
        const fileListSidebar = document.getElementById('fileListSidebar');
        const wasVisible = fileListSidebar && fileListSidebar.classList.contains('show');
        loadOrders();
        initFileTree();
        bindFileManagementFabIfNeeded();
        bindFileListSearchIfNeeded();
        notifyInitialFileListRendered();
        if (wasVisible && fileListSidebar) {
            fileListSidebar.classList.add('show');
        }

        if (isKnowledgeGraphPanelVisible()) {
            setTimeout(function() {
                refreshKnowledgeGraph();
            }, 0);
        }
    }

    // ---------- 知识图谱功能（WASM-only） ----------
    var knowledgeGraphChart = null;
    var knowledgeGraphBuildToken = 0;
    var knowledgeGraphPanelBound = false;
    var knowledgeGraphRawData = null;
    var knowledgeGraphSearchTimer = null;
    var knowledgeGraphView = {
        groupBy: 'folder',
        relationFilter: 'all',
        searchQuery: ''
    };

    function kgText(key, fallback) {
        if (window.i18n && typeof window.i18n.tOr === 'function') {
            return window.i18n.tOr(key, fallback || key);
        }
        if (window.i18n && typeof window.i18n.has === 'function' && window.i18n.has(key) && typeof window.i18n.t === 'function') {
            return window.i18n.t(key);
        }
        return fallback || key;
    }

    function isHiddenCrossSearchFile(filename) {
        return global.wasmTextEngineGateway.isHiddenCrossSearchFile(filename || '');
    }

    function getKnowledgeGraphGateway() {
        return global.wasmTextEngineGateway;
    }

    function isKnowledgeGraphPanelVisible() {
        const panel = document.getElementById('knowledgeGraphPanel');
        return !!(panel && panel.style.display !== 'none');
    }

    function disposeKnowledgeGraphChart() {
        if (knowledgeGraphChart && typeof knowledgeGraphChart.dispose === 'function') {
            knowledgeGraphChart.dispose();
        }
        knowledgeGraphChart = null;
    }

    function setKnowledgeGraphStatus(message, isError) {
        const statusEl = document.getElementById('knowledgeGraphStatus');
        if (!statusEl) return;
        statusEl.textContent = message || '';
        statusEl.style.color = isError ? '#dc3545' : '';
    }

    function getKnowledgeGraphFileContent(file) {
        if (!file) return '';
        if (String(file.id) === String(g('currentFileId'))) {
            try {
                return getCurrentEditorContent(file.id, file.content) || '';
            } catch (error) {
                console.warn('读取当前编辑器内容失败:', error);
            }
        }
        return file.content || '';
    }

    function getKnowledgeGraphNodeName(file) {
        const name = String(file && file.name ? file.name : '').trim();
        return name || 'Untitled';
    }

    function getKnowledgeGraphSummaryText(file) {
        return (getKnowledgeGraphNodeName(file) + ' ' + String(getKnowledgeGraphFileContent(file) || ''))
            .replace(/\s+/g, ' ')
            .slice(0, 1200);
    }

    function getKnowledgeGraphFolder(file) {
        const name = getKnowledgeGraphNodeName(file);
        const idx = name.lastIndexOf('/');
        return idx > 0 ? name.slice(0, idx) : '/';
    }

    async function hasWasmMatch(gateway, text, query) {
        if (!query) return false;
        const res = gateway.findInText(String(text || ''), String(query || ''), { caseSensitive: false });
        return !!(res && res.code === 200 && res.data && Number(res.data.count || 0) > 0);
    }

    async function collectWasmTags(gateway, text) {
        const res = gateway.extractTags(String(text || ''));
        if (!res || res.code !== 200 || !res.data || !Array.isArray(res.data.tags)) {
            return [];
        }
        return res.data.tags.map(function(tag) { return String(tag || '').trim(); }).filter(Boolean);
    }

    function getFileAliases(file) {
        const aliases = new Set();
        const fullName = getKnowledgeGraphNodeName(file).toLowerCase();
        const fileName = fullName.split('/').pop() || fullName;
        aliases.add(fullName);
        aliases.add(fileName);
        aliases.add(fileName.replace(/\.[^.]+$/, ''));
        return Array.from(aliases).filter(function(alias) { return alias && alias.length >= 3; });
    }

    async function buildKnowledgeGraphData() {
        const gateway = getKnowledgeGraphGateway();
        if (!gateway) {
            throw new Error(kgText('knowledgeGraphWasmRequired', '知识图谱需要 WASM 引擎，请先构建并启用 WASM'));
        }

        const readyRes = await gateway.ensureReady();
        if (!readyRes || readyRes.code !== 200) {
            throw new Error(kgText('knowledgeGraphWasmRequired', '知识图谱需要 WASM 引擎，请先构建并启用 WASM'));
        }

        const files = (g('files') || [])
            .filter(function(file) {
                return file && file.type === 'file' && !isHiddenCrossSearchFile(file.name);
            })
            .slice()
            .sort(function(a, b) {
                return (b.lastModified || 0) - (a.lastModified || 0);
            })
            .slice(0, 60);

        const nodes = [];
        const fileMeta = [];

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const content = String(getKnowledgeGraphFileContent(file) || '');
            const tags = await collectWasmTags(gateway, content);
            const node = {
                id: String(file.id),
                fileId: String(file.id),
                name: getKnowledgeGraphNodeName(file),
                filename: file.name || '',
                folder: getKnowledgeGraphFolder(file),
                tags: tags,
                contentLength: content.length,
                symbolSize: Math.max(14, Math.min(40, 12 + Math.log(Math.max(1, content.length)) * 2.1))
            };
            nodes.push(node);
            fileMeta.push({
                file: file,
                content: content,
                summary: getKnowledgeGraphSummaryText(file),
                aliases: getFileAliases(file),
                node: node
            });
        }

        const links = [];
        const similarityCandidates = [];

        for (let i = 0; i < fileMeta.length; i++) {
            for (let j = i + 1; j < fileMeta.length; j++) {
                const left = fileMeta[i];
                const right = fileMeta[j];

                let hasReference = false;
                for (let k = 0; k < right.aliases.length && !hasReference; k++) {
                    hasReference = await hasWasmMatch(gateway, left.content, right.aliases[k]);
                }
                for (let k = 0; k < left.aliases.length && !hasReference; k++) {
                    hasReference = await hasWasmMatch(gateway, right.content, left.aliases[k]);
                }

                if (hasReference) {
                    links.push({
                        id: 'ref:' + left.node.id + '->' + right.node.id,
                        source: left.node.id,
                        target: right.node.id,
                        relation: 'reference',
                        value: 1,
                        lineStyle: { color: '#4a90e2', width: 1.9 },
                        label: { show: true, formatter: function() { return isEn() ? 'Ref' : '引用'; } }
                    });
                    continue;
                }

                const simRes = gateway.similarity(left.summary, right.summary);
                const simScore = simRes && simRes.code === 200 && simRes.data ? Number(simRes.data.score || 0) : 0;
                if (simScore >= 0.32) {
                    similarityCandidates.push({
                        id: 'sim:' + left.node.id + '->' + right.node.id,
                        source: left.node.id,
                        target: right.node.id,
                        relation: 'similarity',
                        value: simScore,
                        score: simScore,
                        lineStyle: { color: '#9aa4b2', width: 1.2, type: 'dashed', opacity: 0.78 },
                        label: { show: true, formatter: function() { return isEn() ? 'Sim' : '相似'; } }
                    });
                }
            }
        }

        similarityCandidates.sort(function(a, b) {
            return (b.score || 0) - (a.score || 0);
        });
        similarityCandidates.slice(0, 100).forEach(function(edge) {
            links.push(edge);
        });

        nodes.forEach(function(node) {
            const degree = links.filter(function(link) {
                return link.source === node.id || link.target === node.id;
            }).length;
            node.value = Math.max(1, degree + Math.ceil((node.contentLength || 0) / 3000));
            node.itemStyle = {
                color: degree > 4 ? '#ff8a65' : (degree > 1 ? '#4a90e2' : '#9ccc65')
            };
        });

        return {
            nodes: nodes,
            links: links,
            wasmOnly: true
        };
    }

    function withGrouping(rawData) {
        const groupBy = knowledgeGraphView.groupBy || 'none';
        if (!rawData || !Array.isArray(rawData.nodes) || groupBy === 'none') {
            return {
                nodes: (rawData && rawData.nodes) ? rawData.nodes.slice() : [],
                links: (rawData && rawData.links) ? rawData.links.slice() : []
            };
        }

        const groupMap = new Map();
        const outNodes = rawData.nodes.map(function(node) {
            const copy = Object.assign({}, node);
            const key = groupBy === 'folder'
                ? (copy.folder || '/')
                : ((copy.tags && copy.tags.length > 0) ? copy.tags[0] : (isEn() ? 'untagged' : '未标记'));
            copy.groupKey = key;
            return copy;
        });
        const outLinks = rawData.links.slice();

        outNodes.forEach(function(node) {
            const groupNodeId = 'group:' + groupBy + ':' + node.groupKey;
            if (!groupMap.has(groupNodeId)) {
                const groupNode = {
                    id: groupNodeId,
                    name: node.groupKey,
                    isGroup: true,
                    symbolSize: 30,
                    value: 1,
                    itemStyle: {
                        color: groupBy === 'folder' ? '#7e57c2' : '#26a69a'
                    }
                };
                groupMap.set(groupNodeId, groupNode);
            }
            node.groupId = groupNodeId;
            outLinks.push({
                id: 'group:' + groupNodeId + '->' + node.id,
                source: groupNodeId,
                target: node.id,
                relation: 'group',
                value: 1,
                lineStyle: { color: '#c0c7d1', width: 1, opacity: 0.5 },
                label: { show: false }
            });
        });

        groupMap.forEach(function(groupNode) {
            outNodes.push(groupNode);
        });

        return {
            nodes: outNodes,
            links: outLinks
        };
    }

    async function applyWasmViewFilters(graphData) {
        if (!graphData) return { nodes: [], links: [] };

        const gateway = getKnowledgeGraphGateway();
        if (!gateway) throw new Error(kgText('knowledgeGraphWasmRequired', '知识图谱需要 WASM 引擎，请先构建并启用 WASM'));

        const grouped = withGrouping(graphData);
        const relationFilter = knowledgeGraphView.relationFilter || 'all';
        const query = String(knowledgeGraphView.searchQuery || '').trim();

        let links = grouped.links.filter(function(link) {
            if (relationFilter === 'all') return true;
            return link.relation === relationFilter;
        });

        let nodes = grouped.nodes.slice();
        if (query) {
            const matchedIds = new Set();

            for (let i = 0; i < nodes.length; i++) {
                const node = nodes[i];
                const targetText = node.isGroup ? node.name : (node.name + ' ' + (node.filename || ''));
                const hitRes = gateway.findInText(String(targetText || ''), query, { caseSensitive: false });
                if (hitRes && hitRes.code === 200 && hitRes.data && Number(hitRes.data.count || 0) > 0) {
                    matchedIds.add(node.id);
                }
            }

            nodes.forEach(function(node) {
                if (!node.isGroup && matchedIds.has(node.id) && node.groupId) {
                    matchedIds.add(node.groupId);
                }
                if (node.isGroup && matchedIds.has(node.id)) {
                    nodes.forEach(function(fileNode) {
                        if (!fileNode.isGroup && fileNode.groupId === node.id) {
                            matchedIds.add(fileNode.id);
                        }
                    });
                }
            });

            nodes = nodes.filter(function(node) {
                return matchedIds.has(node.id);
            });
            links = links.filter(function(link) {
                return matchedIds.has(link.source) && matchedIds.has(link.target);
            });
        }

        if (knowledgeGraphView.groupBy !== 'none' && relationFilter !== 'group') {
            const usedIds = new Set();
            links.forEach(function(link) {
                usedIds.add(link.source);
                usedIds.add(link.target);
            });
            nodes = nodes.filter(function(node) {
                return !node.isGroup || usedIds.has(node.id);
            });
        }

        return { nodes: nodes, links: links };
    }

    function getRelationLabel(relation) {
        if (relation === 'reference') return isEn() ? 'Reference' : '引用';
        if (relation === 'similarity') return isEn() ? 'Similarity' : '相似';
        if (relation === 'group') return isEn() ? 'Group' : '分组';
        return relation;
    }

    async function renderKnowledgeGraph() {
        const panel = document.getElementById('knowledgeGraphPanel');
        const chartEl = document.getElementById('knowledgeGraphChart');
        if (!panel || !chartEl || panel.style.display === 'none') return;

        const token = ++knowledgeGraphBuildToken;
        setKnowledgeGraphStatus(kgText('knowledgeGraphLoading', '正在分析文件关系...'), false);

        try {
            const gateway = getKnowledgeGraphGateway();
            if (!gateway) {
                throw new Error(kgText('knowledgeGraphWasmRequired', '知识图谱需要 WASM 引擎，请先构建并启用 WASM'));
            }

            if (!knowledgeGraphRawData) {
                knowledgeGraphRawData = await buildKnowledgeGraphData();
            }

            const filtered = await applyWasmViewFilters(knowledgeGraphRawData);
            if (token !== knowledgeGraphBuildToken) return;

            if (!filtered.nodes.length) {
                disposeKnowledgeGraphChart();
                chartEl.innerHTML = '';
                setKnowledgeGraphStatus(kgText('knowledgeGraphEmpty', '暂无可视化关系，请先创建或打开文件'), false);
                return;
            }

            if (!(window.EChartsLoader && typeof window.EChartsLoader.load === 'function')) {
                throw new Error(kgText('knowledgeGraphWasmRequired', '知识图谱需要 WASM 引擎，请先构建并启用 WASM'));
            }

            await new Promise(function(resolve) {
                window.EChartsLoader.load(function() { resolve(); });
            });
            if (token !== knowledgeGraphBuildToken) return;
            if (typeof echarts === 'undefined') throw new Error('echarts unavailable');

            disposeKnowledgeGraphChart();
            knowledgeGraphChart = echarts.init(chartEl, g('nightMode') ? 'dark' : null);

            const option = {
                animationDurationUpdate: 200,
                animationEasingUpdate: 'quinticInOut',
                tooltip: {
                    formatter: function(params) {
                        if (params.dataType === 'node') {
                            const title = params.data && (params.data.filename || params.data.name) ? (params.data.filename || params.data.name) : '';
                            return '<div style="max-width:220px;white-space:normal;"><strong>' + escapeHtml(title) + '</strong></div>';
                        }
                        if (params.dataType === 'edge') {
                            return getRelationLabel(params.data && params.data.relation ? params.data.relation : '');
                        }
                        return '';
                    }
                },
                series: [{
                    type: 'graph',
                    layout: 'force',
                    roam: true,
                    draggable: true,
                    data: filtered.nodes,
                    links: filtered.links,
                    label: {
                        show: true,
                        position: 'right',
                        formatter: function(params) {
                            const name = params && params.data && params.data.name ? String(params.data.name) : '';
                            return name.length > 18 ? (name.slice(0, 18) + '...') : name;
                        }
                    },
                    edgeLabel: {
                        show: true,
                        fontSize: 10,
                        formatter: function(params) {
                            return getRelationLabel(params.data && params.data.relation ? params.data.relation : '');
                        }
                    },
                    lineStyle: {
                        curveness: 0.15
                    },
                    emphasis: {
                        focus: 'adjacency',
                        lineStyle: {
                            width: 2.2
                        }
                    },
                    force: {
                        repulsion: 200,
                        edgeLength: [50, 140],
                        gravity: 0.08
                    }
                }]
            };

            knowledgeGraphChart.setOption(option, true);
            knowledgeGraphChart.on('click', function(params) {
                if (!params || params.dataType !== 'node' || !params.data || !params.data.fileId) return;
                if (typeof global.openFile === 'function') {
                    global.openFile(params.data.fileId);
                }
            });

            const statusText = kgText('knowledgeGraphReady', '已生成知识图谱，共 {nodeCount} 个文件节点、{edgeCount} 条关系')
                .replace('{nodeCount}', String(filtered.nodes.length))
                .replace('{edgeCount}', String(filtered.links.length));
            setKnowledgeGraphStatus(statusText, false);
        } catch (error) {
            console.error('[KnowledgeGraph] render failed:', error);
            setKnowledgeGraphStatus((error && error.message) || kgText('knowledgeGraphWasmRequired', '知识图谱需要 WASM 引擎，请先构建并启用 WASM'), true);
        }
    }

    function refreshKnowledgeGraph(forceRebuild) {
        if (!isKnowledgeGraphPanelVisible()) return;
        if (forceRebuild) knowledgeGraphRawData = null;
        renderKnowledgeGraph();
    }

    function toggleKnowledgeGraphPanel(forceVisible) {
        const panel = document.getElementById('knowledgeGraphPanel');
        if (!panel) return;

        const shouldShow = typeof forceVisible === 'boolean' ? forceVisible : panel.style.display === 'none';
        panel.style.display = shouldShow ? 'flex' : 'none';
        panel.classList.toggle('knowledge-graph-fullscreen', shouldShow);

        if (shouldShow) {
            const loadingText = kgText('knowledgeGraphLoading', '正在分析文件关系...');
            setKnowledgeGraphStatus(loadingText, false);
            if (typeof global.showMessage === 'function') {
                global.showMessage(loadingText, 'info');
            }
            setTimeout(function() {
                refreshKnowledgeGraph(true);
            }, 16);
        } else {
            disposeKnowledgeGraphChart();
        }
    }

    function exportKnowledgeGraphImage() {
        if (!knowledgeGraphChart || typeof knowledgeGraphChart.getDataURL !== 'function') {
            global.showMessage(kgText('exportGraphFailed', '导出图谱失败'), 'error');
            return;
        }

        try {
            const dataUrl = knowledgeGraphChart.getDataURL({
                pixelRatio: 2,
                backgroundColor: g('nightMode') ? '#1f1f1f' : '#ffffff'
            });
            const link = document.createElement('a');
            link.href = dataUrl;
            link.download = 'knowledge-graph.png';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            global.showMessage(kgText('exportGraphSuccess', '图谱图片已导出'), 'success');
        } catch (error) {
            console.error('[KnowledgeGraph] export failed:', error);
            global.showMessage(kgText('exportGraphFailed', '导出图谱失败'), 'error');
        }
    }

    function bindKnowledgeGraphControls() {
        const groupSelect = document.getElementById('knowledgeGraphGroupBy');
        const relationSelect = document.getElementById('knowledgeGraphRelationFilter');
        const searchInput = document.getElementById('knowledgeGraphSearchInput');
        const exportBtn = document.getElementById('knowledgeGraphExportBtn');

        if (groupSelect) {
            groupSelect.addEventListener('change', function() {
                knowledgeGraphView.groupBy = groupSelect.value || 'folder';
                renderKnowledgeGraph();
            });
        }

        if (relationSelect) {
            relationSelect.addEventListener('change', function() {
                knowledgeGraphView.relationFilter = relationSelect.value || 'all';
                renderKnowledgeGraph();
            });
        }

        if (searchInput) {
            searchInput.addEventListener('input', function() {
                const value = searchInput.value || '';
                clearTimeout(knowledgeGraphSearchTimer);
                knowledgeGraphSearchTimer = setTimeout(function() {
                    knowledgeGraphView.searchQuery = value;
                    renderKnowledgeGraph();
                }, 180);
            });
        }

        if (exportBtn) {
            exportBtn.addEventListener('click', exportKnowledgeGraphImage);
        }
    }

    function initKnowledgeGraphPanel() {
        if (knowledgeGraphPanelBound) return;
        const panel = document.getElementById('knowledgeGraphPanel');
        const toggleBtn = document.getElementById('knowledgeGraphBtn');
        const collapseBtn = document.getElementById('knowledgeGraphCollapseBtn');
        const refreshBtn = document.getElementById('knowledgeGraphRefreshBtn');
        const buildBtn = document.getElementById('knowledgeGraphBuildBtn');

        if (!panel || !toggleBtn) return;
        knowledgeGraphPanelBound = true;

        toggleBtn.addEventListener('click', function() {
            toggleKnowledgeGraphPanel(panel.style.display === 'none');
        });

        if (collapseBtn) {
            collapseBtn.addEventListener('click', function() {
                toggleKnowledgeGraphPanel(false);
            });
        }

        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && isKnowledgeGraphPanelVisible()) {
                toggleKnowledgeGraphPanel(false);
            }
        });

        if (refreshBtn) {
            refreshBtn.addEventListener('click', function() {
                refreshKnowledgeGraph(true);
            });
        }

        if (buildBtn) {
            buildBtn.addEventListener('click', function() {
                toggleKnowledgeGraphPanel(true);
            });
        }

        bindKnowledgeGraphControls();

        window.addEventListener('resize', function() {
            if (knowledgeGraphChart && typeof knowledgeGraphChart.resize === 'function' && isKnowledgeGraphPanelVisible()) {
                knowledgeGraphChart.resize();
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initKnowledgeGraphPanel);
    } else {
        initKnowledgeGraphPanel();
    }

    // ---------- 文件操作函数 ----------
    function moveFile(id) {
        const files = g('files');
        const item = files.find(f => f.id === id);
        if (!item) return;

        // 动态获取当前所有可用的文件夹路径（包括没有显式建文件夹记录的虚拟路径）
        const folders = getAllFolderPaths();

        // 创建自定义模态框进行选择
        const nightMode = document.body.classList.contains('night-mode');
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10005;';
        
        const content = document.createElement('div');
        content.className = 'modal';
        const bgColor = nightMode ? '#2d2d2d' : 'white';
        const textColor = nightMode ? '#eee' : '#333';
        const borderColor = nightMode ? '#444' : '#eee';
        const itemHoverBg = nightMode ? '#3d3d3d' : '#f0f0f0';
        const itemNormalBg = nightMode ? '#2d2d2d' : 'white';
        
        content.style.cssText = `width:90%;max-width:400px;max-height:80vh;display:flex;flex-direction:column;padding:20px;background:${bgColor};color:${textColor};border-radius:8px;`;
        
        const header = document.createElement('h3');
        header.textContent = isEn() ? 'Move to...' : '移动到...';
        header.style.margin = '0 0 15px 0';
        
        const list = document.createElement('div');
        list.style.cssText = `flex:1;overflow-y:auto;border:1px solid ${borderColor};border-radius:4px;margin-bottom:15px;`;
        
        const isFolder = item.type === 'folder';
        const currentPath = item.name;

        folders.forEach((f, idx) => {
            // 如果是移动文件夹，检查是否是自己或子目录
            const isSelfOrChild = isFolder && (f === currentPath || f.startsWith(currentPath + '/'));
            
            const div = document.createElement('div');
            div.style.cssText = `padding:10px;cursor:pointer;border-bottom:1px solid ${borderColor};display:flex;align-items:center;background:${itemNormalBg};`;
            if (isSelfOrChild) {
                div.style.color = '#ccc';
                div.style.cursor = 'not-allowed';
            }
            
            div.innerHTML = `<i class="fas fa-folder" style="color:${isSelfOrChild ? '#eee' : '#f7b731'};margin-right:10px;"></i> ${f === '' ? (isEn() ? 'Root' : '根目录') : f}`;
            
            if (!isSelfOrChild) {
                div.onmouseover = () => div.style.background = itemHoverBg;
                div.onmouseout = () => div.style.background = itemNormalBg;
                div.onclick = () => {
                    moveFileTo(id, f);
                    modal.remove();
                };
            }
            list.appendChild(div);
        });
        
        const closeBtn = document.createElement('button');
        closeBtn.textContent = isEn() ? 'Cancel' : '取消';
        closeBtn.className = 'modal-btn secondary';
        closeBtn.style.alignSelf = 'flex-end';
        closeBtn.onclick = () => modal.remove();
        
        content.appendChild(header);
        content.appendChild(list);
        content.appendChild(closeBtn);
        modal.appendChild(content);
        document.body.appendChild(modal);
    }

    function renameFile(id) {
        const files = g('files');
        const item = files.find(f => f.id === id);
        if (!item) return;

        const isFolder = item.type === 'folder';
        const oldName = item.name;
        const parentPath = getParentPath(oldName);
        const oldBasename = getBasename(oldName);

        g('customPrompt')(isEn() ? `Please enter the new ${isFolder ? 'folder' : 'file'} name:` : `请输入新的${isFolder ? '文件夹' : '文件'}名：`, { defaultValue: oldBasename }).then(function(newBasename) {
            if (!newBasename || newBasename.trim() === oldBasename) return;

            if (isNameExistsInParent(newBasename.trim(), parentPath, id)) {
                g('customAlert')(isEn() ? 'A file or folder with the same name already exists in this directory, please use another name' : '该目录下已存在同名文件或文件夹，请使用其他名称');
                return;
            }

            const newName = parentPath ? parentPath + '/' + newBasename.trim() : newBasename.trim();

            if (isFolder) {
                renameFolderAndChildren(oldName, newName);
            } else {
                item.name = newName;
            }

            item.lastModified = Date.now();
            item.isSynced = false;
            localStorage.setItem('vditor_files', JSON.stringify(files));
            loadFiles();
            global.showMessage(isEn() ? `${isFolder ? 'Folder' : 'File'} renamed` : `${isFolder ? '文件夹' : '文件'}已重命名`);
            if (g('currentUser')) {
                if (isFolder) {
                    const affectedFiles = files.filter(f => f.type === 'file' && (f.name.startsWith(newName + '/') || f.name === newName));
                    affectedFiles.forEach(f => global.syncFileToServer(f.id));
                } else {
                    global.deleteFileFromServer(oldName).then(() => global.syncFileToServer(id));
                }
            }
        });
    }

    function createDefaultFile() {
        const defaultFile = {
            id: Date.now().toString(),
            name: isEn() ? 'Untitled' : '未命名文档', // 无前导斜杠
            type: 'file',
            content: isEn() ? '# Welcome to EasyPocketMD\n\nThis is a new document. \n\nStart writing!' : '# 欢迎使用 EasyPocketMD\n\n这是一个新的文档。\n\n开始编写吧！',
            lastModified: Date.now(),
            isSynced: false
        };
        global.files.push(defaultFile);
        localStorage.setItem('vditor_files', JSON.stringify(global.files));
        global.currentFileId = defaultFile.id;

        if (shouldUseLongFileMode(defaultFile.content)) {
            activateLongFileEditor(defaultFile.id, defaultFile.content);
        } else {
            deactivateLongFileEditor();
            setEditorContentForFile(defaultFile.id, defaultFile.content);
        }

        loadFiles();
        g('lastSyncedContent')[defaultFile.id] = defaultFile.content;
        g('unsavedChanges')[defaultFile.id] = false;
    }

    function getSelectedFolderPath() {
        if (!window.$ || !window.$.jstree) return '';
        const tree = window.$.jstree.reference('#fileList');
        if (!tree) return '';
        const selected = tree.get_selected(true);
        if (selected && selected.length > 0) {
            const node = selected[0];
            if (node.data.type === 'folder') {
                return node.data.path + '/';
            } else if (node.data.type === 'file') {
                const parentPath = getParentPath(node.data.path);
                return parentPath ? parentPath + '/' : '';
            }
        }
        return '';
    }

    function createNewFile() {
        const defaultName = isEn() ? 'New Document' : '新文档';
        const defaultPath = getSelectedFolderPath() + defaultName;
        g('customPrompt')(isEn() ? 'Please enter filename (to create in a folder, ensure the folder exists, e.g., docs/note)' : '请输入文件名（如需在文件夹中创建，请确保文件夹已存在，例如 docs/note）', { defaultValue: defaultPath }).then(function(input) {
            if (!input) return;

            let path = normalizePath(input);
            
            // 检查父文件夹是否存在
            const parentPath = getParentPath(path);
            const files = g('files');
            
            if (parentPath) {
                const parentExists = files.some(f => f.name === parentPath && f.type === 'folder');
                if (!parentExists) {
                    g('customAlert')(isEn() ? 'Parent folder "' + parentPath + '" does not exist, please create it first using "New Folder"' : '父文件夹 "' + parentPath + '" 不存在，请先使用“新建文件夹”功能创建');
                    return;
                }
            }

            if (files.some(f => f.name === path && f.type === 'file')) {
                g('customAlert')(isEn() ? 'File with the same name already exists, please use another name' : '已存在同名文件，请使用其他名称');
                return;
            }

            const newFile = {
                id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                name: path,
                type: 'file',
                content: '# ' + getBasename(path) + '\n\n开始编写您的内容...',
                lastModified: Date.now(),
                isSynced: false,
                order: 0
            };
            files.push(newFile);
            localStorage.setItem('vditor_files', JSON.stringify(files));
            openFile(newFile.id);
            loadFiles();
            g('lastSyncedContent')[newFile.id] = newFile.content;
            g('unsavedChanges')[newFile.id] = false;
            if (g('currentUser')) global.syncFileToServer(newFile.id);
            global.showMessage(isEn() ? 'File created: ' + path : '已创建文件: ' + path);
        });
    }

    function createNewFolder() {
        const defaultName = isEn() ? 'New Folder' : '新文件夹';
        const defaultPath = getSelectedFolderPath() + defaultName;
        g('customPrompt')(isEn() ? 'Please enter folder path (e.g., docs/notes)' : '请输入文件夹路径（例如 docs/notes）', { defaultValue: defaultPath }).then(function(input) {
            if (!input) return;

            let path = normalizePath(input);
            ensureParentFolders(path);

            const files = g('files');
            if (files.some(f => f.name === path)) {
                g('customAlert')(isEn() ? 'This path already exists' : '该路径已存在');
                return;
            }

            const newFolder = {
                id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                name: path,
                type: 'folder',
                content: '',
                lastModified: Date.now(),
                isSynced: false,
                order: 0
            };
            files.push(newFolder);
            localStorage.setItem('vditor_files', JSON.stringify(files));
            loadFiles();
            if (g('currentUser')) {
                global.syncFileToServer(newFolder.id);
            }
            global.showMessage(isEn() ? 'Folder created: ' + path : '已创建文件夹: ' + path);
        });
    }

    async function openFile(fileId) {
        const requestToken = ++fileOpenRequestToken;
        setFileSwitchLoading(true);

        // 先保存当前文档
        if (typeof global.saveCurrentFile === 'function' && g('currentFileId')) {
            await global.saveCurrentFile(false);
        }

        try {
            if (requestToken !== fileOpenRequestToken) return;

            closeFileManagementFabRing();

            const files = g('files');
            const file = files.find(f => f.id === fileId && f.type === 'file');
            if (!file) {
                g('customAlert')(isEn() ? 'Cannot open folder' : '无法打开文件夹');
                return;
            }
            global.currentFileId = fileId;

            // 记录最后打开的文件
            localStorage.setItem('vditor_last_opened_file', fileId);

            let content = file.content;
            if (global.LocalImageManager && global.LocalImageManager.convertLocalToBlob) {
                try {
                    content = await global.LocalImageManager.convertLocalToBlob(content);
                } catch (e) {
                    console.error('Failed to convert local images to blob:', e);
                }
            }

            if (requestToken !== fileOpenRequestToken) return;

            const useLongFileMode = shouldUseLongFileMode(content);
            if (typeof global.enterEditorMode === 'function') {
                global.enterEditorMode();
            }

            if (!useLongFileMode && typeof global.ensureVditorInitialized === 'function') {
                await global.ensureVditorInitialized();
            }

            if (requestToken !== fileOpenRequestToken) return;

            if (useLongFileMode) {
                const wasAlreadyLongForSameFile = isLongFileEditorActiveFor(fileId);
                activateLongFileEditor(fileId, content);
                if (!wasAlreadyLongForSameFile) {
                    const longModeNotice = window.i18n
                        ? t('longFileModeNotice')
                        : '检测到超长文件，已切换为高性能文本模式（禁用 Vditor 以避免卡顿）';
                    global.showMessage(longModeNotice, 'warning');
                }
            } else {
                deactivateLongFileEditor();
                setEditorContentForFile(fileId, content);
            }

            await activateOwnerSharedSession(file, content);
            if (requestToken !== fileOpenRequestToken) return;

            await checkExternalLocalConflictForCurrentFile();
            if (requestToken !== fileOpenRequestToken) return;

            expandActiveFile();
            global.startAutoSave();
            global.showMessage(isEn() ? 'File opened: ' + file.name : '已打开文件: ' + file.name);
        } finally {
            if (requestToken === fileOpenRequestToken) {
                setFileSwitchLoading(false);
            }
        }
    }

    async function deleteFile(id) {
        const files = g('files');
        const item = files.find(f => f.id === id);
        if (!item) return;

        if (item.type === 'file') {
            if (files.filter(f => f.type === 'file').length <= 1) {
                g('customAlert')(isEn() ? 'At least one file must be kept' : '至少需要保留一个文件');
                return;
            }
            const confirmed = await g('customConfirm')(isEn() ? 'Are you sure you want to delete this file?' : '确定要删除这个文件吗？');
            if (!confirmed) return;

            const idx = files.findIndex(f => f.id === id);
            files.splice(idx, 1);
            localStorage.setItem('vditor_files', JSON.stringify(files));

            if (g('currentUser')) global.deleteFileFromServer(item.name);
            delete g('lastSyncedContent')[id];
            delete g('unsavedChanges')[id];

            if (id === g('currentFileId')) {
                const firstFile = files.find(f => f.type === 'file');
                if (firstFile) openFile(firstFile.id);
                else createDefaultFile();
            }
            loadFiles();
            global.showMessage(isEn() ? 'File deleted: ' + item.name : '已删除文件: ' + item.name);
        } else {
            const confirmed = await g('customConfirm')(isEn() ? `Are you sure you want to delete the folder "${item.name}" and all its contents?` : `确定要删除文件夹“${item.name}”及其所有内容吗？`);
            if (!confirmed) return;

            const toDelete = files.filter(f => f.name === item.name || f.name.startsWith(item.name + '/'));
            const fileNamesToDelete = toDelete.filter(f => f.type === 'file').map(f => f.name);

            deleteFolderAndChildren(item.name);
            localStorage.setItem('vditor_files', JSON.stringify(files));

            if (g('currentUser')) {
                fileNamesToDelete.forEach(name => global.deleteFileFromServer(name));
                // 只有当文件夹本身已同步（即服务器存在记录）时，才发送删除请求
                if (item.isSynced) {
                    global.deleteFileFromServer(item.name + '/');
                }
            }

            toDelete.forEach(f => {
                delete g('lastSyncedContent')[f.id];
                delete g('unsavedChanges')[f.id];
            });

            if (id === g('currentFileId') || toDelete.some(f => f.id === g('currentFileId'))) {
                const firstFile = files.find(f => f.type === 'file');
                if (firstFile) openFile(firstFile.id);
                else createDefaultFile();
            }
            loadFiles();
            global.showMessage(isEn() ? 'Folder deleted: ' + item.name : '已删除文件夹: ' + item.name);
        }
    }

    async function saveCurrentFile(isManual) {
        isManual = isManual !== false;
        const currentFileId = g('currentFileId');
        const vditor = g('vditor');
        if (!currentFileId) return;

        const isLongMode = isLongFileEditorActiveFor(currentFileId);
        if (!isLongMode && !vditor) return;

        const files = g('files');
        const fileIndex = files.findIndex(function(f) { return f.id === currentFileId && f.type === 'file'; });
        if (fileIndex === -1) return;
        let content = getCurrentEditorContent(currentFileId, files[fileIndex].content);

        if (global.LocalImageManager && global.LocalImageManager.convertBlobToLocal) {
            try {
                content = global.LocalImageManager.convertBlobToLocal(content);
            } catch (e) {
                console.error('Failed to convert blob images to local:', e);
            }
        }

        const file = files[fileIndex];
        const contentChanged = content !== file.content;
        file.content = content;
        file.lastModified = Date.now();
        localStorage.setItem('vditor_files', JSON.stringify(files));
        if (isManual) {
            showSaveStatus('saving');
        }

        // 在线共享文档由 share websocket/update 通道负责写入，避免 owner 普通保存覆盖实时协作状态。
        if (
            global.sharedDocState &&
            global.sharedDocState.canEdit &&
            global.sharedDocState.ownerFileId === currentFileId &&
            typeof global.scheduleSharedDocSync === 'function'
        ) {
            const sharedSaveResult = await global.scheduleSharedDocSync({ manualSave: isManual });
            if (sharedSaveResult !== false) {
                g('unsavedChanges')[currentFileId] = false;
                if (isManual) {
                    showSaveStatus('saved');
                }
            } else if (isManual) {
                showSaveStatus('failed');
            }
            return;
        }

        // 保存成功后清除草稿（因为已经正式保存到 localStorage）
        if (global.draftRecovery) {
            global.draftRecovery.clearDraft();
        }

        // Electron 本地文件：优先回写原始文件路径，再同步云端
        if (file.isExternalLocal && file.localFilePath && global.electron && typeof global.electron.writeLocalFile === 'function') {
            const writeResult = await global.electron.writeLocalFile(file.localFilePath, content);
            if (!writeResult || !writeResult.success) {
                if (isManual) showSaveStatus('failed');
                if (isManual) {
                    global.showMessage((isEn() ? 'Failed to save local file: ' : '保存本地文件失败：') + ((writeResult && writeResult.error) || ''), 'error');
                }
                return;
            }
            localExternalSnapshotMap.set(currentFileId, content);
            if (isManual) {
                global.showMessage(t('localFileSaved'), 'success');
            }
            const saveSynced = await syncFileAfterSaveIfNeeded(currentFileId, file, content, isManual, contentChanged);
            if (saveSynced) {
                g('unsavedChanges')[currentFileId] = false;
                if (isManual) {
                    showSaveStatus('saved');
                }
            } else {
                if (isManual) {
                    showSaveStatus('failed');
                }
            }
            return;
        }

        // 浏览器本地文件（File System Access API）：有写权限时直接回写
        if (file.isExternalLocal && file.localFileMode === 'browser-fsa') {
            const writeResult = await writeBrowserLocalFileWithRetry(currentFileId, content);
            if (writeResult && writeResult.success) {
                if (isManual) {
                    global.showMessage(t('localFileSaved'), 'success');
                }
                const saveSynced = await syncFileAfterSaveIfNeeded(currentFileId, file, content, isManual, contentChanged);
                if (saveSynced) {
                    g('unsavedChanges')[currentFileId] = false;
                    if (isManual) {
                        showSaveStatus('saved');
                    }
                } else if (isManual) {
                    showSaveStatus('failed');
                }
            } else {
                if (writeResult && writeResult.error && !writeResult.canceled) {
                    if (isManual) showSaveStatus('failed');
                    if (isManual) {
                        global.showMessage((isEn() ? 'Failed to save local file: ' : '保存本地文件失败：') + (writeResult.error.message || ''), 'error');
                    }
                }
                downloadLocalContent(file.name, content);
                localExternalSnapshotMap.set(currentFileId, content);
                if (isManual) {
                    global.showMessage(t('localFileSavedAsDownload'), 'warning');
                }
                const saveSynced = await syncFileAfterSaveIfNeeded(currentFileId, file, content, isManual, contentChanged);
                if (saveSynced) {
                    g('unsavedChanges')[currentFileId] = false;
                    if (isManual) {
                        showSaveStatus('saved');
                    }
                } else if (isManual) {
                    showSaveStatus('failed');
                }
            }
            return;
        }

        // 浏览器 input 打开的文件无法直接写回，回退为下载
        if (file.isExternalLocal && file.localFileMode === 'browser-file') {
            downloadLocalContent(file.name, content);
            localExternalSnapshotMap.set(currentFileId, content);
            if (isManual) {
                global.showMessage(t('localFileSavedAsDownload'), 'warning');
            }
            const saveSynced = await syncFileAfterSaveIfNeeded(currentFileId, file, content, isManual, contentChanged);
            if (saveSynced) {
                g('unsavedChanges')[currentFileId] = false;
                if (isManual) {
                    showSaveStatus('saved');
                }
            } else if (isManual) {
                showSaveStatus('failed');
            }
            return;
        }

        const saveSynced = await syncFileAfterSaveIfNeeded(currentFileId, file, content, isManual, contentChanged);
        if (saveSynced) {
            g('unsavedChanges')[currentFileId] = false;
            if (isManual) {
                showSaveStatus('saved');
            }
        } else if (isManual) {
            showSaveStatus('failed');
        }
    }

    async function createHistoryVersion(filename, content) {
        if (!g('currentUser')) return false;
        try {
            var api = global.getApiBaseUrl ? global.getApiBaseUrl() : 'api';
            const response = await fetch(api + '/files/history/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + g('currentUser').token },
                body: JSON.stringify({ username: g('currentUser').username, filename: filename, content: content, timestamp: Date.now() })
            });
            const result = global.parseJsonResponse ? await global.parseJsonResponse(response) : await response.json();

            // 处理 Token 过期
            if (result.code === 401 || (global.isTokenError && global.isTokenError(result))) {
                if (await tryHandleTokenExpired(result)) {
                    return false;
                }
            }

            return result.code === 200;
        } catch (e) {
            await tryHandleTokenExpired(e);
            console.error('创建历史版本失败', e);
            throw e;
        }
    }

    async function getFileHistory(filename) {
        if (!g('currentUser')) return [];
        try {
            var api = global.getApiBaseUrl ? global.getApiBaseUrl() : 'api';
            const url = api + '/files/history/list?username=' + encodeURIComponent(g('currentUser').username) + '&filename=' + encodeURIComponent(filename);

            // 使用 authenticatedFetch 自动处理 Token 过期
            let result;
            if (global.authenticatedFetch) {
                result = await global.authenticatedFetch(url, { method: 'GET' });
            } else {
                // 降级处理：使用普通 fetch
                const response = await fetch(url, {
                    method: 'GET',
                    headers: { 'Authorization': 'Bearer ' + g('currentUser').token }
                });
                result = global.parseJsonResponse ? await global.parseJsonResponse(response) : await response.json();

                // 检查 Token 错误
                if (global.isTokenError && global.isTokenError(result)) {
                    const handled = await global.handleTokenExpired();
                    if (handled) {
                        // 重试
                        const retryResponse = await fetch(url, {
                            method: 'GET',
                            headers: { 'Authorization': 'Bearer ' + g('currentUser').token }
                        });
                        result = global.parseJsonResponse ? await global.parseJsonResponse(retryResponse) : await retryResponse.json();
                    } else {
                        return [];
                    }
                }
            }

            return (result.code === 200 && result.data && result.data.history) ? result.data.history : [];
        } catch (e) {
            console.error('获取历史版本失败', e);
            // 如果是 Token 错误，显示友好提示
            if (e.message && (e.message.includes('sessionExpired') || e.message.includes('过期'))) {
                return [];
            }
            return [];
        }
    }

    // 当前历史版本选择状态
    let selectedHistoryVersions = new Set();
    let currentHistoryFileId = null;
    let currentHistoryFilename = null;

    async function showHistoryModal(fileId, filename) {
        const modal = document.getElementById('historyModalOverlay');
        const historyList = document.getElementById('historyList');
        const historyFileName = document.getElementById('historyFileName');
        if (!modal || !historyList || !historyFileName) return;

        // 重置选择状态
        selectedHistoryVersions.clear();
        currentHistoryFileId = fileId;
        currentHistoryFilename = filename;
        updateHistoryBatchToolbar();

        historyFileName.textContent = filename;
        modal.classList.add('show');
        historyList.innerHTML = '<div class="history-loading"><i class="fas fa-spinner fa-spin"></i> ' + (isEn() ? 'Loading history versions...' : '正在加载历史版本...') + '</div>';

        // 绑定批量操作事件
        bindHistoryBatchEvents(fileId, filename);

        try {
            const history = await getFileHistory(filename);
            if (history.length === 0) {
                historyList.innerHTML = '<div class="history-loading">' + (isEn() ? 'No history versions' : '暂无历史版本') + '</div>';
                // 隐藏批量操作工具栏
                const batchToolbar = document.getElementById('historyBatchToolbar');
                if (batchToolbar) batchToolbar.style.display = 'none';
                return;
            }

            // 显示批量操作工具栏
            const batchToolbar = document.getElementById('historyBatchToolbar');
            if (batchToolbar) batchToolbar.style.display = 'flex';

            const files = g('files');
            const currentFile = files.find(function(f) { return f.id === fileId; });
            const currentContent = currentFile ? currentFile.content : '';
            historyList.innerHTML = '';

            history.forEach(function(version, index) {
                const versionEl = document.createElement('div');
                versionEl.className = 'history-version' + (index === 0 ? ' history-version-current' : '');
                versionEl.dataset.versionId = version.version_id;

                const date = new Date(version.timestamp).toLocaleString();
                const contentPreview = version.content.substring(0, 200) + (version.content.length > 200 ? '...' : '');

                // 添加复选框（当前版本除外）
                const checkboxHtml = index > 0 ? '<input type="checkbox" class="history-version-checkbox" data-version-id="' + version.version_id + '">' : '';

                const modifiedBy = version.modified_by ? (isEn() ? ' by ' : ' 由 ') + version.modified_by : '';
                versionEl.innerHTML = checkboxHtml + '<div class="history-version-content-wrapper"><div class="history-version-header"><div class="history-version-title">' + (isEn() ? 'Version ' : '版本 ') + version.version_id + (index === 0 ? ' <span style="color:#4CAF50;font-size:12px;">(' + (isEn() ? 'Current' : '当前') + ')</span>' : '') + modifiedBy + '</div><div class="history-version-date">' + date + '</div></div><div class="history-version-content">' + global.escapeHtml(contentPreview) + '</div><div class="history-version-actions"><button class="modal-btn small preview-btn"><i class="fas fa-eye"></i> ' + (isEn() ? 'Preview' : '预览') + '</button>' + (index > 0 ? '<button class="modal-btn small primary restore-btn"><i class="fas fa-history"></i> ' + (isEn() ? 'Restore' : '恢复') + '</button>' : '') + '<button class="modal-btn small delete-history-btn"><i class="fas fa-trash"></i> ' + (isEn() ? 'Delete' : '删除') + '</button></div></div>';

                // 绑定复选框事件
                if (index > 0) {
                    const checkbox = versionEl.querySelector('.history-version-checkbox');
                    if (checkbox) {
                        checkbox.addEventListener('change', function(e) {
                            e.stopPropagation();
                            if (this.checked) {
                                selectedHistoryVersions.add(version.version_id);
                                versionEl.classList.add('selected');
                            } else {
                                selectedHistoryVersions.delete(version.version_id);
                                versionEl.classList.remove('selected');
                            }
                            updateHistoryBatchToolbar();
                        });
                    }
                }

                var previewBtn = versionEl.querySelector('.preview-btn');
                if (previewBtn) previewBtn.addEventListener('click', function(e) { e.stopPropagation(); global.previewHistoryVersion(filename, version.version_id, version.content, version.timestamp); });
                if (index > 0) {
                    var restoreBtn = versionEl.querySelector('.restore-btn');
                    if (restoreBtn) restoreBtn.addEventListener('click', function(e) { e.stopPropagation(); global.restoreFromHistory(filename, version.version_id, version.content, fileId); });
                }
                var deleteBtn = versionEl.querySelector('.delete-history-btn');
                if (deleteBtn) deleteBtn.addEventListener('click', function(e) { e.stopPropagation(); e.preventDefault(); global.deleteHistoryVersion(filename, version.version_id, version.history_id || '', fileId); });

                historyList.appendChild(versionEl);
            });
        } catch (error) {
            historyList.innerHTML = '<div class="history-loading">' + (isEn() ? 'Load failed: ' : '加载失败: ') + error.message + '</div>';
        }
    }

    function bindHistoryBatchEvents(fileId, filename) {
        // 全选/取消全选
        const selectAllCheckbox = document.getElementById('historySelectAllCheckbox');
        const selectAllText = document.getElementById('historySelectAllText');
        const batchDeleteBtn = document.getElementById('historyBatchDeleteBtn');
        const clearAllBtn = document.getElementById('historyClearAllBtn');

        if (selectAllCheckbox) {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.onclick = function() {
                const checkboxes = document.querySelectorAll('.history-version-checkbox');
                const versionEls = document.querySelectorAll('.history-version');

                if (this.checked) {
                    checkboxes.forEach(function(cb, idx) {
                        cb.checked = true;
                        selectedHistoryVersions.add(parseInt(cb.dataset.versionId));
                        if (versionEls[idx]) versionEls[idx].classList.add('selected');
                    });
                    if (selectAllText) selectAllText.textContent = isEn() ? 'Deselect All' : '取消全选';
                } else {
                    checkboxes.forEach(function(cb, idx) {
                        cb.checked = false;
                        selectedHistoryVersions.delete(parseInt(cb.dataset.versionId));
                        if (versionEls[idx]) versionEls[idx].classList.remove('selected');
                    });
                    if (selectAllText) selectAllText.textContent = isEn() ? 'Select All' : '全选';
                }
                updateHistoryBatchToolbar();
            };
        }

        // 批量删除按钮
        if (batchDeleteBtn) {
            batchDeleteBtn.onclick = function() {
                if (selectedHistoryVersions.size === 0) {
                    global.showMessage(isEn() ? 'Please select history versions to delete' : '请先选择要删除的历史版本', 'warning');
                    return;
                }
                showBatchDeleteConfirmModal(filename, Array.from(selectedHistoryVersions), fileId);
            };
        }

        // 清空全部按钮
        if (clearAllBtn) {
            clearAllBtn.onclick = function() {
                showClearAllConfirmModal(filename, fileId);
            };
        }
    }

    function updateHistoryBatchToolbar() {
        const selectedCountEl = document.getElementById('historySelectedCount');
        const batchDeleteBtn = document.getElementById('historyBatchDeleteBtn');
        const selectAllText = document.getElementById('historySelectAllText');

        if (selectedHistoryVersions.size > 0) {
            if (selectedCountEl) {
                selectedCountEl.style.display = 'flex';
                selectedCountEl.textContent = (isEn() ? '' : '已选择 ') + selectedHistoryVersions.size + (isEn() ? ' selected' : ' 项');
            }
            if (batchDeleteBtn) batchDeleteBtn.style.display = 'inline-flex';
        } else {
            if (selectedCountEl) selectedCountEl.style.display = 'none';
            if (batchDeleteBtn) batchDeleteBtn.style.display = 'none';
        }

        // 更新全选文字
        const checkboxes = document.querySelectorAll('.history-version-checkbox');
        const allChecked = checkboxes.length > 0 && Array.from(checkboxes).every(function(cb) { return cb.checked; });
        if (selectAllText) {
            selectAllText.textContent = allChecked ? (isEn() ? 'Deselect All' : '取消全选') : (isEn() ? 'Select All' : '全选');
        }
    }

    function showBatchDeleteConfirmModal(filename, versionIds, fileId) {
        var nightMode = g('nightMode') === true;
        var confirmModal = document.createElement('div');
        confirmModal.className = 'modal-overlay';
        confirmModal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:10001;';
        var modalContent = document.createElement('div');
        var bgColor = nightMode ? '#2d2d2d' : 'white';
        var textColor = nightMode ? '#eee' : '#333';
        var secondaryTextColor = nightMode ? '#aaa' : '#666';
        modalContent.style.cssText = 'background:' + bgColor + ';color:' + textColor + ';border-radius:12px;padding:25px;max-width:90%;';
        modalContent.innerHTML = '<div class="modal-header" style="text-align:center;margin-bottom:20px;"><h2 style="margin:0 0 10px 0;color:#dc3545;">' + (isEn() ? 'Batch Delete Confirmation' : '批量删除确认') + '</h2><p style="color:' + secondaryTextColor + ';margin:0;">' + (isEn() ? 'Are you sure you want to delete the selected history versions?' : '确定要删除选中的历史版本吗？') + '</p></div><div style="margin:15px 0;text-align:center;"><strong style="color:#dc3545;font-size:18px;">' + versionIds.length + '</strong> ' + (isEn() ? 'versions will be deleted' : '个版本将被删除') + '</div><div style="display:flex;gap:10px;justify-content:center;margin-top:25px;"><button class="delete-confirm-cancel" style="padding:10px 24px;background:' + (nightMode ? '#555' : '#6c757d') + ';color:white;border:none;border-radius:6px;cursor:pointer;">' + (isEn() ? 'Cancel' : '取消') + '</button><button class="delete-confirm-ok" style="padding:10px 24px;background:#dc3545;color:white;border:none;border-radius:6px;cursor:pointer;">' + (isEn() ? 'Confirm Delete' : '确认删除') + '</button></div>';
        confirmModal.appendChild(modalContent);
        document.body.appendChild(confirmModal);
        var cancelBtn = modalContent.querySelector('.delete-confirm-cancel');
        var confirmBtn = modalContent.querySelector('.delete-confirm-ok');
        cancelBtn.onclick = function() { global.removeModal(confirmModal); };
        confirmBtn.onclick = function() {
            confirmBtn.disabled = true;
            confirmBtn.textContent = isEn() ? 'Deleting...' : '删除中...';
            performBatchDeleteHistory(filename, versionIds, fileId, confirmModal);
        };
        confirmModal.addEventListener('click', function(e) { if (e.target === confirmModal) global.removeModal(confirmModal); });
        var handleKeydown = function(e) { if (e.key === 'Escape') { global.removeModal(confirmModal); document.removeEventListener('keydown', handleKeydown); } };
        document.addEventListener('keydown', handleKeydown);
        confirmModal.removeKeydownHandler = function() { document.removeEventListener('keydown', handleKeydown); };
    }

    async function performBatchDeleteHistory(filename, versionIds, fileId, modalElement) {
        try {
            var success = await deleteHistoryVersionBatchAPI(filename, versionIds);
            if (success) {
                global.removeModal(modalElement);
                global.showMessage((isEn() ? 'Batch delete successful, deleted ' : '批量删除成功，已删除 ') + versionIds.length + (isEn() ? ' versions' : ' 个版本'), 'success');
                selectedHistoryVersions.clear();
                // 刷新列表
                setTimeout(function() { global.showHistoryModal(fileId, filename); }, 500);
            } else throw new Error(isEn() ? 'Delete failed' : '删除失败');
        } catch (error) {
            console.error('批量删除历史版本失败', error);
            global.showMessage((isEn() ? 'Batch delete failed: ' : '批量删除失败: ') + error.message, 'error');
        }
    }

    async function deleteHistoryVersionBatchAPI(filename, versionIds) {
        if (!g('currentUser')) return false;
        try {
            var api = global.getApiBaseUrl ? global.getApiBaseUrl() : 'api';
            var response = await fetch(api + '/files/history/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + g('currentUser').token },
                body: JSON.stringify({ username: g('currentUser').username, filename: filename, version_ids: versionIds })
            });
            var result = global.parseJsonResponse ? await global.parseJsonResponse(response) : await response.json();

            // 处理 Token 过期
            if (result.code === 401 || (global.isTokenError && global.isTokenError(result))) {
                if (await tryHandleTokenExpired(result)) {
                    return false;
                }
            }

            return result.code === 200;
        } catch (e) {
            await tryHandleTokenExpired(e);
            throw e;
        }
    }

    function showClearAllConfirmModal(filename, fileId) {
        var nightMode = g('nightMode') === true;
        var confirmModal = document.createElement('div');
        confirmModal.className = 'modal-overlay';
        confirmModal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:10001;';
        var modalContent = document.createElement('div');
        var bgColor = nightMode ? '#2d2d2d' : 'white';
        var textColor = nightMode ? '#eee' : '#333';
        var secondaryTextColor = nightMode ? '#aaa' : '#666';
        modalContent.style.cssText = 'background:' + bgColor + ';color:' + textColor + ';border-radius:12px;padding:25px;max-width:90%;';
        modalContent.innerHTML = '<div class="modal-header" style="text-align:center;margin-bottom:20px;"><h2 style="margin:0 0 10px 0;color:#dc3545;"><i class="fas fa-exclamation-triangle"></i> ' + (isEn() ? 'Clear All History' : '清空全部历史') + '</h2><p style="color:' + secondaryTextColor + ';margin:0;">' + (isEn() ? 'Are you sure you want to clear ALL history versions?' : '确定要清空该文件的所有历史版本吗？') + '</p></div><div style="margin:15px 0;text-align:center;color:#dc3545;font-weight:bold;">' + (isEn() ? 'This action cannot be undone!' : '此操作不可恢复！') + '</div><div style="margin:10px 0;text-align:center;color:' + secondaryTextColor + ';">' + (isEn() ? 'File: ' : '文件：') + global.escapeHtml(filename) + '</div><div style="display:flex;gap:10px;justify-content:center;margin-top:25px;"><button class="delete-confirm-cancel" style="padding:10px 24px;background:' + (nightMode ? '#555' : '#6c757d') + ';color:white;border:none;border-radius:6px;cursor:pointer;">' + (isEn() ? 'Cancel' : '取消') + '</button><button class="delete-confirm-ok" style="padding:10px 24px;background:#dc3545;color:white;border:none;border-radius:6px;cursor:pointer;">' + (isEn() ? 'Confirm Clear All' : '确认清空全部') + '</button></div>';
        confirmModal.appendChild(modalContent);
        document.body.appendChild(confirmModal);
        var cancelBtn = modalContent.querySelector('.delete-confirm-cancel');
        var confirmBtn = modalContent.querySelector('.delete-confirm-ok');
        cancelBtn.onclick = function() { global.removeModal(confirmModal); };
        confirmBtn.onclick = function() {
            confirmBtn.disabled = true;
            confirmBtn.textContent = isEn() ? 'Clearing...' : '清空中...';
            performClearAllHistory(filename, fileId, confirmModal);
        };
        confirmModal.addEventListener('click', function(e) { if (e.target === confirmModal) global.removeModal(confirmModal); });
        var handleKeydown = function(e) { if (e.key === 'Escape') { global.removeModal(confirmModal); document.removeEventListener('keydown', handleKeydown); } };
        document.addEventListener('keydown', handleKeydown);
        confirmModal.removeKeydownHandler = function() { document.removeEventListener('keydown', handleKeydown); };
    }

    async function performClearAllHistory(filename, fileId, modalElement) {
        try {
            var success = await deleteHistoryVersionAPI(filename, 0); // version_id = 0 表示删除全部
            if (success) {
                global.removeModal(modalElement);
                global.showMessage(isEn() ? 'All history versions cleared' : '已清空所有历史版本', 'success');
                selectedHistoryVersions.clear();
                // 关闭模态框
                var historyModal = document.getElementById('historyModalOverlay');
                if (historyModal) historyModal.classList.remove('show');
            } else throw new Error(isEn() ? 'Clear failed' : '清空失败');
        } catch (error) {
            console.error('清空历史版本失败', error);
            global.showMessage((isEn() ? 'Clear failed: ' : '清空失败: ') + error.message, 'error');
        }
    }

    function startAutoSave() {
        const currentFileId = g('currentFileId');
        if (!currentFileId || !isCurrentFileDirty(currentFileId)) {
            global.clearAutoSave();
            return;
        }

        global.clearAutoSave();
        Promise.resolve(persistDraftBackup()).catch(function(error) {
            console.warn('[Autosave] draft backup failed:', error);
        });

        global.autoSaveTimer = setTimeout(function() {
            if (!isCurrentFileDirty(currentFileId) || autoSaveInFlight) return;
            autoSaveInFlight = true;
            Promise.resolve(global.saveCurrentFile(false)).catch(function(error) {
                console.warn('自动保存失败:', error);
            }).finally(function() {
                autoSaveInFlight = false;
            });
        }, AUTO_SAVE_DEBOUNCE_MS);

        global.autoSaveForceTimer = setTimeout(function() {
            if (!isCurrentFileDirty(currentFileId) || autoSaveInFlight) return;
            autoSaveInFlight = true;
            Promise.resolve(global.saveCurrentFile(false)).catch(function(error) {
                console.warn('强制自动保存失败:', error);
            }).finally(function() {
                autoSaveInFlight = false;
                if (isCurrentFileDirty(currentFileId)) {
                    startAutoSave();
                }
            });
        }, AUTO_SAVE_FORCE_MS);
    }

    function clearAutoSave() {
        if (global.autoSaveTimer) { clearTimeout(global.autoSaveTimer); global.autoSaveTimer = null; }
        if (global.autoSaveForceTimer) { clearTimeout(global.autoSaveForceTimer); global.autoSaveForceTimer = null; }
    }

    function startAutoSync() {
        return syncRuntimeApi.startAutoSync();
    }

    function stopAutoSync() {
        return syncRuntimeApi.stopAutoSync();
    }

    async function syncAllFiles() {
        return syncRuntimeApi.syncAllFiles();
    }

    async function syncFileToServer(fileId, options) {
        return syncRuntimeApi.syncFileToServer(fileId, options);
    }

    async function deleteFileFromServer(filename) {
        return syncRuntimeApi.deleteFileFromServer(filename);
    }

    function previewHistoryVersion(filename, versionId, content, timestamp) {
        const diffModal = document.getElementById('diffModalOverlay');
        const diffContent = document.getElementById('diffContent');
        const diffFileName = document.getElementById('diffFileName');
        const diffLocalTime = document.getElementById('diffLocalTime');
        const diffServerTime = document.getElementById('diffServerTime');
        const diffInfo = diffModal.querySelector('.diff-info span');
        const localVersionLabel = diffModal.querySelector('.diff-version-header:first-child .diff-version-label');
        const serverVersionLabel = diffModal.querySelector('.diff-version-header:last-child .diff-version-label');
        
        if (!diffModal || !diffContent) return;
        
        // 获取当前文件内容
        const files = g('files');
        const currentFile = files.find(function(f) { return f.name === filename; });
        const currentContent = currentFile ? currentFile.content : '';
        
        // 设置文件信息
        diffFileName.textContent = filename;
        diffLocalTime.textContent = new Date(timestamp).toLocaleString();
        diffServerTime.textContent = isEn() ? 'Current Version' : '当前版本';
        
        // 更新标签文本
        if (localVersionLabel) localVersionLabel.textContent = (isEn() ? 'History Version ' : '历史版本 ') + versionId;
        if (serverVersionLabel) serverVersionLabel.textContent = isEn() ? 'Current Version' : '当前版本';
        if (diffInfo) diffInfo.textContent = isEn() ? 'Showing differences only (unchanged lines are folded).' : '仅显示差异（相同内容已自动折叠）。';
        
        // 计算并渲染差异（历史版本 vs 当前版本）
        const diffResult = computeDiff(content || '', currentContent || '');
        diffContent.innerHTML = renderDiffView(diffResult, { collapseSame: true });
        bindCollapsedDiffInteractions(diffContent);
        
        // 显示模态窗口
        diffModal.classList.add('show');
        
        // 绑定关闭事件
        const closeBtn = document.getElementById('closeDiffBtn');
        const closeModalBtn = document.getElementById('closeDiffModalBtn');
        
        const closeModal = function() {
            diffModal.classList.remove('show');
            // 恢复原始标签文本
            if (localVersionLabel) localVersionLabel.textContent = isEn() ? 'Local Version' : '本地版本';
            if (serverVersionLabel) serverVersionLabel.textContent = isEn() ? 'Server Version' : '服务器版本';
            if (diffInfo) diffInfo.textContent = isEn() ? 'Showing differences only (unchanged lines are folded).' : '仅显示差异（相同内容已自动折叠）。';
        };
        
        if (closeBtn) closeBtn.onclick = closeModal;
        if (closeModalBtn) closeModalBtn.onclick = closeModal;
        
        // 点击外部关闭
        diffModal.onclick = function(e) {
            if (e.target === diffModal) closeModal();
        };
        
        // ESC键关闭
        const handleEsc = function(e) {
            if (e.key === 'Escape' && diffModal.classList.contains('show')) {
                closeModal();
                document.removeEventListener('keydown', handleEsc);
            }
        };
        document.addEventListener('keydown', handleEsc);
    }

    async function restoreHistoryVersion(filename, versionId, content) {
        if (!g('currentUser')) return false;
        try {
            var api = global.getApiBaseUrl ? global.getApiBaseUrl() : 'api';
            var response = await fetch(api + '/files/history/restore', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + g('currentUser').token },
                body: JSON.stringify({ username: g('currentUser').username, filename: filename, version_id: versionId })
            });
            var result = global.parseJsonResponse ? await global.parseJsonResponse(response) : await response.json();

            // 处理 Token 过期
            if (result.code === 401 || (global.isTokenError && global.isTokenError(result))) {
                if (await tryHandleTokenExpired(result)) {
                    return false;
                }
            }

            return result.code === 200;
        } catch (e) {
            await tryHandleTokenExpired(e);
            throw e;
        }
    }

    function compareVersions(originalContent, newContent) {
        var stats = global.wasmTextEngineGateway.compareVersions(originalContent || '', newContent || '');
        if (!stats || !stats.hasChanges) {
            return { hasChanges: false, message: isEn() ? 'Content is identical' : '内容完全相同', added: 0, removed: 0, changed: 0 };
        }
        var added = Number(stats.added || 0);
        var removed = Number(stats.removed || 0);
        var changed = Number(stats.changed || 0);
        return {
            hasChanges: true,
            message: (isEn() ? 'Line changes: added ' : '行数变化: 新增 ') + added + (isEn() ? ' lines, removed ' : ' 行，删除 ') + removed + (isEn() ? ' lines, modified ' : ' 行，修改 ') + changed + (isEn() ? ' lines' : ' 行'),
            added: added,
            removed: removed,
            changed: changed
        };
    }

    async function restoreFromHistory(filename, versionId, content, fileId) {
        const confirmed1 = await g('customConfirm')(isEn() ? 'Are you sure you want to restore to this version?\nThe current editor content will be replaced.' : '确定要恢复到此版本吗？\n当前编辑器的内容将被替换。');
        if (!confirmed1) return;
        try {
            global.showMessage(isEn() ? 'Restoring history version...' : '正在恢复历史版本...', 'info');
            var currentContent = getCurrentEditorContent(fileId, '');
            var diff = compareVersions(currentContent, content);
            if (!diff.hasChanges) { global.showMessage(isEn() ? 'Current content is the same as the selected version, no need to restore' : '当前内容与所选版本相同，无需恢复', 'info'); return; }
            const confirmed2 = await g('customConfirm')(isEn() ? 'About to restore history version, here is the change summary:\n' + diff.message + '\n\nAre you sure you want to restore?' : '即将恢复历史版本，以下是变化摘要：\n' + diff.message + '\n\n确定要恢复吗？');
            if (!confirmed2) return;
            if (g('currentUser')) {
                var success = await restoreHistoryVersion(filename, versionId, content);
                if (!success) global.showMessage(isEn() ? 'Server restore failed, will restore locally' : '服务器恢复失败，将在本地恢复', 'warning');
            }
            var files = g('files');
            var fileIndex = files.findIndex(function(f) { return f.id === fileId; });
            if (fileIndex === -1) throw new Error(isEn() ? 'File not found' : '文件不存在');
            files[fileIndex].content = content;
            files[fileIndex].lastModified = Date.now();
            files[fileIndex].isSynced = g('currentUser') ? false : true;
            localStorage.setItem('vditor_files', JSON.stringify(files));
            if (g('currentFileId') === fileId) {
                setEditorContentForFile(fileId, content);
                global.showMessage((isEn() ? 'Restored to this version (Version ID: ' : '已恢复到此版本（版本ID: ') + versionId + '）', 'success');
                g('unsavedChanges')[fileId] = true;
                setTimeout(function() { global.saveCurrentFile(true); }, 1000);
            }
            var modal = document.getElementById('historyModalOverlay');
            if (modal) modal.classList.remove('show');
            loadFiles();
            if (g('currentUser')) setTimeout(function() { global.syncFileToServer(fileId); }, 2000);
        } catch (error) {
            console.error('恢复失败', error);
            global.showMessage((isEn() ? 'Restore failed: ' : '恢复失败: ') + error.message, 'error');
        }
    }

    async function deleteHistoryVersionAPI(filename, versionId) {
        if (!g('currentUser')) return false;
        try {
            var api = global.getApiBaseUrl ? global.getApiBaseUrl() : 'api';
            var response = await fetch(api + '/files/history/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + g('currentUser').token },
                body: JSON.stringify({ username: g('currentUser').username, filename: filename, version_id: versionId })
            });
            var result = global.parseJsonResponse ? await global.parseJsonResponse(response) : await response.json();

            // 处理 Token 过期
            if (result.code === 401 || (global.isTokenError && global.isTokenError(result))) {
                if (await tryHandleTokenExpired(result)) {
                    return false;
                }
            }

            return result.code === 200;
        } catch (e) {
            await tryHandleTokenExpired(e);
            throw e;
        }
    }

    function showDeleteConfirmModal(filename, versionId, historyId, fileId) {
        var nightMode = g('nightMode') === true;
        var confirmModal = document.createElement('div');
        confirmModal.className = 'modal-overlay';
        confirmModal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:10001;';
        var modalContent = document.createElement('div');
        var bgColor = nightMode ? '#2d2d2d' : 'white';
        var textColor = nightMode ? '#eee' : '#333';
        var secondaryTextColor = nightMode ? '#aaa' : '#666';
        var lightBg = nightMode ? '#3d3d3d' : '#f5f5f5';
        var borderColor = nightMode ? '#444' : '#eee';
        modalContent.style.cssText = 'background:' + bgColor + ';color:' + textColor + ';border-radius:12px;padding:25px;max-width:90%;';
        modalContent.innerHTML = '<div class="modal-header" style="text-align:center;margin-bottom:20px;"><h2 style="margin:0 0 10px 0;color:#dc3545;">' + (isEn() ? 'Delete Confirmation' : '删除确认') + '</h2><p style="color:' + secondaryTextColor + ';margin:0;">' + (isEn() ? 'Please confirm you want to delete this history version' : '请确认是否要删除此历史版本') + '</p></div><div style="margin:15px 0;">' + (isEn() ? 'File: ' : '文件：') + global.escapeHtml(filename) + '</div><div style="display:flex;gap:10px;justify-content:center;margin-top:25px;"><button class="delete-confirm-cancel" style="padding:10px 24px;background:' + (nightMode ? '#555' : '#6c757d') + ';color:white;border:none;border-radius:6px;cursor:pointer;">' + (isEn() ? 'Cancel' : '取消') + '</button><button class="delete-confirm-ok" style="padding:10px 24px;background:#dc3545;color:white;border:none;border-radius:6px;cursor:pointer;">' + (isEn() ? 'Confirm Delete' : '确认删除') + '</button></div>';
        confirmModal.appendChild(modalContent);
        document.body.appendChild(confirmModal);
        var cancelBtn = modalContent.querySelector('.delete-confirm-cancel');
        var confirmBtn = modalContent.querySelector('.delete-confirm-ok');
        cancelBtn.onclick = function() { global.removeModal(confirmModal); };
        confirmBtn.onclick = function() {
            confirmBtn.disabled = true;
            confirmBtn.textContent = isEn() ? 'Deleting...' : '删除中...';
            performDeleteHistory(filename, versionId, historyId, fileId, confirmModal);
        };
        confirmModal.addEventListener('click', function(e) { if (e.target === confirmModal) global.removeModal(confirmModal); });
        var handleKeydown = function(e) { if (e.key === 'Escape') { global.removeModal(confirmModal); document.removeEventListener('keydown', handleKeydown); } };
        document.addEventListener('keydown', handleKeydown);
        confirmModal.removeKeydownHandler = function() { document.removeEventListener('keydown', handleKeydown); };
    }

    async function performDeleteHistory(filename, versionId, historyId, fileId, modalElement) {
        try {
            var success = await deleteHistoryVersionAPI(filename, versionId);
            if (success) {
                global.removeModal(modalElement);
                global.showMessage((isEn() ? 'History version ' : '历史版本 ') + versionId + (isEn() ? ' deleted' : ' 已删除'), 'success');
                var historyModal = document.getElementById('historyModalOverlay');
                if (historyModal) historyModal.classList.remove('show');
                setTimeout(function() { global.showHistoryModal(fileId, filename); }, 1000);
            } else throw new Error(isEn() ? 'Delete failed' : '删除失败');
        } catch (error) {
            console.error('删除历史版本失败', error);
            global.showMessage((isEn() ? 'Delete failed: ' : '删除失败: ') + error.message, 'error');
        }
    }

    function deleteHistoryVersion(filename, versionId, historyId, fileId) {
        showDeleteConfirmModal(filename, versionId, historyId, fileId);
    }

    /**
     * 导入本地文件到文件列表（支持 markdown/pdf/word/excel/powerpoint）
     */
    global.importFiles = function() {
        var nightMode = g('nightMode') === true;
        var bg = nightMode ? '#2d2d2d' : 'white';
        var textColor = nightMode ? '#eee' : '#333';
        var subColor = nightMode ? '#aaa' : '#666';
        var borderColor = nightMode ? '#444' : '#ddd';

        var modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:10001;';

        var container = document.createElement('div');
        container.style.cssText = 'background:' + bg + ';color:' + textColor + ';border-radius:12px;padding:20px;width:92%;max-width:460px;';

        var currentFolder = '';
        if (g('currentFileId')) {
            var currentNode = g('files').find(function(f) { return f.id === g('currentFileId'); });
            if (currentNode && currentNode.type === 'file') {
                currentFolder = getParentPath(currentNode.name);
            }
        }

        var folderOptions = getAllFolderPaths().map(function(path) {
            var label = path || (isEn() ? 'Root' : '根目录');
            var selected = path === currentFolder ? ' selected' : '';
            return '<option value="' + global.escapeHtml(path) + '"' + selected + '>' + global.escapeHtml(label) + '</option>';
        }).join('');

        container.innerHTML =
            '<h3 style="margin:0 0 10px 0;">' + (isEn() ? 'Import Files' : '导入文件') + '</h3>' +
            '<div style="font-size:13px;color:' + subColor + ';margin-bottom:14px;">' +
                (isEn() ? 'Supported: markdown, PDF, Word, Excel, PowerPoint' : '支持格式：Markdown、PDF、Word、Excel、PowerPoint') +
                '<br>' +
                (isEn() ? 'PDF and Office files are converted by the backend.' : 'PDF 与 Office 文件将通过后端转换为 Markdown。') +
            '</div>' +
            '<label style="display:block;margin-bottom:6px;font-weight:600;">' + (isEn() ? 'Save Path' : '保存路径') + '</label>' +
            '<select id="importTargetFolder" style="width:100%;padding:10px;border:1px solid ' + borderColor + ';border-radius:8px;background:' + (nightMode ? '#3d3d3d' : '#fff') + ';color:' + textColor + ';margin-bottom:16px;">' +
                folderOptions +
            '</select>' +
            '<div style="display:flex;gap:10px;">' +
                '<button id="importCancelBtn" style="flex:1;padding:10px;border:1px solid ' + borderColor + ';border-radius:8px;background:transparent;color:' + textColor + ';cursor:pointer;">' + (isEn() ? 'Cancel' : '取消') + '</button>' +
                '<button id="importChooseBtn" style="flex:1;padding:10px;border:none;border-radius:8px;background:#4a90e2;color:#fff;cursor:pointer;">' + (isEn() ? 'Choose Files' : '选择文件') + '</button>' +
            '</div>';

        modal.appendChild(container);
        document.body.appendChild(modal);

        var cancelBtn = container.querySelector('#importCancelBtn');
        var chooseBtn = container.querySelector('#importChooseBtn');
        var folderSelect = container.querySelector('#importTargetFolder');

        cancelBtn.onclick = function() {
            if (modal.parentNode) modal.parentNode.removeChild(modal);
        };

        modal.addEventListener('click', function(e) {
            if (e.target === modal && modal.parentNode) {
                modal.parentNode.removeChild(modal);
            }
        });

        chooseBtn.onclick = function() {
            var targetFolder = normalizePath(folderSelect.value || '');
            if (modal.parentNode) modal.parentNode.removeChild(modal);
            pickAndImportFiles(targetFolder);
        };
    };

    function pickAndImportFiles(targetFolder) {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.multiple = true;
        fileInput.accept = '.md,.markdown,.txt,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,text/markdown,text/plain,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

        fileInput.addEventListener('change', async function(e) {
            const files = Array.from(e.target.files || []);
            if (files.length === 0) {
                fileInput.remove();
                return;
            }

            global.showMessage((isEn() ? `Importing ${files.length} files...` : `正在导入 ${files.length} 个文件...`), 'info');

            let importedCount = 0;
            let skippedCount = 0;
            const newFiles = [];
            const existingNames = new Set(g('files').map(function(f) { return f.name; }));

            for (const file of files) {
                try {
                    let content;
                    // 检查文件大小，如果是大文档，使用上传接口
                    if (file.size > 100000 && /\.(md|markdown|txt)$/i.test(file.name)) { // 100KB 作为大文档的标准
                        if (typeof global.uploadFiles === 'function') {
                            try {
                                // 上传文件并获取链接
                                const markdownLink = await global.uploadFiles([file], false);
                                // 返回一个特殊标记，指示这是一个上传的大文档
                                content = `[${file.name}](${markdownLink})`;
                            } catch (error) {
                                console.error('上传大文档失败:', error);
                                // 上传失败时，回退到直接读取
                                content = await convertImportedFileToMarkdown(file);
                            }
                        } else {
                            // 如果 uploadFiles 函数不可用，回退到直接读取
                            content = await convertImportedFileToMarkdown(file);
                        }
                    } else {
                        // 小文档直接读取
                        content = await convertImportedFileToMarkdown(file);
                    }
                    const importName = buildImportedFilePath(file.name, targetFolder, existingNames);

                    const newFile = {
                        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                        name: importName,
                        type: 'file',
                        content: content,
                        lastModified: Date.now(),
                        isSynced: false
                    };

                    newFiles.push(newFile);
                    existingNames.add(importName);
                    importedCount++;
                } catch (error) {
                    console.error('读取文件失败:', file.name, error);
                    global.showMessage((isEn() ? 'Failed to import file ' : '导入文件失败 ') + file.name + ': ' + error.message, 'error');
                    skippedCount++;
                }
            }

            if (newFiles.length > 0) {
                newFiles.forEach(function(f) { ensureParentFolders(f.name); });
                g('files').push.apply(g('files'), newFiles);
                localStorage.setItem('vditor_files', JSON.stringify(g('files')));

                newFiles.forEach(function(file) {
                    g('lastSyncedContent')[file.id] = file.content;
                    g('unsavedChanges')[file.id] = false;
                });

                loadFiles();
                openFile(newFiles[0].id);

                if (g('currentUser')) {
                    for (const file of newFiles) {
                        try {
                            await global.syncFileToServer(file.id);
                        } catch (syncError) {
                            console.warn('同步文件失败:', file.name, syncError);
                        }
                    }
                }

                global.showMessage((isEn() ? `Successfully imported ${importedCount} file${importedCount !== 1 ? 's' : ''}${skippedCount > 0 ? `, skipped ${skippedCount}` : ''}` : `成功导入 ${importedCount} 个文件${skippedCount > 0 ? `，跳过 ${skippedCount} 个` : ''}`), 'success');
            } else {
                global.showMessage(isEn() ? 'No files imported' : '没有导入任何文件', 'warning');
            }

            fileInput.remove();
        });

        fileInput.click();
    }

    function stripKnownExtension(fileName) {
        return fileName
            .replace(/\.(md|markdown|txt|pdf|doc|docx|ppt|pptx|xls|xlsx)$/i, '')
            .trim();
    }

    function buildImportedFilePath(originalFileName, targetFolder, existingNames) {
        var base = normalizePath(stripKnownExtension(originalFileName));
        if (!base) {
            base = isEn() ? 'imported-file' : '导入文件';
        }
        var fullPath = targetFolder ? (targetFolder + '/' + base) : base;
        var candidate = fullPath;
        var index = 2;
        while (existingNames.has(candidate)) {
            candidate = fullPath + '-' + index;
            index++;
        }
        return candidate;
    }

    async function convertImportedFileToMarkdown(file) {
        var lowerName = (file.name || '').toLowerCase();
        if (/\.(md|markdown|txt)$/i.test(lowerName)) {
            return await readFileAsText(file);
        }

        if (/\.(pdf|doc|docx|ppt|pptx|xls|xlsx)$/i.test(lowerName)) {
            return await convertImportedFileWithBackend(file);
        }

        throw new Error(isEn() ? 'Unsupported file type' : '不支持的文件类型');
    }

    async function convertImportedFileWithBackend(file) {
        try {
            return await requestBackendImport(file);
        } catch (error) {
            var lowerName = (file.name || '').toLowerCase();
            if (/\.docx$/i.test(lowerName)) {
                console.warn('后端 DOCX 导入失败，回退到本地解析:', error);
                return await convertDocxToMarkdown(file);
            }
            if (/\.pptx$/i.test(lowerName)) {
                console.warn('后端 PPTX 导入失败，回退到本地解析:', error);
                return await convertPptxToMarkdown(file);
            }
            if (/\.(xls|xlsx)$/i.test(lowerName)) {
                console.warn('后端 Excel 导入失败，回退到本地解析:', error);
                return await convertXlsToMarkdown(file);
            }
            throw error;
        }
    }

    async function requestBackendImport(file) {
        const api = global.getApiBaseUrl ? global.getApiBaseUrl() : 'api';
        const apiUrl = api.replace(/\/$/, '') + '/import/markitdown';
        const formData = new FormData();
        formData.append('file', file, file.name);

        const user = g('currentUser');
        if (user && user.username) {
            formData.append('username', user.username);
            if (user.token) formData.append('token', user.token);
            if (user.password) formData.append('password', user.password);
        }

        const response = await fetch(apiUrl, {
            method: 'POST',
            body: formData
        });
        const result = global.parseJsonResponse ? await global.parseJsonResponse(response) : await response.json();
        if (!response.ok || !result || result.code !== 200) {
            throw new Error((result && result.message) || (isEn() ? 'Backend import failed' : '后端导入失败'));
        }

        const markdown = result.data && result.data.markdown;
        if (!markdown || !String(markdown).trim()) {
            throw new Error(isEn() ? 'No content extracted from file' : '未从文件中提取到内容');
        }
        return markdown;
    }

    async function convertDocxToMarkdown(file) {
        const mammothModule = await import('mammoth');
        const mammoth = mammothModule.default || mammothModule;
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer: arrayBuffer });
        const text = (result.value || '').trim();
        if (!text) {
            throw new Error(isEn() ? 'The DOCX file appears to be empty' : 'DOCX 文件内容为空');
        }
        return text;
    }

    async function convertPptxToMarkdown(file) {
        const jszipModule = await import('jszip');
        const JSZip = jszipModule.default || jszipModule;
        const zip = await JSZip.loadAsync(await file.arrayBuffer());
        const slideFiles = Object.keys(zip.files)
            .filter(function(name) { return /^ppt\/slides\/slide\d+\.xml$/i.test(name); })
            .sort(function(a, b) {
                var ai = parseInt((a.match(/slide(\d+)\.xml/i) || [0, 0])[1], 10);
                var bi = parseInt((b.match(/slide(\d+)\.xml/i) || [0, 0])[1], 10);
                return ai - bi;
            });

        if (slideFiles.length === 0) {
            throw new Error(isEn() ? 'No readable slides found in PPTX' : 'PPTX 中未找到可读取页面');
        }

        var lines = ['# ' + stripKnownExtension(file.name)];
        for (var i = 0; i < slideFiles.length; i++) {
            var xml = await zip.file(slideFiles[i]).async('text');
            var textList = extractPptxTextNodes(xml);
            lines.push('');
            lines.push('## ' + (isEn() ? 'Slide' : '第') + ' ' + (i + 1) + (isEn() ? '' : ' 页'));
            if (textList.length === 0) {
                lines.push('- ' + (isEn() ? '(No text content)' : '（无文本内容）'));
            } else {
                textList.forEach(function(item) {
                    lines.push('- ' + item);
                });
            }
        }
        return lines.join('\n');
    }

    function extractPptxTextNodes(xml) {
        var values = [];
        var reg = /<a:t>([\s\S]*?)<\/a:t>/g;
        var match;
        while ((match = reg.exec(xml)) !== null) {
            var raw = match[1] || '';
            var text = raw
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&quot;/g, '"')
                .replace(/&#39;/g, "'")
                .replace(/\s+/g, ' ')
                .trim();
            if (text) values.push(text);
        }
        return values;
    }

    async function convertXlsToMarkdown(file) {
        const xlsxModule = await import('xlsx');
        const XLSX = xlsxModule.default || xlsxModule;
        const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
        if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
            throw new Error(isEn() ? 'No readable sheet found' : '未找到可读取工作表');
        }

        var mdParts = ['# ' + stripKnownExtension(file.name)];
        workbook.SheetNames.forEach(function(sheetName) {
            var sheet = workbook.Sheets[sheetName];
            var rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false });
            mdParts.push('');
            mdParts.push('## ' + sheetName);

            if (!rows || rows.length === 0) {
                mdParts.push(isEn() ? '(Empty sheet)' : '（空工作表）');
                return;
            }

            var maxCols = rows.reduce(function(max, row) {
                return Math.max(max, (row || []).length);
            }, 0);
            if (maxCols === 0) {
                mdParts.push(isEn() ? '(Empty sheet)' : '（空工作表）');
                return;
            }

            var headerRow = (rows[0] || []).slice();
            while (headerRow.length < maxCols) headerRow.push('');
            headerRow = headerRow.map(function(cell, idx) {
                var text = String(cell == null ? '' : cell).trim();
                return text || ((isEn() ? 'Column ' : '列') + (idx + 1));
            });

            mdParts.push('| ' + headerRow.join(' | ') + ' |');
            mdParts.push('| ' + headerRow.map(function() { return '---'; }).join(' | ') + ' |');

            var dataRows = rows.slice(1);
            if (dataRows.length === 0) {
                var emptyRow = new Array(maxCols).fill('');
                mdParts.push('| ' + emptyRow.join(' | ') + ' |');
                return;
            }

            dataRows.forEach(function(row) {
                var normalized = (row || []).slice();
                while (normalized.length < maxCols) normalized.push('');
                var escaped = normalized.map(function(cell) {
                    return String(cell == null ? '' : cell).replace(/\|/g, '\\|').replace(/\n/g, ' ');
                });
                mdParts.push('| ' + escaped.join(' | ') + ' |');
            });
        });

        return mdParts.join('\n');
    }

    function readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(new Error(isEn() ? 'Failed to read file' : '读取文件失败'));
            reader.readAsText(file);
        });
    }

    // ========== 文件对比功能 ==========

    /**
     * 显示文件对比对话框
     */
    async function showFileDiffDialog() {
        // 先保存当前文档
        if (typeof global.saveCurrentFile === 'function' && g('currentFileId')) {
            await global.saveCurrentFile(true);
        }

        const currentFileId = g('currentFileId');
        if (!currentFileId) {
            global.showMessage(isEn() ? 'Please open a file first' : '请先打开一个文件', 'warning');
            return;
        }

        const currentFile = g('files').find(f => f.id === currentFileId && f.type === 'file');
        if (!currentFile) {
            global.showMessage(isEn() ? 'Current file not found' : '当前文件不存在', 'error');
            return;
        }

        const nightMode = g('nightMode') === true;
        const bgColor = nightMode ? '#2d2d2d' : 'white';
        const textColor = nightMode ? '#eee' : '#333';
        const secondaryTextColor = nightMode ? '#aaa' : '#666';
        const borderColor = nightMode ? '#444' : '#ddd';
        const inputBg = nightMode ? '#3d3d3d' : '#f5f5f5';

        // 创建模态框
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.id = 'fileDiffSelectModal';
        modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:10001;';

        const modalContent = document.createElement('div');
        modalContent.style.cssText = 'background:' + bgColor + ';color:' + textColor + ';border-radius:12px;padding:25px;max-width:90%;width:400px;max-height:80vh;display:flex;flex-direction:column;';

        // 获取所有可对比的文件（排除当前文件和.开头的隐藏文件）
        const otherFiles = g('files').filter(f => f.id !== currentFileId && f.type === 'file' && !f.name.startsWith('.'));

        // 格式化日期函数
        function formatDate(dateValue) {
            if (!dateValue) return '';
            try {
                const date = new Date(dateValue);
                if (isNaN(date.getTime())) return '';
                return date.toLocaleString();
            } catch (e) {
                return '';
            }
        }

        let fileListHtml = '';
        if (otherFiles.length === 0) {
            fileListHtml = '<div style="padding:20px;text-align:center;color:' + secondaryTextColor + ';">' + (isEn() ? 'No other files available' : '没有其他文件可对比') + '</div>';
        } else {
            fileListHtml = '<div style="max-height:300px;overflow-y:auto;border:1px solid ' + borderColor + ';border-radius:6px;margin:10px 0;">';
            otherFiles.forEach(file => {
                const dateStr = formatDate(file.updatedAt || file.createdAt);
                fileListHtml += '<div class="diff-file-item" data-file-id="' + file.id + '" style="padding:12px 15px;cursor:pointer;border-bottom:1px solid ' + borderColor + ';transition:background 0.2s;">' +
                    '<div style="font-weight:500;">' + global.escapeHtml(file.name) + '</div>' +
                    (dateStr ? '<div style="font-size:12px;color:' + secondaryTextColor + ';margin-top:3px;">' + dateStr + '</div>' : '') +
                    '</div>';
            });
            fileListHtml += '</div>';
        }

        modalContent.innerHTML =
            '<div style="margin-bottom:15px;">' +
                '<h3 style="margin:0 0 5px 0;">' + (isEn() ? 'Select File to Compare' : '选择要对比的文件') + '</h3>' +
                '<div style="font-size:13px;color:' + secondaryTextColor + ';">' +
                    (isEn() ? 'Current: ' : '当前文件：') + '<strong>' + global.escapeHtml(currentFile.name) + '</strong>' +
                '</div>' +
            '</div>' +
            fileListHtml +
            '<div style="display:flex;gap:10px;justify-content:flex-end;margin-top:15px;">' +
                '<button id="cancelFileDiffBtn" style="padding:8px 16px;background:' + (nightMode ? '#555' : '#6c757d') + ';color:white;border:none;border-radius:6px;cursor:pointer;">' + (isEn() ? 'Cancel' : '取消') + '</button>' +
            '</div>';

        modal.appendChild(modalContent);
        document.body.appendChild(modal);

        // 绑定取消按钮
        const cancelBtn = modalContent.querySelector('#cancelFileDiffBtn');
        if (cancelBtn) {
            cancelBtn.onclick = function() {
                global.removeModal(modal);
            };
        }

        // 绑定文件选择事件
        const fileItems = modalContent.querySelectorAll('.diff-file-item');
        fileItems.forEach(item => {
            item.onclick = function() {
                const selectedFileId = this.getAttribute('data-file-id');
                const selectedFile = g('files').find(f => f.id === selectedFileId);
                if (selectedFile) {
                    global.removeModal(modal);
                    showFileDiffComparison(currentFile, selectedFile);
                }
            };

            // 添加悬停效果
            item.onmouseenter = function() {
                this.style.background = nightMode ? '#4a4a4a' : '#f0f0f0';
            };
            item.onmouseleave = function() {
                this.style.background = 'transparent';
            };
        });

        // 点击外部关闭
        modal.onclick = function(e) {
            if (e.target === modal) {
                global.removeModal(modal);
            }
        };

        // ESC键关闭
        const handleEsc = function(e) {
            if (e.key === 'Escape') {
                global.removeModal(modal);
                document.removeEventListener('keydown', handleEsc);
            }
        };
        document.addEventListener('keydown', handleEsc);
    }

    /**
     * 显示两个文件的差异对比
     */
    function showFileDiffComparison(file1, file2) {
        const nightMode = g('nightMode') === true;

        // 获取文件内容
        const content1 = file1.content || '';
        const content2 = file2.content || '';

        // 计算差异
        const diffResult = computeDiff(content1, content2);

        // 创建差异对比模态框（复用现有样式）
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.id = 'fileDiffResultModal';
        modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;z-index:10002;';

        const modalContent = document.createElement('div');
        modalContent.style.cssText = 'background:' + (nightMode ? '#2d2d2d' : 'white') + ';color:' + (nightMode ? '#eee' : '#333') + ';border-radius:8px;width:95vw;height:90vh;display:flex;flex-direction:column;overflow:hidden;';

        const headerHtml =
            '<div style="padding:15px 20px;border-bottom:1px solid ' + (nightMode ? '#444' : '#eee') + ';display:flex;justify-content:space-between;align-items:center;flex-shrink:0;">' +
                '<div>' +
                    '<h3 style="margin:0;">' + (isEn() ? 'File Diff Comparison' : '文件差异对比') + '</h3>' +
                    '<div style="font-size:12px;color:' + (nightMode ? '#aaa' : '#666') + ';margin-top:5px;">' +
                        global.escapeHtml(file1.name) + ' ↔ ' + global.escapeHtml(file2.name) +
                    '</div>' +
                '</div>' +
                '<button id="closeFileDiffResultBtn" style="background:none;border:none;font-size:24px;cursor:pointer;color:' + (nightMode ? '#eee' : '#333') + ';">×</button>' +
            '</div>' +
            '<div style="padding:10px 20px;background:' + (nightMode ? '#3d3d3d' : '#f8f9fa') + ';font-size:13px;color:' + (nightMode ? '#aaa' : '#666') + ';flex-shrink:0;">' +
                '<i class="fas fa-info-circle"></i> ' + (isEn() ? 'Showing differences only (unchanged lines are folded)' : '仅显示差异（相同内容已自动折叠）') +
            '</div>' +
            '<div style="display:flex;padding:10px 20px;background:' + (nightMode ? '#363636' : '#f0f0f0') + ';border-bottom:1px solid ' + (nightMode ? '#444' : '#ddd') + ';flex-shrink:0;">' +
                '<div style="flex:1;font-weight:500;text-align:center;">' + (isEn() ? 'Current: ' : '当前：') + global.escapeHtml(file1.name) + '</div>' +
                '<div style="flex:1;font-weight:500;text-align:center;">' + (isEn() ? 'Compare: ' : '对比：') + global.escapeHtml(file2.name) + '</div>' +
            '</div>';

        const diffHtml = renderDiffView(diffResult, { collapseSame: true });

        modalContent.innerHTML = headerHtml +
            '<div id="fileDiffResultContent" style="flex:1;overflow:auto;padding:0;">' +
                '<div style="display:flex;min-width:100%;">' +
                    '<div style="flex:1;">' + diffHtml + '</div>' +
                '</div>' +
            '</div>';

        modal.appendChild(modalContent);
        document.body.appendChild(modal);

        const fileDiffScroll = modalContent.querySelector('#fileDiffResultContent');
        if (fileDiffScroll) {
            bindCollapsedDiffInteractions(fileDiffScroll);
        }

        // 绑定关闭按钮
        const closeBtn = modalContent.querySelector('#closeFileDiffResultBtn');
        if (closeBtn) {
            closeBtn.onclick = function() {
                global.removeModal(modal);
            };
        }

        // 点击外部关闭
        modal.onclick = function(e) {
            if (e.target === modal) {
                global.removeModal(modal);
            }
        };

        // ESC键关闭
        const handleEsc = function(e) {
            if (e.key === 'Escape') {
                global.removeModal(modal);
                document.removeEventListener('keydown', handleEsc);
            }
        };
        document.addEventListener('keydown', handleEsc);
    }

    // ========== 全文查找功能 ==========

    /**
     * 显示全文查找对话框
     */
    async function showFindDialog() {
        // 先保存当前文档
        if (typeof global.saveCurrentFile === 'function' && g('currentFileId')) {
            await global.saveCurrentFile(true);
        }

        const nightMode = g('nightMode') === true;
        const bgColor = nightMode ? '#2d2d2d' : 'white';
        const textColor = nightMode ? '#eee' : '#333';
        const secondaryTextColor = nightMode ? '#aaa' : '#666';
        const borderColor = nightMode ? '#444' : '#ddd';
        const inputBg = nightMode ? '#3d3d3d' : '#f5f5f5';
        const isCompactMobile = window.innerWidth <= 768;
        const dialogTop = isCompactMobile ? 58 : 72;
        const dialogRight = isCompactMobile ? 10 : 24;
        const dialogWidth = isCompactMobile ? 'min(94vw, 320px)' : '336px';
        const dialogPadding = isCompactMobile ? '12px' : '14px';
        const titleSize = isCompactMobile ? '14px' : '15px';
        const baseFontSize = isCompactMobile ? '12px' : '13px';
        const statusFontSize = isCompactMobile ? '11px' : '12px';
        const inputPadding = isCompactMobile ? '7px 10px' : '8px 10px';
        const buttonPadding = isCompactMobile ? '5px 10px' : '6px 10px';
        const sectionGap = isCompactMobile ? '8px' : '10px';
        const compactRadius = isCompactMobile ? '5px' : '6px';
        const wasmResultMaxHeight = isCompactMobile ? '130px' : '160px';
        // 如果已存在查找框，先移除
        const existingModal = document.getElementById('findDialogModal');
        if (existingModal) {
            existingModal.remove();
        }
        // 仅窗口本身使用半透明蒙版效果，不遮挡整个页面
        const dialog = document.createElement('div');
        dialog.id = 'findDialogModal';
        dialog.style.cssText = 'position:fixed;top:' + dialogTop + 'px;right:' + dialogRight + 'px;background:' + (nightMode ? 'rgba(45,45,45,0.92)' : 'rgba(255,255,255,0.9)') + ';color:' + textColor + ';border-radius:10px;padding:' + dialogPadding + ';width:' + dialogWidth + ';max-height:78vh;overflow:auto;box-shadow:0 6px 22px rgba(0,0,0,0.24);z-index:10001;border:1px solid ' + borderColor + ';display:flex;flex-direction:column;';
        dialog.innerHTML =
            '<div id="findDialogHeader" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:' + sectionGap + ';cursor:move;user-select:none;touch-action:none;">' +
                '<h3 style="margin:0;font-size:' + titleSize + ';">' + (isEn() ? 'Find and Replace' : '查找和替换') + '</h3>' +
                '<button id="closeFindBtn" style="background:none;border:none;font-size:18px;cursor:pointer;color:' + secondaryTextColor + ';padding:0;line-height:1;">&times;</button>' +
            '</div>' +
            '<div style="margin-bottom:' + sectionGap + ';display:flex;align-items:center;gap:6px;">' +
                '<button id="toggleReplaceBtn" style="background:none;border:none;cursor:pointer;color:' + secondaryTextColor + ';padding:2px;font-size:13px;transition:transform 0.2s;">' +
                    '<i class="fas fa-chevron-right" id="toggleReplaceIcon"></i>' +
                '</button>' +
                '<input type="text" id="findInput" placeholder="' + (isEn() ? 'Enter search text...' : '输入查找内容...') + '" ' +
                    'style="flex:1;padding:' + inputPadding + ';border:1px solid ' + borderColor + ';border-radius:' + compactRadius + ';font-size:' + baseFontSize + ';background:' + inputBg + ';color:' + textColor + ';box-sizing:border-box;outline:none;">' +
            '</div>' +
            '<div id="replaceContainer" style="margin-bottom:' + sectionGap + ';display:none;">' +
                '<input type="text" id="replaceInput" placeholder="' + (isEn() ? 'Enter replacement...' : '输入替换内容...') + '" ' +
                    'style="width:100%;padding:' + inputPadding + ';border:1px solid ' + borderColor + ';border-radius:' + compactRadius + ';font-size:' + baseFontSize + ';background:' + inputBg + ';color:' + textColor + ';box-sizing:border-box;outline:none;">' +
            '</div>' +
            '<div id="replaceButtonsContainer" style="display:flex;flex-wrap:wrap;gap:6px;justify-content:flex-end;margin-bottom:' + sectionGap + ';display:none;">' +
                '<button id="replaceBtn" style="padding:' + buttonPadding + ';background:' + (nightMode ? '#3d3d3d' : '#f0f0f0') + ';color:' + textColor + ';border:1px solid ' + borderColor + ';border-radius:' + compactRadius + ';cursor:pointer;font-size:12px;">' + (isEn() ? 'Replace' : '替换') + '</button>' +
                '<button id="replaceAllBtn" style="padding:' + buttonPadding + ';background:' + (nightMode ? '#3d3d3d' : '#f0f0f0') + ';color:' + textColor + ';border:1px solid ' + borderColor + ';border-radius:' + compactRadius + ';cursor:pointer;font-size:12px;">' + (isEn() ? 'Replace All' : '全部替换') + '</button>' +
            '</div>' +
            '<div style="display:flex;flex-wrap:wrap;gap:6px;justify-content:flex-end;margin-bottom:' + sectionGap + ';">' +
                '<button id="findBtn" style="padding:' + buttonPadding + ';background:' + (nightMode ? '#4a90e2' : '#4a90e2') + ';color:white;border:none;border-radius:' + compactRadius + ';cursor:pointer;font-size:12px;">' + (isEn() ? 'Find' : '查找') + '</button>' +
                '<button id="findPrevBtn" style="padding:' + buttonPadding + ';background:' + (nightMode ? '#4a90e2' : '#4a90e2') + ';color:white;border:none;border-radius:' + compactRadius + ';cursor:pointer;font-size:12px;">' + (isEn() ? 'Prev' : '上一个') + '</button>' +
                '<button id="findNextBtn" style="padding:' + buttonPadding + ';background:' + (nightMode ? '#4a90e2' : '#4a90e2') + ';color:white;border:none;border-radius:' + compactRadius + ';cursor:pointer;font-size:12px;">' + (isEn() ? 'Next' : '下一个') + '</button>' +
            '</div>' +
            '<div id="findStatus" style="font-size:' + statusFontSize + ';color:' + secondaryTextColor + ';"></div>' +
            '<div id="wasmSearchPanel" style="margin-top:' + sectionGap + ';border-top:1px solid ' + borderColor + ';padding-top:' + sectionGap + ';display:none;">' +
                '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">' +
                    '<span style="font-size:' + statusFontSize + ';color:' + secondaryTextColor + ';">' + (isEn() ? 'Cross-file search' : '跨文件搜索') + '</span>' +
                    '<div style="display:flex;align-items:center;gap:6px;">' +
                        '<button id="toggleCrossSearchBtn" style="padding:4px 8px;background:none;color:' + secondaryTextColor + ';border:1px solid ' + borderColor + ';border-radius:' + compactRadius + ';cursor:pointer;font-size:12px;">' + (isEn() ? 'Collapse' : '收起') + '</button>' +
                        '<button id="wasmSearchBtn" style="padding:4px 10px;background:' + (nightMode ? '#3d3d3d' : '#f0f0f0') + ';color:' + textColor + ';border:1px solid ' + borderColor + ';border-radius:' + compactRadius + ';cursor:pointer;font-size:12px;">' + (isEn() ? 'Search Files' : '搜索文件') + '</button>' +
                    '</div>' +
                '</div>' +
                '<div id="wasmSearchResults" style="max-height:' + wasmResultMaxHeight + ';overflow:auto;font-size:' + statusFontSize + ';"></div>' +
            '</div>';
        document.body.appendChild(dialog);
        // 拖动逻辑（支持鼠标和触摸）
        const header = dialog.querySelector('#findDialogHeader');
        let isDragging = false;
        let startX, startY, startLeft, startTop;

        // 鼠标拖动
        header.addEventListener('mousedown', function(e) {
            if (e.target.id === 'closeFindBtn') return;
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            const rect = dialog.getBoundingClientRect();
            startLeft = rect.left;
            startTop = rect.top;
            document.body.style.userSelect = 'none';
        });

        document.addEventListener('mousemove', function(e) {
            if (!isDragging) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            let newLeft = startLeft + dx;
            let newTop = startTop + dy;
            newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - dialog.offsetWidth));
            newTop = Math.max(0, Math.min(newTop, window.innerHeight - dialog.offsetHeight));
            dialog.style.left = newLeft + 'px';
            dialog.style.top = newTop + 'px';
            dialog.style.right = 'auto';
        });

        document.addEventListener('mouseup', function() {
            if (isDragging) {
                isDragging = false;
                document.body.style.userSelect = '';
            }
        });

        // 触摸拖动（手机支持）
        header.addEventListener('touchstart', function(e) {
            if (e.target.id === 'closeFindBtn') return;
            isDragging = true;
            const touch = e.touches[0];
            startX = touch.clientX;
            startY = touch.clientY;
            const rect = dialog.getBoundingClientRect();
            startLeft = rect.left;
            startTop = rect.top;
            document.body.style.userSelect = 'none';
        }, { passive: false });

        document.addEventListener('touchmove', function(e) {
            if (!isDragging) return;
            e.preventDefault();
            const touch = e.touches[0];
            const dx = touch.clientX - startX;
            const dy = touch.clientY - startY;
            let newLeft = startLeft + dx;
            let newTop = startTop + dy;
            newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - dialog.offsetWidth));
            newTop = Math.max(0, Math.min(newTop, window.innerHeight - dialog.offsetHeight));
            dialog.style.left = newLeft + 'px';
            dialog.style.top = newTop + 'px';
            dialog.style.right = 'auto';
        }, { passive: false });

        document.addEventListener('touchend', function() {
            if (isDragging) {
                isDragging = false;
                document.body.style.userSelect = '';
            }
        });

        // 替换区域显示/隐藏控制
        const toggleReplaceBtn = dialog.querySelector('#toggleReplaceBtn');
        const toggleReplaceIcon = dialog.querySelector('#toggleReplaceIcon');
        const replaceContainer = dialog.querySelector('#replaceContainer');
        const replaceButtonsContainer = dialog.querySelector('#replaceButtonsContainer');
        let isReplaceVisible = false;

        toggleReplaceBtn.addEventListener('click', function() {
            isReplaceVisible = !isReplaceVisible;
            if (isReplaceVisible) {
                toggleReplaceIcon.style.transform = 'rotate(90deg)';
                replaceContainer.style.display = 'block';
                replaceButtonsContainer.style.display = 'flex';
            } else {
                toggleReplaceIcon.style.transform = 'rotate(0deg)';
                replaceContainer.style.display = 'none';
                replaceButtonsContainer.style.display = 'none';
            }
        });
        // 查找状态
        let matches = [];
        let currentMatchIndex = -1;
        let searchText = '';
        const findInput = dialog.querySelector('#findInput');
        const replaceInput = dialog.querySelector('#replaceInput');
        const findStatus = dialog.querySelector('#findStatus');
        const findBtn = dialog.querySelector('#findBtn');
        const findNextBtn = dialog.querySelector('#findNextBtn');
        const findPrevBtn = dialog.querySelector('#findPrevBtn');
        const replaceBtn = dialog.querySelector('#replaceBtn');
        const replaceAllBtn = dialog.querySelector('#replaceAllBtn');
        const closeBtn = dialog.querySelector('#closeFindBtn');
        const wasmSearchPanel = dialog.querySelector('#wasmSearchPanel');
        const wasmSearchBtn = dialog.querySelector('#wasmSearchBtn');
        const wasmSearchResults = dialog.querySelector('#wasmSearchResults');
        const toggleCrossSearchBtn = dialog.querySelector('#toggleCrossSearchBtn');
        let isCrossSearchCollapsed = false;
        let visibleMatches = [];
        let crossSearchLazyState = null;
        const CROSS_SEARCH_BATCH_SIZE = 50;
        const CROSS_SEARCH_PREFETCH_OFFSET = 180;
        const shouldAutoFocusFindInput = !/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

        const gateway = global.wasmTextEngineGateway;
        if (wasmSearchPanel) wasmSearchPanel.style.display = 'block';

        function getCurrentEditorText() {
            const currentFileId = g('currentFileId');
            const currentFile = (g('files') || []).find(function(file) {
                return file && file.id === currentFileId;
            });
            return getCurrentEditorContent(currentFileId, currentFile ? currentFile.content : '');
        }
        // 获取编辑器可搜索的DOM节点
        function getEditorElement() {
            if (isLongFileEditorActiveFor(g('currentFileId'))) {
                return document.getElementById('longFileTextarea');
            }

            const vditor = g('vditor');
            if (!vditor || !vditor.vditor) return null;
            const mode = vditor.vditor.currentMode || vditor.vditor.mode || vditor.vditor.currentOptions.mode;
            if (mode === 'wysiwyg' && vditor.vditor.wysiwyg) return vditor.vditor.wysiwyg.element;
            if (mode === 'ir' && vditor.vditor.ir) return vditor.vditor.ir.element;
            if (mode === 'sv' && vditor.vditor.sv) return vditor.vditor.sv.element;
            if (vditor.vditor.wysiwyg) return vditor.vditor.wysiwyg.element;
            if (vditor.vditor.ir) return vditor.vditor.ir.element;
            if (vditor.vditor.sv) return vditor.vditor.sv.element;
            return null;
        }
        // 桌面端保持打开后自动聚焦，移动端由用户手动点输入框唤起键盘
        if (shouldAutoFocusFindInput) {
            setTimeout(() => findInput.focus(), 100);
        }
        // 执行查找
        async function performFind(options) {
            searchText = findInput.value.trim();
            if (!searchText) {
                findStatus.textContent = '';
                clearHighlights();
                visibleMatches = [];
                crossSearchLazyState = null;
                if (wasmSearchResults) wasmSearchResults.innerHTML = '';
                return;
            }

            const readyRes = await gateway.ensureReady();
            if (!readyRes || readyRes.code !== 200) {
                throw new Error((readyRes && readyRes.message) || (isEn() ? 'WASM search unavailable' : 'WASM 搜索不可用'));
            }
            const res = gateway.findInText(getCurrentEditorText(), searchText, { caseSensitive: false });
            matches = (res && res.code === 200 && res.data && Array.isArray(res.data.matches)) ? res.data.matches : [];
            if (matches.length === 0) {
                findStatus.textContent = isEn() ? 'No matches found' : '未找到匹配内容';
                findStatus.style.color = '#dc3545';
            } else {
                findStatus.textContent = (isEn() ? 'Found ' : '找到 ') + matches.length + (isEn() ? ' matches' : ' 个匹配');
                findStatus.style.color = secondaryTextColor;
                if (currentMatchIndex < 0 || currentMatchIndex >= matches.length) {
                    currentMatchIndex = 0;
                }
                visibleMatches = [];
                highlightMatch(currentMatchIndex, true, options);
            }
        }

        function normalizeSearchText(text) {
            return String(text || '').toLocaleLowerCase();
        }

        function findMatchesInVisibleText(keyword) {
            const editorElement = getEditorElement();
            if (!editorElement) return [];

            const originalText = editorElement.tagName === 'TEXTAREA'
                ? (editorElement.value || '')
                : (editorElement.textContent || '');
            const needle = String(keyword || '');
            if (!needle) return [];

            const source = normalizeSearchText(originalText);
            const target = normalizeSearchText(needle);
            const out = [];
            let cursor = 0;

            while (cursor <= source.length) {
                const idx = source.indexOf(target, cursor);
                if (idx === -1) break;
                out.push({ start: idx, end: idx + needle.length });
                cursor = idx + Math.max(1, needle.length);
            }
            return out;
        }

        function pickVisibleMatch(index, candidateMatches) {
            if (!Array.isArray(candidateMatches) || candidateMatches.length === 0) return null;
            if (candidateMatches.length === matches.length && index >= 0 && index < candidateMatches.length) {
                return candidateMatches[index];
            }

            const sourceHit = matches[index];
            const sourceTextLength = Math.max(1, getCurrentEditorText().length);
            const editorElement = getEditorElement();
            const visibleTextLength = Math.max(1, editorElement && editorElement.textContent ? editorElement.textContent.length : sourceTextLength);
            const sourceStart = sourceHit ? Math.max(0, Number(sourceHit.start) || 0) : 0;
            const expectedPos = Math.round((sourceStart / sourceTextLength) * visibleTextLength);
            const estimatedIndex = Math.max(0, Math.min(
                candidateMatches.length - 1,
                Math.round((Math.max(0, index) / Math.max(1, matches.length - 1)) * Math.max(0, candidateMatches.length - 1))
            ));

            let bestMatch = candidateMatches[estimatedIndex];
            let bestDistance = Math.abs((bestMatch && bestMatch.start) - expectedPos);
            const from = Math.max(0, estimatedIndex - 8);
            const to = Math.min(candidateMatches.length - 1, estimatedIndex + 8);
            for (let i = from; i <= to; i++) {
                const distance = Math.abs((candidateMatches[i] && candidateMatches[i].start) - expectedPos);
                if (distance < bestDistance) {
                    bestDistance = distance;
                    bestMatch = candidateMatches[i];
                }
            }

            return bestMatch || candidateMatches[0];
        }

        function setSelectionForMatch(index) {
            const candidateMatches = findMatchesInVisibleText(searchText);
            visibleMatches = candidateMatches;

            const visibleHit = pickVisibleMatch(index, candidateMatches);
            if (visibleHit) {
                const mappedRange = setSelectionByVisibleRange(visibleHit.start, visibleHit.end);
                if (mappedRange) return mappedRange;
            }

            const sourceHit = matches[index];
            if (!sourceHit) return null;
            return setSelectionByVisibleRange(sourceHit.start, sourceHit.end);
        }

        function computeCrossSearchTotalMatches(rows) {
            return rows.reduce(function(sum, item) {
                const hits = Array.isArray(item && item.hits) ? item.hits.length : 0;
                const count = hits || (Number(item && item.matchCount) || 0);
                return sum + count;
            }, 0);
        }

        function flattenCrossSearchHits(rows) {
            const flattened = [];
            rows.forEach(function(item) {
                const fileHits = Array.isArray(item && item.hits) ? item.hits : [];
                const fileMatchCount = fileHits.length || (Number(item && item.matchCount) || 0);
                fileHits.forEach(function(hit) {
                    flattened.push({
                        docId: String(item && item.docId || ''),
                        filename: item && item.filename ? item.filename : '',
                        fileMatchCount: fileMatchCount,
                        start: Number(hit && hit.start) || 0,
                        end: Number(hit && hit.end) || 0,
                        snippet: hit && hit.snippet ? hit.snippet : ''
                    });
                });
            });
            return flattened;
        }

        function updateCrossSearchLoadStatus() {
            if (!crossSearchLazyState || !crossSearchLazyState.statusEl) return;

            const loaded = crossSearchLazyState.renderedCount || 0;
            const total = Array.isArray(crossSearchLazyState.flatHits) ? crossSearchLazyState.flatHits.length : 0;

            if (loaded >= total) {
                crossSearchLazyState.statusEl.textContent = isEn() ? 'All results loaded' : '已加载全部结果';
                return;
            }

            crossSearchLazyState.statusEl.textContent = (isEn() ? 'Loaded ' : '已加载 ') +
                loaded + ' / ' + total +
                (isEn() ? ' results, scroll down to load more' : ' 条结果，向下滚动继续加载');
        }

        function appendCrossSearchBatch(batchSize) {
            if (!crossSearchLazyState || !crossSearchLazyState.listEl || crossSearchLazyState.loading) return;

            const state = crossSearchLazyState;
            const flatHits = Array.isArray(state.flatHits) ? state.flatHits : [];
            if (state.renderedCount >= flatHits.length) {
                updateCrossSearchLoadStatus();
                return;
            }

            state.loading = true;
            const from = state.renderedCount;
            const to = Math.min(flatHits.length, from + Math.max(1, Number(batchSize) || CROSS_SEARCH_BATCH_SIZE));
            const fragment = document.createDocumentFragment();

            for (let i = from; i < to; i++) {
                const item = flatHits[i];
                const wrapper = document.createElement('div');
                wrapper.style.cssText = 'padding:6px 8px;border:1px solid ' + borderColor + ';border-radius:6px;margin-bottom:8px;';
                wrapper.innerHTML =
                    '<div style="font-weight:600;margin-bottom:4px;">' +
                        escapeHtml(item.filename || '') + ' (' + (item.fileMatchCount || 0) + ')' +
                    '</div>' +
                    '<div class="cross-search-hit" data-file-id="' + item.docId + '" data-start="' + item.start + '" data-end="' + item.end + '" style="margin-top:5px;padding:5px 6px;border-radius:5px;background:' + (nightMode ? '#3a3a3a' : '#f6f6f6') + ';cursor:pointer;white-space:pre-wrap;word-break:break-word;">' +
                        escapeHtml(item.snippet || '') +
                    '</div>';
                fragment.appendChild(wrapper);
            }

            state.listEl.appendChild(fragment);
            state.renderedCount = to;
            state.loading = false;
            updateCrossSearchLoadStatus();
        }

        async function jumpToCrossSearchHit(fileId, start) {
            if (!fileId || typeof global.openFile !== 'function') return;

            await global.openFile(fileId);
            await performFind({ focusEditor: false });
            if (matches.length === 0) return;

            let bestIndex = 0;
            let bestDistance = Math.abs((matches[0] && matches[0].start) - start);
            for (let i = 1; i < matches.length; i++) {
                const distance = Math.abs((matches[i] && matches[i].start) - start);
                if (distance < bestDistance) {
                    bestDistance = distance;
                    bestIndex = i;
                }
            }

            currentMatchIndex = bestIndex;
            highlightMatch(currentMatchIndex, true, { focusEditor: false });
        }

        function renderWasmSearchResults(data) {
            if (!wasmSearchResults) return;
            const rows = (data && Array.isArray(data.files)) ? data.files : [];
            const totalMatches = computeCrossSearchTotalMatches(rows);
            if (rows.length === 0 || !totalMatches) {
                crossSearchLazyState = null;
                wasmSearchResults.innerHTML = '<div style="color:' + secondaryTextColor + ';">' + (isEn() ? 'No file matches' : '没有匹配文件') + '</div>';
                return;
            }

            const flatHits = flattenCrossSearchHits(rows);
            wasmSearchResults.innerHTML =
                '<div style="margin-bottom:8px;color:' + secondaryTextColor + ';">' +
                    (isEn() ? 'Matched files: ' : '匹配文件数：') + rows.length + '，' +
                    (isEn() ? 'total matches: ' : '总匹配数：') + totalMatches +
                '</div>' +
                '<div id="crossSearchLazyList" style="max-height:260px;overflow:auto;padding-right:2px;"></div>' +
                '<div id="crossSearchLazyStatus" style="margin-top:6px;color:' + secondaryTextColor + ';font-size:12px;"></div>';

            const listEl = wasmSearchResults.querySelector('#crossSearchLazyList');
            const statusEl = wasmSearchResults.querySelector('#crossSearchLazyStatus');
            crossSearchLazyState = {
                flatHits: flatHits,
                renderedCount: 0,
                listEl: listEl,
                statusEl: statusEl,
                loading: false,
                lastScrollTop: 0
            };

            if (listEl) {
                listEl.addEventListener('click', function(event) {
                    const hitEl = event.target && event.target.closest ? event.target.closest('.cross-search-hit') : null;
                    if (!hitEl) return;
                    const fileId = hitEl.getAttribute('data-file-id');
                    const start = parseInt(hitEl.getAttribute('data-start') || '0', 10);
                    jumpToCrossSearchHit(fileId, start).catch(function(error) {
                        console.error('Cross-file jump failed:', error);
                    });
                });

                listEl.addEventListener('scroll', function() {
                    if (!crossSearchLazyState || crossSearchLazyState.loading) return;

                    const currentTop = listEl.scrollTop;
                    const scrollingDown = currentTop > (crossSearchLazyState.lastScrollTop || 0);
                    crossSearchLazyState.lastScrollTop = currentTop;
                    if (!scrollingDown) return;

                    const nearBottom = currentTop + listEl.clientHeight >= listEl.scrollHeight - CROSS_SEARCH_PREFETCH_OFFSET;
                    if (nearBottom) {
                        appendCrossSearchBatch(CROSS_SEARCH_BATCH_SIZE);
                    }
                });
            }

            appendCrossSearchBatch(CROSS_SEARCH_BATCH_SIZE);
        }

        async function runWasmSearch() {
            const keyword = findInput.value.trim();
            if (!keyword) {
                crossSearchLazyState = null;
                if (wasmSearchResults) wasmSearchResults.innerHTML = '';
                return;
            }

            const readyRes = await gateway.ensureReady();
            if (!readyRes || readyRes.code !== 200) {
                crossSearchLazyState = null;
                if (wasmSearchResults) {
                    wasmSearchResults.innerHTML = '<div style="color:#dc3545;">' + escapeHtml((readyRes && readyRes.message) || (isEn() ? 'Search failed' : '搜索失败')) + '</div>';
                }
                return;
            }

            const res = gateway.searchFilesDetailed(keyword, { caseSensitive: false });
            if (!res || res.code !== 200) {
                crossSearchLazyState = null;
                if (wasmSearchResults) {
                    wasmSearchResults.innerHTML = '<div style="color:#dc3545;">' + escapeHtml((res && res.message) || (isEn() ? 'Search failed' : '搜索失败')) + '</div>';
                }
                return;
            }

            renderWasmSearchResults(res.data);
        }
        function clearVisualHighlights() {
            // Use native selection highlight only; no custom overlay nodes.
            const selection = window.getSelection();
            if (selection) selection.removeAllRanges();
        }

        function setSelectionByVisibleRange(start, end) {
            const editorElement = getEditorElement();
            if (!editorElement) return null;

            if (editorElement.tagName === 'TEXTAREA') {
                const totalLength = (editorElement.value || '').length;
                const targetStart = Math.max(0, Math.min(totalLength, Number(start) || 0));
                const targetEnd = Math.max(targetStart, Math.min(totalLength, Number(end) || targetStart));
                editorElement.focus();
                if (typeof editorElement.setSelectionRange === 'function') {
                    editorElement.setSelectionRange(targetStart, targetEnd);
                }
                return {
                    startContainer: editorElement,
                    endContainer: editorElement,
                    startOffset: targetStart,
                    endOffset: targetEnd
                };
            }

            const selection = window.getSelection();
            if (!selection) return null;

            const targetStart = Math.max(0, Number(start) || 0);
            const targetEnd = Math.max(targetStart, Number(end) || targetStart);

            const walker = document.createTreeWalker(editorElement, NodeFilter.SHOW_TEXT, null, false);
            let node;
            let charIndex = 0;
            let startNode = null;
            let endNode = null;
            let startOffset = 0;
            let endOffset = 0;

            while (node = walker.nextNode()) {
                const len = node.textContent.length;
                const next = charIndex + len;

                if (!startNode && targetStart >= charIndex && targetStart <= next) {
                    startNode = node;
                    startOffset = targetStart - charIndex;
                }

                if (startNode && targetEnd >= charIndex && targetEnd <= next) {
                    endNode = node;
                    endOffset = targetEnd - charIndex;
                    break;
                }

                charIndex = next;
            }

            if (!startNode) return null;
            if (!endNode) {
                endNode = startNode;
                endOffset = startOffset;
            }

            const range = document.createRange();
            range.setStart(startNode, Math.min(startOffset, startNode.textContent.length));
            range.setEnd(endNode, Math.min(endOffset, endNode.textContent.length));

            selection.removeAllRanges();
            selection.addRange(range);
            return range;
        }

        function getCursorTopRelativeToEditor(vditor, editorElement) {
            if (vditor && typeof vditor.getCursorPosition === 'function') {
                const pos = vditor.getCursorPosition();
                if (pos && Number.isFinite(pos.top)) return pos.top;
            }

            const selection = window.getSelection();
            if (!selection || selection.rangeCount === 0) return 0;
            const range = selection.getRangeAt(0);
            if (!editorElement.contains(range.startContainer)) return 0;

            let cursorRect = range.getClientRects().length ? range.getClientRects()[0] : null;
            if (!cursorRect) {
                const node = range.startContainer.nodeType === Node.TEXT_NODE
                    ? range.startContainer.parentElement
                    : range.startContainer;
                if (node && typeof node.getBoundingClientRect === 'function') {
                    cursorRect = node.getBoundingClientRect();
                }
            }
            if (!cursorRect) return 0;

            const parentRect = editorElement.parentElement
                ? editorElement.parentElement.getBoundingClientRect()
                : editorElement.getBoundingClientRect();
            return cursorRect.top - parentRect.top;
        }

        function centerCurrentSelectionViaVditor() {
            if (isLongFileEditorActiveFor(g('currentFileId'))) {
                const textarea = document.getElementById('longFileTextarea');
                if (!textarea) return false;

                const before = textarea.value.slice(0, textarea.selectionStart || 0);
                const lineIndex = before.split('\n').length - 1;
                const totalLines = Math.max(1, textarea.value.split('\n').length);
                const ratio = totalLines <= 1 ? 0 : (lineIndex / (totalLines - 1));
                const maxTop = Math.max(0, textarea.scrollHeight - textarea.clientHeight);
                textarea.scrollTop = Math.round(maxTop * ratio);
                return true;
            }

            const vditor = g('vditor');
            if (!vditor || !vditor.vditor) return false;

            const internal = vditor.vditor;
            const mode = (typeof vditor.getCurrentMode === 'function' ? vditor.getCurrentMode() : internal.currentMode) || internal.currentMode;
            const editorElement = internal[mode] && internal[mode].element;
            if (!editorElement) return false;

            const cursorTop = getCursorTopRelativeToEditor(vditor, editorElement);
            const isFullscreen = !!(internal.element && internal.element.classList && internal.element.classList.contains('vditor--fullscreen'));
            const heightMode = internal.options ? internal.options.height : null;

            if (heightMode === 'auto' && !isFullscreen) {
                const editorTop = internal.element ? internal.element.offsetTop : editorElement.offsetTop;
                const toolbarHeight = internal.toolbar && internal.toolbar.element ? internal.toolbar.element.offsetHeight : 0;
                const targetY = cursorTop + editorTop + toolbarHeight - window.innerHeight / 2 + 10;
                window.scrollTo(window.scrollX, Math.max(0, targetY));
            } else {
                editorElement.scrollTop = cursorTop + editorElement.scrollTop - editorElement.clientHeight / 2 + 10;
            }

            return true;
        }

        function centerSelectionFallback(range) {
            if (!range) return;
            const target = range.startContainer && range.startContainer.nodeType === Node.TEXT_NODE
                ? range.startContainer.parentElement
                : range.startContainer;
            if (target && typeof target.scrollIntoView === 'function') {
                target.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'nearest' });
            }
        }

        // 高亮匹配项
        function highlightMatch(index, allowRetry, options) {
            if (matches.length === 0 || index < 0 || index >= matches.length) return;
            // 更新状态
            findStatus.textContent = (isEn() ? 'Match ' : '匹配 ') + (index + 1) + ' / ' + matches.length;
            try {
                const vditor = g('vditor');
                const shouldFocusEditor = !options || options.focusEditor !== false;
                if (shouldFocusEditor && vditor && typeof vditor.focus === 'function') {
                    vditor.focus();
                }
                const range = setSelectionForMatch(index);
                if (!range) {
                    if (allowRetry !== false) {
                        setTimeout(function() {
                            highlightMatch(index, false);
                        }, 60);
                    }
                    return;
                }

                if (!centerCurrentSelectionViaVditor()) {
                    centerSelectionFallback(range);
                }
            } catch (e) {
                console.error('Highlight error:', e);
            }
        }
        // 清除高亮
        function clearHighlights() {
            clearVisualHighlights();
            matches = [];
            visibleMatches = [];
            currentMatchIndex = -1;
        }
        // 查找下一个
        async function findNext() {
            if (matches.length === 0 || searchText !== findInput.value.trim()) {
                await performFind();
                return;
            }
            currentMatchIndex = (currentMatchIndex + 1) % matches.length;
            highlightMatch(currentMatchIndex);
        }
        // 查找上一个
        async function findPrev() {
            if (matches.length === 0 || searchText !== findInput.value.trim()) {
                await performFind();
                return;
            }
            currentMatchIndex = (currentMatchIndex - 1 + matches.length) % matches.length;
            highlightMatch(currentMatchIndex);
        }
        // 执行替换功能
        async function doReplace() {
            if (matches.length === 0 || currentMatchIndex < 0) {
                await performFind();
                if (matches.length === 0) return; // 还是没匹配到就算了
            }
            const replaceText = replaceInput.value;
            const vditor = g('vditor');
            const currentFileId = g('currentFileId');
            const currentFile = (g('files') || []).find(function(file) { return file && file.id === currentFileId; });
            if (!vditor && !isLongFileEditorActiveFor(currentFileId)) return;

            const target = matches[currentMatchIndex];
            const selectedRange = setSelectionForMatch(currentMatchIndex);
            if (!selectedRange) return;

            if (isLongFileEditorActiveFor(currentFileId)) {
                const currentText = getCurrentEditorText();
                const newText = currentText.slice(0, target.start) + replaceText + currentText.slice(target.end);
                setEditorContentForFile(currentFileId, newText);
                if (currentFile) {
                    currentFile.content = newText;
                    currentFile.lastModified = Date.now();
                }
                g('unsavedChanges')[currentFileId] = true;
                if (typeof global.startAutoSave === 'function') {
                    global.startAutoSave();
                }
                await performFind();
                if (matches.length > 0) {
                    currentMatchIndex = Math.min(currentMatchIndex, matches.length - 1);
                    highlightMatch(currentMatchIndex);
                }
                return;
            }

            // Use Vditor native edit methods on current selection.
            vditor.focus();
            if (typeof vditor.deleteValue === 'function' && typeof vditor.insertValue === 'function') {
                vditor.deleteValue();
                vditor.insertValue(replaceText, true);
            } else {
                const currentText = getCurrentEditorContent(currentFileId, currentFile ? currentFile.content : '');
                const newText = currentText.slice(0, target.start) + replaceText + currentText.slice(target.end);
                vditor.setValue(newText, true);
            }

            await performFind();
            if (matches.length > 0) {
                currentMatchIndex = Math.min(currentMatchIndex, matches.length - 1);
                highlightMatch(currentMatchIndex);
            }
        }
        // 全部替换
        async function doReplaceAll() {
            await performFind();
            if (matches.length === 0) return;
            const replaceText = replaceInput.value;
            const vditor = g('vditor');
            const currentFileId = g('currentFileId');
            const currentFile = (g('files') || []).find(function(file) { return file && file.id === currentFileId; });
            if (!vditor && !isLongFileEditorActiveFor(currentFileId)) return;
            const readyRes = await gateway.ensureReady();
            if (!readyRes || readyRes.code !== 200) return;
            const replaceRes = gateway.replaceAllText(getCurrentEditorText(), searchText, replaceText, { caseSensitive: false });
            if (!replaceRes || replaceRes.code !== 200 || !replaceRes.data) return;
            if (isLongFileEditorActiveFor(currentFileId)) {
                setEditorContentForFile(currentFileId, replaceRes.data.text || '');
            } else {
                vditor.setValue(replaceRes.data.text || '', true);
            }
            if (currentFile) {
                currentFile.content = replaceRes.data.text || '';
                currentFile.lastModified = Date.now();
            }
            g('unsavedChanges')[currentFileId] = true;
            if (typeof global.startAutoSave === 'function') {
                global.startAutoSave();
            }
            findStatus.textContent = (isEn() ? 'Replaced ' : '已替换 ') + (replaceRes.data.replaced || 0) + (isEn() ? ' occurrences' : ' 处');
            findStatus.style.color = '#28a745';
            clearHighlights();
            matches = [];
            currentMatchIndex = -1;
        }
        // 绑定事件
        findInput.addEventListener('input', function() {
            // Keep state clean when keyword changes; search only on explicit action.
            // Avoid clearing document selection here, it can steal focus from the input on some platforms.
            matches = [];
            currentMatchIndex = -1;
            searchText = '';
            visibleMatches = [];
            crossSearchLazyState = null;
            findStatus.textContent = '';
            findStatus.style.color = secondaryTextColor;
            if (wasmSearchResults) wasmSearchResults.innerHTML = '';
        });
        findInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                performFind();
            }
        });
        replaceInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                doReplace();
            }
        });
        findBtn.onclick = performFind;
        findNextBtn.onclick = findNext;
        findPrevBtn.onclick = findPrev;
        replaceBtn.onclick = doReplace;
        replaceAllBtn.onclick = doReplaceAll;
        if (wasmSearchBtn) wasmSearchBtn.onclick = runWasmSearch;
        if (toggleCrossSearchBtn) {
            toggleCrossSearchBtn.onclick = function() {
                isCrossSearchCollapsed = !isCrossSearchCollapsed;
                if (wasmSearchResults) wasmSearchResults.style.display = isCrossSearchCollapsed ? 'none' : 'block';
                toggleCrossSearchBtn.textContent = isCrossSearchCollapsed
                    ? (isEn() ? 'Expand' : '展开')
                    : (isEn() ? 'Collapse' : '收起');
            };
        }
        // 关闭对话框并清除高亮
        function closeFindDialog() {
            clearHighlights();
            crossSearchLazyState = null;
            dialog.remove();
        }
        closeBtn.onclick = closeFindDialog;
        // ESC键关闭
        const handleEsc = function(e) {
            if (e.key === 'Escape') {
                closeFindDialog();
                document.removeEventListener('keydown', handleEsc);
            }
        };
        document.addEventListener('keydown', handleEsc);
    }


    // 导出函数到全局对象
    global.loadFilesFromServer = loadFilesFromServer;
    global.loadLocalFiles = loadLocalFiles;
    global.loadFiles = loadFiles;
    global.expandActiveFile = expandActiveFile;
    global.renameFile = renameFile;
    global.createDefaultFile = createDefaultFile;
    global.createNewFile = createNewFile;
    global.createNewFolder = createNewFolder;
    global.openFile = openFile;
    global.deleteFile = deleteFile;
    global.saveCurrentFile = saveCurrentFile;
    global.createHistoryVersion = createHistoryVersion;
    global.getFileHistory = getFileHistory;
    global.showHistoryModal = showHistoryModal;
    global.startAutoSave = startAutoSave;
    global.clearAutoSave = clearAutoSave;
    global.startAutoSync = startAutoSync;
    global.stopAutoSync = stopAutoSync;
    global.syncAllFiles = syncAllFiles;
    global.syncFileToServer = syncFileToServer;
    global.deleteFileFromServer = deleteFileFromServer;
    global.syncCurrentFileWithBeacon = syncCurrentFileWithBeacon;
    global.markPendingServerSync = markPendingServerSync;
    global.previewHistoryVersion = previewHistoryVersion;
    global.restoreFromHistory = restoreFromHistory;
    global.deleteHistoryVersion = deleteHistoryVersion;
    global.moveFile = moveFile;

    // 导出文件对比和全文查找功能
    global.showFileDiffDialog = showFileDiffDialog;
    global.showFindDialog = showFindDialog;
    global.setEditorContentForFile = setEditorContentForFile;
    global.getCurrentEditorContent = getCurrentEditorContent;
    global.syncCurrentEditorSnapshotIntoFiles = syncCurrentEditorSnapshotIntoFiles;

    // Core handlers exposed for index.ts composition layer.
    global.__filesCoreHandlers = {
        showDiffModal: showDiffModal,
        showMergePreviewModal: showMergePreviewModal,
        openExternalLocalFileByDialog: openExternalLocalFileByDialog,
        openExternalLocalFileByPath: openExternalLocalFileByPath,
        startExternalLocalConflictMonitor: startExternalLocalConflictMonitor
    };

})(typeof window !== 'undefined' ? window : this);
