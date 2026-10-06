/** @jest-environment jsdom */
import {installNotesHome,visibleNotes,notePreview} from '../../js/files/notes-home';
const files=[
    {id:'old',type:'file',name:'old.md',content:'旧笔记',lastModified:1},
    {id:'folder',type:'folder',name:'学习',lastModified:2},
    {id:'note',type:'file',name:'学习/新笔记.md',content:'# 标题\n正文内容',lastModified:10},
    {id:'sub',type:'folder',name:'学习/子目录'},
    {id:'nested',type:'file',name:'学习/子目录/嵌套.md',content:'完整文档'+'.'.repeat(300)+'深处的关键词',lastModified:5},
];
let app:any,render:()=>void,tree:any;
beforeEach(()=>{
    document.body.innerHTML='<div id="fileListSidebar"></div>';
    document.body.className='file-management-mode';
    tree={get_node:jest.fn(id=>({id})),show_contextmenu:jest.fn()};
    app={files:files.map(file=>({...file})),openFile:jest.fn(),showSettingsDialog:jest.fn(),showLoginModal:jest.fn(),showUserInfo:jest.fn(),handleLoginButtonClick:jest.fn(),$:()=>({jstree:()=>tree})};
    render=installNotesHome(app).render;render();
});
afterEach(()=>jest.useRealTimers());
it('shows all files including nested notes by most recent modification',()=>{
    expect([...document.querySelectorAll('.notes-file-card')].map(card=>(card as HTMLElement).dataset.fileId)).toEqual(['note','nested','old']);
    expect(document.querySelector('time').getAttribute('datetime')).toBe(new Date(10).toISOString());
});
it('opens files and preserves account and settings actions',()=>{
    (document.querySelector('.notes-file-card') as HTMLElement).click();expect(app.openFile).toHaveBeenCalledWith('note');
    const tools=document.querySelectorAll<HTMLButtonElement>('.notes-home-tools button');
    tools[0].click();expect(app.handleLoginButtonClick).toHaveBeenCalledTimes(1);app.currentUser={};tools[0].click();expect(app.handleLoginButtonClick).toHaveBeenCalledTimes(2);
    tools[1].click();expect(app.showSettingsDialog).toHaveBeenCalled();
});
it('filters folder contents and routes creation to the selected directory',()=>{
    (document.querySelector('.notes-folder-tab[data-file-id="folder"]') as HTMLElement).click();
    expect(app.notesHomeFolder).toBe('学习');
    expect(document.querySelectorAll('.notes-file-card')).toHaveLength(1);
    expect(document.querySelector('.notes-folder-card').textContent).toContain('子目录');
    (document.querySelector('.notes-folder-card') as HTMLElement).click();expect(app.notesHomeFolder).toBe('学习/子目录');
    (document.querySelector('.notes-folder-tab') as HTMLElement).click();expect(app.notesHomeFolder).toBe('');expect(document.querySelectorAll('.notes-file-card')).toHaveLength(3);
});
it('searches beyond the visible snippet and keeps user text safe',()=>{
    expect(visibleNotes(files,null,'深处的关键词').map(file=>file.id)).toEqual(['nested']);
    app.files[0].content='<img src=x onerror="alert(1)">安全内容';render();
    expect(document.querySelector('.notes-home-grid img')).toBeNull();
    expect(notePreview(app.files[0].content)).toBe('安全内容');
    expect(visibleNotes([{id:'encrypted',type:'file',name:'密文',content:'EPMD2:secret'}],null,'secret')).toEqual([]);
});
it('uses the existing menu for files and folder names',()=>{
    const card=document.querySelector<HTMLElement>('.notes-file-card');card.querySelector<HTMLButtonElement>('.notes-card-menu').click();
    expect(tree.show_contextmenu).toHaveBeenCalledWith({id:'note'},expect.any(Number),expect.any(Number));expect(app.openFile).not.toHaveBeenCalled();
    document.querySelector('.notes-folder-tab[data-file-id="folder"]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:20,clientY:40}));
    expect(tree.show_contextmenu).toHaveBeenLastCalledWith({id:'folder'},20,40);
});
it('returns to all notes if the current folder was removed by synchronization',()=>{
    (document.querySelector('.notes-folder-tab[data-file-id="folder"]') as HTMLElement).click();
    app.files=app.files.filter((file:any)=>file.id!=='folder');render();expect(app.notesHomeFolder).toBe('');expect(document.querySelectorAll('.notes-file-card')).toHaveLength(3);
});
it('debounces search and does not replace its focused input when files refresh',()=>{
    jest.useFakeTimers();const input=document.querySelector<HTMLInputElement>('#notesHomeSearch');input.focus();input.value='旧笔记';input.dispatchEvent(new Event('input'));
    jest.advanceTimersByTime(120);expect(document.querySelectorAll('.notes-file-card')).toHaveLength(1);expect(document.activeElement).toBe(input);
});
it('leaves the sidebar tree view untouched while editing',()=>{
    document.body.classList.remove('file-management-mode');app.files=[];render();
    expect(document.querySelectorAll('.notes-file-card')).toHaveLength(3);
});
it('loads cloud snippets on isolated snapshots without changing canonical files',async()=>{
    document.getElementById('fileListSidebar').replaceChildren();
    const cloud:any={id:'cloud',type:'file',name:'云端.md',contentLoaded:false,lastModified:20};app.files=[cloud];app.currentUser={username:'user'};
    const loadContent=jest.fn(async copy=>{copy.content='远端内容';copy.crdtBaseContent='远端内容';return '远端内容';});
    const home=installNotesHome(app,{loadContent,needsContent:file=>file.contentLoaded===false});home.render();
    await new Promise(resolve=>setTimeout(resolve,0));
    expect(document.querySelector('.notes-file-preview').textContent).toBe('远端内容');
    expect(cloud.content).toBeUndefined();expect(cloud.crdtBaseContent).toBeUndefined();expect(loadContent).toHaveBeenCalledTimes(1);
});
it('opens the original menu on touch long press and suppresses opening the file',()=>{
    jest.useFakeTimers();const card=document.querySelector<HTMLElement>('.notes-file-card');
    const down=new Event('pointerdown',{bubbles:true});Object.assign(down,{pointerType:'touch',button:0,clientX:20,clientY:40});card.dispatchEvent(down);
    jest.advanceTimersByTime(550);expect(tree.show_contextmenu).toHaveBeenCalledWith({id:'note'},20,40);
    card.click();expect(app.openFile).not.toHaveBeenCalled();
});
it('never displays or searches locked plaintext and does not request an unlock',()=>{
    app.files=[{id:'locked',type:'file',name:'私密.md',content:'不能泄露的正文',e2e_enabled:1}];
    app.E2EVault={state:()=>({config:{},unlocked:false})};render();
    expect(document.querySelector('.notes-file-preview').textContent).toBe('加密文件');
    const search=document.querySelector<HTMLInputElement>('#notesHomeSearch');search.value='不能泄露';render();expect(document.querySelectorAll('.notes-file-card')).toHaveLength(0);
});
