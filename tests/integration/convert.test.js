
const app = require('../../api/server');

const request = require('supertest');
const wkhtmltopdf = require('wkhtmltopdf');

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
});
