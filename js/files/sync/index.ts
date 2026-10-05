import SHA256 from 'crypto-js/sha256';
import { isEditorComposing, waitForEditorCommit, compositionRevision } from '../../editor-composition';
import { isUntouchedGuestWelcome } from './revisions';
import { safeMerge } from '../../../api/utils/safeMerge';
import { SyncQueue } from './queue';
import { persistFile, persistFileDurably, restoreFileFromDB, refreshSyncIcons, deviceId } from './local-state';
import { showSyncConflict } from './conflict';
import { createWebSocketClient, createSyncThrottle } from '../websocket-sync';

export function normalizeServerFileRecord(f: any): any {
  let type = 'file';
  let content = f.content;
  let name = (f.name || '').startsWith('/') ? f.name.substring(1) : (f.name || '');

  if (name.endsWith('/') || content === '{"meta":"folder"}' || content === '{"type":"folder"}') {
    type = 'folder';
    content = '';
    if (name.endsWith('/')) name = name.substring(0, name.length - 1);
  }

  const hasContentVersion =
    (f.content_version !== undefined && f.content_version !== null && f.content_version !== '') ||
    (f.contentVersion !== undefined && f.contentVersion !== null && f.contentVersion !== '');
  const rawE2E = f.e2e_enabled !== undefined && f.e2e_enabled !== null && f.e2e_enabled !== ''
    ? f.e2e_enabled
    : f.e2eEnabled;
  const e2eEnabled = rawE2E === true || rawE2E === 1 || rawE2E === '1' || rawE2E === 'true' ? 1 : 0;

  const contentLoaded = type === 'folder' || (f.content !== undefined && f.content !== null);
  return {
    ...f,
    name,
    type,
    content: type === 'folder' ? '' : (contentLoaded ? (content ?? '') : undefined),
    contentLoaded,
    e2e_enabled: e2eEnabled,
    e2eEnabled: !!e2eEnabled,
    createdAt: f.created_at ?? f.createdAt ?? null,
    lastModified: f.last_modified || f.lastModified || null,
    serverLastModified: f.last_modified || f.lastModified || null,
    contentVersion: hasContentVersion ? Number(f.content_version ?? f.contentVersion) : null,
  };
}

