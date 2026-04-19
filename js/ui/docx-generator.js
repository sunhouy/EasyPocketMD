
const global = window;

function g(name) { return global[name]; }
function isEn() { return window.i18n && window.i18n.getLanguage() === 'en'; }

/**
 * 导出 Markdown 为 DOCX 文件（后端转换方案）
 * @param {string} content - Markdown 内容
 * @param {Object} settings - 打印设置（可选）
 * @param {string} customFilename - 自定义文件名（不含扩展名，可选）
 */
async function exportDOCX(content, settings, customFilename) {
    var loadingModal = null;
    var timeoutId = null;

    try {
        // 显示加载状态
        var nightMode = g('nightMode') === true;
        loadingModal = document.createElement('div');
        loadingModal.className = 'modal-overlay';
        loadingModal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.9);z-index:10001;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;';
        loadingModal.innerHTML = '<div style="background:' + (nightMode ? '#2d2d2d' : 'white') + ';color:' + (nightMode ? '#eee' : '#333') + ';border-radius:12px;padding:30px;text-align:center;"><div style="font-size:24px;margin-bottom:15px;"><i class="fas fa-spinner fa-spin"></i></div><div style="font-size:16px;">' + (isEn() ? 'Generating DOCX...' : '生成 DOCX 中...') + '</div></div>';
        document.body.appendChild(loadingModal);

        // 设置超时处理（60秒）
        timeoutId = setTimeout(function() {
            if (loadingModal && loadingModal.parentNode) {
                loadingModal.remove();
                if (global.showMessage) {
                    global.showMessage(isEn() ? 'DOCX generation timeout, please try again' : 'DOCX 生成超时，请重试', 'error');
                }
            }
        }, 60000);

        // Pandoc 路径下设置参数暂未直连使用，保留兼容字段
        if (!settings) settings = {};

        // 打印调试信息到控制台
        console.log('DOCX Export Debug:', {
            contentLength: content.length,
            settings: settings,
            customFilename: customFilename
        });

        // 调用后端 API 生成 Word 文档
        var api = global.getApiBaseUrl ? global.getApiBaseUrl() : 'api';
        var apiUrl = api.startsWith('http') ? api + '/convert/docx' : 'api/convert/docx';

        console.log('DOCX Export: Calling API:', apiUrl);

        var response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                markdown: content,
                settings: settings
            })
        });

        console.log('DOCX Export: API Response Status:', response.status);

        if (!response.ok) {
            var errorData = await response.json().catch(function() { return {}; });
            console.error('DOCX Export: API Error:', errorData);
            throw new Error(errorData.message || 'Server error: ' + response.status);
        }

        // 获取 Blob 数据
        var blob = await response.blob();
        console.log('DOCX Export: Blob received, size:', blob.size);

        // 生成文件名
        var filename;
        if (customFilename) {
            filename = customFilename + '.docx';
        } else {
            filename = isEn() ? 'document' : '文档';
            if (g('currentFileId') && typeof g('fileTree') !== 'undefined') {
                try {
                    var currentNode = g('fileTree').jstree(true).get_node(g('currentFileId'));
                    if (currentNode) {
                        filename = currentNode.text.replace(/\.md$/, '');
                    }
                } catch (e) {
                    // 忽略错误，使用默认文件名
                }
            }
            filename = filename + '_' + new Date().toISOString().slice(0, 10) + '.docx';
        }

        console.log('DOCX Export: Generated filename:', filename);

        // 下载文件
        if (window.nativeFileOps && window.nativeFileOps.isTauriRuntime()) {
            console.log('DOCX Export: Using native file operations');
            await window.nativeFileOps.saveFile(blob, {
                filename: filename,
                mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            });
        } else {
            // 普通浏览器环境
            console.log('DOCX Export: Using browser download');
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();

            // 清理
            setTimeout(function() {
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }, 100);
        }

        // 清除超时
        if (timeoutId) clearTimeout(timeoutId);

        // 移除加载状态
        if (loadingModal && loadingModal.parentNode) {
            loadingModal.remove();
        }

        // 显示成功消息
        if (global.showMessage) {
            global.showMessage(isEn() ? 'Document exported as .docx' : '文档已导出为 .docx 格式');
        }

        console.log('DOCX Export: Completed successfully');
        return true;
    } catch (error) {
        // 清除超时
        if (timeoutId) clearTimeout(timeoutId);

        // 移除加载状态
        if (loadingModal && loadingModal.parentNode) {
            loadingModal.remove();
        }

        console.error('DOCX export error:', error);
        if (global.showMessage) {
            global.showMessage(isEn() ? 'Failed to generate DOCX: ' + error.message : '生成 DOCX 失败: ' + error.message, 'error');
        }
        throw error;
    }
}

// 导出到全局
global.exportDOCX = exportDOCX;
