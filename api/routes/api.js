const express = require('express');
const router = express.Router();
const userModel = require('../models/User');
const apiManager = require('../models/ApiManager');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

// Multer for screenshots
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const dir = path.join(__dirname, '../../screenshots');
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        cb(null, dir);
    },
    filename: function (req, file, cb) {
        // Fix for non-ASCII filenames
        file.originalname = Buffer.from(file.originalname, 'latin1').toString('utf8');
        const ext = path.extname(file.originalname);
        const username = req.body.username || 'unknown';
        cb(null, `${username}_${Date.now()}_${path.basename(file.originalname, ext)}${ext}`);
    }
});

// Multer for general uploads
const generalStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        const dir = path.join(__dirname, '../../uploads');
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        cb(null, dir);
    },
    filename: function (req, file, cb) {
        // Fix for non-ASCII filenames
        file.originalname = Buffer.from(file.originalname, 'latin1').toString('utf8');
        const ext = path.extname(file.originalname);
        cb(null, `${Date.now()}_${path.basename(file.originalname, ext)}${ext}`);
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

// Check update
router.post('/check_update', async (req, res) => {
    const { current_version } = req.body;
    if (!current_version) return res.json({ code: 400, message: '缺少必要参数' });
    res.json(await userModel.checkUpdate(current_version));
});

// Upload screenshot
router.post('/upload_screenshot', upload.single('screenshot'), async (req, res) => {
    // ... existing code ...
    const { username, password } = req.body;
    if (!username || !password) {
        // Clean up
        if (req.file) fs.unlinkSync(req.file.path);
        return res.json({ code: 400, message: '缺少必要参数' });
    }

    const auth = await userModel.login(username, password);
    if (auth.code !== 200) {
        if (req.file) fs.unlinkSync(req.file.path);
        return res.json({ code: 401, message: '用户身份验证失败' });
    }

    if (!req.file) return res.json({ code: 400, message: '缺少截图文件' });

    // Generate thumbnail for screenshot
    let thumbUrl = null;
    try {
        const screenshotDir = path.join(__dirname, '../../screenshots');
        const thumbFilename = 'thumb_' + req.file.filename;
        const thumbPath = path.join(screenshotDir, thumbFilename);
        
        await sharp(req.file.path)
            .resize(200, 200, {
                fit: 'contain',
                background: { r: 255, g: 255, b: 255, alpha: 0 }
            })
            .toFile(thumbPath);
        
        thumbUrl = `${userModel.baseUrl}/screenshots/${thumbFilename}`;
    } catch (err) {
        console.error('Failed to generate thumbnail for screenshot:', err);
    }

    const fileUrl = `${userModel.baseUrl}/screenshots/${req.file.filename}`;
    
    res.json({
        code: 200,
        message: '截图上传成功',
        data: {
            file_name: req.file.filename,
            file_path: '/screenshots/' + req.file.filename,
            file_url: fileUrl,
            thumb_url: thumbUrl || fileUrl,
            file_size: req.file.size
        }
    });
});

// General upload
router.post('/upload', generalUpload.array('files[]'), async (req, res) => {
    if (!req.files || req.files.length === 0) {
        return res.json({ success: false, message: '没有上传文件' });
    }

    let urlPrefix = 'uploads';
    const { username, password } = req.body;

    // Check if user is authenticated
    if (username && password) {
        const auth = await userModel.login(username, password);
        if (auth.code === 200) {
            const targetDirName = path.join('user_files', username);
            urlPrefix = `user_files/${username}`;
            
            // Create user directory if not exists
            const fullTargetDir = path.join(__dirname, '../../', targetDirName);
            if (!fs.existsSync(fullTargetDir)) {
                fs.mkdirSync(fullTargetDir, { recursive: true });
            }

            // Move files
            for (const file of req.files) {
                const oldPath = file.path;
                const newPath = path.join(fullTargetDir, file.filename);
                // Check if file exists in destination (edge case with same name)
                // Since filename includes timestamp, collision is unlikely but possible
                fs.renameSync(oldPath, newPath);
                
                // Generate thumbnail if it's an image
                if (file.mimetype.startsWith('image/')) {
                    try {
                        const thumbPath = path.join(fullTargetDir, 'thumb_' + file.filename);
                        await sharp(newPath)
                            .resize(200, 200, {
                                fit: 'contain',
                                background: { r: 255, g: 255, b: 255, alpha: 0 }
                            })
                            .toFile(thumbPath);
                    } catch (err) {
                        console.error('Failed to generate thumbnail for:', file.filename, err);
                    }
                }
            }
        }
    }

    const fileInfos = req.files.map(file => {
        const fileUrl = `${userModel.baseUrl}/${urlPrefix}/${file.filename}`;
        const thumbFilename = 'thumb_' + file.filename;
        const thumbUrl = `${userModel.baseUrl}/${urlPrefix}/${thumbFilename}`;
        return {
            url: fileUrl,
            thumb_url: thumbUrl,
            filename: file.filename
        };
    });

    res.json({
        success: true,
        count: req.files.length,
        urls: fileInfos.map(f => f.url),
        thumbs: fileInfos.map(f => f.thumb_url),
        files: fileInfos
    });
});

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
