
const bcrypt = require('bcryptjs');
const app = require('../../api/server');
const db = require('../../api/config/db');

jest.setTimeout(10000);

jest.mock('bcryptjs');

// Mock auth utils to bypass verification
jest.mock('../../api/utils/auth', () => ({
    verifyTokenOrPassword: jest.fn().mockResolvedValue({ code: 200, message: 'Verified' })
}));

describe('Share API Integration', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('POST /api/share/create', () => {
        it('should create share and return 200', async () => {
            const mockConnection = {
                execute: jest.fn()
                    .mockResolvedValueOnce([[{ id: 1, password: 'hashed' }]]) // User
                    .mockResolvedValueOnce([[{ id: 101 }]]) // File
                    .mockResolvedValueOnce([[]]) // Existing share
                    .mockResolvedValueOnce([{ affectedRows: 1 }]), // Insert
                release: jest.fn()
            };
            db.getConnection.mockResolvedValueOnce(mockConnection);
            bcrypt.compare.mockResolvedValue(true);

            const res = await request(app)
                .post('/api/share/create')
                .send({
                    username: 'testuser',
                    password: 'password',
                    filename: 'test.md'
                });

            expect(res.status).toBe(200);
            expect(res.body.code).toBe(200);
            expect(res.body.data.share_id).toBeDefined();
        });
    });

    describe('GET /api/share/view', () => {
        it('should redirect if share exists and no password required', async () => {
            db.execute.mockResolvedValueOnce([[
                { share_id: 'sid', username: 'u', filename: 'f.md', content: 'c', password: null }
            ]]);

            const res = await request(app)
                .get('/api/share/view')
                .query({ share_id: 'sid' });

            expect(res.status).toBe(302);
            expect(res.headers.location).toContain('index.html?share_id=sid');
        });

        it('should return 200 with password form if password is required', async () => {
             db.execute.mockResolvedValueOnce([[
                { share_id: 'sid', username: 'u', filename: 'f.md', content: 'c', password: 'sp' }
            ]]);

            const res = await request(app)
                .get('/api/share/view')
                .query({ share_id: 'sid' });

            expect(res.status).toBe(200);
            expect(res.text).toContain('请输入访问密码');
        });
    });

    describe('POST /api/share/update', () => {
        it('should update file content if mode is edit', async () => {
            db.execute
                .mockResolvedValueOnce([[
                    { share_id: 'sid', username: 'u', filename: 'f.md', mode: 'edit', password: null }
                ]]) // getSharedFile
                .mockResolvedValueOnce([]); // UPDATE user_files

            const res = await request(app)
                .post('/api/share/update')
                .send({ share_id: 'sid', content: 'new content' });

            expect(res.status).toBe(200);
            expect(res.body.code).toBe(200);
        });
    });
});
