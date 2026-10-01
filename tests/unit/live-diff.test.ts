/** @jest-environment jsdom */
// @ts-nocheck
import { textDiff, highlightedLines, highlightRenderedPair } from '../../js/files/conflict/highlight';
import { createDiffEditors } from '../../js/files/conflict/editors';
import { createDiffFileWriter } from '../../js/files/conflict/live-files';
import { renderDiffView } from '../../js/files/conflict/index';
import { mountDiffView, renderMergePreview } from '../../js/files/conflict/markdown';
const removed = left => ({ type: 'removed', left, right: '' });
const added = right => ({ type: 'added', left: '', right });

beforeEach(() => { document.body.innerHTML = '<div id="host"></div>'; localStorage.clear(); delete window.Vditor; });
afterEach(() => jest.useRealTimers());

test('highlights exact changed text safely in source and semantic Markdown', async () => {
    const host = document.getElementById('host');
    host.innerHTML = renderDiffView([removed('The price is 10 <b>'), added('The price is 20 <b>')], true);
    expect([...host.querySelectorAll('mark')].map(mark => mark.textContent)).toEqual(['1', '2']);
    expect(host.querySelector('b')).toBeNull();
    await mountDiffView(host, [removed('## **Old** title'), added('## **New** title')], true, { markHunks: true, activeHunkId: 0 });
    expect(host.querySelectorAll('h2 strong')).toHaveLength(2);
    expect(host.querySelector('.diff-hunk-active [data-hunk-id="0"]')).not.toBeNull();
    expect([...host.querySelectorAll('mark')].map(mark => mark.textContent)).toEqual(['Old', 'New']);
    expect(host.textContent).not.toContain('##');
    await renderMergePreview(host, '# Result\n\n- **Merged**\n\n<script>bad()</script>');
    expect(host.querySelector('h1').textContent).toBe('Result');
    expect(host.querySelector('li strong').textContent).toBe('Merged');
    expect(host.querySelector('script')).toBeNull();
});

test('renders identical Markdown files instead of falling back to source', async () => {
    const host = document.getElementById('host');
    await mountDiffView(host, [{ type: 'same', left: '# Same', right: '# Same' }], true, { collapseSame: false });
    expect(host.querySelectorAll('h1')).toHaveLength(2);
});

test('never splits emoji or drops text in multiline highlights', () => {
    const left = 'Hello 👨‍👩‍👧\n<script>old</script>', right = 'Hello 👨‍👩‍👦\n<script>new</script>';
    const parts = textDiff(left, right);
    for (const [side, expected] of [['left', left], ['right', right]]) {
        const host = document.getElementById('host'); host.innerHTML = highlightedLines(parts, side).join('\n');
        expect(host.textContent).toBe(expected);
        expect(host.querySelector('script')).toBeNull();
        expect(host.querySelector('mark').textContent).toMatch(/^👨‍👩‍/);
    }
});

