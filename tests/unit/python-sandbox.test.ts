export {};
const {EventEmitter}=require('events');
const {PassThrough}=require('stream');
jest.mock('child_process',()=>({spawn:jest.fn()}));
const {spawn}=require('child_process');
const {runPythonSandbox}=require('../../api/services/python-sandbox');
let runs=[];
beforeEach(()=>{
    jest.useFakeTimers();runs=[];spawn.mockReset();
    spawn.mockImplementation((command,args)=>{
        const child=new EventEmitter();child.kill=jest.fn();child.stdin=new PassThrough();child.stdout=new PassThrough();child.stderr=new PassThrough();
        if(args[0]==='rm') Promise.resolve().then(()=>child.emit('close',0));
        else runs.push({child,args});
        return child;
    });
});
afterEach(()=>jest.useRealTimers());
function finish(index,value){runs[index].child.stdout.write(JSON.stringify(value));runs[index].child.emit('close',0);}
it('runs code without network, host mounts or secret environment and validates returned PNGs',async()=>{
    const promise=runPythonSandbox("print('hello')");
    expect(runs[0].args).toEqual(expect.arrayContaining(['--network=none','--read-only','--cap-drop=ALL','--memory=512m','--user=65534:65534']));
    expect(runs[0].args.some(arg=>arg==='-v'||arg==='--privileged'||arg==='--env-file')).toBe(false);
    const png=Buffer.from([137,80,78,71,13,10,26,10]).toString('base64');
    finish(0,{success:true,output:'hello',images:[{mime:'image/png',data:png}]});
    expect(await promise).toMatchObject({success:true,images:[{mime:'image/png',data:png}]});
    expect(spawn).toHaveBeenCalledWith('docker',['rm','-f',runs[0].args[runs[0].args.indexOf('--name')+1]],expect.any(Object));
});
it('kills timed-out containers and frees the execution slot',async()=>{
    const first=runPythonSandbox('while True: pass'); const second=runPythonSandbox('while True: pass');
    expect((await runPythonSandbox('print(1)')).status).toBe(429);
    await jest.advanceTimersByTimeAsync(20000);
    expect((await first).status).toBe(408); expect((await second).status).toBe(408);
    const next=runPythonSandbox('print(2)');finish(2,{success:true,output:'2',images:[]});
    expect((await next).success).toBe(true);
});
it('cancels disconnected requests and rejects arbitrary image URLs',async()=>{
    const controller=new AbortController();const request=runPythonSandbox('while True: pass',controller.signal);controller.abort();
    expect((await request).status).toBe(499);
    const bad=runPythonSandbox('print(1)');finish(1,{success:true,output:'',images:[{mime:'image/svg+xml',data:'script'}]});
    expect((await bad).success).toBe(false);
});
it('fails closed when Docker is unavailable',async()=>{
    const request=runPythonSandbox('print(1)');runs[0].child.emit('error',Error('ENOENT'));
    expect((await request).status).toBe(503);expect(spawn.mock.calls.every(call=>call[0]==='docker')).toBe(true);
});
