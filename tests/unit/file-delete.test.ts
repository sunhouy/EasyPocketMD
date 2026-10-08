/** @jest-environment jsdom */
import {deletionOwner,resolveDeletionPlan} from '../../js/files/delete-plan';
const plan=[{id:'a',name:'a.md',type:'file'}];
it('accepts a refreshed list and renewed token for the same account',()=>{
    const app={currentUser:{username:'user',token:'old'},files:[{...plan[0]}]};const owner=deletionOwner(app);
    app.files=app.files.map(file=>({...file}));app.currentUser={username:'user',token:'new'};
    expect(resolveDeletionPlan(app,plan,owner)).toEqual(app.files);
});
it('rejects account switches, renamed records and newly added folder contents',()=>{
    const app:any={currentUser:{username:'other'},files:[{...plan[0]}]};
    expect(()=>resolveDeletionPlan(app,plan,'user')).toThrow('账号已切换');
    app.currentUser={username:'user'};app.files[0].name='renamed.md';
    expect(()=>resolveDeletionPlan(app,plan,'user')).toThrow('文件已发生变化');
    app.files=[{id:'folder',name:'folder',type:'folder'},{id:'new',name:'folder/new.md',type:'file'}];
    expect(()=>resolveDeletionPlan(app,[app.files[0]],'user')).toThrow('新增了内容');
});