test('native view/editor share DOM, switch Markdown/source, preserve readonly and pending IME edits', async () => {
    const { marked } = require('marked');
    window.requestAnimationFrame = callback => setTimeout(callback, 0); window.cancelAnimationFrame = clearTimeout;
    class FakeVditor {
        constructor(host, options) {
            this.host = host; this.options = options; this.value = options.value;
            this.root = document.createElement('pre'); host.append(this.root);
            this.vditor = { [options.mode]: { element: this.root } };
            this.setValue(this.value); Promise.resolve().then(options.after);
        }
        setValue(value) { this.value = value; this.root.innerHTML = marked.parse(value); [...this.root.children].forEach(node => node.dataset.block = '0'); }
        getValue() { return this.value + '\n'; }
        disabled() { this.root.contentEditable = 'false'; this.root.setAttribute('contenteditable', 'false'); }
        enable() { this.root.contentEditable = 'true'; this.root.setAttribute('contenteditable', 'true'); }
        edit(value) { this.setValue(value); this.root.dispatchEvent(new Event('input')); this.options.input(value); }
        destroy() { this.host.replaceChildren(); }
    }
    window.Vditor = FakeVditor;
    const values = ['# Old\n\nprice 10', '# New\n\nprice 20'], writes = [jest.fn(value => values[0] = value), jest.fn(value => values[1] = value)];
    const surface = createDiffEditors(document.getElementById('host'), [0, 1].map(i => ({ label: 'file'+i, read: () => values[i], write: i ? writes[i] : undefined })), undefined, { editable: false, editorConstructor: FakeVditor });
    await surface.ready;
    const roots = [...surface.roots];
    expect(roots[0].querySelector('h1').textContent).toBe('Old');
    surface.setEditable(true); expect(surface.roots[0]).toBe(roots[0]); expect(surface.roots[1]).toBe(roots[1]);
    expect(roots[0].getAttribute('contenteditable')).toBe('false'); expect(roots[1].getAttribute('contenteditable')).toBe('true');
    surface.setEditable(false); expect(writes[1]).not.toHaveBeenCalled(); // Viewing/toggling does not normalize files.
    surface.setEditable(true); surface.instances[1].edit('# Updated'); expect(writes[1]).toHaveBeenLastCalledWith('# Updated');
    roots[1].dispatchEvent(new Event('compositionstart')); surface.instances[1].edit('# 中文'); expect(writes[1]).toHaveBeenCalledTimes(1);
    surface.flush(); expect(writes[1]).toHaveBeenLastCalledWith('# 中文\n');
    const previous = surface.instances[1];
    await surface.setMarkdown(false); const calls = writes[1].mock.calls.length; previous.options.input('stale callback'); expect(writes[1]).toHaveBeenCalledTimes(calls);
    expect(surface.instances[1].options.mode).toBe('sv'); expect(surface.roots[1].getAttribute('contenteditable')).toBe('true');
    await surface.setMarkdown(true); expect(surface.instances[1].options.mode).toBe('wysiwyg');
    surface.destroy(); expect(document.querySelector('.diff-document')).toBeNull();
});

test('persists both files immediately, updates the active editor and debounces only server sync', () => {
    jest.useFakeTimers();
    const files = [{ id: 'a', content: 'one' }, { id: 'b', content: 'two' }];
    const globals = { files, currentFileId: 'a', currentUser: {}, unsavedChanges: {}, syncFileToServer: jest.fn().mockResolvedValue(undefined) };
    const setEditor = jest.fn(), refresh = jest.fn(), writer = createDiffFileWriter(globals, setEditor, refresh);
    writer.write(files[0], 'first'); writer.write(files[0], 'latest'); writer.write(files[1], 'second');
    expect(JSON.parse(localStorage.getItem('vditor_files')).map(file => file.content)).toEqual(['latest', 'second']);
    expect(setEditor).toHaveBeenLastCalledWith('a', 'latest'); expect(setEditor).toHaveBeenCalledTimes(2);
    expect(globals.syncFileToServer).not.toHaveBeenCalled();
    jest.advanceTimersByTime(500); expect(globals.syncFileToServer.mock.calls).toEqual([['a'], ['b']]);
    writer.write(files[1], 'closing'); writer.flush(); expect(globals.syncFileToServer).toHaveBeenLastCalledWith('b');
    expect(writer.write({ ...files[0], diffReadonly: true }, 'bad')).toBe(false); expect(files[0].content).toBe('latest');
});

test('storage failures do not overwrite the files or active editor', () => {
    const file = { id: 'a', content: 'original' }, setEditor = jest.fn(), showMessage = jest.fn();
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    const writer = createDiffFileWriter({ files: [file], currentFileId: 'a', showMessage }, setEditor, jest.fn());
    expect(writer.write(file, 'lost')).toBe(false); expect(file.content).toBe('original'); expect(setEditor).not.toHaveBeenCalled(); expect(showMessage).toHaveBeenCalled();
});
