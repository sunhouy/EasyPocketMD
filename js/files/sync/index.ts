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
    if (isExternalLocalFile(file)) {
      void applyExternalRemoteUpdate?.(file, payload).catch(() => {});
      return;
    }

    if (Number.isFinite(Number(payload.content_version))) {
      file.contentVersion = Number(payload.content_version);
      file.serverLastModified = payload.last_modified || null;
    }

    const currentFileId = g('currentFileId');
    if (file.id === currentFileId) return;

    const e2e = await import('../../e2e');
    const plaintext = await e2e.resolveFileContent(String(payload.content ?? ''), g('currentUser')?.password, true);
    if (file.e2eTransition || file.id === g('currentFileId') || g('unsavedChanges')[file.id]) return;
    file.content = plaintext;
    if (payload.e2e_enabled !== undefined) {
      file.e2e_enabled = isFileE2EEnabled(payload) ? 1 : 0;
      file.e2eEnabled = !!file.e2e_enabled;
    }
    file.isSynced = true;
    file.contentLoaded = true;

    const lastSyncedContent = g('lastSyncedContent') || {};
    lastSyncedContent[file.id] = file.content;
    g('unsavedChanges')[file.id] = false;

    localStorage.setItem('vditor_files', window.e2eSerializeFiles ? window.e2eSerializeFiles(files) : JSON.stringify(files));
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
        if (!globalRef.wsClient || !globalRef.wsClient.isConnected()) {
          globalRef.syncAllFiles();
        }
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
    if (globalRef.fileRelocationInProgress) return;
    if (!g('currentUser')) return;
    if (!globalRef.wsClient || !globalRef.wsClient.isConnected()) {
      try {
        await pullServerUpdatesForCleanFiles();
      } catch (e) {
        console.warn('拉取服务器更新失败:', e);
      }
    }

    const files = g('files');
    const currentFileId = g('currentFileId');
    const lastSyncedContent = g('lastSyncedContent');
    const pendingServerSync = g('pendingServerSync') || {};
    const filesToSync = files.filter(function (file: any) {
      if (file.type !== 'file') return false;
      if (isExternalLocalFile(file) && !['ready', 'copy'].includes(file.localAccessState)) return false;
      if (file.contentLoaded === false && !pendingServerSync[file.id]) return false;
      const currentContent =
        file.id === currentFileId ? getCurrentEditorContent(currentFileId, file.content) : file.content;
      return pendingServerSync[file.id] || !file.isSynced || currentContent !== lastSyncedContent[file.id];
    });
    if (filesToSync.length === 0) return;
    try {
      for (let i = 0; i < filesToSync.length; i++) {
        await globalRef.syncFileToServer(filesToSync[i].id, { background: true });
      }
    } catch (error) {
      await tryHandleTokenExpired(error);
      console.error('同步失败', error);
    }
  }

  async function syncFileToServer(fileId: string, options: any) {
    if (globalRef.fileRelocationInProgress && !options?.relocation) return false;
    if (!g('currentUser')) return;
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
    if (file.e2eTransition && !options?.encryptionTransition) return false;
    if (isExternalLocalFile(file) && !['ready', 'copy'].includes(file.localAccessState)) return false;

    const previousSyncTask = fileSyncLocks.get(fileId) || Promise.resolve();
    const syncTask = previousSyncTask
      .catch(function () {})
      .then(async function () {
        const baseLastModified = baseLastModifiedOption || file.serverLastModified || null;

        let content;
        let filenameToSend = file.name;
        if (file.type === 'folder') {
          content = '{"meta":"folder"}';
          if (!filenameToSend.endsWith('/')) {
            filenameToSend += '/';
          }
        } else {
          if (file.contentLoaded === false && typeof fetchServerFileContent === 'function') {
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
            base_last_modified: baseLastModified,
          };
          const baseContentForCrdt =
            typeof file.crdtBaseContent === 'string' ? file.crdtBaseContent : (g('lastSyncedContent') || {})[fileId];
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
              let liveEditorContent = isActiveFile ? getCurrentEditorContent(fileId, files[fileIndex].content) : null;
              let hasNewerActiveEditorContent = isActiveFile && liveEditorContent !== content;

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
                if (!hasNewerActiveEditorContent && fileId === g('currentFileId') && liveEditorContent !== serverContent) {
                  setEditorContentForFile(fileId, serverContent, { preserveCursor: true });
                }
              }
              files[fileIndex].isSynced = true;
              files[fileIndex].e2e_enabled = result.data && result.data.e2e_enabled !== undefined ? (result.data.e2e_enabled ? 1 : 0) : (fileE2EEnabled ? 1 : 0);
              files[fileIndex].e2eEnabled = !!files[fileIndex].e2e_enabled;
              delete files[fileIndex].serverDeleted;
              delete files[fileIndex].serverDeletedNotified;
              delete files[fileIndex].crdtBaseContent;
              delete files[fileIndex].crdtBaseContentVersion;
              files[fileIndex].lastModified = result.data && result.data.last_modified ? result.data.last_modified : Date.now();
              files[fileIndex].serverLastModified =
                result.data && result.data.last_modified ? result.data.last_modified : files[fileIndex].lastModified;
              files[fileIndex].contentVersion = Number(
                result.data && result.data.content_version
                  ? result.data.content_version
                  : Number(file.contentVersion || 0) + 1,
              );
              g('lastSyncedContent')[fileId] = serverContent;
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
      g('unsavedChanges')[currentFileId] = false;
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
          const encrypted = window.e2eEncryptSync(contentToSend, g('currentUser').password);
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
