const request = require('supertest');
const app = require('../../api/server');

jest.setTimeout(10000);

describe('Upload API Integration', () => {
    it('uploads files through the documented /api/files/upload compatibility route', async () => {
        const res = await request(app)
            .post('/api/files/upload')
            .attach('files[]', Buffer.from('hello'), 'hello.txt');

        expect(res.status).toBe(200);
        expect(res.body.code).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.count).toBe(1);
        expect(res.body.urls[0]).toMatch(/\/uploads\/.*_hello\.txt$/);
        expect(res.body.data.files[0]).toMatchObject({
            name: 'hello.txt',
            path: expect.stringMatching(/^\/uploads\/.*_hello\.txt$/)
        });
    });

    it('accepts single-file field names used by editor upload integrations', async () => {
        const res = await request(app)
            .post('/api/external/upload')
            .attach('file', Buffer.from('hello'), 'image.png');

        expect(res.status).toBe(200);
        expect(res.body.code).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.urls[0]).toMatch(/\/uploads\/.*_image\.png$/);
    });
});
