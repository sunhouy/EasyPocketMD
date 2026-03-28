const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') }); // Load environment variables

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
    console.log('Serving static files from:');
    console.log('- Uploads:', uploadsPath);
    console.log('- Avatars:', avatarsPath);
    console.log('- Screenshots:', screenshotsPath);
    console.log('- User Files:', userFilesPath);
}

app.use('/uploads', express.static(uploadsPath));
app.use('/avatars', express.static(avatarsPath));
app.use('/screenshots', express.static(screenshotsPath));
app.use('/user_files', express.static(userFilesPath));

// Serve static files from node_modules for Vditor
app.use('/vditor', express.static(path.join(__dirname, '../node_modules/vditor/dist')));
// Serve Font Awesome from node_modules
app.use('/fa', express.static(path.join(__dirname, '../node_modules/@fortawesome/fontawesome-free')));

if (!isTest) {
    console.log('Server starting...');
    console.log('Current directory (__dirname):', __dirname);
    console.log('Current working directory (process.cwd()):', process.cwd());
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
app.get('/icon-192.png', (req, res) => {
    res.type('image/png');
    res.sendFile(path.join(rootPath, 'icon-192.png'));
});
app.get('/icon-512.png', (req, res) => {
    res.type('image/png');
    res.sendFile(path.join(rootPath, 'icon-512.png'));
});

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
    app.use(express.static(distPath));
    // SPA catch-all handler: for any request that doesn't match an API route or static file, send index.html
    app.get('*', (req, res, next) => {
        if (req.path.startsWith('/api')) {
            return next();
        }
        res.sendFile(path.join(distPath, 'index.html'));
    });
} else {
    // Fallback to serving root for development (though Vite is recommended)
    // Note: Root index.html now uses modules, so it won't work directly without Vite
    if (!isTest) console.log('Frontend build (dist) not found. Serving from root directory.');
    app.use(express.static(rootPath));
    
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

// Import routes
const legacyRoutes = require('./routes/legacy');
const authRoutes = require('./routes/auth');
const fileRoutes = require('./routes/files');
const shareRoutes = require('./routes/share');
const adminRoutes = require('./routes/admin');
const apiRoutes = require('./routes/api');
const convertRoutes = require('./routes/convert');
const aiRoutes = require('./routes/ai');
const userFilesRoutes = require('./routes/user_files');

// Use routes with rate limiting
// AI routes - strict rate limiting (especially for unauthenticated users)
app.use('/api/ai', aiLimiter, aiRoutes);

// Auth routes - prevent brute force attacks
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', registerLimiter);
app.use('/api/auth', authRoutes);

// File routes - rate limiting based on auth status
app.use('/api/files', fileLimiter, fileRoutes);
app.use('/api/user_files', fileLimiter, userFilesRoutes);

// Upload routes - strict rate limiting
app.use('/api/upload_screenshot', uploadLimiter);
app.use('/api/upload', uploadLimiter);

// Share routes
app.use('/api/share', apiLimiter, shareRoutes);

// Admin routes - strict rate limiting
app.use('/api/admin', strictLimiter, adminRoutes);

// External API routes
app.use('/api/external', apiLimiter, apiRoutes);

// Convert routes - rate limiting for export functions
app.use('/api/convert', convertLimiter, convertRoutes);

// Legacy routes - general API rate limiting
app.use('/api', apiLimiter, legacyRoutes);

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
    app.listen(port, () => {
        console.log(`Server is running on port ${port}`);
    });
}

module.exports = app;
