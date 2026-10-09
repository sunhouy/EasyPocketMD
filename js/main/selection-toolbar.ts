import { selectionSearchUrl } from './selection-search';
import { showSelectionTranslation, selectionTranslationContext } from './selection-translation';
import { copyContent, canReadClipboard, readClipboardText } from '../clipboard';
import { selectionContent } from './selection-content';
import { contextInsert, contextInsertActions } from './editor-context-actions';
import { recoverEditorRendering } from '../editor-render-recovery';
type Snapshot = {owner:HTMLElement;text:string;html?:string;caret?:boolean;rect:()=>DOMRect|DOMRectReadOnly;valid:()=>boolean;restore:()=>void;replace:(text:string)=>void;editable:boolean;markdown:boolean;range?:Range};
type Action = string;
const actions:[Action,string,string,string][]=[['copy','copy','复制','Copy'],['cut','scissors','剪切','Cut'],['paste','paste','粘贴','Paste'],['search','magnifying-glass','搜索','Search'],['translate','language','翻译','Translate'],['h1','heading','标题1','Heading 1'],['h2','heading','标题2','Heading 2'],['h3','heading','标题3','Heading 3'],['bold','bold','粗体','Bold'],['italic','italic','斜体','Italic'],['quote','quote-right','引用','Quote'],['strike','strikethrough','删除线','Strikethrough'],['list','list-ul','无序列表','Bullet list'],['ordered-list','list-ol','有序列表','Numbered list'],['check','list-check','任务列表','Task list']];
export function selectionMarkdown(text:string,action:string):string {
    const marks:Record<string,string>={bold:'**',italic:'*',strike:'~~'};
    if(marks[action])return marks[action]+text+marks[action];
    return text.split('\n').map((line,i)=>{
        const prefixes:Record<string,string>={h1:'# ',h2:'## ',h3:'### ',quote:'> ',list:'- ','ordered-list':`${i+1}. `,check:'- [ ] '};
        return (prefixes[action]||'')+line;
    }).join('\n');
}
export function installSelectionToolbar(app:any=window) {
    if(document.getElementById('selectionToolbar'))return;
    const toolbar=document.createElement('div');toolbar.id='selectionToolbar';toolbar.className='selection-toolbar';toolbar.hidden=true;
    toolbar.setAttribute('role','toolbar');toolbar.setAttribute('aria-label','文本操作');
    document.body.append(toolbar);
    const menuActions:[Action,string,string,string][]=[['select-all','object-group','全选','Select all'],...actions,...contextInsertActions];
    let snapshot:Snapshot|null=null, frame=0,busy=false;
    let pasteAllowed=canReadClipboard();
    if(navigator.permissions?.query)void navigator.permissions.query({name:'clipboard-read' as PermissionName}).then(permission=>{
        const update=()=>{pasteAllowed=canReadClipboard() && (permission.state!=='denied' || /Android/i.test(navigator.userAgent) && !!(app.__TAURI_INTERNALS__?.invoke || app.__TAURI__?.core?.invoke || app.__TAURI__?.invoke));if(snapshot)schedule();};
        permission.onchange=update;update();
    }).catch(()=>{});
    let nativeMenuEnabled:boolean|undefined;
    function nativeMenu(custom:boolean){
        if(nativeMenuEnabled===custom)return;
        const native=app.__TAURI__?.core?.invoke || app.__TAURI__?.invoke || app.__TAURI_INTERNALS__?.invoke;
        if(!native)return;
        nativeMenuEnabled=custom;
        void native('set_selection_menu',{enabled:custom}).catch(()=>{nativeMenuEnabled=undefined;});
    }
    function customMenuTarget(target:Element|null){
        if(!target || target.closest('.cm-editor,.epmd-code-editor'))return false;
        const input=target.closest('input,textarea');
        if(input instanceof HTMLInputElement && ['password','email','number','date','color'].includes(input.type))return false;
        return !!input || !!target.closest('#vditor .vditor-reset,#vditor [contenteditable]');
    }

    const visible=(owner:HTMLElement)=>{
        if(!owner.isConnected)return false;
        for(let node:HTMLElement|null=owner;node;node=node.parentElement){const style=getComputedStyle(node);if(node.hidden || style.display==='none' || style.visibility==='hidden')return false;}
        const surfaces=Array.from(document.querySelectorAll<HTMLElement>('.modal-overlay.show,[role=dialog]'));
        return !surfaces.some(surface=>visibleSurface(surface) && !surface.contains(owner));
    };
    const visibleSurface=(node:HTMLElement)=>{
        for(let parent:HTMLElement|null=node;parent;parent=parent.parentElement){const style=getComputedStyle(parent);if(parent.hidden || parent.getAttribute('aria-hidden')==='true' || style.display==='none' || style.visibility==='hidden' || style.opacity==='0')return false;}
        return true;
    };
    const observer=new MutationObserver(()=>{if(snapshot && (!snapshot.owner.isConnected || !visible(snapshot.owner)))hide();});
    let observedOwner:HTMLElement|null=null;
    const hide=()=>{caretRequested=false;toolbar.hidden=true;snapshot=null;observer.disconnect();observedOwner=null;};
    function observeOwner(owner:HTMLElement){
        if(owner===observedOwner)return;observer.disconnect();observedOwner=owner;
        for(let parent:HTMLElement|null=owner;parent;parent=parent.parentElement)observer.observe(parent,{attributes:true,attributeFilter:['hidden','class','style'],childList:true});
    }
    function capture(allowCaret=false):Snapshot|null {
        if(document.body.classList.contains('epmd-copying'))return null;
        const active=document.activeElement as HTMLElement;
        if(toolbar.contains(active) && !allowCaret)return snapshot;
        const selection=document.getSelection();
        const anchor=selection?.anchorNode;
        const anchorElement=anchor instanceof Element?anchor:anchor?.parentElement;
        if(active?.closest('.cm-editor,.epmd-code-editor') || anchorElement?.closest('.cm-editor,.epmd-code-editor'))return null;
        if(active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement){
            if(active instanceof HTMLInputElement && ['password','email','number','date','color'].includes(active.type))return null;
            const from=active.selectionStart,to=active.selectionEnd;
            if(from==null || to==null || from===to && (!allowCaret || active.id!=='longFileTextarea') || !visible(active))return null;
            const value=active.value,text=value.slice(from,to),file=app.currentFileId,readonly=active.readOnly;
            return {owner:active,text,caret:from===to,editable:!active.readOnly && !active.disabled,markdown:active.id==='longFileTextarea' && !active.readOnly && !active.disabled,rect:()=>active.getBoundingClientRect(),
                valid:()=>visible(active) && active.readOnly===readonly && active.value===value && (active.id!=='longFileTextarea' || file===app.currentFileId),
                restore:()=>{active.focus({preventScroll:true});active.setSelectionRange(from,to);},
                replace:next=>{active.setRangeText(next,from,to,'select');active.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:next}));}};
        }
        if(!selection?.rangeCount || selection.isCollapsed && !allowCaret)return null;
        const range=selection.getRangeAt(0).cloneRange();
        const owner=(range.commonAncestorContainer instanceof HTMLElement?range.commonAncestorContainer:range.commonAncestorContainer.parentElement);
        if(!owner || toolbar.contains(owner) || !visible(owner))return null;
        const end=range.endContainer instanceof Element?range.endContainer:range.endContainer.parentElement;
        if(end?.closest('.cm-editor,.epmd-code-editor'))return null;
        const root=owner.closest<HTMLElement>('[contenteditable=true]');
        const editor=owner.closest<HTMLElement>('#vditor');
        const editable=!!root && !editor?.matches('[data-shared-readonly=true],.vditor-readonly') && !owner.closest('.cm-editor');
        if(selection.isCollapsed && (!editable || !editor))return null;
        const file=app.currentFileId,raw=range.toString(),content=selectionContent(range,app);
        if(!selection.isCollapsed && !content.text.trim())return null;
        const valid=()=>visible(owner) && range.startContainer.isConnected && range.endContainer.isConnected && range.toString()===raw && (!editor || file===app.currentFileId);
        return {owner,...content,caret:range.collapsed,range,editable,markdown:editable && !!editor,valid,rect:()=>range.getBoundingClientRect(),restore:()=>{root?.focus({preventScroll:true});selection.removeAllRanges();selection.addRange(range);},
            replace:next=>{if(!document.execCommand(next?'insertText':'delete',false,next))throw Error('无法修改选中文字，请使用编辑器工具栏重试');}};
    }
    function position(context:Snapshot) {
        const rect=context.rect(),bounds=toolbar.getBoundingClientRect(),v=window.visualViewport;
        const x=(v?.offsetLeft||0)+8,y=(v?.offsetTop||0)+8,w=(v?.width||innerWidth)-16,h=(v?.height||innerHeight)-16;
        toolbar.style.left=Math.max(x,Math.min(rect.left+(rect.width-bounds.width)/2,x+w-bounds.width))+'px';
        const top=rect.top-bounds.height-10>=y?rect.top-bounds.height-10:rect.bottom+10;
        toolbar.style.top=Math.max(y,Math.min(top,y+h-bounds.height))+'px';
    }
    let caretRequested=false;
    function refresh(){
        frame=0;if(busy)return;
        const next=capture(caretRequested);if(!next){hide();return;}
        snapshot=next;observeOwner(next.owner);toolbar.hidden=false;nativeMenu(true);
        toolbar.classList.toggle('editor-context-toolbar',!!next.caret);
        toolbar.setAttribute('aria-label',app.i18n?.getLanguage?.()==='en'?'Text actions':'文本操作');
        for(const button of Array.from(toolbar.querySelectorAll<HTMLButtonElement>('button'))){
            const action=menuActions.find(a=>a[0]===button.dataset.action)!;
            button.title=app.i18n?.getLanguage?.()==='en'?action[3]:action[2];button.setAttribute('aria-label',button.title);
            const insert=contextInsertActions.some(item=>item[0]===action[0]);
            const caretAction=['select-all','paste','h1','h2','h3','quote'].includes(action[0]) || insert;
            const supported=next.caret ? next.markdown && caretAction && (action[0]!=='paste' || pasteAllowed) : insert ? false : ['select-all','copy','search','translate'].includes(action[0]) ? true : action[0]==='paste' ? next.editable && pasteAllowed : action[0]==='cut' ? next.editable : next.markdown;
            button.hidden=!supported;button.disabled=false;
            if(supported && !next.caret && next.range && !['select-all','copy','cut','paste','search','translate'].includes(action[0])) {
                const selector=action[0].startsWith('h')?`button[data-tag="${action[0]}"]`:`button[data-type="${action[0]}"]`;
                const native=document.getElementById('vditor')?.querySelector<HTMLElement>('.vditor-toolbar '+selector);
                button.hidden=!native || native.classList.contains('vditor-menu--disabled');
            }
        }
        position(next);
    }
    const schedule=()=>{if(!frame)frame=requestAnimationFrame(refresh);};
    const report=(zh:string,en:string,type='success')=>app.showMessage?.(app.i18n?.getLanguage?.()==='en'?en:zh,type);
    const insertMarkdown=(text:string)=>{
        (app.vditor.insertMD || app.vditor.insertValue).call(app.vditor,text);
        recoverEditorRendering(app.vditor);
    };
    async function execute(action:Action){
        const context=snapshot;if(!context || busy || !context.valid())return hide();
        busy=true;
        try {
            if(action==='select-all'){
                context.restore();
                if(context.owner instanceof HTMLInputElement || context.owner instanceof HTMLTextAreaElement)context.owner.select();
                else {
                    const root=context.owner.closest('.vditor-reset,[contenteditable=true]') || context.owner;
                    const range=document.createRange();range.selectNodeContents(root);
                    const selection=document.getSelection();selection?.removeAllRanges();selection?.addRange(range);
                }
            } else if(contextInsertActions.some(item=>item[0]===action)){
                toolbar.hidden=true;
                await contextInsert(action,app,context.restore,text=>context.range?insertMarkdown(text):context.replace(text),context.valid);
            } else if(action==='search'){
                const url=selectionSearchUrl(context.text,app.userSettings?.searchEngine,app.userSettings?.customSearchUrl);
                if(app.nativeFileOps?.openExternalUrl)await app.nativeFileOps.openExternalUrl(url);
                else window.open(url,'_blank','noopener,noreferrer');
            } else if(action==='translate'){
                const nearby=selectionTranslationContext(context.text,context.range,context.owner,app);
                hide();void showSelectionTranslation(context.text,app,nearby);
            } else if(action==='copy' || action==='cut'){
                if(action==='cut' && !context.editable)return;
                await copyContent({text:context.text,html:context.html});
                if(action==='cut'){if(!context.valid())throw Error('选中文字已变化，请重新选择');context.restore();context.replace('');}
                report(action==='copy'?'已复制':'已剪切',action==='copy'?'Copied':'Cut');
            } else if(action==='paste'){
                if(!context.editable)return;
                const text=await readClipboardText();
                if(!context.valid())throw Error('选中文字已变化，请重新选择');context.restore();
                if(context.markdown && context.range)insertMarkdown(text);else context.replace(text);
            } else {
                if(!context.markdown || !context.editable)return;
                context.restore();
                if(context.range){
                    const selector=action.startsWith('h')?`button[data-tag="${action}"]`:`button[data-type="${action}"]`;
                    const native=document.getElementById('vditor')?.querySelector<HTMLElement>('.vditor-toolbar '+selector);
                    if(!native || native.classList.contains('vditor-menu--disabled'))throw Error('此选区不支持该格式，请重新选择正文');
                    native.dispatchEvent(new Event(navigator.userAgent.includes('iPhone')?'touchstart':'click',{bubbles:true,cancelable:true}));
                } else context.replace(selectionMarkdown(context.text,action));
            }
        } catch(error){report(String((error as Error).message),String((error as Error).message),'error');}
        finally {busy=false;hide();if(action==='select-all')schedule();}
    }
    for(const [action,icon,zh] of menuActions){
        const button=document.createElement('button');button.type='button';button.dataset.action=action;button.title=zh;button.setAttribute('aria-label',zh);
        button.innerHTML=`<i class="fas fa-${icon}" aria-hidden="true"></i>${/^h[123]$/.test(action)?`<sup aria-hidden="true">${action.slice(1)}</sup>`:''}`;
        button.onpointerdown=event=>event.preventDefault();button.onmousedown=event=>event.preventDefault();button.onclick=()=>{void execute(action);};toolbar.append(button);
    }
    document.addEventListener('selectionchange',schedule);
    document.addEventListener('select',schedule,true);document.addEventListener('pointerup',schedule,true);
    document.addEventListener('touchend',schedule,{passive:true});
    document.addEventListener('beforeinput',hide,true);
    let pressTimer:ReturnType<typeof setTimeout>|undefined,pressPoint:{x:number;y:number}|undefined;
    const cancelPress=()=>{clearTimeout(pressTimer);pressPoint=undefined;};
    document.addEventListener('pointerdown',event=>{if(!toolbar.contains(event.target as Node)){
        caretRequested=false;cancelPress();const target=event.target instanceof Element?event.target:null;
        const custom=customMenuTarget(target);nativeMenu(custom);hide();schedule();
        if(custom && event.pointerType==='touch'){
            pressPoint={x:event.clientX,y:event.clientY};
            pressTimer=setTimeout(()=>{caretRequested=true;refresh();},550);
        }
    }},true);
    document.addEventListener('pointermove',event=>{if(pressPoint && Math.hypot(event.clientX-pressPoint.x,event.clientY-pressPoint.y)>10)cancelPress();},true);
    document.addEventListener('pointerup',cancelPress,true);document.addEventListener('pointercancel',cancelPress,true);
    document.addEventListener('focusin',event=>{if(!toolbar.contains(event.target as Node))nativeMenu(customMenuTarget(event.target instanceof Element?event.target:null));},true);
    document.addEventListener('contextmenu',event=>{
        const target=event.target instanceof Element?event.target:null;
        if(!customMenuTarget(target))return;
        event.preventDefault();nativeMenu(true);caretRequested=true;
        const selection=document.getSelection();
        if(target?.closest('#vditor') && (!selection?.rangeCount || selection.isCollapsed)){
            const pointRange=(document as any).caretRangeFromPoint?.(event.clientX,event.clientY) as Range | undefined;
            if(pointRange && target.closest('[contenteditable=true]')?.contains(pointRange.startContainer)){selection?.removeAllRanges();selection?.addRange(pointRange);}
        }
        const next=capture(true);if(!next || !next.valid()){hide();return;}refresh();
    },true);
    document.addEventListener('keydown',event=>{if(event.key==='Escape')hide();});
    document.addEventListener('scroll',()=>{if(snapshot && !toolbar.hidden){if(snapshot.valid())position(snapshot);else hide();}},true);
    window.addEventListener('resize',schedule);window.visualViewport?.addEventListener('resize',schedule);
}
