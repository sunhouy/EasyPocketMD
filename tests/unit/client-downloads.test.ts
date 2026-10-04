/** @jest-environment jsdom */
// @ts-nocheck
import { clientDownloadLinks, releaseVersion } from '../../js/client-downloads';
const root = 'https://github.com/sunhouy/EasyPocketMD/releases';
beforeEach(() => {
    jest.resetModules(); localStorage.clear();
    window.__APP_PACKAGE_VERSION__ = '2.9.9'; window.electron = {}; window.nativeFileOps = { openExternalUrl: jest.fn(async () => {}) };
    window.customConfirm = jest.fn(async () => true);
    window.fetch = jest.fn(async () => ({ ok: true, text: async () => 'v2.9.10\n' }));
    window.open = jest.fn(); require('../../js/version-check');
});
afterEach(() => { jest.restoreAllMocks(); delete window.__APP_PACKAGE_VERSION__; delete window.electron; delete window.nativeFileOps; });
it('builds the supplied four installation URLs and the published AppImage name, changing only the version', () => {
    expect(clientDownloadLinks('v2.9.10')).toEqual({
        android: root + '/download/v2.9.10/easypocketmd-2.9.10-android.apk',
        windows: root + '/download/v2.9.10/easypocketmd-2.9.10-windows-x64.exe',
        macos: root + '/download/v2.9.10/easypocketmd-2.9.10-macos-universal.dmg',
        linuxDeb: root + '/download/v2.9.10/easypocketmd-2.9.10-linux-amd64.deb',
        linuxAppImage: root + '/download/v2.9.10/easypocketmd-2.9.10-linux-amd64.AppImage'
    });
    expect(clientDownloadLinks('2.10.0').android).toBe(root + '/download/v2.10.0/easypocketmd-2.10.0-android.apk');
    expect(releaseVersion('../../elsewhere')).toBe(''); expect(clientDownloadLinks('').windows).toBe(root + '/latest');
});
it.each([
    ['Mozilla Windows NT', 'windows-x64.exe'], ['Mozilla Macintosh', 'macos-universal.dmg'],
    ['Mozilla Linux x86_64', 'linux-amd64.deb'], ['Mozilla Linux Android', 'android.apk']
])('updates %s using the detected new release rather than the installed version', async (ua, suffix) => {
    jest.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ua);
    const result = await window.checkNativeAppVersionUpdate({ force: true });
    expect(result.data.status).toBe('update-accepted');
    expect(window.nativeFileOps.openExternalUrl).toHaveBeenCalledWith(root + '/download/v2.9.10/easypocketmd-2.9.10-' + suffix);
    expect(window.getClientDownloadLinks().android).toContain('/v2.9.10/'); expect(window.getCurrentAppVersion()).toBe('2.9.9');
});
it('refreshes About download links without displaying an update prompt and coalesces simultaneous refreshes', async () => {
    await Promise.all([window.refreshClientDownloadLinks(), window.refreshClientDownloadLinks()]);
    expect(fetch).toHaveBeenCalledTimes(1); expect(window.customConfirm).not.toHaveBeenCalled();
    expect(window.getClientDownloadLinks().windows).toBe(root + '/download/v2.9.10/easypocketmd-2.9.10-windows-x64.exe');
});
it('uses a direct GitHub installer for a forced browser update check', async () => {
    delete window.electron; delete window.nativeFileOps;
    jest.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla Android');
    await window.checkNativeAppVersionUpdate({ force: true });
    expect(window.open).toHaveBeenCalledWith(root + '/download/v2.9.10/easypocketmd-2.9.10-android.apk', '_blank', 'noopener');
});
it('keeps GitHub links when refreshing version metadata fails', async () => {
    fetch.mockRejectedValue(new Error('offline'));
    await expect(window.refreshClientDownloadLinks()).rejects.toThrow('offline');
    expect(Object.values(window.getClientDownloadLinks()).every(url => url.startsWith(root))).toBe(true);
});
