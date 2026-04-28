const { EventEmitter } = require('events');
const { PassThrough } = require('stream');

jest.mock('child_process', () => ({
    spawn: jest.fn()
}));

const { spawn } = require('child_process');
const request = require('supertest');
const app = require('../../api/server');

function mockMarkitdownSuccess(markdown) {
    spawn.mockImplementation(() => {
        const child = new EventEmitter();
        child.stdout = new PassThrough();
        child.stderr = new PassThrough();
        child.kill = jest.fn();

        process.nextTick(() => {
            child.stdout.write(markdown);
            child.stdout.end();
            child.stderr.end();
            child.emit('close', 0);
        });

        return child;
    });
}

describe('Document Import API Integration', () => {
    beforeEach(() => {
        spawn.mockReset();
    });

    it('converts uploaded PDF files to markdown through MarkItDown', async () => {
        mockMarkitdownSuccess('# Imported PDF\n\nHello from PDF');

        const res = await request(app)
            .post('/api/import/markitdown')
            .attach('file', Buffer.from('%PDF-1.4'), 'sample.pdf');

        expect(res.status).toBe(200);
        expect(res.body.code).toBe(200);
        expect(res.body.data).toMatchObject({
            name: 'sample.pdf',
            markdown: '# Imported PDF\n\nHello from PDF'
        });
        expect(spawn).toHaveBeenCalled();
    });

    it('rejects unsupported import file types before conversion', async () => {
        const res = await request(app)
            .post('/api/import/markitdown')
            .attach('file', Buffer.from('hello'), 'sample.zip');

        expect(res.status).toBe(400);
        expect(res.body.code).toBe(400);
        expect(spawn).not.toHaveBeenCalled();
    });
});
