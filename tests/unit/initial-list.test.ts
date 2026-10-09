/** @jest-environment jsdom */
import {initializeFileList} from '../../js/files/initial-list';
import {installNotesHome} from '../../js/files/notes-home';
beforeEach(()=>{document.body.innerHTML='<div id="fileListSidebar"></div>';document.body.className='file-management-mode';});
it('publishes cloud files together in modification order instead of progressively moving cached cards',async()=>{
 const app:any={startInFileManagementMode:true,files:[{id:'cache',name:'缓存',type:'file',lastModified:100}]};
 const home=installNotesHome(app);app.loadFiles=home.render;
 let finish:()=>void;const task=initializeFileList(app,async()=>{home.render();await new Promise<void>(resolve=>finish=resolve);});
 expect(document.querySelectorAll('.notes-file-card')).toHaveLength(0);expect(document.querySelector('.notes-home-empty').textContent).toContain('正在加载');
 app.files=[{id:'new',name:'新文件',type:'file',lastModified:200},{id:'pin',name:'置顶',type:'file',lastModified:10,order:-2000000}];home.render();
 expect(document.querySelectorAll('.notes-file-card')).toHaveLength(0);
 finish();await task;expect([...document.querySelectorAll<HTMLElement>('.notes-file-card')].map(card=>card.dataset.fileId)).toEqual(['new','pin']);expect(app.fileListInitializing).toBe(false);
});
it('releases cached files when the initial request fails',async()=>{
 const app:any={startInFileManagementMode:true,files:[{id:'cache',name:'缓存',type:'file'}]};app.loadFiles=installNotesHome(app).render;
 await expect(initializeFileList(app,async()=>{throw Error('offline');})).rejects.toThrow('offline');expect(app.fileListInitializing).toBe(false);expect(document.querySelectorAll('.notes-file-card')).toHaveLength(1);
});
it('does not release a newer account initialization when an older request finishes',async()=>{
 const app:any={startInFileManagementMode:true,loadFiles:jest.fn()};let first:()=>void,second:()=>void;
 const a=initializeFileList(app,()=>new Promise<void>(resolve=>first=resolve));const b=initializeFileList(app,()=>new Promise<void>(resolve=>second=resolve));
 first();await a;expect(app.fileListInitializing).toBe(true);expect(app.loadFiles).not.toHaveBeenCalled();second();await b;expect(app.fileListInitializing).toBe(false);expect(app.loadFiles).toHaveBeenCalledTimes(1);
});
