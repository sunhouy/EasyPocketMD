// Pointer-based controls work with mouse, pen and touch. Geometry survives
// output updates, minimize/maximize toggles, and viewport/keyboard changes.
export function floatingRunWindow(panel: HTMLElement, header: HTMLElement) {
    type Rect = {x:number;y:number;width:number;height:number};
    let rect: Rect | null = null, maximized = false, minimized = false;
    const handles: HTMLElement[] = [];
    function viewport() {
        const v = window.visualViewport;
        return {x:(v?.offsetLeft || 0)+8,y:(v?.offsetTop || 0)+8,width:Math.max(1,(v?.width || window.innerWidth)-16),height:Math.max(1,(v?.height || window.innerHeight)-16)};
    }
    function fit(value: Rect) {
        const v = viewport();
        const width = Math.min(v.width, Math.max(Math.min(300,v.width),value.width));
        const height = Math.min(v.height, Math.max(Math.min(160,v.height),value.height));
        return {width,height,x:Math.max(v.x,Math.min(value.x,v.x+v.width-width)),y:Math.max(v.y,Math.min(value.y,v.y+v.height-height))};
    }
    function apply() {
        if (panel.style.display === 'none') return;
        const v = viewport();
        if (!rect) {
            const width = Math.min(560,v.width), height = Math.min(380,v.height*.55);
            rect = fit({x:v.x+v.width-width,y:v.y+v.height-height,width,height});
        }
        rect = fit(rect);
        const r = maximized && !minimized ? {x:v.x,y:v.y,width:v.width,height:v.height} : rect;
        panel.style.inset = 'auto'; panel.style.left = r.x+'px'; panel.style.top = r.y+'px';
        panel.style.width = r.width+'px'; panel.style.height = minimized ? 'auto' : r.height+'px';
        panel.style.maxHeight = (minimized ? v.height : r.height)+'px';
        if (minimized) panel.style.top = Math.min(r.y,v.y+v.height-panel.getBoundingClientRect().height)+'px';
        header.style.cursor = maximized && !minimized ? 'default' : 'move';
        handles.forEach(handle => handle.hidden = minimized || maximized);
    }
    function gesture(event: PointerEvent, direction = '') {
        if (event.button !== 0 || (maximized && !minimized) || (direction && minimized)) return;
        if (!direction && (event.target as Element).closest('button,a,input,select,textarea')) return;
        apply(); if (!rect) return;
        const target = event.currentTarget as HTMLElement;
        const initial = {...rect}, bounds = panel.getBoundingClientRect();
        const x = event.clientX, y = event.clientY;
        if (minimized) initial.y = bounds.top;
        event.preventDefault(); target.setPointerCapture(event.pointerId);
        header.style.userSelect = 'none';
        const move = (next: PointerEvent) => {
            if (next.pointerId !== event.pointerId) return;
            const dx = next.clientX-x, dy = next.clientY-y;
            const v = viewport(), minW = Math.min(300,v.width), minH = Math.min(160,v.height);
            let value = {...initial};
            if (!direction) { value.x += dx; value.y += dy; }
            else {
                const right = initial.x+initial.width, bottom = initial.y+initial.height;
                if (direction.includes('e')) value.width = Math.max(minW,Math.min(v.x+v.width-initial.x,initial.width+dx));
                if (direction.includes('s')) value.height = Math.max(minH,Math.min(v.y+v.height-initial.y,initial.height+dy));
                if (direction.includes('w')) { value.x = Math.max(v.x,Math.min(right-minW,initial.x+dx)); value.width = right-value.x; }
                if (direction.includes('n')) { value.y = Math.max(v.y,Math.min(bottom-minH,initial.y+dy)); value.height = bottom-value.y; }
            }
            rect = fit(value); apply();
        };
        const end = (next: PointerEvent) => {
            if (next.pointerId !== event.pointerId) return;
            target.removeEventListener('pointermove',move); target.removeEventListener('pointerup',end);
            target.removeEventListener('pointercancel',end); target.removeEventListener('lostpointercapture',end);
            if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);
            header.style.userSelect = '';
        };
        target.addEventListener('pointermove',move); target.addEventListener('pointerup',end);
        target.addEventListener('pointercancel',end); target.addEventListener('lostpointercapture',end);
    }
    panel.style.boxSizing = 'border-box';
    header.style.touchAction = 'none';
    header.addEventListener('pointerdown',event => gesture(event));
    const edges: Record<string,string> = {
        n:'top:0;left:18px;right:18px;height:8px',s:'bottom:0;left:18px;right:18px;height:8px',
        w:'left:0;top:18px;bottom:18px;width:8px',e:'right:0;top:18px;bottom:18px;width:8px',
        nw:'top:0;left:0;width:18px;height:18px',ne:'top:0;right:0;width:18px;height:18px',
        sw:'bottom:0;left:0;width:18px;height:18px',se:'bottom:0;right:0;width:22px;height:22px'
    };
    for (const [direction,position] of Object.entries(edges)) {
        const handle = document.createElement('div');
        handle.style.cssText = 'position:absolute;z-index:2;touch-action:none;'+position+';cursor:'+direction+'-resize;';
        handle.addEventListener('pointerdown',event => gesture(event,direction));
        if (direction === 'se') {
            handle.textContent = '◢'; handle.style.color = '#8993a3'; handle.style.textAlign = 'right';
            handle.tabIndex = 0; handle.setAttribute('role','button'); handle.setAttribute('aria-label','调整运行窗口大小（方向键）');
            handle.addEventListener('keydown',event => {
                if (!rect || !['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) return;
                event.preventDefault(); const step = event.shiftKey ? 40 : 10;
                rect = fit({...rect,width:rect.width+(event.key==='ArrowRight'?step:event.key==='ArrowLeft'?-step:0),height:rect.height+(event.key==='ArrowDown'?step:event.key==='ArrowUp'?-step:0)}); apply();
            });
        }
        panel.append(handle); handles.push(handle);
    }
    window.addEventListener('resize',apply);
    window.visualViewport?.addEventListener('resize',apply);
    window.visualViewport?.addEventListener('scroll',apply);
    return {update(full: boolean, collapsed: boolean) { maximized = full; minimized = collapsed; apply(); }};
}
