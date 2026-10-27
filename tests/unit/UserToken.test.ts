const userModel = require('../../api/models/User');
const db = require('../../api/config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

jest.mock('../../api/config/db');
jest.mock('bcryptjs');
jest.mock('jsonwebtoken');

describe('UserModel non-expiring tokens', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('generates tokens without expiration options', () => {
        jwt.sign.mockReturnValue('token123');

        expect(userModel.generateToken('testuser')).toBe('token123');
        expect(jwt.sign).toHaveBeenCalledWith(
            { username: 'testuser' },
            expect.any(String)
        );
        expect(jwt.sign.mock.calls[0]).toHaveLength(2);
    });

    it('issues a non-expiring token when an existing user logs in', async () => {
        db.execute
            .mockResolvedValueOnce([[
                {
                    id: 1,
                    username: 'testuser',
                    password: 'hashed_password',
                    is_member: 1,
                    last_login: '2023-01-01',
                    login_count: 5
                }
            ]])
            .mockResolvedValueOnce([]);
        bcrypt.compare.mockResolvedValue(true);
        jwt.sign.mockReturnValue('non-expiring-token');

        const result = await userModel.login('testuser', 'password');

        expect(result.code).toBe(200);
        expect(result.data.token).toBe('non-expiring-token');
        expect(jwt.sign).toHaveBeenCalledWith(
            { username: 'testuser' },
            expect.any(String)
        );
        expect(jwt.sign.mock.calls[0]).toHaveLength(2);
    });
});
