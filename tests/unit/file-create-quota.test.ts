/** @jest-environment jsdom */
// @ts-nocheck
import { resetWorkspaceCache, readWorkspaceCache } from '../../js/files/workspace-cache';
const app=window;
beforeAll(()=>{
    document.body.innerHTML='<aside id="fileListSidebar"></aside><div id="vditor"></div>';
    const chain={length:0,each:()=>chain,remove:()=>chain,removeClass:()=>chain,find:()=>chain,jstree:()=>false};app.$=Object.assign(()=>chain,{fn:{}});
    require('../../js/files/runtime-core');
});
beforeEach(async()=>{
    await resetWorkspaceCache();localStorage.clear();app.currentFileId=null;app.currentUser=null;app.files=[];app.lastSyncedContent={};app.unsavedChanges={};app.pendingServerSync={};
    app.showMessage=jest.fn();app.isFileManagementMode=true;app.notesHomeFolderPath='';app.i18n={getLanguage:()=> 'zh',t:key=>key};
    app.wasmTextEngineGateway={getStatus:()=>({ready:false}),normalizePath:path=>path,parentPath:path=>path.includes('/')?path.slice(0,path.lastIndexOf('/')):'',basenamePath:path=>path.split('/').pop()};app.ensureWasmTextEngineReady=()=>new Promise(()=>{});
    app.vditorReady=true;app.vditor={getValue:()=>'',setValue:jest.fn(),getCurrentMode:()=> 'wysiwyg'};
    app.userSettings={defaultFileOpening:'fileList'};app.ensureVditorInitialized=async()=>{};
});
afterEach(async()=>{jest.restoreAllMocks();await resetWorkspaceCache();delete app.IndexedDBManager;});
it('creates and opens a file despite a full localStorage, and reloads the entire file list from IndexedDB',async()=>{
    const db=new Map();app.IndexedDBManager={saveFile:jest.fn(async(key,data)=>db.set(key,{data})),getFile:jest.fn(async key=>db.get(key))};jest.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new DOMException('full','QuotaExceededError');});
    await app.createNewFile({quick:true});const file=app.files[0];expect(file.name).toBe('新文档1');expect(app.currentFileId).toBe(file.id);expect(app.showMessage).toHaveBeenCalledWith('已创建文件: 新文档1');
    await resetWorkspaceCache();expect(await readWorkspaceCache()).toEqual(expect.arrayContaining([expect.objectContaining({id:file.id,name:file.name,content:file.content})]));
});
it('does not announce success or keep a phantom file if neither storage backend can commit',async()=>{
    app.IndexedDBManager={saveFile:jest.fn(async()=>{throw Error('disk full');})};jest.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new DOMException('full','QuotaExceededError');});
    await app.createNewFile({quick:true});expect(app.files).toEqual([]);expect(app.currentFileId).toBeNull();expect(app.showMessage).not.toHaveBeenCalledWith(expect.stringContaining('已创建文件'));
});
