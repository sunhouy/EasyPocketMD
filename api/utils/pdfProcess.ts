import { spawn } from 'child_process';
import { createWriteStream } from 'fs';

const MAX_HTML_BYTES = 8 * 1024 * 1024;
const MAX_PDF_BYTES = 32 * 1024 * 1024;
const MAX_ACTIVE_EXPORTS = 1;
let activeExports = 0;

function pdfError(message: string, status = 500) {
    return Object.assign(new Error(message), { status });
}

export function validatePdfHtml(html: unknown): asserts html is string {
    if (typeof html !== 'string' || !html.trim()) throw pdfError('HTML content is required', 400);
    if (Buffer.byteLength(html, 'utf8') > MAX_HTML_BYTES) throw pdfError('PDF document is too large (maximum 8 MB)', 413);
}

/** Own the native process; destroying stdout alone does not stop wkhtmltopdf. */
export function renderPdf(html: string, options: Record<string, unknown>, filePath: string,
    signal?: AbortSignal, timeoutMs = 60000): Promise<void> {
    validatePdfHtml(html);
    if (activeExports >= MAX_ACTIVE_EXPORTS) return Promise.reject(pdfError('PDF export is busy; please retry shortly', 503));
    if (signal?.aborted) return Promise.reject(pdfError('PDF export cancelled', 499));
    activeExports++;
    return new Promise((resolve, reject) => {
        let child: ReturnType<typeof spawn> | null = null;
        let output: ReturnType<typeof createWriteStream>;
        let timer: ReturnType<typeof setTimeout>;
        let settled = false;
        let released = false;
        let processClosed = false;
        let outputFinished = false;
        let outputBytes = 0;
        let stderr = '';
        const release = () => {
            if (!released) { released = true; activeExports--; }
        };
        const cleanup = () => {
            clearTimeout(timer);
            signal?.removeEventListener('abort', abort);
        };
        const fail = (error: Error) => {
            if (settled) return;
            settled = true;
            cleanup();
            if (child && !processClosed) child.kill('SIGKILL');
            child?.stdin?.destroy();
            child?.stdout?.destroy();
            output?.destroy();
            reject(error);
        };
        const abort = () => fail(pdfError('PDF export cancelled', 499));
        const finish = () => {
            // EOF alone is not success: the converter may still exit with an error.
            if (!settled && processClosed && outputFinished) {
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
            const pdfArgs = [...args, '-', '-'];
            // On Linux apply OS limits before exec replaces the shell with Qt. Dynamic
            // arguments go through "$@", never interpolated into shell source. There is
            // no pipeline, so SIGKILL reaches the actual converter process.
            child = process.platform === 'linux'
                ? spawn('/bin/sh', ['-c', 'ulimit -v 524288 || exit 1; ulimit -t 60 || exit 1; exec wkhtmltopdf "$@"',
                    'wkhtmltopdf', ...pdfArgs], { stdio: ['pipe', 'pipe', 'pipe'] })
                : spawn('wkhtmltopdf', pdfArgs, { stdio: ['pipe', 'pipe', 'pipe'] });
            child.on('error', error => { processClosed = true; release(); fail(error); });
            child.on('close', code => {
                processClosed = true;
                release();
                if (code !== 0) fail(pdfError('PDF conversion failed: ' + stderr.slice(-2000)));
                else finish();
            });
            output = createWriteStream(filePath);
            output.on('error', fail);
            output.on('finish', () => { outputFinished = true; finish(); });
            child.stdin!.on('error', fail);
            child.stdout!.on('error', fail);
            child.stderr!.on('error', fail);
            child.stderr!.on('data', data => { stderr = (stderr + data.toString()).slice(-65536); });
            child.stdout!.on('data', data => {
                outputBytes += data.length;
                if (outputBytes > MAX_PDF_BYTES) fail(pdfError('Generated PDF exceeds 32 MB', 413));
            });
            timer = setTimeout(() => fail(pdfError('PDF generation timeout (60 seconds)', 504)), timeoutMs);
            signal?.addEventListener('abort', abort, { once: true });
            child.stdout!.pipe(output);
            child.stdin!.end(html);
        } catch (error) {
            if (!child) release();
            fail(error as Error);
        }
    });
}
