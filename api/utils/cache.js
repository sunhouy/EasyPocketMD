const redis = require('../config/redis');

const CACHE_TTL = 24 * 60 * 60; // 24 hours in seconds

const CacheKeys = {
    userFiles: (username) => `files:list:${username}`,
    fileContent: (username, filename) => `files:content:${username}:${filename}`
};

const Cache = {
    /**
     * Get cached user files list
     * @param {string} username
     * @returns {Promise<Object|null>}
     */
    async getUserFiles(username) {
        try {
            const key = CacheKeys.userFiles(username);
            const data = await redis.get(key);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            console.error('Cache getUserFiles error:', error.message);
            return null;
        }
    },

    /**
     * Set cached user files list
     * @param {string} username
     * @param {Object} filesData
     * @returns {Promise<boolean>}
     */
    async setUserFiles(username, filesData) {
        try {
            const key = CacheKeys.userFiles(username);
            await redis.setex(key, CACHE_TTL, JSON.stringify(filesData));
            return true;
        } catch (error) {
            console.error('Cache setUserFiles error:', error.message);
            return false;
        }
    },

    /**
     * Delete cached user files list
     * @param {string} username
     * @returns {Promise<boolean>}
     */
    async deleteUserFiles(username) {
        try {
            const key = CacheKeys.userFiles(username);
            await redis.del(key);
            return true;
        } catch (error) {
            console.error('Cache deleteUserFiles error:', error.message);
            return false;
        }
    },

    /**
     * Get cached file content
     * @param {string} username
     * @param {string} filename
     * @returns {Promise<Object|null>}
     */
    async getFileContent(username, filename) {
        try {
            const key = CacheKeys.fileContent(username, filename);
            const data = await redis.get(key);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            console.error('Cache getFileContent error:', error.message);
            return null;
        }
    },

    /**
     * Set cached file content
     * @param {string} username
     * @param {string} filename
     * @param {Object} contentData
     * @returns {Promise<boolean>}
     */
    async setFileContent(username, filename, contentData) {
        try {
            const key = CacheKeys.fileContent(username, filename);
            await redis.setex(key, CACHE_TTL, JSON.stringify(contentData));
            return true;
        } catch (error) {
            console.error('Cache setFileContent error:', error.message);
            return false;
        }
    },

    /**
     * Delete cached file content
     * @param {string} username
     * @param {string} filename
     * @returns {Promise<boolean>}
     */
    async deleteFileContent(username, filename) {
        try {
            const key = CacheKeys.fileContent(username, filename);
            await redis.del(key);
            return true;
        } catch (error) {
            console.error('Cache deleteFileContent error:', error.message);
            return false;
        }
    },

    /**
     * Invalidate all user file caches (when file list changes)
     * @param {string} username
     * @returns {Promise<boolean>}
     */
    async invalidateUserFiles(username) {
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
            console.error('Cache invalidateUserFiles error:', error.message);
            return false;
        }
    }
};

module.exports = Cache;
