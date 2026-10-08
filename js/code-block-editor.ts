import { affectsCodeBlocks } from './code-block-mutations';
import { bindMobileCodeInput } from './code-block-mobile';
import { canRunLanguage } from '../shared/code-runner-languages';
import { recordCodeBlockExit } from './code-block-focus';
import { uiText, setUiText } from './i18n-messages';
import { basicSetup } from 'codemirror';
import { EditorState, StateEffect, StateField, Compartment } from '@codemirror/state';
import { EditorView, Decoration, DecorationSet, keymap } from '@codemirror/view';
import { indentWithTab } from '@codemirror/commands';
import { languages } from '@codemirror/language-data';
import { oneDark } from '@codemirror/theme-one-dark';

const errorLine = StateEffect.define<number | null>();
const errorMarks = StateField.define<DecorationSet>({
    create: () => Decoration.none,
    update(value, transaction) {
        if (transaction.docChanged) return Decoration.none;
        for (const effect of transaction.effects) if (effect.is(errorLine)) {
            const line = effect.value;
            return line && line <= transaction.state.doc.lines
                ? Decoration.set([Decoration.line({class: 'epmd-code-error-line'}).range(transaction.state.doc.line(line).from)])
                : Decoration.none;
        }
        return value;
    },
    provide: field => EditorView.decorations.from(field),
});
const entries = new Map<HTMLElement, {view: EditorView; source: HTMLElement; host: HTMLElement; readonly: Compartment; theme: Compartment; language: string; syncing: boolean; instance: any; readonlyValue: boolean; darkValue: boolean; editControls: HTMLButtonElement[]}>();
const roots = new Map<HTMLElement, any>();
const diagramLanguages = new Set(['mermaid', 'echarts', 'math', 'abc', 'graphviz', 'flowchart', 'mindmap', 'markmap', 'plantuml', 'wavedrom', 'smiles']);
let queued = false;

function notifyChanged(block: HTMLElement, instance: any) {
    const global = window as any;
    if (!instance?.vditor) return;
    if (global.currentFileId && document.getElementById('vditor')?.contains(block)) {
        global.unsavedChanges[global.currentFileId] = true;
        global.startAutoSave?.();
        global.draftRecovery?.markDirty();
    }
    // Source DOM is updated synchronously; autosave/getValue always sees the latest code.
    // Do not send native input through Vditor: it would replace the focused code view.
    instance.vditor.options.input?.(instance.getValue());
}

function languageExtension(language: string) {
    const name = ({py:'python', js:'javascript', ts:'typescript', 'c++':'cpp', htm:'html', echarts:'json'} as Record<string,string>)[language] || language;
    return languages.find(item => item.name.toLowerCase() === name || item.alias.some(alias => alias.toLowerCase() === name));
}

function readonlyBlock(block: HTMLElement) {
    return block.closest('[contenteditable="true"]') === null;
}

