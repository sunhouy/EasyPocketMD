type CodeView={hasFocus:boolean;focus:()=>void;posAtCoords:(coords:{x:number;y:number})=>number|null;dispatch:(transaction:any)=>void};
/** Let CodeMirror handle native gestures/input before isolating them from Vditor. */
export function bindMobileCodeInput(host:HTMLElement,view:CodeView,editable:()=>boolean) {
    let tap:{x:number;y:number;at:number;id:number}|null=null;
    host.addEventListener('pointerdown',event=>{
        tap=event.pointerType==='touch' && editable() && (event.target as Element).closest('.cm-scroller')?
            {x:event.clientX,y:event.clientY,at:Date.now(),id:event.pointerId}:null;
    });
    host.addEventListener('pointercancel',()=>{tap=null;});
    host.addEventListener('pointerup',event=>{
        const start=tap;tap=null;
        if(!start || start.id!==event.pointerId || !editable() || Date.now()-start.at>350 || Math.hypot(event.clientX-start.x,event.clientY-start.y)>10)return;
        // Native touches may land on gutters/empty space without focusing the editable.
        // Preserve a caret already placed by CodeMirror and never steal scroll/long press.
        if(!view.hasFocus){
            const position=view.posAtCoords({x:event.clientX,y:event.clientY});
            if(position!=null)view.dispatch({selection:{anchor:position}});
            view.focus();
        }
    });
    for(const name of ['input','beforeinput','keydown','keyup','paste','copy','cut','click','dblclick','mousedown','mouseup','pointerdown','pointerup','pointercancel','touchstart','touchmove','touchend','touchcancel','compositionstart','compositionupdate','compositionend']){
        host.addEventListener(name,event=>event.stopPropagation());
    }
}
