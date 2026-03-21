const db = require('../config/db');
const crypto = require('crypto');

class ShareManager {
    constructor() {
        this.baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    }

    // Create share
    async createShare(username, password, filename, mode = 'view', sharePassword = null, expireDays = 7) {
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

            // 3. Calculate expiration
            let expiresAt = null;
            // 确保 expireDays 是数字
            expireDays = parseInt(expireDays);
            if (!isNaN(expireDays) && expireDays > 0) {
                const date = new Date();
                date.setDate(date.getDate() + expireDays);
                expiresAt = date.toISOString().slice(0, 19).replace('T', ' ');
            }

            // 5. Generate unique share_id and insert
            let shareId;
            // 如果存在已有分享，直接使用已有ID，并更新信息
            const [existingRows] = await connection.execute('SELECT share_id FROM file_shares WHERE username = ? AND filename = ?', [username, filename]);
            if (existingRows.length > 0) {
                shareId = existingRows[0].share_id;
                await connection.execute('UPDATE file_shares SET mode = ?, password = ?, expires_at = ? WHERE share_id = ?', [mode, sharePassword, expiresAt, shareId]);
            } else {
                let attempts = 0;
                while (attempts < 10) {
                    shareId = crypto.randomUUID().replace(/-/g, '').substring(0, 16);
                    try {
                        await connection.execute('INSERT INTO file_shares (share_id, username, filename, mode, password, expires_at) VALUES (?, ?, ?, ?, ?, ?)', [shareId, username, filename, mode, sharePassword, expiresAt]);
                        break;
                    } catch (err) {
                        if (err.code !== 'ER_DUP_ENTRY') throw err;
                        attempts++;
                    }
                }
                if (attempts === 10) throw new Error('无法生成唯一的分享ID');
            }

            return {
                code: 200,
                message: existingRows.length > 0 ? '分享更新成功' : '分享创建成功',
                data: {
                    share_id: shareId,
                    share_url: this.getShareUrl(shareId),
                    mode,
                    expires_at: expiresAt,
                    has_password: !!sharePassword
                }
            };

        } catch (error) {
            return { code: 500, message: '创建分享失败: ' + error.message };
        } finally {
            connection.release();
        }
    }

    // Get shared file
    async getSharedFile(shareId, password = null) {
        try {
            const [rows] = await db.execute(`
                SELECT s.*, f.content 
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

            return {
                code: 200,
                message: '获取分享内容成功',
                data: {
                    share_id: share.share_id,
                    username: share.username,
                    filename: share.filename,
                    content: share.content,
                    mode: share.mode,
                    created_at: share.created_at,
                    expires_at: share.expires_at,
                    is_expired: share.expires_at && new Date(share.expires_at) < new Date()
                }
            };
        } catch (error) {
            return { code: 500, message: '获取分享内容失败: ' + error.message };
        }
    }

    // Update shared file
    async updateSharedFile(shareId, content, password = null) {
        try {
            const shareResult = await this.getSharedFile(shareId, password);
            if (shareResult.code !== 200) return shareResult;

            const share = shareResult.data;
            if (share.mode !== 'edit') return { code: 403, message: '当前分享仅允许查看，不允许编辑' };

            await db.execute('UPDATE user_files SET content = ?, last_modified = NOW() WHERE username = ? AND filename = ?', [content, share.username, share.filename]);

            return {
                code: 200,
                message: '文档更新成功',
                data: {
                    share_id: share.share_id,
                    username: share.username,
                    filename: share.filename,
                    mode: share.mode
                }
            };
        } catch (error) {
            return { code: 500, message: '更新分享文档失败: ' + error.message };
        }
    }

    // Get user shares
    async getUserShares(username) {
        try {
            const [rows] = await db.execute('SELECT share_id, filename, mode, password, expires_at, created_at, updated_at FROM file_shares WHERE username = ? ORDER BY created_at DESC', [username]);
            
            const shares = rows.map(row => ({
                share_id: row.share_id,
                share_url: this.getShareUrl(row.share_id),
                filename: row.filename,
                mode: row.mode,
                has_password: !!row.password,
                expires_at: row.expires_at,
                created_at: row.created_at,
                is_expired: row.expires_at && new Date(row.expires_at) < new Date()
            }));

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
    async updateShareProperties(username, shareId, mode, expireDays) {
        try {
            const [rows] = await db.execute('SELECT id FROM file_shares WHERE username = ? AND share_id = ?', [username, shareId]);
            if (rows.length === 0) return { code: 404, message: '分享不存在或无权操作' };

            let expiresAt = null;
            expireDays = parseInt(expireDays);
            if (!isNaN(expireDays) && expireDays > 0) {
                const date = new Date();
                date.setDate(date.getDate() + expireDays);
                expiresAt = date.toISOString().slice(0, 19).replace('T', ' ');
            }

            await db.execute('UPDATE file_shares SET mode = ?, expires_at = ? WHERE username = ? AND share_id = ?', [mode, expiresAt, username, shareId]);

            return {
                code: 200,
                message: '分享属性更新成功',
                data: { share_id: shareId, share_url: this.getShareUrl(shareId), mode, expires_at: expiresAt }
            };
        } catch (error) {
            return { code: 500, message: '更新分享属性失败: ' + error.message };
        }
    }

    // Helpers
    getShareUrl(shareId) {
        return `${this.baseUrl}/api/share/view?share_id=${shareId}`;
    }
}

module.exports = new ShareManager();
