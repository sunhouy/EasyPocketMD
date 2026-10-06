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
const snapshotFields = ['localCheckpointRevision','cloudSaveReceipts','content','createdAt','pendingCloudContent','pendingCloudBaseVersion','previousCloudContent','previousCloudBaseVersion','lastModified','contentVersion','serverLastModified','crdtBaseContent','crdtBaseContentVersion','isSynced','contentLoaded','contentFetchedAt','e2e_enabled','e2eEnabled','localSyncedContent','localPendingWrite','remoteContentVersion','syncConflict','syncConflictRemoteContent','syncConflictVersion','syncConflictDiskContent'];
const journalWrites = new Map<string, Promise<any>>();
export function persistFile(file: any, serialize?: (files: any[]) => string): boolean {
    file.localCheckpointRevision = Number(file.localCheckpointRevision || 0) + 1;
    const snapshot = { ...file }; delete snapshot.syncBusy;
    const data = serialize ? serialize([snapshot]) : JSON.stringify([snapshot]);
    let error: unknown;
    try { localStorage.setItem('epm-file:' + file.id, data); } catch (reason) { error = reason; }
    const manager = (window as any).IndexedDBManager;
    if (manager?.saveFile) {
        const key = 'epm-file:' + file.id;
        const write = () => manager.saveFile(key, data, 'application/json');
        // Start the first write immediately; subsequent writes must commit in order.
        const previous = journalWrites.get(key);
        const task = (previous ? previous.catch(() => {}).then(write) : Promise.resolve(write())).then(() => true).catch((reason: unknown) => {
            if (error) (window as any).showMessage?.('本地保存失败，请导出备份：' + String(reason), 'error');
            return false;
        });
        journalWrites.set(key, task);
        void task.finally(() => { if (journalWrites.get(key) === task) journalWrites.delete(key); });
    }
    else if (error) throw error;
    return !error;
}
/** Normal network saves may wait for DB durability when the synchronous cache is full. */
export async function persistFileDurably(file: any, serialize?: (files: any[]) => string): Promise<boolean> {
    try {
        if (persistFile(file, serialize)) return true;
        const task = journalWrites.get('epm-file:' + file.id);
        return task ? (await task) === true : false;
    } catch { return false; }
}
function timestamp(value: any) { return typeof value === 'number' ? value : Date.parse(value || '') || 0; }
function applySnapshot(file: any, saved: any) {
    if (!saved) return;
    const savedRevision = Number(saved.localCheckpointRevision || 0);
    const liveRevision = Number(file.localCheckpointRevision || 0);
    if (savedRevision || liveRevision) { if (savedRevision <= liveRevision) return; }
    else if (timestamp(saved.lastModified) < timestamp(file.lastModified)) return;
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
    // Restore the synchronous checkpoint immediately, then compare DB's sequence.
    // DB can be newer if localStorage ran out of space; it can also still be older.
    try {
        const local = JSON.parse(localStorage.getItem('epm-file:' + file.id) || 'null')?.[0];
        if (local) applySnapshot(file, local);
    } catch {}
    if (!manager?.getFile) return;
    const revision = file.localCheckpointRevision;
    const content = file.content;
    const modified = file.lastModified;
    try {
        const saved = await manager.getFile('epm-file:' + file.id);
        if (file.localCheckpointRevision !== revision || file.content !== content || file.lastModified !== modified) return;
        if (saved?.data) applySnapshot(file, JSON.parse(saved.data)?.[0]);
    } catch { /* The in-memory draft still remains available. */ }

}
export function refreshSyncIcons(globalRef: any): void {
    if (typeof document !== 'undefined') document.dispatchEvent(new Event('notes-home-refresh'));
    for (const file of globalRef.files || []) {
        if (file.type !== 'file') continue;
        const anchor = document.getElementById(file.id + '_anchor'); if (!anchor) continue;
        const status = syncStatus(file, navigator.onLine !== false, !!(globalRef.unsavedChanges?.[file.id] || globalRef.pendingServerSync?.[file.id] || file.isSynced === false));
        let icon = anchor.querySelector<HTMLButtonElement>('.file-sync-icon');
        if (!icon) { icon = document.createElement('button'); icon.type = 'button'; icon.className = 'file-sync-icon';
            icon.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); if (file.syncConflict) globalRef.openSyncConflict?.(file.id); }); anchor.appendChild(icon); }
        const name = anchor.querySelector('.file-node-name');
        if (name) name.after(icon);
        const encrypted = [true, 1, '1', 'true'].includes(file.e2e_enabled ?? file.e2eEnabled);
        const vault = globalRef.E2EVault?.state();
        icon.hidden = !!(encrypted && !vault?.unlocked && (vault?.config || vault?.loaded !== true));
        const [symbol, label] = states[status]; if (icon.dataset.state !== status) { icon.dataset.state = status; icon.className = 'file-sync-icon ' + status; icon.title = label; icon.setAttribute('aria-label', label);
        icon.innerHTML = '<i class="fas ' + symbol + '" aria-hidden="true"></i>'; }
        let lock = anchor.querySelector('.file-e2e-indicator');
        if (encrypted) {
            if (!lock) { lock = document.createElement('span'); lock.className = 'file-e2e-indicator'; lock.innerHTML = '<i class="fas fa-lock" aria-hidden="true"></i>'; anchor.appendChild(lock); }
            const label = globalRef.i18n?.getLanguage?.() === 'en' ? 'This file is end-to-end encrypted' : '此文件已使用端到端加密';
            icon.after(lock);
            lock.setAttribute('aria-label', label); lock.setAttribute('title', label);
        } else { lock?.remove(); lock = null; }
        let tag = anchor.querySelector('.file-local-label');
        if (file.isExternalLocal || file.localOriginDeviceId) {
            if (!tag) { tag = document.createElement('small'); tag.className = 'file-local-label'; anchor.appendChild(tag); }
            (lock || icon).after(tag);
            tag.textContent = file.localFileMode === 'remote' ? '本地非本机' : '本地';
        } else { tag?.remove(); tag = null; }
        const menu = anchor.querySelector('.file-menu-btn');
        if (menu) { (lock || icon).after(menu); if (tag) menu.after(tag); }
    }
}
