const { undoTextChange } = require('../../api/utils/selectiveUndo');
const collaboration = require('../../api/models/ShareCollaboration');
const manager = require('../../api/models/ShareManager');
const db = require('../../api/config/db');
jest.mock('../../api/config/db');

describe('Selective collaboration undo', () => {
    test.each([
        ['hello', 'hello Alice', 'hello Alice', 'hello'],
        ['one\ntwo', 'one Alice\ntwo', 'one Alice\ntwo Bob', 'one\ntwo Bob'],
        ['one\ntwo', 'one Alice\ntwo', 'Bob\none Alice\ntwo', 'Bob\none\ntwo'],
        ['one deleted\ntwo', 'one\ntwo', 'one\ntwo Bob', 'one deleted\ntwo Bob'],
        ['原文\n第二段', '修改\n第二段', '修改\n第二段 新增', '原文\n第二段 新增'],
        ['a\nb\nc', 'a1\nb\nc1', 'a1\nb2\nc1', 'a\nb2\nc'],
    ])('preserves independent edits: %s → %s', (before, after, current, expected) => {
        expect(undoTextChange(before, after, current)).toBe(expected);
    });
    it('rejects overlapping edits instead of using fuzzy patches', () => {
        expect(() => undoTextChange('hello', 'hello Alice', 'hello Alicia')).toThrow('已被其他编辑改写');
    });
    it('undoes successive edits by one user while preserving another user’s later paragraph', async () => {
        const events = [
            { id: 2, before_content: 'one Alice\ntwo', after_content: 'one Alice!\ntwo' },
            { id: 1, before_content: 'one\ntwo', after_content: 'one Alice\ntwo' },
        ];
        const cx = { execute: jest.fn(async sql => sql.startsWith('SELECT') ? [events] : [{ insertId: 3 }]) };
        const result = await collaboration.undo(cx, { share_id: 's', content: 'one Alice!\ntwo Bob', content_version: 4, username: 'owner', filename: 'x.md' }, 'owner', null, 'user:Alice');
        expect(result.content).toBe('one\ntwo Bob');
        expect(result.undone_events).toEqual([2, 1]);
    });
    it('writes nothing when any selected edit overlaps', async () => {
        const cx = { execute: jest.fn().mockResolvedValue([[{ id: 1, before_content: 'old', after_content: 'new' }]]) };
        await expect(collaboration.undo(cx, { share_id: 's', content: 'changed again', content_version: 2 }, 'owner', 1, null)).rejects.toMatchObject({ code: 409 });
        expect(cx.execute).toHaveBeenCalledTimes(1);
    });
});

describe('Owner permission management', () => {
    let cx;
    beforeEach(() => {
        jest.spyOn(collaboration, 'ensureSchema').mockResolvedValue(undefined);
        cx = { execute: jest.fn(async sql => sql.includes('FROM file_shares') ? [[{ share_id: 's', username: 'owner', filename: 'x.md', mode: 'edit', content: 'old', content_version: 1 }]] : [[]]), beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn(), release: jest.fn() };
        db.getConnection.mockResolvedValue(cx);
    });
    it('rejects management by a non-owner', async () => {
        expect((await manager.manageEditorEdits('other', 's', 'permission', { actor_key: 'user:Alice' })).code).toBe(403);
        expect(cx.commit).not.toHaveBeenCalled();
    });
    it('persists revocation and supports restoring permission', async () => {
        expect((await manager.manageEditorEdits('owner', 's', 'permission', { actor_key: 'user:Alice', revoked: true })).code).toBe(200);
        expect(cx.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT IGNORE INTO share_edit_blocks'), ['s', 'user:Alice']);
        expect((await manager.manageEditorEdits('owner', 's', 'permission', { actor_key: 'user:Alice', revoked: false })).code).toBe(200);
        expect(cx.execute).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM share_edit_blocks'), ['s', 'user:Alice']);
    });
    it('does not allow removing the owner’s own authority', async () => {
        expect((await manager.manageEditorEdits('owner', 's', 'permission', { actor_key: 'user:owner' })).code).toBe(400);
        expect(cx.commit).not.toHaveBeenCalled();
    });
});
