/** @jest-environment jsdom */
// @ts-nocheck
export {};
const e2e = require('../../js/e2e');
describe('current file encryption transitions', () => {
    let file, text;
    beforeEach(() => {
        document.body.innerHTML = '<div id="vditor"><div contenteditable="true"></div></div>';
        file = { id: 'note', name: 'note.md', type: 'file', content: '# 正文', e2e_enabled: 1, e2eEnabled: true };
        text = file.content;
        window.files = [file]; window.currentFileId = 'note';
        window.currentUser = { username: 'user', token: 'token', password: 'secret' };
        window.lastSyncedContent = { note: text }; window.unsavedChanges = {}; window.pendingServerSync = {};
        window.$ = { fn: {} };
        window.vditorReady = true;
        window.vditor = { vditor: { lute: { Md2VditorDOM: value => value } }, getValue: () => text, setValue: value => { text = value; } };
        window.showMessage = jest.fn(); window.getApiBaseUrl = () => '/api';
        require('../../js/files/runtime-core');
        window.waitForFileSync = async () => [];
        global.fetch = jest.fn(async (_, options) => {
            const request = JSON.parse(options.body);
            return { json: async () => ({ code: 200, data: { content: request.content, e2e_enabled: request.e2e_enabled, content_version: 2 } }) };
        });
    });
    it('turns encrypted content into a saved plaintext file without showing ciphertext', async () => {
        file.content = await e2e.encrypt('# 正文', 'secret'); text = file.content;
        expect(await window.toggleCurrentFileE2E()).toBe(true);
        expect(file.e2e_enabled).toBe(0);
        expect(file.content).toBe('# 正文'); expect(text).toBe('# 正文');
        expect(window.pendingServerSync.note).toBeFalsy();
    });
    it('enables encryption without replacing the editor with the encrypted server reply', async () => {
        file.e2e_enabled = 0; file.e2eEnabled = false;
        expect(await window.toggleCurrentFileE2E()).toBe(true);
        const request = JSON.parse(fetch.mock.calls[0][1].body);
        expect(request.e2e_enabled).toBe(1);
        expect(await e2e.decrypt(request.content, 'secret')).toBe('# 正文');
        expect(file.content).toBe('# 正文'); expect(text).toBe('# 正文');
    });
    it('waits for old saves and rejects a duplicate toggle while the transition is active', async () => {
        let release;
        window.waitForFileSync = jest.fn(() => new Promise(resolve => { release = resolve; }));
        const transition = window.toggleCurrentFileE2E();
        expect(fetch).not.toHaveBeenCalled();
        expect(file.e2e_enabled).toBe(1);
        expect(await window.toggleCurrentFileE2E()).toBe(false);
        release();
        expect(await transition).toBe(true);
        expect(fetch).toHaveBeenCalledTimes(1);
    });
    it('rolls back encryption metadata after a failed save while retaining the editable text', async () => {
        fetch.mockResolvedValueOnce({ json: async () => ({ code: 500, message: 'failed' }) });
        expect(await window.toggleCurrentFileE2E()).toBe(false);
        expect(file.e2e_enabled).toBe(1); expect(file.e2eEnabled).toBe(true);
        expect(file.content).toBe('# 正文'); expect(text).toBe('# 正文');
        expect(file.e2eTransition).toBeUndefined();
        expect(document.querySelector('[contenteditable]').getAttribute('contenteditable')).toBe('true');
    });
    it.each([0, '0', 1, '1'])('uses the normalized default %s for new files', async value => {
        window.files = []; window.currentUser.e2e_enabled = value;
        window.createDefaultFile();
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(window.files[0].e2e_enabled).toBe(Number(value));
        expect(window.files[0].e2eEnabled).toBe(!!Number(value));
    });
});
