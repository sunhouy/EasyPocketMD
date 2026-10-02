/// <reference lib="dom" />
export type SyncStatus = 'syncing' | 'synced' | 'remote' | 'conflict' | 'offline' | 'offline-dirty' | 'pending';
const states: Record<SyncStatus, [string, string]> = {
    syncing: ['fa-arrows-rotate fa-spin', '同步中'], synced: ['fa-circle-check', '已同步'],
    remote: ['fa-cloud-arrow-down', '云端有更新'], conflict: ['fa-triangle-exclamation', '本地与云端冲突，点击处理'],
    offline: ['fa-plug-circle-xmark', '离线'], 'offline-dirty': ['fa-cloud-arrow-up', '离线，本地有修改'], pending: ['fa-clock', '等待同步']
};
export function deviceId(): string {
    let id = localStorage.getItem('epm-device-id');
    if (id) return id;
    const created: string = crypto.randomUUID(); localStorage.setItem('epm-device-id', created); return created;
}
export function syncStatus(file: any, online: boolean, dirty: boolean): SyncStatus {
    if (file.syncConflict) return 'conflict';
    if (!online) return dirty ? 'offline-dirty' : 'offline';
    if (file.syncBusy) return 'syncing';
    if (file.remoteContentVersion && Number(file.remoteContentVersion) > Number(file.contentVersion || 0)) return 'remote';
    return dirty ? 'pending' : 'synced';
}
/** A small per-file journal avoids serializing the whole workspace for every edit. */
const snapshotFields = ['content','lastModified','contentVersion','serverLastModified','crdtBaseContent','crdtBaseContentVersion','isSynced','contentLoaded','contentFetchedAt','e2e_enabled','e2eEnabled','localSyncedContent','localPendingWrite','remoteContentVersion','syncConflict','syncConflictRemoteContent','syncConflictVersion','syncConflictDiskContent'];
export function persistFile(file: any, serialize?: (files: any[]) => string): void {
    const snapshot = { ...file }; delete snapshot.syncBusy;
    const data = serialize ? serialize([snapshot]) : JSON.stringify([snapshot]);
    let error: unknown;
    try { localStorage.setItem('epm-file:' + file.id, data); } catch (reason) { error = reason; }
    const manager = (window as any).IndexedDBManager;
    if (manager?.saveFile) void manager.saveFile('epm-file:' + file.id, data, 'application/json').catch((reason: unknown) => {
        if (error) (window as any).showMessage?.('本地保存失败，请导出备份：' + String(reason), 'error');
    });
    else if (error) throw error;
}
function timestamp(value: any) { return typeof value === 'number' ? value : Date.parse(value || '') || 0; }
function applySnapshot(file: any, saved: any) {
    if (!saved || timestamp(saved.lastModified) < timestamp(file.lastModified)) return;
    for (const key of snapshotFields) {
        if (key in saved) file[key] = saved[key]; else if (key.startsWith('syncConflict')) delete file[key];
    }
}
export function restoreFiles(files: any[]): void {
    for (const file of files) {
        try { applySnapshot(file, JSON.parse(localStorage.getItem('epm-file:' + file.id) || 'null')?.[0]); }
        catch { /* A damaged journal must not hide the original cache. */ }
    }
}
export async function restoreFileFromDB(file: any, manager: any): Promise<void> {
    if (!manager?.getFile) return;
    try { const saved = await manager.getFile('epm-file:' + file.id); if (saved?.data) applySnapshot(file, JSON.parse(saved.data)?.[0]); }
    catch { /* The synchronous cache still remains available. */ }
}
export function refreshSyncIcons(globalRef: any): void {
    for (const file of globalRef.files || []) {
        if (file.type !== 'file') continue;
        const anchor = document.getElementById(file.id + '_anchor'); if (!anchor) continue;
        const status = syncStatus(file, navigator.onLine !== false, !!(globalRef.unsavedChanges?.[file.id] || globalRef.pendingServerSync?.[file.id] || file.isSynced === false));
        let icon = anchor.querySelector<HTMLButtonElement>('.file-sync-icon');
        if (!icon) { icon = document.createElement('button'); icon.type = 'button'; icon.className = 'file-sync-icon';
            icon.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); if (file.syncConflict) globalRef.openSyncConflict?.(file.id); }); anchor.appendChild(icon); }
        const [symbol, label] = states[status]; if (icon.dataset.state !== status) { icon.dataset.state = status; icon.className = 'file-sync-icon ' + status; icon.title = label; icon.setAttribute('aria-label', label);
        icon.innerHTML = '<i class="fas ' + symbol + '" aria-hidden="true"></i>'; }
        let tag = anchor.querySelector('.file-local-label');
        if (file.isExternalLocal || file.localOriginDeviceId) {
            if (!tag) { tag = document.createElement('small'); tag.className = 'file-local-label'; anchor.appendChild(tag); }
            tag.textContent = file.localFileMode === 'remote' ? '本地非本机' : '本地';
        } else tag?.remove();
    }
}
