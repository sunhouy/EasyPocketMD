const Redis = require('ioredis');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const redisConfig = {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    db: process.env.REDIS_DB || 0,
    retryStrategy: (times) => {
        // 只重试3次，然后停止重试
        if (times > 3) {
            return null;
        }
        return Math.min(times * 100, 1000);
    },
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false, // 禁用离线队列，避免Redis不可用时堆积请求
    lazyConnect: true // 延迟连接，直到第一次使用
};

let redis = null;
let redisAvailable = false;

try {
    redis = new Redis(redisConfig);

    redis.on('connect', () => {
        console.log('Redis connected successfully');
        redisAvailable = true;
    });

    redis.on('ready', () => {
        redisAvailable = true;
    });

    redis.on('error', (err) => {
        // 静默处理连接错误，只在第一次报错
        if (redisAvailable) {
            console.error('Redis error:', err.message);
        }
        redisAvailable = false;
    });

    redis.on('close', () => {
        redisAvailable = false;
    });

    // 尝试连接，但不阻塞
    redis.connect().catch(() => {
        // 连接失败，静默处理
        redisAvailable = false;
    });
} catch (err) {
    // Redis 初始化失败，创建空对象
    redis = null;
    redisAvailable = false;
}

// 导出一个安全的 Redis 包装对象
module.exports = {
    get: async (...args) => {
        if (!redisAvailable || !redis) return null;
        try {
            return await redis.get(...args);
        } catch {
            return null;
        }
    },
    setex: async (...args) => {
        if (!redisAvailable || !redis) return false;
        try {
            await redis.setex(...args);
            return true;
        } catch {
            return false;
        }
    },
    del: async (...args) => {
        if (!redisAvailable || !redis) return false;
        try {
            await redis.del(...args);
            return true;
        } catch {
            return false;
        }
    },
    keys: async (...args) => {
        if (!redisAvailable || !redis) return [];
        try {
            return await redis.keys(...args);
        } catch {
            return [];
        }
    },
    ttl: async (...args) => {
        if (!redisAvailable || !redis) return -1;
        try {
            return await redis.ttl(...args);
        } catch {
            return -1;
        }
    },
    isAvailable: () => redisAvailable
};
