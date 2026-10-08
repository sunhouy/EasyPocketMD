/** @jest-environment jsdom */
// @ts-nocheck
export {};
jest.mock('../../js/ui/ai',()=>{window.showAILayoutDialog=jest.fn();return {};});
require('../../js/ui/print');
it('restores the print AI button after lazy loading and permits reopening',async()=>{
    jest.useFakeTimers();window.currentUser={username:'user',token:'token'};window.userSettings={};window.vditor={getValue:()=> '# Test'};
    window.debounce=fn=>fn;window.showMessage=jest.fn();window.saveCurrentFile=jest.fn(async()=>{});
    window.fetch=jest.fn(async()=>({ok:true,json:async()=>({code:200,data:{}})}));
    window.WebSocket=jest.fn(()=>({readyState:0,close:jest.fn(),send:jest.fn()}));
    delete window.showAILayoutDialog;window.showPrintDialog('print');
    const button=document.getElementById('aiLayoutBtn');expect(button).not.toBeNull();
    const opening=button.onclick();expect(document.getElementById('featureLoadingStatus')).not.toBeNull();await jest.advanceTimersByTimeAsync(32);await opening;expect(document.getElementById('featureLoadingStatus')).toBeNull();expect(button.disabled).toBe(false);expect(button.textContent).not.toContain('加载中');
    await button.onclick();expect(window.showAILayoutDialog).toHaveBeenCalledTimes(2);
    jest.clearAllTimers();jest.useRealTimers();
});
