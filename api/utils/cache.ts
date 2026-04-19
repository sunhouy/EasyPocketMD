import redis from '../config/redis';

const CACHE_TTL = 24 * 60 * 60; // 24 hours in seconds

const CacheKeys = {
    userFiles: (username: string): string => `files:list:${username}`,
    fileContent: (username: string, filename: string): string => `files:content:${username}:${filename}`
};

interface FilesData {
    [key: string]: unknown;
}

interface ContentData {
    [key: string]: unknown;
}

const Cache = {
    /**
     * Get cached user files list
     * @param {string} username
     * @returns {Promise<FilesData|null>}
     */
    async getUserFiles(username: string): Promise<FilesData | null> {
        try {
            const key = CacheKeys.userFiles(username);
            const data = await redis.get(key);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            console.error('Cache getUserFiles error:', (error as Error).message);
            return null;
        }
    },

    /**
     * Set cached user files list
     * @param {string} username
     * @param {FilesData} filesData
     * @returns {Promise<boolean>}
     */
    async setUserFiles(username: string, filesData: FilesData): Promise<boolean> {
        try {
            const key = CacheKeys.userFiles(username);
            await redis.setex(key, CACHE_TTL, JSON.stringify(filesData));
            return true;
        } catch (error) {
            console.error('Cache setUserFiles error:', (error as Error).message);
            return false;
        }
    },

    /**
     * Delete cached user files list
     * @param {string} username
     * @returns {Promise<boolean>}
     */
    async deleteUserFiles(username: string): Promise<boolean> {
        try {
            const key = CacheKeys.userFiles(username);
            await redis.del(key);
            return true;
        } catch (error) {
            console.error('Cache deleteUserFiles error:', (error as Error).message);
            return false;
        }
    },

    /**
     * Get cached file content
     * @param {string} username
     * @param {string} filename
     * @returns {Promise<ContentData|null>}
     */
    async getFileContent(username: string, filename: string): Promise<ContentData | null> {
        try {
            const key = CacheKeys.fileContent(username, filename);
            const data = await redis.get(key);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            console.error('Cache getFileContent error:', (error as Error).message);
            return null;
        }
    },

    /**
     * Set cached file content
     * @param {string} username
     * @param {string} filename
     * @param {ContentData} contentData
     * @returns {Promise<boolean>}
     */
    async setFileContent(username: string, filename: string, contentData: ContentData): Promise<boolean> {
        try {
            const key = CacheKeys.fileContent(username, filename);
            await redis.setex(key, CACHE_TTL, JSON.stringify(contentData));
            return true;
        } catch (error) {
            console.error('Cache setFileContent error:', (error as Error).message);
            return false;
        }
    },

    /**
     * Delete cached file content
     * @param {string} username
     * @param {string} filename
     * @returns {Promise<boolean>}
     */
    async deleteFileContent(username: string, filename: string): Promise<boolean> {
        try {
            const key = CacheKeys.fileContent(username, filename);
            await redis.del(key);
            return true;
        } catch (error) {
            console.error('Cache deleteFileContent error:', (error as Error).message);
            return false;
        }
    },

    /**
     * Invalidate all user file caches (when file list changes)
     * @param {string} username
     * @returns {Promise<boolean>}
     */
    async invalidateUserFiles(username: string): Promise<boolean> {
        try {
            // Delete files list cache
            await this.deleteUserFiles(username);

            // Find and delete all content caches for this user
            const pattern = CacheKeys.fileContent(username, '*');
            const keys = await redis.keys(pattern);
            if (keys.length > 0) {
                await redis.del(...keys);
            }
            return true;
        } catch (error) {
            console.error('Cache invalidateUserFiles error:', (error as Error).message);
            return false;
        }
    }
};

export = Cache;
