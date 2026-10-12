/** @jest-environment jsdom */
import {initBackNavigation} from '../../js/main/back-navigation';
let ua:jest.SpyInstance,app:any,route:()=>boolean;
beforeEach(()=>{
 ua=jest.spyOn(navigator,'userAgent','get').mockReturnValue('Android');window.__TAURI__={invoke:jest.fn()} as any;
 document.body.replaceChildren();app=window as any;app.fileListMultiSelectMode=false;app.isFileManagementMode=true;
 app.showMessage=jest.fn();app.enterFileManagementMode=jest.fn(()=>{app.isFileManagementMode=true;});app.exitFileListMultiSelectMode=jest.fn(()=>{app.fileListMultiSelectMode=false;});
 jest.spyOn(window.history,'back').mockImplementation(()=>{});jest.spyOn(window.history,'pushState').mockImplementation(()=>{});
});
afterEach(()=>{ua.mockRestore();delete window.__TAURI__;});
function install(overlays:Element[]=[],close=jest.fn(()=>true)) {initBackNavigation({getVisibleModalOverlays:()=>overlays,closeOverlayByBackPress:close,prefersFileListHome:()=>true});route=app.epmdAndroidBack;return close;}
it('cancels home selection without changing pages or navigating WebView history',()=>{
 install();app.fileListMultiSelectMode=true;expect(route()).toBe(true);expect(app.exitFileListMultiSelectMode).toHaveBeenCalledTimes(1);expect(app.enterFileManagementMode).not.toHaveBeenCalled();expect(window.history.back).not.toHaveBeenCalled();expect(window.history.pushState).not.toHaveBeenCalled();
});
it('consumes dialogs and More before leaving the editor',()=>{
 app.isFileManagementMode=false;const overlay=document.createElement('div');const close=install([overlay]);expect(route()).toBe(true);expect(close).toHaveBeenCalledWith(overlay);expect(app.enterFileManagementMode).not.toHaveBeenCalled();
 install();document.body.innerHTML='<div class="mobile-dropdown-content show"></div>';route();expect(document.querySelector('.show')).toBeNull();expect(close).toHaveBeenCalledTimes(1);
});
it('returns the editor to the list and only exits on a second back at the root',()=>{
 install();app.isFileManagementMode=false;expect(route()).toBe(true);expect(app.enterFileManagementMode).toHaveBeenCalledTimes(1);
 expect(route()).toBe(true);expect(app.showMessage).toHaveBeenCalledTimes(1);expect(route()).toBe(false);expect(window.history.back).not.toHaveBeenCalled();
});
it('can arm legacy history routing once for an older Android host',()=>{
 install();const enable=(window as any).enableLegacyAndroidBackRoute;enable();enable();expect(window.history.pushState).toHaveBeenCalledTimes(1);
 app.fileListMultiSelectMode=true;window.dispatchEvent(new PopStateEvent('popstate'));expect(app.exitFileListMultiSelectMode).toHaveBeenCalledTimes(1);
});
it('clears the second-back timer after the application resumes',()=>{
 install();expect(route()).toBe(true);window.dispatchEvent(new Event('epmd-native-resume'));
 expect(route()).toBe(true);expect(app.showMessage).toHaveBeenCalledTimes(2);expect(route()).toBe(false);
});
it('clears the second-back timer when page visibility changes',()=>{
 install();expect(route()).toBe(true);document.dispatchEvent(new Event('visibilitychange'));
 expect(route()).toBe(true);expect(route()).toBe(false);
});
