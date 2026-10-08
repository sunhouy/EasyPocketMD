/** @jest-environment jsdom */
// @ts-nocheck
export {};
const app=window;
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
beforeAll(()=>{
    document.body.innerHTML='<aside id="fileListSidebar"></aside>';
    const chain={length:0,each:()=>chain,remove:()=>chain,removeClass:()=>chain,find:()=>chain,jstree:()=>false};
    app.$=Object.assign(()=>chain,{fn:{}});
    require('../../js/files/runtime-core');require('../../js/ui/dialog');
});
beforeEach(()=>{
    for(const element of [...document.body.children])if(element.id!=='fileListSidebar')element.remove();
    document.body.className='file-management-mode';app.isFileManagementMode=true;
    localStorage.clear();app.currentFileId=null;
    app.files=[{id:'a',name:'a.md',type:'file',content:'a'},{id:'b',name:'b.md',type:'file',content:'b'}];
    app.currentUser=null;app.lastSyncedContent={};app.unsavedChanges={};app.pendingServerSync={};
    app.showMessage=jest.fn();app.i18n={getLanguage:()=> 'zh',t:key=>key};
    app.wasmTextEngineGateway={getStatus:()=>({ready:false})};app.ensureWasmTextEngineReady=()=>new Promise(()=>{});
    app.refreshNotesHome?.();
    app.getApiBaseUrl=()=>'/api';global.fetch=jest.fn(async()=>({json:async()=>({code:200,data:{}})}));
});
it('deletes from the current list after refresh while confirmation is open',async()=>{
    app.openFileSelectionPanel('a');document.querySelector('[data-action=delete]').click();await tick();
    expect(document.querySelector('.custom-dialog-btn.confirm')).not.toBeNull();
    app.files=app.files.map(file=>({...file}));
    document.querySelector('.custom-dialog-btn.confirm').click();await tick();
    expect(app.files.map(file=>file.id)).toEqual(['b']);
    expect(JSON.parse(localStorage.getItem('vditor_files')).map(file=>file.id)).toEqual(['b']);
    expect(app.showMessage).toHaveBeenCalledWith('已删除 1 项');
    expect(document.querySelector('.notes-file-card[data-file-id="a"]')).toBeNull();
    expect(document.querySelector('.notes-file-card[data-file-id="b"]')).not.toBeNull();
});
it('retains the local file and shows the error when cloud deletion fails',async()=>{
    app.currentUser={username:'user',token:'token'};
    fetch.mockResolvedValue({json:async()=>({code:500,message:'服务器删除失败'})});
    app.openFileSelectionPanel('a');document.querySelector('[data-action=delete]').click();await tick();
    document.querySelector('.custom-dialog-btn.confirm').click();await tick();
    expect(app.files.map(file=>file.id)).toEqual(['a','b']);
    expect(document.querySelector('.notes-file-card[data-file-id="a"]')).not.toBeNull();
    expect(app.showMessage).toHaveBeenCalledWith('服务器删除失败','error');
    expect(document.querySelector('[data-action=delete]').disabled).toBe(false);
});
it('deletes a local-only file even if its remote record is already absent',async()=>{
    app.currentUser={username:'user',token:'token'};
    fetch.mockResolvedValue({json:async()=>({code:404,message:'文件不存在'})});
    const deleting=app.deleteFile('a');document.querySelector('.custom-dialog-btn.confirm').click();await deleting;
    expect(app.files.map(file=>file.id)).toEqual(['b']);
});
it('reports deletion even if a realtime list refresh removes the record during the request',async()=>{
    app.currentUser={username:'user',token:'token'};
    fetch.mockImplementation(async url=>{
        if(String(url).endsWith('/files/delete'))app.files=app.files.filter(file=>file.id!=='a');
        return {json:async()=>({code:200,data:{}})};
    });
    const deleting=app.deleteFile('a');document.querySelector('.custom-dialog-btn.confirm').click();await deleting;
    expect(document.querySelector('.notes-file-card[data-file-id="a"]')).toBeNull();
    expect(app.showMessage).toHaveBeenCalledWith('已删除 1 项');
});
it('removes a stale card and gives feedback when the model has already dropped that file',async()=>{
    expect(document.querySelector('.notes-file-card[data-file-id="a"]')).not.toBeNull();
    app.files=app.files.filter(file=>file.id!=='a');
    await app.deleteFile('a');
    expect(document.querySelector('.notes-file-card[data-file-id="a"]')).toBeNull();
    expect(app.showMessage).toHaveBeenCalledWith('文件已删除，列表已刷新');
});
