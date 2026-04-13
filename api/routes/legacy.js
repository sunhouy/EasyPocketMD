const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const userModel = require('../models/User');
const fileManager = require('../models/FileManager');
const historyManager = require('../models/HistoryManager');
const shareManager = require('../models/ShareManager');
const apiManager = require('../models/ApiManager');
const { verifyTokenOrPassword } = require('../utils/auth');
const { generatePasswordForm, generateShareViewPage } = require('../utils/htmlGenerator');

const upload = multer({
    dest: path.join(__dirname, '../../temp_uploads'), // Temporary directory
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Helper to move file
const moveFile = (file, destPath) => {
    const dir = path.dirname(destPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    fs.renameSync(file.path, destPath);
};

router.all('/index.php', upload.any(), async (req, res) => {
    const method = req.method;
    const action = req.query.action || '';
    
    const data = { ...req.query, ...req.body };
    

    try {
        switch (action) {
            case 'login':
                if (method !== 'POST') throw new Error('请求方法错误');
                if (!data.username || !data.password) throw new Error('缺少必要参数');
                res.json(await userModel.login(data.username, data.password));
                break;

            case 'register':
                if (method !== 'POST') throw new Error('请求方法错误');
                if (!data.username || !data.password) throw new Error('缺少必要参数');
                res.json(await userModel.register(data.username, data.password, data.invite_code));
                break;

            case 'getfiles':
                if (method !== 'GET') throw new Error('请求方法错误，请使用GET方法');
                if (!data.username) throw new Error('缺少必要参数: username');
                res.json(await fileManager.getUserFiles(data.username));
                break;

            case 'getfile':
                if (method !== 'GET') throw new Error('请求方法错误，请使用GET方法');
                if (!data.username || !data.filename) throw new Error('缺少必要参数: username 或 filename');
                res.json(await fileManager.getFileContent(data.username, data.filename));
                break;

            case 'save':
                if (method !== 'POST') throw new Error('请求方法错误，请使用POST方法');
                if (!data.username || !data.filename) throw new Error('缺少必要参数: username 或 filename');
                
                var auth = await verifyTokenOrPassword(userModel, data);
                if (auth.code !== 200) {
                    res.json(auth);
                    break;
                }

                var createHistory = data.create_history === 'true' || data.create_history === true;
                var saveResult = await fileManager.saveFileWithHistory(data.username, data.filename, data.content, createHistory, {
                    base_last_modified: data.base_last_modified,
                    base_hash: data.base_hash,
                    base_content_version: data.base_content_version
                });
                if (saveResult && saveResult.code === 409) {
                    res.status(409).json(saveResult);
                    break;
                }
                res.json(saveResult);
                break;

            case 'delete':
                if (method !== 'POST') throw new Error('请求方法错误，请使用POST方法');
                if (!data.username || !data.filename) throw new Error('缺少必要参数: username 或 filename');

                var auth = await verifyTokenOrPassword(userModel, data);
                if (auth.code !== 200) {
                    res.json(auth);
                    break;
                }

                res.json(await fileManager.deleteFile(data.username, data.filename));
                break;

            case 'create_history':
                if (method !== 'POST') throw new Error('请求方法错误');
                if (!data.username || !data.filename || !data.content) throw new Error('缺少必要参数');

                var auth = await verifyTokenOrPassword(userModel, data);
                if (auth.code !== 200) {
                    res.json(auth);
                    break;
                }

                res.json(await historyManager.createHistory(data.username, data.filename, data.content));
                break;

            case 'get_history':
                if (!data.username || !data.filename) throw new Error('缺少必要参数');
                res.json(await historyManager.getHistoryList(data.username, data.filename));
                break;

            case 'restore_history':
                if (method !== 'POST') throw new Error('请求方法错误');
                if (!data.username || !data.filename || !data.version_id) throw new Error('缺少必要参数');

                var auth = await verifyTokenOrPassword(userModel, data);
                if (auth.code !== 200) {
                    res.json(auth);
                    break;
                }

                res.json(await historyManager.restoreHistory(data.username, data.filename, data.version_id));
                break;

            case 'delete_history':
                if (method !== 'POST') throw new Error('请求方法错误');
                if (!data.username || !data.filename) throw new Error('缺少必要参数');

                var auth = await verifyTokenOrPassword(userModel, data);
                if (auth.code !== 200) {
                    res.json(auth);
                    break;
                }

                res.json(await historyManager.deleteHistory(data.username, data.filename, data.version_id));
                break;

            case 'sync':
                if (method !== 'POST') throw new Error('请求方法错误');
                if (!data.username || !data.files) throw new Error('缺少必要参数');

                var auth = await verifyTokenOrPassword(userModel, data);
                if (auth.code !== 200) {
                    res.json(auth);
                    break;
                }

                // data.files might be JSON string if sent as form-data, or object if JSON body
                let files = data.files;
                if (typeof files === 'string') {
                    try {
                        files = JSON.parse(files);
                    } catch (e) {
                        throw new Error('files 参数格式错误');
                    }
                }

                res.json(await fileManager.syncFiles(data.username, files));
                break;

            case 'check_member':
                if (method !== 'POST') throw new Error('请求方法错误');
                if (!data.username) throw new Error('缺少必要参数');
                res.json(await userModel.checkMemberStatus(data.username));
                break;

            case 'admin_login':
                if (method !== 'POST') throw new Error('请求方法错误');
                if (!data.username || !data.password) throw new Error('缺少必要参数');
                res.json(await userModel.adminLogin(data.username, data.password));
                break;

            case 'create_share':
                if (method !== 'POST') throw new Error('请求方法错误');
                if (!data.username || !data.filename) throw new Error('缺少必要参数');
                
                var auth = await verifyTokenOrPassword(userModel, data);
                if (auth.code !== 200) {
                    res.json(auth);
                    break;
                }

                res.json(await shareManager.createShare(data.username, data.password, data.filename, data.mode, data.share_password, data.expire_days));
                break;

            case 'get_share':
                if (!data.share_id) throw new Error('缺少必要参数: share_id');
                res.json(await shareManager.getSharedFile(data.share_id, data.password));
                break;

            case 'view_share':
                if (method !== 'GET') throw new Error('请求方法错误');
                if (!data.share_id) throw new Error('缺少必要参数: share_id');
                
                var result = await shareManager.getSharedFile(data.share_id, data.password);
                
                if (result.code === 401) {
                    res.send(generatePasswordForm(data.share_id));
                } else if (result.code === 200) {
                    
                    const baseUrl = userModel.baseUrl || 'http://localhost:3000';
                    
                    let redirectUrl = `../../index.html?share_id=${encodeURIComponent(data.share_id)}`;
                    if (data.password) {
                        redirectUrl += `&share_password=${encodeURIComponent(data.password)}`;
                    }
                    res.redirect(redirectUrl);
                } else {
                    res.json(result);
                }
                break;

            case 'update_share':
                if (method !== 'POST') throw new Error('请求方法错误');
                if (!data.share_id || !data.content) throw new Error('缺少必要参数');
                res.json(await shareManager.updateSharedFile(data.share_id, data.content, data.password));
                break;

            case 'list_shares':
                if (!data.username) throw new Error('缺少必要参数: username');
                
                var auth = await verifyTokenOrPassword(userModel, data);
                if (auth.code !== 200) {
                    res.json(auth);
                    break;
                }

                res.json(await shareManager.getUserShares(data.username));
                break;

            case 'delete_share':
                if (method !== 'POST') throw new Error('请求方法错误');
                if (!data.username || !data.share_id) throw new Error('缺少必要参数');
                
                var auth = await verifyTokenOrPassword(userModel, data);
                if (auth.code !== 200) {
                    res.json(auth);
                    break;
                }

                res.json(await shareManager.deleteShare(data.username, data.share_id));
                break;

            case 'update_share_properties':
                if (method !== 'POST') throw new Error('请求方法错误');
                if (!data.username || !data.share_id) throw new Error('缺少必要参数');
                
                var auth = await verifyTokenOrPassword(userModel, data);
                if (auth.code !== 200) {
                    res.json(auth);
                    break;
                }

                res.json(await shareManager.updateShareProperties(data.username, data.share_id, data.mode, data.expire_days));
                break;

            case 'admin_get_users':
                if (method !== 'POST') throw new Error('请求方法错误');
                if (data.username !== userModel.adminConfig.username || data.password !== userModel.adminConfig.password) {
                    res.json({ code: 401, message: '管理员身份验证失败' });
                    break;
                }
                res.json(await userModel.getAllUsers());
                break;

            case 'add_auth_code':
                if (method !== 'POST') throw new Error('请求方法错误');
                if (!data.username || !data.password || !data.code || !data.member_days) throw new Error('缺少必要参数');
                res.json(await userModel.addAuthorizationCode(data.username, data.password, data.code, data.member_days));
                break;

            case 'activate_member':
                if (method !== 'POST') throw new Error('请求方法错误');
                if (!data.username || !data.code) throw new Error('缺少必要参数');
                res.json(await userModel.activateMember(data.username, data.code));
                break;

            case 'check_update':
                if (method !== 'POST') throw new Error('请求方法错误');
                if (!data.current_version) throw new Error('缺少必要参数');
                res.json(await userModel.checkUpdate(data.current_version));
                break;

            case 'admin_submit_update':
                if (method !== 'POST') throw new Error('请求方法错误');
                if (!data.username || !data.password || !data.latest_version || !data.update_content || !data.download_url || !data.min_version) throw new Error('缺少必要参数');
                res.json(await userModel.submitUpdate(data.username, data.password, data.latest_version, data.update_content, data.download_url, data.min_version));
                break;

            case 'admin_add_product':
                if (method !== 'POST') throw new Error('请求方法错误');
                if (data.username !== userModel.adminConfig.username || data.password !== userModel.adminConfig.password) {
                    res.json({ code: 401, message: '管理员身份验证失败' });
                    break;
                }
                if (!data.product || !data.base_url || !data.api_key) throw new Error('缺少必要参数');
                if (apiManager.addProductInfo(data.product, data.base_url, data.api_key)) {
                    res.json({ code: 200, message: '商品信息添加成功' });
                } else {
                    res.json({ code: 500, message: '商品信息添加失败' });
                }
                break;

            case 'admin_delete_api':
                if (method !== 'POST') throw new Error('请求方法错误');
                if (data.username !== userModel.adminConfig.username || data.password !== userModel.adminConfig.password) {
                    res.json({ code: 401, message: '管理员身份验证失败' });
                    break;
                }
                if (!data.base_url || !data.api_key) throw new Error('缺少必要参数');
                if (apiManager.deleteApiInfo(data.base_url, data.api_key)) {
                    res.json({ code: 200, message: 'API信息删除成功' });
                } else {
                    res.json({ code: 500, message: 'API信息删除失败' });
                }
                break;

            case 'admin_remove_product':
                if (method !== 'POST') throw new Error('请求方法错误');
                if (data.username !== userModel.adminConfig.username || data.password !== userModel.adminConfig.password) {
                    res.json({ code: 401, message: '管理员身份验证失败' });
                    break;
                }
                if (!data.base_url || !data.api_key || !data.product) throw new Error('缺少必要参数');
                if (apiManager.removeProduct(data.base_url, data.api_key, data.product)) {
                    res.json({ code: 200, message: '商品移除成功' });
                } else {
                    res.json({ code: 500, message: '商品移除失败' });
                }
                break;

            case 'admin_get_all_api':
                if (method !== 'POST') throw new Error('请求方法错误');
                if (data.username !== userModel.adminConfig.username || data.password !== userModel.adminConfig.password) {
                    res.json({ code: 401, message: '管理员身份验证失败' });
                    break;
                }
                res.json({ code: 200, message: '获取API信息成功', data: apiManager.getAllApiInfo() });
                break;

            case 'get_available_products':
                if (method !== 'POST') throw new Error('请求方法错误');
                var loginResult = await userModel.login(data.username, data.password);
                if (loginResult.code !== 200) {
                    res.json({ code: 401, message: '用户身份验证失败' });
                    break;
                }
                res.json({ code: 200, message: '获取可用商品成功', data: { products: apiManager.getAllProducts() } });
                break;

            case 'get_product_config':
                if (method !== 'POST') throw new Error('请求方法错误');
                var loginResult = await userModel.login(data.username, data.password);
                if (loginResult.code !== 200) {
                    res.json({ code: 401, message: '用户身份验证失败' });
                    break;
                }
                if (!data.product) throw new Error('缺少必要参数');
                
                var config = apiManager.getProductConfig(data.product);
                if (config) {
                    res.json({ code: 200, message: '获取商品配置成功', data: config });
                } else {
                    res.json({ code: 404, message: '商品配置不存在' });
                }
                break;

            case 'upload_screenshot':
                if (method !== 'POST') throw new Error('请求方法错误');
                
                // Multer puts files in req.files
                var file = req.files && req.files.find(f => f.fieldname === 'screenshot');
                if (!file) throw new Error('缺少截图文件');
                
                if (!data.username || !data.password) {
                    // Clean up file
                    fs.unlinkSync(file.path);
                    throw new Error('缺少必要参数（需要用户名和密码）');
                }

                var loginResult = await userModel.login(data.username, data.password);
                if (loginResult.code !== 200) {
                    fs.unlinkSync(file.path);
                    res.json({ code: 401, message: '用户身份验证失败' });
                    break;
                }

                // Move file
                const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
                if (!allowedTypes.includes(file.mimetype)) {
                    fs.unlinkSync(file.path);
                    throw new Error('不支持的文件类型: ' + file.mimetype);
                }

                const fileName = `${data.username}_${Date.now()}_${path.basename(file.originalname)}`;
                const relativePath = `screenshots/${fileName}`;
                const absolutePath = path.join(__dirname, '../../screenshots', fileName);

                moveFile(file, absolutePath);
                
                const fileUrl = `${userModel.baseUrl}/${relativePath}`;
                
                res.json({
                    code: 200,
                    message: '截图上传成功',
                    data: {
                        file_name: fileName,
                        file_path: '/' + relativePath,
                        file_url: fileUrl,
                        file_size: file.size
                    }
                });
                break;

            case 'search_products':
                if (method !== 'POST') throw new Error('请求方法错误');
                var loginResult = await userModel.login(data.username, data.password);
                if (loginResult.code !== 200) {
                    res.json({ code: 401, message: '用户身份验证失败' });
                    break;
                }
                if (!data.keyword) throw new Error('缺少搜索关键词');
                
                var matched = apiManager.searchProducts(data.keyword);
                res.json({
                    code: 200,
                    message: '商品搜索成功',
                    data: {
                        keyword: data.keyword,
                        products: matched,
                        total: matched.length
                    }
                });
                break;

            case 'upload_avatar':
                if (method !== 'POST') throw new Error('请求方法错误');
                
                var file = req.files && req.files.find(f => f.fieldname === 'avatar');
                if (!file) throw new Error('缺少头像文件');
                
                if (!data.username || !data.password) {
                    fs.unlinkSync(file.path);
                    throw new Error('缺少必要参数');
                }

                var loginResult = await userModel.login(data.username, data.password);
                if (loginResult.code !== 200) {
                    fs.unlinkSync(file.path);
                    res.json({ code: 401, message: '用户身份验证失败' });
                    break;
                }
                
                const avatarExt = path.extname(file.originalname);
                const avatarFilename = `${data.username}_${Date.now()}${avatarExt}`;
                const avatarRelativePath = `avatars/${avatarFilename}`;
                const avatarAbsolutePath = path.join(__dirname, '../../avatars', avatarFilename);
                
                moveFile(file, avatarAbsolutePath);
                
                // Mock file object for User model
                const fileObj = {
                    filename: avatarFilename
                };
                
                res.json(await userModel.uploadAvatar(data.username, fileObj));
                break;

            case 'get_avatar':
                if (method !== 'POST') throw new Error('请求方法错误');
                if (!data.username) throw new Error('缺少必要参数');
                res.json(await userModel.getAvatar(data.username));
                break;

            default:
                if (!action) {
                    res.json({
                        code: 200,
                        message: 'API服务运行正常',
                        timestamp: new Date().toISOString()
                    });
                } else {
                    throw new Error('无效的API请求');
                }
        }
    } catch (error) {
        console.error('Error handling request:', error);
        res.json({
            code: 400,
            message: error.message,
            timestamp: new Date().toISOString()
        });
        
        if (req.files) {
            req.files.forEach(f => {
                if (fs.existsSync(f.path)) fs.unlinkSync(f.path);
            });
        }
    }
});

module.exports = router;
