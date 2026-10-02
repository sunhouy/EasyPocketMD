import { safeMerge } from '../../../api/utils/safeMerge';
import { SyncQueue } from './queue';
import { persistFile, restoreFileFromDB, refreshSyncIcons, deviceId } from './local-state';
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
    file.syncConflict = true; file.syncConflictRemoteContent = remote; file.syncConflictVersion = version;
    file.isSynced = false; markPendingServerSync(file.id, true); persist(file);
    if (file.id === g('currentFileId')) void resolveConflict(file).catch(console.warn);
  }
  async function reconcileRemote(file: any, remote: any) {
    if (!g('currentUser') || file.e2eTransition || file.syncConflict || globalRef.sharedDocState?.ownerFileId === file.id) return;
    await globalRef.E2EVault?.initialize();
    const vaultState = globalRef.E2EVault?.state();
    if (vaultState?.config && !vaultState.unlocked && isFileE2EEnabled(file)) { file.remoteContentVersion = Number(remote.content_version ?? remote.contentVersion ?? 0); persist(file); return; }
    const username = g('currentUser').username;
    const version = Number(remote.content_version ?? remote.contentVersion ?? 0);
    if (version < Number(file.contentVersion || 0)) return;
    const e2e = await import('../../e2e');
    const content = await e2e.resolveFileContent(String(remote.content ?? ''), g('currentUser')?.password, isFileE2EEnabled(remote));
    const base = await baseContent(file);
    if (g('currentUser')?.username !== username) return;
    const originalLocal = file.id === g('currentFileId') ? getCurrentEditorContent(file.id, file.content) : await e2e.resolveFileContent(String(file.content ?? ''), g('currentUser')?.password, isFileE2EEnabled(file));
    let local = originalLocal;
    if (isExternalLocalFile(file) && ctx.readExternalSourceContent) {
      const disk = await ctx.readExternalSourceContent(file, file.id).catch(() => null);
      if (disk === null) { file.remoteContentVersion = version; persist(file); return; }
      const combined = safeMerge(base, local, disk);
      if (!combined.clean) { file.syncConflictDiskContent = disk; conflict(file, content, version); return; }
      local = combined.content;
    }
    const dirty = local !== originalLocal || !!(g('pendingServerSync')?.[file.id] || g('unsavedChanges')?.[file.id] || file.isSynced === false || (file.id === g('currentFileId') && local !== file.content));
    const merged = dirty ? safeMerge(base, local, content) : { clean: true as const, content };
    if (!merged.clean) { conflict(file, content, version); return; }
    if (isExternalLocalFile(file) && !(await writeExternalLocalContent(file, merged.content)).success) { file.remoteContentVersion = version; persist(file); return; }
    // Awaiting a physical write can race with typing; don't discard the newer draft.
    const live = file.id === g('currentFileId') ? getCurrentEditorContent(file.id, file.content) : file.content;
    const final = live !== originalLocal ? safeMerge(originalLocal, live, merged.content) : merged;
    if (!final.clean) { conflict(file, content, version); return; }
    file.content = final.content; file.contentLoaded = true; file.contentFetchedAt = Date.now(); file.contentVersion = version;
    file.crdtBaseContent = content; file.crdtBaseContentVersion = version;
    file.serverLastModified = remote.last_modified ?? remote.serverLastModified; file.lastModified = Date.now();
    if (isExternalLocalFile(file)) { file.localSyncedContent = content; file.localCloudUsername = g('currentUser').username; if (final.content !== merged.content) file.localPendingWrite = true; }
    g('lastSyncedContent')[file.id] = content; file.isSynced = final.content === content;
    g('unsavedChanges')[file.id] = !file.isSynced; markPendingServerSync(file.id, !file.isSynced);
    if (file.id === g('currentFileId') && live !== final.content) setEditorContentForFile(file.id, final.content, { preserveCursor: true });
    persist(file);
  }
  globalRef.reconcileRemoteFile = reconcileRemote;
  globalRef.queueBackgroundFileSync = (selectedId?: string) => {
    if (navigator.onLine === false || !g('currentUser')) { refreshSyncIcons(globalRef); return; }
    for (const file of g('files') || []) {
      if (file.type !== 'file' || file.e2eTransition || file.syncConflict) continue;
      const priority = file.id === (selectedId || g('currentFileId')) ? 100 : (g('pendingServerSync')?.[file.id] ? 50 : 0);
      void queue.enqueue(file.id, priority, async () => {
        if (navigator.onLine === false || !g('currentUser') || file.syncConflict || globalRef.fileRelocationInProgress || !g('files').includes(file)) return;
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
          // A file not yet cached has no local draft to merge.
          if (!file.contentLoaded && !g('unsavedChanges')?.[file.id] && !file.content) { file.content = clone.content; file.crdtBaseContent = clone.content; }
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
  const webSocketSaves = new Map<string, any[]>();
  const acknowledgingSaves = new Set<any>();

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

  async function handleRemoteFileSaved(payload: any) {
    const pending = webSocketSaves.get(payload.filename);
    const acknowledged = pending?.shift();
    if (acknowledged) {
      clearTimeout(acknowledged.timer);
      acknowledgingSaves.add(acknowledged);
      if (!pending.length) webSocketSaves.delete(payload.filename);
    }
    try {
      const files = g('files');
      const file = files.find(function(f: any) { return f.name === payload.filename; });
      if (!file) { acknowledged?.resolve(); return; }
      if (payload.code !== undefined && payload.code !== 200) {
        file.isSynced = false;
        g('unsavedChanges')[file.id] = true;
        markPendingServerSync(file.id, true);
        acknowledged?.reject(new Error(payload.message || '保存失败'));
        return;
      }

      const e2e = await import('../../e2e');
      let plaintext;
      try {
        plaintext = await e2e.resolveFileContent(String(payload.content ?? file.content ?? ''), g('currentUser')?.password, true);
      } catch (error) {
        acknowledged?.reject(error);
        markPendingServerSync(file.id, true);
        return;
      }
      if (acknowledged && acknowledged.e2eEnabled !== isFileE2EEnabled(file)) {
        acknowledged.resolve();
        return;
      }

      if (Number.isFinite(Number(payload.content_version))) {
        file.contentVersion = Number(payload.content_version);
      }
      file.serverLastModified = payload.last_modified || null;
      const lastSyncedContent = g('lastSyncedContent') || {};
      lastSyncedContent[file.id] = plaintext;
      globalRef.lastSyncedContent = lastSyncedContent;
      const live = file.id === g('currentFileId') ? getCurrentEditorContent(file.id, file.content) : file.content;
      const dirty = live !== plaintext;
      file.isSynced = !dirty;
      file.contentLoaded = true;
      file.contentFetchedAt = Date.now();
      g('unsavedChanges')[file.id] = dirty;
      markPendingServerSync(file.id, dirty);
      acknowledged?.resolve();
      localStorage.setItem('vditor_files', window.e2eSerializeFiles ? window.e2eSerializeFiles(files) : JSON.stringify(files));
    } catch (error) {
      acknowledged?.reject(error);
      throw error;
    } finally {
      if (acknowledged) acknowledgingSaves.delete(acknowledged);
    }
  }

  async function scheduleWebSocketSync(fileId: string) {
    if (globalRef.fileRelocationInProgress) return;
    if (!g('currentUser')) return;

    const files = g('files');
    const file = files.find(function(f: any) { return f.id === fileId; });
    if (!file || file.type !== 'file' || isExternalLocalFile(file) || file.e2eTransition) return;

    const content = file.id === g('currentFileId')
      ? getCurrentEditorContent(fileId, file.content)
      : file.content;

    if (!content && content !== '') return;

    const lastSyncedContent = g('lastSyncedContent') || {};

    let contentToSend = content;
    const fileE2EEnabled = isFileE2EEnabled(file);
    try {
      const e2e = await import('../../e2e');
      contentToSend = await e2e.resolveFileContent(contentToSend, g('currentUser')?.password, fileE2EEnabled);
      if (fileE2EEnabled) contentToSend = await e2e.encrypt(contentToSend, g('currentUser')?.password);
    } catch (error) {
      markPendingServerSync(fileId, true);
      console.error('[WS] E2E prepare error', error);
      return;
    }
    if (contentToSend === undefined || globalRef.fileRelocationInProgress || file.e2eTransition || fileE2EEnabled !== isFileE2EEnabled(file)) return;

    if (!globalRef.wsThrottle) return;

    globalRef.wsThrottle.schedule({
      type: 'file_save',
      filename: file.name,
      content: contentToSend,
      base_content: fileE2EEnabled ? undefined : lastSyncedContent[fileId],
      base_content_version: file.contentVersion,
      e2e_enabled: fileE2EEnabled ? 1 : 0,
    });
  }

  function initWebSocketClient() {
    if (globalRef.wsClient) return;

    try {
      globalRef.wsThrottle = createSyncThrottle(function(data: any) {
        if (globalRef.wsClient && globalRef.wsClient.isConnected()) {
          let resolve: any;
          let reject: any;
          const promise = new Promise<void>((ok, fail) => { resolve = ok; reject = fail; });
          // Retain unacknowledged saves, even after timeout: moving their source
          // before confirmation could let a late save recreate the old path.
          const task = {
            promise, resolve, reject, e2eEnabled: !!data.e2e_enabled,
            timer: setTimeout(() => reject(new Error('保存尚未确认，已保留原路径，请稍后重试')), 15000)
          };
          promise.catch(() => {});
          const pending = webSocketSaves.get(data.filename) || [];
          pending.push(task);
          webSocketSaves.set(data.filename, pending);
          globalRef.wsClient.send(data);
        }
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
          return handleRemoteFileSaved(payload).catch(error => console.error('[WS] Cannot apply save acknowledgement', error));
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
    if (globalRef.fileRelocationInProgress && !options?.relocation) return false;
    if (!g('currentUser') || navigator.onLine === false) { refreshSyncIcons(globalRef); return false; }
    await globalRef.E2EVault?.initialize();
    const vaultState = globalRef.E2EVault?.state();
    if (options?.background !== false && vaultState?.config && !vaultState.unlocked && isFileE2EEnabled(g('files').find(f => f.id === fileId))) return false;
    const requestUser = g('currentUser');
    const backgroundSync = !options || options.background !== false;
    const overrideContent = options && typeof options.overrideContent === 'string' ? options.overrideContent : null;
    const baseLastModifiedOption = options && options.baseLastModified ? options.baseLastModified : null;
    const forcedBaseContentVersion =
      options && Number.isFinite(Number(options.baseContentVersion)) ? Number(options.baseContentVersion) : null;
    const files = g('files');
    const file = files.find(function (f: any) {
      return f.id === fileId;
    });
    if (!file) return;
    if (file.syncConflict && !options?.resolveConflict) return false;
    if (globalRef.sharedDocState?.ownerFileId === fileId && globalRef.sharedDocState.canEdit && !options?.relocation && !options?.encryptionTransition) return globalRef.scheduleSharedDocSync?.({ manualSave: true });
    if (file.e2eTransition && !options?.encryptionTransition) return false;
    if (isExternalLocalFile(file) && !['ready', 'copy'].includes(file.localAccessState)) return false;
    if (isExternalLocalFile(file)) file.localOriginDeviceId ||= deviceId();

    if (fileSyncLocks.has(fileId) && backgroundSync && overrideContent === null) return fileSyncLocks.get(fileId);
    const previousSyncTask = fileSyncLocks.get(fileId) || Promise.resolve();
    const syncTask = previousSyncTask
      .catch(function () {})
      .then(async function () {
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
          } else if (Number.isFinite(Number(file.crdtBaseContentVersion))) {
            requestBody.base_content_version = Number(file.crdtBaseContentVersion);
          } else {
            const currentVersion = Number(file.contentVersion);
            if (Number.isFinite(currentVersion)) {
              requestBody.base_content_version = currentVersion;
            }
          }

          const response = await fetch(api + '/files/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + g('currentUser').token },
            body: JSON.stringify(requestBody),
          });
          const result = globalRef.parseJsonResponse ? await globalRef.parseJsonResponse(response) : await response.json();
          if (g('currentUser')?.username !== requestUser.username || g('currentUser')?.token !== requestUser.token) return false;
          if (result.code === 409 && result.data) {
            const e2e = await import('../../e2e');
            const remote = await e2e.resolveFileContent(String(result.data.content ?? ''), g('currentUser')?.password, !!result.data.e2e_enabled);
            const live = file.id === g('currentFileId') ? getCurrentEditorContent(file.id, file.content) : file.content;
            const merged = safeMerge(baseContentForCrdt, live, remote);
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
              files[fileIndex].crdtBaseContent = serverContent;
              files[fileIndex].crdtBaseContentVersion = Number(result.data?.content_version ?? file.contentVersion ?? 0);
              files[fileIndex].lastModified = result.data && result.data.last_modified ? result.data.last_modified : Date.now();
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
              persistFile(file, window.e2eSerializeFiles);
              if (hasNewerActiveEditorContent || localWriteFailed) {
                files[fileIndex].isSynced = false;
                g('unsavedChanges')[fileId] = true;
                markPendingServerSync(fileId, true);
                localStorage.setItem('vditor_files', window.e2eSerializeFiles ? window.e2eSerializeFiles(files) : JSON.stringify(files));
                setTimeout(function () {
                  g('unsavedChanges')[fileId] = true;
                  markPendingServerSync(fileId, true);
                  if (typeof globalRef.startAutoSave === 'function') {
                    globalRef.startAutoSave();
                  }
                }, 0);
                return true;
              }
              g('unsavedChanges')[fileId] = false;
              markPendingServerSync(fileId, false);
              localStorage.setItem('vditor_files', window.e2eSerializeFiles ? window.e2eSerializeFiles(files) : JSON.stringify(files));
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
            globalRef.showMessage((isEn() ? 'Sync failed: ' : '同步失败: ') + (error.message || ''), 'error');
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
    if (!currentFileId) return false;
    const files = g('files') || [];
    const file = files.find((f: any) => f.id === currentFileId);
    if (!file || file.type !== 'file' || isExternalLocalFile(file) || file.e2eTransition) return false;

    const content = getCurrentEditorContent(currentFileId, file.content);

    try {
      file.content = content;
      file.lastModified = Date.now();
      localStorage.setItem('vditor_files', window.e2eSerializeFiles ? window.e2eSerializeFiles(files) : JSON.stringify(files));
      persistFile(file, window.e2eSerializeFiles);
    } catch {}

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

    const beaconContentVersion = Number.isFinite(Number(file.crdtBaseContentVersion))
      ? Number(file.crdtBaseContentVersion)
      : Number(file.contentVersion);
    if (Number.isFinite(beaconContentVersion)) {
      body.base_content_version = beaconContentVersion;
    }

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
    waitForFileSync: () => Promise.all([
      ...fileSyncLocks.values(),
      ...[...acknowledgingSaves].map(task => task.promise),
      ...[...webSocketSaves.values()].flatMap(tasks => tasks.map(task => task.promise))
    ]),
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
