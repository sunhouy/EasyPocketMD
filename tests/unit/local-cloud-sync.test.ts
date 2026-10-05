/** @jest-environment jsdom */
// @ts-nocheck
import { createSyncRuntimeApi } from '../../js/files/sync';
import { isExternalLocalFile } from '../../js/files/external';
jest.mock('../../js/files/websocket-sync', () => ({ createWebSocketClient: jest.fn(), createSyncThrottle: jest.fn() }));
jest.mock('../../js/e2e', () => ({ resolveFileContent: async content => content }));

function fixture(write, read) {
    const file = { id: 'local', name: 'note.md', type: 'file', content: 'edit', isExternalLocal: true, localFileMode: 'tauri', localAccessState: 'ready' };
    const app = { files: [file], currentUser: { username: 'user', token: 'token' }, currentFileId: 'local', lastSyncedContent: {}, unsavedChanges: {}, pendingServerSync: {}, showMessage: jest.fn() };
    let text = 'edit';
    const api = createSyncRuntimeApi({ globalRef: app, g: k => app[k], isExternalLocalFile,
        getCurrentEditorContent: () => text, setEditorContentForFile: (_, value) => { text = value; },
        markPendingServerSync: (id, value) => { app.pendingServerSync[id] = value; }, tryHandleTokenExpired: async () => false,
        writeExternalLocalContent: write, readExternalSourceContent: read, isEn: () => false });
    return { file, app, api, edit: value => { text = value; } };
}
describe('local and cloud acknowledgements', () => {
    afterEach(() => jest.restoreAllMocks());
    it('does not upload or mark saved when the original cannot be written', async () => {
        const { api, file } = fixture(async () => ({ success: false }));
        global.fetch = jest.fn();
        expect(await api.syncFileToServer('local')).toBe(false);
        expect(fetch).not.toHaveBeenCalled(); expect(file.isSynced).not.toBe(true);
    });
    it('writes edits locally before cloud upload, and writes server merged content back', async () => {
        const events = [];
        const write = jest.fn(async (_, content) => { events.push(content); return { success: true }; });
        const { api, file } = fixture(write);
        global.fetch = jest.fn(async url => { if (!String(url).endsWith('/local-origin')) events.push('upload'); return { json: async () => ({ code: 200, data: { content: 'merged', content_version: 2 } }) }; });
        expect(await api.syncFileToServer('local')).toBe(true);
        expect(events).toEqual(['edit', 'upload', 'merged']);
        expect(file.localSyncedContent).toBe('merged'); expect(file.localCloudUsername).toBe('user');
        expect(file.content).toBe('merged');
    });
    it('preserves edits made while a cloud save is in flight', async () => {
        const { api, app, file, edit } = fixture(async () => ({ success: true }));
        global.fetch = jest.fn(async () => { edit('newer draft'); return { json: async () => ({ code: 200, data: { content: 'edit', content_version: 1 } }) }; });
        expect(await api.syncFileToServer('local')).toBe(true);
        expect(file.content).toBe('newer draft'); expect(file.isSynced).toBe(false);
        expect(app.unsavedChanges.local).toBe(true); expect(app.pendingServerSync.local).toBe(true);
    });
});

describe('local save wrapper retains concurrent drafts', () => {
    it('does not clear a pending newer edit after an older cloud acknowledgement', async () => {
        const { installSyncRuntime } = await import('../../js/files/sync-runtime');
        const file = { id: 'local', type: 'file', content: 'new draft', isExternalLocal: true, localAccessState: 'ready' };
        const app = { files: [file], currentFileId: 'local', currentUser: { username: 'user' },
            lastSyncedContent: { local: 'older revision' }, unsavedChanges: { local: true }, pendingServerSync: { local: true },
            syncFileToServer: async () => true };
        const rt = installSyncRuntime(app, { getCurrentEditorContent: () => 'new draft' }, {});
        expect(await rt.syncFileAfterSaveIfNeeded('local', file, 'older revision', false, true)).toBe(false);
        expect(app.unsavedChanges.local).toBe(true); expect(app.pendingServerSync.local).toBe(true);
    });
    it('restores a cached write-failure draft after a restart instead of overwriting it with disk', async () => {
        const { installSyncRuntime } = await import('../../js/files/sync-runtime');
        const file = { id: 'local', type: 'file', content: 'unsaved recovery draft', isExternalLocal: true, localFileMode: 'tauri', localPendingWrite: true };
        const app = { files: [file], unsavedChanges: {}, lastSyncedContent: {}, electron: { readLocalFile: async () => ({ success: true, content: 'old disk text' }) } };
        const rt = installSyncRuntime(app, {}, {});
        expect(await rt.ensureExternalLocalAccess(file)).toBe(true);
        expect(file.content).toBe('unsaved recovery draft'); expect(app.unsavedChanges.local).toBe(true);
    });
});

