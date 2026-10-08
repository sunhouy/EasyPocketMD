/** @jest-environment jsdom */
import { nativeFileApi } from '../../js/native-file';

afterEach(() => { delete window.__TAURI__; delete window.desktopRuntime; });
it('opens a search link once when noopener returns null without clicking another link or navigating the editor', async () => {
    const url = 'https://www.baidu.com/s?wd=selected';
    const currentUrl = window.location.href;
    const open = jest.spyOn(window, 'open').mockReturnValue(null);
    const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    await nativeFileApi.openExternalUrl(url);
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith(url, '_blank', 'noopener,noreferrer');
    expect(click).not.toHaveBeenCalled(); expect(error).not.toHaveBeenCalled();
    expect(window.location.href).toBe(currentUrl);
});
it('uses the native opener when available and opens only one browser window on failure', async () => {
    const invoke = jest.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(Error('Unavailable'));
    window.__TAURI__ = {core:{invoke}} as any;
    const open = jest.spyOn(window, 'open').mockReturnValue(null);
    const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    await nativeFileApi.openExternalUrl('https://www.baidu.com/'); expect(open).not.toHaveBeenCalled();
    await nativeFileApi.openExternalUrl('https://www.baidu.com/'); expect(open).toHaveBeenCalledTimes(1);
    expect(click).not.toHaveBeenCalled(); expect(error).not.toHaveBeenCalled();
});
