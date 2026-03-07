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

        it('should verify token correctly', async () => {
            const data = { username: 'testuser', token: 'testuser' };
            const result = await auth.verifyTokenOrPassword(mockUserModel, data);
            expect(result.code).toBe(200);
        });

        it('should reject invalid token', async () => {
            const data = { username: 'testuser', token: 'wrongtoken' };
            const result = await auth.verifyTokenOrPassword(mockUserModel, data);
            expect(result.code).toBe(401);
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
