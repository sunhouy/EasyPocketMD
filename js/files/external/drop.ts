import { ensureHandlePermission } from './handles';

export interface DroppedFile { file: File; handle: Promise<any>; nativePath?: string }
/** Capture handles synchronously while DataTransfer remains accessible. */
export function captureDroppedFiles(transfer: DataTransfer): DroppedFile[] {
    const items = Array.from(transfer.items || []).filter(item => item.kind === 'file');
    const entries = items.map(item => {
        const file = item.getAsFile(); if (!file) return null;
        let handle: Promise<any> = Promise.resolve(null);
        try { handle = Promise.resolve((item as any).getAsFileSystemHandle?.()).catch(() => null); } catch { /* Import still works. */ }
        return { file, handle, nativePath: (file as any).path || undefined };
    }).filter(Boolean) as DroppedFile[];
    return entries.length ? entries : Array.from(transfer.files || []).map(file => ({ file, handle: Promise.resolve(null), nativePath: (file as any).path }));
}

export async function manageDroppedFiles(entries: DroppedFile[], app: any = window, providedHandles?: any[]) {
    const handles = providedHandles || await Promise.all(entries.map(entry => entry.handle));
    if (providedHandles && (handles.length !== entries.length || handles.some((handle, index) => handle.name !== entries[index].file.name))) {
        throw new Error('请选择拖入的同名文件 / Select the same files that were dropped');
    }
    // Permission grants are initiated in the local-management button gesture, before reading files.
    await Promise.all(entries.map((entry, index) => {
        if (entry.nativePath && app.electron?.readLocalFile && app.electron?.writeLocalFile) return;
        if (handles[index]?.kind !== 'file') throw new Error('当前浏览器无法直接写回此文件，请选择“导入” / This browser cannot write back this file; choose Import');
        return ensureHandlePermission(handles[index], true);
    }));
    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        if (!/\.(md|markdown|txt)$/i.test(entry.file.name)) throw new Error('本地文件管理仅支持 Markdown 和文本文件 / Local management supports Markdown and text files');
        if (entry.nativePath && app.electron?.readLocalFile) {
            if (!await app.openExternalLocalFileByPath(entry.nativePath)) throw new Error('打开本地文件失败 / Failed to open local file');
            continue;
        }
        const handle = handles[i];
        const disk = await handle.getFile();
        const path = 'browser://' + encodeURIComponent(disk.name) + '/' + crypto.randomUUID();
        const opened = await app.openExternalLocalFileByPath(path, {
            success: true, path, name: disk.name, content: await disk.text(),
            localFileMode: 'browser-fsa', browserFileHandle: handle
        });
        if (!opened) throw new Error('打开本地文件失败 / Failed to open local file');
    }
}

export function bindFileListDrop(app: any = window) {
    const list = document.querySelector<HTMLElement>('.file-list-sidebar');
    if (!list || list.dataset.externalDropBound) return;
    list.dataset.externalDropBound = 'true';
    const fileDrag = (event: DragEvent) => Array.from(event.dataTransfer?.types || []).includes('Files');
    let depth = 0;
    list.addEventListener('dragenter', event => { if (fileDrag(event)) { event.preventDefault(); depth++; list.classList.add('external-file-drag'); } });
    list.addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; list.classList.remove('external-file-drag'); } });
    list.addEventListener('dragover', event => { if (fileDrag(event)) { event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = 'copy'; } });
    list.addEventListener('drop', event => {
        if (!fileDrag(event)) return; // Preserve jsTree's internal drag/move handling.
        event.preventDefault(); event.stopPropagation(); depth = 0; list.classList.remove('external-file-drag');
        const entries = captureDroppedFiles(event.dataTransfer); if (!entries.length) return;
        const node = (event.target as Element).closest('.jstree-node');
        const file = app.files?.find(file => file.id === node?.id);
        const folder = file?.type === 'folder' ? file.name : file?.name?.includes('/') ? file.name.slice(0, file.name.lastIndexOf('/')) : '';
        showDropChoice(entries, folder, app);
    });
}

