/** @jest-environment jsdom */
import {bindMobileCodeInput} from '../../js/code-block-mobile';
function pointer(node:HTMLElement,type:string,x:number,y:number){const e=new Event(type,{bubbles:true,cancelable:true});Object.assign(e,{pointerType:'touch',pointerId:1,clientX:x,clientY:y});node.dispatchEvent(e);return e;}
it('focuses unfocused touch taps without stealing scrolling, long selections or outer editor input',()=>{
 const root=document.createElement('div'),host=document.createElement('div'),scroller=document.createElement('div');scroller.className='cm-scroller';host.append(scroller);root.append(host);
 const parent=jest.fn();root.addEventListener('compositionupdate',parent);root.addEventListener('touchstart',parent);
 const view={hasFocus:false,focus:jest.fn(),posAtCoords:jest.fn(()=>5),dispatch:jest.fn()};let editable=true;bindMobileCodeInput(host,view,()=>editable);
 pointer(scroller,'pointerdown',20,30);expect(pointer(scroller,'pointerup',21,31).defaultPrevented).toBe(false);expect(view.focus).toHaveBeenCalledTimes(1);expect(view.dispatch).toHaveBeenCalledWith({selection:{anchor:5}});
 pointer(scroller,'pointerdown',20,30);pointer(scroller,'pointerup',20,100);expect(view.focus).toHaveBeenCalledTimes(1);
 editable=false;pointer(scroller,'pointerdown',20,30);pointer(scroller,'pointerup',20,30);expect(view.focus).toHaveBeenCalledTimes(1);
 scroller.dispatchEvent(new Event('compositionupdate',{bubbles:true}));scroller.dispatchEvent(new Event('touchstart',{bubbles:true}));expect(parent).not.toHaveBeenCalled();
});
