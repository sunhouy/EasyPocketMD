const userModel = require('../../api/models/User');
const db = require('../../api/config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');

jest.mock('../../api/config/db');
jest.mock('bcryptjs');
jest.mock('jsonwebtoken');
jest.mock('fs');

describe('UserModel', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('encryptPassword', () => {
        it('should encrypt password successfully', async () => {
            bcrypt.genSalt.mockResolvedValue('salt');
            bcrypt.hash.mockResolvedValue('hashed');

            const result = await userModel.encryptPassword('password');

            expect(result).toBe('hashed');
            expect(bcrypt.genSalt).toHaveBeenCalledWith(10);
            expect(bcrypt.hash).toHaveBeenCalledWith('password', 'salt');
        });
    });

    describe('verifyPassword', () => {
        it('should verify password correctly', async () => {
            bcrypt.compare.mockResolvedValue(true);

            const result = await userModel.verifyPassword('password', 'hashed');

            expect(result).toBe(true);
            expect(bcrypt.compare).toHaveBeenCalledWith('password', 'hashed');
        });
    });

    describe('generateToken', () => {
        it('should generate JWT token', () => {
            jwt.sign.mockReturnValue('token123');

            const result = userModel.generateToken('testuser');

            expect(result).toBe('token123');
            expect(jwt.sign).toHaveBeenCalled();
        });
    });

    describe('verifyToken', () => {
        it('should verify valid token', () => {
            jwt.verify.mockReturnValue({ username: 'testuser' });

            const result = userModel.verifyToken('validtoken');

            expect(result).toEqual({ username: 'testuser' });
        });

        it('should return null for invalid token', () => {
            jwt.verify.mockImplementation(() => { throw new Error('Invalid token'); });

            const result = userModel.verifyToken('invalidtoken');

            expect(result).toBeNull();
        });
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
                ['newuser', 'hashed_password', null, 0]
            );
        });

        it('should fail with invalid username format', async () => {
            const result = await userModel.register('ab', 'password123');
            
            expect(result.code).toBe(400);
            expect(result.message).toContain('用户名必须是3-20个字符');
        });

        it('should fail with invalid password length', async () => {
            const result = await userModel.register('testuser', '12345');
            
            expect(result.code).toBe(400);
            expect(result.message).toContain('密码必须是6-30个字符');
        });

        it('should fail if username already exists', async () => {
            const mockConnection = {
                beginTransaction: jest.fn(),
                commit: jest.fn(),
                rollback: jest.fn(),
                execute: jest.fn().mockResolvedValueOnce([[{ id: 1 }]]),
                release: jest.fn()
            };
            db.getConnection.mockResolvedValue(mockConnection);

            const result = await userModel.register('existinguser', 'password123');

            expect(result.code).toBe(409);
            expect(result.message).toBe('用户名已存在');
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

        it('should handle database error during registration', async () => {
            const mockConnection = {
                beginTransaction: jest.fn(),
                commit: jest.fn(),
                rollback: jest.fn(),
                execute: jest.fn().mockRejectedValue(new Error('DB Error')),
                release: jest.fn()
            };
            db.getConnection.mockResolvedValue(mockConnection);

            const result = await userModel.register('newuser', 'password123');

            expect(result.code).toBe(500);
            expect(result.message).toContain('注册失败');
        });
    });

    describe('login', () => {
        it('should login successfully with correct credentials', async () => {
            db.execute.mockResolvedValueOnce([[
                { id: 1, username: 'testuser', password: 'hashed_password', is_member: 1, last_login: '2023-01-01', login_count: 5 }
            ]]);
            bcrypt.compare.mockResolvedValue(true);
            jwt.sign.mockReturnValue('testtoken');

            const result = await userModel.login('testuser', 'password');

            expect(result.code).toBe(200);
            expect(result.data.username).toBe('testuser');
            expect(result.data.token).toBe('testtoken');
            expect(db.execute).toHaveBeenCalledWith(
                expect.stringContaining('UPDATE users SET last_login = NOW()'),
                [1]
            );
        });

        it('should fail with non-existent username', async () => {
            db.execute.mockResolvedValueOnce([[]]);

            const result = await userModel.login('nonexistent', 'password');

            expect(result.code).toBe(401);
            expect(result.message).toBe('用户名不存在');
        });

        it('should fail with incorrect password', async () => {
            db.execute.mockResolvedValueOnce([[{ id: 1, password: 'hashed' }]]);
            bcrypt.compare.mockResolvedValue(false);

            const result = await userModel.login('testuser', 'wrong');

            expect(result.code).toBe(401);
            expect(result.message).toBe('密码错误');
        });

        it('should handle database error during login', async () => {
            db.execute.mockRejectedValue(new Error('DB Error'));

            const result = await userModel.login('testuser', 'password');

            expect(result.code).toBe(500);
            expect(result.message).toContain('登录失败');
        });
    });

    describe('checkMemberStatus', () => {
        it('should return member status successfully', async () => {
            db.execute.mockResolvedValueOnce([[{
                is_member: 1,
                expire_date: '2024-12-31',
                created_at: '2023-01-01',
                last_login: '2024-01-01'
            }]]);

            const result = await userModel.checkMemberStatus('testuser');

            expect(result.code).toBe(200);
            expect(result.data.is_member).toBe(1);
        });

        it('should fail if user not found', async () => {
            db.execute.mockResolvedValueOnce([[]]);

            const result = await userModel.checkMemberStatus('nonexistent');

            expect(result.code).toBe(404);
            expect(result.message).toBe('用户不存在');
        });

        it('should handle database error', async () => {
            db.execute.mockRejectedValue(new Error('DB Error'));

            const result = await userModel.checkMemberStatus('testuser');

            expect(result.code).toBe(500);
            expect(result.message).toContain('查询失败');
        });
    });

    describe('addAuthorizationCode', () => {
        it('should add authorization code successfully with admin credentials', async () => {
            db.execute.mockResolvedValueOnce([[]]).mockResolvedValueOnce([{ insertId: 1 }]);
            bcrypt.genSalt.mockResolvedValue('salt');
            bcrypt.hash.mockResolvedValue('hashedcode');

            const result = await userModel.addAuthorizationCode('admin', '127127sun', 'TESTCODE', 30);

            expect(result.code).toBe(200);
            expect(result.message).toBe('授权码添加成功');
        });

        it('should fail with invalid admin credentials', async () => {
            const result = await userModel.addAuthorizationCode('wrong', 'wrong', 'TESTCODE', 30);

            expect(result.code).toBe(401);
            expect(result.message).toBe('管理员身份验证失败');
        });

        it('should fail if authorization code already exists', async () => {
            db.execute.mockResolvedValueOnce([[{ id: 1 }]]);

            const result = await userModel.addAuthorizationCode('admin', '127127sun', 'EXISTING', 30);

            expect(result.code).toBe(400);
            expect(result.message).toBe('授权码已存在');
        });

        it('should handle database error', async () => {
            db.execute.mockRejectedValue(new Error('DB Error'));

            const result = await userModel.addAuthorizationCode('admin', '127127sun', 'TESTCODE', 30);

            expect(result.code).toBe(500);
            expect(result.message).toContain('授权码添加失败');
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

        it('should fail if user not found', async () => {
            const mockConnection = {
                beginTransaction: jest.fn(),
                rollback: jest.fn(),
                execute: jest.fn().mockResolvedValueOnce([[]]),
                release: jest.fn()
            };
            db.getConnection.mockResolvedValue(mockConnection);

            const result = await userModel.activateMember('nonexistent', 'VALID_CODE');

            expect(result.code).toBe(404);
            expect(result.message).toBe('用户不存在');
        });

        it('should fail with invalid authorization code', async () => {
            const mockConnection = {
                beginTransaction: jest.fn(),
                rollback: jest.fn(),
                execute: jest.fn()
                    .mockResolvedValueOnce([[{ id: 1, is_member: 0, expire_date: null }]])
                    .mockResolvedValueOnce([[]]),
                release: jest.fn()
            };
            db.getConnection.mockResolvedValue(mockConnection);

            const result = await userModel.activateMember('testuser', 'INVALID_CODE');

            expect(result.code).toBe(400);
            expect(result.message).toBe('无效的授权码');
        });

        it('should handle database error', async () => {
            const mockConnection = {
                beginTransaction: jest.fn(),
                rollback: jest.fn(),
                execute: jest.fn().mockRejectedValue(new Error('DB Error')),
                release: jest.fn()
            };
            db.getConnection.mockResolvedValue(mockConnection);

            const result = await userModel.activateMember('testuser', 'VALID_CODE');

            expect(result.code).toBe(500);
            expect(result.message).toContain('开通会员失败');
        });
    });

    describe('adminLogin', () => {
        it('should login successfully with correct admin credentials', async () => {
            const result = await userModel.adminLogin('admin', '127127sun');
            
            expect(result.code).toBe(200);
            expect(result.message).toBe('管理员登录成功');
        });

        it('should fail with incorrect admin credentials', async () => {
            const result = await userModel.adminLogin('admin', 'wrong');
            
            expect(result.code).toBe(401);
            expect(result.message).toBe('管理员账号或密码错误');
        });
    });

    describe('getAllUsers', () => {
        it('should return all users successfully', async () => {
            db.execute.mockResolvedValueOnce([[
                { username: 'user1', is_member: 1 },
                { username: 'user2', is_member: 0 }
            ]]);

            const result = await userModel.getAllUsers();

            expect(result.code).toBe(200);
            expect(result.data.length).toBe(2);
        });

        it('should handle database error', async () => {
            db.execute.mockRejectedValue(new Error('DB Error'));

            const result = await userModel.getAllUsers();

            expect(result.code).toBe(500);
            expect(result.message).toContain('查询失败');
        });
    });

    describe('checkUpdate', () => {
        it('should return no update when version file does not exist', async () => {
            fs.existsSync.mockReturnValue(false);

            const result = await userModel.checkUpdate('1.0.0');

            expect(result.code).toBe(200);
            expect(result.data.need_update).toBe(0);
        });

        it('should return update information when newer version exists', async () => {
            fs.existsSync.mockReturnValue(true);
            fs.readFileSync.mockReturnValue(JSON.stringify({
                latest_version: '2.0.0',
                min_version: '1.0.0',
                update_content: 'New features',
                download_url: 'http://example.com'
            }));

            const result = await userModel.checkUpdate('1.0.0');

            expect(result.code).toBe(200);
            expect(result.data.need_update).toBe(1);
        });

        it('should handle JSON parse error', async () => {
            fs.existsSync.mockReturnValue(true);
            fs.readFileSync.mockReturnValue('invalid json');

            const result = await userModel.checkUpdate('1.0.0');

            expect(result.code).toBe(500);
            expect(result.message).toBe('版本信息解析失败');
        });
    });

    describe('submitUpdate', () => {
        it('should submit update successfully with admin credentials', async () => {
            fs.writeFileSync.mockImplementation(() => {});

            const result = await userModel.submitUpdate(
                'admin', '127127sun', '2.0.0', 'Update content', 'http://example.com', '1.0.0'
            );

            expect(result.code).toBe(200);
            expect(result.message).toBe('更新信息提交成功');
        });

        it('should fail with invalid admin credentials', async () => {
            const result = await userModel.submitUpdate(
                'wrong', 'wrong', '2.0.0', 'Update content', 'http://example.com', '1.0.0'
            );

            expect(result.code).toBe(401);
            expect(result.message).toBe('管理员身份验证失败');
        });

        it('should handle file write error', async () => {
            fs.writeFileSync.mockImplementation(() => { throw new Error('File error'); });

            const result = await userModel.submitUpdate(
                'admin', '127127sun', '2.0.0', 'Update content', 'http://example.com', '1.0.0'
            );

            expect(result.code).toBe(500);
            expect(result.message).toContain('版本信息写入失败');
        });
    });

    describe('uploadAvatar', () => {
        it('should upload avatar successfully', async () => {
            db.execute.mockResolvedValueOnce([[{ id: 1 }]]).mockResolvedValueOnce([]);

            const result = await userModel.uploadAvatar('testuser', { filename: 'avatar.jpg' });

            expect(result.code).toBe(200);
            expect(result.message).toBe('头像上传成功');
        });

        it('should fail if user not found', async () => {
            db.execute.mockResolvedValueOnce([[]]);

            const result = await userModel.uploadAvatar('nonexistent', { filename: 'avatar.jpg' });

            expect(result.code).toBe(404);
            expect(result.message).toBe('用户不存在');
        });

        it('should handle database error', async () => {
            db.execute.mockRejectedValue(new Error('DB Error'));

            const result = await userModel.uploadAvatar('testuser', { filename: 'avatar.jpg' });

            expect(result.code).toBe(500);
            expect(result.message).toContain('头像上传失败');
        });
    });

    describe('getAvatar', () => {
        it('should get avatar successfully', async () => {
            db.execute.mockResolvedValueOnce([[{ avatar: 'avatars/test.jpg' }]]);
            fs.existsSync.mockReturnValue(true);

            const result = await userModel.getAvatar('testuser');

            expect(result.code).toBe(200);
            expect(result.message).toBe('获取头像成功');
        });

        it('should fail if user not found', async () => {
            db.execute.mockResolvedValueOnce([[]]);

            const result = await userModel.getAvatar('nonexistent');

            expect(result.code).toBe(404);
            expect(result.message).toBe('用户不存在');
        });

        it('should fail if user has no avatar', async () => {
            db.execute.mockResolvedValueOnce([[{ avatar: null }]]);

            const result = await userModel.getAvatar('testuser');

            expect(result.code).toBe(404);
            expect(result.message).toBe('用户未设置头像');
        });

        it('should fail if avatar file does not exist', async () => {
            db.execute.mockResolvedValueOnce([[{ avatar: 'avatars/missing.jpg' }]]);
            fs.existsSync.mockReturnValue(false);

            const result = await userModel.getAvatar('testuser');

            expect(result.code).toBe(404);
            expect(result.message).toBe('头像文件不存在');
        });

        it('should handle database error', async () => {
            db.execute.mockRejectedValue(new Error('DB Error'));

            const result = await userModel.getAvatar('testuser');

            expect(result.code).toBe(500);
            expect(result.message).toContain('获取头像失败');
        });
    });

    describe('changePassword', () => {
        it('should change password successfully', async () => {
            const mockConnection = {
                beginTransaction: jest.fn(),
                commit: jest.fn(),
                rollback: jest.fn(),
                execute: jest.fn()
                    .mockResolvedValueOnce([[{ password: 'oldhash' }]])
                    .mockResolvedValueOnce([]),
                release: jest.fn()
            };
            db.getConnection.mockResolvedValue(mockConnection);
            bcrypt.compare.mockResolvedValue(true);
            bcrypt.genSalt.mockResolvedValue('salt');
            bcrypt.hash.mockResolvedValue('newhash');

            const result = await userModel.changePassword('testuser', 'oldpass', 'newpass');

            expect(result.code).toBe(200);
            expect(result.message).toBe('密码修改成功');
        });

        it('should fail if user not found', async () => {
            const mockConnection = {
                beginTransaction: jest.fn(),
                rollback: jest.fn(),
                execute: jest.fn().mockResolvedValueOnce([[]]),
                release: jest.fn()
            };
            db.getConnection.mockResolvedValue(mockConnection);

            const result = await userModel.changePassword('nonexistent', 'oldpass', 'newpass');

            expect(result.code).toBe(404);
            expect(result.message).toBe('用户不存在');
        });

        it('should fail with incorrect current password', async () => {
            const mockConnection = {
                beginTransaction: jest.fn(),
                rollback: jest.fn(),
                execute: jest.fn().mockResolvedValueOnce([[{ password: 'oldhash' }]]),
                release: jest.fn()
            };
            db.getConnection.mockResolvedValue(mockConnection);
            bcrypt.compare.mockResolvedValue(false);

            const result = await userModel.changePassword('testuser', 'wrongpass', 'newpass');

            expect(result.code).toBe(401);
            expect(result.message).toBe('当前密码错误');
        });

        it('should handle database error', async () => {
            const mockConnection = {
                beginTransaction: jest.fn(),
                rollback: jest.fn(),
                execute: jest.fn().mockRejectedValue(new Error('DB Error')),
                release: jest.fn()
            };
            db.getConnection.mockResolvedValue(mockConnection);

            const result = await userModel.changePassword('testuser', 'oldpass', 'newpass');

            expect(result.code).toBe(500);
            expect(result.message).toContain('密码修改失败');
        });
    });

    describe('deleteAccount', () => {
        it('should delete account successfully', async () => {
            const mockConnection = {
                beginTransaction: jest.fn(),
                commit: jest.fn(),
                rollback: jest.fn(),
                execute: jest.fn()
                    .mockResolvedValueOnce([[{ id: 1 }]])
                    .mockResolvedValueOnce([])
                    .mockResolvedValueOnce([])
                    .mockResolvedValueOnce([])
                    .mockResolvedValueOnce([])
                    .mockResolvedValueOnce([]),
                release: jest.fn()
            };
            db.getConnection.mockResolvedValue(mockConnection);

            const result = await userModel.deleteAccount('testuser');

            expect(result.code).toBe(200);
            expect(result.message).toBe('账户已成功注销');
        });

        it('should fail if user not found', async () => {
            const mockConnection = {
                beginTransaction: jest.fn(),
                rollback: jest.fn(),
                execute: jest.fn().mockResolvedValueOnce([[]]),
                release: jest.fn()
            };
            db.getConnection.mockResolvedValue(mockConnection);

            const result = await userModel.deleteAccount('nonexistent');

            expect(result.code).toBe(404);
            expect(result.message).toBe('用户不存在');
        });

        it('should handle database error', async () => {
            const mockConnection = {
                beginTransaction: jest.fn(),
                rollback: jest.fn(),
                execute: jest.fn().mockRejectedValue(new Error('DB Error')),
                release: jest.fn()
            };
            db.getConnection.mockResolvedValue(mockConnection);

            const result = await userModel.deleteAccount('testuser');

            expect(result.code).toBe(500);
            expect(result.message).toContain('注销账户失败');
        });
    });
});
