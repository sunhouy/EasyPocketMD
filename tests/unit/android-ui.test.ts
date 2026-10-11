/** @jest-environment jsdom */
import {applyStartupDefaults,isAndroidApp,installAndroidChrome} from '../../js/main/android-ui';
afterEach(()=>{delete window.__TAURI__;document.body.className='';});
it('defaults every platform to the file home and removes retired bottom-toolbar preferences',()=>{
 const settings:any={toolbarButtons:['mobileUndoBtn'],hideBottomToolbarOnKeyboard:true};
 applyStartupDefaults(settings);expect(settings).toEqual({defaultFileOpening:'fileList'});
 const custom={defaultFileOpening:'lastEdited'};applyStartupDefaults(custom);expect(custom.defaultFileOpening).toBe('lastEdited');
});
it('requests native storage access only in the Android shell and handles refusal',async()=>{
    const original=navigator.userAgent;
    Object.defineProperty(navigator,'userAgent',{configurable:true,value:'Android'});
    expect(isAndroidApp()).toBe(false);installAndroidChrome();expect(document.body.classList.contains('android-app')).toBe(false);
    const invoke=jest.fn().mockRejectedValue(new Error('Declined'));window.__TAURI__={invoke} as any;
    installAndroidChrome();await Promise.resolve();
    expect(invoke).toHaveBeenCalledWith('request_storage_access');expect(document.body.classList.contains('android-app')).toBe(true);
    Object.defineProperty(navigator,'userAgent',{configurable:true,value:original});
});
