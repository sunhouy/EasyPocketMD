/** @jest-environment jsdom */
// @ts-nocheck
import { collectQueryDocuments } from '../../js/ui/ai-query-files';
jest.mock('../../js/e2e', () => ({ looksLikeE2ECiphertext: text => text.startsWith('EPMD2:'), resolveFileContent: jest.fn(async text => text.replace('EPMD2:', '')) }));

describe('User-wide document collection', () => {
    let app;
    beforeEach(() => {
        global.fetch = jest.fn();
        app = { currentUser: { username: 'owner', token: 'valid', password: 'local-only' }, getApiBaseUrl: () => '/api', files: [], currentFileId: 'draft' };
    });
    it('loads cloud documents never opened locally, uses unsaved drafts and excludes hidden or other-account files', async () => {
        app.files = [{ id: 'draft', type: 'file', name: 'draft.md', content: 'old draft' }, { id: 'local', type: 'file', name: 'local.md', content: 'local-only document' }, { id: 'foreign', type: 'file', name: 'foreign.md', localCloudUsername: 'another-user', content: 'private' }];
        app.vditor = { getValue: () => 'unsaved edit' };
        const fetcher = jest.spyOn(global, 'fetch').mockImplementation(async (url, opts) => {
            expect(opts.headers.Authorization).toBe('Bearer valid');
            expect(url).not.toContain('valid'); expect(url).not.toContain('local-only');
            return { ok: true, json: async () => url.includes('/content?') ? { code: 200, data: { content: 'remote-only knowledge' } } : { code: 200, data: { files: [{ name: 'folder/remote.md' }, { name: 'draft.md' }, { name: '.ai-config.json' }, { name: 'folder/' }] } } };
        });
        const result = await collectQueryDocuments({}, app);
        expect(result.documents).toEqual([
            { path: 'draft.md', content: 'unsaved edit', fileId: 'draft' },
            { path: 'local.md', content: 'local-only document', fileId: 'local' },
            { path: 'folder/remote.md', content: 'remote-only knowledge', fileId: undefined }
        ]);
        expect(fetcher).toHaveBeenCalledTimes(2);
        expect(app.files[0].content).toBe('old draft');
    });
    it('skips encrypted documents unless explicitly included and decrypted', async () => {
        jest.spyOn(global, 'fetch').mockImplementation(async url => ({ ok: true, json: async () => url.includes('/content?') ? { code: 200, data: { content: 'EPMD2:decrypted knowledge', e2e_enabled: 1 } } : { code: 200, data: { files: [{ name: 'encrypted.md', e2e_enabled: 1 }] } } }));
        expect(await collectQueryDocuments({}, app)).toEqual({ documents: [], skipped: ['encrypted.md'] });
        expect((await collectQueryDocuments({ includeEncrypted: true }, app)).documents[0].content).toBe('decrypted knowledge');
    });
    it('reads accessible external files from disk rather than an outdated cache', async () => {
        app.currentUser = null;
        app.files = [{ id: 'disk', type: 'file', name: 'disk.md', content: 'stale cached text', isExternalLocal: true, localFileMode: 'electron', localFilePath: '/notes/disk.md' }];
        app.electron = { readLocalFile: jest.fn(async () => ({ success: true, content: 'updated disk knowledge' })) };
        expect((await collectQueryDocuments({}, app)).documents[0].content).toBe('updated disk knowledge');
        expect(app.files[0].content).toBe('stale cached text');
        app.electron.readLocalFile.mockResolvedValue({ success: false });
        expect((await collectQueryDocuments({}, app)).skipped).toEqual(['disk.md']);
    });
    it('does not send a newly encrypted local draft when the cloud flag is stale', async () => {
        app.files = [{ id: 'draft', type: 'file', name: 'private.md', content: 'private local draft', e2e_enabled: 1, isSynced: false }];
        jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ code: 200, data: { files: [{ name: 'private.md', e2e_enabled: 0 }] } }) });
        expect(await collectQueryDocuments({}, app)).toEqual({ documents: [], skipped: ['private.md'] });
    });
    it('refuses to report a full search if the cloud list cannot be loaded', async () => {
        jest.spyOn(global, 'fetch').mockRejectedValue(new Error('offline'));
        await expect(collectQueryDocuments({}, app)).rejects.toThrow('offline');
    });
    it('stops on account switching before decrypted content can reach AI', async () => {
        jest.spyOn(global, 'fetch').mockImplementation(async () => {
            app.currentUser = { username: 'other', token: 'other' };
            return { ok: true, json: async () => ({ code: 200, data: { files: [] } }) };
        });
        await expect(collectQueryDocuments({}, app)).rejects.toThrow('Account changed');
    });
    it('reports individual unreadable files and aborts on expired authentication', async () => {
        let expired = false;
        jest.spyOn(global, 'fetch').mockImplementation(async url => ({ ok: true, json: async () => url.includes('/content?') ? { code: expired ? 401 : 404, message: 'missing' } : { code: 200, data: { files: [{ name: 'missing.md' }] } } }));
        expect((await collectQueryDocuments({}, app)).skipped).toEqual(['missing.md']);
        expired = true;
        await expect(collectQueryDocuments({}, app)).rejects.toThrow('sign in again');
    });
});

it('reuses unchanged authorized cloud revisions and invalidates edited, deleted and account-switched content', async () => {
    const { clearQueryFilesCache } = await import('../../js/ui/ai-query-files'); clearQueryFilesCache();
    const app = { files: [], currentUser: { username: 'cache-owner', token: 'cache-token' } };
    let revision = 1, exists = true, reads = 0;
    global.fetch = jest.fn(async url => ({ ok: true, json: async () => {
        if (url.includes('/content?')) { reads++; return { code: 200, data: { content: 'revision ' + revision } }; }
        return { code: 200, data: { files: exists ? [{ name: 'a.md', content_version: revision }] : [] } };
    } }));
    await collectQueryDocuments({}, app); await collectQueryDocuments({}, app); expect(reads).toBe(1);
    revision = 2; expect((await collectQueryDocuments({}, app)).documents[0].content).toBe('revision 2'); expect(reads).toBe(2);
    exists = false; expect((await collectQueryDocuments({}, app)).documents).toEqual([]);
    exists = true; await collectQueryDocuments({}, app); expect(reads).toBe(3);
    app.currentUser = { username: 'another-owner', token: 'another-token' }; await collectQueryDocuments({}, app); expect(reads).toBe(4);
    window.dispatchEvent(new Event('e2e-locked')); await collectQueryDocuments({}, app); expect(reads).toBe(5);
});
