import {isAndroidApp} from '../main/android-ui';

/** The native picker avoids WebView user-activation and file chooser limitations. */
export async function pickAndroidImportFiles(app:any=window):Promise<File[]|null> {
    if(!isAndroidApp())return null;
    const invoke=app.__TAURI__?.core?.invoke || app.__TAURI__?.invoke;
    if(!invoke)return null;
    let result:any;
    try {result=await invoke('android_import_files');}
    catch(error) {
        // Older APKs retain their WebView picker. Real picker/read errors are reported.
        if(/unknown command|command .*not found|not found.*command/i.test(String(error)))return null;
        throw error;
    }
    if(result?.canceled)return [];
    if(!Array.isArray(result?.files))throw new Error('Invalid Android import result');
    return result.files.map((item:any)=>{
        const binary=atob(item.base64);
        const bytes=Uint8Array.from(binary,char=>char.charCodeAt(0));
        return new File([bytes],item.name,{type:item.mime || 'application/octet-stream'});
    });
}
