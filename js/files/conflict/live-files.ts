/** Persist immediately; debounce only server sync and sidebar refresh. */
export function createDiffFileWriter(globalRef: any, setEditor: (id: string, content: string) => void, refresh: () => void) {
    const pending = new Set<string>(); let timer: any;
    const flush = () => {
        clearTimeout(timer);
        for (const id of pending) {
            if (globalRef.currentUser && typeof globalRef.syncFileToServer === 'function') {
                Promise.resolve(globalRef.syncFileToServer(id)).catch(error => { globalRef.showMessage?.(String(error.message || error), 'error'); });
            }
        }
        if (pending.size) refresh(); pending.clear();
    };
    return {
        write(file: any, content: string) {
            if (file.diffReadonly) return false;
            const files = globalRef.files || [];
            const actual = files.find((item: any) => item.id === file.id);
            if (!actual) return false;
            if (actual.content === content) return true;
            const update = { content, lastModified: Date.now(), isSynced: !globalRef.currentUser };
            try { localStorage.setItem('vditor_files', window.e2eSerializeFiles ? window.e2eSerializeFiles(files.map((item: any) => item === actual ? { ...item, ...update } : item)) : JSON.stringify(files.map((item: any) => item === actual ? { ...item, ...update } : item))); }
            catch { globalRef.showMessage?.('保存失败，请释放本机存储空间后重试', 'error'); return false; }
            Object.assign(actual, update); Object.assign(file, update);
            if (globalRef.unsavedChanges) globalRef.unsavedChanges[file.id] = true;
            if (String(globalRef.currentFileId) === String(file.id)) setEditor(file.id, content);
            pending.add(file.id); clearTimeout(timer); timer = setTimeout(flush, 500);
            return true;
        },
        flush
    };
}
