/** @jest-environment jsdom */
import {installOrderDrag} from '../../js/files/order-drag';
let app:any,surface:HTMLElement,a:HTMLElement,b:HTMLElement;
const event=(type:string,props:any={})=>{const e=new Event(type,{bubbles:true,cancelable:true});Object.assign(e,props);return e;};
beforeEach(()=>{
 document.body.innerHTML='<section><article data-file-id="a"></article><article data-file-id="b"></article></section>';
 surface=document.querySelector('section')!;[a,b]=[...surface.querySelectorAll('article')];
 b.getBoundingClientRect=()=>({top:100,height:100,left:0,width:100} as DOMRect);
 app={files:[{id:'a'},{id:'b'}],currentUser:{username:'one'},reorderFileEntries:jest.fn(),refreshNotesHome:jest.fn(),moveFileEntries:jest.fn()};
 const drag=installOrderDrag(surface,app);drag.decorate(a);drag.decorate(b);
});
afterEach(()=>{jest.useRealTimers();});
it('keeps cards draggable without displaying a grip icon',()=>{
 expect(a.draggable).toBe(true);
 expect(a.querySelector('.fa-grip-vertical')).toBeNull();
 expect(a.querySelector('.notes-order-handle')).toBeNull();
});
it('persists a desktop drop and prevents its incidental click from opening a note',()=>{
 jest.useFakeTimers();const open=jest.fn();a.onclick=open;
 a.dispatchEvent(event('dragstart',{dataTransfer:{setData:jest.fn()}}));b.dispatchEvent(event('dragover',{clientX:5,clientY:190}));b.dispatchEvent(event('drop'));
 expect(app.reorderFileEntries).toHaveBeenCalledWith('a','b',true);expect(app.fileOrderDragging).toBe(false);a.click();expect(open).not.toHaveBeenCalled();jest.advanceTimersByTime(501);a.click();expect(open).toHaveBeenCalled();
});
it('does not apply a drop to another account or replaced workspace',()=>{
 a.dispatchEvent(event('dragstart'));b.dispatchEvent(event('dragover',{clientX:5,clientY:110}));app.currentUser={username:'two'};b.dispatchEvent(event('drop'));expect(app.reorderFileEntries).not.toHaveBeenCalled();
 a.dispatchEvent(event('dragstart'));b.dispatchEvent(event('dragover',{clientX:5,clientY:110}));app.files=[];b.dispatchEvent(event('drop'));expect(app.reorderFileEntries).not.toHaveBeenCalled();
});
it('leaves touch gestures available and blocks touch-initiated dragging',()=>{
 const down=event('pointerdown',{pointerType:'touch',pointerId:5,button:0});a.dispatchEvent(down);
 expect(down.defaultPrevented).toBe(false);expect(app.fileOrderDragging).toBeFalsy();
 const drag=event('dragstart');a.dispatchEvent(drag);expect(drag.defaultPrevented).toBe(true);
 b.dispatchEvent(event('dragover',{clientX:5,clientY:110}));b.dispatchEvent(event('drop'));
 expect(app.reorderFileEntries).not.toHaveBeenCalled();
});
it('disables native drag on phones even if the event has no pointer information',()=>{
 const ua=jest.spyOn(navigator,'userAgent','get').mockReturnValue('Mozilla/5.0 (Linux; Android 14) Mobile');
 const item=document.createElement('article');installOrderDrag(document.createElement('section'),app).decorate(item);
 expect(item.draggable).toBe(false);
 const drag=event('dragstart');a.dispatchEvent(drag);expect(drag.defaultPrevented).toBe(true);
 expect(app.fileOrderDragging).toBeFalsy();ua.mockRestore();
});
it('supports desktop keyboard ordering',()=>{
 a.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,altKey:true,key:'ArrowDown'}));expect(app.moveFileEntries).toHaveBeenCalledWith(['a'],'down');
});

it('does not cancel native desktop dragging when the browser cancels its pointer stream',()=>{
 a.dispatchEvent(event('dragstart'));a.dispatchEvent(event('pointercancel',{pointerId:1}));
 b.dispatchEvent(event('dragover',{clientX:5,clientY:110}));b.dispatchEvent(event('drop'));
 expect(app.reorderFileEntries).toHaveBeenCalledWith('a','b',false);
});
