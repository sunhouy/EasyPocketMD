/** @jest-environment jsdom */
// @ts-nocheck
jest.mock('cropperjs',()=>({default:jest.fn()}));
beforeAll(()=>require('../../js/ui/image-inline-tools'));
it('closes image tools on Escape and closes a crop overlay before its parent tools',()=>{
    document.body.innerHTML='<div id="epmd-image-tools-modal" style="display:flex"></div><div id="epmd-image-crop-fullscreen" style="display:flex"></div>';
    const tools=document.getElementById('epmd-image-tools-modal'),crop=document.getElementById('epmd-image-crop-fullscreen');
    document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
    expect(crop.style.display).toBe('none');expect(tools.style.display).toBe('flex');
    document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));expect(tools.style.display).toBe('none');
});
