export class RunnerFilesUi {
    uploading = false;
    private token = '';
    private owner = '';
    private creating: Promise<string> | null = null;
    private list = document.createElement('div');
    private status = document.createElement('div');
    private terminal = document.createElement('pre');
    private files: {name:string;path:string;size:number}[] = [];
    private directories: string[] = [];
    private cwd = '/tmp/home';
    private tab: 'files'|'terminal'|null = null;
    constructor(private global: any, private busy: () => boolean, private command: (command:string)=>Promise<any>) {
        this.list.style.cssText = 'flex-shrink:0;max-height:50%;overflow:auto;font:12px system-ui;white-space:normal;user-select:text;-webkit-user-select:text;';
        this.status.setAttribute('role','status');
        this.terminal.style.cssText='max-height:130px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;user-select:text;-webkit-user-select:text;';
    }
    attach(panel: HTMLElement) { panel.appendChild(this.list); this.draw(); }
    setMinimized(value:boolean) { this.list.hidden=value || !this.tab; }
    tokens() { return []; }
    resetExpired() {this.token='';this.files=[];this.directories=[];this.cwd='/tmp/home';this.draw();this.message('会话已过期，请重新上传文件');}
    private endpoint() { return (this.global.getApiBaseUrl?.() || '/api').replace(/\/$/,'') + '/code-runner'; }
    private message(text:string) { this.status.textContent=text; }
    async workspace() {
        const owner=this.global.currentUser?.username || 'guest';
        if(this.owner!==owner) { this.token='';this.files=[];this.directories=[];this.terminal.textContent='';this.owner=owner; }
        if(this.token) return this.token;
        if(this.creating) return this.creating;
        this.creating=(async()=>{
            const response=await fetch(this.endpoint()+'/workspace',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'create'})});
            const result=await response.json(); if(!response.ok || !result.token) throw Error(result.error||'无法创建沙箱文件会话');
            if((this.global.currentUser?.username||'guest')!==owner) throw Error('账号已切换，请重试');
            this.token=result.token;return this.token;
        })();
        try {return await this.creating;} finally {this.creating=null;}
    }
    accept(result:any) {
        if(this.owner && this.owner!==(this.global.currentUser?.username||'guest')) {this.token='';this.files=[];this.directories=[];this.draw();return;}
        const state=result.workspace || result;
        if(state.token && state.token!==this.token)return;
        if(Array.isArray(state.files)) {this.files=state.files;this.directories=state.directories || [];this.cwd=state.cwd||'/tmp/home';this.draw();}
    }
    async refresh() {
        const workspace=await this.workspace();
        const response=await fetch(this.endpoint()+'/workspace',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({workspace,action:'list'})});
        const result=await response.json();if(!response.ok){if(String(result.error||'').includes('过期'))this.resetExpired();throw Error(result.error||'加载文件失败');}this.accept(result);
    }
    async show(tab:'files'|'terminal') {this.tab=tab;this.list.hidden=false;this.draw();try {await this.refresh();}catch(e){this.message(e.message);}}
    private draw() {
        this.list.replaceChildren();this.list.hidden=!this.tab;
        if(!this.tab)return;
        const tabs=document.createElement('div');tabs.style.cssText='display:flex;gap:6px;align-items:center;margin:5px 0;';
        this.button(tabs,'文件',()=>this.show('files'));this.button(tabs,'命令行',()=>this.show('terminal'));
        this.button(tabs,'刷新',()=>this.refresh().catch(e=>this.message(e.message)));
        this.button(tabs,'关闭',()=>{this.tab=null;this.draw();});this.list.append(tabs);
        const directory=document.createElement('div');directory.textContent='用户目录 /tmp/home · 当前目录 '+this.cwd;directory.style.overflowWrap='anywhere';this.list.append(directory);
        if(this.tab==='terminal') {
            this.list.append(this.terminal);
            const form=document.createElement('form');form.style.cssText='display:flex;gap:6px;margin:5px 0;';
            const input=document.createElement('input');input.placeholder='输入命令，如 ls -la、pwd、python -c "print(1)"';input.setAttribute('aria-label','沙箱命令');input.style.cssText='flex:1;min-width:0;padding:6px;border:1px solid #aaa;background:transparent;color:inherit;user-select:text;';
            const send=document.createElement('button');send.type='submit';send.textContent='执行';form.append(input,send);this.list.append(form);
            form.onsubmit=async event=>{
                event.preventDefault();if(this.busy()||this.uploading||!input.value.trim())return this.message('请等待当前任务结束，再输入命令');
                const command=input.value;send.disabled=true;input.readOnly=true;
                this.terminal.textContent+='\n'+this.cwd+' $ '+command+'\n';
                try {const result=await this.command(command);this.terminal.textContent+=String(result.output||'')+(result.success?'':'\n'+String(result.error||'运行失败'));this.terminal.textContent=this.terminal.textContent.slice(-65536);this.accept(result);input.value='';}
                catch(e){this.message(e.message);}finally{send.disabled=false;input.readOnly=false;this.terminal.scrollTop=this.terminal.scrollHeight;}
            };
        } else {
            if(!this.files.length&&!this.directories.length){const empty=document.createElement('p');empty.textContent='目录为空，可使用代码块顶部的上传按钮添加文件。';this.list.append(empty);}
            for(const folder of this.directories){const row=document.createElement('div');row.textContent='📁 '+folder;this.list.append(row);}
            for(const file of this.files){
                const row=document.createElement('div');row.style.cssText='display:flex;gap:6px;align-items:center;padding:4px 0;border-bottom:1px solid #ddd;';
                const label=document.createElement('code');label.textContent=file.path+' · '+Math.ceil(file.size/1024)+' KB';label.style.cssText='flex:1;min-width:0;overflow-wrap:anywhere;user-select:text;';row.append(label);
                this.button(row,'路径',()=>navigator.clipboard.writeText(file.path).then(()=>this.message('路径已复制')).catch(()=>this.message('请选择路径手动复制')));
                this.button(row,'下载',async()=>{
                    try{const workspace=await this.workspace();const response=await fetch(this.endpoint()+'/workspace',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({workspace,action:'download',name:file.name})});if(!response.ok)throw Error((await response.json()).error);const blob=await response.blob();const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=file.name.split('/').pop();document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);}catch(e){this.message(e.message);}
                });
                this.button(row,'删除',async()=>{
                    if(this.busy()||this.uploading)return this.message('运行或上传期间不能删除文件');
                    try{const workspace=await this.workspace();const response=await fetch(this.endpoint()+'/workspace',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({workspace,action:'delete',name:file.name})});const result=await response.json();if(!response.ok)throw Error(result.error);this.accept(result);}catch(e){this.message(e.message);}
                });this.list.append(row);
            }
        }
        this.list.append(this.status);
    }
    async pick(button:HTMLButtonElement) {
        this.tab='files';this.draw();
        if(this.busy()||this.uploading)return this.message('请在当前运行结束后上传');
        const picker=document.createElement('input');picker.type='file';picker.multiple=true;
        picker.onchange=async()=>{
            const files=Array.from(picker.files||[]);if(!files.length)return;
            if(this.busy()||this.uploading)return this.message('请在当前运行结束后上传');
            if(files.length>8||files.some(f=>f.size>5*1024*1024)||files.reduce((n,f)=>n+f.size,0)>8*1024*1024)return this.message('单次最多 8 个文件，单文件 5 MB，总大小 8 MB');
            this.uploading=true;button.disabled=true;button.setAttribute('aria-busy','true');this.tab='files';this.draw();this.message('上传中…');
            try{const workspace=await this.workspace();const body=new FormData();body.append('workspace',workspace);files.forEach(f=>body.append('files',f));const response=await fetch(this.endpoint()+'/files',{method:'POST',body});const result=await response.json();if(!response.ok)throw Error(result.error||'上传失败');this.accept(result);this.message('已上传，可复制 /tmp/home/ 路径供代码使用。同名文件会替换；会话空闲 30 分钟后清理。');}
            catch(e){this.message(e.message);}finally{this.uploading=false;button.disabled=false;button.removeAttribute('aria-busy');}
        };picker.click();
    }
    private button(parent:HTMLElement,label:string,action:()=>unknown) {
        const button=document.createElement('button');button.type='button';button.textContent=label;button.style.cssText='padding:4px 6px;border:1px solid #aaa;border-radius:4px;background:transparent;color:inherit;cursor:pointer;white-space:nowrap;';
        button.onclick=()=>{void action();};parent.append(button);return button;
    }
    appendArtifact(parent: HTMLElement, name: string, data: string, mime = 'application/octet-stream', preview = false) {
        if (typeof data !== 'string' || data.length > 11200000 || data.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data)) return;
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
