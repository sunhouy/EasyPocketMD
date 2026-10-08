/** @jest-environment jsdom */
import {installSelectionToolbar,selectionMarkdown} from '../../js/main/selection-toolbar';
it('keeps selected text and generates inline/block markdown',()=>{
 expect(selectionMarkdown('选中文字','bold')).toBe('**选中文字**');expect(selectionMarkdown('a\nb','ordered-list')).toBe('1. a\n2. b');expect(selectionMarkdown('a','check')).toBe('- [ ] a');
});
it('formats the original selection, protects readonly and CodeMirror, and hides on selection collapse',async()=>{
 jest.useFakeTimers();
 document.body.innerHTML='<div style="display:none"><div role="dialog">Hidden modal</div></div><textarea id="longFileTextarea">before selected after</textarea><div id="vditor"><div class="vditor-toolbar"><button data-tag="h1"></button></div><div contenteditable="true"><p>selected prose</p></div></div><div class="cm-editor"><div contenteditable="true">code</div></div>';
 const message=jest.fn(),writeText=jest.fn().mockResolvedValue(undefined);
 Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText}});
 const invoke=jest.fn().mockResolvedValue(undefined);
 const app={currentFileId:'f',showMessage:message,__TAURI__:{core:{invoke}}};installSelectionToolbar(app);
 const input=document.querySelector('textarea')!;input.focus();input.setSelectionRange(7,15);document.dispatchEvent(new Event('selectionchange'));jest.advanceTimersByTime(20);
 const toolbar=document.getElementById('selectionToolbar')!;
 expect(toolbar.hidden).toBe(false);expect((toolbar.querySelector('[data-action=paste]') as HTMLButtonElement).hidden).toBe(true);expect((toolbar.querySelector('[data-action=search]') as HTMLButtonElement).hidden).toBe(false);(toolbar.querySelector('[data-action=bold]') as HTMLButtonElement).click();await Promise.resolve();expect(input.value).toBe('before **selected** after');
 input.setSelectionRange(7,19);document.dispatchEvent(new Event('selectionchange'));jest.advanceTimersByTime(20);
 (toolbar.querySelector('[data-action=copy]') as HTMLButtonElement).click();await Promise.resolve();await Promise.resolve();expect(writeText).toHaveBeenCalledWith('**selected**');expect(message).toHaveBeenCalledWith('已复制','success');
 input.readOnly=true;input.setSelectionRange(0,6);document.dispatchEvent(new Event('selectionchange'));jest.advanceTimersByTime(20);expect((toolbar.querySelector('[data-action=cut]') as HTMLButtonElement).hidden).toBe(true);expect((toolbar.querySelector('[data-action=bold]') as HTMLButtonElement).hidden).toBe(true);
 input.blur();const prose=document.querySelector('#vditor p')!;const proseRange=document.createRange();proseRange.selectNodeContents(prose);
 Object.defineProperty(Range.prototype,'getBoundingClientRect',{configurable:true,value:()=>({left:20,top:200,width:120,height:20,bottom:220})});
 const nativeHeading=document.querySelector<HTMLButtonElement>('#vditor button')!,heading=jest.fn();nativeHeading.addEventListener('click',heading);
 document.getSelection()!.removeAllRanges();document.getSelection()!.addRange(proseRange);document.dispatchEvent(new Event('selectionchange'));jest.advanceTimersByTime(20);
 expect(toolbar.hidden).toBe(false);expect(toolbar.querySelectorAll('button')).toHaveLength(15);
 const menu=new MouseEvent('contextmenu',{bubbles:true,cancelable:true});prose.dispatchEvent(menu);expect(menu.defaultPrevented).toBe(true);expect(invoke).toHaveBeenCalledWith('set_selection_menu',{enabled:true});
 (toolbar.querySelector('[data-action=h1]') as HTMLButtonElement).click();await Promise.resolve();expect(heading).toHaveBeenCalledTimes(1);
 input.blur();const code=document.querySelector('.cm-editor div')!;const range=document.createRange();range.selectNodeContents(code);document.getSelection()!.removeAllRanges();document.getSelection()!.addRange(range);document.dispatchEvent(new Event('selectionchange'));jest.advanceTimersByTime(20);expect(toolbar.hidden).toBe(true);
 code.dispatchEvent(new MouseEvent('pointerdown',{bubbles:true}));const codeMenu=new MouseEvent('contextmenu',{bubbles:true,cancelable:true});code.dispatchEvent(codeMenu);expect(codeMenu.defaultPrevented).toBe(false);expect(invoke).toHaveBeenCalledWith('set_selection_menu',{enabled:false});
 document.getSelection()!.removeAllRanges();document.dispatchEvent(new Event('selectionchange'));jest.advanceTimersByTime(20);expect(toolbar.hidden).toBe(true);jest.useRealTimers();
});
