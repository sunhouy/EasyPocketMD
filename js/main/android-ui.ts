export function isAndroidApp(): boolean {
    return !!window.__TAURI__ && /android/i.test(navigator.userAgent);
}
export function applyStartupDefaults(settings:any) {
    if(!settings.defaultFileOpening) settings.defaultFileOpening='fileList';
    delete settings.toolbarButtons;
    delete settings.hideBottomToolbarOnKeyboard;
}
export function installAndroidChrome() {
    const android=isAndroidApp();document.body.classList.toggle('android-app',android);
    if(android){const invoke=window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke;
        if(invoke)void invoke('request_storage_access').catch(()=>{});
    }
}
