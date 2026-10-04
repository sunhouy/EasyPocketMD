type Uploaded = {token:string; name:string; path:string; size:number};

export class RunnerFilesUi {
    uploads: Uploaded[] = [];
    uploading = false;
    private list = document.createElement('div');
    private status = document.createElement('div');
    constructor(private global: any, private busy: () => boolean) {
        this.list.style.cssText = 'flex-shrink:0;max-height:130px;overflow:auto;font:12px system-ui;white-space:normal;';
        this.status.setAttribute('role','status');
    }
    attach(panel: HTMLElement) { panel.appendChild(this.list); this.draw(); }
    setMinimized(value: boolean) { this.list.hidden = value; }
    private endpoint() { return (this.global.getApiBaseUrl?.() || '/api').replace(/\/$/,'') + '/code-runner'; }
    private message(text: string) { this.status.textContent = text; }
    tokens() { return this.uploads.map(f => f.token); }
    private draw() {
        this.list.replaceChildren();
        for (const file of this.uploads) {
            const row = document.createElement('div'); row.style.cssText = 'display:flex;gap:6px;align-items:center;padding:4px 0;';
            const path = document.createElement('code'); path.textContent = file.path; path.title = file.name;
            path.style.cssText = 'flex:1;min-width:0;overflow-wrap:anywhere;'; row.append(path);
            this.button(row,'复制路径',async () => {
                try { await navigator.clipboard.writeText(file.path); this.message('路径已复制'); }
                catch { this.message('无法访问剪贴板，请选中路径手动复制'); }
            });
            this.button(row,'移除',async () => {
                if (this.busy() || this.uploading) return this.message('运行或上传期间不能移除文件');
                try {
                    const response = await fetch(this.endpoint() + '/files/remove',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:file.token})});
                    if (!response.ok) throw Error('移除失败，请重试');
                    this.uploads = this.uploads.filter(f => f.token !== file.token); this.draw();
                } catch (error) { this.message(error.message); }
            });
            this.list.append(row);
        }
        this.list.append(this.status);
    }
    async pick(button: HTMLButtonElement) {
        if (this.busy() || this.uploading) return this.message('请在运行结束后上传文件');
        const picker = document.createElement('input'); picker.type = 'file'; picker.multiple = true;
        picker.onchange = async () => {
            const files = Array.from(picker.files || []);
            if (!files.length) return;
            if (this.busy() || this.uploading) return this.message('请在运行结束后上传文件');
            if (files.length + this.uploads.length > 8 || files.some(f => f.size > 5*1024*1024) || files.reduce((n,f)=>n+f.size,0) + this.uploads.reduce((n,f)=>n+f.size,0) > 8*1024*1024) return this.message('最多 8 个文件，单文件 5 MB，总大小 8 MB');
            this.uploading = true; button.disabled = true; button.setAttribute('aria-busy','true'); this.message('正在上传文件…');
            try {
                const body = new FormData(); files.forEach(f => body.append('files',f));
                const response = await fetch(this.endpoint() + '/files',{method:'POST',body});
                const result = await response.json();
                if (!response.ok || !result.success) throw Error(result.error || '上传失败，请重试');
                this.uploads.push(...result.files); this.draw(); this.message('已上传：下次运行 Python 时可使用以上路径。有效期 30 分钟。');
            } catch (error) { this.message(error.message || '上传失败，请重试'); }
            finally { this.uploading = false; button.disabled = false; button.removeAttribute('aria-busy'); }
        };
        picker.click();
    }
    private button(parent: HTMLElement, label: string, action: () => unknown) {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
        button.style.cssText = 'padding:4px 7px;border:1px solid #aaa;border-radius:4px;background:transparent;color:inherit;cursor:pointer;white-space:nowrap;';
        button.onclick = () => { void action(); }; parent.append(button); return button;
    }
    appendArtifact(parent: HTMLElement, name: string, data: string, mime = 'application/octet-stream', preview = false) {
        if (typeof data !== 'string' || data.length > 5600000 || data.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data)) return;
        const raw = Uint8Array.from(atob(data), c => c.charCodeAt(0));
        if (preview && mime !== 'image/png') return;
        if (raw[0] === 137 && raw[1] === 80 && raw[2] === 78 && raw[3] === 71) { mime = 'image/png'; preview = true; }
        else if (raw[0] === 255 && raw[1] === 216 && raw[2] === 255) { mime = 'image/jpeg'; preview = true; }
        else if (String.fromCharCode(...raw.slice(0,6)).startsWith('GIF8')) { mime = 'image/gif'; preview = true; }
        else if (String.fromCharCode(...raw.slice(0,4)) === 'RIFF' && String.fromCharCode(...raw.slice(8,12)) === 'WEBP') { mime = 'image/webp'; preview = true; }
        const file = new File([raw],name.split('/').pop() || 'output',{type:mime});
        const card = document.createElement('div'); card.style.cssText = 'margin:10px 0;padding:8px;border:1px solid #bbb;border-radius:5px;white-space:normal;';
        const title = document.createElement('div'); title.textContent = name + ' · ' + Math.ceil(raw.length/1024) + ' KB'; title.style.overflowWrap = 'anywhere'; card.append(title);
        if (preview) {
            const image = document.createElement('img'); image.src = 'data:' + mime + ';base64,' + data; image.alt = name;
            image.style.cssText = 'display:block;max-width:100%;height:auto;margin:8px auto;background:white;'; card.append(image);
        }
        const actions = document.createElement('div'); actions.style.cssText = 'display:flex;gap:8px;margin-top:6px;'; card.append(actions);
        this.button(actions,'下载',() => {
            const url = URL.createObjectURL(file); const a = document.createElement('a');
            a.href = url; a.download = file.name; document.body.append(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),10000);
        });
        const editor = this.global.vditor;
        const target = this.global.currentFileId;
        const share = this.global.sharedDocState?.shareId;
        const owner = this.global.currentUser?.username;
        const editable = () => this.global.vditor === editor && this.global.currentFileId === target && this.global.sharedDocState?.shareId === share
            && this.global.currentUser?.username === owner
            && (!this.global.sharedDocState || this.global.sharedDocState.canEdit === true)
            && !document.querySelector('[data-shared-readonly="true"]');
        const insert = this.button(actions,'插入当前文档',async () => {
            const notice = document.createElement('div'); notice.setAttribute('role','status'); card.append(notice);
            if (!editable() || !editor || typeof this.global.uploadFiles !== 'function') { notice.textContent = '文档已切换、不可编辑或附件功能尚未就绪'; return; }
            insert.disabled = true; insert.textContent = '正在插入…';
            try {
                const link = await this.global.uploadFiles([file],false);
                if (!link) throw Error('未插入：上传未完成或已取消');
                if (!editable()) throw Error('文档已切换或权限已改变，请回到原文档后重试');
                editor.insertValue('\n\n' + link + '\n\n'); notice.textContent = '已插入当前文档';
            } catch (error) { notice.textContent = error.message || '插入失败，请重试'; }
            finally { insert.disabled = !editable(); insert.textContent = '插入当前文档'; }
        });
        insert.disabled = !editor || !editable(); parent.append(card);
    }
}
