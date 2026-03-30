const request = require('supertest');

jest.mock('pptxgenjs', () => {
    return jest.fn().mockImplementation(() => ({
        defineLayout: jest.fn(),
        addSlide: jest.fn(() => ({
            addText: jest.fn(),
            background: null
        })),
        write: jest.fn().mockResolvedValue(Buffer.from('mock-pptx-content'))
    }));
});

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
});