describe('version-aware offline reconciliation', () => {
    beforeEach(() => localStorage.clear());
    afterEach(() => jest.restoreAllMocks());
    it('automatically merges independent edits and writes them to the original', async () => {
        const write = jest.fn(async () => ({ success: true }));
        const { app, file, edit } = fixture(write);
        const base = 'one\ntwo\nthree', local = 'ONE\ntwo\nthree', remote = 'one\ntwo\nTHREE';
        Object.assign(file, { content: local, crdtBaseContent: base, contentVersion: 1, isSynced: false }); edit(local); app.unsavedChanges.local = true;
        await app.reconcileRemoteFile(file, { content: remote, content_version: 2 });
        expect(file.content).toBe('ONE\ntwo\nTHREE'); expect(file.crdtBaseContent).toBe(remote); expect(file.contentVersion).toBe(2);
        expect(write).toHaveBeenCalledWith(file, 'ONE\ntwo\nTHREE'); expect(app.pendingServerSync.local).toBe(true);
    });
    it('retains both versions and does not advance the base on overlapping edits', async () => {
        const { app, file } = fixture(async () => ({ success: true })); app.currentFileId = 'other';
        Object.assign(file, { content: 'local', crdtBaseContent: 'original', contentVersion: 1, isSynced: false });
        await app.reconcileRemoteFile(file, { content: 'remote', content_version: 2 });
        expect(file.content).toBe('local'); expect(file.contentVersion).toBe(1); expect(file.syncConflict).toBe(true);
        expect(file.syncConflictRemoteContent).toBe('remote'); expect(JSON.parse(localStorage.getItem('epm-file:local'))[0].content).toBe('local');
    });
    it('does not attempt network writes while offline', async () => {
        jest.spyOn(navigator, 'onLine', 'get').mockReturnValue(false); global.fetch = jest.fn();
        const { api } = fixture(async () => ({ success: true })); expect(await api.syncFileToServer('local')).toBe(false); expect(fetch).not.toHaveBeenCalled();
    });
    it('treats other-device local sources as editable cloud copies', () => {
        expect(isExternalLocalFile({ type: 'file', isExternalLocal: true, localFileMode: 'remote' })).toBe(false);
    });
});

test('metadata refresh retains dirty drafts even if the cloud document was deleted', async () => {
    const { installSyncRuntime } = await import('../../js/files/sync-runtime');
    localStorage.clear(); jest.useFakeTimers();
    const file = { id: 'deleted-cloud', name: 'a.md', type: 'file', content: 'offline edit', isSynced: true, contentLoaded: true };
    const app = { files: [file], currentUser: { username: 'user', token: 'token' }, unsavedChanges: { 'deleted-cloud': true }, pendingServerSync: {}, lastSyncedContent: { 'deleted-cloud': 'original' }, showSyncStatus: jest.fn() };
    const rt = installSyncRuntime(app, { syncCurrentEditorSnapshotIntoFiles: () => {} }, { loadFiles: () => {}, shouldAutoOpenInitialFile: () => false });
    global.fetch = jest.fn(async () => ({ json: async () => ({ code: 200, data: { files: [] } }) }));
    try { await rt.loadFilesFromServer(); expect(app.files).toHaveLength(1); expect(app.files[0].content).toBe('offline edit'); }
    finally { jest.clearAllTimers(); jest.useRealTimers(); }
});


test('cloud reception preserves edits made directly to the original local file', async () => {
    const write = jest.fn(async () => ({ success: true }));
    const { app, file, edit } = fixture(write, async () => 'ONE\ntwo\nthree');
    Object.assign(file, { content: 'one\ntwo\nthree', crdtBaseContent: 'one\ntwo\nthree', contentVersion: 1, isSynced: true }); edit(file.content);
    await app.reconcileRemoteFile(file, { content: 'one\ntwo\nTHREE', content_version: 2 });
    expect(file.content).toBe('ONE\ntwo\nTHREE'); expect(write).toHaveBeenCalledWith(file, 'ONE\ntwo\nTHREE');
});
test('overlap between disk and editor retains a third snapshot without overwriting disk', async () => {
    const write = jest.fn(async () => ({ success: true }));
    const { app, file } = fixture(write, async () => 'disk edit'); app.currentFileId = 'other';
    Object.assign(file, { content: 'editor edit', crdtBaseContent: 'original', contentVersion: 1, isSynced: false });
    await app.reconcileRemoteFile(file, { content: 'cloud edit', content_version: 2 });
    expect(write).not.toHaveBeenCalled(); expect(file.syncConflict).toBe(true); expect(file.syncConflictDiskContent).toBe('disk edit');
});


