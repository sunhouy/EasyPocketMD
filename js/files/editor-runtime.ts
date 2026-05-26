// @ts-nocheck
/**
 * 编辑器运行时：长文件模式、Vditor 光标桥接、加载遮罩、编辑器内容读写。
 * 从 runtime-core.ts 中抽出，闭包状态保留在本模块内；通过 installEditorRuntime
 * 把所需函数挂到调用方传入的 ctx 上，供 runtime-core 内部继续以原函数名调用。
 */
import { escapeHtml as escapeHtmlCore } from './conflict/index';

const LONG_FILE_MODE_CHAR_THRESHOLD = 220000;
const LONG_FILE_MODE_LINE_THRESHOLD = 6000;
const LONG_FILE_MODE_PREVIEW_DEBOUNCE = 180;

export interface EditorRuntimeCtx {
    formatDiffTime: (value: unknown) => string;
    ensureFileSwitchLoadingOverlay: () => HTMLElement | null;
    setEditorInteractionLocked: (locked: boolean) => void;
    isVditorInteractionApiReady: (vditorInstance: any) => boolean;
    setVditorInteractionLocked: (vditorInstance: any, locked: boolean) => boolean;
    setFileSwitchLoading: (loading: boolean, customText?: string) => void;
    getLongFileEditorState: () => any;
    syncLongFileModeFlag: () => void;
    isLongFileEditorActiveFor: (fileId: unknown) => boolean;
    countTextLinesFast: (text: string) => number;
    shouldUseLongFileMode: (content: unknown) => boolean;
    ensureLongFileEditorElements: () => HTMLElement | null;
    applyLongFilePreviewVisibility: () => void;
    updateLongFileEditorLabels: () => void;
    getLongFileTextarea: () => HTMLTextAreaElement | null;
    getLongFilePreview: () => HTMLElement | null;
    loadMarkedParser: () => Promise<(source: string) => string>;
    renderLongFilePreviewNow: () => Promise<void>;
    scheduleLongFilePreviewRender: () => void;
    activateLongFileEditor: (fileId: unknown, content: unknown) => boolean;
    deactivateLongFileEditor: () => void;
    getVditorEditableElement: (vditorInstance: any) => HTMLElement | null;
    getDomSelectionOffsets: (root: HTMLElement) => { start: number; end: number } | null;
    setDomSelectionOffsets: (root: HTMLElement, start: number, end: number) => boolean;
    captureVditorCursor: (vditorInstance: any) => any;
    restoreVditorCursor: (vditorInstance: any, snapshot: any) => void;
    setVditorValuePreservingCursor: (vditorInstance: any, content: string) => void;
    isVditorValueBridgeReady: (vditorInstance?: any) => boolean;
    scheduleDeferredVditorValueApply: (fileId: unknown, content: unknown) => void;
    setEditorContentForFile: (fileId: unknown, content: unknown, options?: { preserveCursor?: boolean }) => void;
    getCurrentEditorContent: (fileId: unknown, fallbackContent?: unknown) => string;
    syncCurrentEditorSnapshotIntoFiles: (targetFiles: any[], options?: { fileId?: unknown }) => void;
}

