import {orderedEntries,moveEntries,dropEntry,MANUAL_ORDER_BASE} from '../../js/files/global-order';
const file=(id:string,path:string,time:number,type='file',order?:number)=>({id,name:path,lastModified:time,type,order});
const apply=(files:any[],orders:any)=>files.map(f=>({...f,order:orders[f.name] ?? f.order}));
const ids=(files:any[])=>orderedEntries(files).map(f=>f.id);
it('defaults to global latest-first without a folder or legacy rank priority',()=>{
 const files=[file('a','x/a',10,'file',0),file('b','b',20,'file',200),file('folder','x',5,'folder',-20),file('c','z/c',30)];
 expect(ids(files)).toEqual(['c','b','a','folder']);
});
it('keeps pinned files and folders ahead of newer unpinned entries without pinning descendants',()=>{
 expect(ids([file('p','old/p',1,'file',-2000000),file('folder','old',2,'folder',-1999990),file('new','new',30),file('child','old/child',20)])).toEqual(['p','folder','new','child']);
});
it('moves selected entries globally across folders and keeps selection blocks stable',()=>{
 const files=[file('a','x/a',30),file('b','b',20),file('c','z/c',10)];
 const ranks=moveEntries(files,['c'],'up')!;expect(ids(apply(files,ranks))).toEqual(['a','c','b']);
 expect(ranks['z/c']).toBeGreaterThanOrEqual(MANUAL_ORDER_BASE);expect(files[2].name).toBe('z/c');
 expect(ids(apply(files,moveEntries(files,['b','c'],'up')))).toEqual(['b','c','a']);
});
it('drags files or folders without changing paths, and preserves ranks on reload/new creation',()=>{
 const files=[file('a','x/a',30),file('folder','x',20,'folder'),file('c','z/c',10)];
 const moved=apply(files,dropEntry(files,'c','a',false));expect(ids(moved)).toEqual(['c','a','folder']);
 expect(ids(JSON.parse(JSON.stringify(moved)))).toEqual(['c','a','folder']);
 expect(ids([...moved,file('new','another/new',40)])).toEqual(['new','c','a','folder']);
 expect(ids(apply(files,dropEntry(files,'folder','c',true)))).toEqual(['a','c','folder']);
});
it('keeps pinned items at the front even for moves and ignores stale drop targets',()=>{
 const files=[file('p','p',1,'file',-2000000),file('a','a',30)];
 expect(dropEntry(files,'a','p',false)).toBeNull();expect(moveEntries(files,['a'],'up')).toBeNull();
 expect(dropEntry(files,'missing','a',true)).toBeNull();
});
