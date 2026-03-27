
const app = require('../../api/server');
const fs = require('fs');
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

// Mock fs.createWriteStream to handle mock wkhtmltopdf output
jest.spyOn(fs, 'createWriteStream').mockImplementation(() => {
    const { PassThrough } = require('stream');
    return new PassThrough();
});

// Mock fs.existsSync and fs.statSync for finish event check
jest.spyOn(fs, 'existsSync').mockReturnValue(true);
jest.spyOn(fs, 'statSync').mockReturnValue({ size: 100 });

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
            // This test is complex because of the stream finish event
            // But we've mocked wkhtmltopdf to write and end the stream
            const res = await request(app)
                .post('/api/convert/pdf')
                .send({ html: '<h1>PDF</h1>' });

            expect(res.status).toBe(200);
            expect(res.body.code).toBe(200);
            expect(res.body.url).toMatch(/^\/uploads\/.*\.pdf$/);
        });
    });
});
