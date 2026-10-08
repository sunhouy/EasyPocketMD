/** Delegated ink for dynamic controls; it never consumes focus or clicks. */
export function installMaterialInteractions(root:Document=document) {
    const targets='summary.settings-setting-summary,button,[role="button"],.notes-file-card,.notes-folder-card,.notes-folder-tab,.jstree-anchor,.radio-group label';
    const layers=new Map<HTMLElement,{source:HTMLElement;timer:ReturnType<typeof setTimeout>}>();
    const remove=(layer:HTMLElement)=>{const record=layers.get(layer);if(record)clearTimeout(record.timer);layer.remove();layers.delete(layer);};
    const clear=()=>{for(const layer of layers.keys())remove(layer);};
    // Portals must not outlive their source or float above a newly opened surface.
    const sweep=()=>{for(const [layer,{source}] of layers){
        let visible=source.isConnected;
        for(let node:HTMLElement=source;visible && node;node=node.parentElement){
            const style=getComputedStyle(node);visible=!node.hidden && style.display!=='none' && style.visibility!=='hidden' && style.opacity!=='0';
        }
        if(visible && root.elementFromPoint){const rect=source.getBoundingClientRect();const hit=root.elementFromPoint(rect.left+rect.width/2,rect.top+rect.height/2);visible=!!hit && (source.contains(hit) || hit===source);}
        if(!visible)remove(layer);
    }};
    const observer=new MutationObserver(sweep);
    observer.observe(root.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style','hidden','aria-hidden','open']});
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
        layer.append(wave);root.body.append(layer);layers.set(layer,{source:target,timer:setTimeout(()=>remove(layer),650)});
        wave.addEventListener('animationend',()=>remove(layer),{once:true});
    };
    const pointer=(event:PointerEvent)=>{if(event.button===0)ink(event,event.clientX,event.clientY);};
    const keyboard=(event:MouseEvent)=>{if(event.detail===0)ink(event);};
    root.addEventListener('pointerdown',pointer);root.addEventListener('click',keyboard);
    root.addEventListener('scroll',clear,true);root.addEventListener('pointercancel',clear);root.addEventListener('visibilitychange',clear);
    window.addEventListener('resize',clear);window.addEventListener('pagehide',clear);window.addEventListener('popstate',clear);
    return ()=>{observer.disconnect();clear();root.removeEventListener('pointerdown',pointer);root.removeEventListener('click',keyboard);root.removeEventListener('scroll',clear,true);root.removeEventListener('pointercancel',clear);root.removeEventListener('visibilitychange',clear);window.removeEventListener('resize',clear);window.removeEventListener('pagehide',clear);window.removeEventListener('popstate',clear);};
}
