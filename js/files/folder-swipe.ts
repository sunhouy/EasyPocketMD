/** Horizontal swipes switch the filter; vertical gestures retain native scrolling. */
export function bindFolderSwipe(surface:HTMLElement, switchFolder:(direction:number)=>void, enabled:()=>boolean) {
    let start:{x:number;y:number}|null=null, horizontal=false, suppressUntil=0;
    surface.addEventListener('touchstart',event=>{
        start=event.touches.length===1 && enabled()?{x:event.touches[0].clientX,y:event.touches[0].clientY}:null;
        horizontal=false;
    },{passive:true});
    surface.addEventListener('touchmove',event=>{
        if(!start || event.touches.length!==1){start=null;return;}
        const dx=event.touches[0].clientX-start.x,dy=event.touches[0].clientY-start.y;
        if(!horizontal && Math.abs(dy)>12 && Math.abs(dy)>Math.abs(dx)){start=null;return;}
        if(Math.abs(dx)>18 && Math.abs(dx)>Math.abs(dy)*1.5)horizontal=true;
        if(horizontal && event.cancelable)event.preventDefault();
    },{passive:false});
    surface.addEventListener('touchend',event=>{
        if(!start)return;
        const touch=event.changedTouches[0];
        const dx=touch?.clientX-start.x,dy=touch?.clientY-start.y;
        start=null;
        if(enabled() && Math.abs(dx)>=60 && Math.abs(dx)>Math.abs(dy)*1.5){
            suppressUntil=Date.now()+500;switchFolder(dx<0?1:-1);
        }
    });
    surface.addEventListener('touchcancel',()=>{start=null;});
    surface.addEventListener('click',event=>{if(Date.now()<suppressUntil){event.preventDefault();event.stopImmediatePropagation();}},true);
}
