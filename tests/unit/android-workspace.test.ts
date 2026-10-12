/** @jest-environment jsdom */
import {installAndroidWorkspace} from '../../js/main/android-workspace';
let ua:jest.SpyInstance,invoke:jest.Mock,app:any,runtime:any;
const flush=()=>new Promise(resolve=>setTimeout(resolve,25));
beforeEach(()=>{
 ua=jest.spyOn(navigator,'userAgent','get').mockReturnValue('Android');invoke=jest.fn().mockResolvedValue({ready:true});window.__TAURI__={invoke} as any;
 document.body.className='file-management-mode';document.body.innerHTML='<div id="settingsModalOverlay" style="display:none"><div class="modal-form"><section class="settings-section"><div class="settings-section-header">外观</div><div class="form-group"><label>字体</label><select id="size"><option value="16">16px</option></select></div></section></div><button id="saveSettingsBtn">保存</button><button id="cancelSettingsBtn">取消</button></div><div id="mobileDropdown" style="display:none"><button class="dropdown-item" id="mobileClearBtn">清空</button></div><button id="mobileMenuBtn">更多</button>';
 app={__TAURI__:window.__TAURI__,files:[{id:'a',name:'a.md',type:'file'}],currentUser:null,refreshNotesHome:jest.fn(),showMessage:jest.fn(),openFile:jest.fn(),openFileSelectionPanel:jest.fn(),exitFileListMultiSelectMode:jest.fn()};
 runtime=installAndroidWorkspace(app);
});
afterEach(()=>{runtime?.dispose();ua.mockRestore();delete window.__TAURI__;document.body.className='';});
const model=()=>JSON.parse(invoke.mock.calls.at(-1)[1].model);
const emit=(detail:any)=>window.dispatchEvent(new CustomEvent('epmd-native-ui',{detail:{epoch:model().epoch,...detail}}));
it('only hides web cards after native home acknowledgement and keeps file actions shared',async()=>{
 expect(app.nativeWorkspaceReady).toBeUndefined();app.nativeWorkspace.renderHome({items:[{id:'a'}]});await flush();expect(app.nativeWorkspaceReady).toBe(true);
 emit({kind:'file',id:'a',longPress:true});expect(app.openFileSelectionPanel).toHaveBeenCalledWith('a');
 emit({kind:'file',id:'a'});expect(app.openFile).toHaveBeenCalledWith('a');emit({kind:'home-action',action:'cancel'});expect(app.exitFileListMultiSelectMode).toHaveBeenCalled();
});
it('drops stale native actions after switching accounts',async()=>{
 await flush();app.currentUser={username:'other'};emit({kind:'file',id:'a'});expect(app.openFile).not.toHaveBeenCalled();
});
it('delegates native settings edits to original controls and save handlers',async()=>{
 const overlay=document.getElementById('settingsModalOverlay')!;overlay.style.display='flex';overlay.classList.add('show');await runtime.sync();await flush();
 const settings=model().settings;const nodes:any[]=[];const walk=(node:any)=>{nodes.push(node);node.children?.forEach(walk);};settings.children.forEach(walk);
 const selector=nodes.find(node=>node.type==='select');const change=jest.fn();document.getElementById('size')!.addEventListener('change',change);
 emit({kind:'change',key:selector.key,value:'16'});expect(change).toHaveBeenCalledTimes(1);
 const save=jest.fn();document.getElementById('saveSettingsBtn')!.onclick=save;emit({kind:'click',key:settings.save});expect(save).toHaveBeenCalledTimes(1);
});
it('preserves the web fallback if the native command is unavailable',async()=>{
 invoke.mockRejectedValue(Error('Unknown command'));await runtime.sync();await flush();expect(app.nativeWorkspaceReady).toBe(false);expect(document.body.classList.contains('native-workspace-ready')).toBe(false);
});
it('pauses native surfaces for a specialized web dialog and resumes settings afterward',async()=>{
 app.nativeWorkspace.renderHome({items:[]});await flush();
 const setting=document.getElementById('settingsModalOverlay')!;setting.style.display='flex';setting.classList.add('show');await runtime.sync();await flush();expect(model().settings).not.toBeNull();
 const child=document.createElement('div');child.className='modal-overlay show';document.body.append(child);await flush();
 expect(model().home).toBeNull();expect(model().settings).toBeNull();expect(app.nativeWorkspacePaused).toBe(true);
 child.remove();await flush();expect(model().settings).not.toBeNull();expect(app.nativeWorkspacePaused).toBe(false);
});
it('opens native More without invoking the overlapping web menu',async()=>{
 await flush();const web=jest.fn();document.getElementById('mobileMenuBtn')!.onclick=web;
 document.getElementById('mobileMenuBtn')!.click();await flush();expect(web).not.toHaveBeenCalled();
 expect(model().more.items[0]).toMatchObject({id:'mobileClearBtn',label:'清空'});
});
it('keeps settings categories separate from expandable setting rows',async()=>{
 const overlay=document.getElementById('settingsModalOverlay')!;
 overlay.querySelector('.settings-section')!.innerHTML='<div class="settings-section-header">外观与语言</div><details class="settings-setting-row"><summary>主题模式</summary><div class="form-group"><label class="settings-control-label">主题模式</label><label><input type="radio" name="theme" value="dark">夜间模式</label></div></details>';
 overlay.style.display='flex';overlay.classList.add('show');await runtime.sync();await flush();
 const category=model().settings.children[0];expect(category.type).toBe('section');expect(category.label).toBe('外观与语言');
 const setting=category.children[0];expect(setting).toMatchObject({type:'group',label:'主题模式',expanded:false});
 expect(setting.children[0].children).toEqual([expect.objectContaining({type:'container',children:[expect.objectContaining({type:'radio',label:'夜间模式'})]})]);
});
it('acknowledges native toolbar before hiding the web toolbar and delegates undo and More',async()=>{
 document.body.classList.remove('file-management-mode');
 const bar=document.createElement('div');bar.className='mobile-toolbar-container';bar.innerHTML='<h1 class="mobile-title">EasyPocketMD</h1><button id="mobileUndoBtn">撤销</button>';document.body.append(bar);
 invoke.mockResolvedValue({ready:true,toolbarReady:true});await runtime.sync();await flush();
 expect(document.body.classList.contains('native-toolbar-ready')).toBe(true);
 const undo=jest.fn();document.getElementById('mobileUndoBtn')!.onclick=undo;
 const buttons=model().toolbar.buttons;emit({kind:'toolbar',key:buttons.find((b:any)=>b.id==='mobileUndoBtn').key});expect(undo).toHaveBeenCalledTimes(1);
 emit({kind:'toolbar',key:buttons.find((b:any)=>b.id==='mobileMenuBtn').key});await flush();expect(model().more.items[0].label).toBe('清空');
});
it('opens import even after the native create menu closes',async()=>{
 app.importFiles=jest.fn();await flush();emit({kind:'home-action',action:'create'});await flush();
 emit({kind:'close-more'});emit({kind:'click',key:'import-file'});expect(app.importFiles).toHaveBeenCalledTimes(1);
});
it('keeps native toolbar ownership during text-copy menus and unsupported dialogs',async()=>{
 document.body.classList.remove('file-management-mode');invoke.mockResolvedValue({ready:true,toolbarReady:true,panelKeys:[]});await runtime.sync();await flush();
 const selection=document.createElement('div');selection.id='selectionToolbar';selection.style.display='flex';document.body.append(selection);await flush();
 expect(model().toolbar).not.toBeNull();expect(document.body.classList.contains('native-toolbar-ready')).toBe(true);
 const dialog=document.createElement('div');dialog.className='modal-overlay show';document.body.append(dialog);await flush();
 expect(model().toolbar).toBeNull();expect(document.body.classList.contains('native-toolbar-ready')).toBe(true);
 dialog.remove();await flush();expect(model().toolbar).not.toBeNull();
});
it('keeps the old file cards hidden during specialized web subflows',async()=>{
 app.nativeWorkspace.renderHome({items:[]});await flush();
 const child=document.createElement('div');child.className='modal-overlay show';document.body.append(child);await flush();
 expect(model().home).toBeNull();expect(document.body.classList.contains('native-workspace-ready')).toBe(true);
});
it('passes the live encryption indicator and its help action to the native toolbar',async()=>{
 document.body.classList.remove('file-management-mode');const bar=document.createElement('div');bar.className='mobile-toolbar-container';bar.innerHTML='<span class="mobile-e2e-indicator" aria-hidden="false"></span>';document.body.append(bar);
 invoke.mockResolvedValue({ready:true,toolbarReady:true,panelKeys:[]});await runtime.sync();await flush();
 const lock=model().toolbar.lock;expect(lock.label).toContain('端到端加密');const show=jest.fn();bar.firstElementChild!.addEventListener('click',show);
 emit({kind:'toolbar',key:lock.key});expect(show).toHaveBeenCalledTimes(1);
 bar.firstElementChild!.setAttribute('aria-hidden','true');await runtime.sync();expect(model().toolbar.lock).toBeNull();
});
it.each(['aboutModalOverlay','wordCountModalOverlay','aiModalOverlay','export','share','print'])('acknowledges and closes the native %s surface through its original handler',async(id)=>{
 invoke.mockImplementation(async(_:string,payload:any)=>({ready:true,panelKeys:JSON.parse(payload.model).panels.map((p:any)=>p.key)}));
 const overlay=document.createElement('div');overlay.className='modal-overlay show';if(id.endsWith('Overlay'))overlay.id=id;else overlay.dataset.nativePanel=id;
 overlay.innerHTML='<div class="modal"><button class="epmd-dialog-close">×</button><h2>标题</h2><label for="nativeName">名称</label><input id="nativeName" value="初始"><button id="nativeApply">应用</button><p>提示 <strong>完整文字</strong></p></div>';
 document.body.append(overlay);await runtime.sync();await flush();
 expect(overlay.getAttribute('data-native-owned')).toBe('true');expect(model().home).toBeNull();expect(app.nativeWorkspacePaused).toBe(false);
 const nodes:any[]=[];const walk=(n:any)=>{nodes.push(n);n.children?.forEach(walk);};model().panels.forEach(walk);
 const input=nodes.find(n=>n.type==='input');expect(input.label).toBe('名称');emit({kind:'input',key:input.key,value:'新名称'});expect((overlay.querySelector('input') as HTMLInputElement).value).toBe('新名称');
 expect(nodes.find(n=>n.type==='text' && n.label.includes('提示')).label).toBe('提示 完整文字');
 const close=jest.fn(()=>overlay.remove());(overlay.querySelector('button') as HTMLElement).onclick=close;
 emit({kind:'close-panel',key:model().panels[0].key});expect(close).toHaveBeenCalledTimes(1);
});
it('retains the whole AI response and sends text-only streaming updates',async()=>{
 invoke.mockImplementation(async(_:string,payload:any)=>({ready:true,panelKeys:JSON.parse(payload.model).panels.map((p:any)=>p.key)}));
 const overlay=document.createElement('div');overlay.id='aiModalOverlay';overlay.className='modal-overlay show';overlay.innerHTML='<div class="modal"><h2>AI助手</h2><div class="ai-result-content"></div></div>';document.body.append(overlay);
 const result=overlay.querySelector('.ai-result-content')!;result.textContent='正文'.repeat(2000);await runtime.sync();await flush();const initial=model().panels[0].children[0];expect(initial.label).toHaveLength(4000);
 result.firstChild!.textContent+='追加';await flush();expect(model().panels[0].children[0]).toMatchObject({key:initial.key,label:'正文'.repeat(2000)+'追加'});
});
it('keeps a requested panel visible as a web fallback when an older APK lacks panel support',async()=>{
 app.nativeWorkspace.renderHome({items:[]});await flush();
 const overlay=document.createElement('div');overlay.id='aboutModalOverlay';overlay.className='modal-overlay show';overlay.innerHTML='<div class="modal"><h2>关于</h2></div>';document.body.append(overlay);await runtime.sync();await flush();
 expect(overlay.hasAttribute('data-native-owned')).toBe(false);expect(model().home).toBeNull();expect(app.nativeWorkspacePaused).toBe(true);
});
it('keeps owned settings and AI web markup hidden under an unsupported child surface',async()=>{
 invoke.mockImplementation(async(_:string,payload:any)=>({ready:true,panelKeys:JSON.parse(payload.model).panels.map((p:any)=>p.key)}));
 const setting=document.getElementById('settingsModalOverlay')!;setting.style.display='flex';setting.classList.add('show');
 const panel=document.createElement('div');panel.id='aiModalOverlay';panel.className='modal-overlay show';panel.innerHTML='<div class="modal"><h2>AI助手</h2><p>结果</p></div>';document.body.append(panel);await runtime.sync();await flush();
 const child=document.createElement('div');child.className='modal-overlay show';document.body.append(child);await flush();
 expect(model().panels).toEqual([]);expect(model().settings).toBeNull();expect(panel.getAttribute('data-native-owned')).toBe('true');expect(document.body.classList.contains('native-settings-ready')).toBe(true);
 child.remove();await flush();expect(model().panels).toHaveLength(1);expect(model().settings).not.toBeNull();
});
it('consumes native close for a protected in-progress operation without running cleanup',async()=>{
 invoke.mockImplementation(async(_:string,payload:any)=>({ready:true,panelKeys:JSON.parse(payload.model).panels.map((p:any)=>p.key)}));
 const overlay=document.createElement('div');overlay.dataset.nativePanel='export';overlay.dataset.escClosable='false';overlay.className='modal-overlay show';overlay.innerHTML='<div><h2>导出中</h2><button class="epmd-dialog-close">关闭</button></div>';document.body.append(overlay);
 await runtime.sync();await flush();expect(model().panels[0].dismissible).toBe(false);const close=jest.fn();(overlay.querySelector('button') as HTMLElement).onclick=close;
 emit({kind:'close-panel',key:model().panels[0].key});expect(close).not.toHaveBeenCalled();expect(overlay.isConnected).toBe(true);
});
