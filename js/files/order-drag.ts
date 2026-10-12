/** Desktop native drag plus a touch handle, without changing folders or paths. */
export function installOrderDrag(surface:HTMLElement, app:any) {
    let source='', target='', after=false, owner:any, workspace:any, handle:HTMLElement|null=null, pointer:number|undefined;
    let active=false, suppressUntil=0;
    const clearMarkers=()=>surface.querySelectorAll('.order-drop-before,.order-drop-after,.order-drag-source').forEach(el=>el.classList.remove('order-drop-before','order-drop-after','order-drag-source'));
    const finish=(commit:boolean)=>{
        const allowed=commit && active && owner===app.currentUser && workspace===app.files;
        const id=source, destination=target, insertAfter=after;
        if(pointer!==undefined && handle?.hasPointerCapture?.(pointer))handle.releasePointerCapture(pointer);
        handle=null;pointer=undefined;source='';target='';active=false;app.fileOrderDragging=false;clearMarkers();
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
    surface.addEventListener('dragstart',event=>{const item=(event.target as Element).closest<HTMLElement>('[data-file-id]');if(!item)return;start(item);event.dataTransfer?.setData('text/plain',source);if(event.dataTransfer)event.dataTransfer.effectAllowed='move';});
    surface.addEventListener('dragover',event=>{if(!active)return;event.preventDefault();locate((event.target as Element).closest<HTMLElement>('[data-file-id]'),event.clientX,event.clientY);});
    surface.addEventListener('drop',event=>{if(!active)return;event.preventDefault();suppressUntil=Date.now()+500;finish(true);});
    surface.addEventListener('dragend',()=>{if(active){suppressUntil=Date.now()+500;finish(false);}});
    surface.addEventListener('pointerdown',event=>{
        const grip=(event.target as Element).closest<HTMLElement>('.notes-order-handle');
        if(!grip || event.pointerType==='mouse' || event.button!==0)return;
        const item=grip.closest<HTMLElement>('[data-file-id]');if(!item)return;
        event.preventDefault();event.stopImmediatePropagation();handle=grip;pointer=event.pointerId;start(item);grip.setPointerCapture?.(event.pointerId);
    },true);
    surface.addEventListener('pointermove',event=>{if(pointer!==event.pointerId || !active)return;event.preventDefault();locate(document.elementFromPoint(event.clientX,event.clientY)?.closest<HTMLElement>('[data-file-id]') || null,event.clientX,event.clientY);
        const grid=surface.querySelector<HTMLElement>('.notes-home-grid');if(grid){const r=grid.getBoundingClientRect();if(event.clientY<r.top+35)grid.scrollTop-=18;else if(event.clientY>r.bottom-35)grid.scrollTop+=18;}
    });
    surface.addEventListener('pointerup',event=>{if(pointer===event.pointerId){event.preventDefault();suppressUntil=Date.now()+500;finish(true);}});
    surface.addEventListener('pointercancel',event=>{if(active && pointer===event.pointerId)finish(false);});
    surface.addEventListener('click',event=>{if(Date.now()<suppressUntil || (event.target as Element).closest('.notes-order-handle')){event.preventDefault();event.stopImmediatePropagation();}},true);
    surface.addEventListener('keydown',event=>{const item=(event.target as Element).closest<HTMLElement>('[data-file-id]');if(item && event.altKey && ['ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();app.moveFileEntries?.([item.dataset.fileId],event.key==='ArrowUp'?'up':'down');}});
    window.addEventListener('e2e-account-reset',()=>{if(active)finish(false);});
    return {decorate(item:HTMLElement){item.draggable=true;const grip=document.createElement('span');grip.className='notes-order-handle';grip.tabIndex=0;grip.setAttribute('role','button');grip.setAttribute('aria-label',app.i18n?.getLanguage?.()==='en'?'Drag to reorder; Alt + arrow keys to move':'拖动排序；Alt 加方向键移动');grip.innerHTML='<i class="fas fa-grip-vertical" aria-hidden="true"></i>';item.append(grip);}};
}
