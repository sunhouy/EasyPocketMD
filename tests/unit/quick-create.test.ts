/** @jest-environment jsdom */
import { bindFileCreationButton, quickDocumentPath } from '../../js/files/quick-create';
it('numbers quick documents and avoids file and folder names in the current folder',()=>{
 expect(quickDocumentPath([{name:'新文档1'},{name:'新文档2'}])).toBe('新文档3');
 expect(quickDocumentPath([{name:'新文档1'},{name:'学习/新文档1'}],'学习')).toBe('学习/新文档2');
});
it('short click opens options, long press creates once, and scrolling or canceling never creates',()=>{
 jest.useFakeTimers();const button=document.createElement('button'),open=jest.fn(),quick=jest.fn();document.body.append(button);bindFileCreationButton(button,open,quick);
 const pointer=(type:string,x=0)=>button.dispatchEvent(new MouseEvent(type,{button:0,clientX:x,clientY:0,bubbles:true}));
 button.click();expect(open).toHaveBeenCalledTimes(1);
 pointer('pointerdown');jest.advanceTimersByTime(550);pointer('pointerup');button.click();expect(quick).toHaveBeenCalledTimes(1);expect(open).toHaveBeenCalledTimes(1);
 pointer('pointerdown');pointer('pointermove',30);jest.advanceTimersByTime(600);expect(quick).toHaveBeenCalledTimes(1);
 pointer('pointerdown');pointer('pointercancel');jest.advanceTimersByTime(600);expect(quick).toHaveBeenCalledTimes(1);
 jest.useRealTimers();button.remove();
});
