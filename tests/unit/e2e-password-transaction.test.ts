// @ts-nocheck
export {};
jest.mock('../../api/config/db',()=>({getConnection:jest.fn(),execute:jest.fn()}));
const db=require('../../api/config/db'), user=require('../../api/models/User');
beforeEach(()=>{jest.spyOn(user,'verifyPassword').mockResolvedValue(true);jest.spyOn(user,'encryptPassword').mockResolvedValue('new-hash');});
it('commits the login-password wrapper and account password in one transaction',async()=>{
    const conn={beginTransaction:jest.fn(),execute:jest.fn().mockResolvedValueOnce([[{password:'old-hash'}]]).mockResolvedValueOnce([{affectedRows:1}]).mockResolvedValueOnce([{}]),commit:jest.fn(),rollback:jest.fn(),release:jest.fn()};
    db.getConnection.mockResolvedValue(conn);
    const patch={config:{methods:{login:'wrapped'}},revision:4};
    const result=await user.changePassword('alice','old','new',patch);
    expect(result.code).toBe(200);
    expect(conn.execute.mock.calls[1]).toEqual([expect.stringContaining('e2e_vaults'),[JSON.stringify(patch.config),'alice',4]]);
    expect(conn.execute.mock.calls[2]).toEqual(['UPDATE users SET password = ? WHERE username = ?',['new-hash','alice']]);
    expect(conn.commit).toHaveBeenCalled();expect(conn.rollback).not.toHaveBeenCalled();
});
it('does not update the account password when a concurrent vault update wins',async()=>{
    const conn={beginTransaction:jest.fn(),execute:jest.fn().mockResolvedValueOnce([[{password:'old-hash'}]]).mockResolvedValueOnce([{affectedRows:0}]),commit:jest.fn(),rollback:jest.fn(),release:jest.fn()};
    db.getConnection.mockResolvedValue(conn);
    expect((await user.changePassword('alice','old','new',{config:{},revision:4})).code).toBe(409);
    expect(conn.execute).toHaveBeenCalledTimes(2);expect(conn.rollback).toHaveBeenCalled();expect(conn.commit).not.toHaveBeenCalled();
});

it('rejects an account password change if login-password encryption was concurrently enabled',async()=>{
    const conn={beginTransaction:jest.fn(),execute:jest.fn().mockResolvedValueOnce([[{password:'old-hash'}]]).mockResolvedValueOnce([[{config_json:JSON.stringify({methods:{login:'wrapped'}}),revision:2}]]),commit:jest.fn(),rollback:jest.fn(),release:jest.fn()};
    db.getConnection.mockResolvedValue(conn);
    expect((await user.changePassword('alice','old','new',null,true)).code).toBe(409);
    expect(conn.execute.mock.calls[1][0]).toContain('FOR UPDATE');expect(conn.execute).toHaveBeenCalledTimes(2);expect(conn.rollback).toHaveBeenCalled();
});
