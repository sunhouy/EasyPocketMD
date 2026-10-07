/** Serialize system opens after workspace boot; suppress duplicate event/startup deliveries only. */
export function installNativeOpenBridge(app:any, ready:Promise<void>) {
    if(!app.electron?.onOpenLocalFileRequest)return;
    let queue=Promise.resolve(),startup=true;
    const early=new Set<string>(),pending=new Map<string,Promise<void>>();
    function open(path:string) {
        if(typeof path!=='string' || !path.trim())return Promise.resolve();
        if(pending.has(path))return pending.get(path)!;
        const task=queue.then(async()=>{
            try {
                await ready;
                app.nativeOpenRequestInProgress=true;
                if(!await app.openExternalLocalFileByPath(path)) throw Error(app.i18n?.getLanguage?.()==='en'?'Unable to read this file':'无法读取这个文件，请检查来源应用的文件权限');
            } catch(error) {
                app.showMessage?.((app.i18n?.getLanguage?.()==='en'?'Failed to open file: ':'打开文件失败：')+(error as Error).message,'error');
            } finally {app.nativeOpenRequestInProgress=false;}
        });
        pending.set(path,task);queue=task.catch(()=>{});
        void task.finally(()=>{if(pending.get(path)===task)pending.delete(path);});return task;
    }
    app.electron.onOpenLocalFileRequest((path:string)=>{if(startup)early.add(path);void open(path);});
    void ready.then(async()=>{
        try {const path=await app.electron.consumePendingOpenFilePath?.();if(path && !early.has(path))void open(path);}
        catch(error){app.showMessage?.('读取外部文件请求失败：'+String(error),'error');}
        finally{startup=false;early.clear();}
    });
    return {open};
}
