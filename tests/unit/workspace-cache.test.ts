/** @jest-environment jsdom */
import { queueWorkspaceCache, readWorkspaceCache, readWorkspaceCacheSync, resetWorkspaceCache, writeWorkspaceCache } from '../../js/files/workspace-cache';
const app=window as any;
const quota=()=>new DOMException('full','QuotaExceededError');
beforeEach(async()=>{await resetWorkspaceCache();localStorage.clear();app.currentUser=null;delete app.IndexedDBManager;delete app.e2eSerializeFiles;app.showMessage=jest.fn();});
afterEach(async()=>{jest.restoreAllMocks();await resetWorkspaceCache();delete app.IndexedDBManager;});
it('keeps the synchronous cache for small workspaces',async()=>{const files=[{id:'a',name:'a',content:'text'}];expect(queueWorkspaceCache(files)).toBe(true);expect(readWorkspaceCacheSync()).toEqual(files);expect(await readWorkspaceCache()).toEqual(files);});
it('waits for the fallback transaction before freeing the previous cache and restores new file membership after reload',async()=>{
    localStorage.setItem('vditor_files','[{"id":"old","content":"old"}]');localStorage.setItem('setting','keep');
    let resolve!:()=>void;let data='';app.IndexedDBManager={saveFile:jest.fn(async(_key:string,value:string)=>{data=value;await new Promise<void>(done=>resolve=done);}),getFile:jest.fn(async()=>({data}))};
    jest.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw quota();});
    const files=[{id:'old',content:'old'},{id:'new',name:'new',content:'new content'}],saving=writeWorkspaceCache(files);
    expect(localStorage.getItem('vditor_files')).toContain('old');expect(app.IndexedDBManager.saveFile).toHaveBeenCalledWith('epm-workspace:guest',JSON.stringify(files),'application/json');
    resolve();expect(await saving).toBe(true);expect(localStorage.getItem('vditor_files')).toBeNull();expect(localStorage.getItem('setting')).toBe('keep');
    await resetWorkspaceCache();expect(await readWorkspaceCache()).toEqual(files);
});
it('preserves the previous snapshot and reports failure if both stores fail',async()=>{
    localStorage.setItem('vditor_files','[{"id":"old"}]');app.IndexedDBManager={saveFile:jest.fn(async()=>{throw quota();})};jest.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw quota();});
    expect(await writeWorkspaceCache([{id:'new'}])).toBe(false);expect(localStorage.getItem('vditor_files')).toBe('[{"id":"old"}]');expect(app.showMessage).toHaveBeenCalledWith(expect.stringContaining('本地保存失败'),'error');
});
it('keeps queued writes ordered and never restores a removed file',async()=>{
    const db=new Map();app.IndexedDBManager={saveFile:jest.fn(async(key:string,data:string)=>db.set(key,{data})),getFile:jest.fn(async(key:string)=>db.get(key))};jest.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw quota();});
    const first=writeWorkspaceCache([{id:'a'},{id:'b'}]),second=writeWorkspaceCache([{id:'b',name:'renamed'}]);await Promise.all([first,second]);await resetWorkspaceCache();expect(await readWorkspaceCache()).toEqual([{id:'b',name:'renamed'}]);
});
it('uses the supplied encrypted serialization and separates guest and signed-in snapshots',async()=>{
    const db=new Map();app.IndexedDBManager={saveFile:jest.fn(async(key:string,data:string)=>db.set(key,{data})),getFile:jest.fn(async(key:string)=>db.get(key))};jest.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw quota();});
    app.e2eSerializeFiles=()=> '[{"id":"private","content":"ciphertext"}]';await writeWorkspaceCache([{id:'private',content:'secret'}]);
    app.currentUser={username:'guest'};expect(await readWorkspaceCache()).toEqual([]);delete app.e2eSerializeFiles;await writeWorkspaceCache([{id:'account'}]);await resetWorkspaceCache();app.currentUser=null;
    expect(await readWorkspaceCache()).toEqual([{id:'private',content:'ciphertext'}]);expect([...db.values()].map(value=>value.data).join('')).not.toContain('secret');
});
it('can retry localStorage after space is released when no fallback snapshot ever committed',async()=>{
    app.IndexedDBManager={saveFile:jest.fn(async()=>{throw quota();})};const spy=jest.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw quota();});
    expect(await writeWorkspaceCache([{id:'new'}])).toBe(false);spy.mockRestore();expect(await writeWorkspaceCache([{id:'new'}])).toBe(true);expect(readWorkspaceCacheSync()).toEqual([{id:'new'}]);
});
it('does not replace an in-flight new creation with an older restored database snapshot',async()=>{
    let resolve!: (value:any)=>void;app.IndexedDBManager={getFile:jest.fn(()=>new Promise(done=>resolve=done)),saveFile:jest.fn(async()=>{})};
    const loading=readWorkspaceCache();await writeWorkspaceCache([{id:'new'}]);resolve({data:'[{"id":"old"}]'});expect(await loading).toEqual([{id:'new'}]);expect(app.IndexedDBManager.saveFile).toHaveBeenCalledWith('epm-workspace:guest','[{"id":"new"}]','application/json');
});
