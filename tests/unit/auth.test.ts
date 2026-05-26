const auth = require('../../api/utils/auth');

describe('Auth Utils', () => {
    describe('hashPassword', () => {
        it('should hash a password', async () => {
            const password = 'mysecretpassword';
            const hash = await auth.hashPassword(password);
            expect(hash).toBeDefined();
            expect(hash).not.toBe(password);
            expect(hash.length).toBeGreaterThan(0);
        });
    });

    describe('verifyPassword', () => {
        it('should verify a correct password', async () => {
            const password = 'mysecretpassword';
            const hash = await auth.hashPassword(password);
            const isMatch = await auth.verifyPassword(password, hash);
            expect(isMatch).toBe(true);
        });

        it('should reject an incorrect password', async () => {
            const password = 'mysecretpassword';
            const hash = await auth.hashPassword(password);
            const isMatch = await auth.verifyPassword('wrongpassword', hash);
            expect(isMatch).toBe(false);
        });
    });

    describe('verifyJwtToken', () => {
        it('should verify a valid JWT token', () => {
            // 使用测试密钥生成一个有效的 token
            const jwt = require('jsonwebtoken');
            const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
            const token = jwt.sign({ username: 'testuser' }, JWT_SECRET, { expiresIn: '1h' });
            
            const decoded = auth.verifyJwtToken(token);
            expect(decoded).not.toBeNull();
            expect(decoded.username).toBe('testuser');
        });

        it('should reject an invalid token', () => {
            const decoded = auth.verifyJwtToken('invalid-token');
            expect(decoded).toBeNull();
        });

        it('should reject an expired token', () => {
            const jwt = require('jsonwebtoken');
            const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
            // 生成一个已经过期的 token
            const token = jwt.sign({ username: 'testuser', exp: Math.floor(Date.now() / 1000) - 10 }, JWT_SECRET);
            
            const decoded = auth.verifyJwtToken(token);
            expect(decoded).toBeNull();
        });
    });

    describe('verifyTokenOrPassword', () => {
        // Mock userModel
        const mockUserModel = {
            login: jest.fn()
        };

        beforeEach(() => {
            mockUserModel.login.mockReset();
        });

        it('should return error if username is missing', async () => {
            const result = await auth.verifyTokenOrPassword(mockUserModel, {});
            expect(result.code).toBe(400);
            expect(result.message).toContain('username');
        });

        it('should verify valid JWT token correctly', async () => {
            const jwt = require('jsonwebtoken');
            const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
            const token = jwt.sign({ username: 'testuser' }, JWT_SECRET, { expiresIn: '1h' });
            
            const data = { username: 'testuser', token: token };
            const result = await auth.verifyTokenOrPassword(mockUserModel, data);
            expect(result.code).toBe(200);
        });

        it('should reject invalid JWT token', async () => {
            const data = { username: 'testuser', token: 'invalid-jwt-token' };
            const result = await auth.verifyTokenOrPassword(mockUserModel, data);
            expect(result.code).toBe(401);
            expect(result.message).toContain('Token验证失败');
        });

        it('should reject JWT token with mismatched username', async () => {
            const jwt = require('jsonwebtoken');
            const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
            const token = jwt.sign({ username: 'otheruser' }, JWT_SECRET, { expiresIn: '1h' });
            
            const data = { username: 'testuser', token: token };
            const result = await auth.verifyTokenOrPassword(mockUserModel, data);
            expect(result.code).toBe(401);
            expect(result.message).toContain('Token用户名不匹配');
        });

        it('should call userModel.login when password is provided', async () => {
            const data = { username: 'testuser', password: 'password123' };
            mockUserModel.login.mockResolvedValue({ code: 200 });
            
            const result = await auth.verifyTokenOrPassword(mockUserModel, data);
            
            expect(mockUserModel.login).toHaveBeenCalledWith('testuser', 'password123');
            expect(result.code).toBe(200);
        });

        it('should return error if neither token nor password is provided', async () => {
            const data = { username: 'testuser' };
            const result = await auth.verifyTokenOrPassword(mockUserModel, data);
            expect(result.code).toBe(401);
        });
    });
});
