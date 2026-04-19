import Redis from 'ioredis';

const redisConfig = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0', 10),
    retryStrategy: (times: number): number | null => {
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

let redis: Redis | null = null;
let redisAvailable = false;

try {
    redis = new Redis(redisConfig);

    redis.on('connect', () => {
        redisAvailable = true;
    });

    redis.on('ready', () => {
        redisAvailable = true;
    });

    redis.on('error', (err: Error) => {
        console.error('Redis: error occurred -', err.message);
        redisAvailable = false;
    });

    redis.on('close', () => {
        redisAvailable = false;
    });

    redis.on('reconnecting', () => {
        // reconnecting event
    });

} catch (err) {
    console.error('Redis: failed to initialize -', (err as Error).message);
    redis = null;
    redisAvailable = false;
}

export = {
    get: async (key: string): Promise<string | null> => {
        if (!redis) return null;
        try {
            return await redis.get(key);
        } catch (err) {
            console.error('Redis get error:', (err as Error).message);
            return null;
        }
    },
    setex: async (key: string, seconds: number, value: string): Promise<boolean> => {
        if (!redis) return false;
        try {
            await redis.setex(key, seconds, value);
            return true;
        } catch (err) {
            console.error('Redis setex error:', (err as Error).message);
            return false;
        }
    },
    del: async (...keys: string[]): Promise<boolean> => {
        if (!redis) return false;
        try {
            await redis.del(...keys);
            return true;
        } catch (err) {
            console.error('Redis del error:', (err as Error).message);
            return false;
        }
    },
    keys: async (pattern: string): Promise<string[]> => {
        if (!redis) return [];
        try {
            return await redis.keys(pattern);
        } catch (err) {
            console.error('Redis keys error:', (err as Error).message);
            return [];
        }
    },
    ttl: async (key: string): Promise<number> => {
        if (!redis) return -1;
        try {
            return await redis.ttl(key);
        } catch (err) {
            console.error('Redis ttl error:', (err as Error).message);
            return -1;
        }
    },
    isAvailable: (): boolean => redisAvailable && redis !== null && redis.status === 'ready',
    getStatus: (): { available: boolean; status: string } => ({
        available: redisAvailable,
        status: redis ? redis.status : 'not_initialized'
    })
};
