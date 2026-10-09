/** @jest-environment jsdom */
import { renderInlineImagePreviews } from '../../js/ui/image-inline-tools';
Object.defineProperty(globalThis,'TextDecoder',{configurable:true,value:require('node:util').TextDecoder});
Object.defineProperty(globalThis,'TextEncoder',{configurable:true,value:require('node:util').TextEncoder});
require('../../node_modules/@sunhouyun/vditor/dist/js/lute/lute.min.js');
const lute=(globalThis as any).Lute.New();

it.each(['wysiwyg','ir'])('keeps an inline resized image visible through save/reload in %s',mode=>{
    const markdown='before <img src="/photo.png?a=1&amp;b=2" alt="a &amp; b" style="width:110px;transform:rotate(90deg);"> after';
    const root=document.createElement('div');root.innerHTML=mode==='ir'?lute.Md2VditorIRDOM(markdown):lute.Md2VditorDOM(markdown);
    document.body.replaceChildren(root);renderInlineImagePreviews(root);
    expect(root.querySelector('img')!.getAttribute('src')).toBe('/photo.png?a=1&b=2');expect(root.querySelector('img')!.style.width).toBe('110px');
    const convert=mode==='ir'?lute.VditorIRDOM2Md.bind(lute):lute.VditorDOM2Md.bind(lute);
    const saved=convert(root.innerHTML);expect(saved).toContain('style="width:110px;transform:rotate(90deg);"');expect(saved).toContain('before');expect(saved).toContain(' after');
    root.innerHTML=mode==='ir'?lute.Md2VditorIRDOM(saved):lute.Md2VditorDOM(saved);renderInlineImagePreviews(root);renderInlineImagePreviews(root);
    expect(root.querySelectorAll('img')).toHaveLength(1);expect(root.querySelector('img')!.style.transform).toBe('rotate(90deg)');expect(convert(root.innerHTML)).toBe(saved);
});

it('scales repeatedly using the live image after Vditor replaces its DOM, retaining URL query parameters',async()=>{
    jest.useFakeTimers();document.body.innerHTML='<div id="vditor"><div class="vditor-wysiwyg"></div></div>';
    const surface=document.querySelector<HTMLElement>('.vditor-wysiwyg')!;
    const setValue=(md:string)=>{surface.innerHTML=lute.Md2VditorDOM(md);};
    setValue('before ![photo](/photo.png?a=1&b=2) after');
    (window as any).vditor={getValue:()=>lute.VditorDOM2Md(surface.innerHTML),setValue};
    (window as any).initInlineImageTools();jest.advanceTimersByTime(150);
    jest.spyOn(HTMLImageElement.prototype,'getBoundingClientRect').mockImplementation(function(this:HTMLImageElement){return {width:parseFloat(this.style.width)||200} as DOMRect;});
    surface.querySelector('img')!.click();
    const click=(selector:string)=>document.querySelector<HTMLButtonElement>(selector)!.click();
    click('.epmd-size-plus');expect(surface.querySelector('img')!.style.width).toBe('220px');
    click('.epmd-size-plus');expect(surface.querySelector('img')!.style.width).toBe('242px');
    click('.epmd-size-minus');expect(surface.querySelector('img')!.style.width).toBe('218px');
    expect(surface.querySelector('img')!.getAttribute('src')).toBe('/photo.png?a=1&b=2');
    const saved=(window as any).vditor.getValue();expect(saved).not.toContain('&amp;amp;');
    setValue(saved);await Promise.resolve();jest.advanceTimersByTime(300);expect(surface.querySelector('img')!.style.width).toBe('218px');
    jest.restoreAllMocks();jest.useRealTimers();
});
