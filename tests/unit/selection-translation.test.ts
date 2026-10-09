/** @jest-environment jsdom */
import { showSelectionTranslation, selectionTranslationContext } from '../../js/main/selection-translation';

const originalFetch = window.fetch;
afterEach(() => { window.fetch = originalFetch; });
it.each(['zh','en'])('shows the translation without provider branding in %s and still reports loading', async language => {
    let complete: (value: any) => void;
    const fetch = jest.fn(() => new Promise(resolve => {complete = resolve;}));
    window.fetch = fetch as any;
    const app = {i18n:{getLanguage:()=>language}, getApiBaseUrl:()=>'/api'};
    const opening = showSelectionTranslation('Hello', app);
    const modal = document.querySelector<HTMLElement>('.selection-translation-modal')!;
    const status = modal.querySelector<HTMLElement>('[role=status]')!;
    expect(status.hidden).toBe(false); expect(status.textContent).toBe(language === 'en' ? 'Translating…' : '翻译中…');
    complete!({ok:true,json:async()=>({success:true,data:{text:'你好'}})}); await opening;
    expect(modal.querySelector('textarea')!.value).toBe('你好'); expect(status.hidden).toBe(true);
    expect(modal.textContent).not.toMatch(/腾讯云|Tencent Cloud/);
    expect(fetch).toHaveBeenCalledTimes(1);
    modal.querySelector<HTMLButtonElement>('.modal-close-btn')!.click(); expect(modal.isConnected).toBe(false);
});

it('prefers the configured model, sends bounded context separately, and lets cloud translation override it',async()=>{
    localStorage.setItem('ai_config',JSON.stringify({apiKey:'test-key',baseUrl:'https://model.example/v1',model:'translate-model'}));
    const fetch=jest.fn().mockResolvedValue({ok:true,json:async()=>({choices:[{message:{content:'你好'}}]})});window.fetch=fetch as any;
    const app={getApiBaseUrl:()=>'/api',userSettings:{translationMethod:'auto'}};
    await showSelectionTranslation('Hello',app,'A nearby paragraph.');
    expect(fetch.mock.calls[0][0]).toBe('https://model.example/v1/chat/completions');
    const body=JSON.parse((fetch.mock.calls[0] as any)[1].body);expect(body.model).toBe('translate-model');expect(JSON.parse(body.messages[1].content)).toEqual({context:'A nearby paragraph.',selectedText:'Hello'});
    expect(body.messages[0].content).toContain('Translate only selectedText');document.querySelector<HTMLButtonElement>('.modal-close-btn')!.click();
    app.userSettings.translationMethod='cloud';fetch.mockResolvedValue({ok:true,json:async()=>({success:true,data:{text:'你好'}})});
    await showSelectionTranslation('Hello',app,'context');expect(fetch.mock.calls.at(-1)![0]).toBe('/api/translate');document.querySelector<HTMLButtonElement>('.modal-close-btn')!.click();
    localStorage.removeItem('ai_config');
});

it('provides nearby paragraph context without unrelated paragraphs',()=>{
    document.body.innerHTML='<div id="vditor"><div contenteditable="true"><p>unrelated</p><p>previous paragraph</p><p>selected words</p><p>following paragraph</p><p>far away</p></div></div>';
    const owner=document.querySelectorAll('p')[2],range=document.createRange();range.selectNodeContents(owner);
    const context=selectionTranslationContext('selected words',range,owner,{});
    expect(context).toContain('previous paragraph');expect(context).toContain('selected words');expect(context).toContain('following paragraph');expect(context).not.toContain('unrelated');expect(context).not.toContain('far away');expect(context.length).toBeLessThanOrEqual(4000);
});
