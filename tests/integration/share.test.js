
const bcrypt = require('bcryptjs');
const historyManager = require('../../api/models/HistoryManager');
const app = require('../../api/server');

const request = require('supertest');
const db = require('../../api/config/db');

jest.setTimeout(10000);

jest.mock('bcryptjs');
jest.mock('../../api/models/HistoryManager', () => ({
    createHistory: jest.fn()
}));

// Mock auth utils to bypass verification
jest.mock('../../api/utils/auth', () => ({
    verifyTokenOrPassword: jest.fn().mockResolvedValue({ code: 200, message: 'Verified' })
}));

describe('Share API Integration', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        historyManager.createHistory.mockResolvedValue({ code: 200, data: { version_id: 1, history_id: 1 } });
    });

    describe('POST /api/share/create', () => {
        it('should create share and return 200', async () => {
            // First call for getFileContentForShare (sensitive word check)
            const mockConnection1 = {
                execute: jest.fn()
                    .mockResolvedValueOnce([[{ id: 1, password: 'hashed' }]]) // User
                    .mockResolvedValueOnce([[{ id: 101, content: 'test content' }]]), // File content
                release: jest.fn()
            };
            // Second call for createShare
            const mockConnection2 = {
                execute: jest.fn()
                    .mockResolvedValueOnce([[{ id: 1, password: 'hashed' }]]) // User
                    .mockResolvedValueOnce([[{ id: 101 }]]) // File
                    .mockResolvedValueOnce([[]]) // Existing share
                    .mockResolvedValueOnce([{ affectedRows: 1 }]) // Insert
                    .mockResolvedValueOnce([{ affectedRows: 0 }]), // Clear share_editors
                beginTransaction: jest.fn().mockResolvedValue(),
                commit: jest.fn().mockResolvedValue(),
                rollback: jest.fn().mockResolvedValue(),
                release: jest.fn()
            };
            db.getConnection
                .mockResolvedValueOnce(mockConnection1)
                .mockResolvedValueOnce(mockConnection2);
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
                .mockResolvedValueOnce([]) // UPDATE user_files
                .mockResolvedValueOnce([[{ content: 'new content', last_modified: '2026-01-01 00:00:00' }]]); // SELECT updated content

            const res = await request(app)
                .post('/api/share/update')
                .send({ share_id: 'sid', content: 'new content' });

            expect(res.status).toBe(200);
            expect(res.body.code).toBe(200);
        });

        it('should pass manual save flag through share update route', async () => {
            db.execute
                .mockResolvedValueOnce([[
                    { share_id: 'sid', username: 'u', filename: 'f.md', mode: 'edit', password: null, content_version: 1 }
                ]])
                .mockResolvedValueOnce([{ affectedRows: 1 }])
                .mockResolvedValueOnce([[{ content: 'new content', last_modified: '2026-01-01 00:00:00', content_version: 2 }]]);

            const res = await request(app)
                .post('/api/share/update')
                .send({ share_id: 'sid', content: 'new content', base_version: 1, manual_save: true });

            expect(res.status).toBe(200);
            expect(res.body.code).toBe(200);
            expect(historyManager.createHistory).toHaveBeenCalledWith('u', 'f.md', 'new content');
            expect(res.body.data.history).toBeTruthy();
        });


        it('should return conflict when base_version is stale', async () => {
            db.execute
                .mockResolvedValueOnce([[
                    { share_id: 'sid', username: 'u', filename: 'f.md', mode: 'edit', password: null, content_version: 2 }
                ]]) // getSharedFile
                .mockResolvedValueOnce([{ affectedRows: 0 }]) // optimistic update failed
                .mockResolvedValueOnce([[{ content: 'latest content', last_modified: '2026-01-01 00:00:00', content_version: 3 }]]);

            const res = await request(app)
                .post('/api/share/update')
                .send({ share_id: 'sid', content: 'my content', base_version: 2 });

            expect(res.status).toBe(200);
            expect(res.body.code).toBe(409);
            expect(res.body.data.content_version).toBe(3);
        });
    });
});
