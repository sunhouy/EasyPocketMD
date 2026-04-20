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

export function detectConflicts(
  localFiles: any[],
  serverFiles: any[],
  pendingServerSync: Record<string, boolean>,
  editableSharedByFilename: Record<string, any>,
  lastSyncedContent: Record<string, any>,
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
      // Local unsynced files created before login should not immediately raise a conflict prompt.
      // They are merged as local-preferred and synced once after merge.
      if (
        localFile &&
        localFile.type === 'file' &&
        localFile.isSynced === false &&
        !localFile.serverLastModified &&
        serverFile.type === 'file' &&
        serverFile.content !== localFile.content
      ) {
        return;
      }

      if (editableSharedByFilename[localFile.name]) {
        localFile.content = serverFile.content;
        localFile.lastModified = serverFile.lastModified || Date.now();
        localFile.isSynced = true;
        return;
      }
      const baseContent =
        localFile && localFile.id && lastSyncedContent ? lastSyncedContent[localFile.id] : undefined;
      const serverUnchangedSinceLastSync =
        baseContent !== undefined &&
        localFile.type === 'file' &&
        serverFile.type === 'file' &&
        serverFile.content === baseContent;

      // If server content is still equal to our last synced snapshot,
      // the difference is local-only and should not trigger a conflict dialog.
      if (serverUnchangedSinceLastSync && localFile.content !== serverFile.content) {
        return;
      }
      if (serverFile.content !== localFile.content) {
        conflicts.push({
          type: 'content',
          filename: localFile.name,
          localContent: localFile.content,
          serverContent: serverFile.content,
          localModified: localFile.lastModified || null,
          serverModified: serverFile.lastModified || serverFile.serverLastModified || null,
          serverLastModified: serverFile.serverLastModified || serverFile.lastModified || null,
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
    const skipConflictCheck = !!(options && options.skipConflictCheck);
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

          const baseContent = (g('lastSyncedContent') || {})[fileId];
          const baseContentVersion =
            forcedBaseContentVersion !== null ? forcedBaseContentVersion : Number(file.contentVersion || 0);
          if (!skipConflictCheck && baseContent !== undefined && !file.preferLocalOnNextSync) {
            const serverSnapshot = await fetchServerFileSnapshot(file.name);
            if (serverSnapshot && serverSnapshot.content !== baseContent) {
              if (content === serverSnapshot.content) {
                file.content = serverSnapshot.content;
                file.lastModified = serverSnapshot.lastModified || file.lastModified || null;
                file.serverLastModified = serverSnapshot.lastModified || file.serverLastModified || null;
                file.contentVersion = Number(serverSnapshot.contentVersion || file.contentVersion || 0) || null;
                file.isSynced = true;
                localStorage.setItem('vditor_files', JSON.stringify(files));
                g('lastSyncedContent')[fileId] = serverSnapshot.content;
                g('unsavedChanges')[fileId] = false;
                markPendingServerSync(fileId, false);
                globalRef.lastSaveConflictPending = false;
                return true;
              }

              if (content !== baseContent) {
                markPendingServerSync(fileId, true);
                if (backgroundSync) {
                  return false;
                }
                globalRef.showMessage(
                  isEn()
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
                    serverModified: serverSnapshot.lastModified || null,
                    localModified: file.lastModified || null,
                    serverLastModified: serverSnapshot.lastModified || null,
                    baseContentVersion: baseContentVersion,
                  });
                }
                return false;
              }

              file.content = serverSnapshot.content;
              file.lastModified = serverSnapshot.lastModified || file.lastModified || null;
              file.serverLastModified = serverSnapshot.lastModified || file.serverLastModified || null;
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
              files[fileIndex].preferLocalOnNextSync = false;
              files[fileIndex].lastModified = result.data && result.data.last_modified ? result.data.last_modified : Date.now();
              files[fileIndex].serverLastModified =
                result.data && result.data.last_modified ? result.data.last_modified : files[fileIndex].lastModified;
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
            const serverContentFromResult =
              result.data && typeof result.data.server_content === 'string' ? result.data.server_content : '';
            if (file.type !== 'folder' && content === serverContentFromResult) {
              const serverLastModifiedFromResult =
                (result.data && result.data.server_last_modified) || file.serverLastModified || file.lastModified || Date.now();
              const serverContentVersionFromResult = Number(
                result.data && result.data.server_content_version ? result.data.server_content_version : 0,
              );

              file.content = serverContentFromResult;
              file.lastModified = serverLastModifiedFromResult;
              file.serverLastModified = serverLastModifiedFromResult;
              file.contentVersion = Number.isFinite(serverContentVersionFromResult) && serverContentVersionFromResult > 0
                ? serverContentVersionFromResult
                : Number(file.contentVersion || 0) || null;
              file.isSynced = true;
              file.preferLocalOnNextSync = false;

              localStorage.setItem('vditor_files', JSON.stringify(files));
              g('lastSyncedContent')[fileId] = serverContentFromResult;
              g('unsavedChanges')[fileId] = false;
              markPendingServerSync(fileId, false);
              globalRef.lastSaveConflictPending = false;
              return true;
            }

            const serverContent = (result.data && result.data.server_content) || '';
            const serverModified = (result.data && result.data.server_last_modified) || null;
            const serverContentVersion = Number(
              result.data && result.data.server_content_version ? result.data.server_content_version : 0,
            );

            if (backgroundSync) {
              // 后台同步时，检查本地是否有未保存的更改
              const baseContent = (g('lastSyncedContent') || {})[fileId];
              if (content === baseContent) {
                // 本地没有更改，直接同步服务器版本
                file.content = serverContent;
                file.lastModified = serverModified || file.lastModified || Date.now();
                file.serverLastModified = serverModified || file.serverLastModified || file.lastModified;
                file.contentVersion = serverContentVersion;
                file.isSynced = true;
                localStorage.setItem('vditor_files', JSON.stringify(files));
                g('lastSyncedContent')[fileId] = serverContent;
                g('unsavedChanges')[fileId] = false;
                markPendingServerSync(fileId, false);
                globalRef.lastSaveConflictPending = false;
                return true;
              }
              return false;
            }

            // 显示提示，询问用户是否拉取服务器版本
            if (typeof globalRef.customConfirm === 'function') {
              globalRef.customConfirm(
                isEn() ? 'Cloud has a newer version, do you want to pull it to local?' : '云端有新版本，是否拉取到本地？'
              ).then((confirm) => {
                if (confirm) {
                  // 用户确认拉取，更新本地文件
                  file.content = serverContent;
                  file.lastModified = serverModified || file.lastModified || Date.now();
                  file.serverLastModified = serverModified || file.serverLastModified || file.lastModified;
                  file.contentVersion = serverContentVersion;
                  file.isSynced = true;
                  if (file.id === g('currentFileId')) {
                    setEditorContentForFile(file.id, serverContent);
                  }
                  localStorage.setItem('vditor_files', JSON.stringify(files));
                  g('lastSyncedContent')[fileId] = serverContent;
                  g('unsavedChanges')[fileId] = false;
                  markPendingServerSync(fileId, false);
                  globalRef.lastSaveConflictPending = false;
                  globalRef.showMessage(
                    isEn() ? 'Successfully pulled latest version from cloud' : '成功从云端拉取最新版本',
                    'success'
                  );
                } else {
                  // 用户拒绝拉取，保持本地版本
                  markPendingServerSync(fileId, true);
                  globalRef.lastSaveConflictPending = true;
                }
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

    const body: any = {
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
