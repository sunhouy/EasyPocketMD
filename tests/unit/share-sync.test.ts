/** @jest-environment jsdom */
// @ts-nocheck
jest.mock('../../css/share-collaboration.css', () => ({}));
jest.mock('../../js/page/share-history', () => ({ showSharedEditHistory: jest.fn() }));
require('../../js/page/share-runtime');
import { installEditorComposition } from '../../js/editor-composition';

describe('Shared document acknowledgement and session isolation', () => {
    let socket, editor, removeComposition;
    class FakeSocket {
        static OPEN = 1;
        readyState = 1;
        sent = [];
        constructor() { socket = this; }
        send(raw) { this.sent.push(JSON.parse(raw)); }
        close() {}
    }
    function activate(content = 'A\nB', id = 's') {
        editor.setValue(content);
        window.activateSharedDocumentSession({ share_id: id, mode: 'edit', username: 'owner', filename: 'x.md', content, content_version: 1 }, { canEdit: true, viewerId: 'my-session' });
        socket.onopen();
    }
    function receive(payload) { socket.onmessage({ data: JSON.stringify(payload) }); }
    beforeEach(() => {
        jest.useFakeTimers();
        document.body.innerHTML = '<div id="vditor"><pre contenteditable="true"></pre></div><div class="mobile-bottom-bar" style="display:flex"></div>';
        const element = document.querySelector('pre');
        editor = { vditor: { currentMode: 'sv', sv: { element } }, getValue: () => element.textContent, setValue: text => { element.textContent = text; } };
        window.vditor = editor; window.WebSocket = FakeSocket; window.currentUser = null;
        window.getApiBaseUrl = () => '/api';
        activate();
        removeComposition = installEditorComposition(window);
    });
    afterEach(() => { removeComposition(); window.deactivateSharedDocumentSession(); jest.useRealTimers(); });
    it('waits for the final IME input before sending a shared-document update', async () => {
        window.fetch = jest.fn(async () => ({ json: async () => ({ code: 200, data: { changed: false } }) }));
        const root = document.querySelector('pre');
        root.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
        editor.setValue('A lie biao\nB');
        await expect(window.scheduleSharedDocSync({ manualSave: true })).resolves.toBe(false);
        await jest.advanceTimersByTimeAsync(6000);
        expect(socket.sent.filter(item => item.type === 'update_content')).toHaveLength(0);
        root.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
        editor.setValue('A 列表\nB'); root.dispatchEvent(new InputEvent('input', { bubbles: true }));
        await jest.advanceTimersByTimeAsync(1000);
        expect(socket.sent.find(item => item.type === 'update_content').content).toBe('A 列表\nB');
    });
    it('rebases continued typing over a merged acknowledgement instead of losing either editor’s text', async () => {
        editor.setValue('A local\nB');
        const saved = window.scheduleSharedDocSync({ manualSave: true });
        expect(socket.sent.at(-1).content).toBe('A local\nB');
        editor.setValue('A local!\nB');
        receive({ type: 'doc_updated', updated_by: 'my-session', content: 'A local\nB remote', content_version: 3 });
        expect(await saved).toBe(true);
        expect(editor.getValue()).toBe('A local!\nB remote');
        expect(window.sharedDocState.lastKnownContent).toBe('A local\nB remote');
    });
    it('keeps the old ancestry while deferring a remote update for an unsaved draft', () => {
        editor.setValue('A local\nB');
        receive({ type: 'doc_updated', updated_by: 'other', content: 'A\nB remote', content_version: 2 });
        expect(editor.getValue()).toBe('A local\nB');
        expect(window.sharedDocState.contentVersion).toBe(1);
        expect(window.sharedDocState.lastKnownContent).toBe('A\nB');
    });
    it('locks and restores editor and mobile controls upon live permission changes', () => {
        receive({ type: 'permission_changed', can_edit: false });
        expect(document.querySelector('pre').getAttribute('contenteditable')).toBe('false');
        expect(document.querySelector('.mobile-bottom-bar').style.display).toBe('none');
        receive({ type: 'permission_changed', can_edit: true });
        expect(document.querySelector('pre').getAttribute('contenteditable')).toBe('true');
        expect(document.querySelector('.mobile-bottom-bar').style.display).toBe('flex');
    });
    it('ignores events from a previous document’s socket', () => {
        const old = socket; activate('new document', 'other-share');
        old.onclose();
        old.onmessage({ data: JSON.stringify({ type: 'doc_updated', content: 'old document', content_version: 100 }) });
        expect(window.sharedDocState.ws).toBe(socket);
        expect(editor.getValue()).toBe('new document');
        expect(window.sharedDocState.contentVersion).toBe(1);
    });
});
