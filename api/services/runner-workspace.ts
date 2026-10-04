const {randomUUID} = require('crypto');
const LIMIT = 8*1024*1024, TOTAL = 32*1024*1024, TTL = 30*60000;
type Workspace = {files:Map<string,Buffer>; expires:number; busy:boolean; cwd:string;directories:string[]};
const spaces = new Map<string,Workspace>();
function prune() { for (const [token,s] of spaces) if (!s.busy && s.expires < Date.now()) spaces.delete(token); }
function get(token: unknown) {
    prune(); const s = typeof token === 'string' ? spaces.get(token) : undefined;
    if (!s) throw Error('沙箱文件会话已过期，请重新打开文件管理并上传文件');
    s.expires = Date.now()+TTL; return s;
}
function name(value: unknown) {
    if (typeof value !== 'string' || !value || value.length > 512 || value.startsWith('/') || value.split('/').some(p=>!p || p==='.' || p==='..') || /[\x00-\x1f\\]/.test(value) || value.split('/').some(p=>Buffer.byteLength(p)>255)) throw Error('文件路径无效');
    return value;
}
function replace(s:Workspace, files:Map<string,Buffer>) {
    const bytes = [...files.values()].reduce((n,b)=>n+b.length,0);
    const other = [...spaces.values()].filter(v=>v!==s).reduce((n,v)=>n+[...v.files.values()].reduce((n,b)=>n+b.length,0),0);
    if (files.size>64 || bytes>LIMIT || other+bytes>TOTAL) throw Error('沙箱文件空间不足：每个会话最多 64 个文件、8 MB');
    s.files = files;
}
export function createWorkspace() { prune(); if(spaces.size>=32) throw Error('沙箱会话过多，请稍后再试'); const token=randomUUID(); spaces.set(token,{files:new Map(),expires:Date.now()+TTL,busy:false,cwd:'',directories:[]}); return token; }
export function listWorkspace(token: unknown) { const s=get(token); return {token,directory:'/tmp/home',cwd:'/tmp/home'+(s.cwd?'/'+s.cwd:''),directories:s.directories,files:[...s.files].map(([name,data])=>({name,path:'/tmp/home/'+name,size:data.length})),busy:s.busy}; }
export function uploadWorkspace(token:unknown, uploads:any[]) {
    const s=get(token); if(s.busy) throw Error('正在运行，请结束后管理文件');
    const files=new Map(s.files);
    for(const file of uploads) {
        const raw=String(file.originalname||'file'), decoded=Buffer.from(raw,'latin1').toString('utf8');
        const original=decoded.includes('\uFFFD')?raw:decoded;
        files.set(name(original.replace(/[\\/\x00-\x1f]/g,'_')),file.buffer);
    }
    replace(s,files); return listWorkspace(token);
}
export function readWorkspace(token:unknown, file:unknown) { const s=get(token); const data=s.files.get(name(file)); if(!data) throw Error('文件不存在'); return data; }
export function deleteWorkspace(token:unknown,file:unknown) { const s=get(token); if(s.busy) throw Error('正在运行，请结束后管理文件'); s.files.delete(name(file)); return listWorkspace(token); }
export function beginWorkspace(token:unknown) {
    const s=get(token); if(s.busy) throw Error('当前文件会话正在运行，请等待结束'); s.busy=true;
    return {files:[...s.files].map(([name,data])=>({name,data:data.toString('base64')})),cwd:s.cwd,directories:s.directories,
        finish(result:any) {
            try {
                if(Array.isArray(result.files)) {
                    const snapshot=new Map<string,Buffer>(result.fileWarning?s.files:[]), changed=[];
                    for(const file of result.files) {
                        const n=name(file.name), data=Buffer.from(file.data,'base64');
                        if(!s.files.get(n)?.equals(data)) changed.push(file);
                        snapshot.set(n,data);
                    }
                    replace(s,snapshot); result.files=changed;
                }
                if(Array.isArray(result.directories) && !result.fileWarning) s.directories=result.directories.map(name);
                const cwd=String(result.cwd||'');
                if(cwd==='/tmp/home') s.cwd='';
                else if(cwd.startsWith('/tmp/home/')) s.cwd=name(cwd.slice('/tmp/home/'.length));
                result.workspace=listWorkspace(token);
            } catch(error) { result.fileWarning=String(error.message||error); }
            finally { s.busy=false; }
            if(result.workspace) result.workspace.busy=false;
        },cancel() { s.busy=false; }};
}
