import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';

// 检查用户是否已登录的辅助函数
const isAuthenticated = (req: Request): boolean => {
    // 检查请求头中的认证信息
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        return true;
    }
    // 检查请求体中的token
    if (req.body && req.body.token) {
        return true;
    }
    // 检查请求体中的username和password（传统认证方式）
    if (req.body && req.body.username && req.body.password) {
        return true;
    }
    return false;
};

// 获取客户端IP地址（兼容IPv6）
const getClientIp = (req: Request): string => {
    // 优先获取真实IP（通过代理）
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
        return (forwarded as string).split(',')[0].trim();
    }
    // 获取直接连接的IP
    return req.ip || req.socket.remoteAddress || 'unknown';
};

// 获取用户标识（用于限流的key）
const getKeyGenerator = (req: Request): string => {
    // 优先使用用户标识
    if (req.body && req.body.username) {
        return req.body.username;
    }
    // 使用IP地址作为备选
    return getClientIp(req);
};

interface LimiterOptions {
    windowMs?: number;
    max?: number | ((req: Request) => number);
    message?: { code: number; message: string };
    keyGenerator?: (req: Request) => string;
    skip?: (req: Request) => boolean;
}

// 创建限流器的通用配置
const createLimiter = (options: LimiterOptions) => {
    return rateLimit({
        windowMs: options.windowMs || 15 * 60 * 1000, // 默认15分钟
        max: options.max || 100, // 默认最多100次
        message: {
            code: 429,
            message: options.message?.message || '请求过于频繁，请稍后再试'
        },
        standardHeaders: true, // 返回 RateLimit-* 头
        legacyHeaders: false, // 禁用 X-RateLimit-* 头
        keyGenerator: options.keyGenerator || getKeyGenerator,
        skip: options.skip || (() => false),
        handler: (_req: Request, res: Response) => {
            res.status(429).json(options.message || { code: 429, message: '请求过于频繁，请稍后再试' });
        }
    });
};

// AI接口限流 - 对未登录用户更严格
const aiLimiter = createLimiter({
    windowMs: 60 * 60 * 1000, // 1小时窗口
    max: (req: Request) => isAuthenticated(req) ? 500 : 50, // 登录用户500次/小时，未登录50次/小时
    message: {
        code: 429,
        message: 'AI功能调用次数已达上限，请登录以获取更多次数或稍后再试'
    }
});

// 认证接口限流 - 防止暴力破解
const authLimiter = createLimiter({
    windowMs: 15 * 60 * 1000, // 15分钟窗口
    max: 10, // 最多10次
    message: {
        code: 429,
        message: '登录尝试次数过多，请15分钟后再试'
    },
    keyGenerator: (req: Request) => {
        // 优先使用username
        if (req.body && req.body.username) {
            return req.body.username;
        }
        return getClientIp(req);
    }
});

// 注册接口限流
const registerLimiter = createLimiter({
    windowMs: 60 * 60 * 1000, // 1小时窗口
    max: 5, // 最多5次
    message: {
        code: 429,
        message: '注册尝试次数过多，请1小时后再试'
    }
});

// 文件上传限流
const uploadLimiter = createLimiter({
    windowMs: 15 * 60 * 1000, // 15分钟窗口
    max: (req: Request) => isAuthenticated(req) ? 1000 : 300, // 登录用户1000次，未登录300次
    message: {
        code: 429,
        message: '上传次数已达上限，请稍后再试'
    }
});

// 通用API限流
const apiLimiter = createLimiter({
    windowMs: 15 * 60 * 1000, // 15分钟窗口
    max: (req: Request) => isAuthenticated(req) ? 50000 : 10000, // 登录用户50000次，未登录10000次
    message: {
        code: 429,
        message: '请求过于频繁，请稍后再试'
    }
});

// 文件操作限流 - 放宽限制
const fileLimiter = createLimiter({
    windowMs: 15 * 60 * 1000, // 15分钟窗口
    max: (req: Request) => isAuthenticated(req) ? 30000 : 6000, // 登录用户3000次，未登录6000次
    message: {
        code: 429,
        message: '文件操作过于频繁，请稍后再试'
    }
});

// 转换接口限流（HTML/PDF导出等）- 放宽限制
const convertLimiter = createLimiter({
    windowMs: 60 * 60 * 1000, // 1小时窗口
    max: (req: Request) => isAuthenticated(req) ? 6000 : 1500, // 登录用户6000次，未登录1500次
    message: {
        code: 429,
        message: '转换次数已达上限，请稍后再试'
    }
});

// 严格限流 - 用于敏感操作
const strictLimiter = createLimiter({
    windowMs: 60 * 60 * 1000, // 1小时窗口
    max: 100, // 最多100次
    message: {
        code: 429,
        message: '操作次数已达上限，请稍后再试'
    }
});

export {
    aiLimiter,
    authLimiter,
    registerLimiter,
    uploadLimiter,
    apiLimiter,
    fileLimiter,
    convertLimiter,
    strictLimiter,
    isAuthenticated,
    getKeyGenerator
};
