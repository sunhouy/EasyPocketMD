// @ts-nocheck
export {};
const express=require('express'), request=require('supertest');
jest.mock('../../api/config/db',()=>({execute:jest.fn(),getConnection:jest.fn()}));
jest.mock('../../api/models/User',()=>({}));
jest.mock('../../api/utils/auth',()=>({verifyTokenOrPassword:jest.fn(async (_,body)=>({code:body.token===body.username+'-token'?200:401}))}));
const db=require('../../api/config/db');
const {validConfig}=require('../../api/utils/e2e-vault');
const router=require('../../api/routes/e2e');
const app=express();app.use(express.json());app.use('/e2e',router);
const box={salt:Buffer.alloc(16).toString('base64'),iv:Buffer.alloc(12).toString('base64'),data:Buffer.alloc(80).toString('base64')};
const config={version:2,ttlSeconds:900,methods:{login:box,dedicated:box},check:box};
beforeEach(()=>{db.execute.mockReset();db.execute.mockResolvedValue([[]]);});
const post=(path,body={})=>request(app).post('/e2e/'+path).send({username:'alice',token:'alice-token',...body});
it('validates wrapped-key-only configs and requires at least one unlock method',()=>{
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
it('removes every pairing endpoint',async()=>{
    for(const path of ['pair/create','pair/find','pair/approve','pair/consume']) expect((await post(path)).status).toBe(404);
});
it('reads legacy configs without exposing retired OTP and rejects it in new writes',async()=>{
    db.execute.mockResolvedValueOnce([[{config_json:JSON.stringify({...config,otp:true}),revision:4}]]);
    const response=await post('config'); expect(response.body.data).toEqual({config,revision:4});
    const save=await post('config/save',{config:{...config,otp:true},revision:4});
    expect(save.status).toBe(400);expect(save.body.message_key).toBe('e2eInvalidConfig');
});
