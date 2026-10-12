import { markdownToPlainText } from '../markdown-plain-text';
import {isAndroidApp} from './android-ui';

const pending = new WeakSet<object>();
/** The native editor owns dates, calendar permissions, recurrence, and saving. */
export async function showAndroidTodo(app:any=window) {
    if(!isAndroidApp() || pending.has(app))return;
    const invoke=app.__TAURI__?.core?.invoke || app.__TAURI__?.invoke;
    if(!invoke)throw Error('系统日历接口不可用');
    pending.add(app);
    const en=app.i18n?.getLanguage?.()==='en',t=(zh:string,english:string)=>en?english:zh;
    try {
        const file=app.files?.find((file:any)=>file.id===app.currentFileId);
        let description='';
        try {
            const content=await app.getCurrentEditorContent?.(file?.id,file?.content) ?? app.vditor?.getValue?.() ?? file?.content ?? '';
            if(/^EPMD\d*:/.test(content))throw Error(t('请先打开并解密文档后再使用其内容','Open and unlock the document before using its content'));
            description=markdownToPlainText(content);
        } catch(error) { app.showMessage?.(String((error as Error).message || error),'warning'); }
        const result=await invoke('calendar_action',{action:'showTodo',payload:{
            title:file?.name?.split('/').pop()?.replace(/\.md$/i,'') || t('新日程','New event'),
            description,english:en,night:app.nightMode===true,
        }});
        if(!result.canceled)app.showMessage?.(t('日程已写入系统日历','Added to system calendar'),'success');
    } catch(error) { app.showMessage?.(String((error as Error).message || error),'error'); }
    finally { pending.delete(app); }
}
