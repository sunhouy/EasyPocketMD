const Cache = require('../../api/utils/cache');
const redis = require('../../api/config/redis');

jest.mock('../../api/config/redis');

describe('Cache', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('getUserFiles', () => {
        it('should return cached user files if available', async () => {
            const mockData = { files: [] };
            redis.get.mockResolvedValue(JSON.stringify(mockData));

            const result = await Cache.getUserFiles('testuser');

            expect(result).toEqual(mockData);
            expect(redis.get).toHaveBeenCalledWith('files:list:testuser');
        });

        it('should return null if no cached data', async () => {
            redis.get.mockResolvedValue(null);

            const result = await Cache.getUserFiles('testuser');

            expect(result).toBeNull();
        });

        it('should handle errors and return null', async () => {
            redis.get.mockRejectedValue(new Error('Redis error'));

            const result = await Cache.getUserFiles('testuser');

            expect(result).toBeNull();
        });
    });

    describe('setUserFiles', () => {
        it('should set cached user files', async () => {
            const mockData = { files: [] };
            redis.setex.mockResolvedValue('OK');

            const result = await Cache.setUserFiles('testuser', mockData);

            expect(result).toBe(true);
            expect(redis.setex).toHaveBeenCalledWith(
                'files:list:testuser',
                24 * 60 * 60,
                JSON.stringify(mockData)
            );
        });

        it('should handle errors and return false', async () => {
            redis.setex.mockRejectedValue(new Error('Redis error'));

            const result = await Cache.setUserFiles('testuser', {});

            expect(result).toBe(false);
        });
    });

    describe('deleteUserFiles', () => {
        it('should delete cached user files', async () => {
            redis.del.mockResolvedValue(1);

            const result = await Cache.deleteUserFiles('testuser');

            expect(result).toBe(true);
            expect(redis.del).toHaveBeenCalledWith('files:list:testuser');
        });

        it('should handle errors and return false', async () => {
            redis.del.mockRejectedValue(new Error('Redis error'));

            const result = await Cache.deleteUserFiles('testuser');

            expect(result).toBe(false);
        });
    });

    describe('getFileContent', () => {
        it('should return cached file content if available', async () => {
            const mockData = { content: 'test' };
            redis.get.mockResolvedValue(JSON.stringify(mockData));

            const result = await Cache.getFileContent('testuser', 'test.md');

            expect(result).toEqual(mockData);
            expect(redis.get).toHaveBeenCalledWith('files:content:testuser:test.md');
        });

        it('should return null if no cached content', async () => {
            redis.get.mockResolvedValue(null);

            const result = await Cache.getFileContent('testuser', 'test.md');

            expect(result).toBeNull();
        });

        it('should handle errors and return null', async () => {
            redis.get.mockRejectedValue(new Error('Redis error'));

            const result = await Cache.getFileContent('testuser', 'test.md');

            expect(result).toBeNull();
        });
    });

    describe('setFileContent', () => {
        it('should set cached file content', async () => {
            const mockData = { content: 'test' };
            redis.setex.mockResolvedValue('OK');

            const result = await Cache.setFileContent('testuser', 'test.md', mockData);

            expect(result).toBe(true);
            expect(redis.setex).toHaveBeenCalledWith(
                'files:content:testuser:test.md',
                24 * 60 * 60,
                JSON.stringify(mockData)
            );
        });

        it('should handle errors and return false', async () => {
            redis.setex.mockRejectedValue(new Error('Redis error'));

            const result = await Cache.setFileContent('testuser', 'test.md', {});

            expect(result).toBe(false);
        });
    });

    describe('deleteFileContent', () => {
        it('should delete cached file content', async () => {
            redis.del.mockResolvedValue(1);

            const result = await Cache.deleteFileContent('testuser', 'test.md');

            expect(result).toBe(true);
            expect(redis.del).toHaveBeenCalledWith('files:content:testuser:test.md');
        });

        it('should handle errors and return false', async () => {
            redis.del.mockRejectedValue(new Error('Redis error'));

            const result = await Cache.deleteFileContent('testuser', 'test.md');

            expect(result).toBe(false);
        });
    });

    describe('invalidateUserFiles', () => {
        it('should invalidate all user file caches', async () => {
            const mockKeys = ['files:content:testuser:file1.md', 'files:content:testuser:file2.md'];
            redis.keys.mockResolvedValue(mockKeys);
            redis.del.mockResolvedValue(2);

            jest.spyOn(Cache, 'deleteUserFiles').mockResolvedValue(true);

            const result = await Cache.invalidateUserFiles('testuser');

            expect(result).toBe(true);
            expect(Cache.deleteUserFiles).toHaveBeenCalledWith('testuser');
            expect(redis.keys).toHaveBeenCalledWith('files:content:testuser:*');
            expect(redis.del).toHaveBeenCalledWith(...mockKeys);
        });

        it('should handle case when no content keys found', async () => {
            redis.keys.mockResolvedValue([]);
            jest.spyOn(Cache, 'deleteUserFiles').mockResolvedValue(true);

            const result = await Cache.invalidateUserFiles('testuser');

            expect(result).toBe(true);
            expect(redis.del).not.toHaveBeenCalled();
        });

        it('should handle errors and return false', async () => {
            jest.spyOn(Cache, 'deleteUserFiles').mockRejectedValue(new Error('Redis error'));

            const result = await Cache.invalidateUserFiles('testuser');

            expect(result).toBe(false);
        });
    });
});
