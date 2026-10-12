/** @jest-environment jsdom */
import {pickAndroidImportFiles} from '../../js/files/android-import';
let ua:jest.SpyInstance;
beforeEach(()=>{ua=jest.spyOn(navigator,'userAgent','get').mockReturnValue('Android');window.__TAURI__={invoke:jest.fn()} as any;});
afterEach(()=>{ua.mockRestore();delete window.__TAURI__;});
it('preserves text and binary bytes from multiple selected documents',async()=>{
 const invoke=jest.fn().mockResolvedValue({files:[{name:'note.md',mime:'text/markdown',base64:btoa('hello')},{name:'a.pdf',mime:'application/pdf',base64:btoa('\u0000\u00ff\u0080')}]});
 const files=await pickAndroidImportFiles({__TAURI__:{invoke}});expect(invoke).toHaveBeenCalledWith('android_import_files');
 expect(files?.map(f=>[f.name,f.type,f.size])).toEqual([['note.md','text/markdown',5],['a.pdf','application/pdf',3]]);
 const reader=new FileReader();const bytes=await new Promise<ArrayBuffer>(resolve=>{reader.onload=()=>resolve(reader.result as ArrayBuffer);reader.readAsArrayBuffer(files![1]);});
 expect([...new Uint8Array(bytes)]).toEqual([0,255,128]);
});
it('cancels cleanly and retains the older APK fallback',async()=>{
 expect(await pickAndroidImportFiles({__TAURI__:{invoke:jest.fn().mockResolvedValue({canceled:true})}})).toEqual([]);
 expect(await pickAndroidImportFiles({__TAURI__:{invoke:jest.fn().mockRejectedValue('Unknown command android_import_files')}})).toBeNull();
});
it('reports read and permission failures instead of silently retrying another picker',async()=>{
 await expect(pickAndroidImportFiles({__TAURI__:{invoke:jest.fn().mockRejectedValue('Permission denied')}})).rejects.toEqual('Permission denied');
});
