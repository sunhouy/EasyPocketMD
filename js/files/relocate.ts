import { writeWorkspaceCache } from './workspace-cache';
/** Change server paths before publishing local paths; never delete/re-upload content. */
export async function relocateFile(globalRef: any, fileId: string, newPath: string) {
    if (globalRef.fileRelocationInProgress) throw new Error('另一个移动操作正在进行，请稍后重试');
    const files = globalRef.files || [];
    const item = files.find((file: any) => file.id === fileId);
    if (!item) throw new Error('文件不存在');
    const oldPath = item.name;
    if (oldPath === newPath) return;
    const folder = item.type === 'folder';
    if (!newPath || newPath.split('/').some(part => !part || part === '.' || part === '..') ||
        (folder && newPath.startsWith(oldPath + '/'))) throw new Error('无效的移动路径');
    const affected = files.filter((file: any) => file.id === fileId || (folder && file.name.startsWith(oldPath + '/')));
    const changes = affected.map((file: any) => ({ file, name: newPath + file.name.slice(oldPath.length) }));
    if (files.some((file: any) => !affected.includes(file) &&
        (file.name === newPath || (folder && file.name.startsWith(newPath + '/'))))) {
        throw new Error('目标位置已存在同名文件或文件夹');
    }
    globalRef.fileRelocationInProgress = true;
    globalRef.fileRelocationGeneration = (globalRef.fileRelocationGeneration || 0) + 1;
    globalRef.wsThrottle?.cancel();
    const user = globalRef.currentUser;
    try {
        // Let saves already in flight finish under their original names.
        await globalRef.waitForFileSync?.();
        if (globalRef.currentUser !== user || globalRef.files !== files) return;
        if (user) {
            // Unsynced local records must exist before the transactional server move.
            for (const file of affected.filter((file: any) => file.isSynced === false)) {
                if (!await globalRef.syncFileToServer(file.id, { background: false, relocation: true })) {
                    throw new Error('保存失败，已保留原路径，请重试');
                }
            }
            const response = await fetch((globalRef.getApiBaseUrl?.() || 'api') + '/files/move', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + user.token },
                body: JSON.stringify({ username: user.username, old_path: oldPath, new_path: newPath, is_folder: folder })
            });
            const result = await response.json();
            if (result.code !== 200) throw new Error(result.message || '移动失败');
        }
        if (globalRef.currentUser !== user || globalRef.files !== files) return;
        for (const { file, name } of changes) {
            file.name = name;
            if (!user) file.isSynced = false;
        }
        if(!await writeWorkspaceCache(files))throw Error('本地保存失败，请重试');
    } finally {
        globalRef.fileRelocationGeneration++;
        globalRef.fileRelocationInProgress = false;
        if (globalRef.currentUser === user) globalRef.startAutoSave?.();
    }
}