test('background reconciliation caches even empty content across a restart', async () => {
    const { installSyncRuntime } = await import('../../js/files/sync-runtime');
    const { app, file } = fixture(async () => ({ success: true })); app.currentFileId = 'other';
    Object.assign(file, { isExternalLocal: false, content: 'old', contentVersion: 1, isSynced: true });
    await app.reconcileRemoteFile(file, { content: '', content_version: 2 });
    const { restoreFiles } = await import('../../js/files/sync/local-state');
    const restored = { id: 'local', type: 'file', lastModified: 0 };
    restoreFiles([restored]);
    const rt = installSyncRuntime(app, {}, {});
    expect(restored.content).toBe(''); expect(restored.contentFetchedAt).toBeGreaterThan(0);
    expect(rt.needsServerFileContentFetch(restored)).toBe(false);
});

test('cloud save acknowledgement records a complete cache for an empty document', async () => {
    const { installSyncRuntime } = await import('../../js/files/sync-runtime');
    const { app, api, file, edit } = fixture(async () => ({ success: true }));
    Object.assign(file, { isExternalLocal: false, content: '', contentLoaded: false }); edit('');
    global.fetch = jest.fn(async () => ({ json: async () => ({ code: 200, data: { content: '', content_version: 3 } }) }));
    expect(await api.syncFileToServer(file.id)).toBe(true);
    expect(file.contentLoaded).toBe(true); expect(file.contentFetchedAt).toBeGreaterThan(0);
    expect(installSyncRuntime(app, {}, {}).needsServerFileContentFetch(file)).toBe(false);
});

test('background pulls update content without a success notification', async () => {
    const { installSyncRuntime } = await import('../../js/files/sync-runtime');
    const file = { id: 'quiet', name: 'quiet.md', type: 'file', content: 'old', contentVersion: 1, isSynced: true };
    const app = { files: [file], currentUser: { username: 'user', token: 'token' }, lastSyncedContent: { quiet: 'old' }, unsavedChanges: {}, pendingServerSync: {}, showSyncStatus: jest.fn(), loadFiles: jest.fn() };
    const rt = installSyncRuntime(app, {}, {});
    global.fetch = jest.fn(async () => ({ json: async () => ({ code: 200, data: { files: [{ name: 'quiet.md', content: 'new', content_version: 2 }] } }) }));
    await rt.pullServerUpdatesForCleanFiles();
    expect(file.content).toBe('new'); expect(app.showSyncStatus).not.toHaveBeenCalled();
    expect(rt.needsServerFileContentFetch(file)).toBe(false);
});


test('background sync does not prompt to unlock encrypted files', async () => {
    const {app, api, file} = fixture(async () => ({success:true}));
    file.e2e_enabled = 1;
    app.E2EVault = {initialize: jest.fn(async()=>{}),state:()=>({config:{},unlocked:false})};
    global.fetch = jest.fn();
    expect(await api.syncFileToServer(file.id,{background:true})).toBe(false);
    await app.reconcileRemoteFile(file,{content:'cipher',content_version:8,e2e_enabled:1});
    expect(fetch).not.toHaveBeenCalled(); expect(file.content).toBe('edit'); expect(file.remoteContentVersion).toBe(8);
});


