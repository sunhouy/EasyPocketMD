const request = require('supertest');

process.env.PPT_EXPORT_ENGINE = 'legacy';

jest.mock('pptxgenjs', () => {
    return jest.fn().mockImplementation(() => ({
        defineLayout: jest.fn(),
        addSlide: jest.fn(() => ({
            addText: jest.fn(),
            addShape: jest.fn(),
            addImage: jest.fn(),
            background: null
        })),
        write: jest.fn().mockResolvedValue(Buffer.from('mock-pptx-content'))
    }));
});

const PptxGenJS = require('pptxgenjs');

const app = require('../../api/server');

jest.setTimeout(10000);

describe('PPT Export Integration', () => {
    it('should export pptx binary successfully', async () => {
        const payload = {
            topic: '测试导出',
            ratio: '16:9',
            pages: ['<h1>第一页标题</h1><ul><li>要点一</li><li>要点二</li></ul>'],
            outline: [{ number: 1, title: '第一页标题', content: ['要点一', '要点二'] }]
        };

        const res = await request(app)
            .post('/api/ppt-export')
            .buffer(true)
            .parse((response, callback) => {
                const chunks = [];
                response.on('data', chunk => chunks.push(chunk));
                response.on('end', () => callback(null, Buffer.concat(chunks)));
            })
            .send(payload)
            .expect(200);

        expect(res.headers['content-type']).toContain('application/vnd.openxmlformats-officedocument.presentationml.presentation');
        expect(res.headers['content-disposition']).toContain('.pptx');
        expect(Buffer.isBuffer(res.body)).toBe(true);
        expect(res.body.length).toBeGreaterThan(0);
    });

    it('should reject empty pages payload', async () => {
        const res = await request(app)
            .post('/api/ppt-export')
            .send({ topic: 'bad payload', pages: [] })
            .expect(400);

        expect(res.body.code).toBe(400);
        expect(typeof res.body.message).toBe('string');
    });

    it('should decode escaped html and use extracted title/content', async () => {
        const payload = {
            topic: '转义HTML',
            ratio: '16:9',
            pages: ['```html\n&lt;div style="background:#1a1a1a;color:#ffffff"&gt;&lt;h1&gt;转义标题&lt;/h1&gt;&lt;ul&gt;&lt;li&gt;转义要点&lt;/li&gt;&lt;/ul&gt;&lt;/div&gt;\n```'],
            outline: [{ number: 1, title: '备用标题', content: [] }]
        };

        await request(app)
            .post('/api/ppt-export')
            .send(payload)
            .expect(200);

        const pptInstance = PptxGenJS.mock.results[PptxGenJS.mock.results.length - 1].value;
        const firstSlide = pptInstance.addSlide.mock.results[0].value;

        expect(firstSlide.background).toEqual({ color: '1A1A1A' });
        expect(firstSlide.addShape).not.toHaveBeenCalled();
        expect(firstSlide.addText).toHaveBeenCalledWith(
            expect.stringContaining('转义标题'),
            expect.objectContaining({ color: 'FFFFFF' })
        );
        expect(firstSlide.addText).toHaveBeenCalledWith(
            expect.stringContaining('转义要点'),
            expect.objectContaining({ color: 'FFFFFF' })
        );
    });

    it('should map linear-gradient to base background and accent shapes', async () => {
        const payload = {
            topic: '渐变测试',
            ratio: '16:9',
            pages: ['<div style="background:linear-gradient(135deg, #1e3a5f 0%, #f39c12 100%);color:#ffffff;"><h1>渐变标题</h1><ul><li>要点A</li></ul></div>'],
            outline: [{ number: 1, title: '渐变标题', content: ['要点A'] }]
        };

        await request(app)
            .post('/api/ppt-export')
            .send(payload)
            .expect(200);

        const pptInstance = PptxGenJS.mock.results[PptxGenJS.mock.results.length - 1].value;
        const firstSlide = pptInstance.addSlide.mock.results[0].value;

        expect(firstSlide.background).toEqual({ color: '1E3A5F' });
        expect(firstSlide.addShape).toHaveBeenCalled();
        expect(firstSlide.addShape).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                fill: expect.objectContaining({ color: 'F39C12' })
            })
        );
    });
});

