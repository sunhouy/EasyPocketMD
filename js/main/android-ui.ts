export function isAndroidApp(): boolean {
    return !!window.__TAURI__ && /android/i.test(navigator.userAgent);
}
export const legacyBottomButtons=['mobileInsertBtn','mobileFormulaBtn','mobileChartBtn','mobileUndoBtn','mobileRedoBtn','mobileAIBtn'];
export function defaultBottomButtons(android:boolean):string[] {
    return legacyBottomButtons.map(id=>android && id==='mobileAIBtn'?'mobileBottomSaveBtn':id);
}
export function orderedBottomButtons(buttons:string[],android:boolean):string[] {
    if(!android)return [...buttons];
    const group=['mobileUndoBtn','mobileRedoBtn','mobileBottomSaveBtn'];
    return [...buttons.filter(id=>!group.includes(id)),...group.filter(id=>buttons.includes(id))];
}
export function applyAndroidDefaults(settings:any,android:boolean) {
    if(!settings.defaultFileOpening)settings.defaultFileOpening=android?'fileList':'lastEdited';
    if(!settings.toolbarButtons || (android && JSON.stringify(settings.toolbarButtons)===JSON.stringify(legacyBottomButtons)))settings.toolbarButtons=defaultBottomButtons(android);
}
export function installAndroidChrome() {
    const android=isAndroidApp();document.body.classList.toggle('android-app',android);
    if(android){const invoke=window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke;
        if(invoke)void invoke('request_storage_access').catch(()=>{});
    }
}
