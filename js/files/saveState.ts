import type { PendingServerSyncMap, SaveStatusKind } from './types';

export function loadPendingServerSync(storage: Storage): PendingServerSyncMap {
  try {
    const stored = storage.getItem('vditor_pending_server_sync');
    return stored ? (JSON.parse(stored) as PendingServerSyncMap) : {};
  } catch (error) {
    console.warn('Failed to load pending server sync:', error);
    return {};
  }
}

export function persistPendingServerSync(storage: Storage, map: PendingServerSyncMap): void {
  try {
    storage.setItem('vditor_pending_server_sync', JSON.stringify(map));
  } catch (error) {
    console.warn('Failed to persist pending server sync:', error);
  }
}

export function markPendingServerSync(
  globalRef: any,
  fileId: string,
  pending: boolean,
  storage: Storage,
): void {
  if (!fileId) return;
  const map = (globalRef.pendingServerSync || {}) as PendingServerSyncMap;
  if (pending) {
    map[fileId] = true;
  } else {
    delete map[fileId];
  }
  globalRef.pendingServerSync = map;
  persistPendingServerSync(storage, map);
}

export function getSaveStatusText(kind: SaveStatusKind, isEn: boolean): string {
  if (kind === 'saving') return isEn ? 'Saving...' : '保存中...';
  if (kind === 'failed') return isEn ? 'Save failed' : '保存失败';
  return isEn ? 'Saved' : '已保存';
}

export function showSaveStatus(globalRef: any, kind: SaveStatusKind, isEn: boolean): void {
  if (typeof globalRef.showSyncStatus !== 'function') return;
  const text = getSaveStatusText(kind, isEn);
  if (kind === 'saving') {
    globalRef.showSyncStatus(text, 'syncing');
    return;
  }
  if (kind === 'failed') {
    globalRef.showSyncStatus(text, 'error');
    return;
  }
  globalRef.showSyncStatus(text, 'success');
}
