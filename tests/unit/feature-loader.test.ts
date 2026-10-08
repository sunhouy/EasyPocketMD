/** @jest-environment jsdom */
import { loadFeature } from '../../js/feature-loader';
it('joins silent preloads, shows foreground status, and hides it when ready', async () => {
    let complete:(value:string)=>void;
    const loader=jest.fn(()=>new Promise<string>(resolve=>{complete=resolve;}));
    const silent=loadFeature('pending-test',loader,false);expect(document.getElementById('featureLoadingStatus')).toBeNull();
    const foreground=loadFeature('pending-test',loader);expect(document.getElementById('featureLoadingStatus')?.textContent).toBe('加载中…');
    await new Promise(resolve=>setTimeout(resolve,30));complete!('ready');expect(await foreground).toBe('ready');await silent;
    expect(loader).toHaveBeenCalledTimes(1);expect(document.getElementById('featureLoadingStatus')).toBeNull();
    await loadFeature('pending-test',loader);expect(document.getElementById('featureLoadingStatus')).toBeNull();
});
it('allows retry after failed silent loading', async () => {
    const loader=jest.fn().mockRejectedValueOnce(Error('offline')).mockResolvedValueOnce('ready');
    await expect(loadFeature('retry-test',loader,false)).rejects.toThrow('offline');
    expect(await loadFeature('retry-test',loader,false)).toBe('ready');expect(loader).toHaveBeenCalledTimes(2);
});
