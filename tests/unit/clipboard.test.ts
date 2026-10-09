/** @jest-environment jsdom */
import { copyText, copyContent, readClipboardText } from '../../js/clipboard';

beforeEach(() => { document.body.replaceChildren(); });
afterEach(() => jest.restoreAllMocks());
function clipboard(writeText?: jest.Mock) {
    Object.defineProperty(navigator, 'clipboard', {configurable:true, value: writeText ? {writeText} : undefined});
}
it.each(['x^2 + y^2 = z^2', 'graph TD\nA-->B', '{"series":[{"type":"bar","data":[1,2]}]}'])('copies exact formula/chart source through the Clipboard API: %s', async source => {
    const write = jest.fn().mockResolvedValue(undefined); clipboard(write);
    await copyText(source); expect(write).toHaveBeenCalledWith(source);
});
it.each(['missing', 'denied'])('falls back when the Clipboard API is %s and restores the editor selection', async mode => {
    clipboard(mode === 'denied' ? jest.fn().mockRejectedValue(new Error('NotAllowedError')) : undefined);
    document.body.innerHTML='<textarea id="draft">before selected after</textarea>';
    const draft=document.querySelector('textarea')!; draft.focus();draft.setSelectionRange(7,15);
    document.execCommand=jest.fn(() => {
        expect(document.activeElement).toBe(draft);expect(document.querySelectorAll('textarea')).toHaveLength(1);
        const setData=jest.fn(),event=new Event('copy',{bubbles:true,cancelable:true});Object.defineProperty(event,'clipboardData',{value:{setData}});document.dispatchEvent(event);
        expect(setData).toHaveBeenCalledWith('text/plain','graph TD\nA-->B');return event.defaultPrevented;
    });
    await copyText('graph TD\nA-->B');
    expect(document.execCommand).toHaveBeenCalledWith('copy');expect(document.activeElement).toBe(draft);
    expect([draft.selectionStart,draft.selectionEnd]).toEqual([7,15]);expect(draft.value).toBe('before selected after');
    expect(document.querySelectorAll('textarea')).toHaveLength(1);
});
it('keeps fallback focus in a dialog and cleans up on failure', async () => {
    clipboard();document.body.innerHTML='<div role="dialog"><button>Copy</button></div>';
    const button=document.querySelector('button')!;button.focus();
    document.execCommand=jest.fn(() => {expect(document.querySelector('[role=dialog]')!.contains(document.activeElement)).toBe(true);return false;});
    await expect(copyText('x^2')).rejects.toThrow('Clipboard unavailable');
    expect(document.querySelector('textarea')).toBeNull();expect(document.activeElement).toBe(button);
});
it('copies table Markdown and rich HTML in one copy event without focusing a hidden input',async()=>{
    clipboard();document.body.innerHTML='<button>Copy</button><p>original</p>';const button=document.querySelector('button')!;button.focus();
    const data:Record<string,string>={};document.execCommand=jest.fn(()=>{
        const event=new Event('copy',{cancelable:true,bubbles:true});Object.defineProperty(event,'clipboardData',{value:{setData:(type:string,value:string)=>data[type]=value}});document.dispatchEvent(event);return event.defaultPrevented;
    });
    await copyContent({text:'| A | B |\n| --- | --- |',html:'<table><tr><td>A</td><td>B</td></tr></table>'});
    expect(data['text/plain']).toContain('| A | B |');expect(data['text/html']).toContain('<table>');expect(document.activeElement).toBe(button);expect(document.querySelector('textarea')).toBeNull();
});
it('uses Android native clipboard for copy and paste without calling browser APIs or changing selection',async()=>{
    const agent=jest.spyOn(navigator,'userAgent','get').mockReturnValue('Android');
    const invoke=jest.fn().mockResolvedValue({text:'$x^2$'});(window as any).__TAURI_INTERNALS__={invoke};
    const writeText=jest.fn();clipboard(writeText);document.execCommand=jest.fn();
    try {
        await copyContent({text:'$x^2$',html:'<span>x²</span>'});
        expect(invoke).toHaveBeenCalledWith('editor_clipboard_action',{action:'write',text:'$x^2$',html:'<span>x²</span>'});
        expect(await readClipboardText()).toBe('$x^2$');expect(writeText).not.toHaveBeenCalled();expect(document.execCommand).not.toHaveBeenCalled();
    } finally {delete (window as any).__TAURI_INTERNALS__;agent.mockRestore();}
});
