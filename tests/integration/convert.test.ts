import { jest, it, expect } from '@jest/globals';
const app = require('../../api/server');

const request = require('supertest');
const { renderPdf } = require('../../api/utils/pdfProcess');
const fs = require('fs');
const path = require('path');

jest.mock('child_process', () => {
    const EventEmitter = require('events');
    const fsPromises = require('fs/promises');
    const { PassThrough } = require('stream');

    return {
        spawn: jest.fn((command: string, args: string[]) => {
            const proc = new EventEmitter();
            proc.stdout = new PassThrough();
            proc.stderr = new PassThrough();

            setImmediate(async () => {
                try {
                    // Native tool resolution can return a system or configured absolute path.
                    if (require('path').basename(command) !== 'pandoc') {
                        throw new Error('Unexpected command: ' + command);
                    }
                    const outputIndex = args.indexOf('-o');
                    const outputPath = outputIndex >= 0 ? args[outputIndex + 1] : null;
                    if (!outputPath) {
                        throw new Error('Missing output path');
                    }

                    const zip = new (require('jszip'))();
                    const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
                    zip.file('word/styles.xml', `<w:styles xmlns:w="${ns}"><w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style></w:styles>`);
                    zip.file('word/document.xml', `<w:document xmlns:w="${ns}"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>标题</w:t></w:r></w:p><w:p><w:r><w:t>正文</w:t></w:r></w:p></w:body></w:document>`);
                    await fsPromises.writeFile(outputPath, await zip.generateAsync({ type: 'nodebuffer' }));
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

// Process lifecycle is exercised separately in pdfProcess.test.ts.
jest.mock('../../api/utils/pdfProcess', () => ({
    ...jest.requireActual<any>('../../api/utils/pdfProcess'),
    renderPdf: jest.fn(async (_html: string, _options: any, filePath: string) => {
        await require('fs/promises').writeFile(filePath, Buffer.from('fake pdf content'));
    })
}));

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
        it('preserves inline math and Mermaid SVG in the converter input', async () => {
            renderPdf.mockClear();
            await request(app).post('/api/convert/pdf').send({ html: '<p>Before <mjx-container><svg width="20" height="10"><path d="M0 0"/></svg></mjx-container> after</p><mjx-container display="true"><svg><path d="M0 0"/></svg></mjx-container><div class="mermaid-vector"><svg viewBox="0 0 300 90"><text>Start</text></svg></div>' }).expect(200);
            const input = renderPdf.mock.calls[0][0];
            expect(input).toContain('<span class="docx-math-svg docx-math-inline"');
            expect(input).toContain('<div class="docx-math-svg docx-math-display"');
            expect(input).toContain('<text>Start</text>');
            expect(input).not.toContain('[Diagram]');
        });
        it('should initiate pdf generation and return success', async () => {
            // fs methods (createWriteStream, existsSync, statSync, mkdirSync) are mocked in setup.js
            const res = await request(app)
                .post('/api/convert/pdf')
                .send({ html: '<h1>PDF</h1>' });

            expect(res.status).toBe(200);
            expect(res.body.code).toBe(200);
            expect(res.body.url).toMatch(/^\/uploads\/.*\.pdf$/);
        });

        it('should inline local upload images and strip unconverted mermaid blocks', async () => {
            const uploadsDir = path.join(__dirname, '../../uploads');
            fs.mkdirSync(uploadsDir, { recursive: true });
            const imageName = `pdf-mermaid-test-${Date.now()}.png`;
            const imagePath = path.join(uploadsDir, imageName);
            const pngBuffer = Buffer.from(
                'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
                'base64'
            );
            fs.writeFileSync(imagePath, pngBuffer);

            renderPdf.mockClear();

            const res = await request(app)
                .post('/api/convert/pdf')
                .send({
                    html: [
                        '<div class="mermaid">graph TD; A-->B;</div>',
                        `<img src="/uploads/${imageName}" alt="chart">`
                    ].join('')
                });

            expect(res.status).toBe(200);
            expect(res.body.code).toBe(200);
            expect(renderPdf).toHaveBeenCalled();

            const htmlInput = renderPdf.mock.calls[0][0];
            expect(htmlInput).toContain('data:image/png;base64,');
            expect(htmlInput).not.toContain(`/uploads/${imageName}`);
            expect(htmlInput).not.toContain('graph TD');
            expect(htmlInput).toContain('[Diagram]');

            try {
                fs.unlinkSync(imagePath);
            } catch (cleanupError) {
                // ignore cleanup errors in test
            }
        });
    });

    describe('POST /api/convert/docx', () => {
        it.each(['native', 'html'])('applies font and size settings in %s math mode', async (docxMathMode: string) => {
            const response = await request(app).post('/api/convert/docx').buffer(true)
                .parse((res: any, callback: any) => {
                    const chunks: Buffer[] = [];
                    res.on('data', (chunk: Buffer) => chunks.push(chunk));
                    res.on('end', () => callback(null, Buffer.concat(chunks)));
                }).send({ markdown: '# 标题\n\n正文', settings: { docxMathMode, titleFont: 'Custom Heading', bodyFont: 'Custom Body', titleFontSize: 20, bodyFontSize: 15 } }).expect(200);
            const zip = await require('jszip').loadAsync(response.body);
            const styles = await zip.file('word/styles.xml').async('string');
            const document = await zip.file('word/document.xml').async('string');
            expect(styles).toContain('w:eastAsia="Custom Heading"');
            expect(styles).toContain('w:eastAsia="Custom Body"');
            expect(styles).toContain('<w:sz w:val="60"');
            expect(document).toContain('<w:sz w:val="30"');
        });
        it('should export docx binary successfully', async () => {
            const res = await request(app)
                .post('/api/convert/docx')
                .buffer(true)
                .parse((response, callback) => {
                    const chunks: Buffer[] = [];
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
