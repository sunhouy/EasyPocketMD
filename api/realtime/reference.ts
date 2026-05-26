const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// 静态文件服务
app.use(express.static('public'));

// 存储所有连接的客户端
const clients = new Map(); // ws -> { userId, roomId, passwordVerified }
const rooms = new Map();    // roomId -> { password: string|null, clients: Set of ws }

wss.on('connection', (ws, req) => {
    clients.set(ws, { userId: null, roomId: null, passwordVerified: false, pendingPassword: null });

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            switch (data.type) {
                case 'join':
                    handleJoin(ws, data);
                    break;
                case 'verify-password':
                    handleVerifyPassword(ws, data);
                    break;
                case 'offer':
                case 'answer':
                case 'ice-candidate':
                case 'hangup':
                    forwardToPeer(ws, data);
                    break;
                case 'leave':
                    handleLeave(ws);
                    break;
                default:
            }
        } catch (error) {
            console.error('解析消息失败:', error);
        }
    });

    ws.on('close', () => {
        handleLeave(ws);
    });
});

function handleJoin(ws, data) {
    const { userId, roomId, password } = data;
    const client = clients.get(ws);
    client.userId = userId;
    client.roomId = roomId;

    // 检查房间是否存在
    if (!rooms.has(roomId)) {
        // 创建新房间，设置密码
        rooms.set(roomId, {
            password: password || null,
            clients: new Set()
        });
        client.passwordVerified = true;
    } else {
        const room = rooms.get(roomId);
        // 检查房间是否需要密码
        if (room.password) {
            // 房间有密码，需要验证
            if (password) {
                // 用户提供了密码，直接验证
                if (password === room.password) {
                    client.passwordVerified = true;
                } else {
                    ws.send(JSON.stringify({
                        type: 'password-error',
                        message: '密码错误'
                    }));
                    return;
                }
            } else {
                // 用户没有提供密码，要求输入密码
                client.pendingPassword = true;
                ws.send(JSON.stringify({
                    type: 'password-required',
                    message: '该房间需要密码'
                }));
                return;
            }
        } else {
            // 房间没有密码，直接加入
            client.passwordVerified = true;
        }
    }

    // 加入房间
    rooms.get(roomId).clients.add(ws);

    // 通知用户已成功加入
    ws.send(JSON.stringify({
        type: 'joined',
        message: '已成功加入房间'
    }));

    // 通知房间内其他用户有新用户加入
    rooms.get(roomId).clients.forEach((clientWs) => {
        if (clientWs !== ws && clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({
                type: 'user-joined',
                userId: userId
            }));
        }
    });

}

function handleVerifyPassword(ws, data) {
    const { password } = data;
    const client = clients.get(ws);

    if (!client || !client.roomId || !client.pendingPassword) {
        return;
    }

    const room = rooms.get(client.roomId);
    if (!room || !room.password) {
        return;
    }

    if (password === room.password) {
        // 密码正确
        client.passwordVerified = true;
        client.pendingPassword = false;

        // 加入房间
        room.clients.add(ws);

        // 通知用户已成功加入
        ws.send(JSON.stringify({
            type: 'joined',
            message: '已成功加入房间'
        }));

        // 通知房间内其他用户有新用户加入
        room.clients.forEach((clientWs) => {
            if (clientWs !== ws && clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(JSON.stringify({
                    type: 'user-joined',
                    userId: client.userId
                }));
            }
        });

    } else {
        // 密码错误
        ws.send(JSON.stringify({
            type: 'password-error',
            message: '密码错误'
        }));
    }
}

function forwardToPeer(ws, data) {
    const client = clients.get(ws);
    if (!client || !client.roomId || !client.passwordVerified) return;

    const room = rooms.get(client.roomId);
    if (!room) return;

    // 转发给房间内的其他用户（不转发给自己）
    room.clients.forEach((peerWs) => {
        if (peerWs !== ws && peerWs.readyState === WebSocket.OPEN) {
            peerWs.send(JSON.stringify({
                type: data.type,
                from: client.userId,
                data: data.data
            }));
        }
    });
}

function handleLeave(ws) {
    const client = clients.get(ws);
    if (client && client.roomId) {
        const room = rooms.get(client.roomId);
        if (room) {
            room.clients.delete(ws);
            // 通知房间内其他用户
            room.clients.forEach((peerWs) => {
                if (peerWs.readyState === WebSocket.OPEN) {
                    peerWs.send(JSON.stringify({
                        type: 'user-left',
                        userId: client.userId
                    }));
                }
            });
            if (room.clients.size === 0) {
                rooms.delete(client.roomId);
            }
        }
    }
    clients.delete(ws);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`信令服务器运行在 http://localhost:${PORT}`);
});