const Redis = require('ioredis');

const redisConfig = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB) || 0,
    retryStrategy: (times) => {
        if (times > 5) {
            return null;
        }
        const delay = Math.min(times * 500, 2000);
        return delay;
    },
    maxRetriesPerRequest: 3,
    enableOfflineQueue: true,
    lazyConnect: true,
    connectTimeout: 10000,
    commandTimeout: 5000
};



let redis = null;
let redisAvailable = false;

try {
    redis = new Redis(redisConfig);

    redis.on('connect', () => {
        redisAvailable = true;
    });

    redis.on('ready', () => {
        redisAvailable = true;
    });

    redis.on('error', (err) => {
        console.error('Redis: error occurred -', err.message);
        redisAvailable = false;
    });

    redis.on('close', () => {
        redisAvailable = false;
    });

    redis.on('reconnecting', () => {
    });

} catch (err) {
    console.error('Redis: failed to initialize -', err.message);
    redis = null;
    redisAvailable = false;
}

async function ensureConnection() {
    if (!redis) {
        return false;
    }
    if (redisAvailable && redis.status === 'ready') {
        return true;
    }
    try {
        if (redis.status === 'wait' || redis.status === 'end') {
            await redis.connect();
        }
        return redisAvailable;
    } catch (err) {
        console.error('Redis: ensureConnection failed -', err.message);
        return false;
    }
}

module.exports = {
    get: async (...args) => {
        if (!redis) return null;
        try {
            return await redis.get(...args);
        } catch (err) {
            console.error('Redis get error:', err.message);
            return null;
        }
    },
    setex: async (...args) => {
        if (!redis) return false;
        try {
            await redis.setex(...args);
            return true;
        } catch (err) {
            console.error('Redis setex error:', err.message);
            return false;
        }
    },
    del: async (...args) => {
        if (!redis) return false;
        try {
            await redis.del(...args);
            return true;
        } catch (err) {
            console.error('Redis del error:', err.message);
            return false;
        }
    },
    keys: async (...args) => {
        if (!redis) return [];
        try {
            return await redis.keys(...args);
        } catch (err) {
            console.error('Redis keys error:', err.message);
            return [];
        }
    },
    ttl: async (...args) => {
        if (!redis) return -1;
        try {
            return await redis.ttl(...args);
        } catch (err) {
            console.error('Redis ttl error:', err.message);
            return -1;
        }
    },
    isAvailable: () => redisAvailable && redis && redis.status === 'ready',
    getStatus: () => ({
        available: redisAvailable,
        status: redis ? redis.status : 'not_initialized'
    })
};
