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
it.each(['java','bash','shell','sh'])('dispatches %s through the same isolated container',async language=>{
    const code=language==='java'?'public class Hello { public static void main(String[] args) { System.out.println("hello"); } }':'echo hello';
    const response=await request(app).post('/run/run').send({language,code});
    expect(response.body.success).toBe(true);
    expect(runPythonSandbox).toHaveBeenCalledWith(code,expect.any(AbortSignal),undefined,[],{language});
});
