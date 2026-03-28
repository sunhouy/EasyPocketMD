const db = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

// JWT 密钥，从环境变量获取或使用默认值
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

class User {
    constructor() {
        this.adminConfig = {
            username: process.env.ADMIN_USER || 'admin',
            password: process.env.ADMIN_PASSWORD || '127127sun'
        };
        const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
        this.baseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    }

    // Encrypt password
    async encryptPassword(password) {
        const salt = await bcrypt.genSalt(10);
        return await bcrypt.hash(password, salt);
    }

    // Verify password
    async verifyPassword(password, hashedPassword) {
        return await bcrypt.compare(password, hashedPassword);
    }

    // Generate JWT token
    generateToken(username) {
        return jwt.sign({ username }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    }

    // Verify JWT token
    verifyToken(token) {
        try {
            return jwt.verify(token, JWT_SECRET);
        } catch (error) {
            return null;
        }
    }

    // Register user
    async register(username, password, inviteCode = null) {
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();

            // Check if username exists
            const [rows] = await connection.execute('SELECT id FROM users WHERE username = ?', [username]);
            if (rows.length > 0) {
                return { code: 400, message: '用户名已存在' };
            }

            // Hash password
            const hashedPassword = await this.encryptPassword(password);

            // Verify invite code if provided
            if (inviteCode) {
                const [inviterRows] = await connection.execute('SELECT id FROM users WHERE username = ?', [inviteCode]);
                if (inviterRows.length === 0) {
                    throw new Error('无效的邀请码');
                }
            }

            // Insert user
            await connection.execute('INSERT INTO users (username, password, inviter) VALUES (?, ?, ?)', [username, hashedPassword, inviteCode]);

            const today = new Date().toISOString().split('T')[0];

            // Handle invite code logic (membership)
            let isMember = 0;
            if (inviteCode) {
                isMember = 1;
                const nextDay = new Date();
                nextDay.setDate(nextDay.getDate() + 1);
                const userNewExpireDate = nextDay.toISOString().split('T')[0];

                // Update new user membership
                await connection.execute('UPDATE users SET is_member = 1, expire_date = ? WHERE username = ?', [userNewExpireDate, username]);

                // Insert member record
                await connection.execute("INSERT INTO member_records (username, type, source, added_days, start_date, end_date) VALUES (?, 'invite', ?, 1, ?, ?)", [username, inviteCode, today, userNewExpireDate]);

                // Reward inviter
                const [inviter] = await connection.execute('SELECT id, is_member, expire_date FROM users WHERE username = ?', [inviteCode]);
                if (inviter.length > 0) {
                    const inviterData = inviter[0];
                    let inviterCurrentExpireDate = inviterData.expire_date ? new Date(inviterData.expire_date) : new Date();
                    let inviterStartDate = inviterData.is_member ? inviterCurrentExpireDate.toISOString().split('T')[0] : today;

                    let inviterNewExpireDate = new Date(inviterCurrentExpireDate);
                    inviterNewExpireDate.setDate(inviterNewExpireDate.getDate() + 1);
                    const inviterNewExpireDateStr = inviterNewExpireDate.toISOString().split('T')[0];

                    await connection.execute('UPDATE users SET is_member = 1, expire_date = ? WHERE username = ?', [inviterNewExpireDateStr, inviteCode]);
                    await connection.execute("INSERT INTO member_records (username, type, source, added_days, start_date, end_date) VALUES (?, 'invite', ?, 1, ?, ?)", [inviteCode, username, inviterStartDate, inviterNewExpireDateStr]);
                }
            }

            await connection.commit();
            return {
                code: 200,
                message: '注册成功',
                data: { username, is_member: isMember, inviter: inviteCode }
            };

        } catch (error) {
            await connection.rollback();
            return { code: 500, message: '注册失败: ' + error.message };
        } finally {
            connection.release();
        }
    }

    // Login
    async login(username, password) {
        try {
            const [rows] = await db.execute('SELECT * FROM users WHERE username = ?', [username]);
            if (rows.length === 0) {
                return { code: 401, message: '用户名不存在' };
            }

            const user = rows[0];
            const isMatch = await this.verifyPassword(password, user.password);

            if (!isMatch) {
                return { code: 401, message: '密码错误' };
            }

            await db.execute('UPDATE users SET last_login = NOW(), login_count = login_count + 1 WHERE id = ?', [user.id]);

            // 生成 JWT token
            const token = this.generateToken(user.username);

            return {
                code: 200,
                message: '登录成功',
                data: {
                    username: user.username,
                    is_member: user.is_member,
                    last_login: user.last_login,
                    login_count: user.login_count + 1,
                    token: token
                }
            };
        } catch (error) {
            return { code: 500, message: '登录失败: ' + error.message };
        }
    }

