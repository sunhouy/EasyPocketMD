/** A background list refresh is allowed; a different account or renamed target is not. */
export function deletionOwner(app:any):string {
    return app.currentUser ? String(app.currentUser.id ?? app.currentUser.username) : '';
}
export function resolveDeletionPlan(app:any,plan:Array<{id:string;name:string;type:string}>,owner:string,allowMissing=false):any[] {
    if(deletionOwner(app)!==owner)throw Error('账号已切换，请重新选择要删除的文件');
    const files=app.files || [];
    const items=plan.map(target=>{
        const item=files.find((file:any)=>String(file.id)===String(target.id));
        if(!item && allowMissing)return null;
        if(!item || item.name!==target.name || item.type!==target.type)throw Error('文件已发生变化，请重新确认删除');
        return item;
    }).filter(Boolean);
    const ids=new Set(plan.map(item=>String(item.id)));
    if(files.some((file:any)=>!ids.has(String(file.id)) && plan.some(item=>item.type==='folder' && file.name.startsWith(item.name+'/'))))
        throw Error('文件夹新增了内容，请重新确认删除');
    return items;
}
