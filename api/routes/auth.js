const express = require('express');
const router = express.Router();
const userModel = require('../models/User');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Multer setup for avatar
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const dir = path.join(__dirname, '../../avatars');
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        cb(null, dir);
    },
    filename: function (req, file, cb) {
        const ext = path.extname(file.originalname);
        const username = req.body.username || 'unknown';
        cb(null, `${username}_${Date.now()}${ext}`);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: function (req, file, cb) {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (!allowedTypes.includes(file.mimetype)) {
            return cb(new Error('不支持的文件类型'));
        }
        cb(null, true);
    }
});

// Register
router.post('/register', async (req, res) => {
    const { username, password, invite_code } = req.body;
    if (!username || !password) {
        return res.json({ code: 400, message: '缺少必要参数' });
    }
    const result = await userModel.register(username, password, invite_code);
    res.json(result);
});

// Login
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.json({ code: 400, message: '缺少必要参数' });
    }
    const result = await userModel.login(username, password);
    res.json(result);
});

// Check Member
router.post('/check_member', async (req, res) => {
    const { username } = req.body;
    if (!username) {
        return res.json({ code: 400, message: '缺少必要参数' });
    }
    const result = await userModel.checkMemberStatus(username);
    res.json(result);
});

// Activate Member
router.post('/activate_member', async (req, res) => {
    const { username, code } = req.body;
    if (!username || !code) {
        return res.json({ code: 400, message: '缺少必要参数' });
    }
    const result = await userModel.activateMember(username, code);
    res.json(result);
});

// Upload Avatar
router.post('/upload_avatar', upload.single('avatar'), async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.json({ code: 400, message: '缺少必要参数' });
    }
    
    // Authenticate
    const auth = await userModel.login(username, password);
    if (auth.code !== 200) {
        return res.json({ code: 401, message: '用户身份验证失败' });
    }

    if (!req.file) {
        return res.json({ code: 400, message: '缺少头像文件' });
    }

    const result = await userModel.uploadAvatar(username, req.file);
    res.json(result);
});

// Get Avatar
router.post('/get_avatar', async (req, res) => {
    const { username } = req.body;
    if (!username) {
        return res.json({ code: 400, message: '缺少必要参数' });
    }
    const result = await userModel.getAvatar(username);
    res.json(result);
});

module.exports = router;
