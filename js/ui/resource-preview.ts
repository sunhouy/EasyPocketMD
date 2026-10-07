/** Full-screen image preview above My Files; Back/Escape closes only this surface. */
export function showResourcePreview(url:string,name:string) {
    document.querySelectorAll<HTMLElement>('.resource-preview-overlay').forEach(existing=>(existing as any).epmdCloseByBackPress?.());
    const overlay=document.createElement('div');overlay.className='modal-overlay resource-preview-overlay';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');
    const image=document.createElement('img');image.alt=name;image.src=url;
    const caption=document.createElement('p');caption.textContent=name;
    const close=document.createElement('button');close.className='epmd-dialog-close';close.type='button';close.textContent='×';close.setAttribute('aria-label','关闭 / Close');
    const dismiss=()=>{overlay.remove();document.removeEventListener('keydown',escape,true);};
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.stopImmediatePropagation();dismiss();}};
    (overlay as any).epmdCloseByBackPress=dismiss;close.onclick=dismiss;overlay.onclick=event=>{if(event.target===overlay)dismiss();};
    overlay.append(image,caption,close);document.body.append(overlay);document.addEventListener('keydown',escape,true);close.focus();return overlay;
}
