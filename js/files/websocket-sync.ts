export function createWebSocketClient(ctx: {
    getToken: () => string | null,
    onReady: () => void,
    onFileUpdated: (data: any) => void,
    onFileSaved: (data: any) => void,
    onFileList: (data: any) => void,
    onDisconnected: () => void,
}) {
    let ws: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let heartbeatTimer: number | null = null;
    let connected = false;

    function getWsUrl() {
        const token = ctx.getToken();
        if (!token) return null;
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        return protocol + '//' + host + '/api/files/ws?token=' + encodeURIComponent(token);
    }

    function connect() {
        const url = getWsUrl();
        if (!url) return;

        disconnect();

        ws = new WebSocket(url);

        ws.onopen = function() {
            connected = true;
            ctx.onReady();
            startHeartbeat();
        };

        ws.onmessage = function(event) {
            try {
                const payload = JSON.parse(event.data);
                switch (payload.type) {
                    case 'file_updated':
                        ctx.onFileUpdated(payload);
                        break;
                    case 'file_saved':
                        ctx.onFileSaved(payload);
                        break;
                    case 'file_list':
                        ctx.onFileList(payload);
                        break;
                    case 'heartbeat_ack':
                        break;
                    case 'ready':
                        break;
                    case 'error':
                        console.warn('[WS] Error:', payload.message);
                        break;
                    default:
                        console.warn('[WS] Unknown message type:', payload.type);
                        break;
                }
            } catch (e) {
                console.warn('[WS] Parse error:', e);
            }
        };

        ws.onclose = function() {
            connected = false;
            stopHeartbeat();
            ctx.onDisconnected();
            scheduleReconnect();
        };

        ws.onerror = function() {
            if (ws) {
                ws.close();
            }
        };
    }

    function disconnect() {
        cancelReconnect();
        stopHeartbeat();
        if (ws) {
            ws.onopen = null;
            ws.onmessage = null;
            ws.onclose = null;
            ws.onerror = null;
            ws.close();
            ws = null;
        }
        connected = false;
    }

    function scheduleReconnect() {
        cancelReconnect();
        reconnectTimer = window.setTimeout(function() {
            reconnectTimer = null;
            connect();
        }, 3000);
    }

    function cancelReconnect() {
        if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
        }
    }

    function startHeartbeat() {
        stopHeartbeat();
        heartbeatTimer = window.setInterval(function() {
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'heartbeat' }));
            }
        }, 20000);
    }

    function stopHeartbeat() {
        if (heartbeatTimer) {
            clearInterval(heartbeatTimer);
            heartbeatTimer = null;
        }
    }

    function send(data: any): boolean {
        if (!ws || ws.readyState !== WebSocket.OPEN) return false;
        ws.send(JSON.stringify(data));
        return true;
    }

    function isConnected(): boolean {
        return connected;
    }

    return {
        connect,
        disconnect,
        send,
        isConnected,
    };
}

export function createSyncThrottle(sendFn: (data: any) => void) {
    const DEBOUNCE_MS = 1000;
    const THROTTLE_MS = 2000;

    let debounceTimer: number | null = null;
    let lastSendTime = 0;
    let pendingData: any = null;

    function schedule(data: any) {
        pendingData = data;

        if (debounceTimer) {
            clearTimeout(debounceTimer);
        }

        debounceTimer = window.setTimeout(function() {
            debounceTimer = null;
            tryFlush();
        }, DEBOUNCE_MS);
    }

    function tryFlush() {
        if (!pendingData) return;

        const now = Date.now();
        const timeSinceLastSend = now - lastSendTime;

        if (timeSinceLastSend >= THROTTLE_MS) {
            doSend();
        } else {
            const waitMs = THROTTLE_MS - timeSinceLastSend;
            if (debounceTimer) {
                clearTimeout(debounceTimer);
            }
            debounceTimer = window.setTimeout(function() {
                debounceTimer = null;
                tryFlush();
            }, waitMs);
        }
    }

    function doSend() {
        if (!pendingData) return;
        lastSendTime = Date.now();
        const data = pendingData;
        pendingData = null;
        sendFn(data);
    }

    function flush() {
        if (debounceTimer) {
            clearTimeout(debounceTimer);
            debounceTimer = null;
        }
        if (pendingData) {
            doSend();
        }
    }

    function cancel() {
        if (debounceTimer) {
            clearTimeout(debounceTimer);
            debounceTimer = null;
        }
        pendingData = null;
    }

    return { schedule, flush, cancel };
}