
const bcrypt = require('bcryptjs');
const historyManager = require('../../api/models/HistoryManager');
const collaboration = require('../../api/models/ShareCollaboration');
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
        jest.spyOn(collaboration, 'ensureSchema').mockResolvedValue(undefined);
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
        function connection(before = 'old', version = 1) {
            const row = { share_id: 'sid', username: 'owner', filename: 'note.md', mode: 'edit', edit_policy: 'all', password: null, content: before, content_version: version };
            const cx = {
                execute: jest.fn(async (sql, values) => {
                    if (sql.includes('FROM file_shares')) return [[row]];
                    if (sql.includes('FROM share_edit_blocks')) return [[]];
                    if (sql.startsWith('UPDATE user_files')) { row.content = values[0]; row.content_version = values[1]; return [{ affectedRows: 1 }]; }
                    if (sql.includes('INSERT INTO share_edit_events')) return [{ insertId: 123 }];
                    if (sql.startsWith('SELECT content, last_modified')) return [[row]];
                    return [[]];
                }),
                beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn(), release: jest.fn()
            };
            db.getConnection.mockResolvedValue(cx); return cx;
        }
        it('records every accepted autosave with its verified editor identity', async () => {
            const cx = connection();
            const res = await request(app).post('/api/share/update').send({ share_id: 'sid', content: 'new content', editor_username: 'editor', editor_token: 'token', viewer_id: 'session-1', viewer_name: 'spoofed-name', base_version: 1, base_content: 'old' });
            expect(res.body.code).toBe(200);
            expect(res.body.data.content).toBe('new content');
            expect(cx.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO share_edit_events'), ['sid', 'user:editor', 'editor', 'old', 'new content', 2, 'edit']);
            expect(cx.commit).toHaveBeenCalled();
        });
        it('creates a manual history snapshot in addition to the collaboration record', async () => {
            connection();
            const res = await request(app).post('/api/share/update').send({ share_id: 'sid', content: 'new content', viewer_id: 'guest-1', base_version: 1, manual_save: true });
            expect(res.body.code).toBe(200);
            expect(historyManager.createHistory).toHaveBeenCalledWith('owner', 'note.md', 'new content', 'Guest（访客）');
            expect(res.body.data.history).toBeTruthy();
        });
        it('merges concurrent edits against the locked current document', async () => {
            connection('A\nB remote', 2);
            const res = await request(app).post('/api/share/update').send({ share_id: 'sid', content: 'A local\nB', base_version: 1, base_content: 'A\nB', viewer_id: 'guest-1' });
            expect(res.body.code).toBe(200);
            expect(res.body.data.content).toBe('A local\nB remote');
        });
        it('rejects stale full snapshots that cannot be merged safely', async () => {
            const cx = connection('newer remote', 2);
            const res = await request(app).post('/api/share/update').send({ share_id: 'sid', content: 'stale', base_version: 1, viewer_id: 'guest-1' });
            expect(res.body.code).toBe(409); expect(cx.rollback).toHaveBeenCalled();
        });
    });
});
