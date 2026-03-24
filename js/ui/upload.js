
(function(global) {
    'use strict';

    function g(name) { return global[name]; }
    function isEn() { return window.i18n && window.i18n.getLanguage() === 'en'; }
    function t(key) { return window.i18n ? window.i18n.t(key) : key; }

    let uploadProgressModal = null;
    let uploadItems = [];
    let completedCount = 0;
    let allUrls = [];
    let autoInsertFlag = false;

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

    function createUploadProgressModal(files, autoInsert) {
        autoInsertFlag = autoInsert;
        completedCount = 0;
        allUrls = [];
        uploadItems = files.map((file, index) => ({
            id: index,
            file: file,
            name: file.name,
            progress: 0,
            status: 'pending',
            url: null,
            error: null
        }));

        const nightMode = g('nightMode') === true;
        const bgColor = nightMode ? '#2d2d2d' : 'white';
        const textColor = nightMode ? '#eee' : '#333';
        const cardBg = nightMode ? '#3d3d3d' : '#f8f9fa';

        uploadProgressModal = document.createElement('div');
        uploadProgressModal.className = 'upload-progress-modal-overlay';
        uploadProgressModal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:20000;';

        const content = document.createElement('div');
        content.style.cssText = `background:${bgColor};color:${textColor};border-radius:12px;padding:25px;width:90%;max-width:500px;max-height:80vh;overflow-y:auto;box-shadow: 0 4px 20px rgba(0,0,0,0.3);`;

        content.innerHTML = `
            <h3 style="margin-top:0;margin-bottom:15px;">${t('uploadingFiles')}</h3>
            <div id="upload-items-container" style="margin-bottom:20px;"></div>
            <div style="display:flex;gap:10px;">
                <button id="upload-background-btn" style="flex:1;padding:12px;background:${nightMode ? '#555' : '#6c757d'};color:white;border:none;border-radius:8px;font-weight:bold;cursor:pointer;">${t('uploadInBackground')}</button>
            </div>
        `;

        uploadProgressModal.appendChild(content);
        document.body.appendChild(uploadProgressModal);

        document.getElementById('upload-background-btn').onclick = () => {
            hideUploadProgressModal();
        };

        renderUploadItems();
    }

    function renderUploadItems() {
        const container = document.getElementById('upload-items-container');
        if (!container) return;

        const nightMode = g('nightMode') === true;
        const cardBg = nightMode ? '#3d3d3d' : '#f8f9fa';
        const successColor = '#4CAF50';
        const errorColor = '#f44336';

        container.innerHTML = uploadItems.map(item => {
            let statusIcon = '';
            let statusText = '';
            let progressBarColor = nightMode ? '#4a90e2' : '#2196F3';

            if (item.status === 'uploading') {
                statusIcon = '<i class="fas fa-spinner fa-spin" style="color:#4a90e2;"></i>';
                statusText = `${item.progress}%`;
            } else if (item.status === 'completed') {
                statusIcon = `<i class="fas fa-check-circle" style="color:${successColor};"></i>`;
                statusText = '100%';
                progressBarColor = successColor;
            } else if (item.status === 'error') {
                statusIcon = `<i class="fas fa-exclamation-circle" style="color:${errorColor};"></i>`;
                statusText = t('uploadFailed');
                progressBarColor = errorColor;
            } else {
                statusIcon = '<i class="fas fa-clock" style="color:#999;"></i>';
                statusText = '0%';
            }

            return `
                <div style="padding:12px;background:${cardBg};border-radius:8px;margin-bottom:10px;">
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
                        <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0;">
                            ${statusIcon}
                            <span style="font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${item.name}</span>
                        </div>
                        <span style="font-size:12px;color:${nightMode ? '#aaa' : '#666'};flex-shrink:0;margin-left:8px;">${statusText}</span>
                    </div>
                    <div style="height:6px;background:${nightMode ? '#444' : '#e0e0e0'};border-radius:3px;overflow:hidden;">
                        <div style="height:100%;width:${item.progress}%;background:${progressBarColor};transition:width 0.3s ease;"></div>
                    </div>
                </div>
            `;
        }).join('');
    }

    function updateUploadProgress(itemId, progress) {
        const item = uploadItems.find(i => i.id === itemId);
        if (item) {
            item.progress = progress;
            item.status = 'uploading';
            renderUploadItems();
        }
    }

    function markUploadComplete(itemId, url) {
        const item = uploadItems.find(i => i.id === itemId);
        if (item) {
            item.progress = 100;
            item.status = 'completed';
            item.url = url;
            completedCount++;
            allUrls.push(url);
            renderUploadItems();
            
            if (completedCount === uploadItems.length) {
                setTimeout(() => {
                    hideUploadProgressModal();
                    global.showUploadStatus(t('uploadComplete') + '！共' + allUrls.length + '个文件', 'success');
                    insertMarkdownLinks();
                }, 500);
            }
        }
    }

    function markUploadError(itemId, error) {
        const item = uploadItems.find(i => i.id === itemId);
        if (item) {
            item.status = 'error';
            item.error = error;
            completedCount++;
            renderUploadItems();
            
            if (completedCount === uploadItems.length) {
                setTimeout(() => {
                    hideUploadProgressModal();
                    if (allUrls.length > 0) {
                        global.showUploadStatus(t('uploadComplete') + ' ' + allUrls.length + '/' + uploadItems.length, 'success');
                        insertMarkdownLinks();
                    } else {
                        global.showUploadStatus(t('uploadFailed'), 'error');
                    }
                }, 500);
            }
        }
    }

    function insertMarkdownLinks() {
        if (autoInsertFlag && allUrls.length > 0 && g('vditor')) {
            const markdownLinks = allUrls.map(url => {
                const fileName = url.split('/').pop();
                const encodedUrl = url.includes(' ') ? encodeURI(url) : url;
                return /\.(jpg|jpeg|png|gif|bmp|webp|svg)$/i.test(fileName) ? '![' + fileName + '](' + encodedUrl + ')' : '[' + fileName + '](' + encodedUrl + ')';
            });
            g('vditor').insertValue(markdownLinks.join('\n\n') + '\n\n');
        }
    }

    function hideUploadProgressModal() {
        if (uploadProgressModal) {
            uploadProgressModal.remove();
            uploadProgressModal = null;
        }
    }

    async function uploadSingleFile(file, itemId) {
        const formData = new FormData();
        formData.append('files[]', file);
        
        if (g('currentUser')) {
            formData.append('username', g('currentUser').username);
            formData.append('password', g('currentUser').password);
        }
        
        formData.append('uploadDir', 'uploads');
        
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            
            xhr.upload.addEventListener('progress', (e) => {
                if (e.lengthComputable) {
                    const progress = Math.round((e.loaded / e.total) * 100);
                    updateUploadProgress(itemId, progress);
                }
            });
            
            xhr.addEventListener('load', () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    try {
                        const result = JSON.parse(xhr.responseText);
                        if (result.success && result.urls && result.urls.length > 0) {
                            markUploadComplete(itemId, result.urls[0]);
                            resolve(result.urls[0]);
                        } else {
                            markUploadError(itemId, result.message || 'Upload failed');
                            reject(new Error(result.message || 'Upload failed'));
                        }
                    } catch (e) {
                        markUploadError(itemId, 'Invalid response');
                        reject(e);
                    }
                } else {
                    markUploadError(itemId, 'HTTP error: ' + xhr.status);
                    reject(new Error('HTTP error: ' + xhr.status));
                }
            });
            
            xhr.addEventListener('error', () => {
                markUploadError(itemId, 'Network error');
                reject(new Error('Network error'));
            });
            
            const apiUrl = (window.getApiBaseUrl ? window.getApiBaseUrl() : 'api') + '/external/upload';
            xhr.open('POST', apiUrl);
            xhr.send(formData);
        });
    }

    async function uploadFiles(filesArray, autoInsert) {
        autoInsert = autoInsert !== false;
        
        if (!window.userSettings.storageLocation && !window.tempStorageLocation) {
            const choice = await showStorageChoicePopup();
            if (!choice) return;
            
            if (choice.permanent) {
                window.userSettings.storageLocation = choice.location;
                localStorage.setItem('vditor_settings', JSON.stringify(window.userSettings));
            } else {
                window.tempStorageLocation = choice.location;
            }
        }

        const location = window.tempStorageLocation || window.userSettings.storageLocation || 'cloud';

        if (location === 'local') {
            return await saveFilesLocally(filesArray, autoInsert);
        }

        createUploadProgressModal(filesArray, autoInsert);

        const uploadPromises = filesArray.map((file, index) => uploadSingleFile(file, index));
        
        try {
            await Promise.all(uploadPromises);
            return allUrls.join('\n\n');
        } catch (error) {
            console.error('Upload error', error);
            throw error;
        }
    }

    function uploadImage(dataUrl, useTempDir) {
        return new Promise(function(resolve, reject) {
            var arr = dataUrl.split(','), mime = arr[0].match(/:(.*?);/)[1],
                bstr = atob(arr[1]), n = bstr.length, u8arr = new Uint8Array(n);
            while(n--) {
                u8arr[n] = bstr.charCodeAt(n);
            }
            var blob = new Blob([u8arr], {type: mime});

            var formData = new FormData();
            formData.append('files[]', blob, 'image.png');
            
            if (!useTempDir && g('currentUser')) {
                formData.append('username', g('currentUser').username);
                formData.append('password', g('currentUser').password);
            }

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
                        var imgUrl = data.urls[0];

                        if (imgUrl && !imgUrl.startsWith('http://') && !imgUrl.startsWith('https://')) {
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

            let selectedLocation = 'cloud';
            const localCard = content.querySelector('#choice-local');
            const cloudCard = content.querySelector('#choice-cloud');
            const confirmBtn = content.querySelector('#storage-confirm');
            const permanentCheckbox = content.querySelector('#storage-permanent');

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
                
                const encodedUrl = blobUrl.includes(' ') ? encodeURI(blobUrl) : blobUrl;
                const link = /\.(jpg|jpeg|png|gif|bmp|webp|svg)$/i.test(file.name) ? `![${file.name}](${fileUrl})` : `[${file.name}](${fileUrl})`;
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

