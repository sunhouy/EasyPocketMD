import { createTreeSelectionRestorer } from '../../js/files/tree/selection';
it('restores the editor selection without recursively toggling the same node',()=>{
    const guard=createTreeSelectionRestorer();const selected=new Set<string>();let events=0;
    const tree={get_node:()=>true,deselect_node:jest.fn(),select_node:(id:string)=>handler(id)};
    function handler(id:string){events++;if(guard.isRestoring())return;selected.add(id);guard.restore(tree,id,'current');}
    handler('other');expect(events).toBe(2);expect([...selected]).toEqual(['other']);expect(guard.isRestoring()).toBe(false);
    handler('current');expect(events).toBe(4);expect([...selected]).toEqual(['other','current']);
});
it('releases its guard even when selection restoration fails',()=>{
    const guard=createTreeSelectionRestorer();expect(()=>guard.restore({deselect_node:()=>{throw Error('gone');}},'a')).toThrow('gone');expect(guard.isRestoring()).toBe(false);
});
