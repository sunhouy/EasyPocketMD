/** @jest-environment jsdom */
// @ts-nocheck
const { installEditorRuntime } = require('../../js/files/editor-runtime');
const { setVditorValuePreservingCursor } = require('../../js/editor-cursor');

describe('background Vditor content updates', () => {
    let runtime: ReturnType<typeof installEditorRuntime>;
    let editor: any;

    beforeEach(() => {
        jest.useFakeTimers();
        document.body.innerHTML = '<input id="search">';
        jest.spyOn(window, 'scrollTo').mockImplementation(() => {});
        const internal: any = {
            currentMode: 'wysiwyg',
            lute: { Md2VditorDOM: jest.fn() }
        };
        for (const mode of ['ir', 'sv', 'wysiwyg']) {
            const element = document.createElement('pre');
            element.tabIndex = 0;
            element.setAttribute('contenteditable', 'true');
            element.innerHTML = '<p>first</p><p>second</p>';
            document.body.appendChild(element);
            internal[mode] = { element };
        }
        let value = 'first\n\nsecond';
        editor = {
            vditor: internal,
            getValue: () => value,
            setValue: jest.fn((content: string) => {
                value = content;
                // Vditor replaces the active mode's DOM synchronously.
                internal[internal.currentMode].element.innerHTML = '<p>first</p><p>second updated</p>';
            })
        };
        runtime = installEditorRuntime({ currentFileId: 'file', vditor: editor }, {});
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    function selectSecondParagraph(offset = 3) {
        const root = editor.vditor[editor.vditor.currentMode].element;
        root.focus();
        const range = document.createRange();
        range.setStart(root.lastChild.firstChild, offset);
        range.collapse(true);
        const selection = window.getSelection()!;
        selection.removeAllRanges();
        selection.addRange(range);
        return root;
    }

    it.each(['wysiwyg', 'ir', 'sv'])('preserves the active %s cursor and scroll position', (mode) => {
        editor.vditor.currentMode = mode;
        const root = selectSecondParagraph();
        root.scrollTop = 200;
        runtime.setEditorContentForFile('file', 'updated', { preserveCursor: true });
        jest.runAllTimers();
        expect(window.getSelection()!.anchorNode).toBe(root.lastChild.firstChild);
        expect(window.getSelection()!.anchorOffset).toBe(3);
        expect(document.activeElement).toBe(root);
        expect(root.scrollTop).toBe(200);
    });

    it('captures a cursor at a paragraph element boundary', () => {
        const root = selectSecondParagraph();
        const range = document.createRange();
        range.setStart(root.lastChild, 0);
        range.collapse(true);
        window.getSelection()!.removeAllRanges();
        window.getSelection()!.addRange(range);
        expect(runtime.getDomSelectionOffsets(root)).toEqual(expect.objectContaining({ start: 5, end: 5 }));
    });

    it('does not replay an old cursor after the user moves it', () => {
        editor.vditor.currentMode = 'ir';
        const root = selectSecondParagraph();
        runtime.setEditorContentForFile('file', 'updated', { preserveCursor: true });
        const range = document.createRange();
        range.setStart(root.firstChild.firstChild, 1);
        range.collapse(true);
        window.getSelection()!.removeAllRanges();
        window.getSelection()!.addRange(range);
        jest.runAllTimers();
        expect(window.getSelection()!.anchorNode).toBe(root.firstChild.firstChild);
        expect(window.getSelection()!.anchorOffset).toBe(1);
    });

    it('preserves a backwards selection', () => {
        const root = selectSecondParagraph();
        const selection = window.getSelection()!;
        selection.setBaseAndExtent(root.lastChild.firstChild, 5, root.lastChild.firstChild, 1);
        runtime.setEditorContentForFile('file', 'updated', { preserveCursor: true });
        expect(selection.anchorNode).toBe(root.lastChild.firstChild);
        expect(selection.anchorOffset).toBe(5);
        expect(selection.focusNode).toBe(root.lastChild.firstChild);
        expect(selection.focusOffset).toBe(1);
    });

    it('leaves focus in another input during a background update', () => {
        selectSecondParagraph();
        const search = document.getElementById('search') as HTMLInputElement;
        search.focus();
        setVditorValuePreservingCursor(editor, 'updated');
        jest.runAllTimers();
        expect(document.activeElement).toBe(search);
    });

    it('does not replace unchanged content in the shared-document helper', () => {
        selectSecondParagraph();
        setVditorValuePreservingCursor(editor, editor.getValue());
        expect(editor.setValue).not.toHaveBeenCalled();
    });

    it('skips unchanged content without replacing the DOM', () => {
        const root = selectSecondParagraph();
        const node = root.lastChild.firstChild;
        runtime.setEditorContentForFile('file', editor.getValue(), { preserveCursor: true });
        expect(editor.setValue).not.toHaveBeenCalled();
        expect(window.getSelection()!.anchorNode).toBe(node);
    });
});
