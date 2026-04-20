const fileManager = require('../../api/models/FileManager');
const db = require('../../api/config/db');
const historyManager = require('../../api/models/HistoryManager');
const Cache = require('../../api/utils/cache');
const crypto = require('crypto');

// Mock dependencies
jest.mock('../../api/config/db');
jest.mock('../../api/models/HistoryManager');
jest.mock('../../api/utils/cache');

describe('FileManager', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('computeContentHash', () => {
        it('should compute SHA256 hash of content', () => {
            const content = 'test content';
            const expectedHash = crypto.createHash('sha256').update(content, 'utf8').digest('hex');
            
            const result = fileManager.computeContentHash(content);
            
            expect(result).toBe(expectedHash);
        });

        it('should handle empty content', () => {
            const expectedHash = crypto.createHash('sha256').update('', 'utf8').digest('hex');
            
            const result = fileManager.computeContentHash('');
            
            expect(result).toBe(expectedHash);
        });

        it('should handle null content', () => {
            const expectedHash = crypto.createHash('sha256').update(String(null), 'utf8').digest('hex');
            
            const result = fileManager.computeContentHash(null);
            
            expect(result).toBe(expectedHash);
        });
    });

    describe('toTimestampMillis', () => {
        it('should convert ISO string to timestamp', () => {
            const dateStr = '2024-01-01T00:00:00.000Z';
            const expected = Date.parse(dateStr);
            
            const result = fileManager.toTimestampMillis(dateStr);
            
            expect(result).toBe(expected);
        });

        it('should return number as is if valid', () => {
            const timestamp = 1704067200000;
            
            const result = fileManager.toTimestampMillis(timestamp);
            
            expect(result).toBe(timestamp);
        });

        it('should return null for undefined', () => {
            const result = fileManager.toTimestampMillis(undefined);
            expect(result).toBeNull();
        });

        it('should return null for null', () => {
            const result = fileManager.toTimestampMillis(null);
            expect(result).toBeNull();
        });

        it('should return null for empty string', () => {
            const result = fileManager.toTimestampMillis('');
            expect(result).toBeNull();
        });

        it('should return null for invalid date string', () => {
            const result = fileManager.toTimestampMillis('invalid date');
            expect(result).toBeNull();
        });

        it('should return null for Infinity', () => {
            const result = fileManager.toTimestampMillis(Infinity);
            expect(result).toBeNull();
        });
    });

    describe('normalizeDbLastModified', () => {
        it('should normalize timestamp to ISO string', () => {
            const timestamp = 1704067200000;
            const expected = new Date(timestamp).toISOString();
            
            const result = fileManager.normalizeDbLastModified(timestamp);
            
            expect(result).toBe(expected);
        });

        it('should return null for null input', () => {
            const result = fileManager.normalizeDbLastModified(null);
            expect(result).toBeNull();
        });
    });

    describe('getUserFiles', () => {
        it('should return cached files if available', async () => {
            Cache.getUserFiles.mockResolvedValue({ cached: true });

            const result = await fileManager.getUserFiles('testuser');

            expect(result.code).toBe(200);
            expect(result.message).toContain('缓存');
            expect(Cache.getUserFiles).toHaveBeenCalledWith('testuser');
            expect(db.execute).not.toHaveBeenCalled();
        });

        it('should return files from database when no cache', async () => {
            Cache.getUserFiles.mockResolvedValue(null);
            const mockFiles = [
                { filename: 'test.md', content: 'test content', last_modified: '2023-01-01' }
            ];
            db.execute.mockResolvedValue([mockFiles]);

            const result = await fileManager.getUserFiles('testuser');

            expect(result.code).toBe(200);
            expect(result.data.files).toHaveLength(1);
            expect(result.data.files[0].name).toBe('test.md');
            expect(db.execute).toHaveBeenCalledWith(
                expect.stringContaining('SELECT filename, content, last_modified, content_version FROM user_files'),
                ['testuser']
            );
            expect(Cache.setUserFiles).toHaveBeenCalled();
        });

        it('should handle database errors', async () => {
            Cache.getUserFiles.mockResolvedValue(null);
            db.execute.mockRejectedValue(new Error('DB Error'));

            const result = await fileManager.getUserFiles('testuser');

            expect(result.code).toBe(500);
            expect(result.message).toContain('DB Error');
        });
    });

    describe('getFileContent', () => {
        it('should return cached content if available', async () => {
            Cache.getFileContent.mockResolvedValue({ cached: true });

            const result = await fileManager.getFileContent('testuser', 'test.md');

            expect(result.code).toBe(200);
            expect(result.message).toContain('缓存');
            expect(Cache.getFileContent).toHaveBeenCalledWith('testuser', 'test.md');
        });

        it('should return file content from database if exists', async () => {
            Cache.getFileContent.mockResolvedValue(null);
            const mockFile = { filename: 'test.md', content: 'content', last_modified: '2023-01-01' };
            db.execute.mockResolvedValue([[mockFile]]);

            const result = await fileManager.getFileContent('testuser', 'test.md');

            expect(result.code).toBe(200);
            expect(result.data.content).toBe('content');
            expect(Cache.setFileContent).toHaveBeenCalled();
        });

        it('should return 404 if file does not exist', async () => {
            Cache.getFileContent.mockResolvedValue(null);
            db.execute.mockResolvedValue([[]]);

            const result = await fileManager.getFileContent('testuser', 'missing.md');

            expect(result.code).toBe(404);
        });

        it('should handle database errors', async () => {
            Cache.getFileContent.mockResolvedValue(null);
            db.execute.mockRejectedValue(new Error('DB Error'));

            const result = await fileManager.getFileContent('testuser', 'test.md');

            expect(result.code).toBe(500);
            expect(result.message).toContain('获取文件内容失败');
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
            expect(Cache.deleteUserFiles).toHaveBeenCalled();
            expect(Cache.deleteFileContent).toHaveBeenCalled();
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

        it('should handle stale base_last_modified gracefully', async () => {
            const mockConnection = {
                execute: jest.fn()
                    .mockResolvedValueOnce([[{
                        id: 1,
                        content: 'server content',
                        last_modified: '2024-01-02T00:00:00.000Z',
                        content_version: 1
                    }]])
                    .mockResolvedValueOnce([]), // Update
                release: jest.fn()
            };
            db.getConnection.mockResolvedValue(mockConnection);

            const result = await fileManager.saveFile(
                'testuser',
                'test.md',
                'new content',
                { base_last_modified: '2024-01-01T00:00:00.000Z' }
            );

            expect(result.code).toBe(200);
            expect(result.message).toBe('文件更新成功');
            expect(mockConnection.execute).toHaveBeenCalledTimes(2);
        });

        it('should handle mismatched base_hash gracefully', async () => {
            const currentContent = 'server content';
            const wrongHash = 'wronghash';
            const mockConnection = {
                execute: jest.fn()
                    .mockResolvedValueOnce([[{
                        id: 1,
                        content: currentContent,
                        last_modified: '2024-01-02T00:00:00.000Z',
                        content_version: 1
                    }]])
                    .mockResolvedValueOnce([]), // Update
                release: jest.fn()
            };
            db.getConnection.mockResolvedValue(mockConnection);

            const result = await fileManager.saveFile(
                'testuser',
                'test.md',
                'new content',
                { base_hash: wrongHash }
            );

            expect(result.code).toBe(200);
            expect(result.message).toBe('文件更新成功');
            expect(mockConnection.execute).toHaveBeenCalledTimes(2);
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

        it('should handle database errors', async () => {
            const mockConnection = {
                execute: jest.fn().mockRejectedValue(new Error('DB Error')),
                release: jest.fn()
            };
            db.getConnection.mockResolvedValue(mockConnection);

            const result = await fileManager.saveFile('testuser', 'test.md', 'content');

            expect(result.code).toBe(500);
            expect(result.message).toContain('保存文件失败');
        });
    });

    describe('saveFileWithHistory', () => {
        it('should save file and create history when createHistory is true', async () => {
            const mockSaveResult = { code: 200 };
            const mockHistoryResult = { code: 200 };
            
            jest.spyOn(fileManager, 'saveFile').mockResolvedValue(mockSaveResult);
            historyManager.createHistory.mockResolvedValue(mockHistoryResult);

            const result = await fileManager.saveFileWithHistory('testuser', 'test.md', 'content', true);

            expect(result).toEqual(mockSaveResult);
            expect(fileManager.saveFile).toHaveBeenCalledWith('testuser', 'test.md', 'content', {});
            expect(historyManager.createHistory).toHaveBeenCalledWith('testuser', 'test.md', 'content');
            expect(Cache.deleteUserFiles).toHaveBeenCalled();
            expect(Cache.deleteFileContent).toHaveBeenCalled();
        });

        it('should not create history when createHistory is false', async () => {
            const mockSaveResult = { code: 200 };
            
            jest.spyOn(fileManager, 'saveFile').mockResolvedValue(mockSaveResult);

            const result = await fileManager.saveFileWithHistory('testuser', 'test.md', 'content', false);

            expect(result).toEqual(mockSaveResult);
            expect(historyManager.createHistory).not.toHaveBeenCalled();
        });

        it('should return error if saveFile fails', async () => {
            const mockSaveResult = { code: 500, message: 'Error' };
            
            jest.spyOn(fileManager, 'saveFile').mockResolvedValue(mockSaveResult);

            const result = await fileManager.saveFileWithHistory('testuser', 'test.md', 'content', true);

            expect(result).toEqual(mockSaveResult);
            expect(historyManager.createHistory).not.toHaveBeenCalled();
        });

        it('should handle errors during history creation', async () => {
            const mockSaveResult = { code: 200 };
            const mockHistoryResult = { code: 500, message: 'History error' };
            
            jest.spyOn(fileManager, 'saveFile').mockResolvedValue(mockSaveResult);
            historyManager.createHistory.mockResolvedValue(mockHistoryResult);

            const result = await fileManager.saveFileWithHistory('testuser', 'test.md', 'content', true);

            expect(result).toEqual(mockSaveResult);
        });

        it('should handle unexpected errors', async () => {
            jest.spyOn(fileManager, 'saveFile').mockRejectedValue(new Error('Unexpected error'));

            const result = await fileManager.saveFileWithHistory('testuser', 'test.md', 'content', true);

            expect(result.code).toBe(500);
            expect(result.message).toContain('保存文件失败');
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
            expect(Cache.deleteUserFiles).toHaveBeenCalled();
            expect(Cache.deleteFileContent).toHaveBeenCalled();
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

        it('should handle database errors during delete', async () => {
            const mockConnection = {
                beginTransaction: jest.fn(),
                rollback: jest.fn(),
                execute: jest.fn().mockRejectedValue(new Error('DB Error')),
                release: jest.fn()
            };
            db.getConnection.mockResolvedValue(mockConnection);

            const result = await fileManager.deleteFile('testuser', 'test.md');

            expect(result.code).toBe(500);
            expect(result.message).toContain('删除文件失败');
            expect(mockConnection.rollback).toHaveBeenCalled();
        });
    });

    describe('syncFiles', () => {
        it('should sync multiple files successfully', async () => {
            const mockConnection = {
                beginTransaction: jest.fn(),
                commit: jest.fn(),
                rollback: jest.fn(),
                execute: jest.fn()
                    .mockResolvedValueOnce([[{ id: 1 }]]) // Check file 1 exists
                    .mockResolvedValueOnce([]) // Update file 1
                    .mockResolvedValueOnce([[]]) // Check file 2 doesn't exist
                    .mockResolvedValueOnce([]), // Insert file 2
                release: jest.fn()
            };
            db.getConnection.mockResolvedValue(mockConnection);

            const files = [
                { name: 'file1.md', content: 'content1' },
                { name: 'file2.md', content: 'content2' }
            ];

            const result = await fileManager.syncFiles('testuser', files);

            expect(result.code).toBe(200);
            expect(result.data.success).toBe(2);
            expect(result.data.failed).toBe(0);
            expect(mockConnection.commit).toHaveBeenCalled();
            expect(Cache.invalidateUserFiles).toHaveBeenCalled();
        });

        it('should skip files without name', async () => {
            const mockConnection = {
                beginTransaction: jest.fn(),
                commit: jest.fn(),
                rollback: jest.fn(),
                release: jest.fn()
            };
            db.getConnection.mockResolvedValue(mockConnection);

            const files = [
                { name: '', content: 'content1' },
                { content: 'content2' }
            ];

            const result = await fileManager.syncFiles('testuser', files);

            expect(result.code).toBe(200);
            expect(result.data.success).toBe(0);
            expect(result.data.failed).toBe(2);
        });

        it('should handle errors during individual file sync', async () => {
            const mockConnection = {
                beginTransaction: jest.fn(),
                commit: jest.fn(),
                rollback: jest.fn(),
                execute: jest.fn()
                    .mockResolvedValueOnce([[{ id: 1 }]])
                    .mockRejectedValueOnce(new Error('Update failed')),
                release: jest.fn()
            };
            db.getConnection.mockResolvedValue(mockConnection);

            const files = [
                { name: 'file1.md', content: 'content1' }
            ];

            const result = await fileManager.syncFiles('testuser', files);

            expect(result.code).toBe(200);
            expect(result.data.success).toBe(0);
            expect(result.data.failed).toBe(1);
        });

        it('should handle database errors during sync', async () => {
            const mockConnection = {
                beginTransaction: jest.fn(),
                rollback: jest.fn(),
                execute: jest.fn().mockRejectedValue(new Error('DB Error')),
                release: jest.fn()
            };
            db.getConnection.mockResolvedValue(mockConnection);

            const files = [{ name: 'file.md', content: 'content' }];

            const result = await fileManager.syncFiles('testuser', files);

            expect(result.code).toBe(500);
            expect(result.message).toContain('同步文件失败');
            expect(mockConnection.rollback).toHaveBeenCalled();
        });
    });
});
