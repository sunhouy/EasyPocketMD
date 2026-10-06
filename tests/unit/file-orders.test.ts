/** @jest-environment jsdom */
import { createFileOrderStore, reorderSiblings, normalizeOrders } from '../../js/files/order-store';
import { visibleNotes } from '../../js/files/notes-home';
const settle = () => new Promise(resolve=>setTimeout(resolve,0));
let store:ReturnType<typeof createFileOrderStore>;
beforeEach(()=>localStorage.clear());
afterEach(()=>{store?.destroy();jest.restoreAllMocks();});
it('moves one sibling exactly one position and leaves boundary moves untouched',()=>{
    expect(reorderSiblings(['folder','a','b'],'b','up')).toEqual({folder:0,b:10,a:20});
    expect(reorderSiblings(['folder','a','b'],'folder','down')).toEqual({a:0,folder:10,b:20});
    expect(reorderSiblings(['a','b'],'a','up')).toBeNull();expect(reorderSiblings(['a','b'],'b','down')).toBeNull();
});
it('migrates hidden order documents without creating or syncing any document and restores local order',async()=>{
    const app:any={files:[{id:'a',name:'a.md',type:'file',content:'keep'},{id:'b',name:'b.md',type:'file'},
        {id:'meta',name:'.easypocketmd_order',content:'{"b.md":0,"a.md":10}',syncConflict:true}],unsavedChanges:{meta:true},pendingServerSync:{meta:true},currentFileId:'meta',syncFileToServer:jest.fn()};
    store=createFileOrderStore(app,()=>{});await store.load();
    expect(app.files.map(f=>f.id)).toEqual(['a','b']);expect(app.files[0].content).toBe('keep');expect(app.unsavedChanges.meta).toBeUndefined();expect(app.currentFileId).toBeNull();
    expect(visibleNotes(app.files,null,'').map(f=>f.id)).toEqual(['b','a']);
    store.save({'a.md':0,'b.md':10});expect(app.syncFileToServer).not.toHaveBeenCalled();expect(app.files).toHaveLength(2);
    store.destroy();store=createFileOrderStore(app,()=>{});await store.load();expect(app.files[0].order).toBe(0);
});
it('keeps a move made during metadata loading and a newer move during its acknowledgement',async()=>{
    const app:any={files:[{name:'a.md',type:'file'}],currentUser:{username:'user',token:'token'}};let read:any,ack:any;
    global.fetch=jest.fn().mockImplementationOnce(()=>new Promise(resolve=>read=resolve)).mockImplementationOnce(()=>new Promise(resolve=>ack=resolve)).mockResolvedValue({json:async()=>({code:200})});
    store=createFileOrderStore(app,()=>{});const loading=store.load();store.save({'a.md':10});
    read({json:async()=>({code:200,data:{'a.md':0}})});await loading;expect(app.files[0].order).toBe(10);
    store.save({'a.md':20});ack({json:async()=>({code:200})});await settle();
    expect(fetch).toHaveBeenCalledTimes(3);expect(JSON.parse((fetch as jest.Mock).mock.calls[2][1].body).orders).toEqual({'a.md':20});
    expect(JSON.parse(localStorage.getItem('epmd-file-orders:user')!).pending).toEqual({});
    expect((fetch as jest.Mock).mock.calls.every(([url])=>url.includes('/files/orders'))).toBe(true);
});
it('isolates accounts and ignores an old account response',async()=>{
    const app:any={files:[{name:'a.md',type:'file'}],currentUser:{username:'one',token:'1'}};let old:any;
    global.fetch=jest.fn().mockImplementationOnce(()=>new Promise(resolve=>old=resolve)).mockResolvedValue({json:async()=>({code:200,data:{'a.md':20}})});
    store=createFileOrderStore(app,()=>{});const first=store.load();app.currentUser={username:'two',token:'2'};await store.load();
    old({json:async()=>({code:200,data:{'a.md':100}})});await first;expect(app.files[0].order).toBe(20);
    expect(localStorage.getItem('epmd-file-orders:one')).toBeNull();
});
it('rejects non-numeric/system paths and keeps legacy metadata out of the card list',()=>{
    expect(normalizeOrders({'a':3,'b':'4','.easypocketmd_orders':2,'bad':Infinity})).toEqual({a:3});
    expect(visibleNotes([{id:'m',type:'file',name:'.easypocketmd_orders'}],null,'')).toEqual([]);
});