test('loading file metadata initializes encryption without asking to unlock', async () => {
    const {installSyncRuntime} = await import('../../js/files/sync-runtime');
    const previous = window.E2EVault;
    const vault = {initialize:jest.fn(async()=>{}),ensureUnlocked:jest.fn(async()=>{throw Error('must not prompt');}),state:()=>({config:{},loaded:true,unlocked:false})};
    window.E2EVault = vault;
    const app = {E2EVault:vault,files:[],currentUser:{username:'user',token:'token'},unsavedChanges:{},pendingServerSync:{},lastSyncedContent:{},showSyncStatus:jest.fn()};
    const rt=installSyncRuntime(app,{syncCurrentEditorSnapshotIntoFiles:()=>{}},{loadFiles:()=>{},loadLocalFiles:jest.fn(),shouldAutoOpenInitialFile:()=>false});
    global.fetch=jest.fn(async()=>({json:async()=>({code:200,data:{files:[{name:'locked.md',e2e_enabled:1,content:'EPMD2:locked',content_version:1}]}})}));
    try { await rt.loadFilesFromServer(); expect(vault.ensureUnlocked).not.toHaveBeenCalled(); expect(app.files[0].name).toBe('locked.md'); expect(app.showSyncStatus).not.toHaveBeenCalled(); }
    finally { window.E2EVault=previous; }
});

test('encryption session expiry does not invalidate the account token', async()=>{
    const {installSyncRuntime}=await import('../../js/files/sync-runtime');
    const app={currentUser:{username:'user',token:'valid'},handleTokenExpired:jest.fn(),isTokenError:()=>true};
    const rt=installSyncRuntime(app,{},{});
    expect(await rt.tryHandleTokenExpired({e2eKey:'e2eSessionExpired',message:'端到端加密会话已过期'})).toBe(false);
    expect(app.handleTokenExpired).not.toHaveBeenCalled();expect(app.currentUser.token).toBe('valid');
});


test('clean cached content accepts a newer cloud revision without becoming a conflict',async()=>{
    const {installSyncRuntime}=await import('../../js/files/sync-runtime');
    const local={id:'note',name:'note.md',type:'file',content:'old',contentVersion:1,isSynced:true};
    const app={currentUser:{username:'user',token:'token'},files:[local],lastSyncedContent:{note:'old'},unsavedChanges:{},pendingServerSync:{}};
    const rt=installSyncRuntime(app,{},{});
    rt.mergeFiles([local],[{name:'note.md',type:'file',content:'new',contentVersion:2,contentLoaded:true}]);
    await rt.syncRuntimeApi.waitForFileSync();
    expect(app.files[0].content).toBe('new');expect(app.files[0].isSynced).toBe(true);expect(app.pendingServerSync.note).not.toBe(true);expect(app.files[0].syncConflict).not.toBe(true);
});

test('metadata refresh preserves real local edits and their merge base',async()=>{
    const {installSyncRuntime}=await import('../../js/files/sync-runtime');
    const local={id:'note',name:'note.md',type:'file',content:'edited',contentVersion:1,isSynced:false,crdtBaseContent:'old'};
    const app={files:[local],lastSyncedContent:{note:'old'},unsavedChanges:{note:true},pendingServerSync:{note:true}};
    installSyncRuntime(app,{},{}).mergeFiles([local],[{name:'note.md',type:'file',content:'cloud edit',contentVersion:2,contentLoaded:true}]);
    expect(app.files[0].content).toBe('edited');expect(app.files[0].crdtBaseContent).toBe('old');expect(app.files[0].isSynced).toBe(false);
});


it.each([false,true])('first login replaces only an untouched guest welcome: edited=%s',async(edited)=>{
    const {installSyncRuntime}=await import('../../js/files/sync-runtime');
    jest.useFakeTimers();
    const content='# 欢迎使用 EasyPocketMD\n\n这是一个新的文档。\n\n开始编写吧！'+(edited?' edited':'');
    const guest={id:'guest',name:'未命名文档',type:'file',content,isSynced:false,autoCreatedGuestWelcome:true};
    const app={files:[guest],currentFileId:'guest',currentUser:{username:'user',token:'token'},lastSyncedContent:{},unsavedChanges:{},pendingServerSync:{},showSyncStatus:jest.fn()};
    const rt=installSyncRuntime(app,{getCurrentEditorContent:()=>content,syncCurrentEditorSnapshotIntoFiles:()=>{}},{loadFiles:()=>{},shouldAutoOpenInitialFile:()=>false});
    global.fetch=jest.fn(async()=>({json:async()=>({code:200,data:{files:[{name:'cloud.md',content:'cloud',content_version:2}]}})}));
    try {await rt.loadFilesFromServer();expect(app.files.some(f=>f.id==='guest')).toBe(edited);expect(app.files.find(f=>f.id==='guest')?.serverDeleted).not.toBe(true);expect(app.files.some(f=>f.name==='cloud.md')).toBe(true);}
    finally {jest.clearAllTimers();jest.useRealTimers();}
});
