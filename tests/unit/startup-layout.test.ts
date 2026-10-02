/** @jest-environment jsdom */
import {observeNoticeHeight} from '../../js/main/notice-layout';
import {isUntouchedGuestWelcome} from '../../js/files/sync/revisions';
it('uses the actual wrapped banner height rather than a fixed 40px',()=>{
    const banner=document.createElement('div');
    jest.spyOn(banner,'getBoundingClientRect').mockReturnValue({height:91.2} as DOMRect);
    observeNoticeHeight(banner);
    expect(document.documentElement.style.getPropertyValue('--top-notice-height')).toBe('92px');
});
it('drops only untouched automatic guest welcome documents',()=>{
    const file={type:'file',name:'未命名文档',autoCreatedGuestWelcome:true};
    const content='# 欢迎使用 EasyPocketMD\n\n这是一个新的文档。\n\n开始编写吧！';
    expect(isUntouchedGuestWelcome(file,content)).toBe(true);
    expect(isUntouchedGuestWelcome(file,content+'edited')).toBe(false);
    expect(isUntouchedGuestWelcome({...file,autoCreatedGuestWelcome:false},content)).toBe(false);
    expect(isUntouchedGuestWelcome({...file,contentVersion:2},content)).toBe(false);
});
