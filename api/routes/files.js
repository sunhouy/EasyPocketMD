const express = require('express');
const router = express.Router();
const fileManager = require('../models/FileManager');
const historyManager = require('../models/HistoryManager');
const userModel = require('../models/User'); // For verification
const { verifyTokenOrPassword } = require('../utils/auth');

// Middleware to verify user
const verifyUser = async (req, res, next) => {
    // Check query or body or headers
    const token = req.headers.authorization ? req.headers.authorization.split(' ')[1] : null;
    const data = { ...req.query, ...req.body };
    if (token) data.token = token;
    
    const result = await verifyTokenOrPassword(userModel, data);
    if (result.code !== 200) {
        return res.json(result);
    }
    // Set user info to req.user
    // verifyTokenOrPassword now uses JWT verification, which validates token signature and username match
    // If code is 200, we trust data.username.
    req.user = { id: data.username, username: data.username };
    next();
};

// Get files
router.get('/', verifyUser, async (req, res) => {
    const { username } = req.query;
    if (!username) return res.json({ code: 400, message: '缺少必要参数: username' });
    res.json(await fileManager.getUserFiles(username));
});

// Get single file
router.get('/content', verifyUser, async (req, res) => {
    const { username, filename } = req.query;
    if (!username || !filename) return res.json({ code: 400, message: '缺少必要参数' });
    res.json(await fileManager.getFileContent(username, filename));
});

// Save file
router.post('/save', verifyUser, async (req, res) => {
    const { username, filename, content, create_history, base_last_modified, base_hash } = req.body;
    if (!username || !filename) return res.json({ code: 400, message: '缺少必要参数' });
    
    const shouldCreateHistory = create_history === 'true' || create_history === true;
    const result = await fileManager.saveFileWithHistory(
        username,
        filename,
        content,
        shouldCreateHistory,
        { base_last_modified, base_hash }
    );

    if (result.code === 409) {
        return res.status(409).json(result);
    }

    res.json(result);
});

// Delete file
router.post('/delete', verifyUser, async (req, res) => {
    const { username, filename } = req.body;
    if (!username || !filename) return res.json({ code: 400, message: '缺少必要参数' });
    res.json(await fileManager.deleteFile(username, filename));
});

// Sync files
router.post('/sync', verifyUser, async (req, res) => {
    const { username, files } = req.body;
    if (!username || !files) return res.json({ code: 400, message: '缺少必要参数' });
    
    let filesData = files;
    if (typeof files === 'string') {
        try {
            filesData = JSON.parse(files);
        } catch (e) {
            return res.json({ code: 400, message: 'files 参数格式错误' });
        }
    }
    res.json(await fileManager.syncFiles(username, filesData));
});

// Create history
router.post('/history/create', verifyUser, async (req, res) => {
    const { username, filename, content } = req.body;
    if (!username || !filename || !content) return res.json({ code: 400, message: '缺少必要参数' });
    res.json(await historyManager.createHistory(username, filename, content));
});

// Get history list
router.get('/history/list', verifyUser, async (req, res) => {
    const { username, filename } = req.query;
    // Also support POST for get_history as per legacy? No, REST should use GET usually, but let's stick to GET for list.
    // Legacy supported both.
    if (!username || !filename) return res.json({ code: 400, message: '缺少必要参数' });
    res.json(await historyManager.getHistoryList(username, filename));
});

// Restore history
router.post('/history/restore', verifyUser, async (req, res) => {
    const { username, filename, version_id } = req.body;
    if (!username || !filename || !version_id) return res.json({ code: 400, message: '缺少必要参数' });
    res.json(await historyManager.restoreHistory(username, filename, version_id));
});

// Delete history
router.post('/history/delete', verifyUser, async (req, res) => {
    const { username, filename, version_id, version_ids } = req.body;
    if (!username || !filename) return res.json({ code: 400, message: '缺少必要参数' });

    // 支持批量删除
    if (version_ids && Array.isArray(version_ids) && version_ids.length > 0) {
        res.json(await historyManager.deleteHistoryBatch(username, filename, version_ids));
    } else {
        res.json(await historyManager.deleteHistory(username, filename, version_id));
    }
});

module.exports = router;
