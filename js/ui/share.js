
(function(global) {
    'use strict';

    function g(name) { return global[name]; }
    function t(key) { return window.i18n ? window.i18n.t(key) : key; }

    async function createShareLink(filename, mode, sharePassword, expireDays) {
        mode = mode || 'view';
        expireDays = expireDays || 7;
        var isEn = window.i18n && window.i18n.getLanguage() === 'en';
        if (!g('currentUser')) throw new Error(isEn ? 'User not logged in' : '用户未登录');
        try {
            var body = { username: g('currentUser').username, token: g('currentUser').token, password: g('currentUser').password, filename: filename, mode: mode, expire_days: expireDays };
            if (sharePassword && sharePassword.trim()) body.share_password = sharePassword.trim();
            var apiUrl = (global.getApiBaseUrl ? global.getApiBaseUrl() : 'api') + '/share/create';
            var response = await fetch(apiUrl, { 
                method: 'POST', 
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + g('currentUser').token }, 
                body: JSON.stringify(body) 
            });
            if (global.parseJsonResponse) return await global.parseJsonResponse(response);
            var text = await response.text();
            if ((text || '').trim().charAt(0) === '<') return { code: 500, message: isEn ? 'API returned non-JSON content, please check API and backend service' : '接口返回了非 JSON 内容，请检查 API 与后端服务' };
            try { return JSON.parse(text); } catch (e) { return { code: 500, message: isEn ? 'Response parsing failed' : '响应解析失败' }; }
        } catch (e) {
            console.error('创建分享链接失败', e);
            if (e.message === 'Failed to fetch' || e.message.includes('NetworkError')) {
                global.showMessage(t('networkNotConnected'), 'error');
                return { code: 500, message: t('networkNotConnected') };
            }
            return { code: 500, message: (isEn ? 'Network error: ' : '网络错误: ') + (e.message || '') };
        }
    }

    function showShareResult(shareData, oldModal) {
        if (oldModal) oldModal.remove();
        var nightMode = g('nightMode') === true;
        var isEn = window.i18n && window.i18n.getLanguage() === 'en';
        var resultModal = document.createElement('div');
        resultModal.className = 'modal-overlay';
        resultModal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:10000;';
        var modalContent = document.createElement('div');
        modalContent.style.cssText = 'background:' + (nightMode ? '#2d2d2d' : 'white') + ';color:' + (nightMode ? '#eee' : '#333') + ';border-radius:12px;padding:25px;width:90%;max-width:500px;';
        modalContent.innerHTML = '<div style="text-align:center;margin-bottom:20px;color:#2ecc71;"><i class="fas fa-check-circle" style="font-size:48px;"></i></div><h2 style="text-align:center;margin-bottom:15px;">' + (isEn ? 'Share link created successfully' : '分享链接创建成功') + '</h2><div style="background:' + (nightMode ? '#3d3d3d' : '#f5f5f5') + ';padding:15px;border-radius:8px;margin-bottom:20px;"><div style="font-size:12px;margin-bottom:5px;">' + (isEn ? 'Share link:' : '分享链接：') + '</div><div style="word-break:break-all;font-size:14px;padding:8px;">' + shareData.share_url + '</div></div><div style="display:flex;gap:10px;"><button class="share-copy-btn" style="flex:1;padding:12px;background:#4a90e2;color:white;border:none;border-radius:6px;cursor:pointer;">' + (isEn ? 'Copy Link' : '复制链接') + '</button><button class="share-close-btn" style="flex:1;padding:12px;background:' + (nightMode ? '#555' : '#6c757d') + ';color:white;border:none;border-radius:6px;cursor:pointer;">' + (isEn ? 'Done' : '完成') + '</button></div>';
        resultModal.appendChild(modalContent);
        document.body.appendChild(resultModal);
        modalContent.querySelector('.share-copy-btn').onclick = function() {
            navigator.clipboard.writeText(shareData.share_url).then(function() {
                global.showMessage(t('linkCopied'));
            });
        };
        modalContent.querySelector('.share-close-btn').onclick = function() { resultModal.remove(); };
        resultModal.addEventListener('click', function(e) { if (e.target === resultModal) resultModal.remove(); });
    }

    function showShareDialog() {
        var isEn = window.i18n && window.i18n.getLanguage() === 'en';
        if (!g('currentUser')) { 
            global.showMessage(t('pleaseLoginFirst'), 'info'); 
            if (g('showLoginModal')) g('showLoginModal')();
            return; 
        }
        if (!g('currentFileId')) { global.showMessage(isEn ? 'Please open or create a file first' : '请先打开或创建文件', 'error'); return; }
        var files = g('files');
        var file = files.find(function(f) { return f.id === g('currentFileId'); });
        if (!file) { global.showMessage(isEn ? 'Current file not found' : '未找到当前文件', 'error'); return; }
        var nightMode = g('nightMode') === true;

        // 创建分享对话框
        var shareModal = document.createElement('div');
        shareModal.className = 'modal-overlay';
        shareModal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:10000;';
        var bg = nightMode ? '#2d2d2d' : 'white';
        var textColor = nightMode ? '#eee' : '#333';
        var shareContent = document.createElement('div');
        shareContent.style.cssText = 'background:' + bg + ';color:' + textColor + ';border-radius:12px;padding:25px;width:90%;max-width:500px;position:relative;';

        // 右上角关闭按钮
        var closeBtn = document.createElement('button');
        closeBtn.innerHTML = '<i class="fas fa-times"></i>';
        closeBtn.style.cssText = 'position:absolute;top:15px;right:15px;background:none;border:none;color:' + textColor + ';font-size:20px;cursor:pointer;';
        closeBtn.onclick = function() { shareModal.remove(); };
        shareContent.appendChild(closeBtn);

        // 显示加载状态
        var loadingDiv = document.createElement('div');
        loadingDiv.innerHTML = '<h2 style="text-align:center;margin-bottom:15px;margin-top:0;">' + t('shareDocument') + '</h2><p style="text-align:center;margin-bottom:20px;">' + (isEn ? 'File:' : '文件:') + ' ' + file.name + '</p><div style="text-align:center;padding:30px;"><i class="fas fa-spinner fa-spin" style="font-size:24px;"></i><p style="margin-top:10px;">' + (isEn ? 'Checking share link...' : '检查分享链接...') + '</p></div>';
        shareContent.appendChild(loadingDiv);
        
        shareModal.appendChild(shareContent);
        document.body.appendChild(shareModal);

        // 检查是否已有分享链接
        checkExistingShareLink(file.name, shareModal, shareContent, nightMode, bg, textColor);

        shareModal.addEventListener('click', function(e) { if (e.target === shareModal) shareModal.remove(); });
    }

    async function checkExistingShareLink(filename, shareModal, shareContent, nightMode, bg, textColor) {
        try {
            // 调用API检查是否已有分享链接
            var apiUrl = (global.getApiBaseUrl ? global.getApiBaseUrl() : 'api') + '/share/list?username=' + encodeURIComponent(g('currentUser').username);
            var response = await fetch(apiUrl, { 
                method: 'GET', 
                headers: { 'Authorization': 'Bearer ' + g('currentUser').token } 
            });
            var result = await global.parseJsonResponse(response);

            if (result.code === 200 && result.data && result.data.shares) {
                // 查找当前文件的分享链接
                var existingShare = result.data.shares.find(function(share) { return share.filename === filename; });
                if (existingShare) {
                    // 显示已有的分享链接
                    showExistingShareLink(existingShare, filename, shareModal, shareContent, nightMode, bg, textColor);
                } else {
                    // 没有分享链接，显示创建界面
                    showCreateShareLink(filename, shareModal, shareContent, nightMode, bg, textColor);
                }
            } else {
                // API调用失败，显示创建界面
                showCreateShareLink(filename, shareModal, shareContent, nightMode, bg, textColor);
            }
        } catch (error) {
            console.error('检查分享链接失败:', error);
            // 出错时显示创建界面
            showCreateShareLink(filename, shareModal, shareContent, nightMode, bg, textColor);
        }
    }

    function showExistingShareLink(existingShare, filename, shareModal, shareContent, nightMode, bg, textColor) {
        var isEn = window.i18n && window.i18n.getLanguage() === 'en';
        
        // 生成过期时间选项
        var expiryOptions = '';
        var expiryValues = [7, 30, 0];
        var expiryLabels = isEn ? ['7 days', '30 days', 'Never expires'] : ['7天后', '30天后', '永不过期'];
        var currentExpiry = 7; // 默认值

        // 计算当前过期时间（如果有）
        if (existingShare.expires_at) {
            var now = new Date();
            var expiryDate = new Date(existingShare.expires_at);
            var daysDiff = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));
            if (daysDiff <= 7) currentExpiry = 7;
            else if (daysDiff <= 30) currentExpiry = 30;
            else currentExpiry = 0;
        } else {
            currentExpiry = 0; // 永不过期
        }

        for (var i = 0; i < expiryValues.length; i++) {
            var selected = (expiryValues[i] === currentExpiry) ? 'selected' : '';
            expiryOptions += '<option value="' + expiryValues[i] + '" ' + selected + '>' + expiryLabels[i] + '</option>';
        }

        // 更新对话框内容 - 先清空shareContent，添加关闭按钮，再添加内容
        shareContent.innerHTML = '';
        
        // 右上角关闭按钮
        var closeBtn = document.createElement('button');
        closeBtn.innerHTML = '<i class="fas fa-times"></i>';
        closeBtn.style.cssText = 'position:absolute;top:15px;right:15px;background:none;border:none;color:' + textColor + ';font-size:20px;cursor:pointer;';
        closeBtn.onclick = function() { shareModal.remove(); };
        shareContent.appendChild(closeBtn);
        
        var contentDiv = document.createElement('div');
        contentDiv.innerHTML = `
            <h2 style="text-align:center;margin-bottom:15px;margin-top:0;">${isEn ? 'Share Document' : '分享文档'}</h2>
            <p style="text-align:center;margin-bottom:20px;">${isEn ? 'File:' : '文件:'} ${filename}</p>
            
            <!-- 现有分享链接信息 -->
            <div style="background:${nightMode ? '#3d3d3d' : '#f5f5f5'};padding:15px;border-radius:8px;margin-bottom:20px;">
                <h3 style="margin-bottom:10px;">${isEn ? 'Existing Share Link' : '现有分享链接'}</h3>
                <div style="word-break:break-all;margin-bottom:10px;">
                    <strong>${isEn ? 'Link:' : '链接:'}</strong> <a href="${existingShare.share_url}" target="_blank" style="color:#4a90e2;">${existingShare.share_url}</a>
                </div>
                <div style="font-size:14px;color:${nightMode ? '#aaa' : '#666'};">
                    <p><strong>${isEn ? 'Mode:' : '模式:'}</strong> ${existingShare.mode === 'view' ? (isEn ? 'View only' : '仅查看') : (isEn ? 'Editable' : '允许编辑')}</p>
                    <p><strong>${isEn ? 'Created:' : '创建时间:'}</strong> ${new Date(existingShare.created_at).toLocaleString()}</p>
                    ${existingShare.expires_at ? `<p><strong>${isEn ? 'Expires:' : '过期时间:'}</strong> ${new Date(existingShare.expires_at).toLocaleString()}</p>` : `<p><strong>${isEn ? 'Expires:' : '过期时间:'}</strong> ${isEn ? 'Never expires' : '永不过期'}</p>`}
                </div>
            </div>
            
            <!-- 编辑选项 -->
            <div style="margin-bottom:15px;">
                <label>${isEn ? 'Share Mode' : '分享模式'}</label>
                <div style="margin-top:8px;">
                    <label><input type="radio" name="shareMode" value="view" ${existingShare.mode === 'view' ? 'checked' : ''}> ${isEn ? 'View only' : '仅查看'}</label>
                    <label><input type="radio" name="shareMode" value="edit" ${existingShare.mode === 'edit' ? 'checked' : ''}> ${isEn ? 'Editable' : '允许编辑'}</label>
                </div>
            </div>
            
            <div style="margin-bottom:15px;">
                <label>${isEn ? 'Expires' : '过期时间'}</label>
                <select id="shareExpiry" style="width:100%;padding:8px;margin-top:5px;">
                    ${expiryOptions}
                </select>
            </div>
            
            <div id="shareError" style="color:#e74c3c;font-size:13px;margin-bottom:10px;display:none;"></div>
            
            <div style="display:flex;gap:10px;margin-top:20px;">
                <button type="button" id="shareDeleteBtn" style="flex:1;padding:10px;background:${nightMode ? '#555' : '#dc3545'};color:white;border:none;border-radius:6px;cursor:pointer;">${isEn ? 'Delete Link' : '删除链接'}</button>
                <button type="button" id="shareUpdateBtn" style="flex:2;padding:10px;background:#4a90e2;color:white;border:none;border-radius:6px;cursor:pointer;">${isEn ? 'Update Link' : '更新链接'}</button>
            </div>
        `;
        shareContent.appendChild(contentDiv);

        // 删除分享链接
        shareContent.querySelector('#shareDeleteBtn').onclick = async function() {
            const confirmed = await g('customConfirm')(isEn ? 'Are you sure you want to delete this share link? This cannot be undone.' : '确定要删除这个分享链接吗？删除后将无法恢复。');
            if (confirmed) {
                var btn = this;
                btn.disabled = true;
                btn.textContent = isEn ? 'Deleting...' : '删除中...';
                try {
                    var body = { username: g('currentUser').username, token: g('currentUser').token, password: g('currentUser').password, share_id: existingShare.share_id };
                    var apiUrl = (global.getApiBaseUrl ? global.getApiBaseUrl() : 'api') + '/share/delete';
                    var response = await fetch(apiUrl, { 
                        method: 'POST', 
                        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + g('currentUser').token }, 
                        body: JSON.stringify(body) 
                    });
                    var result = await global.parseJsonResponse(response);
                    if (result.code === 200) {
                        global.showMessage(isEn ? 'Share link deleted' : '分享链接已删除');
                        shareModal.remove();
                    } else {
                        shareContent.querySelector('#shareError').textContent = result.message || (isEn ? 'Delete failed' : '删除失败');
                        shareContent.querySelector('#shareError').style.display = 'block';
                        btn.disabled = false;
                        btn.textContent = isEn ? 'Delete Link' : '删除链接';
                    }
                } catch (err) {
                    shareContent.querySelector('#shareError').textContent = err.message || (isEn ? 'Network error' : '网络错误');
                    shareContent.querySelector('#shareError').style.display = 'block';
                    btn.disabled = false;
                    btn.textContent = isEn ? 'Delete Link' : '删除链接';
                }
            }
        };

        // 更新分享链接
        shareContent.querySelector('#shareUpdateBtn').onclick = async function() {
            var btn = this;
            btn.disabled = true;
            btn.textContent = isEn ? 'Updating...' : '更新中...';
            var mode = shareContent.querySelector('input[name="shareMode"]:checked').value;
            var expireValue = shareContent.querySelector('#shareExpiry').value;
            var expireDays = parseInt(expireValue);
            // 只有当值为 NaN 时才使用默认值 7
            if (isNaN(expireDays)) {
                expireDays = 7;
            }
            try {
                // 直接更新分享属性
                var updateBody = {
                    username: g('currentUser').username,
                    token: g('currentUser').token,
                    password: g('currentUser').password,
                    share_id: existingShare.share_id,
                    mode: mode,
                    expire_days: expireDays
                };
                var updateUrl = (global.getApiBaseUrl ? global.getApiBaseUrl() : 'api') + '/share/properties';
                var updateResponse = await fetch(updateUrl, { 
                    method: 'POST', 
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + g('currentUser').token }, 
                    body: JSON.stringify(updateBody) 
                });
                var updateResult = await global.parseJsonResponse(updateResponse);

                if (updateResult.code === 200 && updateResult.data) {
                    // 更新成功，显示结果
                    showShareResult(updateResult.data, shareModal);
                } else {
                    // 处理敏感词检测错误
                    if (updateResult.sensitive_words && updateResult.sensitive_words.length > 0) {
                        var wordsStr = updateResult.sensitive_words.join('、');
                        var errorMsg;
                        if (updateResult.sensitive_field === 'content') {
                            errorMsg = (isEn ? 'File content contains sensitive words: ' : '文件内容包含敏感词') + wordsStr + (isEn ? ', cannot update share' : '，无法更新分享');
                        } else {
                            errorMsg = (isEn ? 'Filename contains sensitive words: ' : '文件名包含敏感词') + wordsStr + (isEn ? ', cannot update share' : '，无法更新分享');
                        }
                        shareContent.querySelector('#shareError').textContent = errorMsg;
                    } else {
                        shareContent.querySelector('#shareError').textContent = updateResult.message || (isEn ? 'Update failed' : '更新失败');
                    }
                    shareContent.querySelector('#shareError').style.display = 'block';
                    btn.disabled = false;
                    btn.textContent = isEn ? 'Update Link' : '更新链接';
                }
            } catch (err) {
                shareContent.querySelector('#shareError').textContent = err.message || (isEn ? 'Network error' : '网络错误');
                shareContent.querySelector('#shareError').style.display = 'block';
                btn.disabled = false;
                btn.textContent = isEn ? 'Update Link' : '更新链接';
            }
        };
    }

    function showCreateShareLink(filename, shareModal, shareContent, nightMode, bg, textColor) {
        var isEn = window.i18n && window.i18n.getLanguage() === 'en';
        
        // 更新对话框内容 - 先清空，添加关闭按钮，再添加内容
        shareContent.innerHTML = '';
        
        // 右上角关闭按钮
        var closeBtn = document.createElement('button');
        closeBtn.innerHTML = '<i class="fas fa-times"></i>';
        closeBtn.style.cssText = 'position:absolute;top:15px;right:15px;background:none;border:none;color:' + textColor + ';font-size:20px;cursor:pointer;';
        closeBtn.onclick = function() { shareModal.remove(); };
        shareContent.appendChild(closeBtn);
        
        var contentDiv = document.createElement('div');
        contentDiv.innerHTML = `
            <h2 style="text-align:center;margin-bottom:15px;margin-top:0;">${isEn ? 'Share Document' : '分享文档'}</h2>
            <p style="text-align:center;margin-bottom:20px;">${isEn ? 'File:' : '文件:'} ${filename}</p>
            <div style="margin-bottom:15px;">
                <label>${isEn ? 'Share Mode' : '分享模式'}</label>
                <div style="margin-top:8px;">
                    <label><input type="radio" name="shareMode" value="view" checked> ${isEn ? 'View only' : '仅查看'}</label> <label><input type="radio" name="shareMode" value="edit"> ${isEn ? 'Editable' : '允许编辑'}</label>
                </div>
            </div>
            <div style="margin-bottom:15px;">
                <label>${isEn ? 'Expires' : '过期时间'}</label>
                <select id="shareExpiry" style="width:100%;padding:8px;margin-top:5px;">
                    <option value="7">${isEn ? '7 days' : '7天后'}</option>
                    <option value="30">${isEn ? '30 days' : '30天后'}</option>
                    <option value="0">${isEn ? 'Never expires' : '永不过期'}</option>
                </select>
            </div>
            <div id="shareError" style="color:#e74c3c;font-size:13px;margin-bottom:10px;display:none;"></div>
            <div style="display:flex;gap:10px;margin-top:20px;">
                <button type="button" id="shareCreateBtn" style="flex:1;padding:10px;background:#4a90e2;color:white;border:none;border-radius:6px;cursor:pointer;">${isEn ? 'Create Share Link' : '创建分享链接'}</button>
            </div>
        `;
        shareContent.appendChild(contentDiv);

        shareContent.querySelector('#shareCreateBtn').onclick = async function() {
            var btn = this;
            btn.disabled = true;
            btn.textContent = isEn ? 'Creating...' : '创建中...';
            var mode = shareContent.querySelector('input[name="shareMode"]:checked').value;
            var expireValue = shareContent.querySelector('#shareExpiry').value;
            var expireDays = parseInt(expireValue);
            // 只有当值为 NaN 时才使用默认值 7
            if (isNaN(expireDays)) {
                expireDays = 7;
            }
            try {
                var result = await createShareLink(filename, mode, null, expireDays);
                if (result.code === 200 && result.data) {
                    showShareResult(result.data, shareModal);
                } else {
                    // 处理敏感词检测错误
                    if (result.sensitive_words && result.sensitive_words.length > 0) {
                        var wordsStr = result.sensitive_words.join('、');
                        var errorMsg;
                        if (result.sensitive_field === 'content') {
                            // 文件内容包含敏感词
                            errorMsg = (isEn ? 'File content contains sensitive words: ' : '文件内容包含敏感词') + wordsStr + (isEn ? ', cannot share' : '，无法分享');
                        } else {
                            // 文件名包含敏感词
                            errorMsg = (isEn ? 'Filename contains sensitive words: ' : '文件名包含敏感词') + wordsStr + (isEn ? ', cannot share' : '，无法分享');
                        }
                        shareContent.querySelector('#shareError').textContent = errorMsg;
                    } else {
                        shareContent.querySelector('#shareError').textContent = result.message || (isEn ? 'Create failed' : '创建失败');
                    }
                    shareContent.querySelector('#shareError').style.display = 'block';
                    btn.disabled = false;
                    btn.textContent = isEn ? 'Create Share Link' : '创建分享链接';
                }
            } catch (err) {
                shareContent.querySelector('#shareError').textContent = err.message || (isEn ? 'Network error' : '网络错误');
                shareContent.querySelector('#shareError').style.display = 'block';
                btn.disabled = false;
                btn.textContent = isEn ? 'Create Share Link' : '创建分享链接';
            }
        };
    }

    global.createShareLink = createShareLink;
    global.showShareResult = showShareResult;
    global.showShareDialog = showShareDialog;

})(typeof window !== 'undefined' ? window : this);
