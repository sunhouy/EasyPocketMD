const db = require('../config/db');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

class ShareManager {
    constructor() {
        this.baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    }

    normalizeMode(mode) {
        return mode === 'edit' ? 'edit' : 'view';
    }

    normalizeEditPolicy(mode, editPolicy) {
        if (mode !== 'edit') return 'all';
        if (['all', 'specific', 'password'].includes(editPolicy)) return editPolicy;
        return 'all';
    }

    normalizeEditorUsernames(editorUsernames) {
        if (!editorUsernames) return [];
        if (Array.isArray(editorUsernames)) {
            return editorUsernames
                .map(name => String(name || '').trim())
                .filter(Boolean);
        }
        return String(editorUsernames)
            .split(',')
            .map(name => name.trim())
            .filter(Boolean);
    }

    buildExpiresAt(expireDays) {
        let expiresAt = null;
        const parsedExpireDays = parseInt(expireDays, 10);
        if (!isNaN(parsedExpireDays) && parsedExpireDays > 0) {
            const date = new Date();
            date.setDate(date.getDate() + parsedExpireDays);
            expiresAt = date.toISOString().slice(0, 19).replace('T', ' ');
        }
        return expiresAt;
    }

    async syncShareEditors(connection, shareId, editorUsernames) {
        await connection.execute('DELETE FROM share_editors WHERE share_id = ?', [shareId]);
        if (!editorUsernames.length) return;
        for (const editorUsername of editorUsernames) {
            await connection.execute('INSERT INTO share_editors (share_id, editor_username) VALUES (?, ?)', [shareId, editorUsername]);
        }
    }

    async getShareEditors(shareId) {
        const [rows] = await db.execute('SELECT editor_username FROM share_editors WHERE share_id = ?', [shareId]);
        return rows.map(row => row.editor_username);
    }

    async canEditSharedFile(share, options = {}) {
        if (!share || share.mode !== 'edit') {
            return { canEdit: false, reason: 'view_only' };
        }

        const editPolicy = share.edit_policy || 'all';
        if (editPolicy === 'all') {
            return { canEdit: true, reason: 'policy_all' };
        }

        if (editPolicy === 'specific') {
            const editorUsername = String(options.editorUsername || '').trim();
            if (!editorUsername) {
                return { canEdit: false, reason: 'specific_user_required' };
            }
            const editorUsernames = await this.getShareEditors(share.share_id);
            return {
                canEdit: editorUsernames.includes(editorUsername),
                reason: editorUsernames.includes(editorUsername) ? 'specific_user_match' : 'specific_user_denied',
                editor_usernames: editorUsernames
            };
        }

        if (editPolicy === 'password') {
            const inputPassword = String(options.editPassword || '').trim();
            if (!share.edit_password_hash) {
                return { canEdit: false, reason: 'edit_password_not_configured' };
            }
            if (!inputPassword) {
                return { canEdit: false, reason: 'edit_password_required' };
            }
            const passwordOk = await bcrypt.compare(inputPassword, share.edit_password_hash);
            return {
                canEdit: passwordOk,
                reason: passwordOk ? 'edit_password_match' : 'edit_password_invalid'
            };
        }

        return { canEdit: false, reason: 'unknown_policy' };
    }

    // Get file content for sensitive word check (without creating share)
    async getFileContentForShare(username, password, filename) {
        const connection = await db.getConnection();
        try {
            // 1. Authenticate user
            const [userRows] = await connection.execute('SELECT id, password FROM users WHERE username = ?', [username]);
            if (userRows.length === 0) return { code: 401, message: '用户认证失败' };

            const user = userRows[0];
            const bcrypt = require('bcryptjs');
            if (!(await bcrypt.compare(password, user.password))) {
                return { code: 401, message: '用户认证失败' };
            }

            // 2. Check if file exists and get content
            const [fileRows] = await connection.execute('SELECT id, content FROM user_files WHERE username = ? AND filename = ?', [username, filename]);
            if (fileRows.length === 0) return { code: 404, message: '文档不存在' };

            return {
                code: 200,
                data: {
                    filename: filename,
                    content: fileRows[0].content || ''
                }
            };

        } catch (error) {
            return { code: 500, message: '获取文件内容失败: ' + error.message };
        } finally {
            connection.release();
        }
    }