export function installEditorRuntime(global: any, ctx: Partial<EditorRuntimeCtx>): EditorRuntimeCtx {
    function g(name: string) { return global[name]; }
    function isEn() { return window.i18n && window.i18n.getLanguage() === 'en'; }
    function t(key: string) { return window.i18n ? window.i18n.t(key) : key; }

    let markedParserPromise: Promise<(source: string) => string> | null = null;
    let longFilePreviewTimer: any = null;

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
            textInputs.forEach(function(node: any) {
                node.readOnly = !!locked;
            });

            const toolbarBtns = vditorContainer.querySelectorAll('.vditor-toolbar__item, .vditor-toolbar__btn');
            toolbarBtns.forEach(function(btn: any) {
                btn.style.pointerEvents = locked ? 'none' : '';
                btn.style.opacity = locked ? '0.5' : '';
            });
        }

        const longTextarea = getLongFileTextarea();
        if (longTextarea) {
            longTextarea.readOnly = !!locked;
        }

        const longPreviewToggle = document.getElementById('longFilePreviewToggle') as HTMLButtonElement | null;
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

    function setFileSwitchLoading(loading, customText?) {
        const isLoading = !!loading;
        const overlay = ensureFileSwitchLoadingOverlay();
        const text = document.getElementById('fileSwitchLoadingText');
        if (text) {
            if (typeof customText === 'string' && customText) {
                text.textContent = customText;
            } else {
                text.textContent = isEn() ? 'Loading file...' : '正在加载文件...';
            }
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

    function getLongFileTextarea(): HTMLTextAreaElement | null {
        return document.getElementById('longFileTextarea') as HTMLTextAreaElement | null;
    }

    function getLongFilePreview() {
        return document.getElementById('longFilePreview');
    }

    async function loadMarkedParser() {
        if (!markedParserPromise) {
            markedParserPromise = import('marked').then(function(mod: any) {
                const marked = mod && (mod.marked || mod.default || mod);
                if (!marked) {
                    throw new Error('marked module unavailable');
                }

                if (typeof marked.setOptions === 'function') {
                    marked.setOptions({ gfm: true, breaks: true });
                }

                if (typeof marked.parse === 'function') {
                    return function(source: string) {
                        return marked.parse(source || '');
                    };
                }

                if (typeof marked === 'function') {
                    return function(source: string) {
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
            preview.innerHTML = '<pre>' + escapeHtmlCore(markdownText) + '</pre>';
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
        const snapshot: any = {
            wasFocused,
            scrollTop: typeof element.scrollTop === 'number' ? element.scrollTop : 0,
            scrollLeft: typeof element.scrollLeft === 'number' ? element.scrollLeft : 0,
            windowX: window.pageXOffset,
            windowY: window.pageYOffset
        };

        if (typeof (element as any).selectionStart === 'number' && typeof (element as any).selectionEnd === 'number') {
            snapshot.type = 'input';
            snapshot.start = (element as any).selectionStart;
            snapshot.end = (element as any).selectionEnd;
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
            const element: any = getVditorEditableElement(vditorInstance);
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

    function setEditorContentForFile(fileId, content, options?) {
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

    function isVditorValueBridgeReady(vditorInstance?) {
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

        Promise.resolve(global.ensureVditorInitialized()).then(function(instance: any) {
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

    function syncCurrentEditorSnapshotIntoFiles(targetFiles, options?) {
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

    function getCurrentEditorContent(fileId, fallbackContent?) {
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

    const api: EditorRuntimeCtx = {
        formatDiffTime,
        ensureFileSwitchLoadingOverlay,
        setEditorInteractionLocked,
        isVditorInteractionApiReady,
        setVditorInteractionLocked,
        setFileSwitchLoading,
        getLongFileEditorState,
        syncLongFileModeFlag,
        isLongFileEditorActiveFor,
        countTextLinesFast,
        shouldUseLongFileMode,
        ensureLongFileEditorElements,
        applyLongFilePreviewVisibility,
        updateLongFileEditorLabels,
        getLongFileTextarea,
        getLongFilePreview,
        loadMarkedParser,
        renderLongFilePreviewNow,
        scheduleLongFilePreviewRender,
        activateLongFileEditor,
        deactivateLongFileEditor,
        getVditorEditableElement,
        getDomSelectionOffsets,
        setDomSelectionOffsets,
        captureVditorCursor,
        restoreVditorCursor,
        setVditorValuePreservingCursor,
        isVditorValueBridgeReady,
        scheduleDeferredVditorValueApply,
        setEditorContentForFile,
        getCurrentEditorContent,
        syncCurrentEditorSnapshotIntoFiles
    };

    if (ctx) {
        Object.assign(ctx, api);
    }
    return api;
}
