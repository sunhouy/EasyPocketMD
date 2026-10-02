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

    const wss = new WebSocketServer({ noServer: true });
    const roomMap = new Map();
    const connectionTimeout = new Map();
    const HEARTBEAT_INTERVAL = 30000;
    const CONNECTION_TIMEOUT = 60000;

    function cleanupConnection(socket, shareId) {
        if (connectionTimeout.has(socket)) {
            clearTimeout(connectionTimeout.get(socket));
            connectionTimeout.delete(socket);
        }
        removeClientFromRoom(shareId, socket);
        if (socket.ctx) {
            socket.ctx = null;
        }
    }

    function resetConnectionTimeout(socket, shareId) {
        if (connectionTimeout.has(socket)) {
            clearTimeout(connectionTimeout.get(socket));
        }
        const timeout = setTimeout(() => {
            console.log(`[WebSocket] Connection timeout, closing: ${shareId}`);
            socket.terminate();
        }, CONNECTION_TIMEOUT);
        connectionTimeout.set(socket, timeout);
    }

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

    async function refreshClient(client, sendContent = false) {
        if (!client.ctx || client.readyState !== 1) return;
        const ctx = client.ctx;
        const access = await shareManager.getSharedFile(ctx.shareId, ctx.password, { editorUsername: ctx.editorUsername, viewerId: ctx.viewerId, editPassword: ctx.editPassword });
        if (access.code !== 200) { client.close(1008, 'share access removed'); return; }
        const changed = ctx.canEdit !== !!access.data.can_edit;
        ctx.canEdit = !!access.data.can_edit;
        if (!ctx.canEdit) ctx.cursor = null;
        if (changed) {
            await shareManager.updateSharePresence(ctx.shareId, ctx.viewerId, ctx.viewerName, false, ctx.canEdit);
            client.send(JSON.stringify({ type: 'permission_changed', can_edit: ctx.canEdit }));
            broadcast(ctx.shareId, { type: 'cursor', viewer_id: ctx.viewerId, cursor: null });
        }
        if (sendContent) client.send(JSON.stringify({ type: 'doc_updated', ...access.data, updated_by: 'owner-action' }));
    }
    wss.refreshRoom = async (shareId, sendContent = false) => {
        const room = roomMap.get(shareId);
        if (!room) return;
        await Promise.all([...room].map(client => refreshClient(client, sendContent)));
        await broadcastPresence(shareId);
    };

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
            viewerId,
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
            viewerName: verifiedEditorUsername || viewerName,
            actorKey: verifiedEditorUsername ? 'user:' + verifiedEditorUsername : 'guest:' + viewerId,
            canEdit: !!shareResult.data.can_edit,
            contentVersion: shareResult.data.content_version || 1,
            lastHeartbeat: Date.now()
        };

        addClientToRoom(shareId, socket);
        resetConnectionTimeout(socket, shareId);

        await shareManager.updateSharePresence(shareId, viewerId, socket.ctx.viewerName, false, socket.ctx.canEdit);

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
        for (const client of roomMap.get(shareId) || []) {
            if (client !== socket && client.ctx?.cursor) socket.send(JSON.stringify({ type: 'cursor', viewer_id: client.ctx.viewerId, viewer_name: client.ctx.viewerName, cursor: client.ctx.cursor }));
        }

        socket.on('message', async (rawMessage) => {
            resetConnectionTimeout(socket, shareId);
            const payload = safeJsonParse(String(rawMessage || ''));
            if (!payload || !payload.type) {
                socket.send(JSON.stringify({ type: 'error', code: 400, message: 'invalid message' }));
                return;
            }

            if (!socket.ctx) return;
            if (payload.type === 'heartbeat' || payload.type === 'cursor' || String(payload.type).startsWith('video')) {
                if (!socket.ctx.permissionCheckedAt || Date.now() - socket.ctx.permissionCheckedAt > 1000) {
                    socket.ctx.permissionCheckedAt = Date.now();
                    await refreshClient(socket);
                }
                if (!socket.ctx || socket.readyState !== 1) return;
            }
            if (payload.type === 'cursor') {
                if (!socket.ctx.canEdit) return;
                const cursor = payload.cursor;
                if (cursor && (!Number.isSafeInteger(cursor.markdown_offset) || cursor.markdown_offset < 0 || cursor.markdown_offset > 50000000 || !['sv', 'ir', 'wysiwyg'].includes(cursor.mode))) return;
                if (socket.ctx.cursorAt && Date.now() - socket.ctx.cursorAt < 80) return;
                socket.ctx.cursorAt = Date.now();
                socket.ctx.cursor = cursor ? { markdown_offset: cursor.markdown_offset, text_offset: Math.max(0, Math.min(50000000, Number(cursor.text_offset) || 0)), mode: cursor.mode, content_version: Number(cursor.content_version) || 0, fingerprint: String(cursor.fingerprint || '').slice(0, 16), context_before: String(cursor.context_before || '').slice(-40), context_after: String(cursor.context_after || '').slice(0, 40) } : null;
                broadcast(shareId, { type: 'cursor', viewer_id: socket.ctx.viewerId, viewer_name: socket.ctx.viewerName, cursor: socket.ctx.cursor });
                return;
            }
            if (payload.type === 'heartbeat') {
                await shareManager.updateSharePresence(
                    socket.ctx.shareId,
                    socket.ctx.viewerId,
                    socket.ctx.viewerName,
                    socket.ctx.canEdit && toBoolean(payload.is_editing),
                    socket.ctx.canEdit
                );
                await broadcastPresence(socket.ctx.shareId);
                return;
            }

            if (
                payload.type === 'video_call_invite' ||
                payload.type === 'video_call_response' ||
                payload.type === 'video_signal' ||
                payload.type === 'video_offer' ||
                payload.type === 'video_answer' ||
                payload.type === 'video_ice_candidate' ||
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

                if (payload.type === 'video_offer') {
                    targetClient.send(JSON.stringify({
                        type: 'video_offer',
                        call_id: callId,
                        from_viewer_id: socket.ctx.viewerId,
                        from_viewer_name: socket.ctx.viewerName,
                        sdp: payload.sdp || ''
                    }));
                    return;
                }

                if (payload.type === 'video_answer') {
                    targetClient.send(JSON.stringify({
                        type: 'video_answer',
                        call_id: callId,
                        from_viewer_id: socket.ctx.viewerId,
                        from_viewer_name: socket.ctx.viewerName,
                        sdp: payload.sdp || ''
                    }));
                    return;
                }

                if (payload.type === 'video_ice_candidate') {
                    targetClient.send(JSON.stringify({
                        type: 'video_ice_candidate',
                        call_id: callId,
                        from_viewer_id: socket.ctx.viewerId,
                        from_viewer_name: socket.ctx.viewerName,
                        candidate: payload.candidate || null
                    }));
                    return;
                }
            }

            if (
                payload.type === 'video_room_join' ||
                payload.type === 'video_room_leave' ||
                payload.type === 'video_room_signal'
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
                        baseVersion: Number.isInteger(payload.base_version) ? payload.base_version : Number(payload.base_version),
                        baseContent: typeof payload.base_content === 'string' ? payload.base_content : undefined,
                        manualSave: payload.manual_save === true || payload.create_history === true
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
                    // 协作文档不显示冲突提示，静默使用最新版本
                    socket.ctx.contentVersion = updateResult.data.content_version || socket.ctx.contentVersion;
                    socket.send(JSON.stringify({
                        type: 'doc_updated',
                        share_id: socket.ctx.shareId,
                        content: updateResult.data.content,
                        last_modified: updateResult.data.last_modified,
                        content_version: updateResult.data.content_version,
                        updated_by: 'server'
                    }));
                    return;
                }

                if (updateResult.code === 403) { socket.ctx.canEdit = false; socket.send(JSON.stringify({ type: 'permission_changed', can_edit: false })); }
                socket.send(JSON.stringify({
                    type: 'error',
                    code: updateResult.code || 500,
                    message: updateResult.message || 'update failed'
                }));
            }
        });

        socket.on('error', (err) => {
            console.error('[WebSocket] Connection error:', err);
            cleanupConnection(socket, shareId);
        });

        socket.on('close', async (code, reason) => {
            console.log(`[WebSocket] Connection closed: code=${code}, reason=${reason}`);
            if (socket.ctx && socket.ctx.videoRoomJoined) {
                getEditableClients(shareId, socket.ctx.viewerId).forEach(client => {
                    if (client.readyState === 1) {
                        client.send(JSON.stringify({
                            type: 'video_room_peer_left',
                            room_id: shareId,
                            viewer_id: socket.ctx.viewerId,
                            viewer_name: socket.ctx.viewerName
                        }));
                    }
                });
            }
            broadcast(shareId, { type: 'cursor', viewer_id: viewerId, cursor: null });
            await shareManager.updateSharePresence(shareId, viewerId, socket.ctx?.viewerName || viewerName, false, socket.ctx ? socket.ctx.canEdit : false);
            await broadcastPresence(shareId);
            cleanupConnection(socket, shareId);
        });
    });

    const roomCleanup = setInterval(() => {
        for (const [shareId, room] of roomMap.entries()) {
            if (room.size === 0) {
                roomMap.delete(shareId);
            }
        }
    }, 60000);

    wss.on('close', () => clearInterval(roomCleanup));
    return wss;
}

module.exports = {
    initShareCollabServer
};
