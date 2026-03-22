const shareManager = require('../../api/models/ShareManager');
const db = require('../../api/config/db');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

jest.mock('../../api/config/db');
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
                    .mockResolvedValueOnce([{ affectedRows: 1 }]), // Insert share
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
    });

    describe('updateSharedFile', () => {
        it('should update file content if mode is edit', async () => {
            // Mock getSharedFile (internal call via `this.getSharedFile`)
            // Actually getSharedFile calls db.execute, so we mock that.
            db.execute
                .mockResolvedValueOnce([[
                    { share_id: 'sid', username: 'u', filename: 'f.md', mode: 'edit', password: null }
                ]]) // getSharedFile internal
                .mockResolvedValueOnce([]); // UPDATE user_files

            const result = await shareManager.updateSharedFile('sid', 'new content');

            expect(result.code).toBe(200);
            expect(db.execute).toHaveBeenCalledWith(
                expect.stringContaining('UPDATE user_files'),
                ['new content', 'u', 'f.md']
            );
        });

        it('should return 403 if mode is view', async () => {
             db.execute
                .mockResolvedValueOnce([[
                    { share_id: 'sid', username: 'u', filename: 'f.md', mode: 'view', password: null }
                ]]);

            const result = await shareManager.updateSharedFile('sid', 'new content');

            expect(result.code).toBe(403);
        });
    });
});
