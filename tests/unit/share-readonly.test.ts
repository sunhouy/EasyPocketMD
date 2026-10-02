/** @jest-environment jsdom */
import { createSharedReadOnlyGuard } from '../../js/page/share-readonly';
import { anchorCursorOffset, contentFingerprint, markdownOffsetAt } from '../../js/page/share-cursors';

describe('Shared reading without a mask', () => {
    let guard: ReturnType<typeof createSharedReadOnlyGuard>;
    beforeEach(() => {
        document.body.innerHTML = '<div id="fileSwitchLoadingOverlay"></div><div id="vditor"><div class="vditor-mask"></div><div class="vditor-toolbar"><button>Bold</button></div><div id="text" contenteditable="true">Readable text</div><div id="chart" contenteditable="false">Chart</div></div>';
        guard = createSharedReadOnlyGuard(document.getElementById('vditor')!);
    });
    afterEach(() => guard.destroy());
    it('blocks mutations while preserving selection and chart interaction', () => {
        guard.setLocked(true);
        const text = document.getElementById('text')!;
        expect(text.getAttribute('contenteditable')).toBe('false');
        expect(document.querySelector('.vditor-mask')).toBeNull();
        expect(document.getElementById('fileSwitchLoadingOverlay')).toBeNull();
        expect(text.dispatchEvent(new Event('beforeinput', { bubbles: true, cancelable: true }))).toBe(false);
        expect(text.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, bubbles: true, cancelable: true }))).toBe(true);
        expect(text.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))).toBe(true);
        expect(document.getElementById('chart')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))).toBe(true);
        guard.setLocked(false);
        expect(text.getAttribute('contenteditable')).toBe('true');
        expect(document.getElementById('chart')!.getAttribute('contenteditable')).toBe('false');
    });
    it('keeps newly rendered editor nodes locked after a remote update', async () => {
        guard.setLocked(true);
        document.getElementById('vditor')!.insertAdjacentHTML('beforeend', '<p id="new" contenteditable="true">Remote text</p>');
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(document.getElementById('new')!.getAttribute('contenteditable')).toBe('false');
    });
    it('blocks task-checkbox clicks that Vditor handles outside beforeinput', () => {
        const input = document.createElement('input'); input.type = 'checkbox';
        document.getElementById('text')!.append(input);
        const handler = jest.fn(); document.getElementById('vditor')!.addEventListener('click', handler);
        guard.setLocked(true);
        expect(input.disabled).toBe(true);
        input.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        expect(input.checked).toBe(false); expect(handler).not.toHaveBeenCalled();
        guard.setLocked(false); expect(input.disabled).toBe(false);
        input.click(); expect(input.checked).toBe(true);
    });
});

describe('Cursor anchors', () => {
    it('follows intact text after a preceding insertion and suppresses an overwritten anchor', () => {
        const cursor = { markdown_offset: 3, context_before: 'abc', context_after: 'def' };
        expect(anchorCursorOffset(cursor, 'NEW abcdef')).toBe(7);
        expect(anchorCursorOffset(cursor, 'abc XYZ def')).toBeNull();
        expect(contentFingerprint('abc')).not.toBe(contentFingerprint('abcd'));
    });
    it('uses the active source surface instead of a hidden WYSIWYG node', () => {
        document.body.innerHTML = '<div id="sv"># Heading\nText</div><div id="wys">Heading</div>';
        const sv = document.getElementById('sv')!;
        const editor = { vditor: { currentMode: 'sv', sv: { element: sv }, wysiwyg: { element: document.getElementById('wys') } } };
        expect(markdownOffsetAt(editor, sv.firstChild!, 12)).toBe(12);
        expect(markdownOffsetAt(editor, document.getElementById('wys')!.firstChild!, 2)).toBeNull();
    });
});
