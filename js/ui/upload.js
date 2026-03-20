
(function(global) {
    'use strict';

    function g(name) { return global[name]; }

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
                    return /\.(jpg|jpeg|png|gif|bmp|webp|svg)$/i.test(fileName) ? '![' + fileName + '](' + url + ')' : '[' + fileName + '](' + url + ')';
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
                            var absoluteUrl = window.location.origin + (imgUrl.startsWith('/') ? '' : '/') + imgUrl;
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

    global.triggerFileUpload = triggerFileUpload;
    global.triggerImageUpload = triggerImageUpload;
    global.uploadFiles = uploadFiles;
    global.uploadImage = uploadImage;

})(typeof window !== 'undefined' ? window : this);
