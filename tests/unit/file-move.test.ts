/** @jest-environment jsdom */
// @ts-nocheck
export {};
const { relocateFile } = require('../../js/files/relocate');
const fileManager = require('../../api/models/FileManager');
const db = require('../../api/config/db');
const Cache = require('../../api/utils/cache');
jest.mock('../../api/config/db');
jest.mock('../../api/models/HistoryManager');
jest.mock('../../api/utils/cache');

describe('transactional folder move', () => {
    let connection: any;
    let rows: any[];
    beforeEach(() => {
        rows = [
            { id: 1, filename: 'a/' }, { id: 2, filename: 'a/sub/' },
            { id: 3, filename: 'a/sub/note.md' }, { id: 4, filename: 'another/note.md' }
        ];
        connection = {
            beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn(), release: jest.fn(),
            execute: jest.fn(async (sql: string) => {
                if (sql.startsWith('SELECT id FROM users')) return [[{ id: 7 }]];
                if (sql.startsWith('SELECT id, filename')) return [rows];
                return [{ affectedRows: 1 }];
            })
        };
        db.getConnection.mockResolvedValue(connection);
    });

    it('moves every descendant without rewriting or deleting content', async () => {
        expect(await fileManager.moveFile('user', 'a', 'b/a', true)).toMatchObject({ code: 200, data: { moved: 3 } });
        const updates = connection.execute.mock.calls.filter(([sql]: any[]) => sql.startsWith('UPDATE user_files'));
        expect(updates.map(([, values]: any[]) => values[0])).toEqual(['b/a/', 'b/a/sub/', 'b/a/sub/note.md']);
        expect(connection.execute.mock.calls.some(([sql]: any[]) => /DELETE|SET content/.test(sql))).toBe(false);
        expect(connection.execute).toHaveBeenCalledWith(expect.stringContaining('UPDATE file_history'), ['b/a/sub/note.md', 7, 'a/sub/note.md']);
        expect(Cache.deleteFileContent).toHaveBeenCalledWith('user', 'a/sub/note.md');
        expect(Cache.deleteFileContent).toHaveBeenCalledWith('user', 'b/a/sub/note.md');
        expect(connection.commit).toHaveBeenCalledTimes(1);
    });

    it('rolls back all names when any descendant update fails', async () => {
        connection.execute.mockImplementation(async (sql: string, values: any[]) => {
            if (sql.startsWith('SELECT id FROM users')) return [[{ id: 7 }]];
            if (sql.startsWith('SELECT id, filename')) return [rows];
            if (values[0] === 'b/a/sub/note.md') throw new Error('database unavailable');
            return [{ affectedRows: 1 }];
        });
        expect(await fileManager.moveFile('user', 'a', 'b/a', true)).toMatchObject({ code: 500 });
        expect(connection.rollback).toHaveBeenCalledTimes(1);
        expect(connection.commit).not.toHaveBeenCalled();
    });

    it('rejects a collision with a virtual destination folder', async () => {
        rows.push({ id: 5, filename: 'b/a/sub/existing.md' });
        expect(await fileManager.moveFile('user', 'a', 'b/a', true)).toMatchObject({ code: 409 });
        expect(connection.execute.mock.calls.some(([sql]: any[]) => sql.startsWith('UPDATE'))).toBe(false);
    });

    it('rejects moving a folder inside itself', async () => {
        expect(await fileManager.moveFile('user', 'a', 'a/sub/a', true)).toMatchObject({ code: 400 });
        expect(db.getConnection).not.toHaveBeenCalled();
    });
});

describe('local folder move state', () => {
    let state: any;
    beforeEach(() => {
        state = {
            currentUser: { username: 'user', token: 'token' },
            files: [
                { id: 'folder', name: 'a', type: 'folder', isSynced: true },
                { id: 'sub', name: 'a/sub', type: 'folder', isSynced: true },
                { id: 'note', name: 'a/sub/note.md', type: 'file', contentLoaded: false, isSynced: true }
            ],
            waitForFileSync: jest.fn().mockResolvedValue(undefined),
            syncFileToServer: jest.fn().mockResolvedValue(true), startAutoSave: jest.fn()
        };
        global.fetch = jest.fn().mockResolvedValue({ json: async () => ({ code: 200 }) });
    });

    it('preserves unloaded file content and all nested folder records', async () => {
        await relocateFile(state, 'folder', 'b/a');
        expect(state.files.map((file: any) => file.name)).toEqual(['b/a', 'b/a/sub', 'b/a/sub/note.md']);
        expect(state.files[2].content).toBeUndefined();
        expect(state.files[2].contentLoaded).toBe(false);
        expect(state.syncFileToServer).not.toHaveBeenCalled();
        expect(global.fetch).toHaveBeenCalledWith('api/files/move', expect.anything());
    });

    it('keeps every old path when the server move fails', async () => {
        (global.fetch as jest.Mock).mockResolvedValue({ json: async () => ({ code: 500, message: 'failed' }) });
        await expect(relocateFile(state, 'folder', 'b/a')).rejects.toThrow('failed');
        expect(state.files.map((file: any) => file.name)).toEqual(['a', 'a/sub', 'a/sub/note.md']);
        expect(state.fileRelocationInProgress).toBe(false);
    });

    it('saves local-only records under their original names before moving', async () => {
        state.files[1].isSynced = false;
        await relocateFile(state, 'folder', 'b/a');
        expect(state.syncFileToServer).toHaveBeenCalledWith('sub', { background: false, relocation: true });
        expect(state.syncFileToServer.mock.invocationCallOrder[0]).toBeLessThan((global.fetch as jest.Mock).mock.invocationCallOrder[0]);
    });
});
