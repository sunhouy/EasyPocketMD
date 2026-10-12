import {modalSurfaceSelector,isVisibleModalSurface} from './modal-surfaces';
import {isAndroidApp} from './android-ui';
import {pickAndroidImportFiles} from '../files/android-import';
import {nativePalette} from './native-palette';

/** Native views render snapshots; existing handlers remain the only mutation path. */
export function installAndroidWorkspace(app:any=window) {
    if(!isAndroidApp())return;
    const invoke=app.__TAURI__?.core?.invoke || app.__TAURI__?.invoke;if(!invoke)return;
    let toast:any=null,toastId=0,panelsSupported:boolean|undefined;
    let enabled=true,owner=app.currentUser,epoch=1,home:any=null,more:any=null,sending=false,dirty=false;
    const refs=new Map<string,HTMLElement>(),keys=new WeakMap<HTMLElement,string>();let next=0;
    const key=(element:HTMLElement)=>{let id=keys.get(element);if(!id){id='native-'+(++next);keys.set(element,id);}refs.set(id,element);return id;};
    const label=(el:HTMLElement)=>el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent?.trim() || '';
    const previewImages=new WeakMap<HTMLCanvasElement,string>();
    function node(el:HTMLElement):any {
        if(el instanceof HTMLCanvasElement && el.width && el.height) {
            let source=previewImages.get(el);
            if(!source)try {const bitmap=document.createElement('canvas');bitmap.width=Math.min(1024,el.width);bitmap.height=Math.round(el.height*bitmap.width/el.width);bitmap.getContext('2d')?.drawImage(el,0,0,bitmap.width,bitmap.height);source=bitmap.toDataURL('image/png');previewImages.set(el,source);}catch{return {type:'text',label:app.i18n?.getLanguage?.()==='en'?'Preview unavailable':'预览暂不可用'};}
            return {type:'image',key:key(el),source,label:el.getAttribute('aria-label') || 'PDF preview'};
        }

        if(el.hidden || el.style.display==='none' || el.matches('script,style,[type=hidden],i,svg,option'))return null;
        if(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
            if(el.type==='radio')return {type:'radio',key:key(el),label:label(el.closest('label') || el),value:el.value,checked:(el as HTMLInputElement).checked,disabled:el.disabled};
            const title=el.closest('label')?.textContent?.trim() || el.closest('.form-group')?.querySelector('label')?.textContent?.trim() || el.parentElement?.querySelector(':scope > label')?.textContent?.trim() || el.parentElement?.parentElement?.querySelector(':scope > label')?.textContent?.trim() || (el.id && document.querySelector<HTMLLabelElement>('label[for="'+el.id.replace(/[^a-zA-Z0-9_-]/g,'')+'"]')?.textContent?.trim()) || (el as HTMLInputElement).placeholder || (el.type==='file'?(app.i18n?.getLanguage?.()==='en'?'Choose files':'选择文件'):label(el));
            return {type:el instanceof HTMLSelectElement?'select':el.type==='checkbox'?'checkbox':el.type==='file'?'button':'input',key:key(el),id:el.id,label:title,
                value:el.value,checked:(el as HTMLInputElement).checked,inputType:el.classList.contains('epmd-secret-field')?'password':el.type,min:(el as HTMLInputElement).min,max:(el as HTMLInputElement).max,step:(el as HTMLInputElement).step,disabled:el.disabled,
                readonly:(el as HTMLInputElement).readOnly,maxLength:(el as HTMLInputElement).maxLength,options:el instanceof HTMLSelectElement?[...el.options].map(o=>({label:o.text,value:o.value})):undefined};
        }
        if(getComputedStyle(el).display==='none')return null;
        if(el instanceof HTMLButtonElement || el instanceof HTMLAnchorElement)return {type:'button',key:key(el),id:el.id,label:label(el),primary:el.matches('.primary,.ai-generate-btn,[type=submit]'),active:el.classList.contains('active') || el.getAttribute('aria-pressed')==='true',disabled:el instanceof HTMLButtonElement && el.disabled};
        if(el.matches('details,.settings-section')) {
            const heading=el.querySelector(':scope > summary,:scope > .settings-section-header');
            return {type:el.matches('.settings-section')?'section':'group',key:key(el),label:heading?.textContent?.trim() || '',expanded:el instanceof HTMLDetailsElement?el.open:true,children:[...el.children].filter(child=>child!==heading).map(child=>node(child as HTMLElement)).filter(Boolean)};
        }
        if(el.classList.contains('settings-control-label') || el.matches('.settings-row-chevron,.settings-row-icon'))return null;
        if(el.tagName==='LABEL' && el.querySelector('input'))return {type:'container',children:[...el.querySelectorAll('input')].map(child=>node(child)).filter(Boolean)};
        if(el.matches('.ai-result-content,.ai-query-answer,pre,p,td,th') && !el.querySelector('button,input,select,textarea,a'))return {type:'text',key:key(el),label:el.textContent || '',selectable:true};
        if(!el.children.length){const text=el.textContent?.trim();return text && !el.matches('label')?{type:'text',key:key(el),label:text,selectable:true,heading:el.matches('h3,h4'),size:el.id==='wordCountTotal'?32:undefined}:null;}
        const children=[...el.childNodes].map(child=>child instanceof HTMLElement?node(child):child.nodeType===Node.TEXT_NODE && child.textContent?.trim()?{type:'text',label:child.textContent.trim()}:null).filter(Boolean);
        if(children.length)return {type:'container',children};
        const text=el.textContent?.trim();return text && !el.matches('i,svg,option,label')?{type:'text',key:key(el),label:text,selectable:true}:null;
    }
    function settings() {
        const overlay=document.getElementById('settingsModalOverlay');
        if(!overlay?.classList.contains('show'))return null;
        return {title:app.i18n?.tOr?.('settings','设置') || '设置',children:[...overlay.querySelector('.modal-form')!.children].map(child=>node(child as HTMLElement)).filter(Boolean),
            save:key(document.getElementById('saveSettingsBtn')!),cancel:key(document.getElementById('cancelSettingsBtn')!),saveLabel:label(document.getElementById('saveSettingsBtn')!),cancelLabel:app.i18n?.tOr?.('cancel','取消') || '取消'};
    }
    const panelSelector='#aboutModalOverlay,#wordCountModalOverlay,#aiModalOverlay,[data-native-panel]';
    const nativeOverlays=new Set<HTMLElement>();
    const transientSelector='#selectionToolbar,.vakata-context,.desktop-dropdown-content,.mobile-dropdown-content,.user-menu-dropdown,#fileManagementFabRing';
    function activeSurface(el:HTMLElement) {
        return el.isConnected && !el.hidden && el.style.display!=='none' && getComputedStyle(el).display!=='none' &&
            (el.classList.contains('show') || !!el.style.display && el.style.display!=='none');
    }
    function panels() {
        return [...document.querySelectorAll<HTMLElement>(panelSelector)].filter(activeSurface).map(overlay=>{
            const root=overlay.querySelector<HTMLElement>(':scope > .modal') || overlay.firstElementChild as HTMLElement || overlay;
            const heading=root.querySelector<HTMLElement>('h1,h2,.modal-header');
            const close=root.querySelector<HTMLElement>('.modal-close-btn,.epmd-dialog-close,.share-close-btn,[id*=close i],[id*=cancel i]');
            return {key:key(overlay),dismissible:overlay.getAttribute('data-esc-closable')!=='false' && !!(close || overlay.id || (overlay as any).epmdCloseByBackPress),title:heading?.textContent?.trim() || overlay.dataset.nativeTitle || 'EasyPocketMD',
                children:[...root.children].filter(child=>child!==close && child!==heading && !child.matches('.modal-header')).map(child=>node(child as HTMLElement)).filter(Boolean)};
        });
    }
    function closePanel(overlay:HTMLElement) {
        if(overlay.getAttribute('data-esc-closable')==='false')return;
        if(overlay.id==='aiModalOverlay' && app.closeAIPanel){app.closeAIPanel();return;}
        const registered=(overlay as any).epmdCloseByBackPress;if(registered){registered();return;}
        const close=overlay.querySelector<HTMLElement>('.modal-close-btn,.epmd-dialog-close,.share-close-btn,[id*=close i],[id*=cancel i]');
        if(close){close.click();return;}
        if(overlay.id)overlay.classList.remove('show');else overlay.remove();
    }
    function openMore() {
        more={title:app.i18n?.tOr?.('more','更多') || '更多',items:[...document.querySelectorAll<HTMLButtonElement>('#mobileDropdown .dropdown-item')]
            .filter(el=>!el.hidden && getComputedStyle(el).display!=='none').map(el=>({key:key(el),label:label(el),id:el.id,disabled:el.disabled,
                group:el.closest('.more-menu-tools')?.querySelector('h3')?.textContent?.trim() || ''}))};void sync();
    }
    function toolbar() {
        if(document.body.classList.contains('file-management-mode'))return null;
        const lock=document.querySelector<HTMLElement>('.mobile-e2e-indicator');
        return {lock:lock?.getAttribute('aria-hidden')==='false'?{key:key(lock),label:app.i18n?.getLanguage?.()==='en'?'This file is end-to-end encrypted':'此文件已使用端到端加密'}:null,height:Math.round(document.querySelector('.mobile-toolbar-container')?.getBoundingClientRect().height || 54),title:document.querySelector('.mobile-title')?.textContent?.trim() || 'EasyPocketMD',buttons:
            ['mobileFileBtn','mobileSettingsBtn','modeToggle','mobileUndoBtn','mobileRedoBtn','mobileMenuBtn'].map(id=>document.getElementById(id))
            .filter((el):el is HTMLElement=>!!el).map(el=>({key:key(el),id:el.id,label:label(el),disabled:(el as HTMLButtonElement).disabled}))};
    }
    async function sync() {
        if(!enabled)return;
        if(owner!==app.currentUser){owner=app.currentUser;epoch++;refs.clear();more=null;}
        dirty=true;if(sending)return;sending=true;
        try {
            while(dirty && enabled) {
                dirty=false;for(const [id,element] of refs)if(!element.isConnected)refs.delete(id);const setting=settings();
                const nativePanels=panels(),owned=new Set(nativePanels.map(panel=>panel.key));
                const blocked=[...document.querySelectorAll<HTMLElement>(modalSurfaceSelector)].some(el=>!el.closest('#settingsModalOverlay') && !el.matches(transientSelector) && (panelsSupported===false || !owned.has(key((el.closest(panelSelector) as HTMLElement) || el))) && isVisibleModalSurface(el));
                const model={toast,epoch,night:!!app.nightMode,palette:nativePalette(),home:document.body.classList.contains('file-management-mode') && !blocked?home:null,settings:blocked?null:setting,more,panels:blocked?[]:nativePanels,toolbar:blocked?null:toolbar()};
                const response=await invoke('android_workspace',{model:JSON.stringify(model)});
                const supported=Array.isArray(response?.panelKeys);if(panelsSupported!==supported){panelsSupported=supported;if(nativePanels.length)dirty=true;}
                if(response?.toolbarReady)app.nativeToolbarAvailable=true;
                if(model.settings && response?.ready)app.nativeSettingsAvailable=true;
                // Native chrome owns the base page until command failure, even during child dialogs.
                document.body.classList.toggle('native-toolbar-ready',!!app.nativeToolbarAvailable && !document.body.classList.contains('file-management-mode'));
                const acknowledged=new Set<string>(response?.panelKeys || []);
                for(const overlay of nativeOverlays)if(!activeSurface(overlay) || panelsSupported===false){overlay.removeAttribute('data-native-owned');nativeOverlays.delete(overlay);}
                for(const panel of model.panels)if(acknowledged.has(panel.key)){const overlay=refs.get(panel.key)!;overlay.setAttribute('data-native-owned','true');nativeOverlays.add(overlay);}
                app.nativeWorkspaceAvailable=true;
                if(model.home && !app.nativeWorkspaceReady){app.nativeWorkspaceReady=true;document.body.classList.add('native-workspace-ready');app.refreshNotesHome?.();}
                const paused=blocked;
                if(app.nativeWorkspacePaused!==paused){app.nativeWorkspacePaused=paused;app.refreshNotesHome?.();}
                document.body.classList.toggle('native-workspace-ready',!!app.nativeWorkspaceReady);
                document.body.classList.toggle('native-settings-ready',!!app.nativeSettingsAvailable && !!setting);
            }
        } catch(error) {
            enabled=false;(window as any).enableLegacyAndroidBackRoute?.();app.nativeWorkspaceAvailable=false;app.nativeWorkspaceReady=false;app.nativeToolbarAvailable=false;app.nativeSettingsAvailable=false;for(const overlay of nativeOverlays)overlay.removeAttribute('data-native-owned');nativeOverlays.clear();document.body.classList.remove('native-workspace-ready','native-settings-ready','native-toolbar-ready');app.refreshNotesHome?.();
            console.warn('Native workspace unavailable; using web UI',error);
        } finally {sending=false;}
    }
    app.nativeWorkspace={renderHome(model:any){home=model;void sync();return !!app.nativeWorkspaceReady && !app.nativeWorkspacePaused;}};
    let syncScheduled=false;const scheduleSync=()=>{if(syncScheduled)return;syncScheduled=true;setTimeout(()=>{syncScheduled=false;void sync();},16);};
    const observer=new MutationObserver(records=>{if(records.some(record=>record.target===document.body || record.target===document.documentElement || ((record.target instanceof Element?record.target:record.target.parentElement)?.closest('.modal-overlay,[aria-modal="true"],#customDialogContainer,.mobile-toolbar-container,#selectionToolbar'))))scheduleSync();});observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class','hidden','style','disabled']});
    // More is native from the initial click; no overlapping web popup.
    document.addEventListener('click',event=>{
        if(!enabled || !(event.target as Element).closest('#mobileMenuBtn'))return;
        event.preventDefault();event.stopImmediatePropagation();
        openMore();
    },true);
    const picking=new Set<HTMLElement>();
    async function pickInput(element:HTMLInputElement) {
        if(picking.has(element))return;picking.add(element);
        try {
            const selected=await pickAndroidImportFiles(app,{accept:element.accept,multiple:element.multiple});
            if(!element.isConnected)return;if(selected===null){element.click();return;}if(!selected.length)return;
            const data=new DataTransfer();selected.forEach(file=>data.items.add(file));element.files=data.files;element.dispatchEvent(new Event('change',{bubbles:true}));
        } catch(error){app.showMessage?.(String(error),'error');}finally{picking.delete(element);void sync();}
    }
    window.addEventListener('epmd-native-ui',((event:CustomEvent)=>{
        const detail=event.detail;if(!enabled || detail.epoch!==epoch || owner!==app.currentUser)return;
        if(detail.kind==='close-panel'){const overlay=refs.get(detail.key);if(overlay?.isConnected)closePanel(overlay);void sync();return;}
        if(detail.kind==='toolbar'){const element=refs.get(detail.key);if(!element?.isConnected || (element as HTMLButtonElement).disabled)return;if(element.id==='mobileMenuBtn')openMore();else element.click();void sync();return;}
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
            if((element as HTMLInputElement).readOnly)return;
            if(element instanceof HTMLInputElement && ['checkbox','radio'].includes(element.type))element.checked=!!detail.checked;
            else (element as HTMLInputElement).value=String(detail.value ?? '');
            element.dispatchEvent(new Event('input',{bubbles:true}));
            element.dispatchEvent(new Event('change',{bubbles:true}));
            if(detail.kind==='change')void sync();
        } else if(detail.kind==='click'){more=null;if(element instanceof HTMLInputElement && element.type==='file')void pickInput(element);else element.click();void sync();}
    }) as EventListener);
    window.addEventListener('languagechange',()=>{void sync();});window.addEventListener('e2e-account-reset',()=>{epoch++;owner=app.currentUser;refs.clear();home=null;more=null;void sync();});
    const originalMessage=app.showMessage;
    app.showMessage=function(message:string,...args:any[]){
        if(enabled && app.nativeWorkspaceAvailable && (document.body.classList.contains('file-management-mode') || settings() || more || nativeOverlays.size)) {toast={id:++toastId,message};void sync();return;}
        return originalMessage?.call(app,message,...args);
    };
    void sync();return {sync,dispose(){enabled=false;observer.disconnect();app.nativeWorkspaceReady=false;app.nativeToolbarAvailable=false;app.nativeSettingsAvailable=false;for(const overlay of nativeOverlays)overlay.removeAttribute('data-native-owned');nativeOverlays.clear();document.body.classList.remove('native-workspace-ready','native-settings-ready','native-toolbar-ready');}};
}
