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
const entries = new Map<HTMLElement, {view: EditorView; source: HTMLElement; host: HTMLElement; readonly: Compartment; theme: Compartment; language: string; syncing: boolean; instance: any; readonlyValue: boolean; darkValue: boolean}>();
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
    const label = document.createElement('span'); label.textContent = language || '纯文本'; header.appendChild(label);
    const actions = document.createElement('div'); header.appendChild(actions);
    function button(text: string, callback: () => void) {
        const element = document.createElement('button'); element.type = 'button'; element.textContent = text;
        element.addEventListener('click', callback); actions.appendChild(element); return element;
    }
    if (['python','py','javascript','js','typescript','ts','c','cpp','c++','html','htm'].includes(language)) {
        button('运行', async () => {
            const global = window as any;
            await global.ensureCodeRunnerLoaded?.();
            await global.runCodeBlock?.({language, code: view.state.doc.toString(), block: source, editor: view});
        });
    }
    button('复制', () => navigator.clipboard?.writeText(view.state.doc.toString()).catch(() => (window as any).showToast?.('复制失败，请手动选择代码复制', 'error')));
    const editorParent = document.createElement('div'); host.append(header, editorParent);
    if (diagram) {
        const toggle = button('编辑代码', () => {
            const editing = editorParent.hidden;
            editorParent.hidden = !editing;
            preview.hidden = editing;
            toggle.textContent = editing ? '查看图表' : '编辑代码';
            if (editing) { view.requestMeasure(); view.focus(); }
            else {
                const global = window as any;
                // Re-render diagram from the canonical source, retaining vector renderers.
                preview.replaceChildren(source.cloneNode(true));
                preview.dataset.render = '2';
                const internal = instance?.vditor;
                const renderer = global.Vditor;
                const methods = {echarts:'chartRender', mermaid:'mermaidRender', abc:'abcRender', smiles:'SMILESRender', markmap:'markmapRender', flowchart:'flowchartRender', graphviz:'graphvizRender', wavedrom:'wavedromRender', mindmap:'mindmapRender', plantuml:'plantumlRender'};
                if (language === 'math') renderer?.mathRender?.(preview, {cdn:internal?.options.cdn, math:internal?.options.preview.math});
                else renderer?.[methods[language]]?.(preview, internal?.options.cdn, internal?.options.theme);
                preview.dataset.render = '1';
            }
        });
        editorParent.hidden = true;
        preview.before(host);
        // data-render containers are ignored by Lute's Markdown serializer.
        host.dataset.render = '1'; host.classList.add('vditor-' + (instance?.getCurrentMode?.() || 'wysiwyg') + '__preview');
    } else {
        preview.replaceChildren(host); preview.hidden = false; preview.dataset.render = '1';
    }
    block.classList.add('epmd-custom-code-block');
    const readonly = new Compartment(), theme = new Compartment(), syntax = new Compartment();
    const entry = {view: null as EditorView, source, host, readonly, theme, language, syncing: false, instance, readonlyValue: readonlyBlock(block), darkValue: document.body.classList.contains('dark-mode') || !!(window as any).nightMode};
    const view = new EditorView({
        parent: editorParent,
        state: EditorState.create({doc: source.textContent || '', extensions: [
            basicSetup, keymap.of([indentWithTab]), errorMarks, syntax.of([]),
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
    // CodeMirror maintains local undo while typing; snapshot the document on exit,
    // avoiding Vditor's full-DOM diff on every short pause in code input.
    host.addEventListener('focusout', event => {
        if (source.isConnected && !host.contains(event.relatedTarget as Node)) instance?.vditor?.undo?.addToUndoStack(instance.vditor);
    });
    const description = languageExtension(language);
    description?.load().then(support => { if (entries.get(block) === entry) view.dispatch({effects:syntax.reconfigure(support)}); }).catch(console.warn);
    // All editing events belong to CodeMirror, not the enclosing contenteditable.
    for (const name of ['input','beforeinput','keydown','keyup','paste','copy','cut','click','dblclick','mousedown','compositionstart','compositionend']) {
        host.addEventListener(name, event => event.stopPropagation());
    }
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
            const preview = block.querySelector('.vditor-wysiwyg__preview, .vditor-ir__preview') as HTMLElement;
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
    // CodeMirror manages its own DOM; scanning on every caret blink/input would recurse.
    if (mutations.some(mutation => mutation.target === document.body || (!(mutation.target as HTMLElement).closest?.('.epmd-code-editor') && ((mutation.target as HTMLElement).closest?.('.vditor, .diff-vditor') || [...mutation.addedNodes].some(node => (node as HTMLElement).querySelector?.('.vditor, .diff-vditor')))))) scheduleScan();
});
observer.observe(document.body, {subtree:true, childList:true, characterData:true, attributes:true, attributeFilter:['contenteditable','class']});
scheduleScan();