export function createSyncRuntimeApi(ctx: any) {
  const {
    globalRef,
    g,
    isExternalLocalFile,
    getCurrentEditorContent,
    setEditorContentForFile,
    markPendingServerSync,
    tryHandleTokenExpired,
    pullServerUpdatesForCleanFiles,
    fetchServerFileContent,
    isEn,
    writeExternalLocalContent,
    applyExternalRemoteUpdate,
  } = ctx;
  const queue = new SyncQueue();
  const persist = (file: any) => { try { persistFile(file, window.e2eSerializeFiles); } catch (error) { globalRef.showMessage?.('本地保存失败，请导出备份：' + String(error), 'error'); } refreshSyncIcons(globalRef); };
  let syncingAll = false;
  async function baseContent(file: any): Promise<string | undefined> {
    const stored = file.crdtBaseContent ?? (g('lastSyncedContent') || {})[file.id] ?? file.localSyncedContent;
    if (typeof stored !== 'string') return undefined;
    const e2e = await import('../../e2e'); return e2e.resolveFileContent(stored, g('currentUser')?.password, isFileE2EEnabled(file));
  }
  function recordSentContent(file: any, content: string, version: any) {
    if (file.pendingCloudContent !== content) {
      file.previousCloudContent = file.pendingCloudContent;
      file.previousCloudBaseVersion = file.pendingCloudBaseVersion;
    }
    file.pendingCloudContent = content; file.pendingCloudBaseVersion = version;
    file.cloudSaveReceipts ||= [];
    if (!file.cloudSaveReceipts.some((receipt: any) => receipt.hash === SHA256(content).toString() && receipt.baseVersion === version)) {
      file.cloudSaveReceipts.push({ hash: SHA256(content).toString(), baseVersion: version });
    }
  }
  async function mergeBaseForRemote(file: any, remote: string, version: number, fallback: string | undefined) {
    const e2e = await import('../../e2e');
    for (const receipt of file.cloudSaveReceipts || []) {
      if (version <= Number(receipt.baseVersion ?? 0)) continue;
      if (receipt.hash === SHA256(remote).toString()) return remote;
    }
    for (const [field, baseVersion] of [['pendingCloudContent', 'pendingCloudBaseVersion'], ['previousCloudContent', 'previousCloudBaseVersion']]) {
      if (typeof file[field] !== 'string' || version <= Number(file[baseVersion] || 0)) continue;
      const sent = await e2e.resolveFileContent(file[field], g('currentUser')?.password, isFileE2EEnabled(file));
      if (sent === remote) return remote;
    }
    return fallback;
  }
  async function resolveConflict(file: any) {
    if (!file.syncConflict) return;
    const e2e = await import('../../e2e');
    const remote = await e2e.resolveFileContent(file.syncConflictRemoteContent, g('currentUser')?.password, isFileE2EEnabled(file));
    const local = file.id === g('currentFileId') ? getCurrentEditorContent(file.id, file.content) : await e2e.resolveFileContent(file.content, g('currentUser')?.password, isFileE2EEnabled(file));
    const disk = typeof file.syncConflictDiskContent === 'string' ? await e2e.resolveFileContent(file.syncConflictDiskContent, g('currentUser')?.password, isFileE2EEnabled(file)) : undefined;
    await showSyncConflict(globalRef, file, local, remote, async (chosen) => {
      const live = file.id === g('currentFileId') ? getCurrentEditorContent(file.id, file.content) : file.content;
      if (live !== local) throw new Error('文档在处理冲突期间有新修改，请重新打开冲突页面。');
      file.content = chosen; file.contentLoaded = true;
      file.contentVersion = file.syncConflictVersion;
      file.crdtBaseContentVersion = file.syncConflictVersion; file.crdtBaseContent = remote;
      g('lastSyncedContent')[file.id] = remote;
      delete file.syncConflict; delete file.syncConflictRemoteContent; delete file.syncConflictVersion; delete file.syncConflictDiskContent;
      file.isSynced = false; file.lastModified = Date.now(); g('unsavedChanges')[file.id] = true; markPendingServerSync(file.id, true);
      if (file.id === g('currentFileId')) setEditorContentForFile(file.id, chosen, { preserveCursor: true });
      persist(file); void syncFileToServer(file.id, { background: true });
    }, disk);
  }
  globalRef.openSyncConflict = (id: string) => { const file = g('files').find((f: any) => f.id === id); if (file) void resolveConflict(file).catch(console.warn); };
  function conflict(file: any, remote: string, version: number) {
    if (file.id === g('currentFileId')) file.content = getCurrentEditorContent(file.id, file.content);
    file.contentLoaded = true; file.lastModified = Date.now();
    g('unsavedChanges')[file.id] = true;
    file.syncConflict = true; file.syncConflictRemoteContent = remote; file.syncConflictVersion = version;
    file.isSynced = false; markPendingServerSync(file.id, true); persist(file);
    if (file.id === g('currentFileId')) void resolveConflict(file).catch(console.warn);
  }
  async function reconcileRemoteNow(file: any, remote: any) {
    const username = g('currentUser')?.username;
    await waitForEditorCommit(globalRef, file.id);
    if (!username || g('currentUser')?.username !== username || !g('files').includes(file)) return;
    if (!g('currentUser') || file.e2eTransition || file.syncConflict || globalRef.sharedDocState?.ownerFileId === file.id) return;
    if (typeof remote.content !== 'string') {
      file.remoteContentVersion = Number(remote.content_version ?? remote.contentVersion ?? 0);
      persist(file);
      return;
    }
    const wasContentLoaded = file.contentLoaded !== false;
    await globalRef.E2EVault?.initialize();
    const vaultState = globalRef.E2EVault?.state();
    if (vaultState?.config && !vaultState.unlocked && isFileE2EEnabled(file)) { file.remoteContentVersion = Number(remote.content_version ?? remote.contentVersion ?? 0); persist(file); return; }
    const version = Number(remote.content_version ?? remote.contentVersion ?? 0);
    if (version < Number(file.contentVersion || 0)) return;
    const e2e = await import('../../e2e');
    const content = await e2e.resolveFileContent(String(remote.content ?? ''), g('currentUser')?.password, isFileE2EEnabled(remote));
    const base = await mergeBaseForRemote(file, content, version, await baseContent(file));
    await waitForEditorCommit(globalRef, file.id);
    if (g('currentUser')?.username !== username || version < Number(file.contentVersion || 0)) return;
    const originalLocal = file.id === g('currentFileId') ? getCurrentEditorContent(file.id, file.content) : await e2e.resolveFileContent(String(file.content ?? ''), g('currentUser')?.password, isFileE2EEnabled(file));
    let local = originalLocal;
    if (isExternalLocalFile(file) && ctx.readExternalSourceContent) {
      const disk = await ctx.readExternalSourceContent(file, file.id).catch(() => null);
      if (disk === null) { file.remoteContentVersion = version; persist(file); return; }
      await waitForEditorCommit(globalRef, file.id);
      if (file.id === g('currentFileId') && getCurrentEditorContent(file.id, file.content) !== originalLocal) return reconcileRemoteNow(file, remote);
      const combined = safeMerge(base, local, disk);
      if (!combined.clean) { file.syncConflictDiskContent = disk; conflict(file, content, version); return; }
      local = combined.content;
    }
    const dirty = local !== originalLocal || (typeof base === 'string' && local !== base) || !!(g('pendingServerSync')?.[file.id] || g('unsavedChanges')?.[file.id] || file.isSynced === false || (file.id === g('currentFileId') && local !== file.content));
    const merged = dirty ? safeMerge(base, local, content) : { clean: true as const, content };
    if (!merged.clean) { conflict(file, content, version); return; }
    if (isExternalLocalFile(file) && !(await writeExternalLocalContent(file, merged.content)).success) { file.remoteContentVersion = version; persist(file); return; }
    // Awaiting a physical write can race with typing; don't discard the newer draft.
    await waitForEditorCommit(globalRef, file.id);
    if (version < Number(file.contentVersion || 0)) return;
    const live = file.id === g('currentFileId') ? getCurrentEditorContent(file.id, file.content) : file.content;
    const final = live !== originalLocal ? safeMerge(originalLocal, live, merged.content) : merged;
    if (!final.clean) { conflict(file, content, version); return; }
    file.content = final.content; file.contentLoaded = true; file.contentFetchedAt = Date.now(); file.contentVersion = version;
    file.crdtBaseContent = content; file.crdtBaseContentVersion = version;
    file.serverLastModified = remote.last_modified ?? remote.serverLastModified; file.lastModified = Date.now();
    if (isExternalLocalFile(file)) { file.localSyncedContent = content; file.localCloudUsername = g('currentUser').username; if (final.content !== merged.content) file.localPendingWrite = true; }
    g('lastSyncedContent')[file.id] = content; file.isSynced = final.content === content;
    if (file.isSynced) { delete file.pendingCloudContent; delete file.pendingCloudBaseVersion; delete file.previousCloudContent; delete file.previousCloudBaseVersion; file.cloudSaveReceipts = (file.cloudSaveReceipts || []).filter((receipt: any) => receipt.hash !== SHA256(file.crdtBaseContent || '').toString()); }
    g('unsavedChanges')[file.id] = !file.isSynced; markPendingServerSync(file.id, !file.isSynced);
    if (file.id === g('currentFileId') && (!wasContentLoaded || live !== final.content)) setEditorContentForFile(file.id, final.content, { preserveCursor: true });
    persist(file);
  }
  function reconcileRemote(file: any, remote: any) {
    const previous = fileSyncLocks.get(file.id) || Promise.resolve();
    const task = previous.catch(() => {}).then(() => reconcileRemoteNow(file, remote));
    fileSyncLocks.set(file.id, task);
    return task.finally(() => { if (fileSyncLocks.get(file.id) === task) fileSyncLocks.delete(file.id); });
  }
  globalRef.reconcileRemoteFile = reconcileRemote;
  globalRef.queueBackgroundFileSync = (selectedId?: string) => {
    if (navigator.onLine === false || !g('currentUser')) { refreshSyncIcons(globalRef); return; }
    for (const file of g('files') || []) {
      if (file.type !== 'file' || file.e2eTransition || file.syncConflict) continue;
      const priority = file.id === (selectedId || g('currentFileId')) ? 100 : (g('pendingServerSync')?.[file.id] ? 50 : 0);
      void queue.enqueue(file.id, priority, async () => {
        if (navigator.onLine === false || !g('currentUser') || file.syncConflict || globalRef.fileRelocationInProgress || !g('files').includes(file)) return;
        if (isUntouchedGuestWelcome(file, file.id === g('currentFileId') ? getCurrentEditorContent(file.id, file.content) : file.content)) return;
        await globalRef.E2EVault?.initialize();
        const state = globalRef.E2EVault?.state();
        if (state?.config && !state.unlocked && isFileE2EEnabled(file)) return;
        await restoreFileFromDB(file, globalRef.IndexedDBManager);
        if (isExternalLocalFile(file) && !['ready','copy'].includes(file.localAccessState)) {
          if (!(await ctx.ensureExternalLocalAccess?.(file, false))) return;
        }
        if (g('pendingServerSync')?.[file.id] || file.isSynced === false) await syncFileToServer(file.id, { background: true });
        else if (file.contentLoaded === false || Number(file.remoteContentVersion || 0) > Number(file.contentVersion || 0)) {
          const clone = { ...file };
          await fetchServerFileContent(clone);
          await reconcileRemote(file, clone); if (file.contentVersion === clone.contentVersion) delete file.remoteContentVersion;
        }
      }).catch(console.warn);
    }
  };
  globalRef.refreshFileSyncIcons = () => refreshSyncIcons(globalRef);
  const online = () => { refreshSyncIcons(globalRef); if (g('currentUser')) { globalRef.wsClient?.connect(); void syncAllFiles(); } };
  globalRef.addEventListener?.('online', online);
  globalRef.addEventListener?.('offline', () => refreshSyncIcons(globalRef));
  const fileSyncLocks = new Map<string, Promise<any>>();
  const scheduledSaves = new Set<Promise<any>>();

  function isFileE2EEnabled(file: any) {
    if (!file) return false;
    const raw = file.e2e_enabled !== undefined && file.e2e_enabled !== null && file.e2e_enabled !== ''
      ? file.e2e_enabled
      : file.e2eEnabled;
    return raw === true || raw === 1 || raw === '1' || raw === 'true';
  }

  async function handleRemoteFileUpdate(payload: any) {
    const files = g('files');
    const filename = payload.filename;
    const file = files.find(function(f: any) { return f.name === filename; });
    if (!file || file.type === 'folder' || file.e2eTransition) return;
    await reconcileRemote(file, payload);
  }

  async function scheduleWebSocketSync(fileId: string) {
    if (isEditorComposing(globalRef, fileId) || globalRef.fileRelocationInProgress || !g('currentUser')) return;
    const file = g('files').find((item: any) => item.id === fileId);
    if (!file || file.type !== 'file' || isExternalLocalFile(file) || file.e2eTransition) return;
    globalRef.wsThrottle?.schedule({ fileId });
  }

  function initWebSocketClient() {
    if (globalRef.wsClient) return;

    try {
      globalRef.wsThrottle = createSyncThrottle((data: any) => {
        const pending = syncFileToServer(data.fileId, { background: true });
        scheduledSaves.add(pending);
        void pending.finally(() => scheduledSaves.delete(pending));
      });

      globalRef.wsClient = createWebSocketClient({
        getToken: function() {
          const user = g('currentUser');
          return user ? user.token : null;
        },
        onReady: function() {
          globalRef.syncAllFiles();
        },
        onFileUpdated: function(payload: any) {
          return handleRemoteFileUpdate(payload).catch(error => console.error('[WS] Cannot decrypt remote file', error));
        },
        onFileSaved: function(payload: any) {
          // Legacy acknowledgements cannot identify a request; reconcile as a remote revision.
          return handleRemoteFileUpdate(payload).catch(console.warn);
        },
        onFileList: function(_payload: any) {},
        onDisconnected: function() {},
      });
    } catch (e) {
      console.warn('[WS] Failed to init WebSocket client:', e);
    }
  }

  function startAutoSync() {
    if (globalRef.syncInterval) clearInterval(globalRef.syncInterval);
    if (!g('currentUser')) return;

    initWebSocketClient();

    if (globalRef.wsClient && !globalRef.wsClient.isConnected()) {
      globalRef.wsClient.connect();
    }

    globalRef.syncInterval = setInterval(function () {
      if (g('currentUser')) {
        globalRef.syncAllFiles();
      }
    }, 30000);
  }

  function stopAutoSync() {
    if (globalRef.syncInterval) {
      clearInterval(globalRef.syncInterval);
      globalRef.syncInterval = null;
    }
    if (globalRef.wsClient) {
      globalRef.wsClient.disconnect();
      globalRef.wsClient = null;
      globalRef.wsThrottle = null;
    }
  }

  async function syncAllFiles() {
    if (syncingAll || globalRef.fileRelocationInProgress || !g('currentUser') || navigator.onLine === false) return;
    syncingAll = true;
    try { globalRef.queueBackgroundFileSync(g('currentFileId')); await pullServerUpdatesForCleanFiles(); globalRef.queueBackgroundFileSync(g('currentFileId')); }
    catch (error) { console.warn('后台同步失败', error); }
    finally { syncingAll = false; refreshSyncIcons(globalRef); }
  }

  async function syncFileToServer(fileId: string, options: any) {
    if (isEditorComposing(globalRef, fileId)) return false;
    if (globalRef.fileRelocationInProgress && !options?.relocation) return false;
    if (!g('currentUser') || navigator.onLine === false) { refreshSyncIcons(globalRef); return false; }
    await globalRef.E2EVault?.initialize();
    const vaultState = globalRef.E2EVault?.state();
    if (options?.background !== false && vaultState?.config && !vaultState.unlocked && isFileE2EEnabled(g('files').find(f => f.id === fileId))) return false;
    const requestUser = g('currentUser');
    const backgroundSync = !options || options.background !== false;
    const welcome = g('files').find(f => f.id === fileId);
    if (backgroundSync && isUntouchedGuestWelcome(welcome, fileId === g('currentFileId') ? getCurrentEditorContent(fileId, welcome?.content) : welcome?.content)) return false;
    const overrideContent = options && typeof options.overrideContent === 'string' ? options.overrideContent : null;
    const baseLastModifiedOption = options && options.baseLastModified ? options.baseLastModified : null;
    const forcedBaseContentVersion =
      options && options.baseContentVersion != null && options.baseContentVersion !== '' && Number.isFinite(Number(options.baseContentVersion)) ? Number(options.baseContentVersion) : null;
    const files = g('files');
    const file = files.find(function (f: any) {
      return f.id === fileId;
    });
    if (!file) return;
    if (file.syncConflict && !options?.resolveConflict) {
      // Older clients could mark their own acknowledged WS revision as a conflict.
      // Only recover that exact known version; newer remote revisions still need review.
      const knownVersion = Number(file.contentVersion);
      if (!(knownVersion > 0 && Number(file.syncConflictVersion) === knownVersion
        && Number(file.crdtBaseContentVersion) < knownVersion
        && typeof file.syncConflictRemoteContent === 'string' && file.syncConflictDiskContent === undefined)) return false;
      const e2e = await import('../../e2e');
      const remote = await e2e.resolveFileContent(file.syncConflictRemoteContent, requestUser.password, isFileE2EEnabled(file));
      const draft = fileId === g('currentFileId') ? getCurrentEditorContent(fileId, file.content) : file.content;
      if (draft === '' && remote !== '') return false; // An already-lost snapshot cannot prove an intentional deletion.
      file.crdtBaseContent = remote; file.crdtBaseContentVersion = knownVersion;
      g('lastSyncedContent')[fileId] = remote;
      delete file.syncConflict; delete file.syncConflictRemoteContent; delete file.syncConflictVersion;
      if (fileId === g('currentFileId')) document.getElementById('syncConflictPanel')?.remove();
      persist(file);
    }
    if (globalRef.sharedDocState?.ownerFileId === fileId && globalRef.sharedDocState.canEdit && !options?.relocation && !options?.encryptionTransition) return globalRef.scheduleSharedDocSync?.({ manualSave: true });
    if (file.e2eTransition && !options?.encryptionTransition) return false;
    if (isExternalLocalFile(file) && !['ready', 'copy'].includes(file.localAccessState)) return false;
    if (isExternalLocalFile(file)) file.localOriginDeviceId ||= deviceId();

    const previousSyncTask = fileSyncLocks.get(fileId) || Promise.resolve();
    const syncTask = previousSyncTask
      .catch(function () {})
      .then(async function () {
        if (!g('files').includes(file) || isEditorComposing(globalRef, fileId) || file.syncConflict) return false;
        const inputRevision = compositionRevision(globalRef, fileId);
        if (g('currentUser')?.username !== requestUser.username || g('currentUser')?.token !== requestUser.token) return false;
        file.syncBusy = true; refreshSyncIcons(globalRef);
        const baseLastModified = baseLastModifiedOption || file.serverLastModified || null;

        let content;
        let filenameToSend = file.name;
        if (file.type === 'folder') {
          content = '{"meta":"folder"}';
          if (!filenameToSend.endsWith('/')) {
            filenameToSend += '/';
          }
        } else {
          if (file.contentLoaded === false && !g('pendingServerSync')?.[fileId] && typeof fetchServerFileContent === 'function') {
            await fetchServerFileContent(file);
          }
          if (isEditorComposing(globalRef, fileId)) return false;
          content =
            overrideContent !== null
              ? overrideContent
              : file.id === g('currentFileId')
                ? getCurrentEditorContent(file.id, file.content)
                : file.content;

        }

        try {
          // Cloud acknowledgement must never mark an unsaved original as saved.
          if (isExternalLocalFile(file) && !(await writeExternalLocalContent(file, content)).success) return false;
          const api = globalRef.getApiBaseUrl ? globalRef.getApiBaseUrl() : 'api';
          
          let contentToSend = content;
          const fileE2EEnabled = isFileE2EEnabled(file);
          if (globalRef.currentUser && contentToSend && file.type !== 'folder') {
            try {
              const e2e = await import('../../e2e');
              if (fileE2EEnabled) {
                contentToSend = await e2e.resolveFileContent(contentToSend, globalRef.currentUser.password, true);
                content = contentToSend; if (file.id !== g('currentFileId')) file.content = content;
                contentToSend = await e2e.encrypt(contentToSend, globalRef.currentUser.password);
              } else {
                contentToSend = await e2e.resolveFileContent(
                  contentToSend,
                  globalRef.currentUser.password,
                  false,
                );
                content = contentToSend;
              }
            } catch (e) {
              // Stop the save; falling back would upload plaintext with the E2E flag.
              throw e;
            }
          }

          const requestBody: any = {
            username: g('currentUser').username,
            filename: filenameToSend,
            content: contentToSend,
            e2e_enabled: fileE2EEnabled ? 1 : 0,
            conflict_strategy: 'strict',
            base_last_modified: baseLastModified,
          };
          const baseContentForCrdt =
            await baseContent(file);
          if (file.type !== 'folder' && !fileE2EEnabled && typeof baseContentForCrdt === 'string') {
            requestBody.base_content = baseContentForCrdt;
          }
          if (forcedBaseContentVersion !== null) {
            requestBody.base_content_version = forcedBaseContentVersion;
          } else if (file.crdtBaseContentVersion != null && file.crdtBaseContentVersion !== '' && Number.isFinite(Number(file.crdtBaseContentVersion))) {
            requestBody.base_content_version = Number(file.crdtBaseContentVersion);
          } else {
            const currentVersion = Number(file.contentVersion);
            if (file.contentVersion != null && file.contentVersion !== '' && Number.isFinite(currentVersion)) {
              requestBody.base_content_version = currentVersion;
            }
          }

          if (isEditorComposing(globalRef, fileId) || inputRevision !== compositionRevision(globalRef, fileId)) return false;
          recordSentContent(file, content, requestBody.base_content_version);
          file.content = content; file.contentLoaded = true; file.isSynced = false;
          g('unsavedChanges')[fileId] = true; markPendingServerSync(fileId, true);
          if (!await persistFileDurably(file, window.e2eSerializeFiles)) return false;
          const controller = new AbortController();
          let timeout: ReturnType<typeof setTimeout>;
          let result: any;
          try {
            const request = (async () => {
              const response = await fetch(api + '/files/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + requestUser.token },
                body: JSON.stringify(requestBody), signal: controller.signal,
              });
              return globalRef.parseJsonResponse ? await globalRef.parseJsonResponse(response) : await response.json();
            })();
            result = await Promise.race([request, new Promise((_, reject) => {
              timeout = setTimeout(() => {
                controller.abort();
                reject(new Error('保存尚未确认，本地草稿已保留，请稍后重试'));
              }, 30000);
            })]);
          } finally { clearTimeout(timeout!); }
          if (g('currentUser')?.username !== requestUser.username || g('currentUser')?.token !== requestUser.token) return false;
          await waitForEditorCommit(globalRef, fileId);
          if (result.code === 409 && result.data) {
            const e2e = await import('../../e2e');
            const remote = await e2e.resolveFileContent(String(result.data.content ?? ''), g('currentUser')?.password, !!result.data.e2e_enabled);
            const live = file.id === g('currentFileId') ? getCurrentEditorContent(file.id, file.content) : file.content;
            const mergeBase = await mergeBaseForRemote(file, remote, Number(result.data.content_version), baseContentForCrdt);
            const merged = safeMerge(mergeBase, live, remote);
            if (!merged.clean) { conflict(file, remote, Number(result.data.content_version)); return false; }
            file.content = merged.content; file.contentLoaded = true; file.crdtBaseContent = remote;
            file.contentVersion = Number(result.data.content_version); file.crdtBaseContentVersion = file.contentVersion;
            file.serverLastModified = result.data.last_modified; g('lastSyncedContent')[file.id] = remote;
            g('unsavedChanges')[file.id] = true; markPendingServerSync(file.id, true); file.isSynced = false;
            if (file.id === g('currentFileId') && live !== merged.content) setEditorContentForFile(file.id, merged.content, { preserveCursor: true });
            persist(file); setTimeout(() => void syncFileToServer(file.id, { background: true }), 0); return false;
          }
          if (result.code === 200) {
            const fileIndex = files.findIndex(function (f: any) {
              return f.id === fileId;
            });
            if (fileIndex !== -1) {
              let serverContent =
                file.type === 'folder'
                  ? ''
                  : fileE2EEnabled
                    ? content
                    : result.data && typeof result.data.content === 'string'
                    ? result.data.content
                    : content;
              if (file.type !== 'folder') {
                const e2e = await import('../../e2e');
                serverContent = await e2e.resolveFileContent(serverContent, g('currentUser')?.password, fileE2EEnabled);
              }
              await waitForEditorCommit(globalRef, fileId);
              const acknowledgedVersion = Number(result.data?.content_version);
              if (Number.isFinite(acknowledgedVersion) && acknowledgedVersion < Number(file.contentVersion || 0)) return true;
              const isActiveFile = fileId === g('currentFileId') && file.type !== 'folder';
              let liveEditorContent = isActiveFile ? getCurrentEditorContent(fileId, files[fileIndex].content) : files[fileIndex].content;
              let hasNewerActiveEditorContent = liveEditorContent !== content;

              if (hasNewerActiveEditorContent && serverContent !== content) {
                const rebased = safeMerge(content, liveEditorContent, serverContent);
                if (!rebased.clean) { file.content = liveEditorContent; conflict(file, serverContent, Number(result.data?.content_version)); return false; }
                if (rebased.content !== liveEditorContent) {
                  if (isActiveFile) setEditorContentForFile(fileId, rebased.content, { preserveCursor: true });
                  else files[fileIndex].content = rebased.content;
                  liveEditorContent = rebased.content;
                }
              }
              let localWriteFailed = false;
              if (isExternalLocalFile(file)) {
                file.localCloudUsername = g('currentUser').username;
                file.localSyncedContent = serverContent;
                if (!hasNewerActiveEditorContent && serverContent !== content) {
                  localWriteFailed = !(await writeExternalLocalContent(file, serverContent)).success;
                }
              }
              await waitForEditorCommit(globalRef, fileId);
              if (isActiveFile) {
                liveEditorContent = getCurrentEditorContent(fileId, files[fileIndex].content);
                hasNewerActiveEditorContent = liveEditorContent !== content;
              }
              if (file.type !== 'folder') {
                files[fileIndex].content = hasNewerActiveEditorContent ? liveEditorContent : serverContent;
                files[fileIndex].contentLoaded = true;
                files[fileIndex].contentFetchedAt = Date.now();
                if (!hasNewerActiveEditorContent && fileId === g('currentFileId') && liveEditorContent !== serverContent) {
                  setEditorContentForFile(fileId, serverContent, { preserveCursor: true });
                }
              }
              files[fileIndex].isSynced = true;
              files[fileIndex].e2e_enabled = result.data && result.data.e2e_enabled !== undefined ? (result.data.e2e_enabled ? 1 : 0) : (fileE2EEnabled ? 1 : 0);
              files[fileIndex].e2eEnabled = !!files[fileIndex].e2e_enabled;
              delete files[fileIndex].serverDeleted;
              delete files[fileIndex].serverDeletedNotified;
              if (!hasNewerActiveEditorContent) { delete file.pendingCloudContent; delete file.pendingCloudBaseVersion; delete file.previousCloudContent; delete file.previousCloudBaseVersion; file.cloudSaveReceipts = (file.cloudSaveReceipts || []).filter((receipt: any) => receipt.hash !== SHA256(file.crdtBaseContent || '').toString()); }
              files[fileIndex].crdtBaseContent = serverContent;
              files[fileIndex].crdtBaseContentVersion = Number(result.data?.content_version ?? file.contentVersion ?? 0);
              files[fileIndex].lastModified = Date.now();
              files[fileIndex].serverLastModified =
                result.data && result.data.last_modified ? result.data.last_modified : files[fileIndex].lastModified;
              files[fileIndex].contentVersion = Number(
                result.data && result.data.content_version
                  ? result.data.content_version
                  : Number(file.contentVersion || 0) + 1,
              );
              g('lastSyncedContent')[fileId] = serverContent;
              if (isExternalLocalFile(file) && file.localOriginDeviceId) {
                void fetch(api + '/files/local-origin', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + g('currentUser').token }, body: JSON.stringify({ username: g('currentUser').username, filename: file.name, device_id: file.localOriginDeviceId }) }).catch(console.warn);
              }
              if (hasNewerActiveEditorContent || localWriteFailed) {
                files[fileIndex].isSynced = false;
                g('unsavedChanges')[fileId] = true;
                markPendingServerSync(fileId, true);
                try { localStorage.setItem('vditor_files', window.e2eSerializeFiles ? window.e2eSerializeFiles(files) : JSON.stringify(files)); } catch { /* The per-file journal is authoritative when the workspace cache is full. */ }
                if (!await persistFileDurably(file, window.e2eSerializeFiles)) return false;
                setTimeout(function () {
                  g('unsavedChanges')[fileId] = true;
                  markPendingServerSync(fileId, true);
                  if (typeof globalRef.startAutoSave === 'function') {
                    globalRef.startAutoSave();
                  }
                }, 0);
                return true;
              }
              file.cloudSaveReceipts = [];
              g('unsavedChanges')[fileId] = false;
              markPendingServerSync(fileId, false);
              try { localStorage.setItem('vditor_files', window.e2eSerializeFiles ? window.e2eSerializeFiles(files) : JSON.stringify(files)); } catch { /* The per-file journal is authoritative when the workspace cache is full. */ }
              if (!await persistFileDurably(file, window.e2eSerializeFiles)) return false;
              if (typeof globalRef.refreshE2EUi === 'function') {
                globalRef.refreshE2EUi();
              }
            }
            return true;
          }

          if (await tryHandleTokenExpired(result)) {
            return false;
          }

          throw new Error(result.message || (isEn() ? 'Save failed' : '保存失败'));
        } catch (error: any) {
          await tryHandleTokenExpired(error);
          if (!backgroundSync) {
            globalRef.showMessage?.((isEn() ? 'Sync failed: ' : '同步失败: ') + (error.message || ''), 'error');
          }
          return false;
        }
      });
    const trackedTask = syncTask.catch(function () {
      return false;
    });
    fileSyncLocks.set(fileId, trackedTask);

    try {
      return await syncTask;
    } finally {
      if (fileSyncLocks.get(fileId) === trackedTask) {
        fileSyncLocks.delete(fileId);
      }
      file.syncBusy = false; persist(file);
    }
  }

  async function deleteFileFromServer(filename: string) {
    if (!g('currentUser')) return;
    try {
      const api = globalRef.getApiBaseUrl ? globalRef.getApiBaseUrl() : 'api';
      const response = await fetch(api + '/files/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + g('currentUser').token },
        body: JSON.stringify({ username: g('currentUser').username, filename: filename }),
      });
      const result = globalRef.parseJsonResponse ? await globalRef.parseJsonResponse(response) : await response.json();

      // 处理 Token 过期
      if (result.code === 401 || (globalRef.isTokenError && globalRef.isTokenError(result))) {
        if (await tryHandleTokenExpired(result)) {
          return false;
        }
      }

      if (result.code !== 200) {
        throw new Error(result.message || (isEn() ? 'Delete failed' : '删除失败'));
      }
      return true;
    } catch (error) {
      await tryHandleTokenExpired(error);
      throw error;
    }
  }

  function syncCurrentFileWithBeacon() {
    if (globalRef.fileRelocationInProgress) return false;
    const currentFileId = g('currentFileId');
    if (!currentFileId || isEditorComposing(globalRef, currentFileId)) return false;
    const files = g('files') || [];
    const file = files.find((f: any) => f.id === currentFileId);
    if (!file || file.type !== 'file' || isExternalLocalFile(file) || file.e2eTransition) return false;

    const content = getCurrentEditorContent(currentFileId, file.content);

    try {
      file.content = content; file.contentLoaded = true; file.isSynced = false;
      g('unsavedChanges')[currentFileId] = true; markPendingServerSync(currentFileId, true);
      file.lastModified = Date.now();
      if (!persistFile(file, window.e2eSerializeFiles)) return false;
    } catch { return false; }

    if (isExternalLocalFile(file) && !['ready', 'copy'].includes(file.localAccessState)) return false;
    if (!g('currentUser')) return true;

    markPendingServerSync(currentFileId, true);

    let contentToSend = content;
    const fileE2EEnabled = isFileE2EEnabled(file);
    if (g('currentUser') && contentToSend) {
      try {
        if (fileE2EEnabled) {
          if (!window.e2eEncryptSync) return false;
          const encrypted = (window.e2eEncryptSync as any)(contentToSend, g('currentUser').password);
          if (encrypted && encrypted !== contentToSend) {
            contentToSend = encrypted;
          }
        } else if (typeof window.e2eResolveFileContentSync === 'function') {
          contentToSend = window.e2eResolveFileContentSync(contentToSend, g('currentUser').password, false);
        }
      } catch (e) { return false; }
    }

    const body: any = {
      username: g('currentUser').username,
      token: g('currentUser').token,
      filename: file.name,
      content: contentToSend,
      e2e_enabled: fileE2EEnabled ? 1 : 0,
      conflict_strategy: 'strict',
      base_last_modified: file.serverLastModified || null,
    };
    const beaconBaseContent =
      typeof file.crdtBaseContent === 'string' ? file.crdtBaseContent : (g('lastSyncedContent') || {})[currentFileId];
    if (!fileE2EEnabled && typeof beaconBaseContent === 'string') {
      body.base_content = beaconBaseContent;
    }

    const beaconContentVersion = file.crdtBaseContentVersion != null && file.crdtBaseContentVersion !== '' && Number.isFinite(Number(file.crdtBaseContentVersion))
      ? Number(file.crdtBaseContentVersion)
      : file.contentVersion != null && file.contentVersion !== '' ? Number(file.contentVersion) : NaN;
    if (Number.isFinite(beaconContentVersion)) {
      body.base_content_version = beaconContentVersion;
    }

    recordSentContent(file, content, body.base_content_version);
    try { if (!persistFile(file, window.e2eSerializeFiles)) return false; } catch { return false; }

    try {
      const payload = new Blob([JSON.stringify(body)], { type: 'application/json' });
      const api = globalRef.getApiBaseUrl ? globalRef.getApiBaseUrl() : 'api';
      if (navigator.sendBeacon) {
        const ok = navigator.sendBeacon(api + '/files/save', payload);
        if (ok) return true;
      }
    } catch {}

    try {
      const api = globalRef.getApiBaseUrl ? globalRef.getApiBaseUrl() : 'api';
      fetch(api + '/files/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        keepalive: true,
      }).catch((e) => console.warn('Beacon fetch failed:', e));
    } catch {}
    return true;
  }

  return {
    waitForFileSync: async () => {
      // Flush the latest edit before a rename/move changes its cloud path.
      globalRef.wsThrottle?.flush?.();
      while (fileSyncLocks.size || scheduledSaves.size) {
        const results = await Promise.all([...fileSyncLocks.values(), ...scheduledSaves]);
        if (results.some(result => result === false)) throw new Error('保存尚未确认，已保留原路径，请稍后重试');
      }
    },
    startAutoSync,
    stopAutoSync,
    syncAllFiles,
    syncFileToServer,
    deleteFileFromServer,
    syncCurrentFileWithBeacon,
    scheduleWebSocketSync,
    isWebSocketConnected: function() {
      return !!(globalRef.wsClient && globalRef.wsClient.isConnected());
    },
  };
}
