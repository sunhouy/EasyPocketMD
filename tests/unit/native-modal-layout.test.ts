/** @jest-environment jsdom */
import { applyNativeModalLayout } from '../../js/main/modal-layout';
afterEach(()=>document.body.className='');
it.each(['settingsModalOverlay','historyModalOverlay'])('covers the toolbar for native %s',id=>{
    document.body.innerHTML=`<div class="toolbar"><div class="modal-overlay" id="${id}"><div class="modal ${id.startsWith('history')?'history-modal':''}" style="max-height:85vh"></div></div></div>`;
    const overlay=document.getElementById(id); applyNativeModalLayout(overlay);
    expect(overlay.parentElement).toBe(document.body);
    expect(overlay.style.top).toBe('0px'); expect(overlay.style.padding).toBe('0px');
    expect(overlay.querySelector<HTMLElement>('.modal').style.height).toBe('100%');
    const markup=overlay.outerHTML; applyNativeModalLayout(overlay);
    expect(overlay.outerHTML).toBe(markup); // Mutation observer must settle rather than loop.
});
it.each(['settingsModalOverlay','historyModalOverlay'])('does not add system bar padding twice in Android %s',id=>{
    document.body.className='tauri-mobile-safe-area tauri-android-native-insets';
    document.body.innerHTML=`<div class="modal-overlay" id="${id}"><div class="modal history-modal"></div></div>`;
    applyNativeModalLayout(document.getElementById(id));
    const modal=document.querySelector<HTMLElement>('.modal');
    expect(modal.style.paddingTop).toBe('16px');expect(modal.style.paddingBottom).toBe('16px');
});
it('preserves the layer of nested file dialogs and settles after repeated layout updates',()=>{
 document.body.innerHTML='<div class="modal-overlay" style="z-index:100120"><div class="modal"></div></div>';
 const overlay=document.querySelector<HTMLElement>('.modal-overlay');applyNativeModalLayout(overlay);
 expect(overlay.style.zIndex).toBe('100120');const markup=overlay.outerHTML;applyNativeModalLayout(overlay);expect(overlay.outerHTML).toBe(markup);
});
