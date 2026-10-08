/** @jest-environment jsdom */
import {todoPayload,showAndroidTodo} from '../../js/main/android-todo';
const input={calendarId:1,title:' 文档待办 ',description:'完整文档内容',start:'2030-01-10T12:00',end:'2030-01-10T13:00',repeat:'none',interval:1,until:''};
it('keeps the full document and produces provider timestamps',()=>{
 const payload=todoPayload(input);expect(payload.title).toBe('文档待办');expect(payload.description).toBe('完整文档内容');expect(payload.start).toBe(new Date(input.start).getTime());expect(payload.end-payload.start).toBe(3600000);expect(payload.rrule).toBe('');
});
it.each([['daily','DAILY'],['weekly','WEEKLY'],['monthly','MONTHLY'],['yearly','YEARLY']])('supports %s repeats with an interval and cutoff', (repeat,frequency)=>{
 const payload=todoPayload({...input,repeat,interval:2,until:'2031-01-10'});expect(payload.rrule).toMatch(new RegExp('^FREQ='+frequency+';INTERVAL=2;UNTIL=\\d{8}T\\d{6}Z$'));
});
it('supports weekdays and rejects invalid dates, intervals',()=>{
 expect(todoPayload({...input,repeat:'weekdays'}).rrule).toBe('FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,TU,WE,TH,FR');
 expect(()=>todoPayload({...input,end:input.start})).toThrow('结束时间');expect(()=>todoPayload({...input,repeat:'daily',interval:0})).toThrow('重复间隔');expect(()=>todoPayload({...input,repeat:'daily',until:'2020-01-01'})).toThrow('截止日期');
});
it('requests permission only when opened and writes the user-selected calendar once',async()=>{
 const original=navigator.userAgent;Object.defineProperty(navigator,'userAgent',{configurable:true,value:'Android'});
 const invoke=jest.fn().mockResolvedValueOnce({calendars:[{id:17,name:'我的日历'}]}).mockResolvedValueOnce({eventUri:'content://calendar/events/1'});
 window.__TAURI__={invoke} as any;const app:any={__TAURI__:window.__TAURI__,files:[{id:'file',name:'note.md',content:'# 标题\n\n**完整**的文档内容\n- [x] 完成事项'}],currentFileId:'file',showMessage:jest.fn()};
 try {await showAndroidTodo(app);expect(invoke).toHaveBeenCalledTimes(1);expect(invoke).toHaveBeenCalledWith('calendar_action',{action:'calendars',payload:{}});
 const form=document.querySelector<HTMLFormElement>('#androidTodoOverlay form');expect((form.elements.namedItem('description') as HTMLTextAreaElement).value).toBe('标题\n\n完整的文档内容\n完成事项');
 form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await new Promise(resolve=>setTimeout(resolve,0));expect(invoke).toHaveBeenCalledTimes(2);expect(invoke.mock.calls[1][1].payload.calendarId).toBe(17);expect(document.getElementById('androidTodoOverlay')).toBeNull();expect(app.showMessage).toHaveBeenCalledWith('待办已写入系统日历','success');
 }finally{delete window.__TAURI__;Object.defineProperty(navigator,'userAgent',{configurable:true,value:original});document.body.innerHTML='';}
});