function createEditor(block: HTMLElement, source: HTMLElement, preview: HTMLElement, instance: any) {
    const language = source.className.match(/language-([^\s]+)/)?.[1]?.toLowerCase() || '';
    const diagram = diagramLanguages.has(language);
    const host = document.createElement('div');
    host.className = 'epmd-code-editor'; host.contentEditable = 'false';
    const header = document.createElement('div'); header.className = 'epmd-code-header';
    const label = document.createElement('button');
    label.type = 'button'; label.className = 'epmd-code-language';
    label.textContent = language || uiText('纯文本'); setUiText(label, uiText('修改代码语言'), 'title');
    setUiText(label, uiText('修改代码语言'), 'aria-label'); header.appendChild(label);
    const editControls: HTMLButtonElement[] = [label];
    const snapshot = () => instance?.vditor?.undo?.addToUndoStack(instance.vditor);
    label.addEventListener('click', () => {
        if (readonlyBlock(block) || header.querySelector('input')) return;
        const input = document.createElement('input');
        input.className = 'epmd-code-language-input'; input.value = language;
        setUiText(input, uiText('语言名称（留空为纯文本）'), 'placeholder'); setUiText(input, uiText('代码语言'), 'aria-label');
        label.hidden = true; label.after(input); input.focus(); input.select();
        let finished = false;
        const finish = (commit: boolean) => {
            if (finished) return;
            const next = input.value.trim().toLowerCase();
            if (commit && !/^[a-z0-9_+#.-]*$/.test(next)) {
                (window as any).showToast?.(uiText('语言名称只能包含字母、数字及 _ + # . -'), 'error');
                input.focus(); return;
            }
            finished = true; input.remove(); label.hidden = false;
            if (!commit || next === language || readonlyBlock(block)) { label.focus(); return; }
            snapshot();
            const selection = view.state.selection;
            for (const name of [...source.classList]) if (name.startsWith('language-')) source.classList.remove(name);
            if (next) source.classList.add('language-' + next);
            const info = block.querySelector('[data-type="code-block-info"]');
            if (info) info.textContent = '\u200b' + next;
            // Rebuild only this view; canonical code and enclosing document stay in place.
            view.destroy(); entries.delete(block); host.remove();
            preview.replaceChildren(source.cloneNode(true)); preview.hidden = false;
            preview.dataset.render = '2';
            createEditor(block, source, preview, instance);
            const replacement = entries.get(block);
            if (replacement && !diagramLanguages.has(next)) {
                replacement.view.dispatch({selection}); replacement.view.focus();
            }
            notifyChanged(block, instance); snapshot();
        };
        input.addEventListener('keydown', event => {
            if (event.isComposing) return;
            if (event.key === 'Enter' || event.key === 'Escape') {
                event.preventDefault(); finish(event.key === 'Enter');
            }
        });
        input.addEventListener('blur', () => finish(true));
    });
    const actions = document.createElement('div'); header.appendChild(actions);
    function button(text: string, callback: () => void) {
        const element = document.createElement('button'); element.type = 'button'; setUiText(element, text);
        element.addEventListener('click', callback); actions.appendChild(element); return element;
    }
    if (canRunLanguage(language)) {
        button(uiText('运行'), async () => {
            const global = window as any;
            await global.ensureCodeRunnerLoaded?.();
            await global.runCodeBlock?.({language, code: view.state.doc.toString(), block: source, editor: view});
        });
    }
    button(uiText('复制'), async () => {
        try {
            if (!navigator.clipboard) throw Error('Clipboard unavailable');
            await navigator.clipboard.writeText(view.state.doc.toString());
            (window as any).showMessage?.(uiText('已复制'), 'success');
        } catch { (window as any).showMessage?.(uiText('复制失败，请手动选择代码复制'), 'error'); }
    });
    const editorParent = document.createElement('div'); host.append(header, editorParent);
    const renderDiagram = () => {
        const global = window as any;
        preview.replaceChildren(source.cloneNode(true)); preview.dataset.render = '2';
        const internal = instance?.vditor;
        const renderer = global.Vditor;
        const methods: Record<string, string> = {echarts:'chartRender', mermaid:'mermaidRender', abc:'abcRender', smiles:'SMILESRender', markmap:'markmapRender', flowchart:'flowchartRender', graphviz:'graphvizRender', wavedrom:'wavedromRender', mindmap:'mindmapRender', plantuml:'plantumlRender'};
        if (language === 'math') renderer?.mathRender?.(preview, {cdn:internal?.options.cdn, math:internal?.options.preview.math});
        else renderer?.[methods[language]]?.(preview, internal?.options.cdn, internal?.options.theme);
        preview.dataset.render = '1';
    };
    let diagramToggle: HTMLButtonElement | undefined;
    if (diagram) {
        const toggle = button(uiText('编辑代码'), () => {
            const editing = editorParent.hidden;
            editorParent.hidden = !editing;
            preview.hidden = editing;
            setUiText(toggle, editing ? uiText('查看图表') : uiText('编辑代码'));
            if (editing) { view.requestMeasure(); view.focus(); }
            else renderDiagram();
        });
        diagramToggle = toggle;
        editorParent.hidden = true;
        preview.before(host);
        // data-render containers are ignored by Lute's Markdown serializer.
        host.dataset.render = '1'; host.classList.add('vditor-' + (instance?.getCurrentMode?.() || 'wysiwyg') + '__preview');
    } else {
        preview.replaceChildren(host); preview.hidden = false; preview.dataset.render = '1';
    }
    let collapsed = false, editorWasHidden = editorParent.hidden, previewWasHidden = preview.hidden;
    const fold = button(uiText('折叠'), () => {
        collapsed = !collapsed;
        if (collapsed) {
            editorWasHidden = editorParent.hidden; previewWasHidden = preview.hidden;
            editorParent.hidden = true;
            if (diagram) preview.hidden = true;
        } else {
            editorParent.hidden = editorWasHidden;
            if (diagram) preview.hidden = previewWasHidden;
            view.requestMeasure();
        }
        if (diagramToggle) diagramToggle.hidden = collapsed;
        setUiText(fold, collapsed ? uiText('展开') : uiText('折叠'));
        fold.setAttribute('aria-expanded', String(!collapsed));
    });
    fold.setAttribute('aria-expanded', 'true'); setUiText(fold, uiText('折叠或展开代码'), 'title');
    const remove = button(uiText('删除'), () => {
        if (readonlyBlock(block)) return;
        snapshot();
        const parent = block.parentElement;
        if (!parent) return;
        const next = block.nextElementSibling || block.previousElementSibling;
        // The attached parent identifies the document after removing the block.
        view.destroy(); entries.delete(block);
        block.remove();
        if (!parent.firstChild) {
            const paragraph = document.createElement('p');
            paragraph.setAttribute('data-block', '0'); paragraph.appendChild(document.createElement('br'));
            parent.appendChild(paragraph);
        }
        const target = (next?.isConnected ? next : parent.firstElementChild) as HTMLElement;
        if (target) {
            const range = document.createRange(); range.selectNodeContents(target); range.collapse(true);
            const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range);
            parent.closest<HTMLElement>('[contenteditable="true"]')?.focus();
        }
        notifyChanged(parent, instance); snapshot();
    });
    setUiText(remove, uiText('删除整个代码块（可撤销）'), 'title'); remove.className = 'epmd-code-delete';
    editControls.push(remove);
    editControls.forEach(control => { control.disabled = readonlyBlock(block); });
    block.classList.add('epmd-custom-code-block');
    const readonly = new Compartment(), theme = new Compartment(), syntax = new Compartment();
    const entry = {view: null as EditorView, source, host, readonly, theme, language, syncing: false, instance, readonlyValue: readonlyBlock(block), editControls, darkValue: document.body.classList.contains('dark-mode') || !!(window as any).nightMode};
    const view = new EditorView({
        parent: editorParent,
        state: EditorState.create({doc: source.textContent || '', extensions: [
            basicSetup, keymap.of([indentWithTab]), errorMarks, syntax.of([]),
            ...(/Android|iPhone|iPad/i.test(navigator.userAgent) || window.matchMedia?.('(pointer: coarse)').matches ? [EditorView.lineWrapping] : []),
            readonly.of([EditorState.readOnly.of(entry.readonlyValue), EditorView.editable.of(!entry.readonlyValue)]),
            theme.of(entry.darkValue ? oneDark : []),
            EditorView.theme({
                '&': {fontSize:'14px', backgroundColor:'transparent'},
                '.cm-scroller': {fontFamily:'monospace', overflow:'auto', maxHeight:'65vh'},
                '.cm-content': {minHeight:'60px'},
                '.epmd-code-error-line': {backgroundColor:'rgba(220,38,38,.24)', boxShadow:'inset 3px 0 #dc2626'},
            }),
            EditorView.updateListener.of(update => {
                if (!update.docChanged || entry.syncing) return;
                source.textContent = update.state.doc.toString();
                notifyChanged(block, instance);

            }),
        ]}),
    });
    entry.view = view; entries.set(block, entry);
    if (diagram && preview.firstElementChild?.tagName === 'CODE') renderDiagram();
    // CodeMirror maintains local undo while typing; snapshot the document on exit,
    // avoiding Vditor's full-DOM diff on every short pause in code input.
    host.addEventListener('focusout', event => {
        if (source.isConnected && !host.contains(event.relatedTarget as Node)) recordCodeBlockExit(host, instance);
    });
    const description = languageExtension(language);
    description?.load().then(support => { if (entries.get(block) === entry) view.dispatch({effects:syntax.reconfigure(support)}); }).catch(console.warn);
    bindMobileCodeInput(host,view,()=>!entry.readonlyValue);
    // Expose the exact source and view to execution/error highlighting without DOM edits.
    (host as any).__epmdCode = {view, source, language};
}

