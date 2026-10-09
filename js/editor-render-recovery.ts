/** History stores source-only previews, never CodeMirror UI or live renderer instances. */
export function canonicalHistoryHtml(html:string,mode:string):string {
    if(mode==='sv')return html;
    const container=document.createElement('div');container.innerHTML=html;
    container.querySelectorAll('.epmd-code-editor').forEach(host=>host.remove());
    container.querySelectorAll<HTMLElement>('[data-type="code-block"],[data-type="math-block"],[data-type="math-inline"],[data-type="inline-node"]').forEach(block=>{
        const preview=block.querySelector<HTMLElement>(`.vditor-${mode}__preview`);
        const source=block.querySelector<HTMLElement>('pre > code,code[data-type="math-inline"],.vditor-wysiwyg__pre,.vditor-ir__marker--pre');
        if(!preview || !source)return;
        const code=block.dataset.type==='code-block' ? source.cloneNode(true) : document.createElement(block.dataset.type==='math-block'?'div':'span');
        if(block.dataset.type!=='code-block'){
            (code as HTMLElement).className='language-math';code.textContent=source.textContent?.replace(/\u200b/g,'') || '';
        }
        preview.replaceChildren(code);preview.dataset.render='2';
        block.classList.remove('epmd-custom-code-block');
    });
    return container.innerHTML;
}

/** Recreate formula previews from their source after Vditor restores history HTML. */
export function recoverEditorRendering(instance:any) {
    const internal=instance?.vditor,mode=internal?.currentMode;
    if(mode==='sv')return;
    const root=internal?.[mode]?.element as HTMLElement | undefined;
    if(!root)return;
    let math=false;
    root.querySelectorAll<HTMLElement>('[data-type="math-block"],[data-type="math-inline"],[data-type="inline-node"]').forEach(block=>{
        const preview=block.querySelector<HTMLElement>(`.vditor-${mode}__preview`);
        const source=block.querySelector('code[data-type="math-inline"],pre > code') || Array.from(block.children).find(child=>child!==preview && (child.classList.contains('vditor-wysiwyg__pre') || child.classList.contains('vditor-ir__marker--pre')));
        if(!preview || !source)return;
        const existing=preview.firstElementChild;
        const sourceText=source.textContent?.replace(/\u200b/g,'') || '';
        // The native undo renderer already scheduled this node. Replacing it before
        // KaTeX's script promise settles leaves the renderer with a detached node.
        if(preview.dataset.render==='1' && existing?.classList.contains('language-math')
            && (existing.getAttribute('data-math')===sourceText || existing.textContent===sourceText))return;
        const code=document.createElement(block.dataset.type==='math-block'?'div':'span');code.className='language-math';
        code.textContent=sourceText;
        preview.replaceChildren(code);preview.dataset.render='2';math=true;
    });
    if(math){
        (window as any).Vditor?.mathRender?.(root,{cdn:internal.options?.cdn,math:internal.options?.preview?.math});
    }
    (window as any).attachCodeBlockEditors?.(instance,document.getElementById('vditor') || root);
}