export function showDropChoice(entries: DroppedFile[], folder: string, app: any = window) {
    document.getElementById('fileDropChoice')?.remove();
    const en = app.i18n?.getLanguage() === 'en';
    const overlay = document.createElement('div'); overlay.id = 'fileDropChoice'; overlay.className = 'modal-overlay show';
    const box = document.createElement('div'); box.className = 'modal-content file-drop-choice';
    box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-labelledby', 'fileDropChoiceTitle');
    const title = document.createElement('h3'); title.id = 'fileDropChoiceTitle'; title.textContent = en ? 'How should these files be added?' : '如何添加拖入的文件？';
    const names = document.createElement('p'); names.textContent = entries.map(entry => entry.file.name).join('、');
    const explanation = document.createElement('p'); explanation.textContent = en ? 'Import creates document copies. Local management writes edits back to the original files automatically (Markdown/text only; write permission required).' : '导入：复制为文档。本地文件管理：编辑后自动写回原文件（仅 Markdown/文本，需授予写入权限）。';
    const status = document.createElement('p'); status.setAttribute('role', 'status');
    const importButton = document.createElement('button'); importButton.type = 'button'; importButton.textContent = en ? 'Import files' : '导入文件';
    const localButton = document.createElement('button'); localButton.type = 'button'; localButton.textContent = en ? 'Manage local files' : '作为本地文件管理';
    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = en ? 'Cancel' : '取消';
    box.append(title, names, explanation, status, importButton, localButton, cancel); overlay.append(box); document.body.append(overlay); importButton.focus();
    let closed = false, processing = false, localAvailable = false;
    const close = () => { closed = true; overlay.remove(); document.removeEventListener('keydown', escape); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !importButton.disabled) close(); };
    document.addEventListener('keydown', escape); cancel.onclick = close;
    const busy = (value: boolean) => { processing = value; importButton.disabled = cancel.disabled = value; localButton.disabled = value || !localAvailable; };
    importButton.onclick = async () => {
        busy(true); status.textContent = en ? 'Importing…' : '正在导入…';
        try { await app.importDroppedFiles(entries.map(entry => entry.file), folder); close(); }
        catch (error) { status.textContent = error.message; busy(false); }
    };
    let handles: any[] = [];
    localButton.disabled = true;
    void Promise.all(entries.map(entry => entry.handle)).then(values => {
        if (closed) return;
        handles = values;
        const text = entries.every(entry => /\.(md|markdown|txt)$/i.test(entry.file.name));
        const writable = entries.every((entry, index) => (entry.nativePath && app.electron?.readLocalFile && app.electron?.writeLocalFile) || values[index]?.kind === 'file');
        localAvailable = text && (writable || !!app.showOpenFilePicker);
        localButton.disabled = processing || !localAvailable;
        if (processing) return;
        if (!text) status.textContent = en ? 'Office/PDF files can be imported; local write-back supports Markdown/text.' : 'Office/PDF 文件请选择导入；本地写回支持 Markdown 和文本。';
        else if (!writable) status.textContent = app.showOpenFilePicker ? (en ? 'Choose the same files again to grant write access.' : '选择本地管理后，请再次选择同名文件以授予写入权限。') : (en ? 'This browser cannot write to originals. Use Import or a browser supporting file write access.' : '当前浏览器不支持写回原文件，请导入或使用支持文件写入权限的浏览器。');
    });
    localButton.onclick = async () => {
        busy(true); status.textContent = en ? 'Opening local files…' : '正在打开本地文件…';
        try {
            const needPicker = entries.some((entry, index) => !(entry.nativePath && app.electron?.readLocalFile && app.electron?.writeLocalFile) && handles[index]?.kind !== 'file');
            // Invoke the picker before the first await to preserve transient user activation.
            const selected = needPicker ? app.showOpenFilePicker({ multiple: true, types: [{ description: 'Markdown / Text', accept: { 'text/plain': ['.md', '.markdown', '.txt'] } }] }) : null;
            await manageDroppedFiles(entries, app, selected ? await selected : undefined); close();
        } catch (error) { status.textContent = error.name === 'AbortError' ? (en ? 'Cancelled' : '已取消') : error.message; busy(false); }
    };
}
