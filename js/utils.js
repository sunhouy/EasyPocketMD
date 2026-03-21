/**
 * 工具函数 - 消息、状态、格式化等
 */
(function(global) {
    'use strict';

    function showMessage(text, type = 'info') {
        const message = document.createElement('div');
        message.textContent = text;
        message.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: ${type === 'error' ? '#f44336' : type === 'success' ? '#4CAF50' : '#2196F3'};
            color: white;
            padding: 12px 20px;
            border-radius: 6px;
            font-size: 14px;
            z-index: 9999;
            max-width: 400px;
            text-align: center;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        `;
        document.body.appendChild(message);
        setTimeout(() => {
            if (message.parentNode) message.parentNode.removeChild(message);
        }, 3000);
    }

    function showSyncStatus(text, type = 'syncing') {
        const syncStatus = document.getElementById('syncStatus');
        const syncText = document.getElementById('syncText');
        if (syncStatus && syncText) {
            syncStatus.className = `sync-status ${type}`;
            syncText.textContent = text;
            syncStatus.classList.add('syncing');
            if (type === 'success' || type === 'error') {
                setTimeout(() => syncStatus.classList.remove('syncing'), 2000);
            }
        }
    }

    function showUploadStatus(message, type = 'info') {
        const existingStatus = document.querySelector('.upload-status');
        if (existingStatus) existingStatus.remove();
        const statusDiv = document.createElement('div');
        statusDiv.className = `upload-status ${type}`;
        statusDiv.textContent = message;
        document.body.appendChild(statusDiv);
        setTimeout(() => {
            if (statusDiv.parentNode) statusDiv.parentNode.removeChild(statusDiv);
        }, 3000);
    }

    function formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML.replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/\n/g, '\\n');
    }

    function removeModal(modalElement) {
        if (modalElement && modalElement.parentNode) {
            if (modalElement.removeKeydownHandler) modalElement.removeKeydownHandler();
            modalElement.style.opacity = '0';
            modalElement.style.transition = 'opacity 0.2s';
            setTimeout(() => {
                if (modalElement.parentNode) modalElement.parentNode.removeChild(modalElement);
            }, 200);
        }
    }

    /** 获取本地 API 根地址（同源 api/index.php），保证 origin 与 api 之间必有 / */
    function getApiBaseUrl() {
        if (typeof window !== 'undefined') {
            // 在 Electron 应用、Capacitor 应用或本地 file:// 协议下运行，直接请求远程服务器
            if (window.electron || 
                (window.location && (window.location.protocol === 'file:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) ||
                (window.Capacitor && window.Capacitor.isNativePlatform())) {
                return 'https://md.yhsun.cn/api';
            }
            if (window.location && window.location.origin) {
                var path = (window.location.pathname || '').replace(/\/[^/]*$/, '');
                var base = window.location.origin + path;
                return base.replace(/\/?$/, '/') + 'api';
            }
        }
        return 'api';
    }

    /** 获取应用的基础域名（用于拼接绝对路径） */
    function getAppOrigin() {
        if (typeof window !== 'undefined') {
            if (window.electron || 
                (window.location && (window.location.protocol === 'file:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) ||
                (window.Capacitor && window.Capacitor.isNativePlatform())) {
                return 'https://md.yhsun.cn';
            }
            return window.location.origin;
        }
        return '';
    }

    /** 安全解析接口响应为 JSON，若返回 HTML 或非 JSON 则返回错误对象并附带详情便于排查 */
    function parseJsonResponse(response) {
        return response.text().then(function(text) {
            var t = (text || '').trim();
            var isHtml = t.charAt(0) === '<' || t.toLowerCase().indexOf('<!doctype') === 0;
            if (isHtml) {
                var status = response.status;
                var preview = t.substring(0, 120).replace(/\s+/g, ' ');
                var msg = '接口返回了非 JSON 内容';
                if (status === 404) {
                    // Check if the request was actually for the legacy PHP API
                    if (response.url && response.url.indexOf('/api/index.php') !== -1) {
                        msg = '接口地址未找到(404)，请确认 API 路径是否为 /api/index.php';
                    } else {
                        msg = '接口地址未找到(404)，请检查服务器 API 服务是否正常运行';
                    }
                } else if (status === 500) {
                    msg = '服务器内部错误(500)，请查看服务器或 api/error.log';
                } else if (status >= 400) {
                    msg = '请求异常(' + status + ')';
                }
                if (preview) {
                    msg += '。响应预览: ' + preview + (t.length > 120 ? '...' : '');
                }
                return { code: 500, message: msg };
            }
            try {
                return JSON.parse(text);
            } catch (e) {
                return { code: 500, message: '响应解析失败: ' + (e.message || '无效 JSON') };
            }
        });
    }

    global.showMessage = showMessage;
    global.showSyncStatus = showSyncStatus;
    global.showUploadStatus = showUploadStatus;
    global.formatFileSize = formatFileSize;
    global.escapeHtml = escapeHtml;
    global.removeModal = removeModal;
    global.getApiBaseUrl = getApiBaseUrl;
    global.getAppOrigin = getAppOrigin;
    global.parseJsonResponse = parseJsonResponse;

})(typeof window !== 'undefined' ? window : this);
