/** @jest-environment jsdom */
import {createDeploymentRouteStatus} from '../../js/main/deployment-route';
let language = 'zh';
beforeEach(() => {
    document.body.innerHTML = '<div data-deployment-route></div><div data-deployment-route></div>';
    language = 'zh';
    window.i18n = {getLanguage:()=>language} as any;
    window.getApiBaseUrl = () => '/api';
    global.fetch = jest.fn();
});
it.each(['domestic','overseas'])('labels the actual gateway metadata %s on both menus', async route => {
    jest.mocked(fetch).mockResolvedValue({ok:true,json:async()=>({route})} as Response);
    const refresh = createDeploymentRouteStatus(); await refresh();
    const expected = route === 'domestic' ? '当前线路：国内' : '当前线路：境外';
    document.querySelectorAll('[data-deployment-route]').forEach(element=>expect(element.textContent).toBe(expected));
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/deployment-route.json'), expect.objectContaining({cache:'no-store'}));
    language='en'; window.dispatchEvent(new Event('languagechange'));
    expect(document.body.textContent).toContain(route==='domestic' ? 'Mainland China' : 'Overseas');
    await refresh(); expect(fetch).toHaveBeenCalledTimes(1);
});
it('does not mistake the domestic API for the overseas serving gateway and coalesces concurrent checks', async()=>{
    let finish!: (value:Response)=>void;
    jest.mocked(fetch).mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
    window.getApiBaseUrl=()=> 'https://md.example.com/api';
    const refresh=createDeploymentRouteStatus(), first=refresh(), second=refresh();
    expect(first).toBe(second);
    finish({ok:true,json:async()=>({route:'overseas'})} as Response); await first;
    expect(fetch).toHaveBeenCalledWith('https://md.example.com/deployment-route.json', expect.anything());
    expect(document.body.textContent).toContain('境外');
});
it.each(['offline','invalid'])('reports unknown when metadata is %s rather than guessing a country', async kind=>{
    if(kind==='offline') jest.mocked(fetch).mockRejectedValue(new Error('offline'));
    else jest.mocked(fetch).mockResolvedValue({ok:true,json:async()=>({route:'unexpected'})} as Response);
    await createDeploymentRouteStatus()(); expect(document.body.textContent).toContain('未识别');
});
