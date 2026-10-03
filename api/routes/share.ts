const express = require('express');
const router = express.Router();
const shareManager = require('../models/ShareManager');
const userModel = require('../models/User');
const { verifyTokenOrPassword } = require('../utils/auth');
const { generatePasswordForm } = require('../utils/htmlGenerator');
const { checkSensitiveWords } = require('../utils/sensitiveFilter');

const verifyUser = async (req, res, next) => {
    const token = req.headers.authorization ? req.headers.authorization.split(' ')[1] : null;
    const data = { ...req.query, ...req.body };
    if (token) data.token = token;

    const result = await verifyTokenOrPassword(userModel, data);
    if (result.code !== 200) {
        return res.json(result);
    }
    req.ownerToken = data.token || null;
    next();
};

const verifyOptionalEditor = async (req) => {
    const data = req.body || {};
    const editorUsername = data.editor_username || '';
    if (!editorUsername) return null;

    const tokenHeader = req.headers.authorization ? req.headers.authorization.split(' ')[1] : null;
    const editorToken = data.editor_token || tokenHeader;
    const editorPassword = data.editor_password || '';

    const result = await verifyTokenOrPassword(userModel, {
        username: editorUsername,
        token: editorToken,
        password: editorPassword
    });

    if (result.code === 200) {
        return editorUsername;
    }
    return null;
};

// Create share
router.post('/create', verifyUser, async (req, res) => {
    const { username, password, filename, mode, share_password, expire_days, edit_policy, editor_usernames, edit_password } = req.body;
    if (!username || !filename) return res.json({ code: 400, message: '缺少必要参数' });

    // 1. 先获取文件内容进行敏感词检查（不创建分享）
    const fileResult = await shareManager.getFileContentForShare(username, password, filename, req.ownerToken);
    if (fileResult.code !== 200) {
        return res.json(fileResult);
    }

    // 2. 检查文件名是否包含敏感词
    const filenameCheck = checkSensitiveWords(filename);
    if (filenameCheck.hasSensitive) {
        return res.json({
            code: 400,
            message: `文件名包含敏感词${filenameCheck.words.join('、')}，无法分享`,
            sensitive_words: filenameCheck.words,
            sensitive_field: 'filename'
        });
    }

    // 3. 检查文件内容是否包含敏感词
    const fileContent = fileResult.data.content;
    if (fileContent) {
        const contentCheck = checkSensitiveWords(fileContent);
        if (contentCheck.hasSensitive) {
            return res.json({
                code: 400,
                message: `文件内容包含敏感词${contentCheck.words.join('、')}，无法分享`,
                sensitive_words: contentCheck.words,
                sensitive_field: 'content'
            });
        }
    }

    // 4. 敏感词检查通过后，创建分享
    const shareResult = await shareManager.createShare(username, password, filename, mode, share_password, expire_days, edit_policy, editor_usernames, edit_password, req.ownerToken);
    res.json(shareResult);
});

// Get/View share info (JSON or HTML redirect)
router.get('/view', async (req, res) => {
    const { share_id, password } = req.query;
    if (!share_id) return res.json({ code: 400, message: '缺少必要参数: share_id' });

    // This endpoint is used by browser to VIEW the share.
    // Logic from legacy:
    const result = await shareManager.getSharedFile(share_id, password);
    
    if (result.code === 401) {
        res.send(generatePasswordForm(share_id));
    } else if (result.code === 200) {
        // Redirect to index.html with params
        let redirectUrl = `../../index.html?share_id=${encodeURIComponent(share_id)}`;
        if (password) {
            redirectUrl += `&share_password=${encodeURIComponent(password)}`;
        }
        res.redirect(redirectUrl);
    } else {
        res.json(result);
    }
});

