import { isOrderMetadataFile } from '../../shared/file-orders';
import { fileTimestamp } from './modified-time';
export const MANUAL_ORDER_BASE = 1_000_000_000_000_000;
export const isPinned = (file:any) => Number(file.order) <= -1_000_000;
const manual = (file:any) => Number(file.order) >= MANUAL_ORDER_BASE;
/** Legacy folder-relative ranks do not override real modification times. */
export function compareFileEntries(a:any,b:any):number {
    if(isPinned(a)!==isPinned(b)) return isPinned(a)?-1:1;
    if(isPinned(a) && a.order!==b.order) return a.order-b.order;
    if(!isPinned(a)) {
        // Newly created/unordered entries retain their newest-first position.
        if(manual(a)!==manual(b)) return manual(a)?1:-1;
        if(manual(a) && a.order!==b.order) return a.order-b.order;
    }
    return fileTimestamp(b.lastModified ?? b.last_modified)-fileTimestamp(a.lastModified ?? a.last_modified)
        || Number(a.order || 0)-Number(b.order || 0) || a.name.localeCompare(b.name) || String(a.id || '').localeCompare(String(b.id || ''));
}
export function orderedEntries(files:any[]):any[] {
    return files.filter(file=>!isOrderMetadataFile(file.name) && ['file','folder'].includes(file.type)).slice().sort(compareFileEntries);
}
function ranks(files:any[]):Record<string,number> {
    const orders:Record<string,number>=Object.create(null);
    files.forEach((file,index)=>orders[file.name]=(isPinned(file)?-2_000_000:MANUAL_ORDER_BASE)+index*10);
    return orders;
}
export function moveEntries(files:any[], ids:Iterable<string>, direction:'up'|'down'):Record<string,number>|null {
    const sorted=orderedEntries(files), selected=new Set([...ids].map(String));let moved=false;
    const swap=(i:number,j:number)=>{if(selected.has(String(sorted[i].id)) && !selected.has(String(sorted[j].id)) && isPinned(sorted[i])===isPinned(sorted[j])){[sorted[i],sorted[j]]=[sorted[j],sorted[i]];moved=true;}};
    if(direction==='up')for(let i=1;i<sorted.length;i++)swap(i,i-1);
    else for(let i=sorted.length-2;i>=0;i--)swap(i,i+1);
    return moved?ranks(sorted):null;
}
export function dropEntry(files:any[], source:string, target:string, after:boolean):Record<string,number>|null {
    const sorted=orderedEntries(files),from=sorted.findIndex(f=>String(f.id)===source),to=sorted.findIndex(f=>String(f.id)===target);
    if(from<0 || to<0 || from===to || isPinned(sorted[from])!==isPinned(sorted[to]))return null;
    const [file]=sorted.splice(from,1);const insert=sorted.findIndex(f=>String(f.id)===target)+(after?1:0);sorted.splice(insert,0,file);
    return ranks(sorted);
}
