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
        it('should update file content if mode is edit', async () => {
            historyManager.createHistory.mockResolvedValue({ code: 200, data: { version_id: 1 } });
            db.execute
                .mockResolvedValueOnce([[
                    { share_id: 'sid', username: 'u', filename: 'f.md', mode: 'edit', password: null }
                ]]) // getSharedFile internal
                .mockResolvedValueOnce([]) // UPDATE user_files
                .mockResolvedValueOnce([[{ content: 'new content', last_modified: '2026-01-01 00:00:00' }]]); // SELECT updated content

            const result = await shareManager.updateSharedFile('sid', 'new content');

            expect(result.code).toBe(200);
            expect(db.execute).toHaveBeenCalledWith(
                expect.stringContaining('UPDATE user_files'),
                ['new content', 'u', 'f.md']
            );
            expect(historyManager.createHistory).not.toHaveBeenCalled();
        });

        it('should create history for manual shared saves', async () => {
            historyManager.createHistory.mockResolvedValue({ code: 200, data: { version_id: 2, history_id: 9 } });
            db.execute
                .mockResolvedValueOnce([[
                    { share_id: 'sid', username: 'u', filename: 'f.md', mode: 'edit', password: null, content_version: 1 }
                ]])
                .mockResolvedValueOnce([{ affectedRows: 1 }])
                .mockResolvedValueOnce([[{ content: 'new content', last_modified: '2026-01-01 00:00:00', content_version: 2 }]]);

            const result = await shareManager.updateSharedFile('sid', 'new content', null, { baseVersion: 1, manualSave: true });

            expect(result.code).toBe(200);
            expect(historyManager.createHistory).toHaveBeenCalledWith('u', 'f.md', 'new content', 'Guest');
            expect(result.data.history).toEqual({ version_id: 2, history_id: 9 });
        });

        it('should return 403 if mode is view', async () => {
             db.execute
                .mockResolvedValueOnce([[
                    { share_id: 'sid', username: 'u', filename: 'f.md', mode: 'view', password: null }
                ]]);

            const result = await shareManager.updateSharedFile('sid', 'new content');

            expect(result.code).toBe(403);
        });

        it('should handle optimistic version check gracefully', async () => {
            historyManager.createHistory.mockResolvedValue({ code: 200, data: { version_id: 1 } });
            db.execute
                .mockResolvedValueOnce([[
                    { share_id: 'sid', username: 'u', filename: 'f.md', mode: 'edit', password: null, content_version: 2 }
                ]])
                .mockResolvedValueOnce([{ affectedRows: 0 }]) // First update (version mismatch)
                .mockResolvedValueOnce([{ affectedRows: 1 }]) // Second update (force update)
                .mockResolvedValueOnce([[{ content: 'new content', last_modified: '2026-01-01 00:00:00', content_version: 4 }]]); // SELECT updated content

            const result = await shareManager.updateSharedFile('sid', 'new content', null, { baseVersion: 2, manualSave: true });

            expect(result.code).toBe(200);
            expect(result.data.content).toBe('new content');
            expect(historyManager.createHistory).toHaveBeenCalledWith('u', 'f.md', 'new content', 'Guest');
        });

        it('should merge stale shared document updates with CRDT when base content is provided', async () => {
            historyManager.createHistory.mockResolvedValue({ code: 200, data: { version_id: 1 } });
            db.execute
                .mockResolvedValueOnce([[
                    { share_id: 'sid', username: 'u', filename: 'f.md', mode: 'edit', password: null, content: 'A\nB remote', content_version: 2 }
                ]])
                .mockResolvedValueOnce([{ affectedRows: 0 }])
                .mockResolvedValueOnce([{ affectedRows: 1 }])
                .mockResolvedValueOnce([[{ content: 'A local\nB remote', last_modified: '2026-01-01 00:00:00', content_version: 3 }]]);

            const result = await shareManager.updateSharedFile('sid', 'A local\nB', null, {
                baseVersion: 1,
                baseContent: 'A\nB',
                manualSave: true
            });

            expect(result.code).toBe(200);
            expect(result.data.content).toBe('A local\nB remote');
            expect(result.data.merged_by_crdt).toBe(true);
            expect(db.execute).toHaveBeenCalledWith(
                expect.stringContaining('UPDATE user_files SET content = ?, content_version = content_version + 1'),
                ['A local\nB remote', 'u', 'f.md']
            );
        });
    });
});
