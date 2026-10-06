export {};
jest.mock('../../api/config/db',()=>({execute:jest.fn()}));
let db:any, api:any;
beforeEach(()=>{jest.resetModules();db=require('../../api/config/db');api=require('../../api/models/FileOrders');db.execute.mockResolvedValue([[]]);});
it('saves sibling metadata in one atomic parameterized statement without writing document content',async()=>{
    await api.setFileOrders('user',{'folder/a.md':20,'folder/b.md':10});
    expect(db.execute).toHaveBeenLastCalledWith(expect.stringContaining('ON DUPLICATE KEY UPDATE sort_order'),['user','folder/a.md',20,'user','folder/b.md',10]);
    expect(db.execute.mock.calls.flat().join(' ')).not.toContain('UPDATE user_files');
});
it('loads only the authenticated account metadata',async()=>{
    db.execute.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{filename:'a.md',sort_order:10}]]);
    expect(await api.getFileOrders('user')).toEqual({'a.md':10});
    expect(db.execute).toHaveBeenLastCalledWith(expect.stringContaining('WHERE username = ?'),['user']);
});
it('migrates legacy JSON into metadata without document conflicts or history writes',async()=>{
    db.execute.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{content:'{"a.md":10}'}]]).mockResolvedValueOnce([[]]);
    expect(await api.getFileOrders('user')).toEqual({'a.md':10});
    expect(db.execute.mock.calls.at(-1)[0]).toContain('INSERT INTO user_file_orders');
});
