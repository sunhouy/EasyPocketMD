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
    lastModified: f.last_modified || f.lastModified || Date.now(),
    serverLastModified: f.last_modified || f.lastModified || Date.now(),
    contentVersion: hasContentVersion ? Number(f.content_version ?? f.contentVersion) : null,
  };
}

export function detectConflicts(
  localFiles: any[],
  serverFiles: any[],
  pendingServerSync: Record<string, boolean>,
  editableSharedByFilename: Record<string, any>,
  isExternalLocalFile: (f: any) => boolean,
): any[] {
  const conflicts: any[] = [];
  const serverFileMap: Record<string, any> = {};
  serverFiles.forEach((f) => {
    serverFileMap[f.name] = f;
  });

  localFiles.forEach((localFile) => {
    if (isExternalLocalFile(localFile)) return;
    if (localFile.id && pendingServerSync[localFile.id]) return;

    const serverFile = serverFileMap[localFile.name];
    if (serverFile) {
      if (editableSharedByFilename[localFile.name]) {
        localFile.content = serverFile.content;
        localFile.lastModified = serverFile.lastModified || Date.now();
        localFile.isSynced = true;
        return;
      }
      if (serverFile.content !== localFile.content) {
        conflicts.push({
          type: 'content',
          filename: localFile.name,
          localContent: localFile.content,
          serverContent: serverFile.content,
          localModified: localFile.lastModified,
          serverModified: serverFile.lastModified || Date.now(),
          serverLastModified: serverFile.serverLastModified || serverFile.lastModified || Date.now(),
          serverContentVersion: Number(serverFile.contentVersion || 0),
        });
      }
      return;
    }

    if (localFile.isSynced) {
      conflicts.push({
        type: 'delete',
        filename: localFile.name,
        localContent: localFile.content,
        localModified: localFile.lastModified,
      });
    }
  });

  return conflicts;
}

