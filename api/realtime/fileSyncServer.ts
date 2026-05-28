const { URL } = require('url');
const { verifyJwtToken } = require('../utils/auth');
const fileManager = require('../models/FileManager');

let WebSocketServer;
try {
    ({ WebSocketServer } = require('ws'));
} catch (error) {
    WebSocketServer = null;
}

function safeJsonParse(raw) {
    try {
        return JSON.parse(raw);
    } catch (error) {
        return null;
    }
}

function initFileSyncServer(httpServer) {
    if (!httpServer) return null;

    if (!WebSocketServer) {
        console.error('[fileSyncServer] ws library not available, cannot start WebSocket server');
        return null;
    }

    let wss;
    try {
        wss = new WebSocketServer({ noServer: true });
        console.log('[fileSyncServer] WebSocket server created (noServer mode)');
    } catch (e) {
        console.error('[fileSyncServer] Failed to create WebSocketServer:', e.message);
        return null;
    }
    const userSockets = new Map();
    const HEARTBEAT_INTERVAL = 25000;

    function getUserRoom(username) {
        if (!userSockets.has(username)) {
            userSockets.set(username, new Set());
        }
        return userSockets.get(username);
    }

    function addToUserRoom(username, socket) {
        getUserRoom(username).add(socket);
    }

    function removeFromUserRoom(username, socket) {
        const room = userSockets.get(username);
        if (!room) return;
        room.delete(socket);
        if (room.size === 0) userSockets.delete(username);
    }

    function broadcastToUser(username, payload, excludeSocket) {
        const room = userSockets.get(username);
        if (!room) return;
        const message = JSON.stringify(payload);
        room.forEach(function(client) {
            if (client === excludeSocket) return;
            if (client.readyState === 1) client.send(message);
        });
    }

    wss.on('connection', function(socket, request) {
        const urlObj = new URL(request.url, 'http://localhost');
        const token = String(urlObj.searchParams.get('token') || '').trim();

        if (!token) {
            socket.close(1008, 'missing token');
            return;
        }

        const decoded = verifyJwtToken(token);
        if (!decoded || !decoded.username) {
            socket.close(1008, 'invalid token');
            return;
        }

        const username = decoded.username;
        socket.ctx = { username: username, lastHeartbeat: Date.now() };

        addToUserRoom(username, socket);

        socket.send(JSON.stringify({
            type: 'ready',
            username: username,
            message: 'connected'
        }));

        socket.on('message', async function(rawMessage) {
            const payload = safeJsonParse(String(rawMessage || ''));
            if (!payload || !payload.type) {
                socket.send(JSON.stringify({ type: 'error', code: 400, message: 'invalid message' }));
                return;
            }

            if (payload.type === 'heartbeat') {
                socket.ctx.lastHeartbeat = Date.now();
                socket.send(JSON.stringify({ type: 'heartbeat_ack' }));
                return;
            }

            if (payload.type === 'file_save') {
                const filename = String(payload.filename || '').trim();
                const content = String(payload.content || '');
                const baseContent = typeof payload.base_content === 'string' ? payload.base_content : undefined;
                const baseContentVersion = payload.base_content_version;
                const e2eEnabled = payload.e2e_enabled ? 1 : 0;

                if (!filename) {
                    socket.send(JSON.stringify({ type: 'error', code: 400, message: 'missing filename' }));
                    return;
                }

                const optimisticLock: { base_content?: string; base_content_version?: any } = {};
                if (baseContent !== undefined) optimisticLock.base_content = baseContent;
                if (baseContentVersion !== undefined && baseContentVersion !== null && baseContentVersion !== '') {
                    optimisticLock.base_content_version = baseContentVersion;
                }

                try {
                    const result = await fileManager.saveFile(username, filename, content, optimisticLock, { e2e_enabled: e2eEnabled });

                    socket.send(JSON.stringify({
                        type: 'file_saved',
                        filename: filename,
                        content: result.data && result.data.content ? result.data.content : content,
                        content_version: result.data && result.data.content_version ? result.data.content_version : null,
                        last_modified: result.data && result.data.last_modified ? result.data.last_modified : null,
                        merged_by_crdt: result.data && result.data.merged_by_crdt ? true : false,
                        code: result.code,
                        message: result.message
                    }));

                    if (result.code === 200 && result.data) {
                        broadcastToUser(username, {
                            type: 'file_updated',
                            filename: filename,
                            content: result.data.content,
                            content_version: result.data.content_version,
                            last_modified: result.data.last_modified,
                            e2e_enabled: result.data.e2e_enabled
                        }, socket);
                    }
                } catch (error) {
                    socket.send(JSON.stringify({
                        type: 'error',
                        code: 500,
                        message: 'save error: ' + error.message
                    }));
                }
                return;
            }

            if (payload.type === 'pull_files') {
                try {
                    const result = await fileManager.getUserFiles(username);
                    socket.send(JSON.stringify({
                        type: 'file_list',
                        code: result.code,
                        data: result.data
                    }));
                } catch (error) {
                    socket.send(JSON.stringify({
                        type: 'error',
                        code: 500,
                        message: 'pull error: ' + error.message
                    }));
                }
                return;
            }
        });

        socket.on('close', function() {
            removeFromUserRoom(username, socket);
        });

        socket.on('error', function() {
            removeFromUserRoom(username, socket);
        });
    });

    const heartbeatCheck = setInterval(function() {
        wss.clients.forEach(function(client) {
            if (!client.ctx) return;
            if (Date.now() - client.ctx.lastHeartbeat > 2 * HEARTBEAT_INTERVAL) {
                client.terminate();
            }
        });
    }, HEARTBEAT_INTERVAL);

    wss.on('close', function() {
        clearInterval(heartbeatCheck);
    });

    return wss;
}

module.exports = { initFileSyncServer };