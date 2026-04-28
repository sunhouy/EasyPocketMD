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
    autoMergeTextConflict,
    hasMergeConflictMarkers,
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
      if (file.manualConflictPending && hasMergeConflictMarkers && hasMergeConflictMarkers(currentContent)) return false;
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

          if (file.manualConflictPending) {
            if (hasMergeConflictMarkers && hasMergeConflictMarkers(content)) {
              file.content = content;
              file.isSynced = false;
              file.preferLocalOnNextSync = false;
              localStorage.setItem('vditor_files', JSON.stringify(files));
              g('unsavedChanges')[fileId] = true;
              markPendingServerSync(fileId, false);
              globalRef.lastSaveConflictPending = true;
              if (!backgroundSync) {
                globalRef.showMessage(
                  isEn()
                    ? 'Choose local or cloud content for each conflict before saving to cloud'
                    : '请先为每处冲突选择本地或云端内容，再保存到云端',
                  'warning',
                );
                if (typeof globalRef.showMergeConflictResolver === 'function') {
                  globalRef.showMergeConflictResolver(fileId);
                }
              }
              return false;
            }

            file.manualConflictPending = false;
            file.preferLocalOnNextSync = true;
            globalRef.lastSaveConflictPending = false;
          }

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
                const mergeResult = autoMergeTextConflict
                  ? autoMergeTextConflict(baseContent, content, serverSnapshot.content)
                  : { mergedText: content, hasConflict: true };
                content = mergeResult.mergedText || '';
                file.content = content;
                file.lastModified = Date.now();
                file.serverLastModified = serverSnapshot.lastModified || file.serverLastModified || null;
                file.contentVersion = Number(serverSnapshot.contentVersion || file.contentVersion || 0) || null;
                file.isSynced = false;
                file.manualConflictPending = mergeResult.hasConflict === true;
                file.preferLocalOnNextSync = !file.manualConflictPending;

                if (file.id === g('currentFileId')) {
                  setEditorContentForFile(file.id, content);
                }
                localStorage.setItem('vditor_files', JSON.stringify(files));

                if (file.manualConflictPending) {
                  g('unsavedChanges')[fileId] = true;
                  markPendingServerSync(fileId, false);
                  globalRef.lastSaveConflictPending = true;
                  if (!backgroundSync || String(file.id || '') === String(g('currentFileId') || '')) {
                    globalRef.showMessage(
                      isEn()
                        ? 'Automatic merge still has conflicts. Choose local or cloud content for each conflict.'
                        : '自动合并后仍有冲突，请为每处冲突选择本地或云端内容',
                      'warning',
                    );
                    if (typeof globalRef.showMergeConflictResolver === 'function') {
                      globalRef.showMergeConflictResolver(fileId);
                    }
                  }
                  return false;
                }

                markPendingServerSync(fileId, true);
                globalRef.lastSaveConflictPending = false;
              } else {
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
        }

        try {
          const api = globalRef.getApiBaseUrl ? globalRef.getApiBaseUrl() : 'api';
          const requestBody: any = {
            username: g('currentUser').username,
            filename: filenameToSend,
            content: content,
            base_last_modified: baseLastModified,
          };
          const baseContentForCrdt = (g('lastSyncedContent') || {})[fileId];
          if (file.type !== 'folder' && typeof baseContentForCrdt === 'string') {
            requestBody.base_content = baseContentForCrdt;
          }
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
              const serverContent =
                file.type === 'folder'
                  ? ''
                  : result.data && typeof result.data.content === 'string'
                    ? result.data.content
                    : content;
              if (file.type !== 'folder' && files[fileIndex].content !== serverContent) {
                files[fileIndex].content = serverContent;
                if (fileId === g('currentFileId')) {
                  setEditorContentForFile(fileId, serverContent);
                }
              }
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
              g('lastSyncedContent')[fileId] = serverContent;
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

            const baseContent = (g('lastSyncedContent') || {})[fileId];
            if (content === baseContent) {
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

            const mergeResult = autoMergeTextConflict
              ? autoMergeTextConflict(baseContent || '', content, serverContent)
              : { mergedText: content, hasConflict: true };
            content = mergeResult.mergedText || '';
            file.content = content;
            file.lastModified = Date.now();
            file.serverLastModified = serverModified || file.serverLastModified || null;
            file.contentVersion = Number.isFinite(serverContentVersion) && serverContentVersion > 0
              ? serverContentVersion
              : Number(file.contentVersion || 0) || null;
            file.isSynced = false;
            file.manualConflictPending = mergeResult.hasConflict === true;
            file.preferLocalOnNextSync = !file.manualConflictPending;
            if (file.id === g('currentFileId')) {
              setEditorContentForFile(file.id, content);
            }
            localStorage.setItem('vditor_files', JSON.stringify(files));

            if (file.manualConflictPending) {
              g('unsavedChanges')[fileId] = true;
              markPendingServerSync(fileId, false);
              globalRef.lastSaveConflictPending = true;
              if (!backgroundSync || String(file.id || '') === String(g('currentFileId') || '')) {
                globalRef.showMessage(
                  isEn()
                    ? 'Automatic merge still has conflicts. Choose local or cloud content for each conflict.'
                    : '自动合并后仍有冲突，请为每处冲突选择本地或云端内容',
                  'warning',
                );
                if (typeof globalRef.showMergeConflictResolver === 'function') {
                  globalRef.showMergeConflictResolver(fileId);
                }
              }
              return false;
            }

            const retryBody: any = {
              username: g('currentUser').username,
              filename: filenameToSend,
              content: content,
              base_last_modified: serverModified,
            };
            if (Number.isFinite(serverContentVersion) && serverContentVersion > 0) {
              retryBody.base_content_version = serverContentVersion;
            }
            const retryResponse = await fetch(api + '/files/save', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + g('currentUser').token },
              body: JSON.stringify(retryBody),
            });
            const retryResult = globalRef.parseJsonResponse ? await globalRef.parseJsonResponse(retryResponse) : await retryResponse.json();
            if (retryResult.code === 200) {
              file.isSynced = true;
              file.preferLocalOnNextSync = false;
              file.manualConflictPending = false;
              file.lastModified =
                retryResult.data && retryResult.data.last_modified ? retryResult.data.last_modified : Date.now();
              file.serverLastModified =
                retryResult.data && retryResult.data.last_modified ? retryResult.data.last_modified : file.lastModified;
              file.contentVersion = Number(
                retryResult.data && retryResult.data.content_version
                  ? retryResult.data.content_version
                  : Number(file.contentVersion || 0) + 1,
              );
              localStorage.setItem('vditor_files', JSON.stringify(files));
              g('lastSyncedContent')[fileId] = content;
              g('unsavedChanges')[fileId] = false;
              markPendingServerSync(fileId, false);
              globalRef.lastSaveConflictPending = false;
              return true;
            }
            if (await tryHandleTokenExpired(retryResult)) return false;
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

    const body: any = {
      username: g('currentUser').username,
      token: g('currentUser').token,
      filename: file.name,
      content: content,
      base_last_modified: file.serverLastModified || null,
    };
    const beaconBaseContent = (g('lastSyncedContent') || {})[currentFileId];
    if (typeof beaconBaseContent === 'string') {
      body.base_content = beaconBaseContent;
    }

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
