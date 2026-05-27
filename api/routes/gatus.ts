const express = require('express');
const router = express.Router();
const db = require('../config/db');
const redis = require('../config/redis');

// 扫描后端路由，构建“要监控的 API 列表”
// 说明：
// - 这里用于“服务状态页”探测，一般不需要真实业务参数，因此会尽量发空 JSON。
// - 对于需要 multipart 上传/导入/legacy index.php 这类，使用空 JSON 探测很容易造成 500 或副作用，所以做了过滤跳过。
const authRoutes = require('./auth');
const filesRoutes = require('./files');
const userFilesRoutes = require('./user_files');
const shareRoutes = require('./share');
const adminRoutes = require('./admin');
const externalApiRoutes = require('./api'); // mounted at /api/external AND /api
const codeRunnerRoutes = require('./code-runner');
const convertRoutes = require('./convert');
const aiRoutes = require('./ai');
const pptExportRoutes = require('./ppt-export');
const pptStatusRoutes = require('./ppt-status');
const pexelsRoutes = require('./pexels');
const legacyRoutes = require('./legacy');

function joinPaths(a, b) {
    const left = String(a || '').replace(/\/+$/, '');
    const right = String(b || '');
    if (!right) return left;
    if (right === '/') return left;
    if (!right.startsWith('/')) return left + '/' + right;
    return left + right;
}

function normalizeMethod(methodKey) {
    // Express router.methods keys: get/post/put/delete/patch/all
    if (!methodKey) return 'GET';
    return methodKey.toUpperCase() === 'ALL' ? 'ALL' : methodKey.toUpperCase();
}

function shouldSkipEndpoint(fullUrl) {
    const url = String(fullUrl || '');
    if (url.includes(':')) return true; // route param
    if (url.includes('*')) return true;

    // multipart/upload/import/legacy index.php 都不适合用空 JSON 探测
    const skipSubstrings = [
        'index.php',
        'upload_avatar',
        'upload_screenshot',
        '/import/',
        '/files/import',
        '/upload',
        '/files/upload',
    ];
    return skipSubstrings.some(s => url.includes(s));
}

function collectRouterEndpoints(routerInstance, mountPath, group) {
    const endpoints = [];
    if (!routerInstance || !Array.isArray(routerInstance.stack)) return endpoints;

    for (const layer of routerInstance.stack) {
        if (!layer || !layer.route || !layer.route.path) continue;

        const routePath = layer.route.path;
        if (typeof routePath !== 'string') continue;
        if (routePath.includes(':')) continue;

        const methods = layer.route.methods || {};
        for (const [methodKey, enabled] of Object.entries(methods)) {
            if (!enabled) continue;
            const method = normalizeMethod(methodKey);
            const fullUrl = joinPaths(mountPath, routePath);
            if (shouldSkipEndpoint(fullUrl)) continue;

            const displayMethod = method === 'ALL' ? 'POST' : method;
            const name = `${group} ${displayMethod} ${fullUrl}`;
            endpoints.push({
                name,
                url: fullUrl,
                method,
                group
            });
        }
    }

    return endpoints;
}

function dedupeEndpoints(endpoints) {
    const map = new Map();
    for (const ep of endpoints) {
        const key = `${ep.method} ${ep.url}`;
        if (!map.has(key)) map.set(key, ep);
    }
    return Array.from(map.values());
}

function buildEndpointsToMonitor() {
    const endpoints = [];

    // 基础健康检查（server.ts 里直接挂的）
    endpoints.push(
        { name: 'core GET /api/health', url: '/api/health', method: 'GET', group: 'core' },
        { name: 'core GET /api/health/redis', url: '/api/health/redis', method: 'GET', group: 'core' }
    );

    const sources = [
        { mountPath: '/api/auth', routerInstance: authRoutes, group: 'auth' },
        { mountPath: '/api/files', routerInstance: filesRoutes, group: 'files' },
        { mountPath: '/api/user_files', routerInstance: userFilesRoutes, group: 'files' },
        { mountPath: '/api/share', routerInstance: shareRoutes, group: 'share' },
        { mountPath: '/api/admin', routerInstance: adminRoutes, group: 'admin' },
        { mountPath: '/api/external', routerInstance: externalApiRoutes, group: 'external' },
        { mountPath: '/api', routerInstance: externalApiRoutes, group: 'external' }, // compat mounts
        { mountPath: '/api/code-runner', routerInstance: codeRunnerRoutes, group: 'code-runner' },
        { mountPath: '/api/convert', routerInstance: convertRoutes, group: 'convert' },
        { mountPath: '/api/ai', routerInstance: aiRoutes, group: 'ai' },
        { mountPath: '/api/ppt-export', routerInstance: pptExportRoutes, group: 'ppt-export' },
        { mountPath: '/api/ppt-status', routerInstance: pptStatusRoutes, group: 'ppt-status' },
        { mountPath: '/api/pexels', routerInstance: pexelsRoutes, group: 'pexels' },
        { mountPath: '/api', routerInstance: legacyRoutes, group: 'legacy' }, // 过滤后一般只剩很少
    ];

    for (const source of sources) {
        endpoints.push(...collectRouterEndpoints(source.routerInstance, source.mountPath, source.group));
    }

    // 去重 + 简单排序（让 UI 更稳定）
    const deduped = dedupeEndpoints(endpoints);
    deduped.sort((a, b) => (a.group || '').localeCompare(b.group || '') || (a.url || '').localeCompare(b.url || ''));
    return deduped;
}

