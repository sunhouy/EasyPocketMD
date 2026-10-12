import { isMobileUserAgent } from '../main/device-layout';

export const desktopFileInteraction = () => !isMobileUserAgent(navigator.userAgent || '')
    && !window.matchMedia?.('(pointer: coarse)').matches;

/** Mouse dragging on desktop only, without changing folders or paths. */
export function installOrderDrag(surface:HTMLElement, app:any) {
    let source='', target='', after=false, owner:any, workspace:any;
    let active=false, suppressUntil=0, touchGesture=false;
    const clearMarkers=()=>surface.querySelectorAll('.order-drop-before,.order-drop-after,.order-drag-source').forEach(el=>el.classList.remove('order-drop-before','order-drop-after','order-drag-source'));
    const finish=(commit:boolean)=>{
        const allowed=commit && active && owner===app.currentUser && workspace===app.files;
        const id=source, destination=target, insertAfter=after;
        source='';target='';active=false;app.fileOrderDragging=false;clearMarkers();
        if(allowed && destination)app.reorderFileEntries?.(id,destination,insertAfter);
        app.refreshNotesHome?.();
    };
    const start=(item:HTMLElement)=>{source=item.dataset.fileId!;owner=app.currentUser;workspace=app.files;active=true;app.fileOrderDragging=true;item.classList.add('order-drag-source');};
    const locate=(item:HTMLElement|null,x:number,y:number)=>{
        if(!item || !surface.contains(item) || item.dataset.fileId===source){target='';surface.querySelectorAll('.order-drop-before,.order-drop-after').forEach(el=>el.classList.remove('order-drop-before','order-drop-after'));return;}
        target=item.dataset.fileId!;const rect=item.getBoundingClientRect();after=item.classList.contains('notes-folder-tab')?x>rect.left+rect.width/2:y>rect.top+rect.height/2;
        surface.querySelectorAll('.order-drop-before,.order-drop-after').forEach(el=>el.classList.remove('order-drop-before','order-drop-after'));
        item.classList.add(after?'order-drop-after':'order-drop-before');
    };
    surface.addEventListener('pointerdown',event=>{touchGesture=event.pointerType==='touch' || event.pointerType==='pen';},true);
    surface.addEventListener('dragstart',event=>{if(!desktopFileInteraction() || touchGesture){event.preventDefault();return;}const item=(event.target as Element).closest<HTMLElement>('[data-file-id]');if(!item)return;start(item);event.dataTransfer?.setData('text/plain',source);if(event.dataTransfer)event.dataTransfer.effectAllowed='move';});
    surface.addEventListener('dragover',event=>{if(!active)return;event.preventDefault();locate((event.target as Element).closest<HTMLElement>('[data-file-id]'),event.clientX,event.clientY);});
    surface.addEventListener('drop',event=>{if(!active)return;event.preventDefault();suppressUntil=Date.now()+500;finish(true);});
    surface.addEventListener('dragend',()=>{if(active){suppressUntil=Date.now()+500;finish(false);}});
    surface.addEventListener('click',event=>{if(Date.now()<suppressUntil){event.preventDefault();event.stopImmediatePropagation();}},true);
    surface.addEventListener('keydown',event=>{const item=(event.target as Element).closest<HTMLElement>('[data-file-id]');if(desktopFileInteraction() && item && event.altKey && ['ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();app.moveFileEntries?.([item.dataset.fileId],event.key==='ArrowUp'?'up':'down');}});
    window.addEventListener('e2e-account-reset',()=>{if(active)finish(false);});
    return {decorate(item:HTMLElement){item.draggable=desktopFileInteraction();}};
}
