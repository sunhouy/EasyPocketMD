export function showFileDetails(app: any, file: any) {
    (document.getElementById('fileDetailsModal') as any)?.dismiss?.();
    const overlay = document.createElement('div'); overlay.id = 'fileDetailsModal'; overlay.className = 'modal-overlay file-details-overlay';
    const box = document.createElement('section'); box.className = 'file-details-dialog'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true');
    const en = app.i18n?.getLanguage?.() === 'en';
    const title = document.createElement('h3'); title.textContent = en ? 'Details' : '详情'; box.append(title);
    const list = document.createElement('dl');
    const timestamp = (value: any) => { const date = value ? new Date(value) : null; return date && !Number.isNaN(date.getTime()) ? date.toLocaleString() : en ? 'Not recorded' : '未记录'; };
    const children = file.type === 'folder' ? (app.files || []).filter((f: any) => f.name.startsWith(file.name + '/')) : [];
    const rows = [[en ? 'Name / path' : '名称 / 路径', file.name], [en ? 'Type' : '类型', file.type === 'folder' ? (en ? 'Folder' : '文件夹') : (en ? 'File' : '文件')],
        [en ? 'Created' : '创建时间', timestamp(file.createdAt ?? file.created_at)], [en ? 'Last modified' : '最后修改时间', timestamp(file.lastModified ?? file.last_modified)]];
    if (file.type === 'folder') rows.push([en ? 'Contents' : '包含项目', String(children.length)]);
    else if (typeof file.content === 'string') rows.push([en ? 'Characters' : '字符数', String(Array.from(file.content).length)]);
    for (const [name, value] of rows) { const key = document.createElement('dt'); key.textContent = name; const text = document.createElement('dd'); text.textContent = value; list.append(key, text); }
    box.append(list);
    const close = document.createElement('button'); close.type = 'button'; close.textContent = en ? 'Close' : '关闭';
    const dismiss = () => { overlay.remove(); document.removeEventListener('keydown', escape); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') dismiss(); };
    (overlay as any).dismiss = dismiss;
    close.onclick = dismiss; box.append(close); overlay.append(box); document.body.append(overlay); document.addEventListener('keydown', escape); close.focus();
    return overlay;
}

export function foldFileName(anchor: HTMLElement, name: string) {
    if (anchor.querySelector('.file-node-name')) return;
    const span = document.createElement('span'); span.className = 'file-node-name'; span.textContent = name; span.title = name;
    const text = Array.from(anchor.childNodes).filter(node => node.nodeType === Node.TEXT_NODE);
    if (text.length) { text[0].replaceWith(span); text.slice(1).forEach(node => node.remove()); }
    else anchor.querySelector('.jstree-themeicon')?.after(span);
}

export function bindFileTreeLongPress(element: HTMLElement, open: (anchor: HTMLElement, x: number, y: number) => void, selector = '.jstree-anchor') {
    if (element.dataset.longPressBound) return;
    element.dataset.longPressBound = '1';
    let timer: any, x = 0, y = 0, opened = false;
    const cancel = () => clearTimeout(timer);
    element.addEventListener('pointerdown', event => {
        if (event.pointerType === 'mouse' || event.button !== 0) return;
        cancel(); const anchor = (event.target as Element).closest<HTMLElement>(selector); if (!anchor) return;
        x = event.clientX; y = event.clientY; opened = false;
        timer = setTimeout(() => { opened = true; open(anchor, x, y); }, 550);
    });
    element.addEventListener('pointermove', event => { if (Math.hypot(event.clientX - x, event.clientY - y) > 10) cancel(); });
    element.addEventListener('pointerup', cancel); element.addEventListener('pointercancel', cancel);
    element.addEventListener('click', event => { if (opened) { opened = false; event.preventDefault(); event.stopImmediatePropagation(); } }, true);
}
