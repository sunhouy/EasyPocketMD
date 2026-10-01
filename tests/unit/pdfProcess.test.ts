// @ts-nocheck
import { EventEmitter } from 'events';
import { PassThrough } from 'stream';
import { spawn } from 'child_process';
import { open, readFile, stat } from 'fs/promises';
import { renderPdf, validatePdfHtml } from '../../api/utils/pdfProcess';

jest.mock('child_process', () => ({ spawn: jest.fn() }));
jest.mock('fs/promises', () => ({ ...jest.requireActual('fs/promises'), readFile: jest.fn(), stat: jest.fn(), open: jest.fn() }));

describe('PDF process lifecycle', () => {
    const children: any[] = [];
    beforeEach(() => {
        jest.useFakeTimers();
        children.length = 0;
        (readFile as jest.Mock).mockResolvedValue('VmSize:\t8388608 kB\nVmRSS:\t100000 kB\nVmSwap:\t0 kB\n');
        (spawn as jest.Mock).mockImplementation(() => {
            const child: any = new EventEmitter();
            child.pid = 12345;
            child.stdin = new PassThrough();
            child.stdout = new PassThrough();
            child.stderr = new PassThrough();
            child.kill = jest.fn(() => { child.emit('close', null); return true; });
            children.push(child);
            return child;
        });
        (stat as jest.Mock).mockResolvedValue({ size: 100 });
        (open as jest.Mock).mockResolvedValue({ read: jest.fn(async buffer => { buffer.write('%PDF-'); return { bytesRead: 5 }; }), close: jest.fn().mockResolvedValue(undefined) });
    });
    afterEach(() => jest.useRealTimers());

    it('kills a hung converter on timeout and frees its slot', async () => {
        const result = renderPdf('<h1>hello</h1>', {}, '/tmp/test.pdf', undefined, 100);
        const rejected = expect(result).rejects.toMatchObject({ status: 504 });
        jest.advanceTimersByTime(100);
        await rejected;
        expect(children[0].kill).toHaveBeenCalledWith('SIGKILL');
    });

    it('allows WebKit virtual reservations and starts Qt without an X display', async () => {
        const result = renderPdf('html', {}, '/tmp/test.pdf');
        const [, args, options] = (spawn as jest.Mock).mock.calls[0];
        if (process.platform === 'linux') {
            expect(args[1]).not.toContain('ulimit -v');
            expect(args[1]).toContain('ulimit -t 60');
            expect(options.env.QT_QPA_PLATFORM).toBe(process.env.QT_QPA_PLATFORM || 'offscreen');
            await jest.advanceTimersByTimeAsync(100);
            expect(children[0].kill).not.toHaveBeenCalled();
        }
        children[0].emit('close', 0);
        await expect(result).resolves.toBeUndefined();
    });

    it.each(['VmRSS:\t524289 kB\nVmSwap:\t0 kB', 'VmRSS:\t500000 kB\nVmSwap:\t30000 kB'])('kills actual memory overuse: %s', async status => {
        if (process.platform !== 'linux') return;
        (readFile as jest.Mock).mockResolvedValue(status);
        const result = renderPdf('html', {}, '/tmp/test.pdf');
        const rejected = expect(result).rejects.toMatchObject({ status: 413 });
        await jest.advanceTimersByTimeAsync(100);
        await rejected;
        expect(children[0].kill).toHaveBeenCalledWith('SIGKILL');
        const reads = (readFile as jest.Mock).mock.calls.length;
        await jest.advanceTimersByTimeAsync(500);
        expect(readFile).toHaveBeenCalledTimes(reads);
    });

    it('accepts ignored unpatched-Qt option warnings when conversion succeeds', async () => {
        const result = renderPdf('html', {}, '/tmp/test.pdf');
        children[0].stderr.emit('data', 'The switch --print-media-type is not supported using unpatched qt, and will be ignored.');
        children[0].emit('close', 0);
        await expect(result).resolves.toBeUndefined();
    });

    it('omits patched-Qt-only options and passes a configured executable as an argument', async () => {
        const previous = process.env.WKHTMLTOPDF_PATH;
        process.env.WKHTMLTOPDF_PATH = '/opt/pdf tools/wkhtmltopdf';
        try {
            const result = renderPdf('html', { printMediaType: true, imageQuality: 75, imageDpi: 150, disableLocalFileAccess: true }, '/tmp/test.pdf');
            const [command, args] = (spawn as jest.Mock).mock.calls[0];
            expect(args).not.toContain('--print-media-type');
            expect(args).not.toContain('--image-quality');
            expect(args).not.toContain('--image-dpi');
            expect(args).toContain('--disable-local-file-access');
            if (process.platform === 'linux') expect(args).toContain('/opt/pdf tools/wkhtmltopdf');
            else expect(command).toBe('/opt/pdf tools/wkhtmltopdf');
            children[0].emit('close', 0);
            await expect(result).resolves.toBeUndefined();
        } finally {
            if (previous === undefined) delete process.env.WKHTMLTOPDF_PATH;
            else process.env.WKHTMLTOPDF_PATH = previous;
        }
    });

    it('handles a missing executable without an uncaught exception', async () => {
        const result = renderPdf('html', {}, '/tmp/test.pdf');
        const rejected = expect(result).rejects.toThrow('ENOENT');
        children[0].emit('error', new Error('ENOENT'));
        await rejected;
    });

    it('caps concurrent exports rather than launching more processes', async () => {
        const first = renderPdf('html', {}, '/tmp/first.pdf');
        await expect(renderPdf('html', {}, '/tmp/second.pdf')).rejects.toMatchObject({ status: 503 });
        expect(spawn).toHaveBeenCalledTimes(1);
        const firstError = expect(first).rejects.toThrow();
        children.forEach(child => child.emit('error', new Error('cancel')));
        await firstError;
    });

    it('kills conversion when the client disconnects', async () => {
        const controller = new AbortController();
        const result = renderPdf('html', {}, '/tmp/test.pdf', controller.signal);
        const rejected = expect(result).rejects.toMatchObject({ status: 499 });
        controller.abort();
        await rejected;
        expect(children[0].kill).toHaveBeenCalledWith('SIGKILL');
    });

    it('kills the converter when its output file exceeds the size limit', async () => {
        const result = renderPdf('html', {}, '/tmp/test.pdf');
        const rejected = expect(result).rejects.toMatchObject({ status: 413 });
        (stat as jest.Mock).mockResolvedValue({ size: 33 * 1024 * 1024 });
        await jest.advanceTimersByTimeAsync(100);
        await rejected;
        expect(children[0].kill).toHaveBeenCalled();
    });

    it('requires a successful process exit as well as output completion', async () => {
        const result = renderPdf('html', { disableJavascript: true }, '/tmp/test.pdf');
        const rejected = expect(result).rejects.toThrow('PDF conversion failed');
        children[0].stdout.end('partial pdf');
        children[0].emit('close', 1);
        await rejected;
        expect((spawn as jest.Mock).mock.calls[0][0]).toBe(process.platform === 'linux' ? '/bin/sh' : 'wkhtmltopdf');
        expect((spawn as jest.Mock).mock.calls[0][1]).toContain('--disable-javascript');
    });

    it('validates input size before starting a converter', () => {
        expect(() => validatePdfHtml('x'.repeat(9 * 1024 * 1024))).toThrow('too large');
        expect(() => validatePdfHtml({})).toThrow('required');
        expect(spawn).not.toHaveBeenCalled();
    });

    it.each([0, 33 * 1024 * 1024])('rejects invalid final file size %s even after a successful exit', async size => {
        (stat as jest.Mock).mockResolvedValue({ size });
        const result = renderPdf('html', {}, '/tmp/test.pdf');
        const rejected = expect(result).rejects.toThrow(size ? 'exceeds' : 'empty');
        children[0].emit('close', 0);
        await rejected;
    });

    it('rejects a non-PDF file even when the converter exits successfully', async () => {
        (open as jest.Mock).mockResolvedValue({ read: jest.fn(async buffer => { buffer.write('error'); return { bytesRead: 5 }; }), close: jest.fn() });
        const result = renderPdf('html', {}, '/tmp/test.pdf');
        const rejected = expect(result).rejects.toThrow('invalid output');
        children[0].emit('close', 0);
        await rejected;
    });

    it('returns success only after exit, PDF validation and closing the file handle', async () => {
        let closeFile;
        const file = { read: jest.fn(async buffer => { buffer.write('%PDF-'); return { bytesRead: 5 }; }), close: jest.fn(() => new Promise(resolve => { closeFile = resolve; })) };
        (open as jest.Mock).mockResolvedValue(file);
        const result = renderPdf('html', {}, '/tmp/test.pdf');
        let resolved = false;
        result.then(() => { resolved = true; });
        const args = (spawn as jest.Mock).mock.calls[0][1];
        expect(args.slice(-2)).toEqual(['-', '/tmp/test.pdf']);
        children[0].emit('close', 0);
        await jest.advanceTimersByTimeAsync(0);
        expect(file.close).toHaveBeenCalled();
        expect(resolved).toBe(false);
        closeFile();
        await expect(result).resolves.toBeUndefined();
        expect(children[0].kill).not.toHaveBeenCalled();
    });
});
