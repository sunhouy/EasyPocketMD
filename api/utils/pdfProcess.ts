import { spawn } from 'child_process';
import { open, readFile, stat } from 'fs/promises';

const MAX_HTML_BYTES = 8 * 1024 * 1024;
const MAX_PDF_BYTES = 32 * 1024 * 1024;
const MAX_ACTIVE_EXPORTS = 1;
const MAX_MEMORY_KB = 512 * 1024;
let activeExports = 0;

function pdfError(message: string, status = 500) {
    return Object.assign(new Error(message), { status });
}

export function validatePdfHtml(html: unknown): asserts html is string {
    if (typeof html !== 'string' || !html.trim()) throw pdfError('HTML content is required', 400);
    if (Buffer.byteLength(html, 'utf8') > MAX_HTML_BYTES) throw pdfError('PDF document is too large (maximum 8 MB)', 413);
}

/** Own the native process and validate its completed output before returning. */
export function renderPdf(html: string, options: Record<string, unknown>, filePath: string,
    signal?: AbortSignal, timeoutMs = 60000): Promise<void> {
    validatePdfHtml(html);
    if (activeExports >= MAX_ACTIVE_EXPORTS) return Promise.reject(pdfError('PDF export is busy; please retry shortly', 503));
    if (signal?.aborted) return Promise.reject(pdfError('PDF export cancelled', 499));
    activeExports++;
    return new Promise((resolve, reject) => {
        let child: ReturnType<typeof spawn> | null = null;
        let timer: ReturnType<typeof setTimeout>;
        let resourceTimer: ReturnType<typeof setInterval>;
        let settled = false;
        let released = false;
        let processClosed = false;
        let stderr = '';
        const release = () => {
            if (!released) { released = true; activeExports--; }
        };
        const cleanup = () => {
            clearTimeout(timer);
            clearInterval(resourceTimer);
            signal?.removeEventListener('abort', abort);
        };
        const fail = (error: Error) => {
            if (settled) return;
            settled = true;
            cleanup();
            if (child && !processClosed) child.kill('SIGKILL');
            child?.stdin?.destroy();
            reject(error);
        };
        const abort = () => fail(pdfError('PDF export cancelled', 499));
        const finish = async () => {
            if (settled) return;
            const info = await stat(filePath);
            if (info.size > MAX_PDF_BYTES) throw pdfError('Generated PDF exceeds 32 MB', 413);
            if (!info.size) throw pdfError('PDF generation failed: output is empty. ' + stderr.slice(-1500));
            const file = await open(filePath, 'r');
            try {
                const header = Buffer.alloc(5);
                const { bytesRead } = await file.read(header, 0, header.length, 0);
                if (bytesRead !== 5 || header.toString('ascii') !== '%PDF-') throw pdfError('PDF generation failed: invalid output');
            } finally {
                await file.close();
            }
            if (!settled) {
                settled = true;
                cleanup();
                resolve();
            }
        };
        try {
            const args = ['--quiet'];
            for (const [key, value] of Object.entries(options)) {
                if (value === false || value === undefined) continue;
                args.push('--' + key.replace(/[A-Z]/g, letter => '-' + letter.toLowerCase()));
                if (value !== true) args.push(String(value));
            }
            // Qt's PDF printer can fail on Node's stdout socket; use a regular file.
            const pdfArgs = [...args, '-', filePath];
            // Limit CPU time, not virtual address space: Qt WebKit reserves large
            // mappings at startup even when resident memory usage is small. Dynamic
            // arguments go through "$@", never interpolated into shell source. There is
            // no pipeline, so SIGKILL reaches the actual converter process.
            child = process.platform === 'linux'
                ? spawn('/bin/sh', ['-c', 'ulimit -t 60 || exit 1; exec wkhtmltopdf "$@"',
                    'wkhtmltopdf', ...pdfArgs], { stdio: ['pipe', 'ignore', 'pipe'],
                    env: { ...process.env, QT_QPA_PLATFORM: process.env.QT_QPA_PLATFORM || 'offscreen' } })
                : spawn('wkhtmltopdf', pdfArgs, { stdio: ['pipe', 'ignore', 'pipe'] });
            child.on('error', error => { processClosed = true; release(); fail(error); });
            child.on('close', (code, exitSignal) => {
                processClosed = true;
                release();
                if (code !== 0) fail(pdfError('PDF conversion failed (' + (exitSignal || 'exit ' + code) + '): ' + stderr.slice(-2000)));
                else void finish().catch(fail);
            });
            child.stdin!.on('error', fail);
            child.stderr!.on('error', fail);
            child.stderr!.on('data', data => { stderr = (stderr + data.toString()).slice(-65536); });
            timer = setTimeout(() => fail(pdfError('PDF generation timeout (60 seconds)', 504)), timeoutMs);
            {
                const statusPath = process.platform === 'linux' && child.pid ? '/proc/' + child.pid + '/status' : null;
                let readingResources = false;
                resourceTimer = setInterval(async () => {
                    if (settled || processClosed || readingResources) return;
                    readingResources = true;
                    try {
                        const status = statusPath ? await readFile(statusPath, 'utf8') : '';
                        const kb = (name: string) => Number(new RegExp('^' + name + ':\\s+(\\d+)\\s+kB', 'm').exec(status)?.[1] || 0);
                        if (!settled && !processClosed && kb('VmRSS') + kb('VmSwap') > MAX_MEMORY_KB) {
                            fail(pdfError('PDF converter exceeds 512 MB of memory', 413));
                            return;
                        }
                        const info = await stat(filePath).catch(error => {
                            if (error.code === 'ENOENT') return null;
                            throw error;
                        });
                        if (!settled && !processClosed && info && info.size > MAX_PDF_BYTES) fail(pdfError('Generated PDF exceeds 32 MB', 413));
                    } catch (error) {
                        // /proc disappears when the child exits; its close event owns cleanup.
                        if (!settled && !processClosed && (error as NodeJS.ErrnoException).code !== 'ENOENT') {
                            fail(pdfError('Unable to monitor PDF converter resources'));
                        }
                    } finally {
                        readingResources = false;
                    }
                }, 100);
            }
            signal?.addEventListener('abort', abort, { once: true });
            child.stdin!.end(html);
        } catch (error) {
            if (!child) release();
            fail(error as Error);
        }
    });
}
