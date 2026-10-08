/** @jest-environment jsdom */
import {bindFolderSwipe} from '../../js/files/folder-swipe';
function gesture(el:HTMLElement,type:string,x:number,y:number){const e=new Event(type,{bubbles:true,cancelable:true});Object.defineProperty(e,type==='touchend'?'changedTouches':'touches',{value:[{clientX:x,clientY:y}]});el.dispatchEvent(e);return e;}
it('switches folders in each direction, suppresses accidental opens, and leaves vertical scroll alone',()=>{
 const el=document.createElement('div'),card=document.createElement('button');el.append(card);const change=jest.fn(),open=jest.fn();card.onclick=open;let enabled=true;bindFolderSwipe(el,change,()=>enabled);
 gesture(el,'touchstart',200,100);expect(gesture(el,'touchmove',110,104).defaultPrevented).toBe(true);gesture(el,'touchend',110,104);expect(change).toHaveBeenLastCalledWith(1);card.click();expect(open).not.toHaveBeenCalled();
 gesture(el,'touchstart',100,100);gesture(el,'touchend',190,101);expect(change).toHaveBeenLastCalledWith(-1);
 change.mockClear();gesture(el,'touchstart',100,100);expect(gesture(el,'touchmove',108,150).defaultPrevented).toBe(false);gesture(el,'touchend',180,180);expect(change).not.toHaveBeenCalled();
 enabled=false;gesture(el,'touchstart',200,100);gesture(el,'touchend',100,100);expect(change).not.toHaveBeenCalled();
});
