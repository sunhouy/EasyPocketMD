/** @jest-environment jsdom */
jest.mock('@codemirror/language-data', () => ({languages:[]}));

it('copies formula and chart sources from their visible buttons when Clipboard API access is denied', async () => {
    const frames: FrameRequestCallback[]=[];
    jest.spyOn(window,'requestAnimationFrame').mockImplementation(callback=>{frames.push(callback);return frames.length;});
    const writeText=jest.fn().mockRejectedValue(new Error('NotAllowedError'));
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText}});
    const sources=[['math','x^2 + y^2 = z^2'],['mermaid','graph TD\nA-->B'],['echarts','{"series":[{"type":"bar","data":[1,2]}]}']];
    document.body.innerHTML='<div id="vditor"><div contenteditable="true"></div></div>';
    const root=document.getElementById('vditor')!,surface=root.firstElementChild as HTMLElement;
    for(const [language,text] of sources){
        const block=document.createElement('div');block.dataset.type='code-block';
        const pre=document.createElement('pre'),code=document.createElement('code');code.className='language-'+language;code.textContent=text;pre.append(code);
        const preview=document.createElement('div');preview.className='vditor-wysiwyg__preview';block.append(pre,preview);surface.append(block);
    }
    const showMessage=jest.fn();window.showMessage=showMessage;
    const instance={vditor:{currentMode:'wysiwyg',wysiwyg:{element:surface},options:{}},getCurrentMode:()=> 'wysiwyg'};
    (window as any).vditor=instance;
    const {registerCodeBlockEditors}=require('../../js/code-block-editor');registerCodeBlockEditors(instance,root);
    frames.shift()!(0);
    expect(surface.querySelectorAll('.epmd-code-editor')).toHaveLength(3);
    const copied:string[]=[];document.execCommand=jest.fn(()=>{copied.push((document.activeElement as HTMLTextAreaElement).value);return true;});
    for(const host of Array.from(surface.querySelectorAll<HTMLElement>('.epmd-code-editor'))){
        const button=Array.from(host.querySelectorAll('button')).find(button=>button.textContent==='复制')!;
        expect(button).toBeDefined();button.click();await Promise.resolve();await Promise.resolve();await Promise.resolve();
    }
    expect(copied).toEqual(sources.map(([,source])=>source));expect(showMessage).toHaveBeenCalledTimes(3);
    expect(showMessage).toHaveBeenLastCalledWith('已复制','success');
    document.body.replaceChildren();jest.restoreAllMocks();
});
