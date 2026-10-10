/** Workspace membership must survive a full localStorage cache, including guest files. */
const LOCAL_KEY='vditor_files';
const states=new Map<string,{db:boolean;committedDB?:boolean;generation:number;data?:string;pending?:Promise<boolean>}>();
function scope(){const username=(window as any).currentUser?.username;return username ? 'user:'+username : 'guest';}
function key(owner:string){return 'epm-workspace:'+encodeURIComponent(owner);}
function state(owner:string){let value=states.get(owner);if(!value){value={db:false,generation:0};states.set(owner,value);}return value;}
function parse(data:string|null|undefined):any[]{if(!data)return [];const files=JSON.parse(data);if(!Array.isArray(files))throw Error('Invalid workspace cache');return files;}
function report(error:unknown){(window as any).showMessage?.('本地保存失败，请释放空间或导出备份：'+String(error),'error');}
function saveDB(owner:string,data:string):Promise<boolean>{
    const cache=state(owner),manager=(window as any).IndexedDBManager;
    if(!manager?.saveFile){if(!cache.committedDB)cache.db=false;report('IndexedDB 不可用');return Promise.resolve(false);}
    const write=async()=>{
        try{
            await manager.saveFile(key(owner),data,'application/json');
            cache.db=true;cache.committedDB=true;
            // Free the redundant bulk cache only AFTER IndexedDB commits. Keep settings,
            // per-file journals, attachments and the previous cache on write failure.
            if(scope()===owner){try{localStorage.removeItem(LOCAL_KEY);}catch{}}
            return true;
        }catch(error){if(!cache.committedDB)cache.db=false;report(error);return false;}
    };
    const task=cache.pending ? cache.pending.then(write,write) : write();
    cache.pending=task;
    void task.then(()=>{if(cache.pending===task)cache.pending=undefined;});
    return task;
}
function startWrite(files:any[],serialized?:string):{accepted:boolean;task:Promise<boolean>}{
    const owner=scope(),cache=state(owner);
    let data:string;
    try{
        const serialize=(window as any).e2eSerializeFiles;
        data=serialized ?? (serialize ? serialize(files) : JSON.stringify(files));
        if(typeof data!=='string' || !data)throw Error('文件缓存序列化失败');
    }
    catch(error){report(error);return {accepted:false,task:Promise.resolve(false)};}
    cache.data=data;cache.generation++;
    if(!cache.db){
        try{localStorage.setItem(LOCAL_KEY,data);return {accepted:true,task:Promise.resolve(true)};}
        catch{cache.db=true;}
    }
    const available=!!(window as any).IndexedDBManager?.saveFile;
    return {accepted:available,task:saveDB(owner,data)};
}
/** Existing synchronous editing paths queue a handled write; creation waits for durability. */
export function queueWorkspaceCache(files:any[],serialized?:string):boolean{return startWrite(files,serialized).accepted;}
export function writeWorkspaceCache(files:any[],serialized?:string):Promise<boolean>{return startWrite(files,serialized).task;}
export function readWorkspaceCacheSync():any[]{try{return parse(localStorage.getItem(LOCAL_KEY));}catch{return [];}}
export async function readWorkspaceCache():Promise<any[]>{
    const owner=scope(),cache=state(owner),generation=cache.generation;
    if(cache.pending)await cache.pending;
    if(cache.db && cache.data)return parse(cache.data);
    try{
        const saved=await (window as any).IndexedDBManager?.getFile?.(key(owner));
        if(saved?.data){
            parse(saved.data);cache.db=true;cache.committedDB=true;
            if(cache.generation!==generation && cache.data){await saveDB(owner,cache.data);return parse(cache.data);}
            cache.data=saved.data;return parse(saved.data);
        }
    }catch{/* Preserve the legacy local cache if IndexedDB is unavailable or corrupt. */}
    if(cache.generation!==generation && cache.data)return parse(cache.data);
    return readWorkspaceCacheSync();
}
/** Drain account writes before the existing account-cache cleanup clears IndexedDB. */
export async function resetWorkspaceCache(){
    let pending=Array.from(states.values()).map(cache=>cache.pending).filter(Boolean);
    while(pending.length){
        await Promise.all(pending);
        pending=Array.from(states.values()).map(cache=>cache.pending).filter(Boolean);
    }
    states.clear();
}
