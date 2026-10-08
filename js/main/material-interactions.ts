/** Delegated ink for dynamic menus and buttons; it never consumes focus or clicks. */
export function installMaterialInteractions(root:Document=document) {
    const targets='button,[role="button"],.notes-file-card,.notes-folder-card,.notes-folder-tab,.jstree-anchor,.radio-group label';
    const layers=new Set<HTMLElement>();
    const clear=()=>{for(const layer of layers)layer.remove();layers.clear();};
    const ink=(event:Event,x?:number,y?:number)=>{
        if(!(event.target instanceof Element) || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return;
        const target=event.target.closest<HTMLElement>(targets);
        if(!target || target.matches(':disabled,[aria-disabled="true"]') || target.closest('[inert]'))return;
        const rect=target.getBoundingClientRect();if(!rect.width || !rect.height)return;
        const style=getComputedStyle(target),diameter=Math.hypot(rect.width,rect.height)*2;
        const layer=root.createElement('div');layer.className='md-ripple-layer';layer.setAttribute('aria-hidden','true');
        Object.assign(layer.style,{left:rect.left+'px',top:rect.top+'px',width:rect.width+'px',height:rect.height+'px',borderRadius:style.borderRadius});
        const wave=root.createElement('span');wave.className='md-ripple-wave';
        Object.assign(wave.style,{width:diameter+'px',height:diameter+'px',left:((x ?? rect.left+rect.width/2)-rect.left-diameter/2)+'px',top:((y ?? rect.top+rect.height/2)-rect.top-diameter/2)+'px',backgroundColor:style.color});
        layer.append(wave);root.body.append(layer);layers.add(layer);
        const remove=()=>{layer.remove();layers.delete(layer);};wave.addEventListener('animationend',remove,{once:true});setTimeout(remove,650);
    };
    const pointer=(event:PointerEvent)=>{if(event.button===0)ink(event,event.clientX,event.clientY);};
    const keyboard=(event:MouseEvent)=>{if(event.detail===0)ink(event);};
    root.addEventListener('pointerdown',pointer);root.addEventListener('click',keyboard);
    root.addEventListener('scroll',clear,true);root.addEventListener('pointercancel',clear);
    return ()=>{clear();root.removeEventListener('pointerdown',pointer);root.removeEventListener('click',keyboard);root.removeEventListener('scroll',clear,true);root.removeEventListener('pointercancel',clear);};
}
