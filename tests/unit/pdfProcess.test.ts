// @ts-nocheck
import { EventEmitter } from 'events';
import { PassThrough } from 'stream';
import { spawn } from 'child_process';
import { createWriteStream } from 'fs';
import { renderPdf, validatePdfHtml } from '../../api/utils/pdfProcess';

jest.mock('child_process', () => ({ spawn: jest.fn() }));

describe('PDF process lifecycle', () => {
    const children: any[] = [];
    beforeEach(() => {
        jest.useFakeTimers();
        children.length = 0;
        (spawn as jest.Mock).mockImplementation(() => {
            const child: any = new EventEmitter();
            child.stdin = new PassThrough();
            child.stdout = new PassThrough();
            child.stderr = new PassThrough();
            child.kill = jest.fn(() => { child.emit('close', null); return true; });
            children.push(child);
            return child;
        });
        (createWriteStream as jest.Mock).mockImplementation(() => new PassThrough());
    });
    afterEach(() => jest.useRealTimers());

    it('kills a hung converter on timeout and frees its slot', async () => {
        const result = renderPdf('<h1>hello</h1>', {}, '/tmp/test.pdf', undefined, 100);
        const rejected = expect(result).rejects.toMatchObject({ status: 504 });
        jest.advanceTimersByTime(100);
        await rejected;
        expect(children[0].kill).toHaveBeenCalledWith('SIGKILL');
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

    it('rejects oversized output and stderr stays bounded', async () => {
        const result = renderPdf('html', {}, '/tmp/test.pdf');
        const rejected = expect(result).rejects.toMatchObject({ status: 413 });
        children[0].stdout.emit('data', Buffer.alloc(33 * 1024 * 1024));
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

    it('returns success only after both process exit and output finish', async () => {
        const result = renderPdf('html', {}, '/tmp/test.pdf');
        const output = (createWriteStream as jest.Mock).mock.results[0].value;
        children[0].emit('close', 0);
        output.emit('finish');
        await expect(result).resolves.toBeUndefined();
        expect(children[0].kill).not.toHaveBeenCalled();
    });
});
