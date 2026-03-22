const userModel = require('../../api/models/User');
const db = require('../../api/config/db');
const bcrypt = require('bcryptjs');

jest.mock('../../api/config/db');
jest.mock('bcryptjs');

describe('UserModel', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('register', () => {
        it('should register a new user successfully', async () => {
            const mockConnection = {
                beginTransaction: jest.fn(),
                commit: jest.fn(),
                rollback: jest.fn(),
                execute: jest.fn()
                    .mockResolvedValueOnce([[]]) // Check username existence
                    .mockResolvedValueOnce([{ insertId: 1 }]), // Insert user
                release: jest.fn()
            };
            db.getConnection.mockResolvedValue(mockConnection);
            bcrypt.genSalt.mockResolvedValue('salt');
            bcrypt.hash.mockResolvedValue('hashed_password');

            const result = await userModel.register('newuser', 'password123');

            expect(result.code).toBe(200);
            expect(result.message).toBe('注册成功');
            expect(mockConnection.execute).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO users'),
                ['newuser', 'hashed_password', null]
            );
        });

        it('should reward inviter if invite code is provided', async () => {
             const mockConnection = {
                beginTransaction: jest.fn(),
                commit: jest.fn(),
                rollback: jest.fn(),
                execute: jest.fn()
                    .mockResolvedValueOnce([[]]) // Check username existence
                    .mockResolvedValueOnce([[{ id: 101 }]]) // Verify invite code (inviter check)
                    .mockResolvedValueOnce([{ insertId: 1 }]) // Insert user
                    .mockResolvedValueOnce([]) // Update new user membership
                    .mockResolvedValueOnce([]) // Insert member record for new user
                    .mockResolvedValueOnce([[{ id: 101, is_member: 0, expire_date: null }]]) // Get inviter info
                    .mockResolvedValueOnce([]) // Update inviter membership
                    .mockResolvedValueOnce([]), // Insert member record for inviter
                release: jest.fn()
            };
            db.getConnection.mockResolvedValue(mockConnection);
            bcrypt.genSalt.mockResolvedValue('salt');
            bcrypt.hash.mockResolvedValue('hashed');

            const result = await userModel.register('newuser', 'password', 'inviter_name');

            expect(result.code).toBe(200);
            expect(mockConnection.commit).toHaveBeenCalled();
        });
    });

    describe('login', () => {
        it('should login successfully with correct credentials', async () => {
            db.execute.mockResolvedValueOnce([[
                { id: 1, username: 'testuser', password: 'hashed_password', is_member: 1, last_login: '2023-01-01', login_count: 5 }
            ]]);
            bcrypt.compare.mockResolvedValue(true);

            const result = await userModel.login('testuser', 'password');

            expect(result.code).toBe(200);
            expect(result.data.username).toBe('testuser');
            expect(db.execute).toHaveBeenCalledWith(
                expect.stringContaining('UPDATE users SET last_login = NOW()'),
                [1]
            );
        });

        it('should fail with incorrect password', async () => {
            db.execute.mockResolvedValueOnce([[{ id: 1, password: 'hashed' }]]);
            bcrypt.compare.mockResolvedValue(false);

            const result = await userModel.login('testuser', 'wrong');

            expect(result.code).toBe(401);
            expect(result.message).toBe('密码错误');
        });
    });

    describe('activateMember', () => {
        it('should activate membership with valid code', async () => {
            const mockConnection = {
                beginTransaction: jest.fn(),
                commit: jest.fn(),
                rollback: jest.fn(),
                execute: jest.fn()
                    .mockResolvedValueOnce([[{ id: 1, is_member: 0, expire_date: null }]]) // Get user
                    .mockResolvedValueOnce([[{ id: 501, member_days: 30 }]]) // Get auth code
                    .mockResolvedValueOnce([]) // Update user
                    .mockResolvedValueOnce([]) // Update auth code
                    .mockResolvedValueOnce([]), // Insert record
                release: jest.fn()
            };
            db.getConnection.mockResolvedValue(mockConnection);

            const result = await userModel.activateMember('testuser', 'VALID_CODE');

            expect(result.code).toBe(200);
            expect(result.message).toBe('会员开通成功');
            expect(result.data.added_days).toBe(30);
        });
    });
});
