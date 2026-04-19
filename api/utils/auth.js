const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// JWT 密钥，从环境变量获取或使用默认值
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Hash password
const hashPassword = async (password) => {
    const salt = await bcrypt.genSalt(10);
    return await bcrypt.hash(password, salt);
};

// Verify password
const verifyPassword = async (password, hashedPassword) => {
    return await bcrypt.compare(password, hashedPassword);
};

// Verify JWT token
const verifyJwtToken = (token) => {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (error) {
        return null;
    }
};

// Verify token or password (from PHP verifyTokenOrPassword)
const verifyTokenOrPassword = async (userModel, data) => {
    const username = data.username || '';
    const token = data.token || '';
    const password = data.password || '';

    if (!username) {
        return {
            code: 400,
            message: '缺少必要参数: username'
        };
    }

    // JWT Token verification
    if (token) {
        const decoded = verifyJwtToken(token);
        if (!decoded) {
            return {
                code: 401,
                message: 'Token验证失败或已过期'
            };
        }
        // 验证 token 中的用户名是否匹配
        if (decoded.username !== username) {
            return {
                code: 401,
                message: 'Token用户名不匹配'
            };
        }
        return { code: 200 };
    }

    // Password verification
    if (password) {
        return await userModel.login(username, password);
    }

    return {
        code: 401,
        message: '需要提供token或密码进行身份验证'
    };
};

module.exports = {
    hashPassword,
    verifyPassword,
    verifyTokenOrPassword,
    verifyJwtToken
};
