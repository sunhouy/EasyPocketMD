const express = require('express');
const router = express.Router();
const db = require('../config/db');
const redis = require('../config/redis');

// 要监控的API端点列表
const ENDPOINTS_TO_MONITOR = [
    {
        name: 'API Health',
        url: '/api/health',
        method: 'GET',
        group: 'core'
    },
    {
        name: 'Auth Login',
        url: '/api/auth/login',
        method: 'POST',
        group: 'auth'
    },
    {
        name: 'Auth Register',
        url: '/api/auth/register',
        method: 'POST',
        group: 'auth'
    },
    {
        name: 'Files List',
        url: '/api/files',
        method: 'GET',
        group: 'files'
    },
    {
        name: 'Files Content',
        url: '/api/files/content',
        method: 'GET',
        group: 'files'
    },
    {
        name: 'Share Get',
        url: '/api/share/get',
        method: 'POST',
        group: 'share'
    },
    {
        name: 'Convert Markdown',
        url: '/api/convert/markdown',
        method: 'POST',
        group: 'convert'
    },
    {
        name: 'Convert PDF',
        url: '/api/convert/pdf',
        method: 'POST',
        group: 'convert'
    },
    {
        name: 'Convert DOCX',
        url: '/api/convert/docx',
        method: 'POST',
        group: 'convert'
    },
    {
        name: 'AI Layout',
        url: '/api/ai/layout',
        method: 'POST',
        group: 'ai'
    },
    {
        name: 'User Files List',
        url: '/api/user_files/list',
        method: 'POST',
        group: 'files'
    }
];

// 检测单个端点状态
async function checkEndpointStatus(endpoint, baseUrl) {
    const startTime = Date.now();
    const fullUrl = baseUrl + endpoint.url;
    
    try {
        const fetch = (await import('node-fetch')).default;
        
        const options = {
            method: endpoint.method,
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            timeout: 10000 // 10秒超时
        };

        // 对于POST请求，发送测试数据
        if (endpoint.method === 'POST') {
            let testBody = {};
            
            // 根据端点类型发送不同的测试数据
            if (endpoint.url.includes('auth/login')) {
                testBody = { username: 'test', password: 'test' };
            } else if (endpoint.url.includes('auth/register')) {
                testBody = { username: 'test', password: 'test' };
            } else if (endpoint.url.includes('share')) {
                testBody = { share_id: 'test' };
            } else if (endpoint.url.includes('user_files')) {
                testBody = { username: 'test', password: 'test' };
            } else if (endpoint.url.includes('convert/docx')) {
                testBody = { markdown: '# Test' };
            } else if (endpoint.url.includes('convert')) {
                testBody = { content: '# Test' };
            } else if (endpoint.url.includes('ai')) {
                testBody = { content: 'test' };
            }
            
            options.body = JSON.stringify(testBody);
        }

        const response = await fetch(fullUrl, options);
        const responseTime = Date.now() - startTime;
        
        // 状态码判断
        // 200-299: 正常
        // 400, 401, 403: 服务正常（只是请求参数问题）
        // 500+: 服务异常
        const isHealthy = response.status < 500;
        const status = isHealthy ? 'healthy' : 'unhealthy';
        
        return {
            name: endpoint.name,
            url: endpoint.url,
            method: endpoint.method,
            group: endpoint.group,
            status: status,
            statusCode: response.status,
            responseTime: responseTime,
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
        
        // 并行检测所有端点
        const endpointPromises = ENDPOINTS_TO_MONITOR.map(endpoint => 
            checkEndpointStatus(endpoint, baseUrl)
        );
        
        // 同时检测数据库和Redis
        const dbPromise = checkDatabaseStatus();
        const redisPromise = checkRedisStatus();
        
        // 等待所有检测完成
        const [endpointResults, dbResult, redisResult] = await Promise.all([
            Promise.all(endpointPromises),
            dbPromise,
            redisPromise
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
        
        // 并行检测所有端点
        const endpointPromises = ENDPOINTS_TO_MONITOR.map(endpoint => 
            checkEndpointStatus(endpoint, baseUrl)
        );
        
        // 同时检测数据库和Redis
        const dbPromise = checkDatabaseStatus();
        const redisPromise = checkRedisStatus();
        
        // 等待所有检测完成
        const [endpointResults, dbResult, redisResult] = await Promise.all([
            Promise.all(endpointPromises),
            dbPromise,
            redisPromise
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
