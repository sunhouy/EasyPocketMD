/** @jest-environment jsdom */
const {readFileSync}=jest.requireActual('node:fs');
import {useVditorAsyncMath} from '../../scripts/vditor-async-math';

it.each(['index.js','index.min.js','method.js','method.min.js'])('loads MathJax asynchronously in %s', file => {
    const source=readFileSync('node_modules/@sunhouyun/vditor/dist/'+file,'utf8');
    const patched=useVditorAsyncMath(source);
    expect(patched).not.toBe(source);
    expect(patched).toContain('window.__epmdMathJaxReady.then(function(){return window.MathJax.startup.promise;}).then(');
    expect(patched).not.toMatch(/\.U\)\([^;]*tex-svg-full/);
    expect(useVditorAsyncMath(patched)).toBe(patched);
    expect(()=>new Function(patched)).not.toThrow();
});

it('shares an in-flight load and waits for MathJax startup before rendering',async()=>{
    let loaded!:()=>void, started!:()=>void;
    const load=new Promise<void>(resolve=>{loaded=resolve;});
    const startup=new Promise<void>(resolve=>{started=resolve;});
    const module={U:jest.fn(),Z:jest.fn(()=>load)};
    const render=jest.fn();
    const source='(0,m.U)("".concat(options.cdn,"/dist/js/mathjax/tex-svg-full.js"),"protyleMathJaxScript");window.MathJax.startup.promise.then(render);';
    const invoke=new Function('m','options','render',useVditorAsyncMath(source));
    window.MathJax={startup:{promise:startup}};
    delete (window as any).__epmdMathJaxReady;
    invoke(module,{cdn:'/vditor'},render);invoke(module,{cdn:'/vditor'},render);
    expect(module.U).not.toHaveBeenCalled();expect(module.Z).toHaveBeenCalledTimes(1);
    loaded();await Promise.resolve();expect(render).not.toHaveBeenCalled();
    started();await new Promise(resolve=>setTimeout(resolve,0));expect(render).toHaveBeenCalledTimes(2);
    delete (window as any).__epmdMathJaxReady;
});

it('renders a formula through the real Vditor renderer after its script finishes loading',async()=>{
    const source=readFileSync('node_modules/@sunhouyun/vditor/dist/method.js','utf8');
    const exports:any={exports:{}};
    new Function('module','exports',useVditorAsyncMath(source))(exports,exports.exports);
    const renderer=exports.exports;
    document.body.innerHTML='<section><div class="language-math">x^2</div></section>';
    delete (window as any).__epmdMathJaxReady;
    delete (window as any).MathJax;
    const xhr=jest.spyOn(XMLHttpRequest.prototype,'open');
    renderer.mathRender(document.body,{cdn:'/vditor',math:{engine:'MathJax'}});
    const script=document.head.querySelector<HTMLScriptElement>('script[src$="tex-svg-full.js"]')!;
    expect(script).not.toBeNull();expect(xhr).not.toHaveBeenCalled();
    expect(document.querySelector('svg')).toBeNull();
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
    window.MathJax={startup:{promise:Promise.resolve(),document:{clear:jest.fn(),updateDocument:jest.fn()}},getMetricsFor:()=>({}),tex2svgPromise:jest.fn(async()=>svg)};
    script.dispatchEvent(new Event('load'));
    await new Promise(resolve=>setTimeout(resolve,0));
    expect(document.querySelector('.language-math svg')).toBe(svg);
    expect(document.querySelector('.language-math')?.getAttribute('data-math')).toBe('x^2');
    xhr.mockRestore();script.remove();delete (window as any).__epmdMathJaxReady;
});
