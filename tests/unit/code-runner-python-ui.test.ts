/** @jest-environment jsdom */
export {};
function response(data: unknown): Response {
    return {ok:true, status:200, statusText:'OK', url:'', redirected:false, type:'basic', headers:new Headers(), body:null, bodyUsed:false,
        json:async()=>data, text:async()=>JSON.stringify(data), arrayBuffer:async()=>new ArrayBuffer(0), blob:async()=>new Blob(), bytes:async()=>new Uint8Array(), formData:async()=>new FormData(), clone(){return response(data)}};
}
beforeAll(()=>{require('../../js/code-runner');});
beforeEach(()=>{window.getApiBaseUrl=()=>'/api';global.fetch=jest.fn();});
it('uses the server endpoint instead of loading a browser Python interpreter',async()=>{
    jest.mocked(fetch).mockResolvedValueOnce(response({success:true,output:'ok',images:[]}));
    const result=await new window.CodeRunner().runPython('print(1)');
    expect(result.success).toBe(true);
    expect(fetch).toHaveBeenCalledWith('/api/code-runner/run',expect.objectContaining({body:JSON.stringify({language:'python',code:'print(1)',interactive:true})}));
});
it('displays matplotlib images with text in the runner panel',async()=>{
    document.body.innerHTML='<pre><code class="language-python">print(1)</code></pre>';
    const code=document.querySelector('code');code.getBoundingClientRect=()=>new DOMRect(0,0,300,100);
    jest.mocked(fetch).mockResolvedValueOnce(response({success:true,token:'test-workspace'}));
    jest.mocked(fetch).mockResolvedValueOnce(response({success:true,output:'图表结果',images:[{mime:'image/png',data:'iVBORw0KGgo='}]}));
    window.addRunButtons(document);code.dispatchEvent(new MouseEvent('mousemove',{bubbles:true}));
    (document.querySelector('.code-run-button') as HTMLElement).click();
    await new Promise(resolve=>setTimeout(resolve,0));
    expect(document.querySelector('.code-output').textContent).toContain('图表结果');
    expect(document.querySelector('.code-output img').getAttribute('src')).toBe('data:image/png;base64,iVBORw0KGgo=');
});
it('shows and copies Chinese error guidance without a Chinese explanation label',async()=>{
    document.querySelector('body > pre')?.remove();
    document.body.insertAdjacentHTML('afterbegin','<pre><code class="language-python">print(missing)</code></pre>');
    const code=document.querySelector('code');code.getBoundingClientRect=()=>new DOMRect(0,0,300,100);
    jest.mocked(fetch).mockImplementation(async(url)=>String(url).endsWith('/run')
        ?response({success:false,error:"NameError: name 'missing' is not defined"})
        :response({success:true,token:'error-workspace'}));
    const writeText=jest.fn(async(_text: string)=>{});
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText}});
    window.addRunButtons(document);code.dispatchEvent(new MouseEvent('mousemove',{bubbles:true}));
    (document.querySelector('.code-run-button') as HTMLElement).click();
    await new Promise(resolve=>setTimeout(resolve,0));
    const output=document.querySelector('.code-output');
    expect(output.textContent).toContain('“missing”');
    expect(output.textContent).toContain("NameError: name 'missing' is not defined");
    expect(output.textContent).not.toContain('中文解释');
    (output.querySelector('[title="复制运行结果"]') as HTMLElement).click();
    await new Promise(resolve=>setTimeout(resolve,0));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('“missing”'));
    expect(writeText.mock.calls[0][0]).not.toContain('中文解释');
});
it.each(['c','cpp','c++','java','bash','shell','sh'])('sends %s code to the sandbox endpoint',async language=>{
    jest.mocked(fetch).mockImplementation(async()=>response({success:true,output:'hello',images:[]}));
    expect((await new window.CodeRunner().runCode(language,'source code')).success).toBe(true);
    const call=jest.mocked(fetch).mock.calls.find(([url])=>String(url).endsWith('/run'));
    expect(JSON.parse(call[1].body as string)).toMatchObject({language,code:'source code'});
});

it.each(['java','bash','shell','sh'])('offers a run button and current-language help for %s',async language=>{
    document.querySelector('body > pre')?.remove();
    document.body.insertAdjacentHTML('afterbegin',`<pre><code class="language-${language}">source code</code></pre>`);
    const code=document.querySelector('body > pre code');code.getBoundingClientRect=()=>new DOMRect(0,0,300,100);
    jest.mocked(fetch).mockImplementation(async url=>String(url).endsWith('/run')?response({success:true,output:'hello',images:[]}):response({success:true,token:'native-workspace'}));
    window.addRunButtons(document);code.dispatchEvent(new MouseEvent('mousemove',{bubbles:true}));
    (document.querySelector('.code-run-button') as HTMLElement).click();
    await new Promise(resolve=>setTimeout(resolve,0));
    (document.querySelector('[title="运行方式与环境"]') as HTMLElement).click();
    const help=document.querySelector('.code-output').textContent;
    expect(help).toContain('支持的语言：');
    expect(help).not.toContain('Python 3.12');
    expect(help).toContain(language==='java'?'Scanner':'read 等命令');
});