// Get share info (API)
router.post('/get', async (req, res) => {
    const { share_id, password, edit_password } = req.body;
    if (!share_id) return res.json({ code: 400, message: '缺少必要参数: share_id' });

    const verifiedEditorUsername = await verifyOptionalEditor(req);

    const result = await shareManager.getSharedFile(share_id, password, {
        editorUsername: verifiedEditorUsername,
        viewerId: req.body.viewer_id,
        editPassword: edit_password
    });

    // 如果获取成功，检查内容是否包含敏感词
    if (result.code === 200 && result.data) {
        const filenameCheck = checkSensitiveWords(result.data.filename);
        if (filenameCheck.hasSensitive) {
            return res.json({
                code: 400,
                message: `分享的内容包含敏感词，无法显示`,
                sensitive_words: filenameCheck.words,
                sensitive_field: 'filename'
            });
        }

        const contentCheck = checkSensitiveWords(result.data.content);
        if (contentCheck.hasSensitive) {
            return res.json({
                code: 400,
                message: `分享的内容包含敏感词，无法显示`,
                sensitive_words: contentCheck.words,
                sensitive_field: 'content'
            });
        }
    }

    res.json(result);
});

// Update shared file
router.post('/update', async (req, res) => {
    const { share_id, content, password, edit_password, viewer_id, viewer_name, base_version, base_content, manual_save, create_history } = req.body;
    if (!share_id || typeof content !== 'string') return res.json({ code: 400, message: '缺少必要参数' });

    const verifiedEditorUsername = await verifyOptionalEditor(req);

    // 检查更新内容是否包含敏感词
    const contentCheck = checkSensitiveWords(content);
    if (contentCheck.hasSensitive) {
        return res.json({
            code: 400,
            message: `更新内容包含敏感词${contentCheck.words.join('、')}，无法更新`,
            sensitive_words: contentCheck.words,
            sensitive_field: 'content'
        });
    }

    res.json(await shareManager.updateSharedFile(share_id, content, password, {
        editorUsername: verifiedEditorUsername,
        editPassword: edit_password,
        viewerId: viewer_id,
        viewerName: viewer_name,
        baseVersion: Number.isInteger(base_version) ? base_version : (Number.isFinite(Number(base_version)) ? Number(base_version) : undefined),
        baseContent: typeof base_content === 'string' ? base_content : undefined,
        manualSave: manual_save === true || create_history === true
    }));
});

// List shares
router.get('/list', verifyUser, async (req, res) => {
    const { username } = req.query;
    if (!username) return res.json({ code: 400, message: '缺少必要参数: username' });
    res.json(await shareManager.getUserShares(username));
});

// Delete share
router.post('/delete', verifyUser, async (req, res) => {
    const { username, share_id } = req.body;
    if (!username || !share_id) return res.json({ code: 400, message: '缺少必要参数' });
    res.json(await shareManager.deleteShare(username, share_id));
});

// Update share properties
router.post('/properties', verifyUser, async (req, res) => {
    const { username, password, share_id, mode, expire_days, share_password, edit_policy, editor_usernames, edit_password } = req.body;
    if (!username || !share_id) return res.json({ code: 400, message: '缺少必要参数' });

    // 获取分享对应的文件信息
    const shareResult = await shareManager.getSharedFile(share_id);
    if (shareResult.code !== 200) {
        return res.json(shareResult);
    }

    const filename = shareResult.data.filename;

    // 获取文件内容进行敏感词检测
    const fileResult = await shareManager.getFileContentForShare(username, password, filename, req.ownerToken);
    if (fileResult.code !== 200) {
        return res.json(fileResult);
    }

    // 检查文件名是否包含敏感词
    const filenameCheck = checkSensitiveWords(filename);
    if (filenameCheck.hasSensitive) {
        return res.json({
            code: 400,
            message: `文件名包含敏感词${filenameCheck.words.join('、')}，无法更新分享`,
            sensitive_words: filenameCheck.words,
            sensitive_field: 'filename'
        });
    }

    // 检查文件内容是否包含敏感词
    const fileContent = fileResult.data.content;
    if (fileContent) {
        const contentCheck = checkSensitiveWords(fileContent);
        if (contentCheck.hasSensitive) {
            return res.json({
                code: 400,
                message: `文件内容包含敏感词${contentCheck.words.join('、')}，无法更新分享`,
                sensitive_words: contentCheck.words,
                sensitive_field: 'content'
            });
        }
    }

    const result = await shareManager.updateShareProperties(username, share_id, mode, expire_days, share_password, edit_policy, editor_usernames, edit_password);
    if (result.code === 200 && req.app.locals.shareCollaborationServer) {
        try { await req.app.locals.shareCollaborationServer.refreshRoom(share_id, true); }
        catch (error) { console.warn('分享权限通知失败:', error.message); }
    }
    res.json(result);
});