    // Create share
    async createShare(username, password, filename, mode = 'view', sharePassword = null, expireDays = 7, editPolicy = 'all', editorUsernames = [], editPassword = null) {
        const connection = await db.getConnection();
        try {
            // 1. Authenticate user
            const [userRows] = await connection.execute('SELECT id, password FROM users WHERE username = ?', [username]);
            if (userRows.length === 0) return { code: 401, message: '用户认证失败' };

            const user = userRows[0];
            const bcrypt = require('bcryptjs');
            if (!(await bcrypt.compare(password, user.password))) {
                return { code: 401, message: '用户认证失败' };
            }

            // 2. Check if file exists
            const [fileRows] = await connection.execute('SELECT id FROM user_files WHERE username = ? AND filename = ?', [username, filename]);
            if (fileRows.length === 0) return { code: 404, message: '文档不存在' };

            // 3. Normalize share options
            mode = this.normalizeMode(mode);
            editPolicy = this.normalizeEditPolicy(mode, editPolicy);
            editorUsernames = this.normalizeEditorUsernames(editorUsernames);
            const expiresAt = this.buildExpiresAt(expireDays);
            const editPasswordHash = editPolicy === 'password' && String(editPassword || '').trim()
                ? await bcrypt.hash(String(editPassword).trim(), 10)
                : null;

            // 4. Generate unique share_id and insert
            let shareId;
            // 如果存在已有分享，直接使用已有ID，并更新信息
            const [existingRows] = await connection.execute('SELECT share_id FROM file_shares WHERE username = ? AND filename = ?', [username, filename]);
            await connection.beginTransaction();
            if (existingRows.length > 0) {
                shareId = existingRows[0].share_id;
                await connection.execute('UPDATE file_shares SET mode = ?, password = ?, expires_at = ?, edit_policy = ?, edit_password_hash = ? WHERE share_id = ?', [mode, sharePassword, expiresAt, editPolicy, editPasswordHash, shareId]);
            } else {
                let attempts = 0;
                while (attempts < 10) {
                    shareId = crypto.randomUUID().replace(/-/g, '').substring(0, 16);
                    try {
                        await connection.execute('INSERT INTO file_shares (share_id, username, filename, mode, password, expires_at, edit_policy, edit_password_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [shareId, username, filename, mode, sharePassword, expiresAt, editPolicy, editPasswordHash]);
                        break;
                    } catch (err) {
                        if (err.code !== 'ER_DUP_ENTRY') throw err;
                        attempts++;
                    }
                }
                if (attempts === 10) throw new Error('无法生成唯一的分享ID');
            }

            if (mode === 'edit' && editPolicy === 'specific') {
                await this.syncShareEditors(connection, shareId, editorUsernames);
            } else {
                await connection.execute('DELETE FROM share_editors WHERE share_id = ?', [shareId]);
            }

            await connection.commit();

            return {
                code: 200,
                message: existingRows.length > 0 ? '分享更新成功' : '分享创建成功',
                data: {
                    share_id: shareId,
                    share_url: this.getShareUrl(shareId),
                    mode,
                    edit_policy: editPolicy,
                    editor_usernames: mode === 'edit' && editPolicy === 'specific' ? editorUsernames : [],
                    expires_at: expiresAt,
                    has_password: !!sharePassword,
                    has_edit_password: !!editPasswordHash
                }
            };

        } catch (error) {
            try {
                await connection.rollback();
            } catch (rollbackError) {
                // noop
            }
            return { code: 500, message: '创建分享失败: ' + error.message };
        } finally {
            connection.release();
        }
    }

    // Get shared file
    async getSharedFile(shareId, password = null, options = {}) {
        try {
            const [rows] = await db.execute(`
                SELECT s.*, f.content, f.last_modified, f.content_version 
                FROM file_shares s 
                JOIN user_files f ON s.username = f.username AND s.filename = f.filename 
                WHERE s.share_id = ? AND (s.expires_at IS NULL OR s.expires_at > NOW())
            `, [shareId]);

            if (rows.length === 0) return { code: 404, message: '分享不存在或已过期' };

            const share = rows[0];

            if (share.password) {
                if (!password) return { code: 401, message: '需要访问密码' };
                if (share.password !== password) return { code: 403, message: '密码错误' };
            }

            const editPermission = await this.canEditSharedFile(share, {
                editorUsername: options.editorUsername,
                editPassword: options.editPassword
            });

            return {
                code: 200,
                message: '获取分享内容成功',
                data: {
                    share_id: share.share_id,
                    username: share.username,
                    filename: share.filename,
                    content: share.content,
                    mode: share.mode,
                    edit_policy: share.edit_policy || 'all',
                    can_edit: !!editPermission.canEdit,
                    can_edit_reason: editPermission.reason,
                    requires_edit_password: (share.edit_policy || 'all') === 'password',
                    requires_specific_user: (share.edit_policy || 'all') === 'specific',
                    created_at: share.created_at,
                    last_modified: share.last_modified,
                    content_version: share.content_version || 1,
                    expires_at: share.expires_at,
                    is_expired: share.expires_at && new Date(share.expires_at) < new Date()
                }
            };
        } catch (error) {
            return { code: 500, message: '获取分享内容失败: ' + error.message };
        }
    }

    // Update shared file
    async updateSharedFile(shareId, content, password = null, options = {}) {
        try {
            const shareResult = await this.getSharedFile(shareId, password, {
                editorUsername: options.editorUsername,
                editPassword: options.editPassword
            });
            if (shareResult.code !== 200) return shareResult;

            const share = shareResult.data;
            if (share.mode !== 'edit') return { code: 403, message: '当前分享仅允许查看，不允许编辑' };
            if (!share.can_edit) {
                if (share.edit_policy === 'specific') {
                    return { code: 403, message: '当前分享仅允许特定用户编辑' };
                }
                if (share.edit_policy === 'password') {
                    return { code: 403, message: '请输入正确的编辑密码后再编辑' };
                }
                return { code: 403, message: '当前用户无编辑权限' };
            }

            const hasBaseVersion = Number.isInteger(options.baseVersion);
            let updateResult;
            if (hasBaseVersion) {
                const [result] = await db.execute(
                    'UPDATE user_files SET content = ?, content_version = content_version + 1, last_modified = NOW() WHERE username = ? AND filename = ? AND content_version = ?',
                    [content, share.username, share.filename, options.baseVersion]
                );
                updateResult = result;
            } else {
                const [result] = await db.execute(
                    'UPDATE user_files SET content = ?, content_version = content_version + 1, last_modified = NOW() WHERE username = ? AND filename = ?',
                    [content, share.username, share.filename]
                );
                updateResult = result;
            }

            if (hasBaseVersion && (!updateResult || updateResult.affectedRows === 0)) {
                const [latestRows] = await db.execute('SELECT content, last_modified, content_version FROM user_files WHERE username = ? AND filename = ? LIMIT 1', [share.username, share.filename]);
                const latest = latestRows[0] || {};
                return {
                    code: 409,
                    message: '文档已被其他用户更新，请刷新后重试',
                    data: {
                        share_id: share.share_id,
                        username: share.username,
                        filename: share.filename,
                        content: latest.content,
                        last_modified: latest.last_modified,
                        content_version: latest.content_version || share.content_version || 1
                    }
                };
            }

            // 更新在线会话中的编辑状态
            if (options.viewerId) {
                await this.updateSharePresence(shareId, options.viewerId, options.viewerName || options.editorUsername || 'Guest', true, true);
            }

            const [updatedRows] = await db.execute('SELECT content, last_modified, content_version FROM user_files WHERE username = ? AND filename = ? LIMIT 1', [share.username, share.filename]);
            const updated = updatedRows[0] || {};

            return {
                code: 200,
                message: '文档更新成功',
                data: {
                    share_id: share.share_id,
                    username: share.username,
                    filename: share.filename,
                    mode: share.mode,
                    content: updated.content,
                    last_modified: updated.last_modified,
                    content_version: updated.content_version || (share.content_version || 1)
                }
            };
        } catch (error) {
            return { code: 500, message: '更新分享文档失败: ' + error.message };
        }
    }

    // Get user shares
    async getUserShares(username) {
        try {
            const [rows] = await db.execute('SELECT share_id, filename, mode, password, expires_at, created_at, updated_at, edit_policy, edit_password_hash FROM file_shares WHERE username = ? ORDER BY created_at DESC', [username]);
            
            const shares = await Promise.all(rows.map(async row => ({
                share_id: row.share_id,
                share_url: this.getShareUrl(row.share_id),
                filename: row.filename,
                mode: row.mode,
                edit_policy: row.edit_policy || 'all',
                editor_usernames: row.edit_policy === 'specific' ? await this.getShareEditors(row.share_id) : [],
                has_edit_password: !!row.edit_password_hash,
                has_password: !!row.password,
                expires_at: row.expires_at,
                created_at: row.created_at,
                is_expired: row.expires_at && new Date(row.expires_at) < new Date()
            })));

            return {
                code: 200,
                message: '获取分享列表成功',
                data: { username, shares, count: shares.length }
            };
        } catch (error) {
            return { code: 500, message: '获取分享列表失败: ' + error.message };
        }
    }

    // Delete share
    async deleteShare(username, shareId) {
        try {
            const [rows] = await db.execute('SELECT id FROM file_shares WHERE username = ? AND share_id = ?', [username, shareId]);
            if (rows.length === 0) return { code: 404, message: '分享不存在或无权操作' };

            const [result] = await db.execute('DELETE FROM file_shares WHERE username = ? AND share_id = ?', [username, shareId]);
            return {
                code: 200,
                message: '分享删除成功',
                data: { share_id: shareId, affected_rows: result.affectedRows }
            };
        } catch (error) {
            return { code: 500, message: '删除分享失败: ' + error.message };
        }
    }

    // Update share properties
    async updateShareProperties(username, shareId, mode, expireDays, sharePassword = null, editPolicy = 'all', editorUsernames = [], editPassword = null) {
        const connection = await db.getConnection();
        try {
            const [rows] = await connection.execute('SELECT id FROM file_shares WHERE username = ? AND share_id = ?', [username, shareId]);
            if (rows.length === 0) return { code: 404, message: '分享不存在或无权操作' };

            mode = this.normalizeMode(mode);
            editPolicy = this.normalizeEditPolicy(mode, editPolicy);
            editorUsernames = this.normalizeEditorUsernames(editorUsernames);
            const expiresAt = this.buildExpiresAt(expireDays);
            const editPasswordHash = editPolicy === 'password' && String(editPassword || '').trim()
                ? await bcrypt.hash(String(editPassword).trim(), 10)
                : null;

            await connection.beginTransaction();

            await connection.execute(
                'UPDATE file_shares SET mode = ?, expires_at = ?, password = ?, edit_policy = ?, edit_password_hash = ? WHERE username = ? AND share_id = ?',
                [mode, expiresAt, sharePassword, editPolicy, editPasswordHash, username, shareId]
            );

            if (mode === 'edit' && editPolicy === 'specific') {
                await this.syncShareEditors(connection, shareId, editorUsernames);
            } else {
                await connection.execute('DELETE FROM share_editors WHERE share_id = ?', [shareId]);
            }

            await connection.commit();

            return {
                code: 200,
                message: '分享属性更新成功',
                data: {
                    share_id: shareId,
                    share_url: this.getShareUrl(shareId),
                    mode,
                    edit_policy: editPolicy,
                    editor_usernames: mode === 'edit' && editPolicy === 'specific' ? editorUsernames : [],
                    has_edit_password: !!editPasswordHash,
                    expires_at: expiresAt
                }
            };
        } catch (error) {
            try {
                await connection.rollback();
            } catch (rollbackError) {
                // noop
            }
            return { code: 500, message: '更新分享属性失败: ' + error.message };
        } finally {
            connection.release();
        }
    }

    async updateSharePresence(shareId, viewerId, viewerName, isEditing, canEdit) {
        if (!shareId || !viewerId) {
            return { code: 400, message: '缺少必要参数' };
        }
        await db.execute(
            `INSERT INTO share_live_sessions (share_id, viewer_id, viewer_name, is_editing, can_edit, last_seen)
             VALUES (?, ?, ?, ?, ?, NOW())
             ON DUPLICATE KEY UPDATE viewer_name = VALUES(viewer_name), is_editing = VALUES(is_editing), can_edit = VALUES(can_edit), last_seen = NOW()`,
            [shareId, viewerId, viewerName || 'Guest', isEditing ? 1 : 0, canEdit ? 1 : 0]
        );
        return this.getSharePresence(shareId);
    }

    async getSharePresence(shareId) {
        await db.execute('DELETE FROM share_live_sessions WHERE share_id = ? AND last_seen < DATE_SUB(NOW(), INTERVAL 25 SECOND)', [shareId]);
        const [rows] = await db.execute(
            `SELECT viewer_id, viewer_name, is_editing, can_edit, last_seen
             FROM share_live_sessions
             WHERE share_id = ?
             ORDER BY is_editing DESC, last_seen DESC`,
            [shareId]
        );
        return {
            code: 200,
            message: '获取在线状态成功',
            data: {
                share_id: shareId,
                online_users: rows,
                online_count: rows.length
            }
        };
    }

    // Helpers
    getShareUrl(shareId) {
        return `${this.baseUrl}/api/share/view?share_id=${shareId}`;
    }
}

module.exports = new ShareManager();
