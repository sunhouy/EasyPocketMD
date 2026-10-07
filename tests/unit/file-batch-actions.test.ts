/** @jest-environment jsdom */
import {buildRenamePlan,selectionRoots,applyRenamePlan,installBatchFileActions,showBottomSheet} from '../../js/files/batch-actions';
import {relocateFile} from '../../js/files/relocate';
import {downloadGeneratedFile} from '../../js/ui/export';
jest.mock('../../js/files/relocate',()=>({relocateFile:jest.fn()}));
const file=(id:string,name:string,type='file')=>({id,name,type,content:'draft'});
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
beforeEach(()=>{document.body.innerHTML='';localStorage.clear();jest.clearAllMocks();Object.defineProperty(crypto,'randomUUID',{configurable:true,value:jest.fn(()=>String(Math.random()))});});
it('renames by literal replacement, numbering and suffix while preserving extensions and folder names',()=>{
 const files=[file('1','研究/报告.md'),file('2','研究/旧报告.txt'),file('3','研究/目录.v1','folder')];
 expect(buildRenamePlan(files,files,{template:'{name}-{n}',start:8,find:'旧',replace:'新',suffix:'终稿'}).map(x=>x.path)).toEqual(['研究/报告-8终稿.md','研究/新报告-9终稿.txt','研究/目录.v1-10终稿']);
 expect(()=>buildRenamePlan(files,files,{template:'../{n}',start:1})).toThrow();
 const conflict=file('x','报告.md');expect(()=>buildRenamePlan([conflict,file('y','其他.md')],[file('z','原.md')],{template:'报告',start:1})).toThrow('名称冲突');
 expect(buildRenamePlan([conflict],[file('z','原.md')],{template:'报告',start:1,deduplicate:true})[0].path).toBe('报告 (2).md');
});
it('collapses selected folder descendants so operations apply once',()=>{
 const files=[file('f','文件夹','folder'),file('c','文件夹/文档.md'),file('n','旁边.md')];expect(selectionRoots(files,['f','c','n']).map(x=>x.id)).toEqual(['f','n']);
});
it('stages swaps and restores original paths after a partially applied rename fails',async()=>{
 const a=file('a','a.md'),b=file('b','b.md');const app={files:[a,b]};let fail=true;
 jest.mocked(relocateFile).mockImplementation(async(app,id,path)=>{if(path==='a.md'&&fail){fail=false;throw Error('network');}const item=app.files.find(x=>x.id===id);if(app.files.some(x=>x!==item&&x.name===path))throw Error('collision');item.name=path;});
 await expect(applyRenamePlan(app,[{file:a,path:'b.md'},{file:b,path:'a.md'}])).rejects.toThrow('network');expect([a.name,b.name]).toEqual(['a.md','b.md']);
 await applyRenamePlan(app,[{file:a,path:'b.md'},{file:b,path:'a.md'}]);expect([a.name,b.name]).toEqual(['b.md','a.md']);
});
function setup(files:any[]){const app:any={files,fileListMultiSelectedIds:new Set(files.map(x=>x.id)),unsavedChanges:{},showMessage:jest.fn(),showHistoryModal:jest.fn(),fileOrders:{}};
 const hooks={reload:jest.fn(),orders:jest.fn(),loadContent:jest.fn(async()=> 'loaded draft'),exit:jest.fn(),delete:jest.fn(),upDown:jest.fn(),import:jest.fn()};const ui=installBatchFileActions(app,hooks);ui.toolbar();return {app,hooks,ui};}
