export {};
const express=require('express'),request=require('supertest');
jest.mock('../../api/services/python-sandbox',()=>({runPythonSandbox:jest.fn().mockResolvedValue({success:true,output:'ok',images:[]})}));
const {runPythonSandbox}=require('../../api/services/python-sandbox');
const app=express();app.use(express.json({limit:'1mb'}));app.use('/run',require('../../api/routes/code-runner'));
beforeEach(()=>jest.clearAllMocks());
it.each(['python','py'])('dispatches %s to the isolated backend',async language=>{
    const response=await request(app).post('/run/run').send({language,code:'print(1)'});
    expect(response.body).toMatchObject({success:true,output:'ok',images:[]});
    expect(runPythonSandbox).toHaveBeenCalledWith('print(1)',expect.any(AbortSignal));
});
it('rejects oversized code before reserving a container',async()=>{
    const response=await request(app).post('/run/run').send({language:'python',code:'x'.repeat(65537)});
    expect(response.status).toBe(413); expect(runPythonSandbox).not.toHaveBeenCalled();
});
it.each(['c','cpp','c++','java','bash','shell','sh'])('dispatches %s through the same isolated container',async language=>{
    const code=language==='java'?'public class Hello { public static void main(String[] args) { System.out.println("hello"); } }':'echo hello';
    const response=await request(app).post('/run/run').send({language,code});
    expect(response.body.success).toBe(true);
    expect(runPythonSandbox).toHaveBeenCalledWith(code,expect.any(AbortSignal),undefined,[],{language});
});

it.each(['c','cpp','java'])('streams interactive input for %s', async language => {
    runPythonSandbox.mockImplementationOnce(async (code, signal, onInput, files, options) => {
        expect(options.language).toBe(language);
        expect(typeof onInput).toBe('function');
        return {success:true,output:'42',images:[]};
    });
    const response=await request(app).post('/run/run').send({language,code:'source',interactive:true});
    expect(response.headers['content-type']).toContain('application/x-ndjson');
    expect(JSON.parse(response.text.trim())).toMatchObject({type:'result',success:true,output:'42'});
});
it('passes uploaded workspace files to Java', async () => {
    const created=await request(app).post('/run/workspace').send({action:'create'});
    const workspace=created.body.token;
    const uploaded=await request(app).post('/run/files').field('workspace',workspace).attach('files',Buffer.from('hello'),{filename:'data.txt'});
    expect(uploaded.body.success).toBe(true);
    await request(app).post('/run/run').send({language:'java',code:'public class Hello {}',workspace});
    expect(runPythonSandbox).toHaveBeenCalledWith(expect.any(String),expect.any(AbortSignal),undefined,[{name:'data.txt',data:Buffer.from('hello').toString('base64')}],expect.objectContaining({language:'java',workspace:true}));
});
