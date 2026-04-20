
const app = require('../../api/server');

const request = require('supertest');
const db = require('../../api/config/db');

jest.setTimeout(10000);

// Mock auth utils to bypass verification
jest.mock('../../api/utils/auth', () => ({
    verifyTokenOrPassword: jest.fn().mockResolvedValue({ code: 200, message: 'Verified' })
}));

describe('Files API Integration', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('GET /api/files', () => {
        it('should return 200 and list of files', async () => {
            const mockFiles = [
                { filename: 'test.md', content: 'content', last_modified: '2023-01-01' }
            ];
            db.execute.mockResolvedValueOnce([mockFiles]);

            const res = await request(app)
                .get('/api/files')
                .query({ username: 'testuser' });

            expect(res.status).toBe(200);
            expect(res.body.code).toBe(200);
            expect(res.body.data.files).toHaveLength(1);
        });

        it('should return 400 if username is missing', async () => {
            const res = await request(app).get('/api/files');
            expect(res.body.code).toBe(400);
        });
    });

    describe('POST /api/files/save', () => {
        it('should save file and return success', async () => {
            const mockConnection = {
                execute: jest.fn()
                    .mockResolvedValueOnce([[]]) // Check existence
                    .mockResolvedValueOnce([]), // Insert
                release: jest.fn()
            };
            db.getConnection.mockResolvedValueOnce(mockConnection);

            const res = await request(app)
                .post('/api/files/save')
                .send({
                    username: 'testuser',
                    filename: 'new.md',
                    content: 'new content'
                });

            expect(res.status).toBe(200);
            expect(res.body.code).toBe(200);
            expect(res.body.message).toBe('文件保存成功');
        });

        it('should handle optimistic lock conflict gracefully', async () => {
            const mockConnection = {
                execute: jest.fn()
                    .mockResolvedValueOnce([[{
                        id: 1,
                        content: 'server latest',
                        last_modified: '2024-01-02T00:00:00.000Z',
                        content_version: 2
                    }]])
                    .mockResolvedValueOnce([]), // Update
                release: jest.fn()
            };
            db.getConnection.mockResolvedValueOnce(mockConnection);

            const res = await request(app)
                .post('/api/files/save')
                .send({
                    username: 'testuser',
                    filename: 'new.md',
                    content: 'local stale write',
                    base_last_modified: '2024-01-01T00:00:00.000Z'
                });

            expect(res.status).toBe(200);
            expect(res.body.code).toBe(200);
            expect(res.body.message).toBe('文件更新成功');
            expect(mockConnection.execute).toHaveBeenCalledTimes(2);
        });

        it('should keep backward compatibility when base fields are omitted', async () => {
            const mockConnection = {
                execute: jest.fn()
                    .mockResolvedValueOnce([[{ id: 1, content: 'old', last_modified: '2024-01-02T00:00:00.000Z' }]])
                    .mockResolvedValueOnce([]),
                release: jest.fn()
            };
            db.getConnection.mockResolvedValueOnce(mockConnection);

            const res = await request(app)
                .post('/api/files/save')
                .send({
                    username: 'testuser',
                    filename: 'new.md',
                    content: 'overwrite allowed for legacy client'
                });

            expect(res.status).toBe(200);
            expect(res.body.code).toBe(200);
            expect(res.body.message).toBe('文件更新成功');
        });
    });

    describe('POST /api/files/delete', () => {
        it('should delete file and return success', async () => {
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
            db.getConnection.mockResolvedValueOnce(mockConnection);

            const res = await request(app)
                .post('/api/files/delete')
                .send({
                    username: 'testuser',
                    filename: 'test.md'
                });

            expect(res.status).toBe(200);
            expect(res.body.code).toBe(200);
            expect(res.body.message).toBe('文件删除成功');
        });
    });
});