    // Check member status
    async checkMemberStatus(username) {
        try {
            const [rows] = await db.execute('SELECT is_member, expire_date, created_at, last_login FROM users WHERE username = ?', [username]);
            if (rows.length === 0) {
                return { code: 404, message: '用户不存在' };
            }

            const user = rows[0];
            return {
                code: 200,
                message: '查询成功',
                data: {
                    username,
                    is_member: user.is_member,
                    expire_date: user.expire_date,
                    created_at: user.created_at,
                    last_login: user.last_login
                }
            };
        } catch (error) {
            return { code: 500, message: '查询失败: ' + error.message };
        }
    }

    // Add authorization code (Admin)
    async addAuthorizationCode(adminUsername, adminPassword, code, memberDays) {
        if (adminUsername !== this.adminConfig.username || adminPassword !== this.adminConfig.password) {
            return { code: 401, message: '管理员身份验证失败' };
        }

        try {
            const [rows] = await db.execute('SELECT id FROM authorization_codes WHERE plain_code = ?', [code]);
            if (rows.length > 0) {
                return { code: 400, message: '授权码已存在' };
            }

            const hashedCode = await this.encryptPassword(code);
            await db.execute('INSERT INTO authorization_codes (code, plain_code, member_days) VALUES (?, ?, ?)', [hashedCode, code, memberDays]);

            return {
                code: 200,
                message: '授权码添加成功',
                data: { code, member_days: memberDays }
            };
        } catch (error) {
            return { code: 500, message: '授权码添加失败: ' + error.message };
        }
    }

