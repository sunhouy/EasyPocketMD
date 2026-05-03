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

  return {
    ...f,
    name,
    type,
    content,
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
    isEn,
  } = ctx;
  const fileSyncLocks = new Map<string, Promise<any>>();

  function startAutoSync() {
    if (globalRef.syncInterval) clearInterval(globalRef.syncInterval);
    globalRef.syncInterval = setInterval(function () {
      if (g('currentUser')) globalRef.syncAllFiles();
    }, 5000);
  }

  function stopAutoSync() {
    if (globalRef.syncInterval) {
      clearInterval(globalRef.syncInterval);
      globalRef.syncInterval = null;
    }
  }

  async function syncAllFiles() {
    if (!g('currentUser')) return;
    try {
      await pullServerUpdatesForCleanFiles();
    } catch (e) {
      console.warn('拉取服务器更新失败:', e);
    }

    const files = g('files');
    const currentFileId = g('currentFileId');
    const lastSyncedContent = g('lastSyncedContent');
    const pendingServerSync = g('pendingServerSync') || {};
    const filesToSync = files.filter(function (file: any) {
      if (file.type !== 'file') return false;
      if (isExternalLocalFile(file)) return false;
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
          content =
            overrideContent !== null
              ? overrideContent
              : file.id === g('currentFileId')
                ? getCurrentEditorContent(file.id, file.content)
                : file.content;

        }

        try {
          const api = globalRef.getApiBaseUrl ? globalRef.getApiBaseUrl() : 'api';
          
          let contentToSend = content;
          if (globalRef.currentUser && globalRef.currentUser.e2e_enabled && contentToSend && file.type !== 'folder') {
            try {
              const e2e = await import('../../e2e.js');
              contentToSend = await e2e.encrypt(contentToSend, globalRef.currentUser.password);
            } catch(e) { console.error('E2E Encrypt Error', e); }
          }

          const requestBody: any = {
            username: g('currentUser').username,
            filename: filenameToSend,
            content: contentToSend,
            base_last_modified: baseLastModified,
          };
          const baseContentForCrdt =
            typeof file.crdtBaseContent === 'string' ? file.crdtBaseContent : (g('lastSyncedContent') || {})[fileId];
          if (file.type !== 'folder' && typeof baseContentForCrdt === 'string') {
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
              const serverContent =
                file.type === 'folder'
                  ? ''
                  : result.data && typeof result.data.content === 'string'
                    ? result.data.content
                    : content;
              if (file.type !== 'folder' && files[fileIndex].content !== serverContent) {
                files[fileIndex].content = serverContent;
                if (fileId === g('currentFileId')) {
                  setEditorContentForFile(fileId, serverContent, { preserveCursor: true });
                }
              }
              files[fileIndex].isSynced = true;
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
              localStorage.setItem('vditor_files', JSON.stringify(files));
              g('lastSyncedContent')[fileId] = serverContent;
              g('unsavedChanges')[fileId] = false;
              markPendingServerSync(fileId, false);
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
    const currentFileId = g('currentFileId');
    if (!currentFileId) return false;
    const files = g('files') || [];
    const file = files.find((f: any) => f.id === currentFileId);
    if (!file || file.type !== 'file') return false;

    const content = getCurrentEditorContent(currentFileId, file.content);

    try {
      file.content = content;
      file.lastModified = Date.now();
      localStorage.setItem('vditor_files', JSON.stringify(files));
      g('unsavedChanges')[currentFileId] = false;
    } catch {}

    if (isExternalLocalFile(file)) return true;
    if (!g('currentUser')) return true;

    markPendingServerSync(currentFileId, true);

    let contentToSend = content;
    if (g('currentUser') && g('currentUser').e2e_enabled && window.e2eEncryptSync) {
      try {
        const encrypted = window.e2eEncryptSync(contentToSend, g('currentUser').password);
        if (encrypted && encrypted !== contentToSend) {
          contentToSend = encrypted;
        }
      } catch(e) {}
    }

    const body: any = {
      username: g('currentUser').username,
      token: g('currentUser').token,
      filename: file.name,
      content: contentToSend,
      base_last_modified: file.serverLastModified || null,
    };
    const beaconBaseContent =
      typeof file.crdtBaseContent === 'string' ? file.crdtBaseContent : (g('lastSyncedContent') || {})[currentFileId];
    if (typeof beaconBaseContent === 'string') {
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
    startAutoSync,
    stopAutoSync,
    syncAllFiles,
    syncFileToServer,
    deleteFileFromServer,
    syncCurrentFileWithBeacon,
  };
}
