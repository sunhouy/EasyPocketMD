/** @jest-environment jsdom */
// @ts-nocheck
export {};
Object.assign(global,{TextEncoder:require('node:util').TextEncoder});
window.currentUser=null;
const vault=require('../../js/e2e-vault');
const ui=require('../../js/e2e-ui');
it('keeps serialization without any alternate-unlock settings or dialogs',()=>{
    expect(ui.showSettings).toBeUndefined();expect(window.showE2ESettings).toBeUndefined();
    expect(vault.saveSettings).toBeUndefined();expect(vault.unlockPasskey).toBeUndefined();expect(vault.setUI).toBeUndefined();
    expect(typeof window.e2eSerializeFiles).toBe('function');
    expect(document.querySelector('.e2e-modal')).toBeNull();
});
