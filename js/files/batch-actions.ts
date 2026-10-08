import { relocateFile } from './relocate';
import { showFileDetails } from './tree/details';
export interface RenameRule {template:string;start:number;find?:string;replace?:string;prefix?:string;suffix?:string;deduplicate?:boolean;}
export function selectionRoots(files:any[], ids:Iterable<string>):any[] {
    const selected=new Set([...ids].map(String));const items=files.filter(file=>selected.has(String(file.id)));
    return items.filter(item=>!items.some(parent=>parent!==item && parent.type==='folder' && item.name.startsWith(parent.name+'/')));
}
const parent=(name:string)=>name.includes('/')?name.slice(0,name.lastIndexOf('/')):'';
const base=(name:string)=>name.split('/').pop()!;
export function buildRenamePlan(files:any[],items:any[],rule:RenameRule):Array<{file:any;path:string}> {
    if(!rule.template || !Number.isSafeInteger(rule.start) || rule.start<0) throw Error('请输入有效的命名规则和起始序号');
    const affected=files.filter(file=>items.some(item=>item===file || (item.type==='folder' && file.name.startsWith(item.name+'/'))));
    const used=new Set(files.filter(file=>!affected.includes(file)).map(file=>file.name));
    return items.map((file,index)=>{
        const original=base(file.name), dot=file.type==='file'?original.lastIndexOf('.'):-1;
        const extension=dot>0?original.slice(dot):'',stem=dot>0?original.slice(0,dot):original;
        const name=rule.find ? stem.split(rule.find).join(rule.replace || '') : stem;
        const result=(rule.prefix || '')+rule.template.replace(/\{name\}/g,()=>name).replace(/\{n\}/g,String(rule.start+index))+(rule.suffix || '');
        if(!result.trim() || /[\\/\u0000-\u001f]/.test(result) || result==='.' || result==='..') throw Error('生成的名称为空或包含非法字符');
        const folder=parent(file.name), join=(value:string)=>folder?folder+'/'+value:value;
        let path=join(result+extension),count=2;
        const collision=(candidate:string)=>used.has(candidate) || [...used].some(value=>value.startsWith(candidate+'/'));
        while(collision(path) && rule.deduplicate) path=join(result+' ('+count+++')'+extension);
        if(collision(path)) throw Error('名称冲突：'+path);
        used.add(path);
        return {file,path};
    });
}
/** Stage renames to support swaps without overwriting another selected document. */
export async function applyRenamePlan(app:any,plan:Array<{file:any;path:string}>) {
    const changes=plan.filter(entry=>entry.file.name!==entry.path).map(entry=>({...entry,original:entry.file.name}));
    const user=app.currentUser, files=app.files;
    if(plan.some(entry=>!files.includes(entry.file))) throw Error('文件列表已切换，请重新选择');
    const active=()=>{if(app.currentUser!==user || app.files!==files) throw Error('账号或文件列表已切换，操作已停止');};
    const staged:typeof changes=[];
    try {
        for(const entry of changes) {
            active();const temporary=(parent(entry.original)?parent(entry.original)+'/':'')+'__epmd_rename_'+crypto.randomUUID();
            await relocateFile(app,entry.file.id,temporary);staged.push(entry);
        }
        for(const entry of changes) {active();await relocateFile(app,entry.file.id,entry.path);}
    } catch(error) {
        if(app.currentUser===user && app.files===files) {
            const failures=[];
            // Free every original path before restoring; partially applied swaps may occupy it.
            for(const entry of staged) try {await relocateFile(app,entry.file.id,'__epmd_restore_'+crypto.randomUUID());} catch {failures.push(entry.file.name);}
            for(const entry of staged) try {await relocateFile(app,entry.file.id,entry.original);} catch {failures.push(entry.file.name);}
            if(failures.length) throw Error('重命名未完成，以下项目未能恢复原名：'+failures.join('、'));
        }
        throw error;
    }
}
export function showBottomSheet(title:string,actions:Array<{label:string;icon:string;run:()=>unknown;disabled?:boolean}>) {
    document.getElementById('fileActionSheet')?.remove();
    const overlay=document.createElement('div');overlay.id='fileActionSheet';overlay.className='modal-overlay file-action-sheet-overlay';
    const panel=document.createElement('section');panel.className='file-action-sheet';panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');
    const heading=document.createElement('h3');heading.textContent=title;panel.append(heading);
    const close=document.createElement('button');close.type='button';close.className='epmd-dialog-close';close.textContent='×';close.setAttribute('aria-label','关闭 / Close');close.onclick=()=>overlay.remove();panel.append(close);
    const grid=document.createElement('div');grid.className='file-action-grid';
    for(const action of actions){const button=document.createElement('button');button.type='button';button.className='file-action-button';button.disabled=!!action.disabled;
        button.innerHTML='<i class="fas '+action.icon+'" aria-hidden="true"></i>';const label=document.createElement('span');label.textContent=action.label;button.append(label);
        button.onclick=()=>{overlay.remove();void action.run();};grid.append(button);}
    panel.append(grid);overlay.append(panel);document.body.append(overlay);
    overlay.onclick=event=>{if(event.target===overlay) overlay.remove();};return overlay;
}
export function installBatchFileActions(app:any,hooks:{reload:()=>void;orders:(orders:Record<string,number>)=>void;loadContent:(file:any)=>Promise<string>;exit:()=>void;delete:()=>unknown;upDown:(items:any[],direction:string)=>void;import:(path:string)=>unknown}) {
    const en=()=>app.i18n?.getLanguage?.()==='en';const t=(zh:string,english:string)=>en()?english:zh;
    const items=()=>selectionRoots(app.files || [],app.fileListMultiSelectedIds || []);
    const selected=()=> (app.files || []).filter(file=>app.fileListMultiSelectedIds?.has(String(file.id)));
    let busy=false;
    const report=(error:any)=>app.showMessage?.(error?.message || t('操作失败，请重试','Operation failed; retry'),'error');
    async function chooseFolder(action:(path:string)=>Promise<void>) {
        const execute=async(path:string)=>{if(busy)return;busy=true;update();try{await action(path);}catch(error){report(error);}finally{busy=false;update();}};
        const folders=(app.files || []).filter(file=>file.type==='folder').map(file=>file.name).sort();
        const overlay=showBottomSheet(t('选择目标文件夹','Choose destination'),[{label:t('根目录','Root'),icon:'fa-folder',run:()=>void execute('')},...folders.map(path=>({label:path,icon:'fa-folder',run:()=>void execute(path)}))]);
        overlay.querySelector('.file-action-grid')?.classList.add('file-folder-picker');
    }
    async function rename() {
        const roots=items();if(!roots.length) return;
        if(selected().length===1){app.renameFile?.(roots[0].id);return;}
        const overlay=showBottomSheet(t('重命名','Rename'),[]),panel=overlay.querySelector('.file-action-sheet')!;
        overlay.classList.add('file-action-dialog-overlay');
        const description=document.createElement('p');description.className='rename-description';description.textContent=t('已选择 '+selected().length+' 项，设置规则并检查新名称','Set a rule and review the new names for '+selected().length+' items');panel.append(description);
        const form=document.createElement('form');form.className='batch-rename-form';
        const fields=[['template',t('名称模板：{name} 原名，{n} 序号（保留扩展名）','Name template: {name}, {n}; extensions are kept'),'{name}'],['start',t('起始序号','Start number'),'1'],['find',t('查找文字','Find text'),''],['replace',t('替换为','Replace with'),''],['prefix',t('前缀','Prefix'),''],['suffix',t('后缀','Suffix'),'']];
        for(const [name,label,value] of fields){const row=document.createElement('label');row.textContent=label;row.dataset.field=name;const input=document.createElement('input');input.name=name;input.value=value;input.type=name==='start'?'number':'text';row.append(input);form.append(row);}
        const deduplicate=document.createElement('label');deduplicate.className='rename-checkbox-row';deduplicate.textContent=t('重名时自动加序号去重','Add a number when names collide');const check=document.createElement('input');check.type='checkbox';check.name='deduplicate';deduplicate.prepend(check);form.append(deduplicate);
        const preview=document.createElement('div');preview.className='batch-rename-preview';form.append(preview);
        const submit=document.createElement('button');submit.type='submit';submit.className='modal-btn primary';submit.textContent=t('确认重命名','Rename');form.append(submit);panel.append(form);
        let plan:Array<{file:any;path:string}>=[];
        const update=()=>{try {const values=new FormData(form);plan=buildRenamePlan(app.files,roots,{template:String(values.get('template')),start:Number(values.get('start')),find:String(values.get('find')),replace:String(values.get('replace')),prefix:String(values.get('prefix')),suffix:String(values.get('suffix')),deduplicate:check.checked});preview.replaceChildren();for(const entry of plan){const line=document.createElement('div');line.textContent=entry.file.name+' → '+entry.path;preview.append(line);}submit.disabled=false;}catch(error){preview.textContent=(error as Error).message;submit.disabled=true;}};
        form.oninput=update;update();form.onsubmit=async event=>{event.preventDefault();submit.disabled=true;try {await applyRenamePlan(app,plan);overlay.remove();hooks.reload();app.showMessage?.(t('重命名完成','Renamed'),'success');}catch(error){report(error);update();}};
    }
    async function moveOrCopy(copy:boolean) {
        const roots=items();if(!roots.length)return;
        const workspace=app.files,owner=app.currentUser;
        await chooseFolder(async folder=>{
            if(app.files!==workspace || app.currentUser!==owner) throw Error(t('账号或文件列表已切换','Account or workspace changed'));
            if(roots.some(file=>file.type==='folder' && (folder===file.name || folder.startsWith(file.name+'/')))) throw Error(t('不能将文件夹移动或复制到自身内部','Cannot place a folder inside itself'));
            const files=app.files,user=app.currentUser;
            const active=()=>{if(app.currentUser!==user || app.files!==files) throw Error(t('账号或文件列表已切换','Account or workspace changed'));};
            const reserved=new Set<string>();
            const paths=roots.map(file=>{
                const original=base(file.name),dot=file.type==='file'?original.lastIndexOf('.'):-1;
                const stem=dot>0?original.slice(0,dot):original,ext=dot>0?original.slice(dot):'';
                const join=(name:string)=>folder?folder+'/'+name:name;
                let path=join(original),n=1;
                const collision=()=>reserved.has(path) || files.some(other=>(copy || other!==file) && (other.name===path || other.name.startsWith(path+'/')));
                if(copy) while(collision()) path=join(stem+t(' (副本',' (Copy')+(n===1?'':String(n))+')'+ext),n++;
                else if(path!==file.name && collision()) throw Error(t('目标位置已存在同名项目：','Destination already exists: ')+path);
                reserved.add(path);return {file,path};
            });
            let pending=false;
            try {
                for(const entry of paths){active();
                    if(!copy) {await relocateFile(app,entry.file.id,entry.path);active();}
                    else {
                        const descendants=files.filter(file=>file===entry.file || (entry.file.type==='folder' && file.name.startsWith(entry.file.name+'/')));
                        for(const file of descendants){const content=file.type==='file'?await hooks.loadContent(file):'';active();
                            const clone={id:crypto.randomUUID(),name:entry.path+file.name.slice(entry.file.name.length),type:file.type,content,contentLoaded:true,createdAt:Date.now(),lastModified:Date.now(),isSynced:false,e2e_enabled:file.e2e_enabled,e2eEnabled:file.e2eEnabled};
                            files.push(clone);app.unsavedChanges[clone.id]=true;app.markPendingServerSync?.(clone.id,true);
                            localStorage.setItem('vditor_files',app.e2eSerializeFiles?app.e2eSerializeFiles(files):JSON.stringify(files));
                            if(user && !await app.syncFileToServer(clone.id)) pending=true;
                            active();
                        }
                    }
                }
            } finally {hooks.reload();}
            if(pending){app.showMessage?.(t('复制已保存到本机，部分文件待同步，请重试同步','Copies saved locally; some files await synchronization'),'warning');return;}
            hooks.reload();app.showMessage?.(t(copy?'复制完成':'移动完成',copy?'Copied':'Moved'),'success');
        });
    }
    function pin(){const roots=items();const allPinned=roots.every(file=>Number(app.fileOrders?.[file.name])<=-1000000);const orders:Record<string,number>={};roots.forEach((file,index)=>orders[file.name]=allPinned?0:-2000000+index*10);app.fileOrders={...app.fileOrders,...orders};hooks.orders(orders);hooks.reload();update();}
    function run(action:string){if(busy)return;if(action==='details')showFileDetails(app,selected());else if(action==='pin')pin();else if(action==='rename')void rename().catch(report);else if(action==='move'||action==='copy')void moveOrCopy(action==='copy').catch(report);else if(action==='up'||action==='down')hooks.upDown(items(),action);else if(action==='history'){const file=selected()[0];if(selected().length===1 && file.type==='file')app.showHistoryModal(file.id,file.name);}else if(action==='delete'){busy=true;update();void Promise.resolve().then(()=>hooks.delete()).catch(report).finally(()=>{busy=false;update();});}else if(action==='import' && selected().length===1 && selected()[0].type==='folder')void hooks.import(selected()[0].name);}
    function toolbar(){const toolbar=document.createElement('div');toolbar.id='fileListMultiSelectToolbar';toolbar.className='file-selection-panel';
        const header=document.createElement('div');header.className='file-selection-header';
        const count=document.createElement('strong');count.id='fileListMultiSelectCount';header.append(count);
        for(const [label,fn] of [[t('全选','Select all'),()=>app.selectAllFilesForMulti?.()],[t('取消','Cancel'),hooks.exit]] as const){const button=document.createElement('button');button.textContent=label;button.onclick=fn;button.className='file-selection-control';if(fn!==hooks.exit)button.dataset.selectAll='';header.append(button);}toolbar.append(header);
        const grid=document.createElement('div');grid.className='file-action-grid';
        for(const [action,label,icon] of [['details',t('详情','Details'),'fa-circle-info'],['pin',t('置顶','Pin'),'fa-thumbtack'],['rename',t('重命名','Rename'),'fa-pen'],['up',t('上移','Up'),'fa-arrow-up'],['down',t('下移','Down'),'fa-arrow-down'],['move',t('移动','Move'),'fa-folder-open'],['copy',t('复制','Copy'),'fa-copy'],['history',t('历史版本','History'),'fa-clock-rotate-left'],['delete',t('删除','Delete'),'fa-trash-can'],['import',t('导入文件','Import'),'fa-file-import']]){const button=document.createElement('button');button.className='file-action-button';button.dataset.action=action;button.innerHTML='<i class="fas '+icon+'" aria-hidden="true"></i>';const span=document.createElement('span');span.textContent=label;button.append(span);button.onclick=()=>run(action);grid.append(button);}toolbar.append(grid);document.body.append(toolbar);update();return toolbar;}
    function update(){const toolbar=document.getElementById('fileListMultiSelectToolbar');if(!toolbar)return;const files=selected();const count=toolbar.querySelector('#fileListMultiSelectCount');if(count)count.textContent=t('已选择 '+files.length+' 项',files.length+' selected');
        const ids=app.getFileListSelectableIds?.() || (app.files || []).map(file=>String(file.id));
        const all=ids.length>0 && ids.every(id=>app.fileListMultiSelectedIds?.has(String(id)));
        const selectAll=toolbar.querySelector<HTMLButtonElement>('[data-select-all]');if(selectAll)selectAll.textContent=t(all?'取消全选':'全选',all?'Deselect all':'Select all');
        for(const button of toolbar.querySelectorAll<HTMLButtonElement>('[data-action]')){const action=button.dataset.action;button.disabled=busy || !files.length || (action==='history' && (files.length!==1 || files[0].type!=='file'));button.hidden=(action==='history' && (files.length!==1 || files[0].type!=='file')) || (action==='import' && (files.length!==1 || files[0].type!=='folder'));
            if(action==='rename')button.querySelector('span')!.textContent=t('重命名','Rename');
            if(action==='pin')button.querySelector('span')!.textContent=t(files.length && items().every(file=>Number(app.fileOrders?.[file.name])<=-1000000)?'取消置顶':'置顶',files.length && items().every(file=>Number(app.fileOrders?.[file.name])<=-1000000)?'Unpin':'Pin');}
    }
    return {toolbar,update};
}
