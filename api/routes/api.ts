const express = require('express');
const router = express.Router();
const userModel = require('../models/User');
const apiManager = require('../models/ApiManager');
const { verifyTokenOrPassword } = require('../utils/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const {
    convertFileToMarkdown,
    isSupportedImportFile,
    SUPPORTED_EXTENSIONS
} = require('../utils/markitdownImporter');

const PROJECT_ROOT = path.join(__dirname, '../..');

function ensureDir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function decodeOriginalName(originalname) {
    if (!originalname) return 'file';
    const decoded = Buffer.from(originalname, 'latin1').toString('utf8');
    return decoded.includes('�') ? originalname : decoded;
}

function safeFileName(originalname, fallbackExt) {
    const decoded = decodeOriginalName(originalname);
    const ext = path.extname(decoded) || fallbackExt || '';
    const base = path.basename(decoded, ext)
        .replace(/[\\/:*?"<>|]/g, '_')
        .replace(/\s+/g, '_')
        .replace(/^\.+$/, '')
        .slice(0, 120) || 'file';
    return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${base}${ext}`;
}

function getRequestBaseUrl(req) {
    if (process.env.BASE_URL) {
        return userModel.baseUrl;
    }

    const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
    const forwardedHost = String(req.headers['x-forwarded-host'] || '').split(',')[0].trim();
    const proto = forwardedProto || req.protocol || 'http';
    const host = forwardedHost || req.get('host');

    if (host) {
        return `${proto}://${host}`.replace(/\/$/, '');
    }

    return userModel.baseUrl;
}

function buildPublicUrl(req, publicPath) {
    return `${getRequestBaseUrl(req)}/${publicPath.split('/').map(encodeURIComponent).join('/')}`;
}

function getBearerToken(req) {
    const authHeader = req.headers.authorization || '';
    return authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
}

async function verifyUploadUser(req) {
    const username = req.body && req.body.username;
    if (!username) return null;

    const auth = await verifyTokenOrPassword(userModel, {
        username,
        password: req.body.password,
        token: req.body.token || getBearerToken(req)
    });

    return auth.code === 200 ? { username } : null;
}

function collectUploadedFiles(req) {
    if (Array.isArray(req.files)) return req.files;
    if (!req.files || typeof req.files !== 'object') return [];
    return Object.keys(req.files).reduce((all, key) => all.concat(req.files[key] || []), []);
}

function cleanupFile(file) {
    if (file && file.path && fs.existsSync(file.path)) {
        try {
            fs.unlinkSync(file.path);
        } catch (err) {
            if (err && err.code === 'ENOENT') return;
            console.error('Failed to clean up uploaded file:', file.path, err);
        }
    }
}

function multerJson(middleware, handler) {
    return function(req, res, next) {
        middleware(req, res, function(err) {
            if (err) {
                const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
                return res.status(status).json({
                    code: status,
                    success: false,
                    message: err.message || '上传失败'
                });
            }
            return handler(req, res, next);
        });
    };
}

// Multer for screenshots
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const dir = path.join(PROJECT_ROOT, 'screenshots');
        ensureDir(dir);
        cb(null, dir);
    },
    filename: function (req, file, cb) {
        const username = (req.body.username || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_');
        cb(null, `${username}_${safeFileName(file.originalname, '.png')}`);
    }
});

// Multer for general uploads
const generalStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        const dir = path.join(PROJECT_ROOT, 'uploads');
        ensureDir(dir);
        cb(null, dir);
    },
    filename: function (req, file, cb) {
        cb(null, safeFileName(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: function (req, file, cb) {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (!allowedTypes.includes(file.mimetype)) {
            return cb(new Error('不支持的文件类型'));
        }
        cb(null, true);
    }
});

const generalUpload = multer({
    storage: generalStorage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
    // Allow more types for general upload
});

const generalUploadMiddleware = generalUpload.fields([
    { name: 'files[]', maxCount: 50 },
    { name: 'files', maxCount: 50 },
    { name: 'file', maxCount: 50 },
    { name: 'image', maxCount: 50 },
    { name: 'upload', maxCount: 50 }
]);

const importStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        const dir = path.join(PROJECT_ROOT, 'temp_imports');
        ensureDir(dir);
        cb(null, dir);
    },
    filename: function (req, file, cb) {
        cb(null, safeFileName(file.originalname));
    }
});

const importUpload = multer({
    storage: importStorage,
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: function (req, file, cb) {
        if (!isSupportedImportFile(decodeOriginalName(file.originalname))) {
            return cb(new Error('不支持的导入文件类型，支持 PDF、Word、Excel、PowerPoint'));
        }
        cb(null, true);
    }
});

// Check update
router.post('/check_update', async (req, res) => {
    const { current_version } = req.body;
    if (!current_version) return res.json({ code: 400, message: '缺少必要参数' });
    res.json(await userModel.checkUpdate(current_version));
});

async function handleScreenshotUpload(req, res) {
    try {
        if (!req.file) return res.json({ code: 400, message: '缺少截图文件' });

        const user = await verifyUploadUser(req);
        if (!user) {
            cleanupFile(req.file);
            return res.json({ code: 401, message: '用户身份验证失败' });
        }

        const publicPath = `screenshots/${req.file.filename}`;
        const fileUrl = buildPublicUrl(req, publicPath);

        res.json({
            code: 200,
            message: '截图上传成功',
            data: {
                file_name: req.file.filename,
                file_path: '/' + publicPath,
                file_url: fileUrl,
                file_size: req.file.size
            }
        });
    } catch (error) {
        console.error('Screenshot upload error:', error);
        // Clean up on error
        if (req.file && fs.existsSync(req.file.path)) {
            try {
                fs.unlinkSync(req.file.path);
            } catch (e) {
                // Ignore cleanup errors
            }
        }
        res.status(500).json({
            code: 500,
            message: '服务器内部错误: ' + error.message
        });
    }
}

