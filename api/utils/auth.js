const bcrypt = require('bcryptjs');

// Hash password
const hashPassword = async (password) => {
    const salt = await bcrypt.genSalt(10);
    return await bcrypt.hash(password, salt);
};

// Verify password
const verifyPassword = async (password, hashedPassword) => {
    return await bcrypt.compare(password, hashedPassword);
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

    // Token verification (simple check as in PHP)
    if (token) {
        if (token !== username) {
            return {
                code: 401,
                message: 'Token验证失败'
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
    verifyTokenOrPassword
};
