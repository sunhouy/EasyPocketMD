const { URL } = require('url');
const userModel = require('../models/User');
const { verifyTokenOrPassword } = require('../utils/auth');

let WebSocketServer;
try {
    ({ WebSocketServer } = require('ws'));
} catch (error) {
    WebSocketServer = null;
}

function toBoolean(value) {
    return value === true || value === 'true' || value === 1 || value === '1';
}

function safeJsonParse(raw) {
    try {
        return JSON.parse(raw);
    } catch (error) {
        return null;
    }
}

function initShareCollabServer(httpServer, shareManager) {
    if (!httpServer || !shareManager || !WebSocketServer) {
        return null;
    }

    const wss = new WebSocketServer({ server: httpServer, path: '/api/share/ws' });
    const roomMap = new Map();

    function addClientToRoom(shareId, client) {
        if (!roomMap.has(shareId)) {
            roomMap.set(shareId, new Set());
        }
        roomMap.get(shareId).add(client);
    }

    function removeClientFromRoom(shareId, client) {
        const room = roomMap.get(shareId);
        if (!room) return;
        room.delete(client);
        if (room.size === 0) {
            roomMap.delete(shareId);
        }
    }

    function broadcast(shareId, payload) {
        const room = roomMap.get(shareId);
        if (!room) return;
        const message = JSON.stringify(payload);
        room.forEach(client => {
            if (client.readyState === 1) {
                client.send(message);
            }
        });
    }

    function findClientByViewerId(shareId, viewerId) {
        const room = roomMap.get(shareId);
        if (!room) return null;
        for (const client of room) {
            if (client && client.ctx && client.ctx.viewerId === viewerId) {
                return client;
            }
        }
        return null;
    }

    function getEditableClients(shareId, excludeViewerId) {
        const room = roomMap.get(shareId);
        if (!room) return [];
        const result = [];
        room.forEach(client => {
            if (!client || client.readyState !== 1 || !client.ctx || !client.ctx.canEdit) return;
            if (excludeViewerId && client.ctx.viewerId === excludeViewerId) return;
            result.push(client);
        });
        return result;
    }

    async function broadcastPresence(shareId) {
        const presenceResult = await shareManager.getSharePresence(shareId);
        if (presenceResult.code !== 200) return;
        broadcast(shareId, {
            type: 'presence',
            share_id: shareId,
            online_users: presenceResult.data.online_users || [],
            online_count: presenceResult.data.online_count || 0
        });
    }

    wss.on('connection', async (socket, request) => {
        const urlObj = new URL(request.url, 'http://localhost');
        const shareId = String(urlObj.searchParams.get('share_id') || '').trim();
        const password = String(urlObj.searchParams.get('password') || '').trim();
        const viewerId = String(urlObj.searchParams.get('viewer_id') || '').trim();
        const viewerName = String(urlObj.searchParams.get('viewer_name') || '').trim() || 'Guest';
        const editPassword = String(urlObj.searchParams.get('edit_password') || '').trim();
        const editorUsername = String(urlObj.searchParams.get('editor_username') || '').trim();
        const editorToken = String(urlObj.searchParams.get('editor_token') || '').trim();
        const editorPassword = String(urlObj.searchParams.get('editor_password') || '').trim();

        if (!shareId || !viewerId) {
            socket.close(1008, 'missing params');
            return;
        }

        let verifiedEditorUsername = '';
        if (editorUsername) {
            const verifyResult = await verifyTokenOrPassword(userModel, {
                username: editorUsername,
                token: editorToken,
                password: editorPassword
            });
            if (verifyResult.code === 200) {
                verifiedEditorUsername = editorUsername;
            }
        }

        const shareResult = await shareManager.getSharedFile(shareId, password, {
            editorUsername: verifiedEditorUsername,
            editPassword
        });
        if (shareResult.code !== 200) {
            socket.close(1008, 'auth failed');
            return;
        }

        socket.ctx = {
            shareId,
            password,
            editPassword,
            editorUsername: verifiedEditorUsername,
            viewerId,
            viewerName,
            canEdit: !!shareResult.data.can_edit,
            contentVersion: shareResult.data.content_version || 1
        };

        addClientToRoom(shareId, socket);

        await shareManager.updateSharePresence(shareId, viewerId, viewerName, false, socket.ctx.canEdit);

        socket.send(JSON.stringify({
            type: 'ready',
            share_id: shareId,
            can_edit: socket.ctx.canEdit,
            edit_policy: shareResult.data.edit_policy,
            content: shareResult.data.content,
            last_modified: shareResult.data.last_modified,
            content_version: shareResult.data.content_version || 1
        }));

        await broadcastPresence(shareId);

        socket.on('message', async (rawMessage) => {
            const payload = safeJsonParse(String(rawMessage || ''));
            if (!payload || !payload.type) {
                socket.send(JSON.stringify({ type: 'error', code: 400, message: 'invalid message' }));
                return;
            }

            if (payload.type === 'heartbeat') {
                await shareManager.updateSharePresence(
                    socket.ctx.shareId,
                    socket.ctx.viewerId,
                    socket.ctx.viewerName,
                    toBoolean(payload.is_editing),
                    socket.ctx.canEdit
                );
                await broadcastPresence(socket.ctx.shareId);
                return;
            }

            if (
                payload.type === 'video_call_invite' ||
                payload.type === 'video_call_response' ||
                payload.type === 'video_signal' ||
                payload.type === 'video_call_hangup'
            ) {
                if (!socket.ctx.canEdit) {
                    socket.send(JSON.stringify({ type: 'error', code: 403, message: 'no edit permission for video call' }));
                    return;
                }

                const targetViewerId = String(payload.target_viewer_id || '').trim();
                if (!targetViewerId) {
                    socket.send(JSON.stringify({ type: 'error', code: 400, message: 'missing target_viewer_id' }));
                    return;
                }

                const targetClient = findClientByViewerId(socket.ctx.shareId, targetViewerId);
                if (!targetClient || targetClient.readyState !== 1 || !targetClient.ctx || !targetClient.ctx.canEdit) {
                    socket.send(JSON.stringify({
                        type: 'video_call_unavailable',
                        code: 404,
                        target_viewer_id: targetViewerId,
                        message: 'target unavailable'
                    }));
                    return;
                }

                const callId = String(payload.call_id || '').trim();

                if (payload.type === 'video_call_invite') {
                    targetClient.send(JSON.stringify({
                        type: 'video_call_invite',
                        call_id: callId,
                        share_id: socket.ctx.shareId,
                        from_viewer_id: socket.ctx.viewerId,
                        from_viewer_name: socket.ctx.viewerName,
                        from_can_edit: true
                    }));
                    return;
                }

                if (payload.type === 'video_call_response') {
                    targetClient.send(JSON.stringify({
                        type: 'video_call_response',
                        call_id: callId,
                        accepted: !!payload.accepted,
                        reason: payload.reason ? String(payload.reason) : '',
                        from_viewer_id: socket.ctx.viewerId,
                        from_viewer_name: socket.ctx.viewerName
                    }));
                    return;
                }

                if (payload.type === 'video_call_hangup') {
                    targetClient.send(JSON.stringify({
                        type: 'video_call_hangup',
                        call_id: callId,
                        from_viewer_id: socket.ctx.viewerId,
                        from_viewer_name: socket.ctx.viewerName
                    }));
                    return;
                }

                if (payload.type === 'video_signal') {
                    targetClient.send(JSON.stringify({
                        type: 'video_signal',
                        call_id: callId,
                        from_viewer_id: socket.ctx.viewerId,
                        from_viewer_name: socket.ctx.viewerName,
                        signal: payload.signal || null
                    }));
                    return;
                }
            }

            if (
                payload.type === 'video_room_join' ||
                payload.type === 'video_room_leave' ||
                payload.type === 'video_room_signal' ||
                payload.type === 'video_sfu_join'
            ) {
                if (!socket.ctx.canEdit) {
                    socket.send(JSON.stringify({ type: 'error', code: 403, message: 'no edit permission for group video call' }));
                    return;
                }

                if (payload.type === 'video_room_join') {
                    socket.ctx.videoRoomJoined = true;
                    const participants = getEditableClients(socket.ctx.shareId, socket.ctx.viewerId).map(client => ({
                        viewer_id: client.ctx.viewerId,
                        viewer_name: client.ctx.viewerName
                    }));

                    socket.send(JSON.stringify({
                        type: 'video_room_participants',
                        room_id: socket.ctx.shareId,
                        participants
                    }));

                    getEditableClients(socket.ctx.shareId, socket.ctx.viewerId).forEach(client => {
                        client.send(JSON.stringify({
                            type: 'video_room_peer_joined',
                            room_id: socket.ctx.shareId,
                            viewer_id: socket.ctx.viewerId,
                            viewer_name: socket.ctx.viewerName
                        }));
                    });
                    return;
                }

                if (payload.type === 'video_room_leave') {
                    socket.ctx.videoRoomJoined = false;
                    getEditableClients(socket.ctx.shareId, socket.ctx.viewerId).forEach(client => {
                        client.send(JSON.stringify({
                            type: 'video_room_peer_left',
                            room_id: socket.ctx.shareId,
                            viewer_id: socket.ctx.viewerId,
                            viewer_name: socket.ctx.viewerName
                        }));
                    });
                    return;
                }

                if (payload.type === 'video_sfu_join') {
                    socket.send(JSON.stringify({
                        type: 'video_sfu_entry',
                        code: 200,
                        room_id: socket.ctx.shareId,
                        strategy: 'external_sfu',
                        message: 'sfu entry placeholder'
                    }));
                    return;
                }

                if (payload.type === 'video_room_signal') {
                    const targetViewerId = String(payload.target_viewer_id || '').trim();
                    if (!targetViewerId) {
                        socket.send(JSON.stringify({ type: 'error', code: 400, message: 'missing target_viewer_id' }));
                        return;
                    }

                    const targetClient = findClientByViewerId(socket.ctx.shareId, targetViewerId);
                    if (!targetClient || targetClient.readyState !== 1 || !targetClient.ctx || !targetClient.ctx.canEdit) {
                        socket.send(JSON.stringify({
                            type: 'video_call_unavailable',
                            code: 404,
                            target_viewer_id: targetViewerId,
                            message: 'target unavailable'
                        }));
                        return;
                    }

                    targetClient.send(JSON.stringify({
                        type: 'video_room_signal',
                        room_id: socket.ctx.shareId,
                        from_viewer_id: socket.ctx.viewerId,
                        from_viewer_name: socket.ctx.viewerName,
                        signal: payload.signal || null
                    }));
                    return;
                }
            }

            if (payload.type === 'sync_request') {
                const latestResult = await shareManager.getSharedFile(socket.ctx.shareId, socket.ctx.password, {
                    editorUsername: socket.ctx.editorUsername,
                    editPassword: socket.ctx.editPassword
                });
                if (latestResult.code === 200) {
                    socket.send(JSON.stringify({
                        type: 'doc_updated',
                        share_id: socket.ctx.shareId,
                        content: latestResult.data.content,
                        last_modified: latestResult.data.last_modified,
                        content_version: latestResult.data.content_version || 1,
                        updated_by: 'server'
                    }));
                }
                return;
            }

            if (payload.type === 'update_content') {
                if (!socket.ctx.canEdit) {
                    socket.send(JSON.stringify({ type: 'error', code: 403, message: 'no edit permission' }));
                    return;
                }

                const updateResult = await shareManager.updateSharedFile(
                    socket.ctx.shareId,
                    String(payload.content || ''),
                    socket.ctx.password,
                    {
                        editorUsername: socket.ctx.editorUsername,
                        editPassword: socket.ctx.editPassword,
                        viewerId: socket.ctx.viewerId,
                        viewerName: socket.ctx.viewerName,
                        baseVersion: Number.isInteger(payload.base_version) ? payload.base_version : Number(payload.base_version)
                    }
                );

                if (updateResult.code === 200) {
                    socket.ctx.contentVersion = updateResult.data.content_version || socket.ctx.contentVersion;
                    broadcast(socket.ctx.shareId, {
                        type: 'doc_updated',
                        share_id: socket.ctx.shareId,
                        content: updateResult.data.content,
                        last_modified: updateResult.data.last_modified,
                        content_version: updateResult.data.content_version,
                        updated_by: socket.ctx.viewerId
                    });
                    return;
                }

                if (updateResult.code === 409) {
                    socket.send(JSON.stringify({
                        type: 'conflict',
                        code: 409,
                        message: updateResult.message,
                        latest: updateResult.data
                    }));
                    return;
                }

                socket.send(JSON.stringify({
                    type: 'error',
                    code: updateResult.code || 500,
                    message: updateResult.message || 'update failed'
                }));
            }
        });

        socket.on('close', async () => {
            if (socket.ctx && socket.ctx.videoRoomJoined) {
                getEditableClients(shareId, socket.ctx.viewerId).forEach(client => {
                    client.send(JSON.stringify({
                        type: 'video_room_peer_left',
                        room_id: shareId,
                        viewer_id: socket.ctx.viewerId,
                        viewer_name: socket.ctx.viewerName
                    }));
                });
            }
            removeClientFromRoom(shareId, socket);
            await shareManager.updateSharePresence(shareId, viewerId, viewerName, false, socket.ctx ? socket.ctx.canEdit : false);
            await broadcastPresence(shareId);
        });
    });

    return wss;
}

module.exports = {
    initShareCollabServer
};

