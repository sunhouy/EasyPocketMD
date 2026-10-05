export {};
jest.mock('../../api/config/db', () => ({ execute: jest.fn() }));
const db = require('../../api/config/db');
const { ensureFileCreatedAt } = require('../../api/utils/file-created-at');
beforeEach(() => jest.resetAllMocks());
it('adds a nullable creation column once without inventing dates for existing rows', async () => {
    db.execute.mockResolvedValueOnce([[]]).mockResolvedValueOnce([{}]);
    await ensureFileCreatedAt();
    expect(db.execute).toHaveBeenLastCalledWith('ALTER TABLE user_files ADD COLUMN created_at TIMESTAMP NULL DEFAULT NULL');
    expect(db.execute.mock.calls.flat().join(' ')).not.toContain('UPDATE user_files');
});
it('does nothing when the column already exists', async () => {
    db.execute.mockResolvedValue([[{ Field: 'created_at' }]]); await ensureFileCreatedAt(); expect(db.execute).toHaveBeenCalledTimes(1);
});
it('allows another server to complete the same migration concurrently', async () => {
    db.execute.mockResolvedValueOnce([[]]).mockRejectedValueOnce({ code: 'ER_DUP_FIELDNAME' }); await expect(ensureFileCreatedAt()).resolves.toBeUndefined();
});
it('does not hide a database migration failure', async () => {
    db.execute.mockResolvedValueOnce([[]]).mockRejectedValueOnce(new Error('permission denied')); await expect(ensureFileCreatedAt()).rejects.toThrow('permission denied');
});
