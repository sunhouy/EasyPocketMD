/** @jest-environment jsdom */
export {};
beforeAll(()=>{require('../../js/code-runner');});
beforeEach(()=>{window.getApiBaseUrl=()=>'/api';global.fetch=jest.fn();});
it('uses the server endpoint instead of loading a browser Python interpreter',async()=>{
    fetch.mockResolvedValueOnce({ok:true,json:async()=>({success:true,output:'ok',images:[]})});
    const result=await new window.CodeRunner().runPython('print(1)');
    expect(result.success).toBe(true);
    expect(fetch).toHaveBeenCalledWith('/api/code-runner/run',expect.objectContaining({body:JSON.stringify({language:'python',code:'print(1)',interactive:true})}));
});
it('displays matplotlib images with text in the runner panel',async()=>{
    document.body.innerHTML='<pre><code class="language-python">print(1)</code></pre>';
    const code=document.querySelector('code');code.getBoundingClientRect=()=>({top:0,width:300,height:100,right:300});
    fetch.mockResolvedValueOnce({ok:true,json:async()=>({success:true,token:'test-workspace'})});
    fetch.mockResolvedValueOnce({ok:true,json:async()=>({success:true,output:'图表结果',images:[{mime:'image/png',data:'iVBORw0KGgo='}]})});
    window.addRunButtons(document);code.dispatchEvent(new MouseEvent('mousemove',{bubbles:true}));
    document.querySelector('.code-run-button').click();
    await new Promise(resolve=>setTimeout(resolve,0));
    expect(document.querySelector('.code-output').textContent).toContain('图表结果');
    expect(document.querySelector('.code-output img').getAttribute('src')).toBe('data:image/png;base64,iVBORw0KGgo=');
});
