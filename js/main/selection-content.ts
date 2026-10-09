import type { ClipboardContent } from '../clipboard';
/** Copy canonical Markdown rather than rendered formula text, canvas labels or editor widgets. */
export function selectionContent(range: Range, app: any): ClipboardContent {
    if(app.vditor?.getCurrentMode?.()==='sv')return {text:range.toString()};
    const copyRange=range.cloneRange();
    const element=(node:Node)=>node instanceof Element?node:node.parentElement;
    const firstCell=element(range.startContainer)?.closest('td,th'),lastCell=element(range.endContainer)?.closest('td,th');
    if(firstCell && lastCell && firstCell!==lastCell && firstCell.closest('table')===lastCell.closest('table'))copyRange.selectNode(firstCell.closest('table')!);
    const preview=(node:Node)=>element(node)?.closest('.vditor-wysiwyg__preview,.vditor-ir__preview');
    const start=preview(range.startContainer),end=preview(range.endContainer);
    const structuredParent=(node:Element | null | undefined)=>node?.matches('[data-type="code-block"],[data-type="math-block"],[data-type="math-inline"]') || node?.querySelector('code[data-type="math-inline"]');
    if(structuredParent(start?.parentElement))copyRange.setStartBefore(start!.parentElement!);
    if(structuredParent(end?.parentElement))copyRange.setEndAfter(end!.parentElement!);
    const container=document.createElement('div');container.append(copyRange.cloneContents());
    container.querySelectorAll('.epmd-code-editor,.vditor-copy,script,style,wbr').forEach(node=>node.remove());
    const lute=app.vditor?.vditor?.lute;
    let text=range.toString();
    const convert=app.vditor?.getCurrentMode?.()==='ir' ? lute?.VditorIRDOM2Md : lute?.VditorDOM2Md;
    if(element(range.commonAncestorContainer)?.closest('#vditor') && convert) text=convert.call(lute,container.innerHTML).trim();
    const structured=!!container.querySelector('table,[data-type="math-inline"],[data-type="math-block"],[data-type="code-block"],.language-math,img');
    if(!structured)return {text};
    // Render from Markdown so rich clipboard HTML contains no editor controls or hidden source.
    const html=lute?.Md2HTML ? lute.Md2HTML(text) : container.innerHTML;
    return {text,html};
}
