const request = require('supertest');

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
            pages: [{
                layout: 'content',
                themeToken: 'business',
                title: '第一页标题',
                subtitle: '小结说明',
                bullets: [
                    { text: '要点一', subBullets: ['子要点A'] },
                    { text: '要点二', subBullets: [] }
                ]
            }],
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

    it('should fallback to outline data when page payload is invalid', async () => {
        const payload = {
            topic: 'fallback',
            ratio: '16:9',
            pages: ['not-an-object'],
            outline: [{ number: 1, title: '备用标题', content: ['备用要点'] }]
        };

        await request(app)
            .post('/api/ppt-export')
            .send(payload)
            .expect(200);

        const pptInstance = PptxGenJS.mock.results[PptxGenJS.mock.results.length - 1].value;
        const firstSlide = pptInstance.addSlide.mock.results[0].value;

        expect(firstSlide.background).toEqual({ color: 'FFFFFF' });
        expect(firstSlide.addText).toHaveBeenCalledWith(
            expect.stringContaining('备用标题'),
            expect.objectContaining({ color: '2C3E50' })
        );
        const renderedText = pptInstance.addSlide.mock.results.flatMap(result => result.value.addText.mock.calls.map(call => call[0])).join('\n');
        expect(renderedText).toContain('备用要点');
    });

    it('should paginate long bullet list into multiple editable slides', async () => {
        const longBullets = Array.from({ length: 11 }, (_, i) => ({
            text: `要点${i + 1}`,
            subBullets: []
        }));

        const payload = {
            topic: '分页测试',
            ratio: '16:9',
            pages: [{
                layout: 'content',
                themeToken: 'traditional',
                title: '分页主题',
                bullets: longBullets
            }],
            outline: [{ number: 1, title: '分页主题', content: [] }]
        };

        await request(app)
            .post('/api/ppt-export')
            .send(payload)
            .expect(200);

        const pptInstance = PptxGenJS.mock.results[PptxGenJS.mock.results.length - 1].value;
        expect(pptInstance.addSlide.mock.results.length).toBeGreaterThan(1);
        const text = pptInstance.addSlide.mock.results.flatMap(result => result.value.addText.mock.calls.map(call => call[0])).join('\n');
        longBullets.forEach(bullet => expect(text).toContain(bullet.text));
    });
    it('rejects untrusted template names and applies a selected built-in design', async () => {
        const data = { pages: [{ title: '模板封面', layout: 'cover' }] };
        await request(app).post('/api/ppt-export').send({ ...data, templateId: '../template' }).expect(400);
        await request(app).post('/api/ppt-export').send({ ...data, templateId: 'dark-gold' }).expect(200);
        const pptInstance = PptxGenJS.mock.results[PptxGenJS.mock.results.length - 1].value;
        const slide = pptInstance.addSlide.mock.results[0].value;
        expect(slide.background.color).toBe('1A1A2E');
        expect(slide.addText).toHaveBeenCalledWith('模板封面', expect.objectContaining({ color: 'F0F0F0' }));
    });

});

