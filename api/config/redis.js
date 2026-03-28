const Redis = require('ioredis');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const redisConfig = {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    db: process.env.REDIS_DB || 0,
    retryStrategy: (times) => {
        if (times > 3) {
            return null;
        }
        return Math.min(times * 100, 1000);
    },
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    lazyConnect: true
};

let redis = null;
let redisAvailable = false;
let connectionPromise = null;

async function ensureConnection() {
    if (redisAvailable && redis) {
        return true;
    }
    if (!redis) {
        return false;
    }
    if (connectionPromise) {
        return connectionPromise;
    }
    
    connectionPromise = redis.connect()
        .then(() => {
            redisAvailable = true;
            return true;
        })
        .catch((err) => {
            console.error('Redis connection failed:', err.message);
            redisAvailable = false;
            return false;
        })
        .finally(() => {
            connectionPromise = null;
        });
    
    return connectionPromise;
}

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
        if (redisAvailable) {
            console.error('Redis error:', err.message);
        }
        redisAvailable = false;
    });

    redis.on('close', () => {
        redisAvailable = false;
    });

    // 立即尝试连接
    ensureConnection().catch(() => {
        redisAvailable = false;
    });
} catch (err) {
    redis = null;
    redisAvailable = false;
}

module.exports = {
    get: async (...args) => {
        const connected = await ensureConnection();
        if (!connected || !redis) return null;
        try {
            return await redis.get(...args);
        } catch {
            return null;
        }
    },
    setex: async (...args) => {
        const connected = await ensureConnection();
        if (!connected || !redis) return false;
        try {
            await redis.setex(...args);
            return true;
        } catch {
            return false;
        }
    },
    del: async (...args) => {
        const connected = await ensureConnection();
        if (!connected || !redis) return false;
        try {
            await redis.del(...args);
            return true;
        } catch {
            return false;
        }
    },
    keys: async (...args) => {
        const connected = await ensureConnection();
        if (!connected || !redis) return [];
        try {
            return await redis.keys(...args);
        } catch {
            return [];
        }
    },
    ttl: async (...args) => {
        const connected = await ensureConnection();
        if (!connected || !redis) return -1;
        try {
            return await redis.ttl(...args);
        } catch {
            return -1;
        }
    },
    isAvailable: () => redisAvailable
};
