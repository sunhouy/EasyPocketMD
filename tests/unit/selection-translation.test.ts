/** @jest-environment jsdom */
import { showSelectionTranslation } from '../../js/main/selection-translation';

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
