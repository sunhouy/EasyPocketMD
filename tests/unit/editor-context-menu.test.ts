/** @jest-environment jsdom */
import { installSelectionToolbar } from '../../js/main/selection-toolbar';
import { selectionContent } from '../../js/main/selection-content';

it('opens one custom menu at a collapsed caret with all requested insert actions and preserves the insertion location',async()=>{
    jest.useFakeTimers();document.body.innerHTML='<div id="vditor"><div contenteditable="true"><p>text</p></div></div>';
    const root=document.querySelector<HTMLElement>('[contenteditable]')!,text=root.querySelector('p')!.firstChild!;
    root.focus();const range=document.createRange();range.setStart(text,2);range.collapse(true);document.getSelection()!.removeAllRanges();document.getSelection()!.addRange(range);
    Object.defineProperty(Range.prototype,'getBoundingClientRect',{configurable:true,value:()=>({left:20,top:200,width:0,height:20,bottom:220})});
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{readText:jest.fn(async()=> '| A | B |')}});
    const insertValue=jest.fn(()=>{expect(document.getSelection()!.anchorNode).toBe(text);expect(document.getSelection()!.anchorOffset).toBe(2);});
    const app={currentFileId:'a',vditor:{insertValue},showMessage:jest.fn()};installSelectionToolbar(app);
    const event=new MouseEvent('contextmenu',{bubbles:true,cancelable:true});root.dispatchEvent(event);expect(event.defaultPrevented).toBe(true);
    const toolbar=document.getElementById('selectionToolbar')!;expect(toolbar.hidden).toBe(false);
    const shown=Array.from(toolbar.querySelectorAll<HTMLButtonElement>('button')).filter(button=>!button.hidden).map(button=>button.dataset.action);
    expect(shown).toEqual(expect.arrayContaining(['paste','h1','h2','h3','code-block','inline-code','formula','chart','quote','link','image','file','table','divider','emoji','footnote','mindmap']));
    expect(shown).not.toContain('copy');
    toolbar.querySelector<HTMLButtonElement>('[data-action=inline-code]')!.click();await Promise.resolve();await Promise.resolve();
    expect(insertValue).toHaveBeenCalledWith('`code`');expect(toolbar.hidden).toBe(true);
    // Long press opens the same menu; a scroll gesture cancels the timer.
    const down=new Event('pointerdown',{bubbles:true});Object.assign(down,{pointerType:'touch',clientX:20,clientY:20});root.dispatchEvent(down);jest.advanceTimersByTime(560);expect(toolbar.hidden).toBe(false);
    root.dispatchEvent(down);const move=new Event('pointermove',{bubbles:true});Object.assign(move,{clientX:20,clientY:100});root.dispatchEvent(move);jest.advanceTimersByTime(560);expect(toolbar.hidden).toBe(true);
    jest.useRealTimers();
});
it('serializes tables with Markdown and HTML and expands rendered formulas to their canonical source',()=>{
    document.body.innerHTML='<div id="vditor"><table><tr><td>A</td><td>B</td></tr></table><div data-type="math-block"><pre class="vditor-wysiwyg__pre">x^2</pre><div class="vditor-wysiwyg__preview"><span>rendered</span></div></div></div>';
    const lute={VditorDOM2Md:jest.fn(html=>html.includes('<table>')?'| A | B |':'$$\nx^2\n$$'),Md2HTML:jest.fn(text=>text.includes('|')?'<table><tr><td>A</td><td>B</td></tr></table>':'<div>x²</div>')};
    const app={vditor:{vditor:{lute}}},range=document.createRange();range.selectNode(document.querySelector('table')!);
    expect(selectionContent(range,app)).toEqual({text:'| A | B |',html:expect.stringContaining('<table>')});
    range.selectNodeContents(document.querySelector('.vditor-wysiwyg__preview span')!);expect(selectionContent(range,app).text).toBe('$$\nx^2\n$$');
    expect(lute.VditorDOM2Md.mock.calls.at(-1)![0]).toContain('x^2');
});
