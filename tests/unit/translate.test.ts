import express from 'express';
import request from 'supertest';
const router = require('../../api/routes/translate');
const app=express();app.use(express.json());app.use('/translate',router);
const originalFetch=global.fetch;
beforeEach(()=>{process.env.TENCENT_SECRET_ID='test-id';process.env.TENCENT_SECRET_KEY='test-key';});
afterEach(()=>{global.fetch=originalFetch;delete process.env.TENCENT_SECRET_ID;delete process.env.TENCENT_SECRET_KEY;});
it('validates UTF-8 byte limits and target before calling Tencent', async()=>{
    const fetch=jest.fn();global.fetch=fetch;
    expect((await request(app).post('/translate').send({text:'中'.repeat(2001),target:'en'})).status).toBe(400);
    expect((await request(app).post('/translate').send({text:'hello',target:'unknown'})).status).toBe(400);expect(fetch).not.toHaveBeenCalled();
});
it('signs a server-side auto-detect translation and only returns translated text', async()=>{
    const fetch=jest.fn().mockResolvedValue({ok:true,json:async()=>({Response:{TargetText:'你好',Source:'en',RequestId:'private'}})});global.fetch=fetch;
    const result=await request(app).post('/translate').send({text:'Hello',target:'zh'});
    expect(result.status).toBe(200);expect(result.body).toEqual({success:true,data:{text:'你好',source:'en',target:'zh'}});
    const [url,options]=fetch.mock.calls[0];expect(url).toBe('https://tmt.tencentcloudapi.com');expect(JSON.parse(options.body)).toEqual({SourceText:'Hello',Source:'auto',Target:'zh',ProjectId:0});
    expect(options.headers.Authorization).toMatch(/^TC3-HMAC-SHA256 Credential=test-id\/\d{4}-\d{2}-\d{2}\/tmt\/tc3_request, SignedHeaders=content-type;host, Signature=[a-f0-9]{64}$/);
    expect(JSON.stringify(result.body)).not.toMatch(/test-key|test-id|private/);
});
it('reports missing configuration and upstream errors without exposing credentials', async()=>{
    delete process.env.TENCENT_SECRET_KEY;expect((await request(app).post('/translate').send({text:'Hello',target:'zh'})).status).toBe(503);
    process.env.TENCENT_SECRET_KEY='test-key';global.fetch=jest.fn().mockResolvedValue({ok:true,json:async()=>({Response:{Error:{Code:'AuthFailure',Message:'sensitive'}}})});
    const result=await request(app).post('/translate').send({text:'Hello',target:'zh'});expect(result.status).toBe(502);expect(JSON.stringify(result.body)).not.toMatch(/sensitive|test-key/);
});
