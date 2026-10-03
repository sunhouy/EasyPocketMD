// Never execute submitted Python on the application host or fall back to host Python.
const { spawn } = require('child_process');
const { randomUUID } = require('crypto');
const MAX_CAPTURE = 4 * 1024 * 1024;
const TIMEOUT = 20000;
let active = 0;

function cleanup(name) {
    return new Promise<void>(resolve => {
        const child = spawn('docker', ['rm', '-f', name], { stdio:'ignore', shell:false });
        const timer = setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 5000);
        const done = () => { clearTimeout(timer); resolve(); };
        child.once('error', done); child.once('close', done);
    });
}

export async function runPythonSandbox(code: string, signal?: AbortSignal): Promise<any> {
    if (active >= 2) return { success:false, status:429, error:'Python sandbox is busy. Please retry shortly.' };
    active++;
    const name = 'epmd-python-' + randomUUID();
    try {
        return await new Promise(resolve => {
            let output = '', stderr = '', bytes = 0, settled = false;
            const child = spawn('docker', [
                'run', '--rm', '--pull=never', '--name', name, '-i',
                '--network=none', '--read-only', '--cap-drop=ALL',
                '--security-opt=no-new-privileges', '--user=65534:65534',
                '--memory=512m', '--memory-swap=512m', '--cpus=1', '--pids-limit=64',
                '--ulimit=nofile=128:128', '--ulimit=core=0', '--log-driver=none',
                '--tmpfs=/tmp:rw,noexec,nosuid,size=64m,mode=1777',
                process.env.PYTHON_SANDBOX_IMAGE || 'easypocketmd-python:1'
            ], { shell:false, stdio:['pipe','pipe','pipe'] });
            const finish = (result) => {
                if (settled) return; settled = true;
                clearTimeout(timer); signal?.removeEventListener('abort', abort);
                child.kill('SIGKILL');
                void cleanup(name).finally(() => resolve(result));
            };
            const abort = () => finish({success:false,status:499,error:'Execution cancelled'});
            const timer = setTimeout(() => finish({success:false,status:408,error:'Python execution timed out (20 seconds)'}), TIMEOUT);
            signal?.addEventListener('abort', abort, {once:true});
            child.stdin.on('error', () => {});
            child.stdout.setEncoding('utf8');
            child.stderr.setEncoding('utf8');
            child.stdout.on('data', chunk => {
                bytes += Buffer.byteLength(chunk, 'utf8');
                if (bytes > MAX_CAPTURE) return finish({success:false,status:413,error:'Python output exceeds size limit'});
                output += chunk.toString('utf8');
            });
            child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString('utf8')).slice(-8192); });
            child.once('error', () => finish({success:false,status:503,error:'Python sandbox unavailable. Install Docker and build the sandbox image.'}));
            child.once('close', exit => {
                if (settled) return;
                if (exit !== 0) return finish({success:false,status:503,error:exit === 137 ? 'Python exceeded its memory limit' : 'Python sandbox failed. Check its image and Docker service.', details:stderr});
                try {
                    const value = JSON.parse(output);
                    if (typeof value.success !== 'boolean' || typeof value.output !== 'string' || !Array.isArray(value.images)) throw Error('Invalid response');
                    let imageBytes = 0;
                    const images = value.images.slice(0,8).map(image => {
                        if (image.mime !== 'image/png' || typeof image.data !== 'string' || !/^[A-Za-z0-9+/=]+$/.test(image.data)) throw Error('Invalid image');
                        const png = Buffer.from(image.data, 'base64'); imageBytes += png.length;
                        if (imageBytes > 2 * 1024 * 1024 || !png.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw Error('Invalid image');
                        return {mime:'image/png',data:image.data};
                    });
                    finish({success:value.success,output:value.output.slice(0,65536),error:value.success ? undefined : String(value.error || 'Python failed').slice(0,65536),images});
                } catch { finish({success:false,status:500,error:'Invalid Python sandbox response'}); }
            });
            if (signal?.aborted) abort();
            else child.stdin.end(JSON.stringify({code}));
        });
    } finally { active--; }
}
