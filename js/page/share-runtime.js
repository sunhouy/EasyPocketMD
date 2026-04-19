    // 处理分享链接
    document.addEventListener('DOMContentLoaded', function() {
        const urlParams = new URLSearchParams(window.location.search);
        const shareId = urlParams.get('share_id');
        const sharePassword = urlParams.get('share_password');

        if (shareId) {
            // 等待 Vditor 初始化完成后再处理分享链接
            function waitForVditor() {
                if (window.vditorReady && window.vditor && typeof window.vditor.setValue === 'function') {
                    // Vditor 已经完全初始化完成
                    handleShareLink(shareId, sharePassword);
                } else {
                    // Vditor 还没有初始化完成，继续等待
                    setTimeout(waitForVditor, 100);
                }
            }
            waitForVditor();
        }
    });

    window.sharedDocState = null;

    function getSharedViewerId() {
        var key = 'shared_viewer_id';
        var id = localStorage.getItem(key);
        if (!id) {
            id = 'viewer-' + Math.random().toString(36).slice(2, 10);
            localStorage.setItem(key, id);
        }
        return id;
    }

    function getSharedViewerName() {
        if (window.currentUser && window.currentUser.username) {
            return window.currentUser.username;
        }
        return 'Guest-' + getSharedViewerId().slice(-4);
    }

    function getEditorIdentityPayload() {
        if (!window.currentUser || !window.currentUser.username) return {};
        return {
            editor_username: window.currentUser.username,
            editor_token: window.currentUser.token,
            editor_password: window.currentUser.password
        };
    }

    async function fetchShareData(shareId, password, editPassword) {
        var apiUrl = (window.getApiBaseUrl ? window.getApiBaseUrl() : 'api') + '/share/get';
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                share_id: shareId,
                password: password,
                edit_password: editPassword || '',
                ...getEditorIdentityPayload()
            })
        });
        return await response.json();
    }

    async function resolveEditAccess(shareData, shareId, sharePassword) {
        var editPassword = '';
        var canEdit = !!shareData.can_edit;

        if (shareData.mode !== 'edit') {
            return { canEdit: false, editPassword: '' };
        }

        if (canEdit) {
            return { canEdit: true, editPassword: '' };
        }

        if (shareData.edit_policy === 'specific') {
            showToast(window.i18n ? window.i18n.t('pleaseLoginFirst') : '此文档仅指定用户可编辑，请先登录正确账号', 'info');
            return { canEdit: false, editPassword: '' };
        }

        if (shareData.edit_policy === 'password') {
            editPassword = window.prompt(window.i18n ? window.i18n.t('enterPassword') : '请输入编辑密码');
            if (!editPassword) {
                return { canEdit: false, editPassword: '' };
            }
            const refreshed = await fetchShareData(shareId, sharePassword, editPassword);
            if (refreshed.code === 200 && refreshed.data && refreshed.data.can_edit) {
                return { canEdit: true, editPassword: editPassword };
            }
            showToast((window.i18n ? window.i18n.t('passwordError') : '编辑密码错误'), 'error');
            return { canEdit: false, editPassword: '' };
        }

        return { canEdit: false, editPassword: '' };
    }

    function setSharedEditorLocked(locked) {
        var container = document.getElementById('vditor');
        if (!container) return;

        // 使用 Vditor 的禁用编辑方法（如果可用）
        if (window.vditor && window.vditor.disabled) {
            window.vditor.disabled(locked);
        }

        // 设置 contenteditable 属性
        var editableNodes = container.querySelectorAll('[contenteditable]');
        editableNodes.forEach(function(node) {
            node.setAttribute('contenteditable', locked ? 'false' : 'true');
        });

        // 设置 textarea 和 input 的 readOnly 属性
        var textInputs = container.querySelectorAll('textarea, input');
        textInputs.forEach(function(node) {
            node.readOnly = !!locked;
        });

        // 添加/移除只读模式的 CSS 类，用于视觉反馈（不使用蒙版）
        if (locked) {
            container.classList.add('vditor-readonly');
            // 禁用工具栏按钮
            var toolbarBtns = container.querySelectorAll('.vditor-toolbar__item, .vditor-toolbar__btn');
            toolbarBtns.forEach(function(btn) {
                btn.style.pointerEvents = 'none';
                btn.style.opacity = '0.5';
            });
        } else {
            container.classList.remove('vditor-readonly');
            // 启用工具栏按钮
            var toolbarBtns = container.querySelectorAll('.vditor-toolbar__item, .vditor-toolbar__btn');
            toolbarBtns.forEach(function(btn) {
                btn.style.pointerEvents = '';
                btn.style.opacity = '';
            });
        }
    }

    function getShareConnectionStatusInfo(status) {
        var s = status || 'connecting';
        if (s === 'connected') {
            return {
                color: '#2da44e',
                text: window.i18n ? window.i18n.t('shareConnConnected') : 'Connected'
            };
        }
        if (s === 'polling') {
            return {
                color: '#f39c12',
                text: window.i18n ? window.i18n.t('shareConnPolling') : 'Polling fallback'
            };
        }
        return {
            color: '#4a90e2',
            text: window.i18n ? window.i18n.t('shareConnConnecting') : 'Connecting'
        };
    }

    function updateShareConnectionStatus(status) {
        if (!window.sharedDocState) return;
        window.sharedDocState.connectionStatus = status;
        renderSharePresence(window.sharedDocState.onlineUsers || []);
    }

    function createShareVideoCallId() {
        return 'call-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);
    }

    function sendShareWsPayload(payload) {
        if (!window.sharedDocState || !window.sharedDocState.ws || !window.sharedDocState.wsConnected) return false;
        if (window.sharedDocState.ws.readyState !== WebSocket.OPEN) return false;
        window.sharedDocState.ws.send(JSON.stringify(payload));
        return true;
    }

    function sendCursorPosition(position, selection) {
        if (!window.sharedDocState || !window.sharedDocState.canEdit) return;

        // 使用文本偏移量而不是像素坐标
        const textOffset = getTextOffset();
        if (textOffset === null) return;

        sendShareWsPayload({
            type: 'cursor_position',
            textOffset: textOffset,
            selection: selection,
            position: position  // 保留像素位置用于本地渲染
        });
    }

    function getTextOffset() {
        try {
            const selection = window.getSelection();
            if (!selection || selection.rangeCount === 0) return null;

            const range = selection.getRangeAt(0);
            const contentElement = document.querySelector('.vditor-ir__preview, .vditor-wysiwyg, .vditor-sv');
            if (!contentElement) return null;

            // 计算从内容开始到光标位置的文本偏移量
            const preRange = document.createRange();
            preRange.selectNodeContents(contentElement);
            preRange.setEnd(range.startContainer, range.startOffset);

            return preRange.toString().length;
        } catch (e) {
            return null;
        }
    }

    function setTextOffset(offset) {
        try {
            const contentElement = document.querySelector('.vditor-ir__preview, .vditor-wysiwyg, .vditor-sv');
            if (!contentElement) return false;

            const walker = document.createTreeWalker(
                contentElement,
                NodeFilter.SHOW_TEXT,
                null,
                false
            );

            let currentOffset = 0;
            let node;

            while (node = walker.nextNode()) {
                const nodeLength = node.textContent.length;
                if (currentOffset + nodeLength >= offset) {
                    const range = document.createRange();
                    range.setStart(node, offset - currentOffset);
                    range.collapse(true);

                    const selection = window.getSelection();
                    selection.removeAllRanges();
                    selection.addRange(range);
                    return true;
                }
                currentOffset += nodeLength;
            }
            return false;
        } catch (e) {
            return false;
        }
    }

    function initCursorTracking() {
        if (!window.vditor || !window.sharedDocState || !window.sharedDocState.canEdit) return;

        // 使用 Vditor 的内容区域
        const contentElement = document.querySelector('.vditor-ir__preview, .vditor-wysiwyg, .vditor-sv');
        if (!contentElement) return;

        // 防抖发送光标位置
        let cursorTimer = null;
        const debouncedSend = () => {
            if (cursorTimer) clearTimeout(cursorTimer);
            cursorTimer = setTimeout(() => {
                const selection = window.getSelection();
                if (!selection || selection.rangeCount === 0) return;

                try {
                    const range = selection.getRangeAt(0);
                    const rect = range.getBoundingClientRect();
                    const editorRect = contentElement.getBoundingClientRect();

                    if (rect.height === 0) return; // 无效光标

                    const position = {
                        x: rect.left - editorRect.left + contentElement.scrollLeft,
                        y: rect.top - editorRect.top + contentElement.scrollTop,
                        height: rect.height || 20
                    };

                    const selectionText = selection.toString();
                    sendCursorPosition(position, {
                        text: selectionText,
                        length: selectionText.length
                    });
                } catch (e) {
                    // 忽略错误
                }
            }, 150);
        };

        // 监听光标移动和选择事件
        contentElement.addEventListener('click', debouncedSend);
        contentElement.addEventListener('keyup', debouncedSend);
        document.addEventListener('selectionchange', debouncedSend);
    }

    function renderRemoteCursors() {
        // 清除旧的光标
        document.querySelectorAll('.remote-cursor').forEach(el => el.remove());

        if (!window.sharedDocState || !window.vditor) return;

        // 尝试多个可能的内容容器
        const contentElement = document.querySelector('.vditor-ir__preview') ||
                              document.querySelector('.vditor-wysiwyg') ||
                              document.querySelector('.vditor-sv') ||
                              document.querySelector('.vditor-content');

        if (!contentElement) {
            console.warn('未找到编辑器内容容器，无法渲染光标');
            return;
        }

        // 确保容器有相对定位
        if (window.getComputedStyle(contentElement).position === 'static') {
            contentElement.style.position = 'relative';
        }

        // 渲染其他用户的光标
        window.sharedDocState.remoteCursors = window.sharedDocState.remoteCursors || {};
        const now = Date.now();

        Object.entries(window.sharedDocState.remoteCursors).forEach(([viewerId, cursor]) => {
            // 清理超过10秒未更新的光标
            if (now - cursor.lastUpdate > 10000) {
                delete window.sharedDocState.remoteCursors[viewerId];
                return;
            }

            if (cursor.viewerId === window.sharedDocState.viewerId) return;
            if (!cursor.position || cursor.position.height === 0) return;

            const cursorElement = document.createElement('div');
            cursorElement.className = 'remote-cursor';
            cursorElement.style.cssText = `
                position: absolute;
                left: ${cursor.position.x}px;
                top: ${cursor.position.y}px;
                height: ${cursor.position.height}px;
                width: 2px;
                background-color: ${cursor.color};
                z-index: 9999;
                pointer-events: none;
                animation: blink 1s infinite;
            `;

            const labelElement = document.createElement('div');
            labelElement.className = 'remote-cursor-label';
            labelElement.style.cssText = `
                position: absolute;
                left: 0;
                top: -22px;
                background-color: ${cursor.color};
                color: white;
                padding: 2px 6px;
                border-radius: 3px;
                font-size: 11px;
                white-space: nowrap;
                z-index: 10000;
                pointer-events: none;
                box-shadow: 0 2px 4px rgba(0,0,0,0.2);
            `;
            labelElement.textContent = cursor.viewerName;

            cursorElement.appendChild(labelElement);
            contentElement.appendChild(cursorElement);
        });
    }

    // 添加光标闪烁动画样式
    if (!document.getElementById('remoteCursorStyle')) {
        const style = document.createElement('style');
        style.id = 'remoteCursorStyle';
        style.textContent = `
            @keyframes blink {
                0%, 49% { opacity: 1; }
                50%, 100% { opacity: 0.3; }
            }
        `;
        document.head.appendChild(style);
    }

    function getPixelPositionFromOffset(textOffset) {
        try {
            const contentElement = document.querySelector('.vditor-ir__preview, .vditor-wysiwyg, .vditor-sv');
            if (!contentElement) return null;

            const walker = document.createTreeWalker(
                contentElement,
                NodeFilter.SHOW_TEXT,
                null,
                false
            );

            let currentOffset = 0;
            let node;

            while (node = walker.nextNode()) {
                const nodeLength = node.textContent.length;
                if (currentOffset + nodeLength >= textOffset) {
                    const range = document.createRange();
                    range.setStart(node, Math.min(textOffset - currentOffset, nodeLength));
                    range.collapse(true);

                    const rect = range.getBoundingClientRect();
                    const editorRect = contentElement.getBoundingClientRect();

                    return {
                        x: rect.left - editorRect.left + contentElement.scrollLeft,
                        y: rect.top - editorRect.top + contentElement.scrollTop,
                        height: rect.height || 20
                    };
                }
                currentOffset += nodeLength;
            }
            return null;
        } catch (e) {
            return null;
        }
    }

    function getCursorColor(viewerId) {
        // 为每个用户生成唯一的颜色
        const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];
        const hash = viewerId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        return colors[hash % colors.length];
    }

    async function showHistoryModal() {
        if (!window.sharedDocState || !window.currentUser) return;

        const modal = document.createElement('div');
        modal.id = 'shareHistoryModal';
        modal.style.cssText = 'position:fixed;inset:0;z-index:10007;background:rgba(0,0,0,0.75);display:flex;align-items:center;justify-content:center;padding:16px;';

        modal.innerHTML = `
            <div style="width:min(900px,95vw);max-height:90vh;background:#1f2937;color:#f3f4f6;border-radius:12px;display:flex;flex-direction:column;">
                <div style="display:flex;justify-content:space-between;align-items:center;padding:16px;border-bottom:1px solid #374151;">
                    <h3 style="margin:0;font-size:18px;font-weight:600;">📜 文档修改历史</h3>
                    <button id="closeHistoryModal" style="border:none;background:transparent;color:#9ca3af;font-size:24px;cursor:pointer;padding:0;width:32px;height:32px;line-height:1;">&times;</button>
                </div>
                <div id="historyContent" style="flex:1;overflow-y:auto;padding:16px;">
                    <div style="text-align:center;padding:40px;color:#9ca3af;">
                        <div style="font-size:14px;">加载中...</div>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        document.getElementById('closeHistoryModal').onclick = () => modal.remove();
        modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

        // 加载历史记录
        await loadHistoryList(modal);
    }

    async function loadHistoryList(modal) {
        if (!window.sharedDocState || !window.currentUser) return;

        try {
            const apiUrl = (window.getApiBaseUrl ? window.getApiBaseUrl() : 'api') + '/files/history/list';
            const response = await fetch(apiUrl + '?' + new URLSearchParams({
                username: window.sharedDocState.ownerUsername,
                filename: window.sharedDocState.filename
            }), {
                method: 'GET',
                headers: {
                    'Authorization': 'Bearer ' + window.currentUser.token
                }
            });

            const result = await response.json();
            const contentDiv = modal.querySelector('#historyContent');

            if (result.code !== 200 || !result.data || !result.data.history) {
                contentDiv.innerHTML = '<div style="text-align:center;padding:40px;color:#9ca3af;">加载失败或无历史记录</div>';
                return;
            }

            const history = result.data.history;
            if (history.length === 0) {
                contentDiv.innerHTML = '<div style="text-align:center;padding:40px;color:#9ca3af;">暂无历史记录</div>';
                return;
            }

            let html = '<div style="display:flex;flex-direction:column;gap:12px;">';
            history.forEach((item, index) => {
                const date = new Date(item.timestamp);
                const dateStr = date.toLocaleString('zh-CN', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                });
                const modifiedBy = item.modified_by || '未知';
                const isCurrent = item.is_current;
                const sizeKB = (item.content_length / 1024).toFixed(2);

                html += `
                    <div style="background:#374151;border-radius:8px;padding:12px;${isCurrent ? 'border:2px solid #10b981;' : ''}">
                        <div style="display:flex;justify-content:space-between;align-items:start;gap:12px;">
                            <div style="flex:1;">
                                <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
                                    <span style="font-weight:600;font-size:14px;">版本 ${item.version_id}</span>
                                    ${isCurrent ? '<span style="background:#10b981;color:white;padding:2px 8px;border-radius:12px;font-size:11px;">当前版本</span>' : ''}
                                </div>
                                <div style="font-size:12px;color:#9ca3af;margin-bottom:4px;">
                                    <span>📅 ${dateStr}</span>
                                    <span style="margin-left:12px;">👤 ${escapeShareHtml(modifiedBy)}</span>
                                    <span style="margin-left:12px;">📦 ${sizeKB} KB</span>
                                </div>
                            </div>
                            <div style="display:flex;gap:8px;">
                                <button class="viewHistoryBtn" data-version="${item.version_id}" style="border:none;background:#3b82f6;color:white;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:12px;">预览</button>
                                ${!isCurrent ? `<button class="restoreHistoryBtn" data-version="${item.version_id}" style="border:none;background:#10b981;color:white;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:12px;">回滚</button>` : ''}
                            </div>
                        </div>
                    </div>
                `;
            });
            html += '</div>';

            contentDiv.innerHTML = html;

            // 绑定预览按钮
            contentDiv.querySelectorAll('.viewHistoryBtn').forEach(btn => {
                btn.onclick = async () => {
                    const versionId = parseInt(btn.getAttribute('data-version'));
                    await previewHistoryVersion(versionId);
                };
            });

            // 绑定回滚按钮
            contentDiv.querySelectorAll('.restoreHistoryBtn').forEach(btn => {
                btn.onclick = async () => {
                    const versionId = parseInt(btn.getAttribute('data-version'));
                    if (confirm(`确定要回滚到版本 ${versionId} 吗？这将创建一个新版本。`)) {
                        await restoreHistoryVersion(versionId);
                        modal.remove();
                    }
                };
            });

        } catch (error) {
            console.error('加载历史记录失败:', error);
            const contentDiv = modal.querySelector('#historyContent');
            contentDiv.innerHTML = '<div style="text-align:center;padding:40px;color:#ef4444;">加载失败: ' + error.message + '</div>';
        }
    }

    async function previewHistoryVersion(versionId) {
        if (!window.sharedDocState || !window.currentUser) return;

        try {
            const apiUrl = (window.getApiBaseUrl ? window.getApiBaseUrl() : 'api') + '/files/history/restore';
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + window.currentUser.token
                },
                body: JSON.stringify({
                    username: window.sharedDocState.ownerUsername,
                    filename: window.sharedDocState.filename,
                    version_id: versionId
                })
            });

            const result = await response.json();

            if (result.code !== 200 || !result.data) {
                showToast('预览失败: ' + (result.message || '未知错误'), 'error');
                return;
            }

            // 显示预览模态框
            const previewModal = document.createElement('div');
            previewModal.style.cssText = 'position:fixed;inset:0;z-index:10008;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;padding:16px;';

            previewModal.innerHTML = `
                <div style="width:min(1000px,95vw);max-height:90vh;background:#1f2937;color:#f3f4f6;border-radius:12px;display:flex;flex-direction:column;">
                    <div style="display:flex;justify-content:space-between;align-items:center;padding:16px;border-bottom:1px solid #374151;">
                        <h3 style="margin:0;font-size:16px;">预览版本 ${versionId}</h3>
                        <button id="closePreviewModal" style="border:none;background:transparent;color:#9ca3af;font-size:24px;cursor:pointer;padding:0;width:32px;height:32px;line-height:1;">&times;</button>
                    </div>
                    <div style="flex:1;overflow-y:auto;padding:16px;background:#111827;font-family:monospace;font-size:13px;line-height:1.6;white-space:pre-wrap;word-wrap:break-word;">${escapeShareHtml(result.data.content)}</div>
                </div>
            `;

            document.body.appendChild(previewModal);

            document.getElementById('closePreviewModal').onclick = () => previewModal.remove();
            previewModal.onclick = (e) => { if (e.target === previewModal) previewModal.remove(); };

        } catch (error) {
            console.error('预览历史版本失败:', error);
            showToast('预览失败: ' + error.message, 'error');
        }
    }

    async function restoreHistoryVersion(versionId) {
        if (!window.sharedDocState || !window.currentUser) return;

        try {
            // 1. 获取历史版本内容
            const apiUrl = (window.getApiBaseUrl ? window.getApiBaseUrl() : 'api') + '/files/history/restore';
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + window.currentUser.token
                },
                body: JSON.stringify({
                    username: window.sharedDocState.ownerUsername,
                    filename: window.sharedDocState.filename,
                    version_id: versionId
                })
            });

            const result = await response.json();

            if (result.code !== 200 || !result.data) {
                showToast('回滚失败: ' + (result.message || '未知错误'), 'error');
                return;
            }

            // 2. 更新编辑器内容
            if (window.vditor) {
                window.vditor.setValue(result.data.content);
            }

            // 3. 保存到分享文档（创建新版本）
            const saved = await scheduleSharedDocSync({ manualSave: true });

            if (saved) {
                showToast(`已回滚到版本 ${versionId}`, 'success');
            } else {
                showToast('回滚成功但保存失败，请手动保存', 'error');
            }

        } catch (error) {
            console.error('回滚历史版本失败:', error);
            showToast('回滚失败: ' + error.message, 'error');
        }
    }

    function removeShareVideoUi() {
        var panel = document.getElementById('shareVideoUserPanel');
        if (panel) panel.remove();
        var modal = document.getElementById('shareVideoCallModal');
        if (modal) modal.remove();
        var roomModal = document.getElementById('shareVideoRoomModal');
        if (roomModal) roomModal.remove();
    }

    function getShareVideoState() {
        if (!window.sharedDocState) return null;
        if (!window.sharedDocState.videoCall) {
            window.sharedDocState.videoCall = {
                callId: '',
                peerViewerId: '',
                peerViewerName: '',
                isCaller: false,
                pc: null,
                localStream: null,
                remoteStream: null,
                pendingCandidates: []
            };
        }
        return window.sharedDocState.videoCall;
    }

    function getShareVideoUserLabel(user) {
        if (!user) return '';
        return (user.viewer_name || 'Guest') + (user.is_editing ? '...' : '');
    }

    function escapeShareHtml(text) {
        return String(text || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function getShareEditableUsers() {
        if (!window.sharedDocState) return [];
        var users = Array.isArray(window.sharedDocState.onlineUsers) ? window.sharedDocState.onlineUsers : [];
        return users.filter(function(u) {
            if (!u || !u.viewer_id) return false;
            if (!u.can_edit) return false;
            return u.viewer_id !== window.sharedDocState.viewerId;
        });
    }

    function getShareIceServers() {
        return [
            { urls: 'stun:stun.miwifi.com:3478' },
            { urls: 'stun:stun.l.google.com:19302' }
        ];
    }

    function ensureShareVideoCallModal() {
        var modal = document.getElementById('shareVideoCallModal');
        if (modal) return modal;

        modal = document.createElement('div');
        modal.id = 'shareVideoCallModal';
        modal.style.cssText = 'position:fixed;inset:0;z-index:10005;background:rgba(0,0,0,0.65);display:none;align-items:center;justify-content:center;padding:16px;';
        modal.innerHTML =
            '<div style="width:min(920px,96vw);max-height:92vh;overflow:auto;background:#111827;color:#f3f4f6;border-radius:12px;padding:14px;">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">' +
            '<div id="shareVideoCallTitle" style="font-size:14px;font-weight:600;">视频通话</div>' +
            '<button id="shareVideoCallHangupBtn" style="border:none;background:#dc2626;color:#fff;padding:8px 12px;border-radius:6px;cursor:pointer;">挂断</button>' +
            '</div>' +
            '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;">' +
            '<div><div style="font-size:12px;opacity:0.8;margin-bottom:6px;">我</div><video id="shareVideoLocal" autoplay muted playsinline style="width:100%;height:220px;object-fit:cover;background:#0b1220;border-radius:8px;"></video></div>' +
            '<div><div style="font-size:12px;opacity:0.8;margin-bottom:6px;">对方</div><video id="shareVideoRemote" autoplay playsinline style="width:100%;height:220px;object-fit:cover;background:#0b1220;border-radius:8px;"></video></div>' +
            '</div>' +
            '</div>';
        document.body.appendChild(modal);

        var hangupBtn = document.getElementById('shareVideoCallHangupBtn');
        if (hangupBtn) {
            hangupBtn.addEventListener('click', function() {
                cleanupShareVideoCall(true, 'hangup');
            });
        }
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                cleanupShareVideoCall(true, 'hangup');
            }
        });
        return modal;
    }

    function openShareVideoCallModal(title) {
        var modal = ensureShareVideoCallModal();
        var titleEl = document.getElementById('shareVideoCallTitle');
        if (titleEl) titleEl.textContent = title || (window.i18n ? window.i18n.t('videoCall') : '视频通话');
        modal.style.display = 'flex';
    }

    function closeShareVideoCallModal() {
        var modal = document.getElementById('shareVideoCallModal');
        if (modal) modal.style.display = 'none';
    }

    function stopStreamTracks(stream) {
        if (!stream) return;
        stream.getTracks().forEach(function(track) {
            try { track.stop(); } catch (e) {}
        });
    }

    function cleanupShareVideoCall(notifyPeer, reason) {
        if (!window.sharedDocState) return;
        var video = getShareVideoState();
        if (!video) return;

        if (notifyPeer && video.peerViewerId && video.callId) {
            sendShareWsPayload({
                type: 'video_call_hangup',
                target_viewer_id: video.peerViewerId,
                call_id: video.callId,
                reason: reason || 'hangup'
            });
        }

        if (video.pc) {
            try { video.pc.onicecandidate = null; } catch (e) {}
            try { video.pc.ontrack = null; } catch (e) {}
            try { video.pc.onconnectionstatechange = null; } catch (e) {}
            try { video.pc.close(); } catch (e) {}
        }
        stopStreamTracks(video.localStream);
        stopStreamTracks(video.remoteStream);

        var localVideo = document.getElementById('shareVideoLocal');
        if (localVideo) localVideo.srcObject = null;
        var remoteVideo = document.getElementById('shareVideoRemote');
        if (remoteVideo) remoteVideo.srcObject = null;

        window.sharedDocState.videoCall = {
            callId: '',
            peerViewerId: '',
            peerViewerName: '',
            isCaller: false,
            pc: null,
            localStream: null,
            remoteStream: null,
            pendingCandidates: []
        };
        closeShareVideoCallModal();
    }

    async function ensureShareLocalMedia() {
        var video = getShareVideoState();
        if (video.localStream) return video.localStream;
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error(window.i18n ? window.i18n.t('videoCallUnsupported') : '当前浏览器不支持视频通话');
        }
        video.localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        var localVideo = document.getElementById('shareVideoLocal');
        if (localVideo) {
            localVideo.srcObject = video.localStream;
            localVideo.play().catch(function() {});
        }
        return video.localStream;
    }

    async function createSharePeerConnection() {
        var video = getShareVideoState();
        if (!video) return null;
        if (video.pc) return video.pc;

        var pc = new RTCPeerConnection({
            iceServers: getShareIceServers()
        });

        var localStream = await ensureShareLocalMedia();
        localStream.getTracks().forEach(function(track) {
            pc.addTrack(track, localStream);
        });

        pc.onicecandidate = function(event) {
            if (!event.candidate) return;
            var current = getShareVideoState();
            if (!current || !current.peerViewerId || !current.callId) return;
            sendShareWsPayload({
                type: 'video_ice_candidate',
                target_viewer_id: current.peerViewerId,
                call_id: current.callId,
                candidate: event.candidate
            });
        };

        pc.ontrack = function(event) {
            var current = getShareVideoState();
            if (!current) return;
            current.remoteStream = event.streams && event.streams[0] ? event.streams[0] : null;
            var remoteVideo = document.getElementById('shareVideoRemote');
            if (remoteVideo) {
                remoteVideo.srcObject = current.remoteStream;
                remoteVideo.play().catch(function() {});
            }
        };

        pc.onconnectionstatechange = function() {
            var state = pc.connectionState;
            if (state === 'failed' || state === 'disconnected' || state === 'closed') {
                cleanupShareVideoCall(false, 'disconnected');
            }
        };

        video.pc = pc;
        return pc;
    }

    async function applyPendingShareCandidates() {
        var video = getShareVideoState();
        if (!video || !video.pc || !video.pc.remoteDescription) return;
        if (!Array.isArray(video.pendingCandidates) || video.pendingCandidates.length === 0) return;

        var pending = video.pendingCandidates.slice();
        video.pendingCandidates = [];
        for (var i = 0; i < pending.length; i++) {
            try {
                await video.pc.addIceCandidate(new RTCIceCandidate(pending[i]));
            } catch (err) {
                console.warn('应用候选失败:', err);
            }
        }
    }

    async function startShareVideoCallWithUser(user) {
        if (!window.sharedDocState || !window.sharedDocState.canEdit) {
            showToast(window.i18n ? window.i18n.t('videoCallEditOnly') : '仅允许编辑用户发起视频通话', 'error');
            return;
        }
        var video = getShareVideoState();
        if (video.callId) {
            showToast(window.i18n ? window.i18n.t('videoCallBusy') : '当前已有进行中的视频通话', 'info');
            return;
        }
        video.callId = createShareVideoCallId();
        video.peerViewerId = user.viewer_id;
        video.peerViewerName = user.viewer_name || 'Guest';
        video.isCaller = true;
        video.pendingCandidates = [];

        openShareVideoCallModal((window.i18n ? window.i18n.t('videoCalling') : '正在呼叫') + ': ' + video.peerViewerName);
        var inviteSent = sendShareWsPayload({
            type: 'video_call_invite',
            target_viewer_id: user.viewer_id,
            call_id: video.callId
        });
        if (!inviteSent) {
            showToast(window.i18n ? window.i18n.t('websocketError') : 'WebSocket错误', 'error');
            cleanupShareVideoCall(false, 'socket_error');
        }
    }

    async function handleIncomingShareVideoInvite(payload) {
        if (!window.sharedDocState || !window.sharedDocState.canEdit) {
            sendShareWsPayload({
                type: 'video_call_response',
                target_viewer_id: payload.from_viewer_id,
                call_id: payload.call_id,
                accepted: false,
                reason: 'no_edit_permission'
            });
            return;
        }

        var video = getShareVideoState();
        if (video.callId) {
            sendShareWsPayload({
                type: 'video_call_response',
                target_viewer_id: payload.from_viewer_id,
                call_id: payload.call_id,
                accepted: false,
                reason: 'busy'
            });
            showToast(window.i18n ? window.i18n.t('videoCallBusy') : '当前正在通话中', 'info');
            return;
        }

        var callerName = payload.from_viewer_name || 'Guest';
        showToast((window.i18n ? window.i18n.t('videoCallIncoming') : '收到视频通话邀请') + ': ' + callerName, 'info');

        var accept = false;
        var askText = (window.i18n ? window.i18n.t('videoCallAcceptPrompt') : '用户发起了视频通话，是否接听？').replace('{name}', callerName);
        if (window.customConfirm) {
            accept = await window.customConfirm(askText);
        } else {
            accept = window.confirm(askText);
        }

        sendShareWsPayload({
            type: 'video_call_response',
            target_viewer_id: payload.from_viewer_id,
            call_id: payload.call_id,
            accepted: !!accept,
            reason: accept ? '' : 'rejected'
        });

        if (!accept) return;

        video.callId = payload.call_id;
        video.peerViewerId = payload.from_viewer_id;
        video.peerViewerName = callerName;
        video.isCaller = false;
        video.pendingCandidates = [];
        openShareVideoCallModal((window.i18n ? window.i18n.t('videoConnectedWith') : '正在与用户视频') + ': ' + callerName);

        try {
            await createSharePeerConnection();
        } catch (err) {
            showToast((window.i18n ? window.i18n.t('videoCallStartFailed') : '启动视频通话失败') + ': ' + (err.message || ''), 'error');
            cleanupShareVideoCall(true, 'media_error');
        }
    }

    async function handleShareVideoCallResponse(payload) {
        var video = getShareVideoState();
        if (!video || !video.callId) return;
        if (payload.call_id !== video.callId) return;
        if (payload.from_viewer_id !== video.peerViewerId) return;

        if (!payload.accepted) {
            showToast(window.i18n ? window.i18n.t('videoCallRejected') : '对方已拒绝视频通话', 'info');
            cleanupShareVideoCall(false, 'rejected');
            return;
        }

        try {
            var pc = await createSharePeerConnection();
            var offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            sendShareWsPayload({
                type: 'video_offer',
                target_viewer_id: video.peerViewerId,
                call_id: video.callId,
                sdp: offer.sdp
            });
            openShareVideoCallModal((window.i18n ? window.i18n.t('videoConnectedWith') : '正在与用户视频') + ': ' + video.peerViewerName);
        } catch (err) {
            showToast((window.i18n ? window.i18n.t('videoCallStartFailed') : '启动视频通话失败') + ': ' + (err.message || ''), 'error');
            cleanupShareVideoCall(true, 'offer_failed');
        }
    }

    async function handleShareVideoSignal(payload) {
        var video = getShareVideoState();
        if (!video) return;
        if (!video.callId || payload.call_id !== video.callId) return;
        if (!payload.signal || !payload.signal.type) return;

        try {
            var pc = await createSharePeerConnection();
            if (payload.signal.type === 'offer') {
                await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: payload.signal.sdp }));
                var answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                sendShareWsPayload({
                    type: 'video_signal',
                    target_viewer_id: video.peerViewerId,
                    call_id: video.callId,
                    signal: {
                        type: 'answer',
                        sdp: answer.sdp
                    }
                });
                await applyPendingShareCandidates();
                return;
            }

            if (payload.signal.type === 'answer') {
                await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: payload.signal.sdp }));
                await applyPendingShareCandidates();
                return;
            }

            if (payload.signal.type === 'candidate' && payload.signal.candidate) {
                if (!pc.remoteDescription) {
                    video.pendingCandidates.push(payload.signal.candidate);
                    return;
                }
                await pc.addIceCandidate(new RTCIceCandidate(payload.signal.candidate));
            }
        } catch (err) {
            console.error('处理视频信令失败:', err);
        }
    }

    async function handleShareVideoOffer(payload) {
        var video = getShareVideoState();
        if (!video) return;
        if (!video.callId) {
            video.callId = payload.call_id || '';
            video.peerViewerId = payload.from_viewer_id || '';
            video.peerViewerName = payload.from_viewer_name || 'Guest';
            video.pendingCandidates = [];
        }
        if (payload.call_id !== video.callId || payload.from_viewer_id !== video.peerViewerId) return;

        try {
            var pc = await createSharePeerConnection();
            await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: payload.sdp }));
            var answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            sendShareWsPayload({
                type: 'video_answer',
                target_viewer_id: video.peerViewerId,
                call_id: video.callId,
                sdp: answer.sdp
            });
            await applyPendingShareCandidates();
        } catch (err) {
            console.error('处理视频 offer 失败:', err);
        }
    }

    async function handleShareVideoAnswer(payload) {
        var video = getShareVideoState();
        if (!video || !video.callId || payload.call_id !== video.callId) return;
        if (payload.from_viewer_id !== video.peerViewerId) return;
        try {
            var pc = await createSharePeerConnection();
            await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: payload.sdp }));
            await applyPendingShareCandidates();
        } catch (err) {
            console.error('处理视频 answer 失败:', err);
        }
    }

    async function handleShareVideoIceCandidate(payload) {
        var video = getShareVideoState();
        if (!video || !video.callId || payload.call_id !== video.callId) return;
        if (payload.from_viewer_id !== video.peerViewerId) return;
        if (!payload.candidate) return;

        try {
            var pc = await createSharePeerConnection();
            if (!pc.remoteDescription) {
                video.pendingCandidates.push(payload.candidate);
                return;
            }
            await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
        } catch (err) {
            console.error('处理视频 ICE 候选失败:', err);
        }
    }

    function getShareVideoRoomState() {
        if (!window.sharedDocState) return null;
        if (!window.sharedDocState.videoRoom) {
            window.sharedDocState.videoRoom = {
                joined: false,
                localStream: null,
                peers: {},
                pendingByPeer: {}
            };
        }
        return window.sharedDocState.videoRoom;
    }

    function ensureShareVideoRoomModal() {
        var modal = document.getElementById('shareVideoRoomModal');
        if (modal) return modal;

        modal = document.createElement('div');
        modal.id = 'shareVideoRoomModal';
        modal.style.cssText = 'position:fixed;inset:0;z-index:10006;background:rgba(0,0,0,0.72);display:none;align-items:center;justify-content:center;padding:14px;';
        modal.innerHTML =
            '<div style="width:min(1080px,97vw);max-height:94vh;overflow:auto;background:#0f172a;color:#f8fafc;border-radius:12px;padding:12px;">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:10px;">' +
            '<div id="shareVideoRoomTitle" style="font-size:14px;font-weight:600;">多人通话房间</div>' +
            '<button id="shareVideoRoomLeaveBtn" style="border:none;background:#dc2626;color:#fff;padding:8px 12px;border-radius:6px;cursor:pointer;">退出房间</button>' +
            '</div>' +
            '<div id="shareVideoRoomGrid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;"></div>' +
            '</div>';
        document.body.appendChild(modal);

        var leaveBtn = document.getElementById('shareVideoRoomLeaveBtn');
        if (leaveBtn) {
            leaveBtn.addEventListener('click', function() {
                cleanupShareVideoRoom(true);
            });
        }
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                cleanupShareVideoRoom(true);
            }
        });
        return modal;
    }

    function renderShareVideoRoomGrid() {
        var room = getShareVideoRoomState();
        if (!room || !room.joined) return;
        var grid = document.getElementById('shareVideoRoomGrid');
        if (!grid) return;

        var localName = escapeShareHtml(window.sharedDocState && window.sharedDocState.viewerName ? window.sharedDocState.viewerName : 'Me');
        var html =
            '<div style="background:#1e293b;border-radius:8px;padding:8px;">' +
            '<div style="font-size:12px;opacity:0.9;margin-bottom:6px;">我（' + localName + '）</div>' +
            '<video id="shareVideoRoomLocal" autoplay muted playsinline style="width:100%;height:190px;object-fit:cover;background:#0b1220;border-radius:6px;"></video>' +
            '</div>';

        Object.keys(room.peers).forEach(function(peerId) {
            var peer = room.peers[peerId] || {};
            var peerName = escapeShareHtml(peer.viewerName || 'Peer');
            html +=
                '<div style="background:#1e293b;border-radius:8px;padding:8px;">' +
                '<div style="font-size:12px;opacity:0.9;margin-bottom:6px;">' + peerName + '</div>' +
                '<video id="shareVideoRoomPeer-' + peerId + '" autoplay playsinline style="width:100%;height:190px;object-fit:cover;background:#0b1220;border-radius:6px;"></video>' +
                '</div>';
        });

        grid.innerHTML = html;
        var localVideo = document.getElementById('shareVideoRoomLocal');
        if (localVideo && room.localStream) {
            localVideo.srcObject = room.localStream;
        }
        Object.keys(room.peers).forEach(function(peerId) {
            var peer = room.peers[peerId] || {};
            var el = document.getElementById('shareVideoRoomPeer-' + peerId);
            if (el && peer.remoteStream) {
                el.srcObject = peer.remoteStream;
            }
        });
    }

    function openShareVideoRoomModal() {
        ensureShareVideoRoomModal().style.display = 'flex';
        renderShareVideoRoomGrid();
    }

    function closeShareVideoRoomModal() {
        var modal = document.getElementById('shareVideoRoomModal');
        if (modal) modal.style.display = 'none';
    }

    async function ensureShareRoomLocalStream() {
        var room = getShareVideoRoomState();
        if (!room) return null;
        if (room.localStream) return room.localStream;
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error(window.i18n ? window.i18n.t('videoCallUnsupported') : '当前浏览器不支持视频通话');
        }
        room.localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        return room.localStream;
    }

    async function createShareRoomPeerConnection(peerId, peerName) {
        var room = getShareVideoRoomState();
        if (!room || !room.joined) return null;
        if (room.peers[peerId] && room.peers[peerId].pc) return room.peers[peerId].pc;

        var localStream = await ensureShareRoomLocalStream();
        var pc = new RTCPeerConnection({ iceServers: getShareIceServers() });

        localStream.getTracks().forEach(function(track) {
            pc.addTrack(track, localStream);
        });

        room.peers[peerId] = room.peers[peerId] || { viewerName: peerName || 'Peer', pc: null, remoteStream: null };
        room.peers[peerId].viewerName = peerName || room.peers[peerId].viewerName || 'Peer';
        room.peers[peerId].pc = pc;

        pc.onicecandidate = function(event) {
            if (!event.candidate) return;
            sendShareWsPayload({
                type: 'video_room_signal',
                target_viewer_id: peerId,
                signal: {
                    type: 'candidate',
                    candidate: event.candidate
                }
            });
        };

        pc.ontrack = function(event) {
            if (!room.peers[peerId]) return;
            room.peers[peerId].remoteStream = event.streams && event.streams[0] ? event.streams[0] : null;
            renderShareVideoRoomGrid();
        };

        pc.onconnectionstatechange = function() {
            if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
                removeShareRoomPeer(peerId);
            }
        };

        renderShareVideoRoomGrid();
        return pc;
    }

    function removeShareRoomPeer(peerId) {
        var room = getShareVideoRoomState();
        if (!room || !room.peers[peerId]) return;
        var peer = room.peers[peerId];
        if (peer.pc) {
            try { peer.pc.onicecandidate = null; } catch (e) {}
            try { peer.pc.ontrack = null; } catch (e) {}
            try { peer.pc.onconnectionstatechange = null; } catch (e) {}
            try { peer.pc.close(); } catch (e) {}
        }
        delete room.peers[peerId];
        if (room.pendingByPeer) delete room.pendingByPeer[peerId];
        renderShareVideoRoomGrid();
    }

    async function flushShareRoomPendingCandidates(peerId) {
        var room = getShareVideoRoomState();
        if (!room || !room.peers[peerId] || !room.peers[peerId].pc) return;
        var pc = room.peers[peerId].pc;
        if (!pc.remoteDescription) return;
        var pending = (room.pendingByPeer && room.pendingByPeer[peerId]) ? room.pendingByPeer[peerId].slice() : [];
        room.pendingByPeer[peerId] = [];
        for (var i = 0; i < pending.length; i++) {
            try {
                await pc.addIceCandidate(new RTCIceCandidate(pending[i]));
            } catch (e) {}
        }
    }

    async function createShareRoomOffer(peerId, peerName) {
        var room = getShareVideoRoomState();
        if (!room || !room.joined) return;
        var pc = await createShareRoomPeerConnection(peerId, peerName);
        if (!pc) return;
        var offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        sendShareWsPayload({
            type: 'video_room_signal',
            target_viewer_id: peerId,
            signal: {
                type: 'offer',
                sdp: offer.sdp
            }
        });
    }

    async function startShareVideoRoom() {
        if (!window.sharedDocState || !window.sharedDocState.canEdit) {
            showToast(window.i18n ? window.i18n.t('videoCallEditOnly') : '仅允许编辑用户发起视频通话', 'error');
            return;
        }
        var oneToOne = getShareVideoState();
        if (oneToOne && oneToOne.callId) {
            showToast(window.i18n ? window.i18n.t('videoCallBusy') : '当前已有进行中的视频通话', 'info');
            return;
        }

        var room = getShareVideoRoomState();
        if (room.joined) {
            openShareVideoRoomModal();
            return;
        }

        try {
            room.localStream = await ensureShareRoomLocalStream();
            room.joined = true;
            room.peers = {};
            room.pendingByPeer = {};
            openShareVideoRoomModal();
            if (!sendShareWsPayload({ type: 'video_room_join' })) {
                cleanupShareVideoRoom(false);
                showToast(window.i18n ? window.i18n.t('websocketError') : 'WebSocket错误', 'error');
                return;
            }
            renderSharePresence(window.sharedDocState.onlineUsers || []);
            showToast(window.i18n ? window.i18n.t('videoRoomJoined') : '已加入多人通话房间', 'success');
        } catch (err) {
            showToast((window.i18n ? window.i18n.t('videoCallStartFailed') : '启动视频通话失败') + ': ' + (err.message || ''), 'error');
        }
    }

    function cleanupShareVideoRoom(notifyServer) {
        var room = getShareVideoRoomState();
        if (!room) return;
        if (notifyServer && room.joined) {
            sendShareWsPayload({ type: 'video_room_leave' });
        }
        Object.keys(room.peers || {}).forEach(function(peerId) {
            removeShareRoomPeer(peerId);
        });
        stopStreamTracks(room.localStream);
        room.localStream = null;
        room.joined = false;
        room.peers = {};
        room.pendingByPeer = {};
        closeShareVideoRoomModal();
        if (window.sharedDocState) {
            renderSharePresence(window.sharedDocState.onlineUsers || []);
        }
    }

    async function handleShareRoomParticipants(payload) {
        var room = getShareVideoRoomState();
        if (!room || !room.joined) return;
        var participants = Array.isArray(payload.participants) ? payload.participants : [];
        for (var i = 0; i < participants.length; i++) {
            var p = participants[i];
            if (!p || !p.viewer_id) continue;
            await createShareRoomOffer(p.viewer_id, p.viewer_name || 'Peer');
        }
    }

    function handleShareRoomPeerJoined(payload) {
        var room = getShareVideoRoomState();
        if (!room || !room.joined) return;
        if (!payload || !payload.viewer_id) return;
        showToast((window.i18n ? window.i18n.t('videoRoomPeerJoined') : '有用户加入多人通话') + ': ' + (payload.viewer_name || payload.viewer_id), 'info');
    }

    function handleShareRoomPeerLeft(payload) {
        if (!payload || !payload.viewer_id) return;
        removeShareRoomPeer(payload.viewer_id);
        showToast((window.i18n ? window.i18n.t('videoRoomPeerLeft') : '有用户离开多人通话') + ': ' + (payload.viewer_name || payload.viewer_id), 'info');
    }

    async function handleShareRoomSignal(payload) {
        var room = getShareVideoRoomState();
        if (!room || !room.joined) return;
        if (!payload || !payload.from_viewer_id || !payload.signal || !payload.signal.type) return;

        var peerId = payload.from_viewer_id;
        var peerName = payload.from_viewer_name || 'Peer';
        try {
            var pc = await createShareRoomPeerConnection(peerId, peerName);
            if (!pc) return;

            if (payload.signal.type === 'offer') {
                await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: payload.signal.sdp }));
                var answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                sendShareWsPayload({
                    type: 'video_room_signal',
                    target_viewer_id: peerId,
                    signal: {
                        type: 'answer',
                        sdp: answer.sdp
                    }
                });
                await flushShareRoomPendingCandidates(peerId);
                return;
            }

            if (payload.signal.type === 'answer') {
                await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: payload.signal.sdp }));
                await flushShareRoomPendingCandidates(peerId);
                return;
            }

            if (payload.signal.type === 'candidate' && payload.signal.candidate) {
                room.pendingByPeer[peerId] = room.pendingByPeer[peerId] || [];
                if (!pc.remoteDescription) {
                    room.pendingByPeer[peerId].push(payload.signal.candidate);
                    return;
                }
                await pc.addIceCandidate(new RTCIceCandidate(payload.signal.candidate));
            }
        } catch (err) {
            console.error('处理多人通话信令失败:', err);
        }
    }

    function deactivateSharedDocumentSession() {
        if (!window.sharedDocState) return;
        if (window.sharedDocState.saveTimer) clearTimeout(window.sharedDocState.saveTimer);
        if (window.sharedDocState.pendingManualSave) {
            if (window.sharedDocState.pendingManualSave.timer) clearTimeout(window.sharedDocState.pendingManualSave.timer);
            window.sharedDocState.pendingManualSave.resolve(false);
        }
        if (window.sharedDocState.pollTimer) clearInterval(window.sharedDocState.pollTimer);
        if (window.sharedDocState.presenceTimer) clearInterval(window.sharedDocState.presenceTimer);
        if (window.sharedDocState.localWatchTimer) clearInterval(window.sharedDocState.localWatchTimer);
        if (window.sharedDocState.wsRetryTimer) clearTimeout(window.sharedDocState.wsRetryTimer);
        if (window.sharedDocState.wsGraceTimer) clearTimeout(window.sharedDocState.wsGraceTimer);
        cleanupShareVideoCall(false, 'leave_session');
        cleanupShareVideoRoom(false);
        if (window.sharedDocState.ws) {
            try { window.sharedDocState.ws.close(); } catch (e) {}
        }
        window.sharedDocState = null;
        setSharedEditorLocked(false);
        var bar = document.getElementById('sharePresenceBar');
        if (bar) bar.remove();
        removeShareVideoUi();
    }

    function activateSharedDocumentSession(shareData, options) {
        options = options || {};
        var targetShareId = options.shareId || shareData.share_id;
        var targetOwnerFileId = options.ownerFileId || null;
        var sameSession =
            window.sharedDocState &&
            window.sharedDocState.shareId === targetShareId &&
            window.sharedDocState.ownerFileId === targetOwnerFileId;

        if (sameSession) {
            window.sharedDocState.sharePassword = options.sharePassword || window.sharedDocState.sharePassword || '';
            window.sharedDocState.editPassword = options.editPassword || window.sharedDocState.editPassword || '';
            window.sharedDocState.canEdit = !!options.canEdit;
            window.sharedDocState.viewerId = options.viewerId || window.sharedDocState.viewerId;
            window.sharedDocState.viewerName = options.viewerName || window.sharedDocState.viewerName;
            window.sharedDocState.ownerUsername = shareData.username || window.sharedDocState.ownerUsername;
            window.sharedDocState.filename = shareData.filename || window.sharedDocState.filename;
            window.sharedDocState.lastModified = shareData.last_modified || window.sharedDocState.lastModified;
            window.sharedDocState.contentVersion = shareData.content_version || window.sharedDocState.contentVersion;
            if (typeof shareData.content === 'string') {
                window.sharedDocState.lastKnownContent = shareData.content;
            }
            setSharedEditorLocked(!window.sharedDocState.canEdit);
            if (!window.sharedDocState.wsConnected) {
                connectShareWebSocket();
            }
            // 初始化光标跟踪
            initCursorTracking();
            return;
        }

        deactivateSharedDocumentSession();
        window.sharedDocState = {
            shareId: targetShareId,
            sharePassword: options.sharePassword || '',
            editPassword: options.editPassword || '',
            canEdit: !!options.canEdit,
            lastKnownContent: shareData.content || '',
            lastModified: shareData.last_modified || null,
            contentVersion: shareData.content_version || 1,
            lastLocalEditAt: 0,
            viewerId: options.viewerId || getSharedViewerId(),
            viewerName: options.viewerName || getSharedViewerName(),
            ownerUsername: shareData.username || '',
            filename: shareData.filename || '',
            ownerFileId: targetOwnerFileId,
            isSaving: false,
            saveTimer: null,
            pendingManualSave: null,
            pollTimer: null,
            presenceTimer: null,
            localWatchTimer: null,
            ws: null,
            wsConnected: false,
            wsRetryTimer: null,
            wsGraceTimer: null,
            connectionStatus: 'connecting',
            connectionHintMinimized: false,
            onlineUsers: [],
            remoteCursors: {},
            videoCall: {
                callId: '',
                peerViewerId: '',
                peerViewerName: '',
                isCaller: false,
                pc: null,
                localStream: null,
                remoteStream: null,
                pendingCandidates: []
            },
            videoRoom: {
                joined: false,
                localStream: null,
                peers: {},
                pendingByPeer: {}
            }
        };
        setSharedEditorLocked(!window.sharedDocState.canEdit);
        startSharedDocRealtime();
        // 初始化光标跟踪
        initCursorTracking();
        // 监听编辑器输入事件，更新最后编辑时间
        if (window.vditor && window.sharedDocState.canEdit) {
            window.vditor.options.input = function() {
                if (window.sharedDocState) {
                    window.sharedDocState.lastLocalEditAt = Date.now();
                }
            };
        }
    }

    async function handleShareLink(shareId, password) {
        try {
            const result = await fetchShareData(shareId, password, '');

            if (result.code === 200) {
                const shareData = result.data;

                // 填充编辑器内容
                if (window.vditor) {
                    window.vditor.setValue(shareData.content);
                }

                const editAccess = await resolveEditAccess(shareData, shareId, password);

                // 根据分享模式和编辑权限调整UI
                if (shareData.mode === 'view' || !editAccess.canEdit) {
                    hideEditElements();
                    setSharedEditorLocked(true);
                } else {
                    if (shareData.is_expired) {
                        hideEditElements();
                        setSharedEditorLocked(true);
                        showToast(window.i18n ? window.i18n.t('shareLinkExpired') : '分享链接已过期，无法编辑', 'error');
                    } else {
                        setSharedEditorLocked(false);
                    }
                }

                activateSharedDocumentSession(shareData, {
                    shareId: shareId,
                    sharePassword: password || '',
                    editPassword: editAccess.editPassword || '',
                    canEdit: editAccess.canEdit && !shareData.is_expired,
                    viewerId: getSharedViewerId(),
                    viewerName: getSharedViewerName()
                });

                // 隐藏登录提示
                if (window.showLoginModal) {
                    // 清除自动显示登录模态框的定时器
                    window.clearTimeout(window.loginModalTimer);
                }

                // 显示分享信息
                showShareInfo({ ...shareData, can_edit: window.sharedDocState.canEdit });
            } else {
                // 处理敏感词检测错误
                if (result.sensitive_words && result.sensitive_words.length > 0) {
                    showSensitiveWordsError(result.sensitive_words);
                } else {
                    showToast((window.i18n ? window.i18n.t('getShareFailed') : '获取分享内容失败: ') + (result.message || '未知错误'), 'error');
                }
                // 重定向到密码页面或错误页面
                if (result.code === 401) {
                    var viewUrl = (window.getApiBaseUrl ? window.getApiBaseUrl() : 'api') + '/share/view?share_id=' + shareId;
                    window.location.href = viewUrl;
                }
            }
        } catch (error) {
            console.error('处理分享链接失败:', error);
            showToast(window.i18n ? window.i18n.t('networkError') : '网络错误，请重试', 'error');
        }
    }

    function resolveSharedManualSave(result) {
        if (!window.sharedDocState || !window.sharedDocState.pendingManualSave) return;
        var pending = window.sharedDocState.pendingManualSave;
        window.sharedDocState.pendingManualSave = null;
        if (pending.timer) {
            clearTimeout(pending.timer);
        }
        pending.resolve(result);
    }

    async function syncSharedDocContent(options) {
        options = options || {};
        if (!window.sharedDocState || !window.sharedDocState.canEdit || !window.vditor) return false;
        if (window.sharedDocState.isSaving) return false;

        var currentContent = window.vditor.getValue();
        var manualSave = options.manualSave === true;
        if (currentContent === window.sharedDocState.lastKnownContent && !manualSave) {
            return true;
        }

        // WebSocket online path
        if (window.sharedDocState.ws && window.sharedDocState.wsConnected && window.sharedDocState.ws.readyState === WebSocket.OPEN) {
            window.sharedDocState.isSaving = true;
            if (manualSave) {
                if (window.sharedDocState.pendingManualSave && window.sharedDocState.pendingManualSave.timer) {
                    clearTimeout(window.sharedDocState.pendingManualSave.timer);
                }
                return await new Promise(function(resolve) {
                    window.sharedDocState.pendingManualSave = {
                        resolve: resolve,
                        timer: setTimeout(function() {
                            if (!window.sharedDocState || !window.sharedDocState.pendingManualSave) return;
                            window.sharedDocState.pendingManualSave = null;
                            window.sharedDocState.isSaving = false;
                            resolve(false);
                        }, 10000)
                    };
                    window.sharedDocState.ws.send(JSON.stringify({
                        type: 'update_content',
                        content: currentContent,
                        base_version: window.sharedDocState.contentVersion,
                        manual_save: true,
                        create_history: true
                    }));
                });
            }
            window.sharedDocState.ws.send(JSON.stringify({
                type: 'update_content',
                content: currentContent,
                base_version: window.sharedDocState.contentVersion
            }));
            return true;
        }

        window.sharedDocState.isSaving = true;
        try {
            var apiUrl = (window.getApiBaseUrl ? window.getApiBaseUrl() : 'api') + '/share/update';
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    share_id: window.sharedDocState.shareId,
                    content: currentContent,
                    password: window.sharedDocState.sharePassword,
                    edit_password: window.sharedDocState.editPassword,
                    viewer_id: window.sharedDocState.viewerId,
                    viewer_name: window.sharedDocState.viewerName,
                    base_version: window.sharedDocState.contentVersion,
                    manual_save: manualSave,
                    create_history: manualSave,
                    ...getEditorIdentityPayload()
                })
            });
            const result = await response.json();
            if (result.code === 200 && result.data) {
                window.sharedDocState.lastKnownContent = result.data.content || currentContent;
                window.sharedDocState.lastModified = result.data.last_modified || window.sharedDocState.lastModified;
                window.sharedDocState.contentVersion = result.data.content_version || window.sharedDocState.contentVersion;
                return true;
            }
            if (result.code === 409 && result.data) {
                window.sharedDocState.lastKnownContent = result.data.content || window.sharedDocState.lastKnownContent;
                window.sharedDocState.lastModified = result.data.last_modified || window.sharedDocState.lastModified;
                window.sharedDocState.contentVersion = result.data.content_version || window.sharedDocState.contentVersion;
                if (window.vditor) {
                    // 保存光标位置
                    var selection = window.getSelection();
                    var cursorPosition = null;
                    if (selection && selection.rangeCount > 0) {
                        var range = selection.getRangeAt(0);
                        cursorPosition = {
                            startContainer: range.startContainer,
                            startOffset: range.startOffset,
                            endContainer: range.endContainer,
                            endOffset: range.endOffset
                        };
                    }

                    window.vditor.setValue(window.sharedDocState.lastKnownContent);

                    // 恢复光标位置
                    if (cursorPosition) {
                        try {
                            var newRange = document.createRange();
                            newRange.setStart(cursorPosition.startContainer, cursorPosition.startOffset);
                            newRange.setEnd(cursorPosition.endContainer, cursorPosition.endOffset);
                            selection.removeAllRanges();
                            selection.addRange(newRange);
                        } catch (e) {
                            // 如果恢复失败，忽略错误
                        }
                    }
                }
                showToast(window.i18n ? '检测到并发冲突，已刷新为最新内容' : 'Conflict detected. Loaded latest content.', 'error');
                return false;
            }
            return false;
        } catch (err) {
            console.error('共享文档同步失败:', err);
            return false;
        } finally {
            window.sharedDocState.isSaving = false;
        }
    }

    function scheduleSharedDocSync(options) {
        options = options || {};
        if (!window.sharedDocState || !window.sharedDocState.canEdit) return options.manualSave ? Promise.resolve(false) : undefined;
        window.sharedDocState.lastLocalEditAt = Date.now();
        if (window.sharedDocState.saveTimer) {
            clearTimeout(window.sharedDocState.saveTimer);
            window.sharedDocState.saveTimer = null;
        }
        if (options.manualSave) {
            return syncSharedDocContent({ manualSave: true });
        }
        window.sharedDocState.saveTimer = setTimeout(function() {
            syncSharedDocContent();
        }, 1000);
        return true;
    }

    async function pollSharedDocContent() {
        if (!window.sharedDocState) return;
        try {
            var apiUrl = (window.getApiBaseUrl ? window.getApiBaseUrl() : 'api') + '/share/poll';
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    share_id: window.sharedDocState.shareId,
                    password: window.sharedDocState.sharePassword,
                    since: window.sharedDocState.lastModified,
                    edit_password: window.sharedDocState.editPassword,
                    ...getEditorIdentityPayload()
                })
            });
            const result = await response.json();
            if (result.code !== 200 || !result.data) return;

            window.sharedDocState.lastModified = result.data.last_modified || window.sharedDocState.lastModified;
            window.sharedDocState.contentVersion = result.data.content_version || window.sharedDocState.contentVersion;
            if (!result.data.changed) return;

            var remoteContent = result.data.content || '';
            var localContent = window.vditor ? window.vditor.getValue() : '';
            var localRecentlyEdited = Date.now() - window.sharedDocState.lastLocalEditAt < 3000;

            // 如果正在编辑，不要用轮询结果覆盖本地内容
            if (localRecentlyEdited) {
                console.log('跳过轮询更新：用户正在编辑');
                return;
            }

            if (window.vditor && remoteContent !== localContent) {
                // 保存光标位置
                var selection = window.getSelection();
                var cursorPosition = null;
                if (selection && selection.rangeCount > 0) {
                    var range = selection.getRangeAt(0);
                    cursorPosition = {
                        startContainer: range.startContainer,
                        startOffset: range.startOffset,
                        endContainer: range.endContainer,
                        endOffset: range.endOffset
                    };
                }

                window.vditor.setValue(remoteContent);
                window.sharedDocState.lastKnownContent = remoteContent;

                // 恢复光标位置
                if (cursorPosition) {
                    try {
                        var newRange = document.createRange();
                        newRange.setStart(cursorPosition.startContainer, cursorPosition.startOffset);
                        newRange.setEnd(cursorPosition.endContainer, cursorPosition.endOffset);
                        selection.removeAllRanges();
                        selection.addRange(newRange);
                    } catch (e) {
                        // 如果恢复失败，忽略错误
                    }
                }
            }
        } catch (err) {
            console.error('共享文档轮询失败:', err);
        }
    }

    function getShareWsUrl() {
        var apiBase = window.getApiBaseUrl ? window.getApiBaseUrl() : '/api';
        var normalized = apiBase.replace(/\/$/, '');
        var wsBase;
        if (/^https?:\/\//i.test(normalized)) {
            wsBase = normalized.replace(/^http/i, 'ws');
        } else {
            var prefix = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
            wsBase = prefix + window.location.host + (normalized.startsWith('/') ? normalized : '/' + normalized);
        }
        return wsBase + '/share/ws';
    }

    function connectShareWebSocket() {
        if (!window.sharedDocState) return;
        if (window.sharedDocState.ws && (window.sharedDocState.ws.readyState === WebSocket.OPEN || window.sharedDocState.ws.readyState === WebSocket.CONNECTING)) {
            return;
        }

        var query = new URLSearchParams({
            share_id: window.sharedDocState.shareId,
            password: window.sharedDocState.sharePassword || '',
            edit_password: window.sharedDocState.editPassword || '',
            viewer_id: window.sharedDocState.viewerId,
            viewer_name: window.sharedDocState.viewerName,
            editor_username: window.currentUser && window.currentUser.username ? window.currentUser.username : '',
            editor_token: window.currentUser && window.currentUser.token ? window.currentUser.token : ''
        });

        var socket = new WebSocket(getShareWsUrl() + '?' + query.toString());
        window.sharedDocState.ws = socket;
        updateShareConnectionStatus('connecting');

        socket.onopen = function() {
            if (!window.sharedDocState) return;
            window.sharedDocState.wsConnected = true;
            if (window.sharedDocState.wsGraceTimer) {
                clearTimeout(window.sharedDocState.wsGraceTimer);
                window.sharedDocState.wsGraceTimer = null;
            }
            updateShareConnectionStatus('connected');
            if (window.sharedDocState.pollTimer) {
                clearInterval(window.sharedDocState.pollTimer);
                window.sharedDocState.pollTimer = null;
            }
        };

        socket.onmessage = function(event) {
            if (!window.sharedDocState) return;
            var payload;
            try {
                payload = JSON.parse(event.data || '{}');
            } catch (error) {
                return;
            }

            if (payload.type === 'presence') {
                window.sharedDocState.onlineUsers = payload.online_users || [];
                renderSharePresence(payload.online_users || []);
                return;
            }

            if (payload.type === 'video_call_invite') {
                handleIncomingShareVideoInvite(payload);
                return;
            }

            if (payload.type === 'video_call_response') {
                handleShareVideoCallResponse(payload);
                return;
            }

            if (payload.type === 'video_signal') {
                handleShareVideoSignal(payload);
                return;
            }

            if (payload.type === 'video_offer') {
                handleShareVideoOffer(payload);
                return;
            }

            if (payload.type === 'video_answer') {
                handleShareVideoAnswer(payload);
                return;
            }

            if (payload.type === 'video_ice_candidate') {
                handleShareVideoIceCandidate(payload);
                return;
            }

            if (payload.type === 'video_call_hangup') {
                showToast(window.i18n ? window.i18n.t('videoCallEndedByPeer') : '对方已结束视频通话', 'info');
                cleanupShareVideoCall(false, 'peer_hangup');
                return;
            }

            if (payload.type === 'video_call_unavailable') {
                showToast(window.i18n ? window.i18n.t('videoUserUnavailable') : '对方当前不可接通', 'error');
                cleanupShareVideoCall(false, 'unavailable');
                return;
            }

            if (payload.type === 'video_room_participants') {
                handleShareRoomParticipants(payload);
                return;
            }

            if (payload.type === 'video_room_peer_joined') {
                handleShareRoomPeerJoined(payload);
                return;
            }

            if (payload.type === 'video_room_peer_left') {
                handleShareRoomPeerLeft(payload);
                return;
            }

            if (payload.type === 'video_room_signal') {
                handleShareRoomSignal(payload);
                return;
            }

            if (payload.type === 'ready' || payload.type === 'doc_updated') {
                if (payload.last_modified) {
                    window.sharedDocState.lastModified = payload.last_modified;
                }
                if (payload.content_version) {
                    window.sharedDocState.contentVersion = payload.content_version;
                }

                var localRecentlyEdited = Date.now() - window.sharedDocState.lastLocalEditAt < 3000;
                var isSelfUpdate = payload.updated_by && payload.updated_by === window.sharedDocState.viewerId;

                // 如果正在编辑且不是自己的更新，不要覆盖本地内容
                if (localRecentlyEdited && !isSelfUpdate) {
                    console.log('跳过远程更新：用户正在编辑');
                    return;
                }

                if (typeof payload.content === 'string') {
                    if (window.vditor && window.vditor.getValue() !== payload.content) {
                        // 保存光标位置
                        var selection = window.getSelection();
                        var cursorPosition = null;
                        if (selection && selection.rangeCount > 0 && !isSelfUpdate) {
                            var range = selection.getRangeAt(0);
                            cursorPosition = {
                                startContainer: range.startContainer,
                                startOffset: range.startOffset,
                                endContainer: range.endContainer,
                                endOffset: range.endOffset
                            };
                        }

                        window.vditor.setValue(payload.content);

                        // 恢复光标位置（仅在非自己更新时）
                        if (cursorPosition && !isSelfUpdate) {
                            try {
                                var newRange = document.createRange();
                                newRange.setStart(cursorPosition.startContainer, cursorPosition.startOffset);
                                newRange.setEnd(cursorPosition.endContainer, cursorPosition.endOffset);
                                selection.removeAllRanges();
                                selection.addRange(newRange);
                            } catch (e) {
                                // 如果恢复失败，忽略错误
                            }
                        }
                    }
                    window.sharedDocState.lastKnownContent = payload.content;
                }
                window.sharedDocState.isSaving = false;
                if (isSelfUpdate) {
                    resolveSharedManualSave(true);
                }
                return;
            }

            if (payload.type === 'conflict' && payload.latest) {
                window.sharedDocState.lastKnownContent = payload.latest.content || window.sharedDocState.lastKnownContent;
                window.sharedDocState.lastModified = payload.latest.last_modified || window.sharedDocState.lastModified;
                window.sharedDocState.contentVersion = payload.latest.content_version || window.sharedDocState.contentVersion;
                if (window.vditor) {
                    // 保存光标位置
                    var selection = window.getSelection();
                    var cursorPosition = null;
                    if (selection && selection.rangeCount > 0) {
                        var range = selection.getRangeAt(0);
                        cursorPosition = {
                            startContainer: range.startContainer,
                            startOffset: range.startOffset,
                            endContainer: range.endContainer,
                            endOffset: range.endOffset
                        };
                    }

                    window.vditor.setValue(window.sharedDocState.lastKnownContent);

                    // 恢复光标位置
                    if (cursorPosition) {
                        try {
                            var newRange = document.createRange();
                            newRange.setStart(cursorPosition.startContainer, cursorPosition.startOffset);
                            newRange.setEnd(cursorPosition.endContainer, cursorPosition.endOffset);
                            selection.removeAllRanges();
                            selection.addRange(newRange);
                        } catch (e) {
                            // 如果恢复失败，忽略错误
                        }
                    }
                }
                window.sharedDocState.isSaving = false;
                resolveSharedManualSave(false);
                showToast(window.i18n ? '检测到并发冲突，已刷新为最新版本' : 'Conflict detected. Loaded latest version.', 'error');
                return;
            }

            if (payload.type === 'cursor_position') {
                // 处理其他用户的光标位置
                if (!window.sharedDocState) return;
                
                window.sharedDocState.remoteCursors = window.sharedDocState.remoteCursors || {};

                // 如果有文本偏移量，使用它来计算准确位置
                let cursorPosition = payload.position;
                if (payload.textOffset !== undefined && payload.textOffset !== null) {
                    cursorPosition = getPixelPositionFromOffset(payload.textOffset);
                }

                window.sharedDocState.remoteCursors[payload.viewer_id] = {
                    viewerId: payload.viewer_id,
                    viewerName: payload.viewer_name,
                    position: cursorPosition || payload.position,
                    selection: payload.selection,
                    color: getCursorColor(payload.viewer_id),
                    lastUpdate: Date.now()
                };

                // 渲染远程光标
                renderRemoteCursors();
                return;
            }

            if (payload.type === 'error') {
                window.sharedDocState.isSaving = false;
                resolveSharedManualSave(false);
            }
        };

        socket.onclose = function() {
            if (!window.sharedDocState) return;
            window.sharedDocState.wsConnected = false;
            window.sharedDocState.ws = null;
            cleanupShareVideoRoom(false);
            updateShareConnectionStatus('polling');
            if (!window.sharedDocState.pollTimer) {
                window.sharedDocState.pollTimer = setInterval(pollSharedDocContent, 2500);
            }
            if (window.sharedDocState.wsRetryTimer) {
                clearTimeout(window.sharedDocState.wsRetryTimer);
            }
            window.sharedDocState.wsRetryTimer = setTimeout(connectShareWebSocket, 3000);
        };

        socket.onerror = function() {
            if (socket.readyState !== WebSocket.OPEN) {
                socket.close();
            }
        };
    }

    function renderSharePresence(onlineUsers) {
        // 所有用户都显示在线状态栏（包括查看者）

        var bar = document.getElementById('sharePresenceBar');
        if (!bar) {
            bar = document.createElement('div');
            bar.id = 'sharePresenceBar';
            bar.style.cssText = 'position:fixed;top:12px;right:12px;z-index:10002;';
            document.body.appendChild(bar);
        }

        var isMinimized = !!(window.sharedDocState && window.sharedDocState.connectionHintMinimized);
        var names = (onlineUsers || []).slice(0, 5).map(function(u) {
            var safeName = escapeShareHtml(u && u.viewer_name ? u.viewer_name : 'Guest');
            return u && u.is_editing ? (safeName + '...') : safeName;
        });
        var statusInfo = getShareConnectionStatusInfo(window.sharedDocState ? window.sharedDocState.connectionStatus : 'connecting');

        if (isMinimized) {
            bar.innerHTML =
                '<button id="restoreSharePresenceBtn" title="恢复连接状态" style="width:16px;height:16px;padding:0;border:none;border-radius:50%;background:#2da44e;cursor:pointer;box-shadow:0 4px 10px rgba(0,0,0,0.22);"></button>';

            var restoreBtn = document.getElementById('restoreSharePresenceBtn');
            if (restoreBtn) {
                restoreBtn.onclick = function() {
                    if (!window.sharedDocState) return;
                    window.sharedDocState.connectionHintMinimized = false;
                    renderSharePresence(window.sharedDocState.onlineUsers || []);
                };
            }

            var minimizedPanel = document.getElementById('shareVideoUserPanel');
            if (minimizedPanel) minimizedPanel.style.display = 'none';
            return;
        }

        var editableUsers = getShareEditableUsers();
        var isOwner = window.sharedDocState && window.currentUser && window.currentUser.username === window.sharedDocState.ownerUsername;
        var canEdit = window.sharedDocState && window.sharedDocState.canEdit;

        bar.innerHTML =
            '<div style="display:flex;align-items:center;gap:8px;background:rgba(36,41,46,0.92);color:#fff;padding:6px 10px;border-radius:20px;font-size:12px;max-width:min(94vw,620px);box-shadow:0 8px 20px rgba(0,0,0,0.2);">' +
            '<span style="display:inline-flex;align-items:center;gap:6px;">' +
            '<span style="width:8px;height:8px;border-radius:50%;background:' + statusInfo.color + ';display:inline-block;"></span>' +
            '<span style="font-weight:500;">' + statusInfo.text + '</span>' +
            '</span>' +
            '<span style="opacity:0.8;">|</span>' +
            '<span title="' + names.join(', ') + '" style="display:flex;align-items:center;gap:4px;">' +
            '<span>👥 ' + (onlineUsers.length || 0) + ' 在线</span>' +
            (names.length > 0 ? '<span style="opacity:0.7;font-size:11px;">(' + names.slice(0, 3).join(', ') + (names.length > 3 ? '...' : '') + ')</span>' : '') +
            '</span>' +
            (canEdit && editableUsers.length > 0 ? '<button id="toggleShareVideoUsers" style="border:none;background:#2563eb;color:#fff;padding:2px 8px;border-radius:999px;cursor:pointer;font-size:12px;">📹 通话 (' + editableUsers.length + ')</button>' : '') +
            (canEdit ? '<button id="toggleShareVideoRoom" style="border:none;background:#7c3aed;color:#fff;padding:2px 8px;border-radius:999px;cursor:pointer;font-size:12px;">' +
            (window.sharedDocState && window.sharedDocState.videoRoom && window.sharedDocState.videoRoom.joined
                ? '🎥 多人通话中'
                : '🎥 多人通话') +
            '</button>' : '') +
            (isOwner ? '<button id="showHistoryBtn" style="border:none;background:#f59e0b;color:#fff;padding:2px 8px;border-radius:999px;cursor:pointer;font-size:12px;">📜 历史</button>' : '') +
            '<button id="minimizeSharePresenceBtn" title="最小化" style="border:none;background:transparent;color:#fff;padding:0 4px;line-height:1;cursor:pointer;font-size:16px;opacity:0.85;">-</button>' +
            '</div>';

        var minimizeBtn = document.getElementById('minimizeSharePresenceBtn');
        if (minimizeBtn) {
            minimizeBtn.onclick = function() {
                if (!window.sharedDocState) return;
                window.sharedDocState.connectionHintMinimized = true;
                renderSharePresence(window.sharedDocState.onlineUsers || []);
            };
        }

        var historyBtn = document.getElementById('showHistoryBtn');
        if (historyBtn) {
            historyBtn.onclick = function() {
                showHistoryModal();
            };
        }

        var toggleBtn = document.getElementById('toggleShareVideoUsers');
        if (toggleBtn) {
            toggleBtn.onclick = function() {
                var panel = document.getElementById('shareVideoUserPanel');
                if (panel && panel.style.display === 'block') {
                    panel.style.display = 'none';
                    return;
                }
                if (!panel) {
                    panel = document.createElement('div');
                    panel.id = 'shareVideoUserPanel';
                    panel.style.cssText = 'position:fixed;top:98px;left:50%;transform:translateX(-50%);z-index:10003;background:rgba(17,24,39,0.96);color:#fff;border-radius:10px;padding:10px 12px;width:min(360px,92vw);box-shadow:0 10px 22px rgba(0,0,0,0.28);';
                    document.body.appendChild(panel);
                }
                var users = getShareEditableUsers();
                if (!users.length) {
                    panel.innerHTML = '<div style="font-size:12px;opacity:0.9;">' + (window.i18n ? window.i18n.t('videoNoEditableUsers') : '暂无可通话用户') + '</div>';
                } else {
                    panel.innerHTML = users.map(function(user) {
                        var label = escapeShareHtml(getShareVideoUserLabel(user));
                        return '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.08);">' +
                            '<span style="font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + label + '</span>' +
                            '<button data-share-call-user="' + user.viewer_id + '" style="border:none;background:#10b981;color:#fff;padding:4px 10px;border-radius:6px;cursor:pointer;font-size:12px;">' +
                            (window.i18n ? window.i18n.t('videoCall') : '视频通话') +
                            '</button>' +
                        '</div>';
                    }).join('');
                    panel.querySelectorAll('button[data-share-call-user]').forEach(function(btn) {
                        btn.addEventListener('click', function() {
                            var targetId = this.getAttribute('data-share-call-user');
                            var target = users.find(function(u) { return u.viewer_id === targetId; });
                            if (target) startShareVideoCallWithUser(target);
                        });
                    });
                }
                panel.style.display = 'block';
            };
        }

        var roomBtn = document.getElementById('toggleShareVideoRoom');
        if (roomBtn) {
            roomBtn.onclick = function() {
                var room = getShareVideoRoomState();
                if (room && room.joined) {
                    openShareVideoRoomModal();
                    return;
                }
                startShareVideoRoom();
            };
        }

    }

    async function heartbeatSharePresence() {
        if (!window.sharedDocState) return;
        if (window.sharedDocState.ws && window.sharedDocState.wsConnected && window.sharedDocState.ws.readyState === WebSocket.OPEN) {
            window.sharedDocState.ws.send(JSON.stringify({
                type: 'heartbeat',
                is_editing: (Date.now() - window.sharedDocState.lastLocalEditAt) < 5000
            }));
            return;
        }
        try {
            var apiUrl = (window.getApiBaseUrl ? window.getApiBaseUrl() : 'api') + '/share/presence';
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    share_id: window.sharedDocState.shareId,
                    password: window.sharedDocState.sharePassword,
                    viewer_id: window.sharedDocState.viewerId,
                    viewer_name: window.sharedDocState.viewerName,
                    can_edit: window.sharedDocState.canEdit,
                    is_editing: (Date.now() - window.sharedDocState.lastLocalEditAt) < 5000
                })
            });
            const result = await response.json();
            if (result.code === 200 && result.data) {
                window.sharedDocState.onlineUsers = result.data.online_users || [];
                renderSharePresence(result.data.online_users || []);
            }
        } catch (err) {
            console.error('共享文档在线状态上报失败:', err);
        }
    }

    function startSharedDocRealtime() {
        if (!window.sharedDocState) return;

        if (window.sharedDocState.pollTimer) clearInterval(window.sharedDocState.pollTimer);
        if (window.sharedDocState.presenceTimer) clearInterval(window.sharedDocState.presenceTimer);
        if (window.sharedDocState.localWatchTimer) clearInterval(window.sharedDocState.localWatchTimer);
        if (window.sharedDocState.wsRetryTimer) clearTimeout(window.sharedDocState.wsRetryTimer);
        if (window.sharedDocState.wsGraceTimer) clearTimeout(window.sharedDocState.wsGraceTimer);

        // 仅查看模式下不启动实时同步和在线状态功能
        if (!window.sharedDocState.canEdit) {
            return;
        }

        if (window.sharedDocState.canEdit) {
            window.sharedDocState.localWatchTimer = setInterval(function() {
                if (window.vditor && window.sharedDocState && window.sharedDocState.canEdit) {
                    var current = window.vditor.getValue();
                    if (current !== window.sharedDocState.lastKnownContent) {
                        scheduleSharedDocSync();
                    }
                }
            }, 1200);
        }

        // WebSocket 优先，轮询作为降级保障
        connectShareWebSocket();
        updateShareConnectionStatus('connecting');
        window.sharedDocState.wsGraceTimer = setTimeout(function() {
            if (!window.sharedDocState || window.sharedDocState.wsConnected) return;
            updateShareConnectionStatus('polling');
            if (!window.sharedDocState.pollTimer) {
                window.sharedDocState.pollTimer = setInterval(pollSharedDocContent, window.sharedDocState.canEdit ? 2200 : 3000);
            }
        }, 1800);

        heartbeatSharePresence();
        window.sharedDocState.presenceTimer = setInterval(heartbeatSharePresence, 5000);
    }

    window.activateSharedDocumentSession = activateSharedDocumentSession;
    window.deactivateSharedDocumentSession = deactivateSharedDocumentSession;
    window.scheduleSharedDocSync = scheduleSharedDocSync;

    function hideEditElements() {
        // 隐藏顶部工具栏
        const mobileToolbar = document.querySelector('.mobile-toolbar-container');
        if (mobileToolbar) {
            mobileToolbar.style.display = 'none';
        }

        // 隐藏底部操作栏
        const mobileBottomBar = document.querySelector('.mobile-bottom-bar');
        if (mobileBottomBar) {
            mobileBottomBar.style.display = 'none';
        }

        // 隐藏文件列表按钮
        const mobileFileBtn = document.getElementById('mobileFileBtn');
        if (mobileFileBtn) {
            mobileFileBtn.style.display = 'none';
        }

        // 隐藏登录按钮
        const mobileLoginBtn = document.getElementById('mobileLoginBtn');
        if (mobileLoginBtn) {
            mobileLoginBtn.style.display = 'none';
        }

        // 隐藏菜单按钮
        const mobileMenuBtn = document.getElementById('mobileMenuBtn');
        if (mobileMenuBtn) {
            mobileMenuBtn.style.display = 'none';
        }

        // 隐藏夜间模式切换按钮
        const modeToggle = document.getElementById('modeToggle');
        if (modeToggle) {
            modeToggle.style.display = 'none';
        }

        // 隐藏保存按钮
        const saveFileBtn = document.getElementById('saveFileBtn');
        if (saveFileBtn) {
            saveFileBtn.style.display = 'none';
        }

        // 调整编辑器容器高度
        const editorContainer = document.querySelector('.editor-container');
        if (editorContainer) {
            editorContainer.style.top = '0';
            editorContainer.style.height = '100vh';
        }
    }

    function showShareInfo(shareData) {
        // 显示分享信息提示
        const t = (key) => window.i18n ? window.i18n.t(key) : key;
        let infoMessage = `${t('shareDocument')}: ${shareData.filename}`;
        if (shareData.expires_at) {
            const expiryDate = new Date(shareData.expires_at);
            if (shareData.is_expired) {
                infoMessage += ` (${t('expired')}: ${expiryDate.toLocaleString()})`;
            } else {
                infoMessage += ` (${t('expiresAt')}: ${expiryDate.toLocaleString()})`;
            }
        }
        var modeText = shareData.mode === 'view' ? t('viewOnly') : (shareData.can_edit ? t('editable') : (window.i18n ? '可查看（无编辑权限）' : 'view only, no edit permission'));
        infoMessage += ` (${t('mode')}: ${modeText})`;

        showToast(infoMessage, 'info');
    }

    function showSensitiveWordsError(sensitiveWords) {
        const wordsStr = sensitiveWords.join('、');
        const isEn = window.i18n && window.i18n.getLanguage() === 'en';
        const title = isEn ? 'Content Blocked' : '内容被拦截';
        const message = isEn
            ? `This shared content contains sensitive words (${wordsStr}) and cannot be displayed.`
            : `分享的内容包含敏感词（${wordsStr}），无法显示！`;

        // 创建错误提示模态框
        let errorModal = document.getElementById('sensitiveWordsErrorModal');
        if (!errorModal) {
            errorModal = document.createElement('div');
            errorModal.id = 'sensitiveWordsErrorModal';
            errorModal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:10001;';

            const modalContent = document.createElement('div');
            modalContent.style.cssText = 'background:white;color:#333;border-radius:12px;padding:30px;width:90%;max-width:400px;text-align:center;';
            modalContent.innerHTML = `
                <div style="margin-bottom:20px;color:#e74c3c;">
                    <i class="fas fa-exclamation-circle" style="font-size:48px;"></i>
                </div>
                <h2 style="margin-bottom:15px;color:#333;">${title}</h2>
                <p style="color:#666;margin-bottom:25px;line-height:1.6;">${message}</p>
                <button onclick="document.getElementById('sensitiveWordsErrorModal').remove();" style="padding:10px 30px;background:#4a90e2;color:white;border:none;border-radius:6px;cursor:pointer;font-size:14px;">
                    ${isEn ? 'OK' : '确定'}
                </button>
            `;

            errorModal.appendChild(modalContent);
            document.body.appendChild(errorModal);
        }

        // 隐藏编辑器内容（因为无法显示）
        const vditorElement = document.getElementById('vditor');
        if (vditorElement) {
            vditorElement.style.display = 'none';
        }

        // 隐藏所有编辑相关元素
        hideEditElements();
    }

    function showToast(message, type = 'info') {
        // 创建提示元素
        let toast = document.getElementById('toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'toast';
            toast.className = 'toast';
            document.body.appendChild(toast);
        }

        // 设置样式
        toast.style.position = 'fixed';
        toast.style.top = '170px';
        toast.style.left = '50%';
        toast.style.transform = 'translate(-50%, -20px)';
        toast.style.padding = '12px 24px';
        toast.style.borderRadius = '6px';
        toast.style.background = '#24292e';
        toast.style.color = 'white';
        toast.style.fontSize = '14px';
        toast.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
        toast.style.opacity = '0';
        toast.style.transition = 'all 0.3s';
        toast.style.zIndex = '10000';
        toast.style.maxWidth = '400px';
        toast.style.textAlign = 'center';

        if (type === 'success') {
            toast.style.background = '#2da44e';
        } else if (type === 'error') {
            toast.style.background = '#cf222e';
        }

        // 显示消息
        toast.textContent = message;
        toast.classList.add('show');
        toast.style.transform = 'translate(-50%, 0)';
        toast.style.opacity = '1';

        // 3秒后隐藏
        setTimeout(() => {
            toast.style.transform = 'translate(-50%, -20px)';
            toast.style.opacity = '0';
        }, 3000);
    }
