const ipKeyGenerator = (req) => {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
        return forwarded.split(',')[0].trim();
    }
    return req.ip || req.connection.remoteAddress || 'unknown';
};

const isAuthenticated = (req) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        return true;
    }
    if (req.body && req.body.token) {
        return true;
    }
    if (req.body && req.body.username && req.body.password) {
        return true;
    }
    return false;
};

const createLimiter = (options) => {
    const windowMs = options.windowMs || 15 * 60 * 1000;
    const maxFn = typeof options.max === 'function' ? options.max : () => options.max || 100;
    const message = options.message || {
        code: 429,
        message: '请求过于频繁，请稍后再试'
    };
    const keyGenerator = options.keyGenerator || ipKeyGenerator;
    const skipFn = options.skip || (() => false);

    const hits = new Map();

    const getKey = (req) => {
        try {
            return keyGenerator(req);
        } catch (e) {
            return ipKeyGenerator(req);
        }
    };

    const getLimit = (req) => {
        try {
            return maxFn(req);
        } catch (e) {
            return 100;
        }
    };

    return (req, res, next) => {
        try {
            if (skipFn(req)) {
                return next();
            }

            const key = getKey(req);
            const limit = getLimit(req);
            const now = Date.now();

            let record = hits.get(key);
            if (!record || now - record.resetTime > windowMs) {
                record = { count: 0, resetTime: now };
                hits.set(key, record);
            }

            record.count++;

            const remaining = Math.max(limit - record.count, 0);

            res.setHeader('RateLimit-Limit', limit);
            res.setHeader('RateLimit-Remaining', remaining);
            res.setHeader('RateLimit-Reset', Math.ceil((record.resetTime + windowMs) / 1000));

            if (record.count > limit) {
                res.setHeader('Retry-After', Math.ceil(windowMs / 1000));
                return res.status(429).json(message);
            }

            next();
        } catch (error) {
            console.error('Rate limiter error:', error);
            next();
        }
    };
};

const aiLimiter = createLimiter({
    windowMs: 60 * 60 * 1000,
    max: (req) => isAuthenticated(req) ? 500 : 50,
    message: {
        code: 429,
        message: 'AI功能调用次数已达上限，请登录以获取更多次数或稍后再试'
    }
});

const authLimiter = createLimiter({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: {
        code: 429,
        message: '登录尝试次数过多，请15分钟后再试'
    },
    keyGenerator: (req) => {
        if (req.body && req.body.username) {
            return req.body.username;
        }
        return ipKeyGenerator(req);
    }
});

const registerLimiter = createLimiter({
    windowMs: 60 * 60 * 1000,
    max: 5,
    message: {
        code: 429,
        message: '注册尝试次数过多，请1小时后再试'
    }
});

const uploadLimiter = createLimiter({
    windowMs: 15 * 60 * 1000,
    max: (req) => isAuthenticated(req) ? 1000 : 300,
    message: {
        code: 429,
        message: '上传次数已达上限，请稍后再试'
    }
});

const apiLimiter = createLimiter({
    windowMs: 15 * 60 * 1000,
    max: (req) => isAuthenticated(req) ? 50000 : 10000,
    message: {
        code: 429,
        message: '请求过于频繁，请稍后再试'
    }
});

const fileLimiter = createLimiter({
    windowMs: 15 * 60 * 1000,
    max: (req) => isAuthenticated(req) ? 30000 : 6000,
    message: {
        code: 429,
        message: '文件操作过于频繁，请稍后再试'
    }
});

const convertLimiter = createLimiter({
    windowMs: 60 * 60 * 1000,
    max: (req) => isAuthenticated(req) ? 6000 : 1500,
    message: {
        code: 429,
        message: '转换次数已达上限，请稍后再试'
    }
});

const strictLimiter = createLimiter({
    windowMs: 60 * 60 * 1000,
    max: 100,
    message: {
        code: 429,
        message: '操作次数已达上限，请稍后再试'
    }
});

const searchLimiter = createLimiter({
    windowMs: 60 * 60 * 1000,
    max: (req) => isAuthenticated(req) ? 600 : 150,
    message: {
        code: 429,
        message: '搜索次数已达上限，请稍后再试'
    }
});

module.exports = {
    aiLimiter,
    authLimiter,
    registerLimiter,
    uploadLimiter,
    apiLimiter,
    fileLimiter,
    convertLimiter,
    strictLimiter,
    searchLimiter,
    isAuthenticated
};
