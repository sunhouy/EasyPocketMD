/** @jest-environment jsdom */
import {parsePPTPageRange,buildDocumentPPTPrompt} from '../../js/ui/ppt-document';
import {renderStorageUsage} from '../../js/main/storage-usage';
let language='zh';
beforeAll(()=>{
    window.i18n={getLanguage:()=>language,t:key=>key} as any;
    require('../../js/ui/dialog');require('../../js/ui/insert-picker');require('../../js/utils');
});
beforeEach(()=>{document.body.innerHTML='';language='zh';});
it('writes the total slide count range into the model prompt',()=>{
    expect(parsePPTPageRange('','')).toBeUndefined();expect(parsePPTPageRange('8','15')).toEqual({min:8,max:15});
    expect(buildDocumentPPTPrompt('全文','报告',parsePPTPageRange('8','15'))).toContain('8–15');
    for(const [min,max] of [['10','2'],['0','5'],['2','101'],['1.5','5']])expect(()=>parsePPTPageRange(min,max)).toThrow();
});
it('closes a file-name prompt as cancellation and allows the next dialog',async()=>{
    const first=(window.customPrompt as (message:string)=>Promise<string|null>)('文件名');
    const close=document.querySelector<HTMLButtonElement>('.custom-dialog-close');expect(close).not.toBeNull();close.click();expect(await first).toBeNull();
    const second=window.customConfirm('确认');document.querySelector<HTMLButtonElement>('.custom-dialog-btn.confirm').click();expect(await second).toBe(true);
});
it('does not add a dismiss control to a protected prompt',async()=>{
    const result=window.customConfirm('必须明确选择',{dismissible:false});expect(document.querySelector('.custom-dialog-close')).toBeNull();document.querySelector<HTMLButtonElement>('.custom-dialog-btn.cancel').click();expect(await result).toBe(false);
});
it('uses the current language when insert picker is opened after a language switch',()=>{
    language='en';(window.showInsertPicker as ()=>void)();expect(document.body.textContent).toContain('Heading 1');expect(document.body.textContent).toContain('Bold');expect(document.body.textContent).not.toContain('标题1');
});
it('retains storage clear button handlers when recalculating usage',()=>{
    document.body.innerHTML='<button id="clearLocalStorageBtn">清空</button><div id="usage"></div>';
    const button=document.querySelector<HTMLButtonElement>('button'), action=jest.fn();button.onclick=action;
    const list=document.getElementById('usage');renderStorageUsage(list,[{label:'LocalStorage',value:'2.9 MB'}]);renderStorageUsage(list,[{label:'LocalStorage',value:'3 MB'}]);
    expect(list.querySelector('button')).toBe(button);expect(list.querySelector('strong').textContent).toBe('3 MB');button.click();expect(action).toHaveBeenCalledTimes(1);
});
it('uses a non-spinning success icon and prevents an old hide timer hiding a new save',()=>{
    jest.useFakeTimers();document.body.innerHTML='<div id="syncStatus"><i class="sync-icon"></i><span id="syncText"></span></div>';
    window.showSyncStatus('保存中','syncing');expect(document.querySelector('i').classList.contains('fa-spin')).toBe(true);
    window.showSyncStatus('保存成功','success');expect(document.querySelector('i').classList.contains('fa-spin')).toBe(false);
    jest.advanceTimersByTime(1000);window.showSyncStatus('再次保存','syncing');jest.advanceTimersByTime(1000);expect(document.getElementById('syncStatus').classList.contains('syncing')).toBe(true);jest.useRealTimers();
});

it('cancels nested prompts through Back and resolves the pending operation',async()=>{
    const first=(window.customPrompt as (message:string)=>Promise<string|null>)('文件名');
    (document.getElementById('customDialogContainer') as any).epmdCloseByBackPress();
    expect(await first).toBeNull();
    const second=window.customConfirm('删除文件');
    (document.getElementById('customDialogContainer') as any).epmdCloseByBackPress();
    expect(await second).toBe(false);
    const alert=(window.customAlert as (message:string)=>Promise<void>)('提示');
    (document.getElementById('customDialogContainer') as any).epmdCloseByBackPress();
    await alert;
    expect(document.getElementById('customDialogContainer').style.display).toBe('none');
});
it.each(['zh','en'])('marks deletion as irreversible with an explicit destructive action in %s',async(lang)=>{
 language=lang;const pending=window.customConfirm('delete resource',{danger:true,confirmText:lang==='en'?'Delete':'删除'});
 expect(document.querySelector('.delete-warning').textContent).toBe(lang==='en'?'This action cannot be undone.':'此操作不可撤销。');
 expect(document.querySelector('.custom-dialog-btn.confirm').classList.contains('danger')).toBe(true);
 document.querySelector<HTMLButtonElement>('.custom-dialog-btn.cancel').click();expect(await pending).toBe(false);
});
