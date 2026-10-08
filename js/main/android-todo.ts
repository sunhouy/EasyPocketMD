import {isAndroidApp} from './android-ui';

type TodoInput={title:string;description:string;calendarId:number;start:string;end:string;repeat:string;interval:number;until:string;reminderMinutes:number;alarm:boolean};
export function todoPayload(input:TodoInput) {
    const start=new Date(input.start).getTime(),end=new Date(input.end).getTime();
    if(!input.title.trim() || input.title.length>500)throw Error('请输入待办标题（最多500字）');
    if(!Number.isInteger(input.calendarId) || input.calendarId<=0)throw Error('请选择可写入的日历');
    if(!Number.isFinite(start) || !Number.isFinite(end) || end<=start)throw Error('结束时间必须晚于开始时间');
    if(!Number.isInteger(input.reminderMinutes) || input.reminderMinutes< -1 || input.reminderMinutes>525600)throw Error('提醒时间无效');
    if(input.alarm && (input.reminderMinutes<0 || start-input.reminderMinutes*60000<=Date.now()))throw Error('请将闹钟提醒时间设置在未来');
    let rrule='';
    if(input.repeat!=='none'){
        const frequencies:Record<string,string>={daily:'DAILY',weekdays:'WEEKLY',weekly:'WEEKLY',monthly:'MONTHLY',yearly:'YEARLY'};
        if(!frequencies[input.repeat] || !Number.isInteger(input.interval) || input.interval<1 || input.interval>365)throw Error('重复间隔必须是1至365的整数');
        rrule='FREQ='+frequencies[input.repeat]+';INTERVAL='+input.interval+(input.repeat==='weekdays'?';BYDAY=MO,TU,WE,TH,FR':'');
        if(input.until){const until=new Date(input.until+'T23:59:59');if(!Number.isFinite(until.getTime()) || until.getTime()<start)throw Error('重复截止日期不能早于开始时间');rrule+=';UNTIL='+until.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');}
    }
    return {calendarId:input.calendarId,title:input.title.trim(),description:input.description,start,end,rrule,reminderMinutes:input.reminderMinutes,alarm:input.alarm};
}
const localTime=(date:Date)=>new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);
export async function showAndroidTodo(app:any=window) {
    if(!isAndroidApp())return;
    const invoke=app.__TAURI__?.core?.invoke || app.__TAURI__?.invoke;
    if(!invoke)throw Error('系统日历接口不可用');
    const existing=document.getElementById('androidTodoOverlay');if(existing)return;
    const file=app.files?.find((file:any)=>file.id===app.currentFileId);
    const overlay=document.createElement('div');overlay.id='androidTodoOverlay';overlay.className='modal-overlay show';overlay.style.zIndex='100170';
    const en=app.i18n?.getLanguage?.()==='en',t=(zh:string,english:string)=>en?english:zh;
    overlay.innerHTML=`<div class="modal android-todo-modal"><button type="button" class="epmd-dialog-close modal-close-btn" aria-label="${t('关闭','Close')}">×</button><div class="modal-header"><h2>${t('添加待办','Add to calendar')}</h2></div><form class="modal-form"><label>${t('日历','Calendar')}<select name="calendarId" required><option value="">${t('正在获取日历权限…','Requesting calendar access…')}</option></select></label><label>${t('标题','Title')}<input name="title" maxlength="500" required autocomplete="off"></label><label>${t('内容（可编辑当前文档内容）','Details (editable document content)')}<textarea name="description" rows="5"></textarea></label><button type="button" class="modal-btn secondary" data-use-content>${t('使用当前文档内容','Use current document content')}</button><div class="todo-time-row"><label>${t('开始时间','Start')}<input name="start" type="datetime-local" required></label><label>${t('结束时间','End')}<input name="end" type="datetime-local" required></label></div><label>${t('重复规则','Repeat')}<select name="repeat"><option value="none">${t('不重复','Never')}</option><option value="daily">${t('每天','Daily')}</option><option value="weekdays">${t('工作日','Weekdays')}</option><option value="weekly">${t('每周','Weekly')}</option><option value="monthly">${t('每月','Monthly')}</option><option value="yearly">${t('每年','Yearly')}</option></select></label><div data-repeat-options hidden><label>${t('重复间隔','Repeat interval')}<input name="interval" type="number" min="1" max="365" value="1"></label><label>${t('重复截止日期（留空则持续重复）','Repeat until (optional)')}<input name="until" type="date"></label></div><label>${t('日历提醒','Calendar reminder')}<select name="reminderMinutes"><option value="-1">${t('不提醒','None')}</option><option value="0">${t('准时','At start')}</option><option value="5">${t('提前5分钟','5 minutes before')}</option><option value="10" selected>${t('提前10分钟','10 minutes before')}</option><option value="30">${t('提前30分钟','30 minutes before')}</option><option value="60">${t('提前1小时','1 hour before')}</option><option value="1440">${t('提前1天','1 day before')}</option></select></label><label class="todo-alarm-option"><input name="alarm" type="checkbox">${t('首次提醒额外设置系统闹钟','Also set a system alarm for the first reminder')}</label><p class="todo-hint">${t('重复待办由系统日历提醒。额外闹钟将打开系统时钟设置首次提醒，后续重复不由该闹钟执行。','Recurring reminders are handled by Calendar. The extra alarm opens Clock for the first reminder only.')}</p><p data-error role="alert"></p><div class="modal-actions"><button type="button" class="modal-btn secondary" data-cancel>${t('取消','Cancel')}</button><button type="submit" class="modal-btn primary" disabled>${t('写入日历','Add to calendar')}</button></div></form></div>`;
    const form=overlay.querySelector<HTMLFormElement>('form'),submit=form.querySelector<HTMLButtonElement>('[type=submit]'),error=form.querySelector<HTMLElement>('[data-error]');
    const control=(name:string)=>form.elements.namedItem(name) as HTMLInputElement;
    const close=()=>{document.removeEventListener('keydown',esc);overlay.remove();};const esc=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();close();}};
    overlay.querySelector<HTMLButtonElement>('.modal-close-btn').onclick=close;overlay.querySelector<HTMLButtonElement>('[data-cancel]').onclick=close;document.addEventListener('keydown',esc);document.body.append(overlay);
    control('title').value=file?.name?.split('/').pop()?.replace(/\.md$/i,'') || t('新待办','New task');
    control('start').value=localTime(new Date(Date.now()+3600000));control('end').value=localTime(new Date(Date.now()+7200000));
    const useContent=async()=>{const content=await app.getCurrentEditorContent?.(file?.id,file?.content) ?? app.vditor?.getValue?.() ?? file?.content ?? '';if(/^EPMD\d*:/.test(content))throw Error('请先打开并解密文档后再使用其内容');control('description').value=content;};
    form.querySelector<HTMLButtonElement>('[data-use-content]').onclick=()=>{void useContent().catch(e=>{error.textContent=String(e.message || e);});};
    control('repeat').onchange=()=>{form.querySelector<HTMLElement>('[data-repeat-options]').hidden=control('repeat').value==='none';};
    control('reminderMinutes').onchange=()=>{control('alarm').disabled=control('reminderMinutes').value==='-1';if(control('alarm').disabled)control('alarm').checked=false;};
    form.onsubmit=async event=>{event.preventDefault();error.textContent='';submit.disabled=true;try{
        const payload=todoPayload({title:control('title').value,description:control('description').value,calendarId:Number(control('calendarId').value),start:control('start').value,end:control('end').value,repeat:control('repeat').value,interval:Number(control('interval').value),until:control('until').value,reminderMinutes:Number(control('reminderMinutes').value),alarm:control('alarm').checked});
        const result=await invoke('calendar_action',{action:'addTodo',payload});close();app.showMessage?.(result.warning || t('待办已写入系统日历','Added to system calendar'),result.warning?'warning':'success');
    }catch(e){error.textContent=String((e as Error).message || e);}finally{submit.disabled=false;}};
    try {await useContent().catch(e=>{error.textContent=String(e.message || e);});const result=await invoke('calendar_action',{action:'calendars',payload:{}});if(!overlay.isConnected)return;
        const select=control('calendarId') as unknown as HTMLSelectElement;select.replaceChildren();for(const calendar of result.calendars || []){const option=document.createElement('option');option.value=String(calendar.id);option.textContent=calendar.name;select.append(option);}
        if(!select.options.length){select.append(new Option(t('没有可写入的日历','No writable calendar'),''));throw Error(t('请在系统日历中添加或启用一个可写入的日历，然后重新打开此窗口','Enable a writable calendar in Calendar, then reopen this window'));}submit.disabled=false;
    }catch(e){error.textContent=String((e as Error).message || e);}
}
