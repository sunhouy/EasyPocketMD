// @ts-nocheck
export {};
const express=require('express'), request=require('supertest'), crypto=require('node:crypto');
jest.mock('../../api/config/db',()=>({execute:jest.fn(),getConnection:jest.fn()}));
jest.mock('../../api/models/User',()=>({}));
jest.mock('../../api/utils/auth',()=>({verifyTokenOrPassword:jest.fn(async (_,body)=>({code:body.token===body.username+'-token'?200:401}))}));
const db=require('../../api/config/db');
const {validConfig}=require('../../api/utils/e2e-vault');
const router=require('../../api/routes/e2e');
const app=express();app.use(express.json());app.use('/e2e',router);
const box={salt:Buffer.alloc(16).toString('base64'),iv:Buffer.alloc(12).toString('base64'),data:Buffer.alloc(80).toString('base64')};
const config={version:2,ttlSeconds:900,otp:true,methods:{login:box,dedicated:box},check:box};
beforeEach(()=>{db.execute.mockReset();db.execute.mockResolvedValue([[]]);});
const post=(path,body={})=>request(app).post('/e2e/'+path).send({username:'alice',token:'alice-token',...body});
it('validates wrapped-key-only configs and forbids an unrecoverable OTP-only config',()=>{
    expect(validConfig(config)).toBe(true);
    expect(validConfig({...config,methods:{}})).toBe(false);
    expect(validConfig({...config,master:'plaintext'})).toBe(false);
    expect(validConfig({...config,check:{...box,secret:'plaintext'}})).toBe(false);
    expect(validConfig({...config,ttlSeconds:0})).toBe(false);
});
it('requires matching account authentication before any database access',async()=>{
    expect((await post('config',{token:'bob-token'})).status).toBe(401);
    expect(db.execute).not.toHaveBeenCalled();
    expect((await post('config',{token:''})).status).toBe(401);
});
it('returns revision conflicts instead of silently overwriting newer method settings',async()=>{
    // Schema initialization is lazy on first authenticated request.
    await post('config');
    db.execute.mockResolvedValueOnce([{affectedRows:0}]);
    expect((await post('config/save',{config,revision:3})).status).toBe(409);
    expect(db.execute).toHaveBeenLastCalledWith(expect.stringContaining('AND revision = ?'),[JSON.stringify(config),'alice',3]);
});
it('scopes an OTP lookup to the authenticated account, rejects invalid codes and hides expired requests',async()=>{
    expect((await post('pair/find',{code:'bad'})).status).toBe(400);
    db.execute.mockResolvedValueOnce([[]]);
    expect((await post('pair/find',{code:'12345678'})).status).toBe(404);
    expect(db.execute).toHaveBeenLastCalledWith(expect.stringContaining('expires_at > ?'),['alice',expect.any(String),expect.any(Number)]);
});
it('requires OTP enabled and accepts only RSA-3072 encryption public keys',async()=>{
    db.execute.mockResolvedValueOnce([[{config_json:JSON.stringify({...config,otp:false})}]]);
    expect((await post('pair/create',{publicKey:'invalid'})).status).toBe(403);
    db.execute.mockResolvedValueOnce([[{config_json:JSON.stringify(config)}]]);
    const key=crypto.generateKeyPairSync('rsa',{modulusLength:2048}).publicKey.export({type:'spki',format:'der'}).toString('base64');
    expect((await post('pair/create',{publicKey:key})).status).toBe(400);
});
it('atomically consumes a result with an account-and-secret-scoped row lock',async()=>{
    const conn={beginTransaction:jest.fn(),execute:jest.fn().mockResolvedValueOnce([[{ciphertext:'sealed'}]]).mockResolvedValueOnce([{}]),commit:jest.fn(),rollback:jest.fn(),release:jest.fn()};
    db.getConnection.mockResolvedValue(conn);
    const res=await post('pair/consume',{id:'a'.repeat(32),secret:'b'.repeat(64)});
    expect(res.body.data.ciphertext).toBe('sealed');
    expect(conn.execute.mock.calls[0][0]).toContain('FOR UPDATE');
    expect(conn.execute.mock.calls[0][1][1]).toBe('alice');
    expect(conn.execute.mock.calls[1]).toEqual(['DELETE FROM e2e_pairings WHERE id = ?',['a'.repeat(32)]]);
    expect(conn.commit).toHaveBeenCalled();expect(conn.release).toHaveBeenCalled();
});
it('does not return an expired or already consumed request',async()=>{
    const conn={beginTransaction:jest.fn(),execute:jest.fn().mockResolvedValueOnce([[]]),commit:jest.fn(),rollback:jest.fn(),release:jest.fn()};
    db.getConnection.mockResolvedValue(conn);
    expect((await post('pair/consume',{id:'a'.repeat(32),secret:'b'.repeat(64)})).status).toBe(410);
    expect(conn.execute).toHaveBeenCalledTimes(1);
});
