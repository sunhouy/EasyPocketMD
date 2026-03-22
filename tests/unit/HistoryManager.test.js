const historyManager = require('../../api/models/HistoryManager');
const db = require('../../api/config/db');
const crypto = require('crypto');

jest.mock('../../api/config/db');

describe('HistoryManager', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('getUserByUsername', () => {
        it('should return user object if found', async () => {
            db.execute.mockResolvedValue([[{ id: 1 }]]);
            const user = await historyManager.getUserByUsername('testuser');
            expect(user.id).toBe(1);
        });

        it('should return null if user not found', async () => {
            db.execute.mockResolvedValue([[]]);
            const user = await historyManager.getUserByUsername('nonexistent');
            expect(user).toBeNull();
        });
    });

    describe('createHistory', () => {
        it('should not create history if content has not changed', async () => {
            db.execute.mockResolvedValueOnce([[{ id: 1 }]]); // getUserByUsername
            db.execute.mockResolvedValueOnce([[{ version_id: 1, content_hash: 'hash', content_length: 10 }]]); // getLatestVersion

            // Mock crypto.createHash to return 'hash'
            const hash = {
                update: jest.fn().mockReturnThis(),
                digest: jest.fn().mockReturnValue('hash')
            };
            jest.spyOn(crypto, 'createHash').mockReturnValue(hash);

            const result = await historyManager.createHistory('testuser', 'test.md', 'same content');

            expect(result.code).toBe(304);
            expect(result.message).toContain('内容无变化');
        });

        it('should create new history if content changed', async () => {
            db.execute.mockResolvedValueOnce([[{ id: 1 }]]); // getUserByUsername
            db.execute.mockResolvedValueOnce([[{ version_id: 1, content_hash: 'oldhash', content_length: 10 }]]); // getLatestVersion

            const mockConnection = {
                beginTransaction: jest.fn(),
                commit: jest.fn(),
                rollback: jest.fn(),
                execute: jest.fn()
                    .mockResolvedValueOnce([{ insertId: 123 }]) // Insert history
                    .mockResolvedValueOnce([]) // Save full content
                    .mockResolvedValueOnce([[]]), // cleanupOldVersions check
                release: jest.fn()
            };
            db.getConnection.mockResolvedValue(mockConnection);

            const hash = {
                update: jest.fn().mockReturnThis(),
                digest: jest.fn().mockReturnValue('newhash')
            };
            jest.spyOn(crypto, 'createHash').mockReturnValue(hash);

            const result = await historyManager.createHistory('testuser', 'test.md', 'new content');

            expect(result.code).toBe(200);
            expect(result.data.version_id).toBe(2);
            expect(mockConnection.commit).toHaveBeenCalled();
        });
    });

    describe('getHistoryList', () => {
        it('should return list of history versions', async () => {
            db.execute.mockResolvedValueOnce([[{ id: 1 }]]); // getUserByUsername
            db.execute.mockResolvedValueOnce([[
                { id: 101, version_id: 1, content_hash: 'h1', content_length: 5, created_at: new Date() }
            ]]); // List history
            db.execute.mockResolvedValueOnce([[{ version_id: 1 }]]); // getLatestVersion
            db.execute.mockResolvedValueOnce([[{ content_data: 'v1 content', content_type: 'full' }]]); // getVersionContentById

            const result = await historyManager.getHistoryList('testuser', 'test.md');

            expect(result.code).toBe(200);
            expect(result.data.history).toHaveLength(1);
            expect(result.data.history[0].content).toBe('v1 content');
        });
    });

    describe('computeDiff and applyDiff', () => {
        it('should compute and apply diff correctly', () => {
            const oldContent = "line1\nline2\nline3";
            const newContent = "line1\nline2 modified\nline3\nline4";

            const diff = historyManager.computeDiff(oldContent, newContent);
            const applied = historyManager.applyDiff(oldContent, diff);

            expect(applied).toBe(newContent);
        });
    });
});
