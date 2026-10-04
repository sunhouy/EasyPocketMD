// Never execute submitted Python on the application host or fall back to host Python.
const { spawn } = require('child_process');
const { randomUUID } = require('crypto');
const MAX_CAPTURE = 16 * 1024 * 1024;
const TIMEOUT = 20000;
const smallHost = require('os').totalmem() < 3 * 1024 * 1024 * 1024;
const MEMORY_MB = smallHost ? 256 : 512;
const MAX_CONCURRENT = 5;
let active = 0;

function cleanup(name) {
    return new Promise<void>(resolve => {
        const child = spawn('docker', ['rm', '-f', name], { stdio:'ignore', shell:false });
        const timer = setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 5000);
        const done = () => { clearTimeout(timer); resolve(); };
        child.once('error', done); child.once('close', done);
    });
}

export async function runPythonSandbox(code: string, signal?: AbortSignal, onInput?: (event: any, signal: AbortSignal) => Promise<string>, files: {name:string; data:string}[] = [], options: {workspace?:boolean;cwd?:string;directories?:string[]} = {}): Promise<any> {
    if (active >= MAX_CONCURRENT) return { success:false, status:429, error:'已有 5 个 Python 任务正在运行，请稍后重试。' };
    active++;
    const name = 'epmd-python-' + randomUUID();
    try {
        return await new Promise(resolve => {
            let output = '', stderr = '', bytes = 0, settled = false, resultValue: any, waiting = false, protocolReady = false;
            let remaining = TIMEOUT, started = Date.now(), timer: ReturnType<typeof setTimeout>;
            const inputController = new AbortController();
            const child = spawn('docker', [
                'run', '--rm', '--pull=never', '--name', name, '-i',
                '--label', 'easypocketmd.sandbox-owner=' + (process.env.EPMD_SANDBOX_OWNER || 'standalone'),
                '--network=none', '--read-only', '--cap-drop=ALL',
                '--security-opt=no-new-privileges', '--user=65534:65534',
                `--memory=${MEMORY_MB}m`, `--memory-swap=${MEMORY_MB}m`, '--cpus=1', '--pids-limit=64',
                '--ulimit=nofile=128:128', '--ulimit=core=0', '--log-driver=none',
                '--tmpfs=/tmp:rw,noexec,nosuid,size=64m,mode=1777',
                ...(process.env.PYTHON_SANDBOX_CGROUP ? ['--cgroup-parent=' + process.env.PYTHON_SANDBOX_CGROUP] : []),
                process.env.PYTHON_SANDBOX_IMAGE || 'easypocketmd-python:1'
            ], { shell:false, stdio:['pipe','pipe','pipe'] });
            const finish = (result) => {
                if (settled) return; settled = true;
                clearTimeout(timer); clearTimeout(lifetime); clearTimeout(handshake); inputController.abort(); signal?.removeEventListener('abort', abort);
                child.kill('SIGKILL');
                void cleanup(name).finally(() => resolve(result));
            };
            const abort = () => finish({success:false,status:499,error:'Execution cancelled'});
            const arm = () => {
                started = Date.now();
                timer = setTimeout(() => finish({success:false,status:408,error:'Python execution timed out (20 seconds of execution)'}), Math.max(1, remaining));
            };
            const lifetime = setTimeout(() => finish({success:false,status:408,error:'Interactive execution session expired (5 minutes)'}), 5 * 60000);
            const handshake = onInput ? setTimeout(() => {
                if (!protocolReady) finish({success:false,status:503,error:'Python 沙箱版本过旧或启动失败，不支持交互输入。请部署最新沙箱镜像后重试。'});
            }, 8000) : undefined;
            arm();
            signal?.addEventListener('abort', abort, {once:true});
            child.stdin.on('error', () => {});
            child.stdout.setEncoding('utf8');
            child.stderr.setEncoding('utf8');
            child.stdout.on('data', chunk => {
                bytes += Buffer.byteLength(chunk, 'utf8');
                if (bytes > MAX_CAPTURE) return finish({success:false,status:413,error:'Python output exceeds size limit'});
                output += chunk.toString('utf8');
                let newline: number;
                while (!settled && (newline = output.indexOf('\n')) >= 0) {
                    const line = output.slice(0, newline); output = output.slice(newline + 1);
                    try {
                        const value = JSON.parse(line);
                        if (value.type === 'ready' && value.protocol === 2) {
                            if (options.workspace && value.workspace !== true) return finish({success:false,status:503,error:'请更新 Python 沙箱镜像以启用命令行和文件管理'});
                            if (files.length && value.files !== true) return finish({success:false,status:503,error:'沙箱镜像不支持上传文件，请部署最新版本后重试'});
                            protocolReady = true; clearTimeout(handshake);
                        } else if (value.type === 'input') {
                            if (!onInput || !protocolReady || waiting || typeof value.prompt !== 'string' || typeof value.output !== 'string') throw Error('Invalid input request');
                            waiting = true; remaining -= Date.now() - started; clearTimeout(timer);
                            timer = setTimeout(() => finish({success:false,status:408,error:'Input timed out (2 minutes)'}), 120000);
                            Promise.resolve(onInput({prompt:value.prompt.slice(0,4096),output:value.output.slice(0,65536)}, inputController.signal)).then(text => {
                                if (settled) return;
                                if (typeof text !== 'string' || Buffer.byteLength(text) > 65536) return finish({success:false,status:413,error:'Input exceeds 64 KB limit'});
                                clearTimeout(timer); waiting = false; arm();
                                child.stdin.write(JSON.stringify({value:text}) + '\n');
                            }).catch(() => finish({success:false,status:499,error:'Input cancelled'}));
                        } else if (value.type === 'result') resultValue = value;
                        else throw Error('Invalid event');
                    } catch { return finish({success:false,status:500,error:'Invalid Python sandbox response'}); }
                }
            });
            child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString('utf8')).slice(-8192); });
            child.once('error', () => finish({success:false,status:503,error:'Python sandbox unavailable. Install Docker and build the sandbox image.'}));
            child.once('close', exit => {
                if (settled) return;
                if (exit !== 0) return finish({success:false,status:503,error:exit === 137 ? 'Python exceeded its memory limit' : 'Python sandbox failed. Check its image and Docker service.', details:stderr});
                try {
                    const value = resultValue || JSON.parse(output);
                    if (typeof value.success !== 'boolean' || typeof value.output !== 'string' || !Array.isArray(value.images)) throw Error('Invalid response');
                    let imageBytes = 0;
                    const images = value.images.slice(0,8).map(image => {
                        if (image.mime !== 'image/png' || typeof image.data !== 'string' || !/^[A-Za-z0-9+/=]+$/.test(image.data)) throw Error('Invalid image');
                        const png = Buffer.from(image.data, 'base64'); imageBytes += png.length;
                        if (imageBytes > 2 * 1024 * 1024 || !png.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw Error('Invalid image');
                        return {mime:'image/png',data:image.data};
                    });
                    let fileBytes = 0;
                    if (value.files !== undefined && (!Array.isArray(value.files) || value.files.length > (options.workspace?64:16))) throw Error('Invalid files');
                    const artifacts = (value.files || []).map(file => {
                        if (typeof file.name !== 'string' || !file.name || file.name.length > 512 || /[\x00-\x1f\\\\]/.test(file.name) || file.name.startsWith('/') || file.name.split('/').some(p => p === '..' || p === '.')) throw Error('Invalid filename');
                        if (typeof file.data !== 'string' || file.data.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(file.data)) throw Error('Invalid file');
                        const raw = Buffer.from(file.data,'base64'); fileBytes += raw.length;
                        if (fileBytes > (options.workspace?8:4)*1024*1024) throw Error('File output exceeds limit');
                        return {name:file.name,data:file.data,size:raw.length};
                    });
                    finish({success:value.success,errorLine:Number.isSafeInteger(value.errorLine) && value.errorLine > 0 && value.errorLine <= code.split("\n").length ? value.errorLine : undefined,output:value.output.slice(0,65536),error:value.success ? undefined : String(value.error || 'Python failed').slice(0,65536),images,files:artifacts,directories:Array.isArray(value.directories) && value.directories.length <= 128 && value.directories.every(d => typeof d === 'string' && d.length <= 512 && !d.startsWith('/') && !d.split('/').some(p => p === '..' || p === '.' || !p)) ? value.directories : undefined,cwd:typeof value.cwd === 'string' ? value.cwd.slice(0,512) : undefined,fileWarning:typeof value.fileWarning === 'string' ? value.fileWarning.slice(0,1024) : undefined});
                } catch { finish({success:false,status:500,error:'Invalid Python sandbox response'}); }
            });
            if (signal?.aborted) abort();
            else if (onInput) child.stdin.write(JSON.stringify({code,interactive:true,files,...options}) + '\n');
            else child.stdin.end(JSON.stringify({code,files,...options}));
        });
    } finally { active--; }
}
