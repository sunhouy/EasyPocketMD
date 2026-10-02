const { EventEmitter } = require('events');
jest.mock('ws', () => ({ WebSocketServer: class extends require('events').EventEmitter {} }));
jest.mock('../../api/utils/auth', () => ({ verifyTokenOrPassword: jest.fn().mockResolvedValue({ code: 200 }) }));
const { initShareCollabServer } = require('../../api/realtime/shareCollabServer');

describe('Collaboration cursor transport and live revocation', () => {
    let wss, manager, revoked, sockets;
    async function connect(id, username = '') {
        const socket = new EventEmitter(); socket.readyState = 1; socket.sent = [];
        socket.send = raw => socket.sent.push(JSON.parse(raw));
        socket.close = jest.fn(); socket.terminate = jest.fn();
        await wss.listeners('connection')[0](socket, { url: '/api/share/ws?share_id=s&viewer_id=' + id + '&viewer_name=spoofed&editor_username=' + username + '&editor_token=t' });
        sockets.push(socket); return socket;
    }
    async function message(socket, payload) { await socket.listeners('message')[0](JSON.stringify(payload)); }
    beforeEach(() => {
        revoked = new Set(); sockets = [];
        manager = {
            getSharedFile: jest.fn(async (_, __, options) => ({ code: 200, data: { can_edit: !revoked.has(options.viewerId), content: 'abc', content_version: 1 } })),
            updateSharePresence: jest.fn().mockResolvedValue({ code: 200 }),
            getSharePresence: jest.fn().mockResolvedValue({ code: 200, data: { online_users: [] } }),
            removeSharePresence: jest.fn().mockResolvedValue({ code: 200 }),
            updateSharedFile: jest.fn().mockResolvedValue({ code: 403, message: 'revoked' })
        };
        wss = initShareCollabServer({}, manager);
    });
    afterEach(async () => {
        for (const socket of sockets) if (socket.listeners('close').length) await socket.listeners('close')[0](1000, 'test');
        wss.emit('close');
    });
    it('broadcasts validated cursor coordinates under the authenticated editor name', async () => {
        const alice = await connect('a', 'Alice'), bob = await connect('b', 'Bob');
        await message(alice, { type: 'cursor', viewer_id: 'forged', viewer_name: 'forged', cursor: { markdown_offset: 2, text_offset: 2, mode: 'wysiwyg', fingerprint: 'abc', context_before: 'ab', context_after: 'c' } });
        const cursor = bob.sent.find(x => x.type === 'cursor' && x.cursor);
        expect(cursor.viewer_id).toBe('a'); expect(cursor.viewer_name).toBe('Alice'); expect(cursor.cursor.markdown_offset).toBe(2);
        expect(manager.updateSharePresence).toHaveBeenCalledWith('s', 'a', 'Alice', false, true);
    });
    it('rejects invalid coordinates and readonly cursor injection', async () => {
        revoked.add('r');
        const readonly = await connect('r'), bob = await connect('b');
        await message(readonly, { type: 'cursor', cursor: { markdown_offset: 1, mode: 'sv' } });
        await message(bob, { type: 'cursor', cursor: { markdown_offset: -1, mode: 'sv' } });
        expect(bob.sent.filter(x => x.type === 'cursor' && x.cursor)).toHaveLength(0);
    });
    it('removes a revoked editor’s cursor and refuses further saves on an existing connection', async () => {
        const alice = await connect('a', 'Alice'); await connect('b', 'Bob');
        await message(alice, { type: 'cursor', cursor: { markdown_offset: 1, mode: 'sv' } });
        revoked.add('a'); await wss.refreshRoom('s');
        expect(alice.sent).toContainEqual({ type: 'permission_changed', can_edit: false });
        expect(alice.ctx.cursor).toBeNull();
        expect(manager.updateSharePresence).toHaveBeenCalledWith('s', 'a', 'Alice', false, false);
        await message(alice, { type: 'update_content', content: 'forbidden' });
        expect(manager.updateSharedFile).not.toHaveBeenCalled();
        expect(alice.sent.some(x => x.type === 'error' && x.code === 403)).toBe(true);
        revoked.delete('a'); await wss.refreshRoom('s');
        expect(alice.sent).toContainEqual({ type: 'permission_changed', can_edit: true });
    });
});
