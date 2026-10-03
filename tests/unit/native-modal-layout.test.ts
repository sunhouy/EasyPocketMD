/** @jest-environment jsdom */
import { applyNativeModalLayout } from '../../js/main/modal-layout';
it.each(['settingsModalOverlay','historyModalOverlay'])('covers the toolbar for native %s',id=>{
    document.body.innerHTML=`<div class="toolbar"><div class="modal-overlay" id="${id}"><div class="modal ${id.startsWith('history')?'history-modal':''}" style="max-height:85vh"></div></div></div>`;
    const overlay=document.getElementById(id); applyNativeModalLayout(overlay);
    expect(overlay.parentElement).toBe(document.body);
    expect(overlay.style.top).toBe('0px'); expect(overlay.style.padding).toBe('0px');
    expect(overlay.querySelector<HTMLElement>('.modal').style.height).toBe('100%');
    const markup=overlay.outerHTML; applyNativeModalLayout(overlay);
    expect(overlay.outerHTML).toBe(markup); // Mutation observer must settle rather than loop.
});