it('shows details for multiple items and hides history for multi-select and folders',()=>{
 const {app,ui}=setup([file('a','a.md'),file('f','目录','folder')]);expect(document.querySelector<HTMLButtonElement>('[data-action=history]').hidden).toBe(true);
 expect(document.querySelector('[data-action=rename]').textContent).toBe('重命名');document.querySelector<HTMLButtonElement>('[data-action=details]').click();expect(document.querySelectorAll('#fileDetailsModal dl')).toHaveLength(2);
 app.fileListMultiSelectedIds=new Set(['a']);ui.update();expect(document.querySelector<HTMLButtonElement>('[data-action=history]').hidden).toBe(false);document.querySelector<HTMLButtonElement>('[data-action=history]').click();expect(app.showHistoryModal).toHaveBeenCalledWith('a','a.md');
 app.fileListMultiSelectedIds=new Set(['f']);ui.update();expect(document.querySelector<HTMLButtonElement>('[data-action=history]').hidden).toBe(true);
});
it('copies to the same directory with a unique path without overwriting the original or its local binding',async()=>{
 const original={...file('a','a.md'),externalLocalFileId:'disk',e2e_enabled:1};const {app,hooks}=setup([original]);document.querySelector<HTMLButtonElement>('[data-action=copy]').click();document.querySelector<HTMLButtonElement>('#fileActionSheet .file-action-button').click();await tick();
 expect(app.files).toHaveLength(2);expect(app.files[1]).toMatchObject({name:'a (副本).md',content:'loaded draft',e2e_enabled:1});expect(app.files[1].externalLocalFileId).toBeUndefined();expect(original.name).toBe('a.md');expect(hooks.reload).toHaveBeenCalled();
});
it('does not copy into another account when content loading completes after switching',async()=>{
 const {app,hooks}=setup([file('a','a.md')]);let resolve:any;hooks.loadContent.mockImplementation(()=>new Promise(r=>{resolve=r;}));document.querySelector<HTMLButtonElement>('[data-action=copy]').click();document.querySelector<HTMLButtonElement>('#fileActionSheet .file-action-button').click();app.currentUser={username:'other'};resolve('private');await tick();expect(app.files).toHaveLength(1);expect(app.showMessage).toHaveBeenCalledWith(expect.stringContaining('已切换'),'error');
});
it('uses a dismissible four-action bottom sheet and runs the selected action once',()=>{
 const run=jest.fn();showBottomSheet('新建或打开',['新建文件','新建文件夹','导入文件','打开本地文件'].map(label=>({label,icon:'fa-file',run})));
 expect(document.querySelectorAll('#fileActionSheet .file-action-button')).toHaveLength(4);document.querySelector<HTMLButtonElement>('.file-action-button').click();expect(run).toHaveBeenCalledTimes(1);expect(document.getElementById('fileActionSheet')).toBeNull();
});
it('saves PPT blobs through the same Android native bridge as other exports',async()=>{
 const payload=new Blob(['pptx']);window.nativeFileOps={isTauriRuntime:()=>true,saveFile:jest.fn().mockResolvedValue(undefined)} as any;
 await downloadGeneratedFile(payload,'报告.pptx','application/vnd.openxmlformats-officedocument.presentationml.presentation');expect(window.nativeFileOps.saveFile).toHaveBeenCalledWith(payload,expect.objectContaining({filename:'报告.pptx'}));
});

it('uses the ordinary name prompt for one item and a top-aligned rule form for multiple items',()=>{
 const {app,ui}=setup([file('a','a.md'),file('b','b.md')]);app.renameFile=jest.fn();
 app.fileListMultiSelectedIds=new Set(['a']);ui.update();document.querySelector<HTMLButtonElement>('[data-action=rename]').click();
 expect(app.renameFile).toHaveBeenCalledWith('a');expect(document.getElementById('fileActionSheet')).toBeNull();
 app.fileListMultiSelectedIds.add('b');ui.update();document.querySelector<HTMLButtonElement>('[data-action=rename]').click();
 expect(document.getElementById('fileActionSheet').classList.contains('file-action-dialog-overlay')).toBe(true);
 expect(document.querySelectorAll('.batch-rename-preview > div')).toHaveLength(2);
});
it('toggles pin and select-all labels immediately as selection changes',()=>{
 const {app,ui}=setup([file('a','a.md'),file('b','b.md')]);
 const pin=document.querySelector<HTMLButtonElement>('[data-action=pin]');pin.click();expect(pin.textContent).toContain('取消置顶');pin.click();expect(pin.textContent).not.toContain('取消置顶');
 const all=document.querySelector<HTMLButtonElement>('[data-select-all]');expect(all.textContent).toBe('取消全选');
 app.selectAllFilesForMulti=()=>{app.fileListMultiSelectedIds.size===2?app.fileListMultiSelectedIds.clear():app.files.forEach(f=>app.fileListMultiSelectedIds.add(f.id));ui.update();};
 all.click();expect(all.textContent).toBe('全选');all.click();expect(all.textContent).toBe('取消全选');
});
