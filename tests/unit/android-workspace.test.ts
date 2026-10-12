/** @jest-environment jsdom */
import {installAndroidWorkspace} from '../../js/main/android-workspace';
let ua:jest.SpyInstance,invoke:jest.Mock,app:any,runtime:any;
const flush=()=>new Promise(resolve=>setTimeout(resolve,0));
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