router.post('/presence', async (req, res) => {
    const { share_id, password, viewer_id, viewer_name, is_editing, edit_password } = req.body;
    if (!share_id || !viewer_id) return res.json({ code: 400, message: '缺少必要参数' });
    const editorUsername = await verifyOptionalEditor(req);
    const access = await shareManager.getSharedFile(share_id, password, { editorUsername, viewerId: viewer_id, editPassword: edit_password });
    if (access.code !== 200) return res.json(access);
    const result = await shareManager.updateSharePresence(share_id, viewer_id, editorUsername || viewer_name, !!is_editing && access.data.can_edit, access.data.can_edit);
    return res.json({ ...result, data: { ...result.data, can_edit: access.data.can_edit } });
});

router.post('/history', async (req, res) => {
    const { share_id, password, viewer_id, edit_password } = req.body;
    if (!share_id) return res.json({ code: 400, message: '缺少分享标识' });
    const editorUsername = await verifyOptionalEditor(req);
    try {
        return res.json(await shareManager.getEditHistory(share_id, password, { editorUsername, viewerId: viewer_id, editPassword: edit_password, before_id: req.body.before_id, actor_key: req.body.actor_key }));
    } catch (error) { return res.json({ code: 500, message: '加载协作历史失败' }); }
});

router.post('/history-event', async (req, res) => {
    const { share_id, password, viewer_id, edit_password, event_id } = req.body;
    if (!share_id) return res.json({ code: 400, message: '缺少分享 ID' });
    const editorUsername = await verifyOptionalEditor(req);
    try { return res.json(await shareManager.getEditEvent(share_id, password, { editorUsername, viewerId: viewer_id, editPassword: edit_password, event_id })); }
    catch (error) { return res.json({ code: 500, message: '加载编辑详情失败' }); }
});

for (const action of ['undo', 'editor-permission']) {
    router.post('/' + action, verifyUser, async (req, res) => {
        const { username, share_id, event_id, actor_key, revoked } = req.body;
        if (!username || !share_id) return res.json({ code: 400, message: '缺少必要参数' });
        const result = await shareManager.manageEditorEdits(username, share_id, action === 'undo' ? 'undo' : 'permission', { event_id, actor_key, revoked });
        if (result.code === 200 && req.app.locals.shareCollaborationServer) {
            try { await req.app.locals.shareCollaborationServer.refreshRoom(share_id, action === 'undo'); }
            catch (error) { console.warn('协作通知失败，客户端将通过心跳刷新:', error.message); }
        }
        return res.json(result);
    });
}

router.get('/presence', async (req, res) => {
    const { share_id, password } = req.query;
    if (!share_id) return res.json({ code: 400, message: '缺少必要参数: share_id' });

    const shareResult = await shareManager.getSharedFile(share_id, password);
    if (shareResult.code !== 200) {
        return res.json(shareResult);
    }

    res.json(await shareManager.getSharePresence(share_id));
});

router.post('/poll', async (req, res) => {
    const { share_id, password, since, edit_password } = req.body;
    if (!share_id) return res.json({ code: 400, message: '缺少必要参数: share_id' });

    const verifiedEditorUsername = await verifyOptionalEditor(req);
    const shareResult = await shareManager.getSharedFile(share_id, password, {
        editorUsername: verifiedEditorUsername,
        viewerId: req.body.viewer_id,
        editPassword: edit_password
    });
    if (shareResult.code !== 200) {
        return res.json(shareResult);
    }

    const data = shareResult.data;
    const sinceTime = since ? new Date(since).getTime() : 0;
    const lastModified = data.last_modified ? new Date(data.last_modified).getTime() : 0;

    return res.json({
        code: 200,
        message: '轮询成功',
        data: {
            changed: !since || (lastModified > sinceTime) || (Number.isFinite(Number(req.body.since_version)) && Number(req.body.since_version) < Number(data.content_version)),
            ...data
        }
    });
});

module.exports = router;