// Upload screenshot
router.post('/upload_screenshot', multerJson(upload.single('screenshot'), handleScreenshotUpload));

async function handleDocumentImport(req, res) {
    try {
        if (!req.file) {
            return res.json({ code: 400, message: '缺少导入文件' });
        }

        const originalName = decodeOriginalName(req.file.originalname);
        if (!isSupportedImportFile(originalName)) {
            return res.json({
                code: 400,
                message: `不支持的导入文件类型，支持: ${Array.from(SUPPORTED_EXTENSIONS).join(', ')}`
            });
        }

        const result = await convertFileToMarkdown(req.file.path, { originalName });

        res.json({
            code: 200,
            message: '导入转换成功',
            data: {
                name: originalName,
                markdown: result.markdown,
                size: req.file.size,
                mime_type: req.file.mimetype
            }
        });
    } catch (error) {
        console.error('Document import error:', error);
        const status = error.code === 'DEPENDENCY_MISSING' || error.code === 'PYTHON_NOT_FOUND' ? 503 : 500;
        res.status(status).json({
            code: status,
            message: error.message || '导入转换失败'
        });
    } finally {
        cleanupFile(req.file);
    }
}

// Convert PDF / Office documents to Markdown using the backend MarkItDown pipeline.
router.post('/import/markitdown', multerJson(importUpload.single('file'), handleDocumentImport));
router.post('/files/import', multerJson(importUpload.single('file'), handleDocumentImport));

async function handleGeneralUpload(req, res) {
    try {
        const files = collectUploadedFiles(req);
        if (files.length === 0) {
            return res.json({ code: 400, success: false, message: '没有上传文件' });
        }

        const user = await verifyUploadUser(req);
        const uploadedFiles = [];

        for (const file of files) {
            let publicPath = `uploads/${file.filename}`;

            if (user) {
                const userDir = path.join(PROJECT_ROOT, 'user_files', user.username);
                const targetPath = path.join(userDir, file.filename);

                try {
                    ensureDir(userDir);
                    try {
                        fs.renameSync(file.path, targetPath);
                    } catch (renameErr) {
                        fs.copyFileSync(file.path, targetPath);
                        fs.unlinkSync(file.path);
                    }

                    file.path = targetPath;
                    publicPath = `user_files/${user.username}/${file.filename}`;

                    if (file.mimetype && file.mimetype.startsWith('image/')) {
                        try {
                            const thumbPath = path.join(userDir, 'thumb_' + file.filename);
                            await sharp(targetPath)
                                .resize(200, 200, {
                                    fit: 'contain',
                                    background: { r: 255, g: 255, b: 255, alpha: 0 }
                                })
                                .toFile(thumbPath);
                        } catch (err) {
                            console.error('Failed to generate thumbnail for:', file.filename, err);
                        }
                    }
                } catch (fileErr) {
                    console.error('Failed to move uploaded file to user directory:', file.filename, fileErr);
                }
            }

            uploadedFiles.push({
                name: decodeOriginalName(file.originalname),
                filename: file.filename,
                size: file.size,
                mime_type: file.mimetype,
                path: '/' + publicPath,
                url: buildPublicUrl(req, publicPath)
            });
        }

        const urls = uploadedFiles.map(file => file.url);

        res.json({
            code: 200,
            message: '上传成功',
            success: true,
            count: uploadedFiles.length,
            urls: urls,
            data: {
                count: uploadedFiles.length,
                urls: urls,
                files: uploadedFiles
            }
        });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({
            code: 500,
            success: false,
            message: '服务器内部错误: ' + error.message
        });
    }
}

// General upload. /files/upload keeps compatibility with clients documented against /api/files/upload.
router.post('/upload', multerJson(generalUploadMiddleware, handleGeneralUpload));
router.post('/files/upload', multerJson(generalUploadMiddleware, handleGeneralUpload));

// Get available products
router.post('/products/available', async (req, res) => {
    const { username, password } = req.body;
    const auth = await userModel.login(username, password);
    if (auth.code !== 200) return res.json({ code: 401, message: '用户身份验证失败' });
    res.json({ code: 200, message: '获取可用商品成功', data: { products: apiManager.getAllProducts() } });
});

// Get product config
router.post('/products/config', async (req, res) => {
    const { username, password, product } = req.body;
    const auth = await userModel.login(username, password);
    if (auth.code !== 200) return res.json({ code: 401, message: '用户身份验证失败' });
    if (!product) return res.json({ code: 400, message: '缺少必要参数' });
    
    const config = apiManager.getProductConfig(product);
    if (config) {
        res.json({ code: 200, message: '获取商品配置成功', data: config });
    } else {
        res.json({ code: 404, message: '商品配置不存在' });
    }
});

// Search products
router.post('/products/search', async (req, res) => {
    const { username, password, keyword } = req.body;
    const auth = await userModel.login(username, password);
    if (auth.code !== 200) return res.json({ code: 401, message: '用户身份验证失败' });
    if (!keyword) return res.json({ code: 400, message: '缺少搜索关键词' });
    
    const matched = apiManager.searchProducts(keyword);
    res.json({
        code: 200,
        message: '商品搜索成功',
        data: {
            keyword,
            products: matched,
            total: matched.length
        }
    });
});

module.exports = router;