    // Activate member
    async activateMember(username, code) {
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();

            const [userRows] = await connection.execute('SELECT id, is_member, expire_date FROM users WHERE username = ?', [username]);
            if (userRows.length === 0) {
                return { code: 404, message: '用户不存在' };
            }
            const user = userRows[0];

            const [codeRows] = await connection.execute('SELECT id, member_days FROM authorization_codes WHERE plain_code = ? AND is_used = 0', [code]);
            if (codeRows.length === 0) {
                return { code: 400, message: '无效的授权码' };
            }
            const authCode = codeRows[0];
            const memberDays = authCode.member_days;

            const today = new Date();
            let currentExpireDate = user.expire_date ? new Date(user.expire_date) : today;
            let startDate = user.is_member ? currentExpireDate.toISOString().split('T')[0] : today.toISOString().split('T')[0];

            let newExpireDate = new Date(user.is_member ? currentExpireDate : today);
            newExpireDate.setDate(newExpireDate.getDate() + memberDays);
            const newExpireDateStr = newExpireDate.toISOString().split('T')[0];

            await connection.execute('UPDATE users SET is_member = 1, expire_date = ? WHERE username = ?', [newExpireDateStr, username]);
            await connection.execute('UPDATE authorization_codes SET is_used = 1, username = ?, used_at = NOW() WHERE plain_code = ?', [username, code]);
            await connection.execute("INSERT INTO member_records (username, type, source, added_days, start_date, end_date) VALUES (?, 'auth_code', ?, ?, ?, ?)", [username, code, memberDays, startDate, newExpireDateStr]);

            await connection.commit();
            return {
                code: 200,
                message: '会员开通成功',
                data: { expire_date: newExpireDateStr, added_days: memberDays }
            };
        } catch (error) {
            await connection.rollback();
            return { code: 500, message: '开通会员失败: ' + error.message };
        } finally {
            connection.release();
        }
    }

    // Admin Login
    async adminLogin(username, password) {
        if (username !== this.adminConfig.username || password !== this.adminConfig.password) {
            return { code: 401, message: '管理员账号或密码错误' };
        }
        return { code: 200, message: '管理员登录成功' };
    }

    // Get all users (Admin)
    async getAllUsers() {
        try {
            const [rows] = await db.execute('SELECT username, is_member, created_at, last_login FROM users ORDER BY created_at DESC');
            return { code: 200, message: '查询成功', data: rows };
        } catch (error) {
            return { code: 500, message: '查询失败: ' + error.message };
        }
    }

    // Check update
    async checkUpdate(currentVersion) {
        const versionFile = path.join(__dirname, '../version_info.txt');
        if (!fs.existsSync(versionFile)) {
            return {
                code: 200,
                message: '不需要更新',
                data: { need_update: 0, force_update: 0 }
            };
        }

        try {
            const versionContent = fs.readFileSync(versionFile, 'utf8');
            const versionInfo = JSON.parse(versionContent);

            const compareVersions = (v1, v2) => {
                const v1Parts = v1.split('.').map(Number);
                const v2Parts = v2.split('.').map(Number);
                const maxLength = Math.max(v1Parts.length, v2Parts.length);

                for (let i = 0; i < maxLength; i++) {
                    const v1Part = v1Parts[i] || 0;
                    const v2Part = v2Parts[i] || 0;
                    if (v1Part > v2Part) return 1;
                    if (v1Part < v2Part) return -1;
                }
                return 0;
            };

            let needUpdate = 0;
            let forceUpdate = 0;

            if (compareVersions(currentVersion, versionInfo.latest_version) < 0) {
                needUpdate = 1;
                if (compareVersions(currentVersion, versionInfo.min_version) < 0) {
                    forceUpdate = 1;
                }
            }

            const result = {
                code: 200,
                message: needUpdate ? '有新版本' : '不需要更新',
                data: { need_update: needUpdate, force_update: forceUpdate }
            };

            if (needUpdate) {
                result.data.latest_version = versionInfo.latest_version;
                result.data.update_content = versionInfo.update_content;
                result.data.download_url = versionInfo.download_url;
            }

            return result;
        } catch (error) {
            return { code: 500, message: '版本信息解析失败' };
        }
    }

    // Submit update (Admin)
    async submitUpdate(adminUsername, adminPassword, latestVersion, updateContent, downloadUrl, minVersion) {
        if (adminUsername !== this.adminConfig.username || adminPassword !== this.adminConfig.password) {
            return { code: 401, message: '管理员身份验证失败' };
        }

        const versionInfo = {
            latest_version: latestVersion,
            update_content: updateContent,
            download_url: downloadUrl,
            min_version: minVersion
        };

        const versionFile = path.join(__dirname, '../version_info.txt');
        try {
            fs.writeFileSync(versionFile, JSON.stringify(versionInfo, null, 2));
            return { code: 200, message: '更新信息提交成功', data: versionInfo };
        } catch (error) {
            return { code: 500, message: '版本信息写入失败' };
        }
    }

    // Upload Avatar
    async uploadAvatar(username, file) {
        try {
            const [rows] = await db.execute('SELECT id FROM users WHERE username = ?', [username]);
            if (rows.length === 0) {
                return { code: 404, message: '用户不存在' };
            }

            // File is already uploaded by multer, we just need to update the DB
            // Assuming file path is relative to public/avatars or similar
            // In server.js we set static path for /avatars
            const relativePath = 'avatars/' + file.filename;
            
            await db.execute('UPDATE users SET avatar = ? WHERE username = ?', [relativePath, username]);

            const avatarUrl = `${this.baseUrl}/${relativePath}`;

            return {
                code: 200,
                message: '头像上传成功',
                data: {
                    avatar_path: relativePath,
                    avatar_url: avatarUrl
                }
            };
        } catch (error) {
            return { code: 500, message: '头像上传失败: ' + error.message };
        }
    }

    // Get Avatar
    async getAvatar(username) {
        try {
            const [rows] = await db.execute('SELECT avatar FROM users WHERE username = ?', [username]);
            if (rows.length === 0) {
                return { code: 404, message: '用户不存在' };
            }

            const avatarPath = rows[0].avatar;
            if (!avatarPath) {
                return { code: 404, message: '用户未设置头像' };
            }

            // Check if file exists
            // We need to resolve the path correctly. Assuming 'avatars/' is in api/avatars/
            const fullPath = path.join(__dirname, '../', avatarPath);
            if (!fs.existsSync(fullPath)) {
                return { code: 404, message: '头像文件不存在' };
            }

            return {
                code: 200,
                message: '获取头像成功',
                data: {
                    avatar_path: avatarPath,
                    avatar_url: `${this.baseUrl}/${avatarPath}`
                }
            };
        } catch (error) {
            return { code: 500, message: '获取头像失败: ' + error.message };
        }
    }
}

module.exports = new User();
