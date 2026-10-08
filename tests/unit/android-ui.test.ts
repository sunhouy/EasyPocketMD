/** @jest-environment jsdom */
import {applyAndroidDefaults,defaultBottomButtons,legacyBottomButtons,isAndroidApp,installAndroidChrome,orderedBottomButtons} from '../../js/main/android-ui';

afterEach(()=>{delete window.__TAURI__;document.body.className='';});
it('groups Android undo, redo and Save at the right without resetting chosen tools',()=>{
    const buttons=['mobileBottomSaveBtn','mobileUndoBtn','mobileInsertBtn','mobileRedoBtn','mobileFormulaBtn'];
    expect(orderedBottomButtons(buttons,true)).toEqual(['mobileInsertBtn','mobileFormulaBtn','mobileUndoBtn','mobileRedoBtn','mobileBottomSaveBtn']);
    expect(orderedBottomButtons(buttons,false)).toEqual(buttons);
});
it('starts fresh Android users in the file list with Save in place of AI',()=>{
    const settings:any={};applyAndroidDefaults(settings,true);
    expect(settings.defaultFileOpening).toBe('fileList');
    expect(settings.toolbarButtons).toContain('mobileBottomSaveBtn');
    expect(settings.toolbarButtons).not.toContain('mobileAIBtn');
});
it('keeps the desktop default and explicit user preferences',()=>{
    const settings:any={};applyAndroidDefaults(settings,false);
    expect(settings.defaultFileOpening).toBe('lastEdited');
    expect(settings.toolbarButtons).toEqual(legacyBottomButtons);
    const custom={defaultFileOpening:'lastEdited',toolbarButtons:['mobileUndoBtn']};
    applyAndroidDefaults(custom,true);expect(custom).toEqual({defaultFileOpening:'lastEdited',toolbarButtons:['mobileUndoBtn']});
});
it('migrates only the original Android toolbar arrangement',()=>{
    const settings={toolbarButtons:[...legacyBottomButtons]};applyAndroidDefaults(settings,true);
    expect(settings.toolbarButtons).toEqual(defaultBottomButtons(true));
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