function scan() {
    queued = false;
    for (const [block, entry] of entries) {
        if (!block.isConnected || !entry.host.isConnected || !entry.source.isConnected) {
            entry.view.destroy(); entry.host.remove(); entries.delete(block); continue;
        }
        const code = entry.source.textContent || '';
        if (code !== entry.view.state.doc.toString()) {
            entry.syncing = true;
            entry.view.dispatch({changes:{from:0,to:entry.view.state.doc.length,insert:code}});
            entry.syncing = false;
        }
        const readonly = readonlyBlock(block);
        const dark = document.body.classList.contains('dark-mode') || !!(window as any).nightMode;
        const effects = [];
        if (readonly !== entry.readonlyValue) {
            entry.readonlyValue = readonly;
            entry.editControls.forEach(control => { control.disabled = readonly; });
            effects.push(entry.readonly.reconfigure([EditorState.readOnly.of(readonly), EditorView.editable.of(!readonly)]));
        }
        if (dark !== entry.darkValue) { entry.darkValue = dark; effects.push(entry.theme.reconfigure(dark ? oneDark : [])); }
        if (effects.length) entry.view.dispatch({effects});
    }
    const main = document.getElementById('vditor');
    if (main && (window as any).vditor) roots.set(main, (window as any).vditor);
    for (const [root, instance] of roots) {
        if (!root.isConnected) { roots.delete(root); continue; }
        if (instance?.getCurrentMode?.() === 'sv') continue;
        const internal = instance?.vditor;
        const surface = internal?.[internal.currentMode]?.element;
        if (!surface) continue;
        surface.querySelectorAll('[data-type="code-block"]').forEach((block: HTMLElement) => {
            if (entries.has(block)) return;
            // Undo restores serialized DOM, including stale custom headers. Recreate views
            // from canonical source, never mistake a diagram header for its preview.
            block.querySelectorAll<HTMLElement>('.epmd-code-editor').forEach(host => host.remove());
            const preview = block.querySelector('.vditor-wysiwyg__preview:not(.epmd-code-editor), .vditor-ir__preview:not(.epmd-code-editor)') as HTMLElement;
            const source = [...block.querySelectorAll('pre > code')].find(code => !code.closest('.vditor-wysiwyg__preview, .vditor-ir__preview')) as HTMLElement;
            if (source && preview) createEditor(block, source, preview, instance);
        });
    }
}
function scheduleScan() { if (!queued) { queued = true; requestAnimationFrame(scan); } }

export function registerCodeBlockEditors(instance: any, root: HTMLElement) {
    if (!root.isConnected) return;
    roots.set(root, instance); scheduleScan();
}

(window as any).highlightCodeError = (view: EditorView, line: number | null) => {
    if (view?.dom.isConnected) view.dispatch({effects:errorLine.of(line)});
};
const observer = new MutationObserver(mutations => {
    // Ordinary prose edits and CodeMirror caret changes do not rescan every code block.
    if (mutations.some(affectsCodeBlocks)) scheduleScan();
});
observer.observe(document.body, {subtree:true, childList:true, characterData:true, attributes:true, attributeFilter:['contenteditable','class']});
scheduleScan();
