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
    app.showMessage=jest.fn();document.body.classList.add('file-management-mode');app.isFileManagementMode=true;app.notesHomeFolderPath='';app.i18n={getLanguage:()=> 'zh',t:key=>key};
    app.wasmTextEngineGateway={getStatus:()=>({ready:false}),normalizePath:path=>path,parentPath:path=>path.includes('/')?path.slice(0,path.lastIndexOf('/')):'',basenamePath:path=>path.split('/').pop()};app.ensureWasmTextEngineReady=async()=>({code:200});
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

it('publishes the local file home without waiting for WASM or a legacy tree', async()=>{
    app.ensureWasmTextEngineReady=()=>new Promise(()=>{});
    app.startInFileManagementMode=true;app.deferInitialFileOpen=true;
    localStorage.setItem('vditor_files',JSON.stringify([{id:'cached',type:'file',name:'Cached',content:'draft'}]));
    await app.loadLocalFiles();
    expect(app.files[0].id).toBe('cached');
    expect(document.getElementById('notesHome').textContent).toContain('Cached');
});
it('shows loading while the engine is pending and clears it after opening',async()=>{
    let ready;app.ensureWasmTextEngineReady=()=>new Promise(resolve=>{ready=resolve;});
    app.files=[{id:'pending',type:'file',name:'Pending',content:'draft'}];
    const opening=app.openFile('pending');
    expect(document.getElementById('fileSwitchLoadingOverlay').style.display).toBe('flex');
    expect(document.getElementById('fileSwitchLoadingOverlay').parentElement).toBe(document.body);
    await new Promise(resolve=>setTimeout(resolve,40));expect(app.currentFileId).toBeNull();
    ready({code:200});await opening;
    expect(app.currentFileId).toBe('pending');expect(document.getElementById('fileSwitchLoadingOverlay').style.display).toBe('none');
});
it('selects every native home entry and can deselect again without DOM cards',()=>{
 app.files=[{id:'folder',name:'资料',type:'folder'},{id:'one',name:'资料/a.md',type:'file',content:'一'},{id:'two',name:'b.md',type:'file',content:'二'},{id:'metadata',name:'.easypocketmd_orders',type:'file'}];
 app.nativeWorkspace={renderHome:jest.fn(()=>true)};app.refreshNotesHome();app.openFileSelectionPanel('one');
 expect(document.querySelectorAll('.notes-file-card')).toHaveLength(0);
 app.selectAllFilesForMulti();expect(app.fileListMultiSelectedIds).toEqual(new Set(['folder','one','two']));
 expect(app.nativeWorkspace.renderHome.mock.calls.at(-1)[0].selectAllLabel).toBe('取消全选');
 app.selectAllFilesForMulti();expect(app.fileListMultiSelectedIds.size).toBe(0);delete app.nativeWorkspace;
});
