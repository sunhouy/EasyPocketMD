const fileManager = require('../../api/models/FileManager');
const db = require('../../api/config/db');
const historyManager = require('../../api/models/HistoryManager');
const crypto = require('crypto');

// Mock dependencies
jest.mock('../../api/config/db');
jest.mock('../../api/models/HistoryManager');

describe('FileManager', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('getUserFiles', () => {
        it('should return files for a given username', async () => {
            const mockFiles = [
                { filename: 'test.md', content: 'test content', last_modified: '2023-01-01' }
            ];
            db.execute.mockResolvedValue([mockFiles]);

            const result = await fileManager.getUserFiles('testuser');

            expect(result.code).toBe(200);
            expect(result.data.files).toHaveLength(1);
            expect(result.data.files[0].name).toBe('test.md');
            expect(db.execute).toHaveBeenCalledWith(
                expect.stringContaining('SELECT filename, content, last_modified FROM user_files'),
                ['testuser']
            );
        });

        it('should handle database errors', async () => {
            db.execute.mockRejectedValue(new Error('DB Error'));

            const result = await fileManager.getUserFiles('testuser');

            expect(result.code).toBe(500);
            expect(result.message).toContain('DB Error');
        });
    });

    describe('getFileContent', () => {
        it('should return file content if it exists', async () => {
            const mockFile = { filename: 'test.md', content: 'content', last_modified: '2023-01-01' };
            db.execute.mockResolvedValue([[mockFile]]);

            const result = await fileManager.getFileContent('testuser', 'test.md');

            expect(result.code).toBe(200);
            expect(result.data.content).toBe('content');
        });

        it('should return 404 if file does not exist', async () => {
            db.execute.mockResolvedValue([[]]);

            const result = await fileManager.getFileContent('testuser', 'missing.md');

            expect(result.code).toBe(404);
        });
    });

    describe('saveFile', () => {
        it('should update an existing file', async () => {
            const mockConnection = {
                execute: jest.fn()
                    .mockResolvedValueOnce([[{ id: 1 }]]) // Check existence
                    .mockResolvedValueOnce([]), // Update
                release: jest.fn()
            };
            db.getConnection.mockResolvedValue(mockConnection);

            const result = await fileManager.saveFile('testuser', 'test.md', 'new content');

            expect(result.code).toBe(200);
            expect(result.message).toBe('文件更新成功');
            expect(mockConnection.execute).toHaveBeenCalledWith(
                expect.stringContaining('UPDATE user_files'),
                ['new content', 'testuser', 'test.md']
            );
            expect(mockConnection.release).toHaveBeenCalled();
        });

        it('should insert a new file if it does not exist', async () => {
            const mockConnection = {
                execute: jest.fn()
                    .mockResolvedValueOnce([[]]) // Check existence
                    .mockResolvedValueOnce([]), // Insert
                release: jest.fn()
            };
            db.getConnection.mockResolvedValue(mockConnection);

            const result = await fileManager.saveFile('testuser', 'new.md', 'new content');

            expect(result.code).toBe(200);
            expect(result.message).toBe('文件保存成功');
            expect(mockConnection.execute).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO user_files'),
                ['testuser', 'new.md', 'new content']
            );
        });

        it('should return 409 when base_last_modified is stale', async () => {
            const mockConnection = {
                execute: jest.fn().mockResolvedValueOnce([[{
                    id: 1,
                    content: 'server content',
                    last_modified: '2024-01-02T00:00:00.000Z'
                }]]),
                release: jest.fn()
            };
            db.getConnection.mockResolvedValue(mockConnection);

            const result = await fileManager.saveFile(
                'testuser',
                'test.md',
                'new content',
                { base_last_modified: '2024-01-01T00:00:00.000Z' }
            );

            expect(result.code).toBe(409);
            expect(result.data.filename).toBe('test.md');
            expect(result.data.server_last_modified).toBe('2024-01-02T00:00:00.000Z');
            expect(mockConnection.execute).toHaveBeenCalledTimes(1);
        });

        it('should allow update when base_hash matches current server content', async () => {
            const currentContent = 'server content';
            const baseHash = crypto.createHash('sha256').update(currentContent, 'utf8').digest('hex');
            const mockConnection = {
                execute: jest.fn()
                    .mockResolvedValueOnce([[{
                        id: 1,
                        content: currentContent,
                        last_modified: '2024-01-02T00:00:00.000Z'
                    }]])
                    .mockResolvedValueOnce([]),
                release: jest.fn()
            };
            db.getConnection.mockResolvedValue(mockConnection);

            const result = await fileManager.saveFile(
                'testuser',
                'test.md',
                'new content',
                { base_hash: baseHash }
            );

            expect(result.code).toBe(200);
            expect(mockConnection.execute).toHaveBeenCalledWith(
                expect.stringContaining('UPDATE user_files SET content = ?, last_modified = NOW()'),
                ['new content', 'testuser', 'test.md']
            );
        });
    });

    describe('deleteFile', () => {
        it('should delete file and its history', async () => {
            const mockConnection = {
                beginTransaction: jest.fn(),
                commit: jest.fn(),
                rollback: jest.fn(),
                execute: jest.fn()
                    .mockResolvedValueOnce([[{ id: 1 }]]) // Check existence
                    .mockResolvedValueOnce([{ affectedRows: 1 }]) // Delete file
                    .mockResolvedValueOnce([[{ id: 101 }]]) // Get user ID
                    .mockResolvedValueOnce([]) // Delete content
                    .mockResolvedValueOnce([]), // Delete history
                release: jest.fn()
            };
            db.getConnection.mockResolvedValue(mockConnection);

            const result = await fileManager.deleteFile('testuser', 'test.md');

            expect(result.code).toBe(200);
            expect(mockConnection.beginTransaction).toHaveBeenCalled();
            expect(mockConnection.commit).toHaveBeenCalled();
            expect(mockConnection.release).toHaveBeenCalled();
        });

        it('should return 404 if file to delete does not exist', async () => {
            const mockConnection = {
                beginTransaction: jest.fn(),
                rollback: jest.fn(),
                execute: jest.fn().mockResolvedValueOnce([[]]), // Check existence
                release: jest.fn()
            };
            db.getConnection.mockResolvedValue(mockConnection);

            const result = await fileManager.deleteFile('testuser', 'missing.md');

            expect(result.code).toBe(404);
            expect(mockConnection.rollback).toHaveBeenCalled();
        });
    });
});
