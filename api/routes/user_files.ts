const express = require('express');
const router = express.Router();
const userModel = require('../models/User');
const fs = require('fs');
const path = require('path');

// Middleware to check auth
const checkAuth = async (req, res, next) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.json({ code: 400, message: '缺少认证信息' });
    }
    const auth = await userModel.login(username, password);
    if (auth.code !== 200) {
        return res.json({ code: 401, message: '认证失败' });
    }
    req.user = { username };
    next();
};

// List files
router.post('/list', checkAuth, (req, res) => {
    const username = req.user.username;
    const userDir = path.join(__dirname, '../../user_files', username);

    if (!fs.existsSync(userDir)) {
        return res.json({ code: 200, data: [], totalSize: 0 });
    }

    try {
        const files = fs.readdirSync(userDir);
        const fileList = [];
        let totalSize = 0;

        files.forEach(file => {
            const filePath = path.join(userDir, file);
            try {
                const stats = fs.statSync(filePath);
                if (stats.isFile() && !file.startsWith('thumb_')) {
                    totalSize += stats.size;
                    const thumbName = 'thumb_' + file;
                    const thumbPath = path.join(userDir, thumbName);
                    let url = `${userModel.baseUrl}/user_files/${username}/${file}`;
                    let thumbUrl = url;

                    if (fs.existsSync(thumbPath)) {
                        thumbUrl = `${userModel.baseUrl}/user_files/${username}/${thumbName}`;
                    }

                    fileList.push({
                        name: file,
                        size: stats.size,
                        mtime: stats.mtime,
                        url: url,
                        thumbUrl: thumbUrl
                    });
                }
            } catch (e) {
                // Ignore errors for individual files
            }
        });

        // Sort by time desc
        fileList.sort((a, b) => b.mtime - a.mtime);

        res.json({
            code: 200,
            data: fileList,
            totalSize: totalSize
        });
    } catch (err) {
        console.error('List files error:', err);
        res.json({ code: 500, message: '获取文件列表失败' });
    }
});

// Delete file
router.post('/delete', checkAuth, (req, res) => {
    const username = req.user.username;
    const { filename } = req.body;
    
    if (!filename) {
        return res.json({ code: 400, message: '缺少文件名' });
    }

    // Security check: prevent directory traversal
    const safeFilename = path.basename(filename);
    const filePath = path.join(__dirname, '../../user_files', username, safeFilename);

    if (fs.existsSync(filePath)) {
        try {
            fs.unlinkSync(filePath);
            
            // Try delete thumbnail
            const thumbPath = path.join(__dirname, '../../user_files', username, 'thumb_' + safeFilename);
            if (fs.existsSync(thumbPath)) {
                try { fs.unlinkSync(thumbPath); } catch (e) {}
            }

            res.json({ code: 200, message: '删除成功' });
        } catch (err) {
            res.json({ code: 500, message: '删除失败' });
        }
    } else {
        res.json({ code: 404, message: '文件不存在' });
    }
});

module.exports = router;