export function createSyncRuntimeApi(ctx: any) {
  const {
    globalRef,
    g,
    isExternalLocalFile,
    getCurrentEditorContent,
    setEditorContentForFile,
    fetchServerFileSnapshot,
    markPendingServerSync,
    tryHandleTokenExpired,
    pullServerUpdatesForCleanFiles,
    isEn,
  } = ctx;

  function startAutoSync() {
    if (globalRef.syncInterval) clearInterval(globalRef.syncInterval);
    globalRef.syncInterval = setInterval(function () {
      if (g('currentUser')) globalRef.syncAllFiles();
    }, 30000);
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
    const skipConflictCheck = !!(options && options.skipConflictCheck);
    const baseLastModifiedOption = options && options.baseLastModified ? options.baseLastModified : null;
    const forcedBaseContentVersion =
      options && Number.isFinite(Number(options.baseContentVersion)) ? Number(options.baseContentVersion) : null;
    const files = g('files');
    const file = files.find(function (f: any) {
      return f.id === fileId;
    });
    if (!file) return;

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

      const baseContent = (g('lastSyncedContent') || {})[fileId];
      const baseContentVersion = forcedBaseContentVersion !== null ? forcedBaseContentVersion : Number(file.contentVersion || 0);
      if (!skipConflictCheck && baseContent !== undefined) {
        const serverSnapshot = await fetchServerFileSnapshot(file.name);
        if (serverSnapshot && serverSnapshot.content !== baseContent) {
          if (content !== baseContent) {
            globalRef.showMessage(
              backgroundSync
                ? isEn()
                  ? 'Background sync skipped due to conflict'
                  : '检测到冲突，后台同步已跳过'
                : isEn()
                  ? 'Conflict detected: server has newer content, please resolve it first'
                  : '检测到冲突：服务器有更新内容，请先处理冲突',
              'warning',
            );
            globalRef.lastSaveConflictPending = true;
            if (typeof globalRef.showSaveConflictDialog === 'function') {
              globalRef.showSaveConflictDialog({
                fileId: fileId,
                fileName: file.name,
                localContent: content,
                serverContent: serverSnapshot.content,
                serverContentVersion: Number(serverSnapshot.contentVersion || 0),
                serverModified: serverSnapshot.lastModified || Date.now(),
                localModified: file.lastModified || Date.now(),
                serverLastModified: serverSnapshot.lastModified || Date.now(),
                baseContentVersion: baseContentVersion,
              });
            }
            return false;
          }

          file.content = serverSnapshot.content;
          file.lastModified = serverSnapshot.lastModified || Date.now();
          file.serverLastModified = serverSnapshot.lastModified || Date.now();
          file.contentVersion = Number(serverSnapshot.contentVersion || 0);
          file.isSynced = true;
          if (file.id === g('currentFileId')) {
            setEditorContentForFile(file.id, serverSnapshot.content);
          }
          localStorage.setItem('vditor_files', JSON.stringify(files));
          g('lastSyncedContent')[fileId] = serverSnapshot.content;
          g('unsavedChanges')[fileId] = false;
          markPendingServerSync(fileId, false);
          globalRef.lastSaveConflictPending = false;
          return true;
        }
      }
    }

    try {
      const api = globalRef.getApiBaseUrl ? globalRef.getApiBaseUrl() : 'api';
      const requestBody: any = {
        username: g('currentUser').username,
        filename: filenameToSend,
        content: content,
        base_last_modified: baseLastModified,
      };
      if (forcedBaseContentVersion !== null) {
        requestBody.base_content_version = forcedBaseContentVersion;
      } else {
        const currentVersion = Number(file.contentVersion);
        if (Number.isFinite(currentVersion) && currentVersion > 0) {
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
          files[fileIndex].isSynced = true;
          files[fileIndex].lastModified = result.data && result.data.last_modified ? result.data.last_modified : Date.now();
          files[fileIndex].serverLastModified = result.data && result.data.last_modified ? result.data.last_modified : files[fileIndex].lastModified;
          files[fileIndex].contentVersion = Number(
            result.data && result.data.content_version
              ? result.data.content_version
              : Number(file.contentVersion || 0) + 1,
          );
          localStorage.setItem('vditor_files', JSON.stringify(files));
          g('lastSyncedContent')[fileId] = file.type === 'folder' ? '' : content;
          g('unsavedChanges')[fileId] = false;
          markPendingServerSync(fileId, false);
          globalRef.lastSaveConflictPending = false;
        }
        return true;
      }

      if (result.code === 409) {
        globalRef.lastSaveConflictPending = true;
        markPendingServerSync(fileId, true);
        if (typeof globalRef.showSaveConflictDialog === 'function') {
          globalRef.showSaveConflictDialog({
            fileId: fileId,
            fileName: file.name,
            localContent: content,
            serverContent: (result.data && result.data.server_content) || '',
            serverContentVersion: Number(result.data && result.data.server_content_version ? result.data.server_content_version : 0),
            serverModified: (result.data && result.data.server_last_modified) || Date.now(),
            localModified: file.lastModified || Date.now(),
            serverLastModified: (result.data && result.data.server_last_modified) || Date.now(),
            baseContentVersion: Number(file.contentVersion || 0),
          });
        }
        return false;
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
  }

  async function deleteFileFromServer(filename: string) {
    if (!g('currentUser')) return;
    const api = globalRef.getApiBaseUrl ? globalRef.getApiBaseUrl() : 'api';
    const response = await fetch(api + '/files/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + g('currentUser').token },
      body: JSON.stringify({ username: g('currentUser').username, filename: filename }),
    });
    const result = globalRef.parseJsonResponse ? await globalRef.parseJsonResponse(response) : await response.json();
    if (result.code !== 200) {
      throw new Error(result.message || (isEn() ? 'Delete failed' : '删除失败'));
    }
    return true;
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

    const body = {
      username: g('currentUser').username,
      token: g('currentUser').token,
      filename: file.name,
      content: content,
      base_last_modified: file.serverLastModified || null,
    };

    const beaconContentVersion = Number(file.contentVersion);
    if (Number.isFinite(beaconContentVersion) && beaconContentVersion > 0) {
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
