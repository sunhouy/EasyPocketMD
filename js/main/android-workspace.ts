import {modalSurfaceSelector,isVisibleModalSurface} from './modal-surfaces';
import {isAndroidApp} from './android-ui';
import {nativePalette} from './native-palette';

/** Native views render snapshots; existing handlers remain the only mutation path. */
export function installAndroidWorkspace(app:any=window) {
    if(!isAndroidApp())return;
    const invoke=app.__TAURI__?.core?.invoke || app.__TAURI__?.invoke;if(!invoke)return;
    let toast:any=null,toastId=0;
    let enabled=true,owner=app.currentUser,epoch=1,home:any=null,more:any=null,sending=false,dirty=false;
    const refs=new Map<string,HTMLElement>(),keys=new WeakMap<HTMLElement,string>();let next=0;
    const key=(element:HTMLElement)=>{let id=keys.get(element);if(!id){id='native-'+(++next);keys.set(element,id);}refs.set(id,element);return id;};
    const label=(el:HTMLElement)=>el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent?.trim() || '';
    function node(el:HTMLElement):any {
        if(el.hidden || el.style.display==='none' || el.matches('script,style,[type=hidden]'))return null;
        if(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
            if(el.type==='radio')return {type:'radio',key:key(el),label:label(el.closest('label') || el),value:el.value,checked:(el as HTMLInputElement).checked,disabled:el.disabled};
            const title=el.closest('.form-group')?.querySelector('label')?.textContent?.trim() || (el as HTMLInputElement).placeholder || label(el);
            return {type:el instanceof HTMLSelectElement?'select':el.type==='checkbox'?'checkbox':el.type==='file'?'button':'input',key:key(el),label:title,
                value:el.value,checked:(el as HTMLInputElement).checked,inputType:el.classList.contains('epmd-secret-field')?'password':el.type,min:(el as HTMLInputElement).min,max:(el as HTMLInputElement).max,step:(el as HTMLInputElement).step,disabled:el.disabled,
                options:el instanceof HTMLSelectElement?[...el.options].map(o=>({label:o.text,value:o.value})):undefined};
        }
        if(getComputedStyle(el).display==='none')return null;
        if(el instanceof HTMLButtonElement || el instanceof HTMLAnchorElement)return {type:'button',key:key(el),label:label(el),disabled:el instanceof HTMLButtonElement && el.disabled};
        if(el.matches('details,.settings-section')) {
            const heading=el.querySelector(':scope > summary,:scope > .settings-section-header');
            return {type:'group',label:heading?.textContent?.trim() || '',expanded:!(el instanceof HTMLDetailsElement),children:[...el.children].filter(child=>child!==heading).map(child=>node(child as HTMLElement)).filter(Boolean)};
        }
        if(el.tagName==='LABEL' && el.querySelector('input'))return {type:'container',children:[...el.querySelectorAll('input')].map(child=>node(child)).filter(Boolean)};
        const children=[...el.children].map(child=>node(child as HTMLElement)).filter(Boolean);
        if(children.length)return {type:'container',children};
        const text=el.textContent?.trim();return text && !el.matches('i,svg,option,label')?{type:'text',label:text.slice(0,1000)}:null;
    }
    function settings() {
        const overlay=document.getElementById('settingsModalOverlay');
        if(!overlay?.classList.contains('show'))return null;
        return {title:app.i18n?.tOr?.('settings','设置') || '设置',children:[...overlay.querySelector('.modal-form')!.children].map(child=>node(child as HTMLElement)).filter(Boolean),
            save:key(document.getElementById('saveSettingsBtn')!),cancel:key(document.getElementById('cancelSettingsBtn')!),saveLabel:label(document.getElementById('saveSettingsBtn')!),cancelLabel:app.i18n?.tOr?.('cancel','取消') || '取消'};
    }
    async function sync() {
        if(!enabled)return;
        if(owner!==app.currentUser){owner=app.currentUser;epoch++;refs.clear();more=null;}
        dirty=true;if(sending)return;sending=true;
        try {
            while(dirty && enabled) {
                dirty=false;for(const [id,element] of refs)if(!element.isConnected)refs.delete(id);const setting=settings();
                const blocked=[...document.querySelectorAll(modalSurfaceSelector)].some(el=>!el.closest('#settingsModalOverlay') && isVisibleModalSurface(el));
                const model={toast,epoch,night:!!app.nightMode,palette:nativePalette(),home:document.body.classList.contains('file-management-mode') && !blocked?home:null,settings:blocked?null:setting,more};
                await invoke('android_workspace',{model:JSON.stringify(model)});
                app.nativeWorkspaceAvailable=true;
                if(model.home && !app.nativeWorkspaceReady){app.nativeWorkspaceReady=true;document.body.classList.add('native-workspace-ready');app.refreshNotesHome?.();}
                const paused=blocked;
                if(app.nativeWorkspacePaused!==paused){app.nativeWorkspacePaused=paused;app.refreshNotesHome?.();}
                document.body.classList.toggle('native-workspace-ready',!!app.nativeWorkspaceReady && !paused);
                document.body.classList.toggle('native-settings-ready',!!model.settings);
            }
        } catch(error) {
            enabled=false;(window as any).enableLegacyAndroidBackRoute?.();app.nativeWorkspaceAvailable=false;app.nativeWorkspaceReady=false;document.body.classList.remove('native-workspace-ready','native-settings-ready');app.refreshNotesHome?.();
            console.warn('Native workspace unavailable; using web UI',error);
        } finally {sending=false;}
    }
    app.nativeWorkspace={renderHome(model:any){home=model;void sync();return !!app.nativeWorkspaceReady && !app.nativeWorkspacePaused;}};
    const observer=new MutationObserver(records=>{if(records.some(record=>record.target===document.body || record.target===document.documentElement || (record.target instanceof Element && record.target.closest('.modal-overlay,[aria-modal="true"],#customDialogContainer'))))void sync();});observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class','hidden','style','disabled']});
    // More is native from the initial click; no overlapping web popup.
    document.addEventListener('click',event=>{
        if(!enabled || !(event.target as Element).closest('#mobileMenuBtn'))return;
        event.preventDefault();event.stopImmediatePropagation();
        more={title:app.i18n?.tOr?.('more','更多') || '更多',items:[...document.querySelectorAll<HTMLButtonElement>('#mobileDropdown .dropdown-item')]
            .filter(el=>!el.hidden && getComputedStyle(el).display!=='none').map(el=>({key:key(el),label:label(el),id:el.id,disabled:el.disabled}))};void sync();
    },true);
    window.addEventListener('epmd-native-ui',((event:CustomEvent)=>{
        const detail=event.detail;if(!enabled || detail.epoch!==epoch || owner!==app.currentUser)return;
        if(detail.kind==='close-more'){more=null;void sync();return;}
        if(detail.kind==='viewport'){app.extendNativePreviews?.(Number(detail.limit));return;}
        if(detail.kind==='filter'){app.setNativeFileFilter?.(detail.folder,detail.query || '');return;}
        if(detail.kind==='file') {
            const file=app.files?.find((file:any)=>String(file.id)===detail.id);if(!file)return;
            if(detail.longPress)app.openFileSelectionPanel?.(file.id);
            else if(app.fileListMultiSelectMode)app.toggleFileListMultiSelectItem?.(file.id);
            else if(file.type==='folder')app.setNativeFileFilter?.(file.name,'');else app.openFile?.(file.id);
            return;
        }
        if(detail.kind==='home-action') {
            if(detail.action==='conflict')app.openSyncConflict?.(detail.id);
            else if(detail.action==='cancel')app.exitFileListMultiSelectMode?.();
            else if(detail.action==='all')app.selectAllFilesForMulti?.();
            else if(detail.action==='settings')app.showSettingsDialog?.();
            else if(detail.action==='account')app.showAccountManagementDialog?.();
            else if(detail.action==='create') {
                const en=app.i18n?.getLanguage?.()==='en';
                more={title:en?'Create or open':'新建或打开',items:[['create-file',en?'New file':'新建文件'],['create-folder',en?'New folder':'新建文件夹'],['import-file',en?'Import files':'导入文件'],['open-local',en?'Open local file':'打开本地文件']].map(([key,label])=>({key,label,id:key}))};void sync();
            }
            else document.querySelector<HTMLButtonElement>('#fileListMultiSelectToolbar [data-action="'+detail.action+'"]')?.click();
            app.refreshNotesHome?.();return;
        }
        if(detail.kind==='click' && ['create-file','create-folder','import-file','open-local'].includes(detail.key)) {
            more=null;void sync();
            if(detail.key==='create-file')app.createNewFile?.();
            if(detail.key==='create-folder')app.createNewFolder?.();
            if(detail.key==='import-file')app.importFiles?.();
            if(detail.key==='open-local')app.__filesCoreHandlers?.openExternalLocalFileByDialog?.();
            return;
        }
        const element=refs.get(detail.key);if(!element?.isConnected || (element as HTMLButtonElement).disabled)return;
        if(detail.kind==='change' || detail.kind==='input') {
            if(element instanceof HTMLInputElement && ['checkbox','radio'].includes(element.type))element.checked=!!detail.checked;
            else (element as HTMLInputElement).value=String(detail.value ?? '');
            element.dispatchEvent(new Event('input',{bubbles:true}));
            element.dispatchEvent(new Event('change',{bubbles:true}));
            if(detail.kind==='change')void sync();
        } else if(detail.kind==='click'){more=null;element.click();void sync();}
    }) as EventListener);
    window.addEventListener('languagechange',()=>{void sync();});window.addEventListener('e2e-account-reset',()=>{epoch++;owner=app.currentUser;refs.clear();home=null;more=null;void sync();});
    const originalMessage=app.showMessage;
    app.showMessage=function(message:string,...args:any[]){
        if(enabled && app.nativeWorkspaceAvailable && (document.body.classList.contains('file-management-mode') || settings() || more)) {toast={id:++toastId,message};void sync();return;}
        return originalMessage?.call(app,message,...args);
    };
    void sync();return {sync,dispose(){enabled=false;observer.disconnect();app.nativeWorkspaceReady=false;document.body.classList.remove('native-workspace-ready','native-settings-ready');}};
}
