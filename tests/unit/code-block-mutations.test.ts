/** @jest-environment jsdom */
import { affectsCodeBlocks } from '../../js/code-block-mutations';
it('ignores prose typing and caret changes while retaining code, mode and theme updates', () => {
 document.body.innerHTML='<div class="vditor"><div contenteditable="true"><p>text</p><div data-type="code-block"><pre><code>code</code></pre><div class="epmd-code-editor"><span>caret</span></div></div></div></div>';
 const record=(target:Node,type='characterData',addedNodes:Node[]=[],removedNodes:Node[]=[],attributeName:string|null=null)=>({target,type,addedNodes,removedNodes,attributeName} as unknown as MutationRecord);
 expect(affectsCodeBlocks(record(document.querySelector('p')!.firstChild!))).toBe(false);
 expect(affectsCodeBlocks(record(document.querySelector('.epmd-code-editor span')!,'attributes',[],[],'class'))).toBe(false);
 expect(affectsCodeBlocks(record(document.querySelector('code')!.firstChild!))).toBe(true);
 expect(affectsCodeBlocks(record(document.body,'attributes',[],[],'class'))).toBe(true);
 expect(affectsCodeBlocks(record(document.querySelector('[contenteditable]')!,'attributes',[],[],'contenteditable'))).toBe(true);
 expect(affectsCodeBlocks(record(document.querySelector('[contenteditable]')!,'childList',[],[document.querySelector('[data-type=code-block]')!]))).toBe(true);
 expect(affectsCodeBlocks(record(document.querySelector('p')!,'childList',[document.createTextNode('input')]))).toBe(false);
});
