(function(global) {
    'use strict';

    function g(name) { return global[name]; }
    function isEn() { return window.i18n && window.i18n.getLanguage() === 'en'; }

    var notificationState = {
        notifications: [],
        taskPollingInterval: null,
        maxNotifications: 50,
        requestPermissionPending: false
    };

    async function initNotificationService() {
        if (!('Notification' in window)) {
            console.log('[Notification] Browser does not support notifications');
            return false;
        }

        if (Notification.permission === 'granted') {
            return true;
        }

        if (Notification.permission !== 'denied') {
            const permission = await Notification.requestPermission();
            return permission === 'granted';
        }

        return false;
    }

    function showBrowserNotification(title, body, options = {}) {
        if (Notification.permission !== 'granted') {
            console.log('[Notification] Notification permission not granted');
            return null;
        }

        try {
            const notification = new Notification(title, {
                body: body,
                icon: options.icon || '/icon.png',
                tag: options.tag || 'notification-' + Date.now(),
                badge: options.badge || '/icon.png',
                requireInteraction: options.requireInteraction !== false,
                silent: options.silent || false,
                data: options.data || {}
            });

            notification.onclick = function() {
                window.focus();
                notification.close();
                if (options.onClick) {
                    options.onClick(options.data);
                }
            };

            if (options.autoClose !== false) {
                setTimeout(() => {
                    notification.close();
                }, options.autoCloseDelay || 10000);
            }

            return notification;
        } catch (error) {
            console.error('[Notification] Failed to show browser notification:', error);
            return null;
        }
    }

    function showInAppNotification(notification) {
        var container = getNotificationContainer();
        if (!container) return;

        var notificationEl = document.createElement('div');
        notificationEl.className = 'in-app-notification';
        notificationEl.dataset.id = notification.id;

        var bgColor = document.body.classList.contains('night-mode') ? '#2d2d2d' : '#ffffff';
        var textColor = document.body.classList.contains('night-mode') ? '#eee' : '#333';
        var borderColor = document.body.classList.contains('night-mode') ? '#444' : '#ddd';

        var iconMap = {
            'success': '<i class="fas fa-check-circle" style="color:#2ecc71;"></i>',
            'error': '<i class="fas fa-times-circle" style="color:#e74c3c;"></i>',
            'warning': '<i class="fas fa-exclamation-triangle" style="color:#f39c12;"></i>',
            'info': '<i class="fas fa-info-circle" style="color:#3498db;"></i>',
            'task_complete': '<i class="fas fa-check-circle" style="color:#2ecc71;"></i>',
            'task_failed': '<i class="fas fa-times-circle" style="color:#e74c3c;"></i>'
        };

        var icon = iconMap[notification.type] || iconMap['info'];
        var timeStr = formatTime(notification.timestamp || new Date().toISOString());

        notificationEl.innerHTML = `
            <div style="display:flex;align-items:flex-start;gap:12px;padding:12px;">
                <div style="font-size:20px;line-height:1;">${icon}</div>
                <div style="flex:1;min-width:0;">
                    <div style="font-weight:600;font-size:14px;margin-bottom:4px;color:${textColor};">${escapeHtml(notification.title || '')}</div>
                    <div style="font-size:13px;color:${document.body.classList.contains('night-mode') ? '#aaa' : '#666'};line-height:1.4;">${escapeHtml(notification.body || '')}</div>
                    ${notification.data && notification.data.url ? `
                        <button class="notification-download-btn" data-url="${escapeHtml(notification.data.url)}" data-filename="${escapeHtml(notification.data.filename || '')}" style="margin-top:8px;padding:6px 12px;background:#4a90e2;color:white;border:none;border-radius:4px;cursor:pointer;font-size:12px;">
                            ${isEn() ? 'Download' : '下载'}
                        </button>
                    ` : ''}
                </div>
                <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;">
                    <button class="notification-close-btn" style="background:none;border:none;color:#999;cursor:pointer;font-size:16px;padding:0;">&times;</button>
                    <span style="font-size:11px;color:#999;">${timeStr}</span>
                </div>
            </div>
        `;

        notificationEl.style.cssText = `
            background:${bgColor};
            border:1px solid ${borderColor};
            border-radius:8px;
            margin-bottom:8px;
            box-shadow:0 4px 12px rgba(0,0,0,0.15);
            animation:notificationSlideIn 0.3s ease-out;
            max-width:360px;
        `;

        notificationEl.querySelector('.notification-close-btn').addEventListener('click', function() {
            removeNotification(notification.id);
        });

        var downloadBtn = notificationEl.querySelector('.notification-download-btn');
        if (downloadBtn) {
            downloadBtn.addEventListener('click', function() {
                var url = this.dataset.url;
                var filename = this.dataset.filename;
                downloadNotificationFile(url, filename);
                removeNotification(notification.id);
            });
        }

        container.insertBefore(notificationEl, container.firstChild);

        while (container.children.length > notificationState.maxNotifications) {
            var lastChild = container.lastChild;
            if (lastChild) {
                lastChild.remove();
            }
        }

        if (notification.autoClose !== false) {
            setTimeout(function() {
                removeNotification(notification.id);
            }, notification.autoCloseDelay || 30000);
        }

        notificationState.notifications.unshift(notification);
        if (notificationState.notifications.length > notificationState.maxNotifications) {
            notificationState.notifications.pop();
        }

        updateNotificationBadge();
    }

    function getNotificationContainer() {
        var container = document.getElementById('notificationContainer');
        if (!container) {
            container = document.createElement('div');
            container.id = 'notificationContainer';
            container.style.cssText = 'position:fixed;top:20px;right:20px;z-index:100010;max-height:calc(100vh - 40px);overflow-y:auto;padding:10px;';
            document.body.appendChild(container);
        }
        return container;
    }

    function removeNotification(id) {
        var container = getNotificationContainer();
        var notificationEl = container.querySelector(`[data-id="${id}"]`);
        if (notificationEl) {
            notificationEl.style.animation = 'notificationSlideOut 0.3s ease-in';
            setTimeout(function() {
                notificationEl.remove();
            }, 300);
        }
        notificationState.notifications = notificationState.notifications.filter(function(n) {
            return n.id !== id;
        });
        updateNotificationBadge();
    }

    function clearAllNotifications() {
        var container = getNotificationContainer();
        container.innerHTML = '';
        notificationState.notifications = [];
        updateNotificationBadge();
    }

    function updateNotificationBadge() {
        var badge = document.getElementById('notificationBadge');
        var count = notificationState.notifications.filter(function(n) {
            return n.type === 'task_complete' || n.type === 'task_failed' || n.type === 'task_updated';
        }).length;

        if (badge) {
            badge.textContent = count > 0 ? (count > 99 ? '99+' : count) : '';
            badge.style.display = count > 0 ? 'flex' : 'none';
        }
    }

    function formatTime(timestamp) {
        var date = new Date(timestamp);
        var now = new Date();
        var diff = now - date;

        if (diff < 60000) {
            return isEn() ? 'Just now' : '刚刚';
        } else if (diff < 3600000) {
            var minutes = Math.floor(diff / 60000);
            return (isEn() ? minutes + 'm ago' : minutes + '分钟前');
        } else if (diff < 86400000) {
            var hours = Math.floor(diff / 3600000);
            return (isEn() ? hours + 'h ago' : hours + '小时前');
        } else {
            return date.toLocaleDateString();
        }
    }

    function escapeHtml(text) {
        if (!text) return '';
        var div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function downloadNotificationFile(url, filename) {
        if (!url) return;

        if (window.nativeFileOps && window.nativeFileOps.isTauriRuntime()) {
            window.nativeFileOps.saveFile({ url: url }, {
                filename: filename || 'download',
                mimeType: getMimeType(url)
            });
        } else {
            var a = document.createElement('a');
            a.href = url;
            a.download = filename || '';
            a.target = '_blank';
            document.body.appendChild(a);
            a.click();
            setTimeout(function() {
                document.body.removeChild(a);
            }, 100);
        }
    }

    function getMimeType(url) {
        if (!url) return 'application/octet-stream';
        var ext = url.split('.').pop().toLowerCase();
        var mimeTypes = {
            'pdf': 'application/pdf',
            'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'doc': 'application/msword',
            'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'ppt': 'application/vnd.ms-powerpoint',
            'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'xls': 'application/vnd.ms-excel',
            'zip': 'application/zip',
            'html': 'text/html',
            'md': 'text/markdown',
            'txt': 'text/plain'
        };
        return mimeTypes[ext] || 'application/octet-stream';
    }

    async function handleNotificationEvent(data) {
        console.log('[Notification] Received notification:', data);

        if (data.type === 'task_complete' || data.type === 'task_failed') {
            var title = data.type === 'task_complete' 
                ? (isEn() ? 'Export Complete' : '导出完成')
                : (isEn() ? 'Export Failed' : '导出失败');
            
            var body = data.message || (data.type === 'task_complete' 
                ? (isEn() ? 'Your file is ready for download' : '文件已准备好下载')
                : (data.error || (isEn() ? 'An error occurred' : '发生错误')));

            showBrowserNotification(title, body, {
                tag: 'task-' + (data.taskId || ''),
                data: data,
                requireInteraction: true,
                autoClose: false,
                onClick: function() {
                    if (data.result && data.result.url) {
                        downloadNotificationFile(data.result.url, data.result.filename);
                    }
                }
            });

            showInAppNotification({
                id: data.id || ('notif-' + Date.now()),
                type: data.type,
                title: title,
                body: body,
                data: data,
                timestamp: data.timestamp || new Date().toISOString(),
                autoClose: data.type === 'task_complete' ? 30000 : false
            });
        } else if (data.type === 'task_updated') {
            var taskNotification = {
                id: data.id || ('notif-' + Date.now()),
                type: 'info',
                title: isEn() ? 'Task Progress' : '任务进度',
                body: data.progressMessage || (isEn() ? 'Processing...' : '处理中...'),
                data: data,
                timestamp: data.timestamp || new Date().toISOString(),
                autoClose: 5000
            };

            var existingNotif = notificationState.notifications.find(function(n) {
                return n.data && n.data.taskId === data.taskId && n.type === 'info';
            });

            if (existingNotif) {
                existingNotif.body = taskNotification.body;
                var existingEl = document.querySelector(`[data-id="${existingNotif.id}"]`);
                if (existingEl) {
                    existingEl.querySelector('.notification-body') && (existingEl.querySelector('.notification-body').textContent = taskNotification.body);
                }
            } else {
                showInAppNotification(taskNotification);
            }
        } else if (data.type === 'browser_notification') {
            showBrowserNotification(data.title, data.body, {
                tag: data.tag,
                data: data.data,
                icon: data.icon
            });
        } else {
            showInAppNotification({
                id: data.id || ('notif-' + Date.now()),
                type: data.type || 'info',
                title: data.title || (isEn() ? 'Notification' : '通知'),
                body: data.body || data.message || '',
                data: data,
                timestamp: data.timestamp || new Date().toISOString()
            });
        }
    }

    async function pollTaskStatus(taskId) {
        try {
            var apiUrl = (g('getApiBaseUrl') ? g('getApiBaseUrl')() : '/api');
            var response = await fetch(apiUrl + '/notifications/tasks/' + taskId, {
                credentials: 'include'
            });

            if (!response.ok) {
                throw new Error('Failed to get task status');
            }

            var result = await response.json();
            if (result.code === 200 && result.data) {
                var task = result.data;
                
                if (task.status === 'completed') {
                    await handleNotificationEvent({
                        type: 'task_complete',
                        taskId: taskId,
                        message: task.progressMessage || (isEn() ? 'Export completed' : '导出完成'),
                        result: task.result,
                        timestamp: new Date().toISOString()
                    });
                    stopPollingTask(taskId);
                } else if (task.status === 'failed') {
                    await handleNotificationEvent({
                        type: 'task_failed',
                        taskId: taskId,
                        error: task.progressMessage || (isEn() ? 'Export failed' : '导出失败'),
                        timestamp: new Date().toISOString()
                    });
                    stopPollingTask(taskId);
                }
            }
        } catch (error) {
            console.error('[Notification] Poll task error:', error);
        }
    }

    function startPollingTask(taskId) {
        if (!notificationState.taskPollingInterval) {
            notificationState.taskPollingInterval = {};
        }
        if (!notificationState.taskPollingInterval[taskId]) {
            notificationState.taskPollingInterval[taskId] = setInterval(function() {
                pollTaskStatus(taskId);
            }, 3000);
        }
    }

    function stopPollingTask(taskId) {
        if (notificationState.taskPollingInterval && notificationState.taskPollingInterval[taskId]) {
            clearInterval(notificationState.taskPollingInterval[taskId]);
            delete notificationState.taskPollingInterval[taskId];
        }
    }

    function stopAllPolling() {
        if (notificationState.taskPollingInterval) {
            Object.keys(notificationState.taskPollingInterval).forEach(function(taskId) {
                clearInterval(notificationState.taskPollingInterval[taskId]);
            });
            notificationState.taskPollingInterval = {};
        }
    }

    async function requestBackgroundExport(options) {
        var userId = g('currentUser') ? (g('currentUser').username || g('currentUser').token) : null;
        if (!userId) {
            throw new Error(isEn() ? 'User not logged in' : '用户未登录');
        }

        await initNotificationService();

        return {
            userId: userId,
            background: true
        };
    }

    function addNotificationStyles() {
        if (document.getElementById('notificationStyles')) return;

        var style = document.createElement('style');
        style.id = 'notificationStyles';
        style.textContent = `
            @keyframes notificationSlideIn {
                from {
                    opacity: 0;
                    transform: translateX(100px);
                }
                to {
                    opacity: 1;
                    transform: translateX(0);
                }
            }
            @keyframes notificationSlideOut {
                from {
                    opacity: 1;
                    transform: translateX(0);
                }
                to {
                    opacity: 0;
                    transform: translateX(100px);
                }
            }
            .in-app-notification:hover {
                box-shadow: 0 6px 16px rgba(0,0,0,0.2);
            }
            .notification-download-btn:hover {
                background: #357abd !important;
            }
            .notification-badge {
                position: absolute;
                top: -5px;
                right: -5px;
                min-width: 18px;
                height: 18px;
                background: #e74c3c;
                color: white;
                border-radius: 9px;
                font-size: 11px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-weight: bold;
            }
        `;
        document.head.appendChild(style);
    }

    function createNotificationBadge(containerId, iconHtml) {
        var existingBadge = document.getElementById('notificationBadge');
        if (existingBadge) return existingBadge;

        var badge = document.createElement('div');
        badge.id = 'notificationBadge';
        badge.className = 'notification-badge';
        badge.style.cssText = 'position:absolute;top:-5px;right:-5px;min-width:18px;height:18px;background:#e74c3c;color:white;border-radius:9px;font-size:11px;display:none;align-items:center;justify-content:center;font-weight:bold;';

        var wrapper = document.createElement('div');
        wrapper.style.position = 'relative';
        wrapper.innerHTML = iconHtml;
        
        var iconElement = wrapper.querySelector('i, svg, img');
        if (iconElement) {
            var parent = iconElement.parentElement;
            parent.style.position = 'relative';
            parent.appendChild(badge);
        }

        return badge;
    }

    addNotificationStyles();

    global.notificationService = {
        init: initNotificationService,
        showNotification: showInAppNotification,
        showBrowserNotification: showBrowserNotification,
        handleNotificationEvent: handleNotificationEvent,
        requestBackgroundExport: requestBackgroundExport,
        startPollingTask: startPollingTask,
        stopPollingTask: stopPollingTask,
        stopAllPolling: stopAllPolling,
        clearAll: clearAllNotifications,
        downloadFile: downloadNotificationFile,
        createBadge: createNotificationBadge
    };

})(typeof window !== 'undefined' ? window : this);
