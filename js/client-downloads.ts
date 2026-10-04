const RELEASE_ROOT = 'https://github.com/sunhouy/EasyPocketMD/releases';
const ASSETS = { android: 'android.apk', windows: 'windows-x64.exe', macos: 'macos-universal.dmg', linuxDeb: 'linux-amd64.deb', linuxAppImage: 'linux-amd64.AppImage' };
export function releaseVersion(raw: unknown): string {
    const version = String(raw ?? '').trim().split(/\r?\n/)[0].replace(/^v/i, '');
    return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version) ? version : '';
}
export function clientDownloadLinks(raw: unknown) {
    const version = releaseVersion(raw);
    return Object.fromEntries(Object.entries(ASSETS).map(([platform, suffix]) => [platform, version
        ? `${RELEASE_ROOT}/download/v${version}/easypocketmd-${version}-${suffix}`
        : `${RELEASE_ROOT}/latest`])) as Record<keyof typeof ASSETS, string>;
}
