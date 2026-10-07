/** @jest-environment jsdom */
import {installNativeOpenBridge} from '../../js/main/native-open';
import {installSyncRuntime} from '../../js/files/sync-runtime';
jest.mock('../../js/files/websocket-sync',()=>({createWebSocketClient:jest.fn(),createSyncThrottle:jest.fn()}));
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
it('waits for workspace boot, deduplicates startup/event delivery, and permits reopening the same file later',async()=>{
 let complete:any,listener:any;const ready=new Promise<void>(r=>{complete=r;});const app={electron:{onOpenLocalFileRequest:fn=>{listener=fn;},consumePendingOpenFilePath:jest.fn(async()=> '/files/report.md')},openExternalLocalFileByPath:jest.fn(async()=> true),showMessage:jest.fn()};
 installNativeOpenBridge(app,ready);listener('/files/report.md');await tick();expect(app.openExternalLocalFileByPath).not.toHaveBeenCalled();complete();await tick();await tick();expect(app.openExternalLocalFileByPath).toHaveBeenCalledTimes(1);
 listener('/files/report.md');await tick();expect(app.openExternalLocalFileByPath).toHaveBeenCalledTimes(2);
});
it('opens requests in order and releases duplicate suppression after a failed open',async()=>{
 let listener:any;const app={electron:{onOpenLocalFileRequest:fn=>{listener=fn;}},openExternalLocalFileByPath:jest.fn().mockResolvedValueOnce(false).mockResolvedValue(true),showMessage:jest.fn()};installNativeOpenBridge(app,Promise.resolve());listener('first.md');listener('second.md');await tick();await tick();expect(app.openExternalLocalFileByPath.mock.calls.map(x=>x[0])).toEqual(['first.md','second.md']);expect(app.showMessage).toHaveBeenCalled();listener('first.md');await tick();expect(app.openExternalLocalFileByPath).toHaveBeenCalledTimes(3);
});
function setup(result:any){const app:any={files:[],unsavedChanges:{},lastSyncedContent:{},pendingServerSync:{},currentUser:null,showMessage:jest.fn(),ensureWasmTextEngineReady:jest.fn(async()=>{}),electron:{readLocalFile:jest.fn(async()=>result)},wasmTextEngineGateway:{normalizePath:(x:string)=>x,pathParent:()=>'',pathBasename:(x:string)=>x.split('/').pop()},fileOrders:{}};
 const hooks:any={loadFiles:jest.fn(),openFile:jest.fn(async id=>{app.currentFileId=id;})};const rt=installSyncRuntime(app,{getCurrentEditorContent:(_id,fallback)=>fallback} as any,hooks);return{app,hooks,rt};}
it('opens the exact content URI and retains its native binding when editing is permitted',async()=>{
 const uri='content://com.tencent.mm.provider/doc/42';const {app,hooks,rt}=setup({success:true,writable:true,path:uri,name:'微信文档.md',content:'来自微信的内容',localFileMode:'tauri'});await expect(rt.openExternalLocalFileByPath(uri)).resolves.toBe(true);expect(app.ensureWasmTextEngineReady).toHaveBeenCalled();expect(app.files[0]).toMatchObject({name:'微信文档.md',content:'来自微信的内容',localFilePath:uri,isExternalLocal:true});expect(hooks.openFile).toHaveBeenCalledWith(app.files[0].id);
});
it('imports an editable copy for a read-only external provider instead of requesting another file',async()=>{
 const uri='content://wechat/document/readonly';const {app,hooks,rt}=setup({success:true,writable:false,path:uri,name:'只读.md',content:'原始文档',localFileMode:'tauri'});await expect(rt.openExternalLocalFileByPath(uri)).resolves.toBe(true);expect(app.files[0]).toMatchObject({content:'原始文档',isExternalLocal:false,contentLoaded:true});expect(app.files[0].localFilePath).toBeUndefined();expect(hooks.openFile).toHaveBeenCalledWith(app.files[0].id);expect(app.showMessage).toHaveBeenCalledWith(expect.stringContaining('无法写回'),'info');
});
it('ignores content returned for the previous account after switching',async()=>{
 const {app,rt}=setup(null);let resolve:any;app.electron.readLocalFile=()=>new Promise(r=>{resolve=r;});const opening=rt.openExternalLocalFileByPath('/secret.md');await tick();app.currentUser={username:'another'};resolve({success:true,content:'secret'});expect(await opening).toBe(false);expect(app.files).toHaveLength(0);
});
