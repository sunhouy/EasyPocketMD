/** @jest-environment jsdom */
import {showFileDetails} from '../../js/files/tree/details';
let ua:jest.SpyInstance,invoke:jest.Mock;
beforeAll(()=>{require('../../js/ui/dialog');});
beforeEach(()=>{
 ua=jest.spyOn(navigator,'userAgent','get').mockReturnValue('Android');invoke=jest.fn();window.__TAURI__={invoke} as any;
 document.body.replaceChildren();window.i18n={getLanguage:()=> 'en'} as any;
});
afterEach(()=>{ua.mockRestore();delete window.__TAURI__;});
it('uses native prompts and preserves cancel versus an empty input',async()=>{
 invoke.mockResolvedValueOnce({canceled:true}).mockResolvedValueOnce({canceled:false,value:''});
 expect(await (window.customPrompt as (message:string,options?:any)=>Promise<string|null>)('Name',{defaultValue:'draft.md'})).toBeNull();
 expect(await (window.customPrompt as (message:string,options?:any)=>Promise<string|null>)('Name')).toBe('');
 expect(invoke.mock.calls[0][1].payload).toMatchObject({kind:'prompt',defaultValue:'draft.md',english:true});
 expect(document.getElementById('customDialogContainer')).toBeNull();
});
it('serializes native confirmations and preserves destructive-action options',async()=>{
 let done:any;invoke.mockImplementationOnce(()=>new Promise(resolve=>{done=resolve;})).mockResolvedValueOnce({canceled:false,value:true});
 const first=window.customConfirm('Delete?',{danger:true,dismissible:false,confirmText:'Delete'});
 const second=window.customConfirm('Continue?');expect(invoke).toHaveBeenCalledTimes(1);
 expect(invoke.mock.calls[0][1].payload).toMatchObject({danger:true,dismissible:false,confirmText:'Delete'});
 done({canceled:true});expect(await first).toBe(false);expect(await second).toBe(true);expect(invoke).toHaveBeenCalledTimes(2);
});
it('falls back to the existing dialog when an older native host has no command',async()=>{
 invoke.mockRejectedValue(Error('Unknown command'));
 const pending=window.customConfirm('Proceed?');await new Promise(resolve=>setTimeout(resolve,0));
 document.querySelector<HTMLButtonElement>('.custom-dialog-btn.cancel')!.click();expect(await pending).toBe(false);
});
it('shows file details in Kotlin without inventing timestamps',async()=>{
 invoke.mockResolvedValue({canceled:false});
 const file={name:'folder/<note>.md',type:'file',content:'内容'};
 expect(showFileDetails({files:[file],i18n:window.i18n},file)).toBeNull();
 expect(invoke.mock.calls[0][1].payload).toMatchObject({kind:'details',title:'Details'});
 expect(invoke.mock.calls[0][1].payload.message).toContain('Not recorded');expect(document.getElementById('fileDetailsModal')).toBeNull();
});
