const Redis = require('ioredis');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const redisConfig = {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    db: process.env.REDIS_DB || 0,
    retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
    },
    maxRetriesPerRequest: 3
};

const redis = new Redis(redisConfig);

redis.on('connect', () => {
    console.log('Redis connected successfully');
});

redis.on('error', (err) => {
    console.error('Redis connection error:', err.message);
});

module.exports = redis;
