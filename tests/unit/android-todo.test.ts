/** @jest-environment jsdom */
import {showAndroidTodo} from '../../js/main/android-todo';
let ua:jest.SpyInstance,invoke:jest.Mock,app:any;
beforeEach(()=>{
 ua=jest.spyOn(navigator,'userAgent','get').mockReturnValue('Android');
 invoke=jest.fn().mockResolvedValue({canceled:false,value:'content://calendar/events/1'});
 window.__TAURI__={invoke} as any;
 app={__TAURI__:window.__TAURI__,files:[{id:'file',name:'note.md',content:'# 标题\n\n**完整**的文档内容\n- [x] 完成事项'}],currentFileId:'file',showMessage:jest.fn()};
});
afterEach(()=>{ua.mockRestore();delete window.__TAURI__;document.body.replaceChildren();});
it('opens the Kotlin calendar editor with plain text and no HTML form',async()=>{
 await showAndroidTodo(app);
 expect(invoke).toHaveBeenCalledTimes(1);
 expect(invoke).toHaveBeenCalledWith('calendar_action',{action:'showTodo',payload:{title:'note',description:'标题\n\n完整的文档内容\n完成事项',english:false,night:false,palette:'{}'}});
 expect(document.getElementById('androidTodoOverlay')).toBeNull();
 expect(app.showMessage).toHaveBeenCalledWith('日程已写入系统日历','success');
});
it('does not report success when the native dialog is canceled',async()=>{
 invoke.mockResolvedValue({canceled:true});await showAndroidTodo(app);expect(app.showMessage).not.toHaveBeenCalled();
});
it('does not open duplicate native editors and allows reopening after dismissal',async()=>{
 let finish:any;invoke.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 const first=showAndroidTodo(app);await Promise.resolve();await showAndroidTodo(app);expect(invoke).toHaveBeenCalledTimes(1);
 finish({canceled:true});await first;await showAndroidTodo(app);expect(invoke).toHaveBeenCalledTimes(2);
});
it('never passes encrypted document ciphertext to the calendar editor',async()=>{
 app.files[0].content='EPMD1:encrypted';await showAndroidTodo(app);
 expect(invoke.mock.calls[0][1].payload.description).toBe('');expect(app.showMessage).toHaveBeenCalledWith(expect.stringContaining('解密'),'warning');
});
it('reports native permission or provider errors and allows retry',async()=>{
 invoke.mockRejectedValueOnce(Error('Permission denied'));await showAndroidTodo(app);
 expect(app.showMessage).toHaveBeenCalledWith('Permission denied','error');await showAndroidTodo(app);expect(invoke).toHaveBeenCalledTimes(2);
});
