/** @jest-environment jsdom */
export {};
jest.mock('../../js/code-runner',()=>({}));
it('lazily loads the runner when a Java code block is hovered',async()=>{
    const addRunButtons=jest.fn();
    window.addRunButtons=addRunButtons;
    require('../../js/code-runner-loader');
    window.initCodeRunnerLazyLoad();
    document.body.innerHTML='<pre><code class="language-java">public class Hello {}</code></pre>';
    document.querySelector('code').dispatchEvent(new MouseEvent('mousemove',{bubbles:true}));
    await new Promise(resolve=>setTimeout(resolve,0));
    expect(addRunButtons).toHaveBeenCalledTimes(1);
});
