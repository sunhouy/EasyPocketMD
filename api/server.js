const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static files for uploads
// Note: __dirname is api/, so we need to go up one level to root
const uploadsPath = path.join(__dirname, '../uploads');
const avatarsPath = path.join(__dirname, '../avatars');
const screenshotsPath = path.join(__dirname, '../screenshots');

console.log('Serving static files from:');
console.log('- Uploads:', uploadsPath);
console.log('- Avatars:', avatarsPath);
console.log('- Screenshots:', screenshotsPath);

app.use('/uploads', express.static(uploadsPath));
app.use('/avatars', express.static(avatarsPath));
app.use('/screenshots', express.static(screenshotsPath));

// Serve static files from node_modules for Vditor
app.use('/vditor', express.static(path.join(__dirname, '../node_modules/vditor/dist')));
// Serve Font Awesome from node_modules
app.use('/fa', express.static(path.join(__dirname, '../node_modules/@fortawesome/fontawesome-free')));

// Serve frontend static files
// If dist folder exists (production build), serve it
console.log('Server starting...');
console.log('Current directory (__dirname):', __dirname);
console.log('Current working directory (process.cwd()):', process.cwd());

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
    console.log(`Checking for frontend build at: ${p}`);
    if (fs.existsSync(p) && fs.existsSync(indexHtmlPath)) {
        console.log(`Found valid frontend build at: ${p}`);
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
    console.log('Frontend build (dist) not found. Serving from root directory.');
    const rootPath = path.join(__dirname, '../');
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
            console.error('CRITICAL ERROR: Could not find frontend build (dist/index.html).');
            console.error('Searched in:', potentialDistPaths);
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

// Use routes
app.use('/api', legacyRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/share', shareRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/external', apiRoutes);
app.use('/api/convert', convertRoutes);
app.use('/api/ai', aiRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
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
