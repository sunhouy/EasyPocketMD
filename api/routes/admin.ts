const express = require('express');
const router = express.Router();
const userModel = require('../models/User');
const apiManager = require('../models/ApiManager');

// Middleware to verify admin
const verifyAdmin = (req, res, next) => {
    const { username, password } = req.body;
    if (username !== userModel.adminConfig.username || password !== userModel.adminConfig.password) {
        return res.json({ code: 401, message: '管理员身份验证失败' });
    }
    next();
};

// Admin login
router.post('/login', verifyAdmin, async (req, res) => {
    res.json({ code: 200, message: '管理员登录成功' });
});

// Get users
router.post('/users', verifyAdmin, async (req, res) => {
    res.json(await userModel.getAllUsers());
});

// Add auth code
router.post('/auth_code', verifyAdmin, async (req, res) => {
    const { code, member_days } = req.body;
    const { username, password } = req.body; // Needed for model method call args
    if (!code || !member_days) return res.json({ code: 400, message: '缺少必要参数' });
    res.json(await userModel.addAuthorizationCode(username, password, code, member_days));
});

// Submit update
router.post('/update', verifyAdmin, async (req, res) => {
    const { username, password, latest_version, update_content, download_url, min_version } = req.body;
    if (!latest_version || !update_content || !download_url || !min_version) return res.json({ code: 400, message: '缺少必要参数' });
    res.json(await userModel.submitUpdate(username, password, latest_version, update_content, download_url, min_version));
});

// Add product
router.post('/products', verifyAdmin, async (req, res) => {
    const { product, base_url, api_key } = req.body;
    if (!product || !base_url || !api_key) return res.json({ code: 400, message: '缺少必要参数' });
    if (apiManager.addProductInfo(product, base_url, api_key)) {
        res.json({ code: 200, message: '商品信息添加成功' });
    } else {
        res.json({ code: 500, message: '商品信息添加失败' });
    }
});

// Remove product
router.post('/products/remove', verifyAdmin, async (req, res) => {
    const { product, base_url, api_key } = req.body;
    if (!product || !base_url || !api_key) return res.json({ code: 400, message: '缺少必要参数' });
    if (apiManager.removeProduct(base_url, api_key, product)) {
        res.json({ code: 200, message: '商品移除成功' });
    } else {
        res.json({ code: 500, message: '商品移除失败' });
    }
});

// Delete API info
router.post('/api/delete', verifyAdmin, async (req, res) => {
    const { base_url, api_key } = req.body;
    if (!base_url || !api_key) return res.json({ code: 400, message: '缺少必要参数' });
    if (apiManager.deleteApiInfo(base_url, api_key)) {
        res.json({ code: 200, message: 'API信息删除成功' });
    } else {
        res.json({ code: 500, message: 'API信息删除失败' });
    }
});

// Get all API info
router.post('/api/list', verifyAdmin, async (req, res) => {
    res.json({ code: 200, message: '获取API信息成功', data: apiManager.getAllApiInfo() });
});

module.exports = router;