const ENDPOINTS_TO_MONITOR = buildEndpointsToMonitor();

function mapWithConcurrency(items, concurrency, mapper) {
    const results = new Array(items.length);
    let index = 0;

    async function worker() {
        while (true) {
            const current = index++;
            if (current >= items.length) break;
            results[current] = await mapper(items[current]);
        }
    }

    const workers = [];
    const workerCount = Math.max(1, Math.min(concurrency, items.length));
    for (let i = 0; i < workerCount; i++) workers.push(worker());
    return Promise.all(workers).then(() => results);
}

let nodeFetchPromise = null;
async function getNodeFetch() {
    if (!nodeFetchPromise) {
        nodeFetchPromise = import('node-fetch').then(mod => mod.default);
    }
    return nodeFetchPromise;
}

// 检测单个端点状态
async function checkEndpointStatus(endpoint, baseUrl) {
    const startTime = Date.now();
    const fullUrl = baseUrl + endpoint.url;
    
    try {
        const fetch = await getNodeFetch();

        const method = endpoint.method === 'ALL' ? 'POST' : endpoint.method;
        const timeoutMs = endpoint.timeoutMs || 10000;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        const options: any = {
            method,
            headers: {
                'Accept': 'application/json'
            },
            signal: controller.signal
        };

        // 对于非 GET 请求，发送空 JSON
        if (method !== 'GET') {
            options.headers['Content-Type'] = 'application/json';
            options.body = JSON.stringify(endpoint.testBody || {});
        }

        const response = await fetch(fullUrl, options);
        clearTimeout(timeoutId);
        const responseTime = Date.now() - startTime;

        // 服务健康判断：
        // - 优先看 HTTP status
        // - 同时读取 JSON body 的 code（很多接口都是 res.json({code:...})，但 HTTP status 仍是 200）
        let logicalCode = null;
        let logicalMessage = null;
        try {
            const json = await response.clone().json();
            if (json && typeof json.code === 'number') logicalCode = json.code;
            if (json && typeof json.message === 'string') logicalMessage = json.message;
            if (!logicalMessage && json && typeof json.error === 'string') logicalMessage = json.error;
        } catch {
            // 非 JSON 响应忽略
        }

        const statusCode = logicalCode ?? response.status;
        const isHealthy = response.status < 500 && (logicalCode == null ? true : logicalCode < 500);
        const status = isHealthy ? 'healthy' : 'unhealthy';
        
        return {
            name: endpoint.name,
            url: endpoint.url,
            method: endpoint.method,
            group: endpoint.group,
            status: status,
            statusCode: statusCode,
            responseTime: responseTime,
            error: isHealthy ? undefined : (logicalMessage || undefined),
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        return {
            name: endpoint.name,
            url: endpoint.url,
            method: endpoint.method,
            group: endpoint.group,
            status: 'unhealthy',
            statusCode: 0,
            responseTime: Date.now() - startTime,
            error: error.message,
            timestamp: new Date().toISOString()
        };
    }
}

// 检测数据库连接状态
async function checkDatabaseStatus() {
    const startTime = Date.now();
    
    try {
        const [rows] = await db.execute('SELECT 1 as test');
        const responseTime = Date.now() - startTime;
        
        return {
            name: 'MySQL Database',
            url: 'mysql://localhost',
            method: 'QUERY',
            group: 'database',
            status: 'healthy',
            statusCode: 200,
            responseTime: responseTime,
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        return {
            name: 'MySQL Database',
            url: 'mysql://localhost',
            method: 'QUERY',
            group: 'database',
            status: 'unhealthy',
            statusCode: 0,
            responseTime: Date.now() - startTime,
            error: error.message,
            timestamp: new Date().toISOString()
        };
    }
}

// 检测Redis连接状态
async function checkRedisStatus() {
    const startTime = Date.now();
    const redisStatus = redis.getStatus();
    
    if (!redisStatus.available) {
        return {
            name: 'Redis Cache',
            url: 'redis://localhost',
            method: 'PING',
            group: 'cache',
            status: 'unhealthy',
            statusCode: 0,
            responseTime: 0,
            error: 'Redis not available',
            timestamp: new Date().toISOString()
        };
    }
    
    try {
        await redis.get('ping_test_key');
        const responseTime = Date.now() - startTime;
        
        return {
            name: 'Redis Cache',
            url: 'redis://localhost',
            method: 'PING',
            group: 'cache',
            status: 'healthy',
            statusCode: 200,
            responseTime: responseTime,
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        return {
            name: 'Redis Cache',
            url: 'redis://localhost',
            method: 'PING',
            group: 'cache',
            status: 'unhealthy',
            statusCode: 0,
            responseTime: Date.now() - startTime,
            error: error.message,
            timestamp: new Date().toISOString()
        };
    }
}

// Gatus兼容的端点状态接口
router.get('/v1/endpoints/statuses', async (req, res) => {
    try {
        // 获取基础URL
        const protocol = req.headers['x-forwarded-proto'] || req.protocol;
        const host = req.headers.host;
        const baseUrl = `${protocol}://${host}`;

        // 控制并发，避免状态页请求时把服务打爆
        const [endpointResults, dbResult, redisResult] = await Promise.all([
            mapWithConcurrency(ENDPOINTS_TO_MONITOR, 5, (endpoint) => checkEndpointStatus(endpoint, baseUrl)),
            checkDatabaseStatus(),
            checkRedisStatus()
        ]);

        // 合并结果
        const allResults = [...endpointResults, dbResult, redisResult];
        
        // 转换为Gatus兼容格式
        const gatusResults = allResults.map(result => ({
            name: result.name,
            group: result.group,
            url: result.url,
            method: result.method,
            status: result.status,
            health: {
                status: result.status,
                message: result.error || 'OK'
            },
            uptime: {
                percentage: result.status === 'healthy' ? 100 : 0,
                total_requests: 1,
                successful_requests: result.status === 'healthy' ? 1 : 0
            },
            response_time: result.responseTime,
            status_code: result.statusCode,
            timestamp: result.timestamp
        }));
        
        res.json(gatusResults);
    } catch (error) {
        console.error('Gatus status check error:', error);
        res.status(500).json({
            code: 500,
            message: 'Failed to check service status',
            error: error.message
        });
    }
});

// 简化的服务状态接口（供前端直接使用）
router.get('/status', async (req, res) => {
    try {
        // 获取基础URL
        const protocol = req.headers['x-forwarded-proto'] || req.protocol;
        const host = req.headers.host;
        const baseUrl = `${protocol}://${host}`;

        // 控制并发，避免状态页请求时把服务打爆
        const [endpointResults, dbResult, redisResult] = await Promise.all([
            mapWithConcurrency(ENDPOINTS_TO_MONITOR, 5, (endpoint) => checkEndpointStatus(endpoint, baseUrl)),
            checkDatabaseStatus(),
            checkRedisStatus()
        ]);

        // 合并结果
        const allResults = [...endpointResults, dbResult, redisResult];
        
        // 计算总体状态
        const healthyCount = allResults.filter(r => r.status === 'healthy').length;
        const totalCount = allResults.length;
        const overallStatus = healthyCount === totalCount ? 'healthy' : 
                              healthyCount > 0 ? 'degraded' : 'unhealthy';
        
        res.json({
            code: 200,
            status: overallStatus,
            summary: {
                total: totalCount,
                healthy: healthyCount,
                unhealthy: totalCount - healthyCount
            },
            endpoints: allResults,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Service status check error:', error);
        res.status(500).json({
            code: 500,
            message: 'Failed to check service status',
            error: error.message
        });
    }
});

// 单个端点状态检测接口
router.post('/check', async (req, res) => {
    try {
        const { url, method = 'GET' } = req.body;
        
        if (!url) {
            return res.status(400).json({
                code: 400,
                message: 'URL is required'
            });
        }
        
        // 获取基础URL
        const protocol = req.headers['x-forwarded-proto'] || req.protocol;
        const host = req.headers.host;
        const baseUrl = `${protocol}://${host}`;
        
        const endpoint = {
            name: 'Custom Endpoint',
            url: url,
            method: method,
            group: 'custom'
        };
        
        const result = await checkEndpointStatus(endpoint, baseUrl);
        
        res.json({
            code: 200,
            data: result
        });
    } catch (error) {
        console.error('Custom endpoint check error:', error);
        res.status(500).json({
            code: 500,
            message: 'Failed to check endpoint',
            error: error.message
        });
    }
});

module.exports = router;
