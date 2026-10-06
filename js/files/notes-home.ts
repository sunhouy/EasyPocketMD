import { syncStatus, syncStatusPresentation } from './sync/local-state';
import { bindFileTreeLongPress } from './tree/details';

type Note = {id:string;name:string;type:string;content?:string;lastModified?:number|string;last_modified?:number|string};
const parent = (name:string) => name.includes('/') ? name.slice(0,name.lastIndexOf('/')) : '';
const basename = (name:string) => name.split('/').pop() || name;
export function noteTimestamp(file:Note):number {
    const value=file.lastModified ?? file.last_modified;
    if (!value) return 0;
    const result=typeof value==='number' ? value : new Date(value).getTime();
    return Number.isFinite(result) ? result : 0;
}
export function notePreview(content:string):string {
    if (/^EPMD\d*:/.test(content)) return '';
    return content.slice(0,16000).replace(/```[\s\S]*?```/g,' ').replace(/!\[[^\]]*\]\([^)]*\)/g,' ')
        .replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/<[^>]*>/g,' ').replace(/^[#>\s*-]+/gm,'')
        .replace(/[*_`~]/g,'').replace(/\s+/g,' ').trim().slice(0,240);
}
export function visibleNotes(files:Note[], folder:string|null, query:string):Note[] {
    const q=query.trim().toLocaleLowerCase();
    return files.filter(file=>file.type==='file' && (folder===null || parent(file.name)===folder)
        && (!q || (file.name+' '+(/^EPMD\d*:/.test(file.content || '')?'':file.content || '')).toLocaleLowerCase().includes(q)))
        .sort((a,b)=>noteTimestamp(b)-noteTimestamp(a) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

/** A home view over the same files and tree actions; it owns no copies of drafts. */
export function installNotesHome(app:any, options:{loadContent?:(file:any)=>Promise<string>;needsContent?:(file:any)=>boolean} = {}) {
    const sidebar=document.getElementById('fileListSidebar');
    if (!sidebar) return {render:()=>{}};
    const home=document.createElement('section');home.className='notes-home';home.id='notesHome';
    const header=document.createElement('header');header.className='notes-home-header';
    const heading=document.createElement('h1');
    const tools=document.createElement('div');tools.className='notes-home-tools';
    const button=(className:string, action:()=>void)=>{const element=document.createElement('button');element.type='button';element.className=className;element.onclick=action;return element;};
    const account=button('',()=>{});
    account.onclick=event=>app.handleLoginButtonClick ? app.handleLoginButtonClick(event) : app.showLoginModal?.();
    const settings=button('',()=>app.showSettingsDialog?.());
    account.innerHTML='<i class="fas fa-user-circle" aria-hidden="true"></i>';
    settings.innerHTML='<i class="fas fa-cog" aria-hidden="true"></i>';
    tools.append(account,settings);header.append(heading,tools);
    const search=document.createElement('input');search.type='search';search.className='notes-home-search';search.id='notesHomeSearch';search.name='workspace-file-search';search.autocomplete='off';search.setAttribute('data-lpignore','true');search.setAttribute('data-1p-ignore','true');search.setAttribute('autocapitalize','none');
    const searchForm=document.createElement('form');searchForm.className='notes-home-search-form';searchForm.setAttribute('role','search');searchForm.autocomplete='off';searchForm.onsubmit=event=>event.preventDefault();searchForm.append(search);
    const tabs=document.createElement('nav');tabs.className='notes-home-tabs';
    const grid=document.createElement('div');grid.className='notes-home-grid';
    const empty=document.createElement('p');empty.className='notes-home-empty';
    home.append(header,searchForm,tabs,grid,empty);sidebar.prepend(home);
    let view:'all'|'folder'='all', folder='', timer:ReturnType<typeof setTimeout>;
    const en=()=>app.i18n?.getLanguage?.()==='en';
    const t=(zh:string,english:string)=>en()?english:zh;
    const snapshots=new Map<string,{preview:string;query:string;matched:boolean}>();
    const attempted=new Set<string>();
    let running=0, cachedUser='', previewLimit=40;
    const encrypted=(file:any)=>[true,1,'1','true'].includes(file.e2e_enabled ?? file.e2eEnabled);
    const locked=(file:any)=>encrypted(file) && app.E2EVault?.state()?.config && !app.E2EVault?.state()?.unlocked;
    const key=(file:any)=>JSON.stringify([app.currentUser?.username || '',file.id,file.name,file.lastModified,file.contentVersion]);
    const needs=(file:any)=>!!options.loadContent && !!options.needsContent?.(file) && !locked(file);
    const searchable=(file:any,q:string)=>!q || file.name.toLocaleLowerCase().includes(q) || (!locked(file) && (
        !needs(file) ? !/^EPMD\d*:/.test(file.content || '') && (file.content || '').toLocaleLowerCase().includes(q)
        : snapshots.get(key(file))?.query===q && snapshots.get(key(file))?.matched));
    // Cache only snippets and the current query's match, never cloud drafts.
    function loadSnippets(candidates:Note[], query:string) {
        if (!options.loadContent || navigator.onLine===false) return;
        for (const file of candidates) {
            if (running>=2) break;
            const stamp=key(file), request=stamp+'|'+query;
            if (!needs(file) || attempted.has(request) || (!query && snapshots.has(stamp))) continue;
            attempted.add(request);running++;
            const username=app.currentUser?.username;
            void options.loadContent({...file}).then(content=>{
                if(app.currentUser?.username!==username || key(file)!==stamp || locked(file)) return;
                snapshots.set(stamp,{preview:notePreview(content),query,matched:!/^EPMD\d*:/.test(content) && content.toLocaleLowerCase().includes(query)});
            }).catch(()=>{if(app.currentUser?.username===username && key(file)===stamp) snapshots.set(stamp,{preview:t('摘要暂不可用，点击打开文件','Preview unavailable. Open the file.'),query,matched:false});}).finally(()=>{running--;render();});
        }
    }
    const menu=(id:string,x:number,y:number,anchor?:DOMRect)=>{
        const tree=app.$?.('#fileList').jstree(true);if(!tree || typeof tree.get_node!=='function')return;const node=tree.get_node(id);
        if (!node) return;
        const position=()=>{
            const element=document.querySelector<HTMLElement>('.vakata-context');if(!element)return;
            element.style.maxHeight=Math.max(80,window.innerHeight-16)+'px';element.style.overflowY='auto';
            const rect=element.getBoundingClientRect();
            const left=anchor?anchor.right-rect.width:x;
            const top=anchor && y+rect.height>window.innerHeight-8?anchor.top-rect.height:y;
            element.style.left=Math.max(8,Math.min(left,window.innerWidth-rect.width-8))+'px';
            element.style.top=Math.max(8,Math.min(top,window.innerHeight-rect.height-8))+'px';
        };
        // jsTree expects page coordinates, while our menu CSS uses fixed positioning.
        // Measure the rendered menu rather than guessing a width/height before opening.
        app.$?.(document)?.one?.('context_show.vakata.notesHome',position);
        tree.show_contextmenu(node,x+window.scrollX,y+window.scrollY);
        requestAnimationFrame(position);
    };
    const showFolder=(path:string)=>{view='folder';folder=path;app.notesHomeFolder=path;render();};
    function render() {
        if (!document.body.classList.contains('file-management-mode')) return;
        const username=app.currentUser?.username || '';
        if(cachedUser!==username){cachedUser=username;snapshots.clear();attempted.clear();}
        const files:Note[]=app.files || [];
        const folders=files.filter(file=>file.type==='folder').sort((a,b)=>a.name.localeCompare(b.name));
        if (view==='folder' && !folders.some(file=>file.name===folder)) {view='all';folder='';}
        app.notesHomeFolder=view==='folder'?folder:'';
        heading.textContent='EasyPocketMD';
        account.setAttribute('aria-label',t('账号管理','Account management'));settings.setAttribute('aria-label',t('设置','Settings'));
        account.title=t('账号管理','Account management');settings.title=t('设置','Settings');
        search.placeholder=t('搜索文件','Search files');search.setAttribute('aria-label',search.placeholder);
        const tabsScrollLeft=tabs.scrollLeft;
        tabs.setAttribute('aria-label',t('文件夹筛选','Filter by folder'));tabs.replaceChildren();
        const tab=(text:string,active:boolean,action:()=>void,id?:string)=>{
            const element=button('notes-folder-tab'+(active?' active':''),action);element.textContent=text;element.title=text;
            element.setAttribute('aria-pressed',String(active));if(id)element.dataset.fileId=id;tabs.append(element);
        };
        tab(t('全部','All'),view==='all',()=>{view='all';render();});
        for (const item of folders) tab(item.name,view==='folder' && item.name===folder,()=>showFolder(item.name),item.id);
        tabs.scrollLeft=tabsScrollLeft;
        const scrollTop=grid.scrollTop;
        grid.replaceChildren();
        const query=search.value.trim().toLocaleLowerCase();
        const visibleFolders=view==='all'?[]:folders.filter(item=>parent(item.name)===folder && (!query || item.name.toLocaleLowerCase().includes(query)));
        for (const item of visibleFolders) {
            const card=button('notes-folder-card',()=>showFolder(item.name));card.dataset.fileId=item.id;card.textContent='📁 '+basename(item.name);card.title=item.name;grid.append(card);
        }
        const candidates=visibleNotes(files,view==='folder'?folder:null,'');
        const notes=candidates.filter(file=>searchable(file,query));
        for (const file of notes) {
            const card=document.createElement('article');card.className='notes-file-card';card.dataset.fileId=file.id;card.tabIndex=0;card.setAttribute('role','button');card.setAttribute('aria-label',file.name);card.title=file.name;
            const open=()=>{void app.openFile?.(file.id);};card.onclick=open;
            card.onkeydown=event=>{if(event.target===card && (event.key==='Enter'||event.key===' ')){event.preventDefault();open();}};
            const titleRow=document.createElement('div');titleRow.className='notes-card-title';
            const title=document.createElement('h2');title.textContent=basename(file.name);
            const status=syncStatus(file,navigator.onLine!==false,!!(app.unsavedChanges?.[file.id] || app.pendingServerSync?.[file.id] || (file as any).isSynced===false));
            const [symbol,label]=syncStatusPresentation[status];
            const sync=button('file-sync-icon '+status,()=>{});sync.dataset.state=status;sync.title=label;sync.setAttribute('aria-label',label);
            sync.innerHTML='<i class="fas '+symbol+'" aria-hidden="true"></i>';
            sync.onclick=event=>{event.stopPropagation();if((file as any).syncConflict)app.openSyncConflict?.(file.id);};
            titleRow.append(title,sync);
            if(encrypted(file)) {
                const lock=document.createElement('span');lock.className='file-e2e-indicator';lock.title=t('此文件已使用端到端加密','This file is end-to-end encrypted');lock.setAttribute('aria-label',lock.title);
                lock.innerHTML='<i class="fas fa-lock" aria-hidden="true"></i>';titleRow.append(lock);
            }
            const preview=document.createElement('p');preview.className='notes-file-preview';
            const content=file.content || '';
            preview.textContent=locked(file)||/^EPMD\d*:/.test(content)?t('加密文件','Encrypted file'):needs(file)?snapshots.has(key(file))?(snapshots.get(key(file))!.preview || t('暂无内容','No content')):t('摘要加载中…','Loading preview…'):notePreview(content)||t('暂无内容','No content');
            const date=document.createElement('time');const stamp=noteTimestamp(file);
            if(stamp){date.dateTime=new Date(stamp).toISOString();date.textContent=new Intl.DateTimeFormat(en()?'en':'zh-CN',{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(stamp);}else date.textContent=t('修改时间未记录','Modification time unavailable');
            const more=button('notes-card-menu',()=>{});more.textContent='⋮';more.setAttribute('aria-label',t('更多操作：','More actions: ')+file.name);
            more.onclick=event=>{event.stopPropagation();const rect=more.getBoundingClientRect();menu(file.id,rect.right,rect.bottom,rect);};
            titleRow.append(more);card.append(titleRow,preview,date);grid.append(card);
        }
        grid.scrollTop=scrollTop;
        loadSnippets(query?candidates:candidates.slice(0,previewLimit),query);
        empty.hidden=!!grid.childElementCount;
        empty.textContent=query?running?t('正在搜索云端文件…','Searching cloud files…'):t('没有找到匹配的文件或文件夹','No matching files or folders'):t('暂无文件，点击右下角加号创建','No files. Use + to create one.');
    }
    search.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(render,120);});
    home.addEventListener('contextmenu',event=>{const target=(event.target as Element).closest<HTMLElement>('[data-file-id]');if(!target)return;event.preventDefault();menu(target.dataset.fileId!,event.clientX,event.clientY);});
    bindFileTreeLongPress(home,(target,x,y)=>menu(target.dataset.fileId!,x,y),'[data-file-id]');
    grid.addEventListener('scroll',()=>{if(grid.scrollHeight-grid.scrollTop-grid.clientHeight<500 && previewLimit<(app.files || []).length){previewLimit+=40;render();}});
    const clearSnapshots=()=>{snapshots.clear();attempted.clear();render();};
    window.addEventListener('e2e-locked',clearSnapshots);window.addEventListener('e2e-unlocked',clearSnapshots);
    app.refreshNotesHome=render;
    document.addEventListener('notes-home-refresh',render);
    return {render};
}
