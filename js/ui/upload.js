
(function(global) {
    'use strict';

    function g(name) { return global[name]; }
    function isEn() { return window.i18n && window.i18n.getLanguage() === 'en'; }
    function t(key) { return window.i18n ? window.i18n.t(key) : key; }

    function triggerFileUpload() {
        var input = document.createElement('input');
        input.type = 'file';
        input.multiple = true;
        input.onchange = async function(e) {
            var files = Array.from(e.target.files || []);
            if (files.length > 0) {
                global.hideMobileActionSheet();
                try {
                    await uploadFiles(files, true);
                } catch (err) {
                    global.showMessage('上传失败', 'error');
                }
            }
        };
        input.click();
    }

    function triggerImageUpload() {
        var input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.multiple = true;
        input.onchange = async function(e) {
            var files = Array.from(e.target.files || []);
            if (files.length > 0) {
                global.hideMobileActionSheet();
                try {
                    await uploadFiles(files, true);
                } catch (err) {
                    global.showMessage('上传失败', 'error');
                }
            }
        };
        input.click();
    }

    async function uploadFiles(filesArray, autoInsert) {
        autoInsert = autoInsert !== false;
        
        // Check storage settings
        if (!window.userSettings.storageLocation && !window.tempStorageLocation) {
            const choice = await showStorageChoicePopup();
            if (!choice) return; // User cancelled or closed
            
            if (choice.permanent) {
                window.userSettings.storageLocation = choice.location;
                localStorage.setItem('vditor_settings', JSON.stringify(window.userSettings));
            } else {
                // Temporary choice for this session
                window.tempStorageLocation = choice.location;
            }
        }

        const location = window.tempStorageLocation || window.userSettings.storageLocation || 'cloud';

        if (location === 'local') {
            return await saveFilesLocally(filesArray, autoInsert);
        }

        var formData = new FormData();
        for (var i = 0; i < filesArray.length; i++) {
            formData.append('files[]', filesArray[i]);
        }
        
        // Add user info if available
        if (g('currentUser')) {
            formData.append('username', g('currentUser').username);
            formData.append('password', g('currentUser').password);
        }
        
        formData.append('uploadDir', 'uploads');
        try {
            global.showUploadStatus('正在上传文件...', 'info');
            var apiUrl = (window.getApiBaseUrl ? window.getApiBaseUrl() : 'api') + '/external/upload';
            var response = await fetch(apiUrl, { method: 'POST', body: formData });
            var result = await response.json();
            if (result.success) {
                global.showUploadStatus('上传成功！共' + result.count + '个文件', 'success');
                var markdownLinks = result.urls.map(function(url) {
                    var fileName = url.split('/').pop();
                    // 处理 URL 中的空格，使用 encodeURI 保持其有效性
                    var encodedUrl = url.includes(' ') ? encodeURI(url) : url;
                    return /\.(jpg|jpeg|png|gif|bmp|webp|svg)$/i.test(fileName) ? '![' + fileName + '](' + encodedUrl + ')' : '[' + fileName + '](' + encodedUrl + ')';
                });
                if (autoInsert && markdownLinks.length > 0 && g('vditor')) {
                    g('vditor').insertValue(markdownLinks.join('\n\n') + '\n\n');
                }
                return markdownLinks.join('\n\n');

            }
            global.showUploadStatus('上传失败: ' + (result.message || ''), 'error');
            throw new Error(result.message || '上传失败');
        } catch (error) {
            console.error('上传错误', error);
            global.showUploadStatus('上传失败，请检查网络', 'error');
            throw error;
        }
    }

    /**
     * 上传 base64 图片。
     * 当 useTempDir 为 true 时，不附带用户信息，服务端会将文件保存在公共 uploads 目录，
     * 用于临时文件（例如 PDF 导出 / 云打印中生成的 mermaid 图片）。
     */
    function uploadImage(dataUrl, useTempDir) {
        return new Promise(function(resolve, reject) {
            // Convert data URL to Blob
            var arr = dataUrl.split(','), mime = arr[0].match(/:(.*?);/)[1],
                bstr = atob(arr[1]), n = bstr.length, u8arr = new Uint8Array(n);
            while(n--) {
                u8arr[n] = bstr.charCodeAt(n);
            }
            var blob = new Blob([u8arr], {type: mime});

            // Create FormData - 使用 'files[]' 字段名以匹配服务端期望
            var formData = new FormData();
            formData.append('files[]', blob, 'image.png');
            
            // 打印 / 导出 PDF 时，要求图表上传到临时目录（/uploads），
            // 此时不携带用户信息，避免被移动到用户专属目录。
            // 其它场景仍然附带用户信息，走原有 user_files 目录逻辑。
            if (!useTempDir && g('currentUser')) {
                formData.append('username', g('currentUser').username);
                formData.append('password', g('currentUser').password);
            }

            // Upload to server
            var apiUrl = (window.getApiBaseUrl ? window.getApiBaseUrl() : 'api') + '/external/upload';
            fetch(apiUrl, {
                method: 'POST',
                body: formData
            })
                .then(function(response) {
                    return response.json();
                })
                .then(function(data) {
                    if (data.success && data.urls && data.urls.length > 0) {
                        // 从响应中获取第一个 URL
                        var imgUrl = data.urls[0];

                        // 确保返回的是绝对地址
                        if (imgUrl && !imgUrl.startsWith('http://') && !imgUrl.startsWith('https://')) {
                            // 构建完整的绝对地址
                            var origin = window.getAppOrigin ? window.getAppOrigin() : window.location.origin;
                            var absoluteUrl = origin + (imgUrl.startsWith('/') ? '' : '/') + imgUrl;
                            resolve(absoluteUrl);
                        } else {
                            resolve(imgUrl);
                        }
                    } else {
                        console.error('上传失败，响应格式不正确:', data);
                        resolve(null);
                    }
                })
                .catch(function(error) {
                    console.error('Upload error:', error);
                    resolve(null);
                });
        });
    }

    async function showStorageChoicePopup() {
        var t = function(key) { return window.i18n ? window.i18n.t(key) : key; };
        return new Promise(resolve => {
            const nightMode = g('nightMode') === true;
            const modal = document.createElement('div');
            modal.className = 'modal-overlay';
            modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:20000;';

            const bg = nightMode ? '#2d2d2d' : 'white';
            const textColor = nightMode ? '#eee' : '#333';
            const cardBg = nightMode ? '#3d3d3d' : '#f8f9fa';

            const content = document.createElement('div');
            content.style.cssText = `background:${bg};color:${textColor};border-radius:12px;padding:25px;width:90%;max-width:450px;text-align:center;box-shadow: 0 4px 20px rgba(0,0,0,0.3);`;

            content.innerHTML = `
                <h3 style="margin-top:0;">${t('storageChoiceTitle')}</h3>
                <p style="margin-bottom:25px;font-size:14px;color:${nightMode ? '#aaa' : '#666'};">${t('storageChoiceMessage')}</p>
                
                <div style="display:flex;gap:15px;margin-bottom:25px;">
                    <div id="choice-local" style="flex:1;padding:15px;background:${cardBg};border:2px solid transparent;border-radius:10px;cursor:pointer;transition:all 0.2s;">
                        <i class="fas fa-hdd" style="font-size:24px;margin-bottom:10px;color:#2196F3;"></i>
                        <div style="font-weight:bold;">${t('storageLocal')}</div>
                        <div style="font-size:11px;margin-top:5px;color:${nightMode ? '#aaa' : '#888'};">${t('storageLocalDesc')}</div>
                    </div>
                    <div id="choice-cloud" style="flex:1;padding:15px;background:${cardBg};border:2px solid transparent;border-radius:10px;cursor:pointer;transition:all 0.2s;">
                        <i class="fas fa-cloud" style="font-size:24px;margin-bottom:10px;color:#4CAF50;"></i>
                        <div style="font-weight:bold;">${t('storageCloud')}</div>
                        <div style="font-size:11px;margin-top:5px;color:${nightMode ? '#aaa' : '#888'};">${t('storageCloudDesc')}</div>
                    </div>
                </div>

                <div style="display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:20px;font-size:14px;">
                    <input type="checkbox" id="storage-permanent" style="cursor:pointer;">
                    <label for="storage-permanent" style="cursor:pointer;">${t('storagePermanent')}</label>
                </div>

                <button id="storage-confirm" style="width:100%;padding:12px;background:#2196F3;color:white;border:none;border-radius:8px;font-weight:bold;cursor:pointer;">确定</button>
            `;

            modal.appendChild(content);
            document.body.appendChild(modal);

            let selectedLocation = 'cloud'; // Default to cloud
            const localCard = content.querySelector('#choice-local');
            const cloudCard = content.querySelector('#choice-cloud');
            const confirmBtn = content.querySelector('#storage-confirm');
            const permanentCheckbox = content.querySelector('#storage-permanent');

            // Set initial state
            cloudCard.style.borderColor = '#4CAF50';
            cloudCard.style.background = nightMode ? '#2e4a30' : '#e8f5e9';

            localCard.onclick = () => {
                selectedLocation = 'local';
                localCard.style.borderColor = '#2196F3';
                localCard.style.background = nightMode ? '#263d4d' : '#e3f2fd';
                cloudCard.style.borderColor = 'transparent';
                cloudCard.style.background = cardBg;
            };

            cloudCard.onclick = () => {
                selectedLocation = 'cloud';
                cloudCard.style.borderColor = '#4CAF50';
                cloudCard.style.background = nightMode ? '#2e4a30' : '#e8f5e9';
                localCard.style.borderColor = 'transparent';
                localCard.style.background = cardBg;
            };

            confirmBtn.onclick = () => {
                modal.remove();
                resolve({
                    location: selectedLocation,
                    permanent: permanentCheckbox.checked
                });
            };

            modal.onclick = (e) => {
                if (e.target === modal) {
                    modal.remove();
                    resolve(null);
                }
            };
        });
    }

    async function saveFilesLocally(filesArray, autoInsert) {
        autoInsert = autoInsert !== false;
        const markdownLinks = [];

        for (const file of filesArray) {
            try {
                const fileUrl = await global.ResourceLoader.storeLocalFile(file);
                const blobUrl = await global.ResourceLoader.getLocalBlobUrl(fileUrl);
                
                const link = /\.(jpg|jpeg|png|gif|bmp|webp|svg)$/i.test(file.name) 
                    ? `![${file.name}](${blobUrl})` 
                    : `[${file.name}](${blobUrl})`;
                markdownLinks.push(link);
            } catch (err) {
                console.error('Failed to read local file', err);
            }
        }

        if (autoInsert && markdownLinks.length > 0 && g('vditor')) {
            g('vditor').insertValue(markdownLinks.join('\n\n') + '\n\n');
        }
        return markdownLinks.join('\n\n');
    }

    function readFileAsDataURL(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    async function checkAndUploadLocalFiles() {
        return true;
    }

    global.triggerFileUpload = triggerFileUpload;
    global.triggerImageUpload = triggerImageUpload;
    global.uploadFiles = uploadFiles;
    global.uploadImage = uploadImage;
    global.checkAndUploadLocalFiles = checkAndUploadLocalFiles;

})(typeof window !== 'undefined' ? window : this);
