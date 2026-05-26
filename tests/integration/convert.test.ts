
const app = require('../../api/server');

const request = require('supertest');
const wkhtmltopdf = require('wkhtmltopdf');

jest.mock('child_process', () => {
    const EventEmitter = require('events');
    const fsPromises = require('fs/promises');
    const { PassThrough } = require('stream');

    return {
        spawn: jest.fn((command, args) => {
            const proc = new EventEmitter();
            proc.stdout = new PassThrough();
            proc.stderr = new PassThrough();

            setImmediate(async () => {
                try {
                    if (command !== 'pandoc') {
                        throw new Error('Unexpected command: ' + command);
                    }
                    const outputIndex = args.indexOf('-o');
                    const outputPath = outputIndex >= 0 ? args[outputIndex + 1] : null;
                    if (!outputPath) {
                        throw new Error('Missing output path');
                    }

                    await fsPromises.writeFile(outputPath, Buffer.from('fake-docx-content'));
                    proc.emit('close', 0);
                } catch (error) {
                    proc.stderr.write(error.message);
                    proc.stderr.end();
                    proc.emit('close', 1);
                }
            });

            return proc;
        })
    };
});

// Mock wkhtmltopdf
jest.mock('wkhtmltopdf', () => {
    const { PassThrough } = require('stream');
    return jest.fn(() => {
        const stream = new PassThrough();
        // Simulate writing something to the stream asynchronously
        setImmediate(() => {
            stream.write('fake pdf content');
            stream.end();
        });
        return stream;
    });
});

jest.setTimeout(10000);

describe('Convert API Integration', () => {
    describe('POST /api/convert/markdown', () => {
        it('should convert markdown to html', async () => {
            const res = await request(app)
                .post('/api/convert/markdown')
                .send({ content: '# Hello\n- item 1' });

            expect(res.status).toBe(200);
            expect(res.body.code).toBe(200);
            expect(res.body.data).toContain('<h1>Hello</h1>');
            expect(res.body.data).toContain('<li>item 1</li>');
        });

        it('should return 400 if content is missing', async () => {
            const res = await request(app)
                .post('/api/convert/markdown')
                .send({});
            expect(res.status).toBe(400);
        });
    });

    describe('POST /api/convert/pdf', () => {
        it('should initiate pdf generation and return success', async () => {
            // fs methods (createWriteStream, existsSync, statSync, mkdirSync) are mocked in setup.js
            const res = await request(app)
                .post('/api/convert/pdf')
                .send({ html: '<h1>PDF</h1>' });

            expect(res.status).toBe(200);
            expect(res.body.code).toBe(200);
            expect(res.body.url).toMatch(/^\/uploads\/.*\.pdf$/);
        });
    });

    describe('POST /api/convert/docx', () => {
        it('should export docx binary successfully', async () => {
            const res = await request(app)
                .post('/api/convert/docx')
                .buffer(true)
                .parse((response, callback) => {
                    const chunks = [];
                    response.on('data', chunk => chunks.push(chunk));
                    response.on('end', () => callback(null, Buffer.concat(chunks)));
                })
                .send({ markdown: '# 标题\n\n正文内容' })
                .expect(200);

            expect(res.headers['content-type']).toContain('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
            expect(res.headers['content-disposition']).toContain('.docx');
            expect(Buffer.isBuffer(res.body)).toBe(true);
            expect(res.body.length).toBeGreaterThan(0);
        });

        it('should return 400 when markdown is missing', async () => {
            const res = await request(app)
                .post('/api/convert/docx')
                .send({})
                .expect(400);

            expect(res.body.code).toBe(400);
        });
    });
});
