import {isAndroidApp} from '../main/android-ui';

/** The native picker avoids WebView user-activation and file chooser limitations. */
export async function pickAndroidImportFiles(app:any=window,options?:{accept?:string;multiple?:boolean}):Promise<File[]|null> {
    if(!isAndroidApp())return null;
    const invoke=app.__TAURI__?.core?.invoke || app.__TAURI__?.invoke;
    if(!invoke)return null;
    let result:any;
    try {
        const types:Record<string,string>={pdf:'application/pdf',md:'text/markdown',markdown:'text/markdown',txt:'text/plain',doc:'application/msword',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',xls:'application/vnd.ms-excel',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',ppt:'application/vnd.ms-powerpoint',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg'};
        const mimeTypes=options?.accept?.split(',').map(value=>value.trim()).filter(Boolean).map(value=>value.startsWith('.')?types[value.slice(1).toLowerCase()] || 'application/octet-stream':value);
        result=options?await invoke('android_import_files',{mimeTypes:mimeTypes?.length?mimeTypes:['*/*'],multiple:options.multiple!==false}):await invoke('android_import_files');
    }
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
