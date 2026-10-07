/** @jest-environment jsdom */
// @ts-nocheck
import {isVisibleModalSurface,modalSurfaceSelector,dismissTransientSurface} from '../../js/main/modal-surfaces';
require('../../js/ui/dialog');
beforeEach(()=>{document.body.innerHTML='';});
it('finds custom prompts and settings while excluding child dialogs under hidden parents',async()=>{
    document.body.innerHTML='<div class="modal-overlay show"><section aria-modal="true"></section></div><div style="display:none"><section id="hidden" aria-modal="true"></section></div>';
    const prompt=window.customPrompt('文件名');
    const surfaces=[...document.querySelectorAll(modalSurfaceSelector)].filter(isVisibleModalSurface);
    expect(surfaces).toContain(document.getElementById('customDialogContainer'));
    expect(surfaces).not.toContain(document.getElementById('hidden'));
    expect(dismissTransientSurface(document.getElementById('customDialogContainer'))).toBe(true);
    expect(await prompt).toBeNull();
    expect([...document.querySelectorAll(modalSurfaceSelector)].filter(isVisibleModalSurface)).not.toContain(document.getElementById('customDialogContainer'));
});
it('consumes visible protected dialogs instead of letting Back leave the page',()=>{
    document.body.innerHTML='<div class="modal-overlay show" data-esc-closable="false"></div>';
    expect(isVisibleModalSurface(document.querySelector('.modal-overlay'))).toBe(true);
});
it('closes action menus without leaving inline styles that prevent reopening',()=>{
    document.body.innerHTML='<div id="fileManagementFab" class="open"></div><div id="fileManagementFabRing" class="open"></div><div class="mobile-dropdown-content show"></div>';
    expect(dismissTransientSurface(document.getElementById('fileManagementFabRing'))).toBe(true);
    expect(document.getElementById('fileManagementFab').classList.contains('open')).toBe(false);
    const dropdown=document.querySelector('.mobile-dropdown-content');expect(dismissTransientSurface(dropdown)).toBe(true);
    expect(dropdown.classList.contains('show')).toBe(false);expect(dropdown.style.display).toBe('');
});
