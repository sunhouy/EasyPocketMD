/** @jest-environment jsdom */
// @ts-nocheck
jest.mock('../../js/ui/ai-query-files',()=>({collectQueryDocuments:jest.fn(async()=>({documents:[{path:'笔记.md',content:'[resource](/user_files/user/1720000000000_file.pdf)'}],skipped:[]}))}));
require('../../js/ui/file-manager');
beforeEach(()=>{
    document.body.innerHTML='';localStorage.clear();
    window.currentUser={username:'user',token:'token'};window.nightMode=false;window.files=[{id:'doc',name:'笔记.md',type:'file'}];window.openFile=jest.fn(async()=>{});
    window.i18n={getLanguage:()=> 'zh',t:key=>key};window.getApiBaseUrl=()=>'/api';
    window.IndexedDBManager={getAllFiles:jest.fn(async()=>[])};
    window.showMessage=jest.fn();window.customConfirm=jest.fn(async()=>true);
    Object.defineProperty(navigator,'clipboard',{value:{writeText:jest.fn(async()=>{})},configurable:true});
    global.fetch=jest.fn(async(url)=>({json:async()=>url.endsWith('/list') ? {code:200,totalSize:30,data:[{name:'1720000000000_file.pdf',url:'/user_files/user/1720000000000_file.pdf',size:10},{name:'unused.pdf',url:'/user_files/user/unused.pdf',size:20,uploadedAt:'2026-10-07T01:00:00Z'}]} : {code:200}}));
});
it('renders upload dates/references, then selects, copies and deletes multiple resources',async()=>{
    await window.showFileManager();await Promise.resolve();
    const references=document.querySelectorAll('.file-manager-references');
    expect(references[0].textContent).toContain('笔记.md');expect(references[1].textContent).toBe('未引用');
    expect(document.querySelectorAll('.file-manager-upload-date')[1].textContent).toContain('2026');
    const button=label=>[...document.querySelectorAll('.file-manager-selection button')].find(item=>item.textContent===label);
    button('全选').click();expect([...document.querySelectorAll('.file-manager-checkbox')].every(input=>input.checked)).toBe(true);
    button('复制所选链接').click();expect(navigator.clipboard.writeText.mock.calls[0][0]).toContain('unused.pdf');
    button('删除所选').click();
    for(let i=0;i<30;i++) await Promise.resolve();
    expect(window.customConfirm).toHaveBeenCalledTimes(1);expect(fetch.mock.calls.filter(([url])=>url.endsWith('/delete'))).toHaveLength(2);
    expect(document.querySelectorAll('.file-manager-checkbox')).toHaveLength(0);
});
it('never labels a failed reference scan as unused',async()=>{
    require('../../js/ui/ai-query-files').collectQueryDocuments.mockResolvedValueOnce({documents:[],skipped:['encrypted.md']});
    await window.showFileManager();await Promise.resolve();
    expect(document.querySelector('.file-manager-references').textContent).toContain('未确认');
});

it('toggles resource selection and opens the document referenced by a resource',async()=>{
 await window.showFileManager();await Promise.resolve();
 const all=document.querySelector('.file-manager-selection button');all.click();expect(all.textContent).toBe('取消全选');all.click();expect(all.textContent).toBe('全选');
 document.querySelector('.file-reference-link').click();await Promise.resolve();expect(window.openFile).toHaveBeenCalledWith('doc');expect(document.querySelector('.file-manager-overlay')).toBeNull();
});
it('shows a full-screen original image on double click and Escape returns to My Files',async()=>{
 fetch.mockImplementation(async()=>({json:async()=>({code:200,totalSize:20,data:[{name:'photo.png',url:'/photo.png',thumbUrl:'/thumb.png',size:20}]})}));
 await window.showFileManager();document.querySelector('.file-manager-preview').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));await Promise.resolve();
 expect(document.querySelector('.resource-preview-overlay img').getAttribute('src')).toBe('/photo.png');
 document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));expect(document.querySelector('.resource-preview-overlay')).toBeNull();expect(document.querySelector('.file-manager-overlay')).not.toBeNull();
 document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));expect(document.querySelector('.file-manager-overlay')).toBeNull();
});
it('opens an image after a long press and cancels a press when the pointer moves',async()=>{
 jest.useFakeTimers();
 try{
  fetch.mockImplementation(async()=>({json:async()=>({code:200,totalSize:20,data:[{name:'photo.png',url:'/photo.png',size:20}]})}));
  await window.showFileManager();const preview=document.querySelector('.file-manager-preview');
  const pointer=(type,x)=>preview.dispatchEvent(new MouseEvent(type,{button:0,clientX:x,clientY:0,bubbles:true}));
  pointer('pointerdown',0);pointer('pointermove',30);jest.advanceTimersByTime(550);await Promise.resolve();expect(document.querySelector('.resource-preview-overlay')).toBeNull();
  pointer('pointerdown',0);jest.advanceTimersByTime(550);await Promise.resolve();expect(document.querySelector('.resource-preview-overlay img').getAttribute('src')).toBe('/photo.png');
  pointer('pointerup',0);document.querySelector('.resource-preview-overlay .epmd-dialog-close').click();document.querySelector('.file-manager-heading .epmd-dialog-close').click();
 }finally{jest.useRealTimers();}
});
