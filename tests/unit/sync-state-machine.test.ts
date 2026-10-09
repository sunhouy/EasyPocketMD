/** @jest-environment jsdom */
// @ts-nocheck
import { createSyncRuntimeApi } from '../../js/files/sync';
import { installSyncRuntime } from '../../js/files/sync-runtime';
import { persistFile, restoreFiles, restoreFileFromDB, syncStatus } from '../../js/files/sync/local-state';
jest.mock('../../js/files/websocket-sync', () => ({ createWebSocketClient: jest.fn(), createSyncThrottle: jest.fn() }));
jest.mock('../../js/e2e', () => ({ resolveFileContent: async content => content }));
function fixture() {
    const file = {id:'note', name:'note.md', type:'file', content:'base', contentLoaded:true, contentVersion:1, crdtBaseContent:'base', crdtBaseContentVersion:1,isSynced:true};
    const app = {files:[file], currentFileId:'note',currentUser:{username:'user',token:'token'}, lastSyncedContent:{note:'base'},unsavedChanges:{},pendingServerSync:{}};
    let draft = 'first';
    const rt = installSyncRuntime(app,{getCurrentEditorContent:()=>draft,setEditorContentForFile:(_,value)=>{draft=value;}},{});
    return {file,app,rt,api:rt.syncRuntimeApi,edit:value=>{draft=value;},text:()=>draft};
}
const response = (content,version,code=200) => ({json:async()=>({code,data:{content,content_version:version}})});
beforeEach(()=>localStorage.clear());
afterEach(()=>jest.restoreAllMocks());
it('uses the server modification date for an unchanged acknowledgement and preserves a newer local edit date',async()=>{
    const old='2020-01-01T00:00:00Z';
    const f=fixture();f.edit('base');f.file.lastModified=Date.now();
    global.fetch=jest.fn(async()=>({json:async()=>({code:200,data:{content:'base',content_version:1,last_modified:old}})}));
    await f.api.syncFileToServer('note',{background:true});expect(f.file.lastModified).toBe(old);
    let reply;f.edit('first');f.file.lastModified=100;
    global.fetch=jest.fn(()=>new Promise(resolve=>reply=resolve));const save=f.api.syncFileToServer('note',{background:true});
    for(let i=0;i<50&&!reply;i++)await Promise.resolve();
    f.edit('second');f.file.lastModified=200;
    reply({json:async()=>({code:200,data:{content:'first',content_version:2,last_modified:old}})});
    await save;expect(f.file.lastModified).toBe(200);expect(f.file.serverLastModified).toBe(old);
});
it('keeps the original remote date when reconciling already synced content',async()=>{
    const f=fixture();f.edit('base');f.file.lastModified=Date.now();
    await f.app.reconcileRemoteFile(f.file,{content:'base',content_version:1,last_modified:'2020-01-01T00:00:00Z'});
    expect(f.file.lastModified).toBe('2020-01-01T00:00:00Z');
});
it('repairs clean cached dates from metadata without changing dirty file dates',()=>{
    const f=fixture();f.edit('base');f.file.lastModified=Date.now();
    const remote={name:'note.md',type:'file',contentVersion:1,lastModified:'2020-01-01T00:00:00Z',contentLoaded:false};
    f.rt.mergeFiles([{...f.file}],[remote]);expect(f.file.lastModified).toBe(remote.lastModified);
    f.file.isSynced=false;f.file.lastModified=123;f.app.unsavedChanges.note=true;
    f.rt.mergeFiles([{...f.file}],[remote]);expect(f.file.lastModified).toBe(123);
});
it('does not spin for an open file with a persisted busy flag, and clears real saves on acknowledgement',async()=>{
    const f=fixture();f.file.syncBusy=true;expect(syncStatus(f.file,true,false)).toBe('synced');let reply;
    global.fetch=jest.fn(()=>new Promise(resolve=>reply=resolve));const save=f.api.syncFileToServer('note',{background:true});
    for(let i=0;i<50&&!reply;i++)await Promise.resolve();expect(syncStatus(f.file,true,true)).toBe('syncing');
    reply(response('first',2));await save;expect(syncStatus(f.file,true,false)).toBe('synced');
});
it('clears the active state if preparation fails before a cloud request is sent',async()=>{
    const f=fixture();f.file.contentLoaded=false;global.fetch=jest.fn(async()=>{throw Error('unavailable');});
    // A preparatory content request fails before the save body can be built.
    f.api=createSyncRuntimeApi({globalRef:f.app,g:key=>f.app[key],getCurrentEditorContent:f.text,setEditorContentForFile:jest.fn(),
        markPendingServerSync:jest.fn(),tryHandleTokenExpired:async()=>false,isExternalLocalFile:()=>false,isEn:()=>false,fetchServerFileContent:async()=>{throw Error('offline');}});
    expect(await f.api.syncFileToServer('note',{background:true})).toBe(false);expect(syncStatus(f.file,true,false)).toBe('synced');expect(fetch).not.toHaveBeenCalled();
});
it('refreshes metadata during a save without replacing its draft, record, array, or acknowledgement',async()=>{
    const f=fixture(), array=f.app.files; let reply;
    global.fetch=jest.fn(()=>new Promise(resolve=>{reply=resolve;}));
    const pending=f.api.syncFileToServer('note',{background:true});
    for(let i=0;i<50&&!reply;i++) await Promise.resolve();
    f.edit('second');
    f.rt.mergeFiles([{...f.file}],[{name:'note.md',type:'file',content:undefined,contentVersion:2}]);
    expect(f.app.files).toBe(array);expect(f.app.files[0]).toBe(f.file);
    expect(f.file.crdtBaseContentVersion).toBe(1);
    reply(response('first',2));await pending;
    expect(f.file.content).toBe('second');expect(f.file.crdtBaseContent).toBe('first');expect(f.file.crdtBaseContentVersion).toBe(2);
    expect(f.file.isSynced).toBe(false);expect(f.file.syncConflict).not.toBe(true);
});
it('serializes repeated saves and captures the newest draft after the preceding acknowledgement',async()=>{
    const f=fixture();let reply;
    global.fetch=jest.fn().mockImplementationOnce(()=>new Promise(resolve=>{reply=resolve;})).mockImplementationOnce(async(_,options)=>{
        expect(JSON.parse(options.body)).toMatchObject({content:'second',base_content:'first',base_content_version:2});return response('second',3);
    });
    const first=f.api.syncFileToServer('note',{background:true});
    for(let i=0;i<50&&!reply;i++)await Promise.resolve();
    f.edit('second'); const second=f.api.syncFileToServer('note',{background:true});
    expect(fetch).toHaveBeenCalledTimes(1);reply(response('first',2));await Promise.all([first,second]);
    expect(fetch).toHaveBeenCalledTimes(2);expect(f.file.content).toBe('second');expect(f.file.isSynced).toBe(true);
});
it('waits for the save acknowledgement before treating an own broadcast as a remote edit',async()=>{
    const f=fixture();let reply;
    global.fetch=jest.fn(()=>new Promise(resolve=>{reply=resolve;}));
    const pending=f.api.syncFileToServer('note',{background:true});
    for(let i=0;i<50&&!reply;i++)await Promise.resolve();
    f.edit('second');const incoming=f.app.reconcileRemoteFile(f.file,{content:'first',content_version:2});
    await Promise.resolve();expect(f.file.contentVersion).toBe(1);expect(f.file.syncConflict).not.toBe(true);
    reply(response('first',2));await Promise.all([pending,incoming]);
    expect(f.text()).toBe('second');expect(f.file.content).toBe('second');expect(f.file.crdtBaseContent).toBe('first');expect(f.file.syncConflict).not.toBe(true);
});
it('recognizes any unconfirmed lifecycle snapshot after reload, including one older than the last two sends',async()=>{
    const f=fixture();navigator.sendBeacon=jest.fn(()=>true);
    for(const value of ['first','second','third','latest']){f.edit(value);expect(f.api.syncCurrentFileWithBeacon()).toBe(true);}
    const restored=[{id:'note',content:'base',lastModified:Date.now()+86400000}];restoreFiles(restored);
    expect(restored[0].content).toBe('latest');expect(restored[0].cloudSaveReceipts).toHaveLength(4);
    expect(restored[0].cloudSaveReceipts[0]).not.toHaveProperty('content');
    Object.assign(f.file,restored[0]);
    await f.app.reconcileRemoteFile(f.file,{content:'first',content_version:2});
    expect(f.file.content).toBe('latest');expect(f.file.syncConflict).not.toBe(true);expect(f.file.crdtBaseContentVersion).toBe(2);
});
it('retains the actual editor draft when another device makes overlapping changes',async()=>{
    const f=fixture();f.edit('local edit');f.app.unsavedChanges.note=true;
    await f.app.reconcileRemoteFile(f.file,{content:'other device',content_version:2});
    expect(f.file.syncConflict).toBe(true);expect(f.file.content).toBe('local edit');expect(f.file.crdtBaseContent).toBe('base');
    expect(JSON.parse(localStorage.getItem('epm-file:note'))[0].content).toBe('local edit');
});
it('keeps unknown versions unknown instead of silently sending version zero',async()=>{
    const f=fixture();f.file.contentVersion=null;f.file.crdtBaseContentVersion=null;
    global.fetch=jest.fn(async(_,options)=>{expect(JSON.parse(options.body)).not.toHaveProperty('base_content_version');return response('first',1);});
    expect(await f.api.syncFileToServer('note',{background:true,baseContentVersion:null})).toBe(true);
});
it('ignores old IndexedDB data when the synchronous checkpoint is newer',async()=>{
    const f=fixture();f.file.content='latest';persistFile(f.file);
    const manager={getFile:jest.fn(async()=>({data:JSON.stringify([{content:'old',lastModified:Date.now()+86400000}])}))};
    await restoreFileFromDB(f.file,manager);expect(f.file.content).toBe('latest');expect(manager.getFile).toHaveBeenCalled();
});
it('does not apply an asynchronous restore over typing that occurred while reading',async()=>{
    const f=fixture();let reply;const manager={getFile:()=>new Promise(resolve=>{reply=resolve;})};
    const pending=restoreFileFromDB(f.file,manager);f.file.content='new typing';
    reply({data:JSON.stringify([{content:'old',lastModified:Date.now()+86400000,localCheckpointRevision:100}])});await pending;
    expect(f.file.content).toBe('new typing');
});
it('commits IndexedDB checkpoints in order even if the first write is slow',async()=>{
    const f=fixture();let finish;const writes=[];
    window.IndexedDBManager={saveFile:jest.fn((_,data)=>{writes.push(JSON.parse(data)[0].content);return writes.length===1?new Promise(resolve=>{finish=resolve;}):Promise.resolve();})};
    try{f.file.content='first';persistFile(f.file);f.file.content='second';persistFile(f.file);expect(writes).toEqual(['first']);finish();for(let i=0;i<15;i++)await Promise.resolve();expect(writes).toEqual(['first','second']);}
    finally{delete window.IndexedDBManager;}
});
it('waits for the DB checkpoint before uploading when localStorage is full',async()=>{
    const f=fixture();let finish;window.IndexedDBManager={saveFile:jest.fn().mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;})).mockResolvedValue(undefined)};
    const spy=jest.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('quota');});
    global.fetch=jest.fn(async()=>response('first',2));
    try{
        const pending=f.api.syncFileToServer('note',{background:true});
        for(let i=0;i<50&&!finish;i++)await Promise.resolve();
        expect(finish).toBeDefined();expect(fetch).not.toHaveBeenCalled();
        finish();await pending;expect(fetch).toHaveBeenCalledTimes(1);
    }finally{spy.mockRestore();delete window.IndexedDBManager;}
});
it('recognizes an HTTP save accepted after reload even when its response was never seen',async()=>{
    const f=fixture();let reply;
    global.fetch=jest.fn(()=>new Promise(resolve=>{reply=resolve;}));
    const sending=f.api.syncFileToServer('note',{background:true});
    for(let i=0;i<50&&!reply;i++)await Promise.resolve();
    // This is the pagehide checkpoint; the previous page still has an unacknowledged request.
    f.file.content='latest';persistFile(f.file);
    const restored=[{id:'note',name:'note.md',type:'file',content:'base',contentVersion:1,contentLoaded:true}];restoreFiles(restored);
    const app={files:restored,currentUser:{username:'user',token:'token'},lastSyncedContent:{note:'base'},unsavedChanges:{note:true},pendingServerSync:{note:true}};
    createSyncRuntimeApi({globalRef:app,g:key=>app[key],isExternalLocalFile:()=>false,markPendingServerSync:(id,value)=>{app.pendingServerSync[id]=value;}});
    await app.reconcileRemoteFile(restored[0],{content:'first',content_version:2});
    expect(restored[0].content).toBe('latest');expect(restored[0].syncConflict).not.toBe(true);expect(restored[0].crdtBaseContent).toBe('first');
    reply(response('first',2));await sending;
});
it('times out an unconfirmed save without clearing the durable pending draft',async()=>{
    jest.useFakeTimers();const f=fixture();global.fetch=jest.fn(()=>new Promise(()=>{}));
    try{const sending=f.api.syncFileToServer('note',{background:true});for(let i=0;i<50&&!fetch.mock.calls.length;i++)await Promise.resolve();
        await jest.advanceTimersByTimeAsync(30000);expect(await sending).toBe(false);
        expect(f.file.content).toBe('first');expect(f.file.isSynced).toBe(false);expect(f.app.pendingServerSync.note).toBe(true);
        expect(JSON.parse(localStorage.getItem('epm-file:note'))[0].cloudSaveReceipts).toHaveLength(1);
    }finally{jest.clearAllTimers();jest.useRealTimers();}
});

it('recovers a newer DB checkpoint even when an older localStorage journal still exists after quota failure',async()=>{
    const f=fixture();f.file.content='older';persistFile(f.file);
    const manager={getFile:async()=>({data:JSON.stringify([{content:'DB latest',localCheckpointRevision:f.file.localCheckpointRevision+1,isSynced:false,lastModified:1}])})};
    await restoreFileFromDB(f.file,manager);expect(f.file.content).toBe('DB latest');expect(f.file.isSynced).toBe(false);
});
