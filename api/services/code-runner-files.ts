// Temporary, capability-scoped uploads. Nothing is mounted from the host into
// submitted-code containers; the validated bytes travel over Docker stdin.
const { randomUUID } = require('crypto');
const MAX_BATCH = 8 * 1024 * 1024;
const MAX_STORED = 32 * 1024 * 1024;
const TTL = 30 * 60000;
const staged = new Map<string, {name:string; data:Buffer; expires:number}>();

function prune() {
    for (const [token, file] of staged) if (file.expires <= Date.now()) staged.delete(token);
}

export function stageRunnerFiles(files: any[]) {
    prune();
    const size = files.reduce((n, f) => n + f.buffer.length, 0);
    if (!files.length || files.length > 8 || size > MAX_BATCH) throw Error('最多上传 8 个文件，总大小不超过 8 MB');
    if (size + [...staged.values()].reduce((n, f) => n + f.data.length, 0) > MAX_STORED) throw Error('上传空间暂时不足，请移除旧文件或稍后重试');
    return files.map(file => {
        const token = randomUUID();
        // Multipart's originalname may be Latin-1 encoded by busboy.
        const raw = String(file.originalname || 'file');
        const decoded = Buffer.from(raw, 'latin1').toString('utf8');
        let original = (decoded.includes('\uFFFD') ? raw : decoded).replace(/[\\/\x00-\x1f\x7f]/g, '_').slice(0,100) || 'file';
        while (Buffer.byteLength(original,'utf8') > 180) original = original.slice(0,-1);
        const name = token.slice(0,8) + '-' + original;
        staged.set(token, {name, data:file.buffer, expires:Date.now() + TTL});
        return {token, name:original, path:'/tmp/uploads/' + name, size:file.buffer.length};
    });
}

export function resolveRunnerFiles(tokens: unknown): {name:string; data:string}[] {
    prune();
    if (tokens === undefined) return [];
    if (!Array.isArray(tokens) || tokens.length > 8 || tokens.some(t => typeof t !== 'string') || new Set(tokens).size !== tokens.length) throw Error('上传文件列表无效');
    const files = tokens.map(token => {
        const file = staged.get(token);
        if (!file) throw Error('上传文件已过期，请重新上传（有效期 30 分钟）');
        return file;
    });
    if (files.reduce((n,f) => n + f.data.length,0) > MAX_BATCH) throw Error('本次运行上传文件总大小不能超过 8 MB');
    return files.map(f => ({name:f.name, data:f.data.toString('base64')}));
}

export function removeRunnerFile(token: unknown) {
    if (typeof token === 'string') staged.delete(token);
}
