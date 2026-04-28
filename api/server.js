const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const http = require('http');

// 加载敏感词库
const { loadSensitiveWords } = require('./utils/sensitiveFilter');
loadSensitiveWords();

const app = express();
const port = process.env.PORT || 3000;

const isTest = process.env.NODE_ENV === 'test';

// Import rate limiters
const {
    aiLimiter,
    authLimiter,
    registerLimiter,
    uploadLimiter,
    apiLimiter,
    fileLimiter,
    convertLimiter,
    strictLimiter
} = require('./middleware/rateLimiter');

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static files for uploads
// Note: __dirname is api/, so we need to go up one level to root
const uploadsPath = path.join(__dirname, '../uploads');
const avatarsPath = path.join(__dirname, '../avatars');
const screenshotsPath = path.join(__dirname, '../screenshots');
const userFilesPath = path.join(__dirname, '../user_files');

if (!isTest) {
}

app.use('/uploads', express.static(uploadsPath));
app.use('/avatars', express.static(avatarsPath));
app.use('/screenshots', express.static(screenshotsPath));
app.use('/user_files', express.static(userFilesPath));

// Serve static files from node_modules for Vditor
const vditorPackagePath = path.join(__dirname, '../node_modules/@sunhouyun/vditor');
function localizeVditorAssets(content) {
    return content
        .replace(/Constants\.CDN = "https:\/\/unpkg\.com\/vditor@"\.concat\("[^"]+"\);/g, 'Constants.CDN = "/vditor";')
        .replace(/([A-Za-z_$][\w$]*\.CDN=)"https:\/\/unpkg\.com\/vditor@"\.concat\("[^"]+"\)/g, '$1"/vditor"')
        .replace(/https:\/\/unpkg\.com\/vditor\/dist\/images\/logo\.png/g, '/vditor/dist/images/logo.png');
}
app.get(/^\/vditor\/.*\.js$/, (req, res, next) => {
    const relativePath = req.path.replace(/^\/vditor\//, '');
    const filePath = path.join(vditorPackagePath, relativePath);
    if (!filePath.startsWith(vditorPackagePath) || !fs.existsSync(filePath)) {
        return next();
    }
    res.type('application/javascript');
    res.send(localizeVditorAssets(fs.readFileSync(filePath, 'utf8')));
});
app.use('/vditor', express.static(vditorPackagePath));
// Serve Font Awesome from node_modules
app.use('/fa', express.static(path.join(__dirname, '../node_modules/@fortawesome/fontawesome-free')));

if (!isTest) {
}

// PWA assets (must NOT fall back to index.html)
// These files live in project root and are deployed alongside dist/
const rootPath = path.join(__dirname, '../');
app.get('/sw.js', (req, res) => {
    res.type('application/javascript');
    res.sendFile(path.join(rootPath, 'sw.js'));
});
app.get('/manifest.webmanifest', (req, res) => {
    // Some browsers expect application/manifest+json; Express doesn't have a built-in shortcut for it.
    res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
    res.sendFile(path.join(rootPath, 'manifest.webmanifest'));
});
app.get('/icon.png', (req, res) => {
    res.type('image/png');
    res.sendFile(path.join(rootPath, 'icon.png'));
});


// Import routes first
const legacyRoutes = require('./routes/legacy');
const authRoutes = require('./routes/auth');
const fileRoutes = require('./routes/files');
const shareRoutes = require('./routes/share');
const adminRoutes = require('./routes/admin');
const apiRoutes = require('./routes/api');
const codeRunnerRoutes = require('./routes/code-runner');
const convertRoutes = require('./routes/convert');
const aiRoutes = require('./routes/ai');
const userFilesRoutes = require('./routes/user_files');
const pptExportRoutes = require('./routes/ppt-export');
const pexelsRoutes = require('./routes/pexels');
const gatusRoutes = require('./routes/gatus');
const shareManager = require('./models/ShareManager');
const { initShareCollabServer } = require('./realtime/shareCollabServer');

// Use routes with rate limiting - MUST BE BEFORE SPA FALLBACK!
// AI routes - strict rate limiting (especially for unauthenticated users)
app.use('/api/ai', aiLimiter, aiRoutes);

// Auth routes - prevent brute force attacks
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', registerLimiter);
app.use('/api/auth', authRoutes);

// File routes - rate limiting based on auth status
app.use('/api/files', fileLimiter, fileRoutes);
app.use('/api/user_files', fileLimiter, userFilesRoutes);

// Upload routes - mounted via /api/external, rate limiting applied there

// Share routes
app.use('/api/share', apiLimiter, shareRoutes);

// Admin routes - strict rate limiting
app.use('/api/admin', strictLimiter, adminRoutes);

// External API routes
app.use('/api/external', apiLimiter, apiRoutes);

// Code runner routes - server-side C/C++ compilation via emscripten
app.use('/api/code-runner', apiLimiter, codeRunnerRoutes);

// Convert routes - rate limiting for export functions
app.use('/api/convert', convertLimiter, convertRoutes);

// PPT Export routes - rate limiting for PPT export
app.use('/api/ppt-export', convertLimiter, pptExportRoutes);

// Pexels routes - rate limiting for image search
app.use('/api/pexels', aiLimiter, pexelsRoutes);

// Upload compatibility routes:
// - /api/upload
// - /api/upload_screenshot
// - /api/files/upload
// Older clients and documentation use these paths instead of /api/external/*.
app.use('/api', uploadLimiter, apiRoutes);

// Legacy routes - general API rate limiting
app.use('/api', apiLimiter, legacyRoutes);

// Gatus monitoring routes - no rate limiting for monitoring
app.use('/api/v1', gatusRoutes);
app.use('/api/gatus', gatusRoutes);

// Try to find the dist folder in multiple locations
const potentialDistPaths = [
    path.join(__dirname, '../dist'),
    path.join(process.cwd(), 'dist'),
    path.join(__dirname, 'dist'),
    '/www/wwwroot/js/dist'
];

let distPath = null;
for (const p of potentialDistPaths) {
    const indexHtmlPath = path.join(p, 'index.html');
    if (!isTest) console.log(`Checking for frontend build at: ${p}`);
    if (fs.existsSync(p) && fs.existsSync(indexHtmlPath)) {
        if (!isTest) console.log(`Found valid frontend build at: ${p}`);
        distPath = p;
        break;
    }
}

if (distPath) {
    app.use(express.static(distPath, {
        setHeaders: (res, filePath) => {
            if (filePath.endsWith('.mjs')) {
                res.setHeader('Content-Type', 'text/javascript');
            }
            if (filePath.endsWith('.wasm')) {
                res.setHeader('Content-Type', 'application/wasm');
            }
            if (filePath.endsWith('.worker.js')) {
                res.setHeader('Content-Type', 'application/javascript');
            }
            if (filePath.endsWith('.js')) {
                res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
            }
            if (filePath.endsWith('.wasm')) {
                res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
            }
        }
    }));
    // SPA catch-all handler: for any request that doesn't match an API route or static file, send index.html
    app.get('*', (req, res, next) => {
        if (req.path.startsWith('/api')) {
            return next();
        }
        res.sendFile(path.join(distPath, 'index.html'));
    });
} else {
    if (!isTest) console.log('Frontend build (dist) not found. Serving from root directory.');
    app.use(express.static(rootPath, {
        setHeaders: (res, filePath) => {
            if (filePath.endsWith('.mjs')) {
                res.setHeader('Content-Type', 'text/javascript');
            }
            if (filePath.endsWith('.wasm')) {
                res.setHeader('Content-Type', 'application/wasm');
            }
            if (filePath.endsWith('.worker.js')) {
                res.setHeader('Content-Type', 'application/javascript');
            }
            if (filePath.endsWith('.js')) {
                res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
            }
            if (filePath.endsWith('.wasm')) {
                res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
            }
        }
    }));
    
    // SPA catch-all handler for root fallback
    app.get('*', (req, res, next) => {
        if (req.path.startsWith('/api')) {
            return next();
        }
        const indexPath = path.join(rootPath, 'index.html');
        if (fs.existsSync(indexPath)) {
            res.sendFile(indexPath);
        } else {
            if (!isTest) {
                console.error('CRITICAL ERROR: Could not find frontend build (dist/index.html).');
                console.error('Searched in:', potentialDistPaths);
            }
            res.status(404).send(`
                <h1>404 Not Found</h1>
                <p>Frontend build files not found on server.</p>
                <p>Please check server logs for searched paths.</p>
                <p>Searched paths: ${potentialDistPaths.join(', ')}</p>
            `);
        }
    });
}

// Health check endpoint (no rate limiting for monitoring)
const redis = require('./config/redis');

app.get('/api/health', (req, res) => {
    res.json({
        code: 200,
        status: 'ok',
        message: 'Service is healthy',
        timestamp: new Date().toISOString()
    });
});

// Redis health check endpoint
app.get('/api/health/redis', async (req, res) => {
    const redisStatus = redis.getStatus();
    let pingResult = null;
    
    if (redisStatus.available) {
        try {
            const pingStart = Date.now();
            pingResult = await redis.get('ping_test_key');
            const pingLatency = Date.now() - pingStart;
            res.json({
                code: 200,
                status: 'ok',
                message: 'Redis is connected and operational',
                redis: redisStatus,
                pingLatency: `${pingLatency}ms`,
                timestamp: new Date().toISOString()
            });
        } catch (err) {
            res.json({
                code: 503,
                status: 'error',
                message: 'Redis connection test failed: ' + err.message,
                redis: redisStatus,
                timestamp: new Date().toISOString()
            });
        }
    } else {
        res.json({
            code: 503,
            status: 'error',
            message: 'Redis is not available',
            redis: redisStatus,
            timestamp: new Date().toISOString()
        });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    if (!isTest) {
        console.error(err.stack);
    }
    res.status(500).json({
        code: 500,
        message: '服务器内部错误',
        error: err.message
    });
});

// Start server
if (require.main === module) {
    const server = http.createServer(app);
    initShareCollabServer(server, shareManager);
    server.listen(port, () => {
        console.log(`Server is running on port ${port}`);
    });
}

module.exports = app;
