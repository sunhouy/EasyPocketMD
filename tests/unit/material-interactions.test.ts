/** @jest-environment jsdom */
import {installMaterialInteractions} from '../../js/main/material-interactions';
let dispose:()=>void;
beforeEach(()=>{jest.useFakeTimers();document.body.innerHTML='';dispose=installMaterialInteractions();});
afterEach(()=>{dispose();jest.runOnlyPendingTimers();jest.useRealTimers();});
function button(){
    const element=document.createElement('button');element.innerHTML='<span>保存</span>';document.body.append(element);
    element.getBoundingClientRect=()=>({left:20,top:30,width:80,height:40,right:100,bottom:70,x:20,y:30,toJSON:()=>({})});
    return element;
}
it('adds clipped ink to dynamic buttons without consuming clicks or focus',()=>{
    const element=button(),clicked=jest.fn();element.addEventListener('click',clicked);element.focus();
    element.firstElementChild.dispatchEvent(new MouseEvent('pointerdown',{bubbles:true,button:0,clientX:35,clientY:40}));
    const layer=document.querySelector<HTMLElement>('.md-ripple-layer');expect(layer).not.toBeNull();expect(layer.parentElement).toBe(document.body);
    expect(layer.style.left).toBe('20px');expect(layer.style.width).toBe('80px');expect(element.children).toHaveLength(1);
    element.dispatchEvent(new MouseEvent('click',{bubbles:true,detail:1}));expect(clicked).toHaveBeenCalledTimes(1);expect(document.activeElement).toBe(element);
    layer.firstElementChild.dispatchEvent(new Event('animationend'));expect(document.querySelector('.md-ripple-layer')).toBeNull();
});
it('supports keyboard activation and clears ink when the page scrolls',()=>{
    const element=button();element.click();expect(document.querySelector('.md-ripple-layer')).not.toBeNull();
    document.dispatchEvent(new Event('scroll'));expect(document.querySelector('.md-ripple-layer')).toBeNull();
});
it('skips disabled controls and respects reduced motion',()=>{
    const element=button();element.disabled=true;element.click();expect(document.querySelector('.md-ripple-layer')).toBeNull();element.disabled=false;
    const original=window.matchMedia;window.matchMedia=jest.fn().mockReturnValue({matches:true});element.click();expect(document.querySelector('.md-ripple-layer')).toBeNull();window.matchMedia=original;
});
it.each(['remove','hide'])('removes ink immediately when its surface is closed (%s)',async method=>{
 const element=button(),surface=document.createElement('div');document.body.append(surface);surface.append(element);element.click();expect(document.querySelector('.md-ripple-layer')).not.toBeNull();
 if(method==='remove')surface.remove();else surface.style.display='none';await Promise.resolve();expect(document.querySelector('.md-ripple-layer')).toBeNull();
});
it('does not leave ink floating over a newly opened dialog',async()=>{
 const element=button();element.click();const modal=document.createElement('div');document.body.append(modal);
 const original=document.elementFromPoint;document.elementFromPoint=jest.fn().mockReturnValue(modal);
 await Promise.resolve();expect(document.querySelector('.md-ripple-layer')).toBeNull();document.elementFromPoint=original;
});
