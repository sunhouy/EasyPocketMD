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

test('both editors write live, keep selection, and respect readonly and IME', () => {
    jest.useFakeTimers();
    window.requestAnimationFrame = callback => setTimeout(callback, 0); window.cancelAnimationFrame = clearTimeout;
    const writes = [jest.fn(), jest.fn()];
    const editor = createDiffEditors(document.getElementById('host'), [0, 1].map(i => ({ label: 'file'+i, read: () => '# old', write: writes[i] })));
    editor.inputs.forEach((input, i) => { input.value = '# new'+i; input.setSelectionRange(3, 3); input.dispatchEvent(new Event('input')); expect(writes[i]).toHaveBeenLastCalledWith('# new'+i); });
    jest.runOnlyPendingTimers(); expect(editor.inputs[0].selectionStart).toBe(3);
    editor.inputs[0].dispatchEvent(new Event('compositionstart')); editor.inputs[0].value = '中文'; editor.inputs[0].dispatchEvent(new Event('input'));
    expect(writes[0]).toHaveBeenCalledTimes(1); editor.inputs[0].dispatchEvent(new Event('compositionend')); expect(writes[0]).toHaveBeenLastCalledWith('中文');
    editor.destroy(); expect(document.querySelector('textarea')).toBeNull();
    const readonly = createDiffEditors(document.getElementById('host'), [{ label: 'history', read: () => 'old' }, { label: 'current', read: () => 'new', write: writes[1] }]);
    expect(readonly.inputs[0].readOnly).toBe(true); expect(readonly.inputs[1].readOnly).toBe(false); readonly.destroy();
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
