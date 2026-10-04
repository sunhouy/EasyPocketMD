/** Sync conflicts use the same comparison editors, toolbar and hunk resolver as file diffs. */
export async function showSyncConflict(globalRef: any, file: any, local: string, remote: string, resolve: (content: string) => Promise<void>, disk?: string) {
    const compare = globalRef.__filesCoreHandlers?.showFileDiffComparison;
    if (!compare) { globalRef.showMessage?.('差异对比尚未加载，请稍后重试', 'error'); return; }
    const existing = document.getElementById('fileDiffResultModal') as any;
    existing?.closeComparison?.();
    compare({ ...file, id: 'sync-local:' + file.id, content: local, diffSource: 'local' },
        { ...file, id: 'sync-cloud:' + file.id, content: remote, diffSource: 'cloud', diffReadonly: true },
        { syncConflict: { fileId: file.id, resolve, disk } });
}
