/** @jest-environment jsdom */
import { selectionContent } from '../../js/main/selection-content';
import { canonicalHistoryHtml, recoverEditorRendering } from '../../js/editor-render-recovery';

Object.defineProperty(globalThis,'TextDecoder',{configurable:true,value:require('node:util').TextDecoder});
Object.defineProperty(globalThis,'TextEncoder',{configurable:true,value:require('node:util').TextEncoder});
require('../../node_modules/@sunhouyun/vditor/dist/js/lute/lute.min.js');
const lute=(globalThis as any).Lute.New();
it('keeps Markdown source unchanged when copying from source mode',()=>{
    document.body.innerHTML='<div id="vditor"><pre></pre></div>';
    document.querySelector('pre')!.textContent='# Heading\n\n$$\nx^2\n$$';
    const range=document.createRange();range.selectNodeContents(document.querySelector('pre')!);
    expect(selectionContent(range,{vditor:{getCurrentMode:()=> 'sv',vditor:{lute}}})).toEqual({text:'# Heading\n\n$$\nx^2\n$$'});
});
it.each(['wysiwyg','ir'])('copies rendered inline/block formulas and tables using the actual Lute serializer in %s mode',mode=>{
    const markdown='$x^2$\n\n$$\ny^2\n$$\n\n| A | B |\n| --- | --- |\n| 1 | 2 |';
    document.body.innerHTML='<div id="vditor">'+(mode==='ir'?lute.Md2VditorIRDOM(markdown):lute.Md2VditorDOM(markdown))+'</div>';
    const app={vditor:{vditor:{lute},getCurrentMode:()=>mode}},range=document.createRange();
    const previews=document.querySelectorAll(`.vditor-${mode}__preview`);
    for(const [index,preview] of Array.from(previews).entries()){
        preview.firstElementChild!.textContent='rendered';range.selectNodeContents(preview.firstElementChild!);
        const content=selectionContent(range,app);expect(content.text).toContain(index===0?'$x^2$':'$$\ny^2\n$$');expect(content.html).not.toContain('vditor-');
    }
    const cells=document.querySelectorAll('td');range.setStart(cells[0].firstChild!,0);range.setEnd(cells[1].firstChild!,1);
    const content=selectionContent(range,app);expect(content.text).toContain('| A | B |');expect(content.text).toContain('| 1 | 2 |');expect(content.html).toContain('<table>');
});
it.each(['wysiwyg','ir'])('stores formula source and reconstructs previews after undo restores HTML in %s mode',mode=>{
    const md='$x^2$\n\n$$\ny^2\n$$';
    const html=mode==='ir'?lute.Md2VditorIRDOM(md):lute.Md2VditorDOM(md);
    const container=document.createElement('div');container.innerHTML=html;
    container.querySelectorAll(`.vditor-${mode}__preview`).forEach(preview=>{preview.firstElementChild!.innerHTML='<span class="katex">rendered</span>';preview.setAttribute('data-render','1');});
    container.insertAdjacentHTML('beforeend','<div class="epmd-code-editor">stale code controls</div>');
    const saved=canonicalHistoryHtml(container.innerHTML,mode);expect(saved).not.toContain('katex');expect(saved).not.toContain('epmd-code-editor');
    expect(mode==='ir'?lute.VditorIRDOM2Md(saved):lute.VditorDOM2Md(saved)).toContain('$x^2$');
    const root=document.createElement('div');root.innerHTML=saved;document.body.replaceChildren(root);
    const mathRender=jest.fn(element=>element.querySelectorAll(`.vditor-${mode}__preview .language-math`).forEach((node:HTMLElement)=>{node.innerHTML='<span class="katex">'+node.textContent+'</span>';}));
    (window as any).Vditor={mathRender};
    recoverEditorRendering({vditor:{currentMode:mode,[mode]:{element:root},options:{}}});
    expect(mathRender).toHaveBeenCalledTimes(1);expect(root.querySelectorAll('.katex')).toHaveLength(2);
    delete (window as any).Vditor;
});
