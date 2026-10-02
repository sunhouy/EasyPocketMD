const shareManager = require('../../api/models/ShareManager');
const historyManager = require('../../api/models/HistoryManager');
const db = require('../../api/config/db');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

jest.mock('../../api/config/db');
jest.mock('../../api/models/HistoryManager', () => ({
    createHistory: jest.fn()
}));
jest.mock('bcryptjs');

describe('ShareManager', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('createShare', () => {
        it('should create a new share if user is authenticated and file exists', async () => {
            const mockConnection = {
                execute: jest.fn()
                    .mockResolvedValueOnce([[{ id: 1, password: 'hashed_password' }]]) // User check
                    .mockResolvedValueOnce([[{ id: 101 }]]) // File check
                    .mockResolvedValueOnce([[]]) // Existing share check
                    .mockResolvedValueOnce([{ affectedRows: 1 }]) // Insert share
                    .mockResolvedValueOnce([{ affectedRows: 0 }]), // Clear share_editors
                beginTransaction: jest.fn().mockResolvedValue(),
                commit: jest.fn().mockResolvedValue(),
                rollback: jest.fn().mockResolvedValue(),
                release: jest.fn()
            };
            db.getConnection.mockResolvedValue(mockConnection);
            bcrypt.compare.mockResolvedValue(true);
            
            // Mock randomUUID
            jest.spyOn(crypto, 'randomUUID').mockReturnValue('test-uuid-12345678');

            const result = await shareManager.createShare('testuser', 'password', 'test.md', 'view', 'share_pass', 7);

            expect(result.code).toBe(200);
            expect(result.data.share_id).toBe('testuuid12345678');
            expect(mockConnection.execute).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO file_shares'),
                expect.any(Array)
            );
        });

        it('should return 401 if authentication fails', async () => {
            const mockConnection = {
                execute: jest.fn().mockResolvedValueOnce([[{ id: 1, password: 'hashed' }]]),
                beginTransaction: jest.fn().mockResolvedValue(),
                commit: jest.fn().mockResolvedValue(),
                rollback: jest.fn().mockResolvedValue(),
                release: jest.fn()
            };
            db.getConnection.mockResolvedValue(mockConnection);
            bcrypt.compare.mockResolvedValue(false);

            const result = await shareManager.createShare('testuser', 'wrong', 'test.md');

            expect(result.code).toBe(401);
        });
    });

    describe('getSharedFile', () => {
        it('should return shared file if it exists and password is correct', async () => {
            db.execute.mockResolvedValueOnce([[
                { share_id: 'sid', username: 'u', filename: 'f.md', content: 'shared content', password: 'sp' }
            ]]);

            const result = await shareManager.getSharedFile('sid', 'sp');

            expect(result.code).toBe(200);
            expect(result.data.content).toBe('shared content');
        });

        it('should return 401 if password is required but not provided', async () => {
            db.execute.mockResolvedValueOnce([[
                { share_id: 'sid', username: 'u', filename: 'f.md', content: 'c', password: 'sp' }
            ]]);

            const result = await shareManager.getSharedFile('sid');

            expect(result.code).toBe(401);
        });

        it('should allow owner to access shared file without view password', async () => {
            db.execute.mockResolvedValueOnce([[
                { share_id: 'sid', username: 'owner', filename: 'f.md', content: 'c', password: 'sp', mode: 'edit' }
            ]]);

            const result = await shareManager.getSharedFile('sid', null, { editorUsername: 'owner' });

            expect(result.code).toBe(200);
        });
    });

    describe('updateSharedFile', () => {
        let cx, row;
        beforeEach(() => {
            jest.spyOn(require('../../api/models/ShareCollaboration'), 'ensureSchema').mockResolvedValue(undefined);
            row = { share_id: 'sid', username: 'u', filename: 'f.md', mode: 'edit', edit_policy: 'all', content: 'old', content_version: 1 };
            cx = {
                execute: jest.fn(async (sql, values) => {
                    if (sql.includes('FROM file_shares')) return [[row]];
                    if (sql.includes('FROM share_edit_blocks')) return [[]];
                    if (sql.startsWith('UPDATE user_files')) { row.content = values[0]; row.content_version = values[1]; return [{ affectedRows: 1 }]; }
                    if (sql.includes('INSERT INTO share_edit_events')) return [{ insertId: 9 }];
                    if (sql.startsWith('SELECT content, last_modified')) return [[row]];
                    return [[]];
                }), beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn(), release: jest.fn()
            };
            db.getConnection.mockResolvedValue(cx);
            historyManager.createHistory.mockResolvedValue({ code: 200, data: { version_id: 2 } });
        });
        it('commits content and editor attribution together for autosaves', async () => {
            const result = await shareManager.updateSharedFile('sid', 'new', null, { viewerId: 'guest-1' });
            expect(result.code).toBe(200);
            expect(cx.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO share_edit_events'), ['sid', 'guest:guest-1', 'Guest（访客）', 'old', 'new', 2, 'edit']);
            expect(cx.commit).toHaveBeenCalled();
            expect(historyManager.createHistory).not.toHaveBeenCalled();
        });
        it('also creates manual history without misreporting a committed save if snapshot creation fails', async () => {
            historyManager.createHistory.mockRejectedValue(new Error('snapshot unavailable'));
            const result = await shareManager.updateSharedFile('sid', 'new', null, { editorUsername: 'editor', manualSave: true });
            expect(result.code).toBe(200);
            expect(historyManager.createHistory).toHaveBeenCalledWith('u', 'f.md', 'new', 'editor');
            expect(cx.rollback).not.toHaveBeenCalled();
        });
        it('rejects readonly mode before writing', async () => {
            row.mode = 'view';
            expect((await shareManager.updateSharedFile('sid', 'new', null, { viewerId: 'guest-1' })).code).toBe(403);
            expect(cx.commit).not.toHaveBeenCalled();
        });
        it('rejects missing identities and rolls back failed audit writes', async () => {
            expect((await shareManager.updateSharedFile('sid', 'new')).code).toBe(400);
            const original = cx.execute.getMockImplementation();
            cx.execute.mockImplementation((sql, values) => sql.includes('INSERT INTO share_edit_events') ? Promise.reject(new Error('audit unavailable')) : original(sql, values));
            expect((await shareManager.updateSharedFile('sid', 'new', null, { viewerId: 'guest-1' })).code).toBe(500);
            expect(cx.rollback).toHaveBeenCalled();
            expect(cx.commit).not.toHaveBeenCalled();
        });
        it('merges stale edits against the locked current document', async () => {
            row.content = 'A\nB remote'; row.content_version = 2;
            const result = await shareManager.updateSharedFile('sid', 'A local\nB', null, { viewerId: 'guest-1', baseVersion: 1, baseContent: 'A\nB' });
            expect(result.code).toBe(200);
            expect(result.data.content).toBe('A local\nB remote');
            expect(result.data.merged_by_crdt).toBe(true);
        });
        it('rejects revoked editors even if a client still claims it can edit', async () => {
            const original = cx.execute.getMockImplementation();
            cx.execute.mockImplementation((sql, values) => sql.includes('FROM share_edit_blocks') ? Promise.resolve([[{ actor_key: 'user:editor' }]]) : original(sql, values));
            expect((await shareManager.updateSharedFile('sid', 'new', null, { editorUsername: 'editor' })).code).toBe(403);
            expect(cx.execute.mock.calls.some(([sql]) => sql.startsWith('UPDATE user_files'))).toBe(false);
        });
    });
});
