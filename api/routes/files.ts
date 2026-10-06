const { getFileOrders, setFileOrders } = require('../models/FileOrders');
const { normalizeOrders } = require('../../shared/file-orders');
const { getLocalOrigins, setLocalOrigin, clearLocalOrigin } = require('../models/LocalOrigins');
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

router.get('/local-origins', verifyUser, async (req, res) => {
    try { res.json({ code: 200, data: await getLocalOrigins(req.user.username) }); }
    catch { res.status(503).json({ code: 503, message: '本地来源元数据暂不可用' }); }
});
router.delete('/local-origin', verifyUser, async (req, res) => {
    if (typeof req.body.filename !== 'string' || !req.body.filename) return res.status(400).json({ code: 400 });
    try { await clearLocalOrigin(req.user.username, req.body.filename); res.json({ code: 200 }); }
    catch { res.status(503).json({ code: 503, message: '移除本地来源失败' }); }
});
router.post('/local-origin', verifyUser, async (req, res) => {
    const { filename, device_id } = req.body;
    if (typeof filename !== 'string' || !filename || filename.length > 255 || typeof device_id !== 'string' || !/^[a-zA-Z0-9-]{1,64}$/.test(device_id)) return res.status(400).json({ code: 400, message: '无效的文件来源' });
    try { await setLocalOrigin(req.user.username, filename, device_id); res.json({ code: 200 }); }
    catch { res.status(503).json({ code: 503, message: '本地来源元数据保存失败' }); }
});

// Sort metadata is separate from document saves, versions, encryption and text conflicts.
router.get('/orders', verifyUser, async (req, res) => {
    try {res.json({code:200, data:await getFileOrders(req.user.username)});}
    catch {res.status(503).json({code:503, message:'排序元数据暂不可用'});}
});
router.post('/orders', verifyUser, async (req, res) => {
    const input = req.body.orders;
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length > 10000 || Object.keys(normalizeOrders(input)).length !== Object.keys(input).length) {
        return res.status(400).json({code:400, message:'无效的排序数据'});
    }
    try {await setFileOrders(req.user.username, input);res.json({code:200});}
    catch {res.status(503).json({code:503, message:'排序元数据保存失败'});}
});

// Get single file
router.get('/content', verifyUser, async (req, res) => {
    const { username, filename } = req.query;
    if (!username || !filename) return res.json({ code: 400, message: '缺少必要参数' });
    res.json(await fileManager.getFileContent(username, filename));
});

// Save file
router.post('/save', verifyUser, async (req, res) => {
    const { username, filename, content, create_history, base_last_modified, base_hash, base_content_version, base_content, e2e_enabled, conflict_strategy } = req.body;
    if (!username || !filename) return res.json({ code: 400, message: '缺少必要参数' });
    
    const shouldCreateHistory = create_history === 'true' || create_history === true;
    const result = await fileManager.saveFileWithHistory(
        username,
        filename,
        content,
        shouldCreateHistory,
        { base_last_modified, base_hash, base_content_version, base_content },
        { e2e_enabled, conflict_strategy: conflict_strategy === 'strict' ? 'strict' : undefined }
    );

    if (result.code === 409) {
        return res.status(409).json(result);
    }

    if (result.code === 200 && result.data) {
        const { broadcastToUser } = require('../realtime/fileSyncServer');
        broadcastToUser(req.user.username, { type: 'file_updated', filename, ...result.data });
    }
    res.json(result);
});

// Delete file
router.post('/move', verifyUser, async (req, res) => {
    const { old_path, new_path, is_folder } = req.body;
    try {
        const result = await fileManager.moveFile(req.user.username, old_path, new_path, is_folder === true);
        res.status(result.code).json(result);
    } catch (error) {
        res.status(500).json({ code: 500, message: '移动失败: ' + error.message });
    }
});

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
