
const global = window;

function g(name) { return global[name]; }
function isEn() { return window.i18n && window.i18n.getLanguage() === 'en'; }
function t(key) { return window.i18n ? window.i18n.t(key) : key; }

function getResourceResolveBase() {
    var isNativeLike = !!(window.nativeFileOps && window.nativeFileOps.isTauriRuntime && window.nativeFileOps.isTauriRuntime()) ||
        !!window.electron ||
        (window.location && window.location.protocol === 'file:');
    if (isNativeLike && window.getAppOrigin) {
        return window.getAppOrigin();
    }
    return window.location.href;
}

// 将 Markdown 转换为纯文本
function markdownToPlainText(markdown) {
    if (!markdown) return '';

    return markdown
        // 去掉代码块
        .replace(/```[\s\S]*?```/g, '')
        // 去掉行内代码
        .replace(/`([^`]+)`/g, '$1')
        // 去掉标题标记 #
        .replace(/^#{1,6}\s+/gm, '')
        // 去掉粗体 ** 和 __
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/__([^_]+)__/g, '$1')
        // 去掉斜体 * 和 _
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/_([^_]+)_/g, '$1')
        // 去掉删除线 ~~
        .replace(/~~([^~]+)~~/g, '$1')
        // 去掉链接，只保留文本 [text](url) -> text
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        // 去掉图片 ![alt](url)
        .replace(/!\[([^\]]*)\]\([^)]+\)/g, '')
        // 去掉引用标记 >
        .replace(/^>\s*/gm, '')
        // 去掉列表标记 - + *
        .replace(/^[-+*]\s+/gm, '')
        // 去掉有序列表标记 1. 2. 等
        .replace(/^\d+\.\s+/gm, '')
        // 去掉水平分割线 --- *** ___
        .replace(/^[\-\*_]{3,}\s*$/gm, '')
        // 去掉 HTML 标签
        .replace(/<[^>]+>/g, '')
        // 将多个空行合并为一个
        .replace(/\n{3,}/g, '\n\n')
        // 去掉行首空格
        .replace(/^[ \t]+/gm, '')
        // 去掉首尾空白
        .trim();
}

// 懒加载 PDF 生成器
async function getPDFGenerator() {
    if (!global.generatePDF) {
        const module = await import('./pdf-generator.js');
        global.generatePDF = module.generatePDF;
        global.renderPDF = module.renderPDF;
    }
    return { generatePDF: global.generatePDF, renderPDF: global.renderPDF };
}

async function exportContent() {
    if (!g('vditor')) return;

    if (typeof global.saveCurrentFile === 'function' && g('currentFileId')) {
        await global.saveCurrentFile(true);
    }

    var content = g('vditor').getValue();
    var formats = [
        { name: isEn() ? 'Markdown File (.md)' : 'Markdown文件 (.md)', ext: 'md', icon: '<i class="fas fa-file-code"></i>', slow: false },
        { name: isEn() ? 'Plain Text File (.txt)' : '纯文本文件 (.txt)', ext: 'txt', icon: '<i class="fas fa-file-alt"></i>', slow: false },
        { name: isEn() ? 'HTML File (.html)' : 'HTML文件 (.html)', ext: 'html', icon: '<i class="fab fa-html5"></i>', slow: false },
        { name: isEn() ? 'Word File (.docx)' : 'Word文档 (.docx)', ext: 'docx', icon: '<i class="fas fa-file-word"></i>', slow: true },
        { name: isEn() ? 'PDF File (.pdf)' : 'PDF文件 (.pdf)', ext: 'pdf', icon: '<i class="fas fa-file-pdf"></i>', slow: true }
    ];

    var nightMode = g('nightMode') === true;
    var bg = nightMode ? '#2d2d2d' : 'white';
    var textColor = nightMode ? '#eee' : '#333';

    var modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:100100;';

    var container = document.createElement('div');
    container.style.cssText = 'background:' + bg + ';color:' + textColor + ';border-radius:12px;padding:25px;width:90%;max-width:400px;position:relative;';

    var closeBtn = document.createElement('button');
    closeBtn.innerHTML = '<i class="fas fa-times"></i>';
    closeBtn.style.cssText = 'position:absolute;top:15px;right:15px;background:none;border:none;color:' + textColor + ';font-size:20px;cursor:pointer;';
    closeBtn.onclick = function() { modal.remove(); };
    container.appendChild(closeBtn);

    var title = document.createElement('h2');
    title.textContent = isEn() ? 'Export Format' : '导出格式';
    title.style.cssText = 'text-align:center;margin-bottom:20px;margin-top:0;font-size:18px;font-weight:600;';
    container.appendChild(title);

    formats.forEach(function(f) {
        var optionBtn = document.createElement('button');
        optionBtn.style.cssText = 'display:flex;align-items:center;width:100%;padding:15px 20px;background:' + (nightMode ? '#3d3d3d' : '#f5f5f5') + ';border:none;border-radius:8px;margin-bottom:10px;text-align:left;font-size:16px;color:' + textColor + ';cursor:pointer;transition:background 0.2s;';
        
        var iconHtml = '<span style="font-size:20px;margin-right:15px;width:30px;text-align:center;color:#4a90e2;">' + f.icon + '</span>';
        var nameHtml = '<span>' + f.name + '</span>';
        var slowBadge = f.slow ? '<span style="margin-left:auto;font-size:11px;padding:3px 8px;background:#f39c12;color:white;border-radius:10px;">' + (isEn() ? 'Slow' : '耗时') + '</span>' : '';
        optionBtn.innerHTML = iconHtml + nameHtml + slowBadge;

        optionBtn.onmouseenter = function() {
            this.style.background = nightMode ? '#4d4d4d' : '#e8e8e8';
        };
        optionBtn.onmouseleave = function() {
            this.style.background = nightMode ? '#3d3d3d' : '#f5f5f5';
        };

        optionBtn.onclick = function() {
            modal.remove();
            if (f.slow) {
                showExportModeDialog(content, f.ext, f.name);
            } else {
                setTimeout(function() {
                    exportFile(content, f.ext);
                }, 50);
            }
        };

        container.appendChild(optionBtn);
    });

    modal.appendChild(container);
    document.body.appendChild(modal);

    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            modal.remove();
        }
    });

    function handleKeydown(e) {
        if (e.key === 'Escape') {
            modal.remove();
            document.removeEventListener('keydown', handleKeydown);
        }
    }
    document.addEventListener('keydown', handleKeydown);
}

function showExportModeDialog(content, ext, formatName) {
    var nightMode = g('nightMode') === true;
    var bg = nightMode ? '#2d2d2d' : 'white';
    var textColor = nightMode ? '#eee' : '#333';
    var borderColor = nightMode ? '#444' : '#ddd';

    var modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:100110;';

    var container = document.createElement('div');
    container.style.cssText = 'background:' + bg + ';color:' + textColor + ';border-radius:12px;padding:25px;width:90%;max-width:450px;position:relative;';

    var closeBtn = document.createElement('button');
    closeBtn.innerHTML = '<i class="fas fa-times"></i>';
    closeBtn.style.cssText = 'position:absolute;top:15px;right:15px;background:none;border:none;color:' + textColor + ';font-size:20px;cursor:pointer;';
    closeBtn.onclick = function() { modal.remove(); };
    container.appendChild(closeBtn);

    var title = document.createElement('h2');
    title.textContent = formatName;
    title.style.cssText = 'text-align:center;margin-bottom:15px;margin-top:0;font-size:18px;font-weight:600;';
    container.appendChild(title);

    var desc = document.createElement('p');
    desc.textContent = isEn() ? 'This export may take a while. Choose how you want to proceed:' : '此导出可能需要较长时间，请选择执行方式：';
    desc.style.cssText = 'text-align:center;color:' + (nightMode ? '#aaa' : '#666') + ';margin-bottom:20px;font-size:14px;';
    container.appendChild(desc);

    var options = [
        {
            icon: '<i class="fas fa-clock" style="color:#4a90e2;"></i>',
            title: isEn() ? 'Background Export' : '后台导出',
            desc: isEn() ? 'Continue working. Get notified when done.' : '继续工作，完成后发送通知',
            value: 'background'
        },
        {
            icon: '<i class="fas fa-spinner fa-spin" style="color:#f39c12;"></i>',
            title: isEn() ? 'Wait for Export' : '等待导出',
            desc: isEn() ? 'Stay on this page until finished.' : '保持在当前页面直到完成',
            value: 'sync'
        }
    ];

    options.forEach(function(opt) {
        var optBtn = document.createElement('button');
        optBtn.style.cssText = 'display:flex;align-items:center;width:100%;padding:15px 20px;background:' + (nightMode ? '#3d3d3d' : '#f5f5f5') + ';border:2px solid transparent;border-radius:8px;margin-bottom:12px;text-align:left;cursor:pointer;transition:all 0.2s;';
        
        optBtn.innerHTML = '<div style="font-size:24px;margin-right:15px;width:30px;text-align:center;">' + opt.icon + '</div>' +
            '<div style="flex:1;"><div style="font-size:15px;font-weight:600;color:' + textColor + ';">' + opt.title + '</div>' +
            '<div style="font-size:12px;color:' + (nightMode ? '#aaa' : '#888') + ';margin-top:3px;">' + opt.desc + '</div></div>' +
            '<i class="fas fa-chevron-right" style="color:#ccc;"></i>';

        optBtn.onmouseenter = function() {
            this.style.background = nightMode ? '#4d4d4d' : '#e8e8e8';
            this.style.borderColor = '#4a90e2';
        };
        optBtn.onmouseleave = function() {
            this.style.background = nightMode ? '#3d3d3d' : '#f5f5f5';
            this.style.borderColor = 'transparent';
        };

        optBtn.onclick = function() {
            modal.remove();
            setTimeout(function() {
                if (opt.value === 'background') {
                    exportFileBackground(content, ext);
                } else {
                    exportFile(content, ext);
                }
            }, 50);
        };

        container.appendChild(optBtn);
    });

    modal.appendChild(container);
    document.body.appendChild(modal);

    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            modal.remove();
        }
    });
}

async function exportFileBackground(content, ext) {
    var nightMode = g('nightMode') === true;
    var loadingModal = document.createElement('div');
    loadingModal.className = 'modal-overlay';
    loadingModal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.9);z-index:10001;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;';
    loadingModal.innerHTML = '<div style="background:' + (nightMode ? '#2d2d2d' : 'white') + ';color:' + (nightMode ? '#eee' : '#333') + ';border-radius:12px;padding:30px;text-align:center;"><div style="font-size:24px;margin-bottom:15px;"><i class="fas fa-cloud-upload-alt" style="color:#4a90e2;"></i></div><div style="font-size:16px;margin-bottom:10px;">' + (isEn() ? 'Starting background export...' : '正在启动后台导出...') + '</div><div style="font-size:13px;color:#888;">' + (isEn() ? 'You can close this page. We\'ll notify you when it\'s done.' : '您可以关闭此页面，完成后我们会通知您。') + '</div></div>';
    document.body.appendChild(loadingModal);

    try {
        await initExportBackground(content, ext);
        loadingModal.remove();
        global.showMessage(isEn() ? 'Background export started. You\'ll be notified when done.' : '后台导出已启动，完成后会通知您。', 'success');
    } catch (error) {
        loadingModal.remove();
        console.error('Background export error:', error);
        global.showMessage((isEn() ? 'Background export failed: ' : '后台导出失败: ') + error.message, 'error');
    }
}

async function initExportBackground(content, ext) {
    if (typeof global.notificationService === 'undefined') {
        await import('./notification.js');
    }

    var userId = g('currentUser') ? (g('currentUser').username || g('currentUser').token) : null;
    if (!userId) {
        throw new Error(isEn() ? 'Please log in first' : '请先登录');
    }

    await global.notificationService.init();

    var defaultFileName = getCurrentFileName();
    var fileName = defaultFileName + '.' + ext;

    if (ext === 'pdf' || ext === 'docx') {
        var settings = { pageMargin: 15 };
        
        if (ext === 'pdf') {
            if (typeof global.showPrintDialog !== 'function') {
                await import('./print.js');
            }
            global.hideMobileActionSheet();
            
            await new Promise(function(resolve) {
                global.showPrintDialog('export-pdf', function(printSettings) {
                    Object.assign(settings, printSettings);
                    resolve();
                });
            });

            if (typeof global.preparePrintContent === 'function') {
                var htmlContent = await global.preparePrintContent(content, settings);
                
                var apiUrl = (g('getApiBaseUrl') ? g('getApiBaseUrl')() : '/api');
                var response = await fetch(apiUrl + '/convert/pdf', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        html: htmlContent,
                        settings: settings,
                        background: true,
                        userId: userId,
                        filename: fileName
                    })
                });

                var result = await response.json();
                if (result.code === 202) {
                    global.notificationService.startPollingTask(result.taskId);
                } else {
                    throw new Error(result.message || 'Export failed');
                }
            }
        } else if (ext === 'docx') {
            if (typeof global.showPrintDialog !== 'function') {
                await import('./print.js');
            }
            global.hideMobileActionSheet();
            
            await new Promise(function(resolve) {
                global.showPrintDialog('export-docx', function(printSettings) {
                    Object.assign(settings, printSettings);
                    resolve();
                });
            });

            var apiUrl = (g('getApiBaseUrl') ? g('getApiBaseUrl')() : '/api');
            var response = await fetch(apiUrl + '/convert/docx', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    markdown: content,
                    settings: settings,
                    background: true,
                    userId: userId,
                    filename: fileName
                })
            });

            var result = await response.json();
            if (result.code === 202) {
                global.notificationService.startPollingTask(result.taskId);
            } else {
                throw new Error(result.message || 'Export failed');
            }
        }
    }
}


// 获取当前文件名（不含扩展名）
function getCurrentFileName() {
    var defaultName = isEn() ? 'document' : '文档';
    var currentFileId = g('currentFileId');
    if (!currentFileId || typeof g('fileTree') === 'undefined') {
        return defaultName;
    }
    try {
        var currentNode = g('fileTree').jstree(true).get_node(currentFileId);
        if (currentNode && currentNode.text) {
            return currentNode.text.replace(/\.md$/i, '');
        }
    } catch (e) {
        console.error('获取文件名失败:', e);
    }
    return defaultName;
}

// 显示文件名输入对话框
function showFilenameDialog(defaultName, ext, callback) {
    var nightMode = g('nightMode') === true;
    var bg = nightMode ? '#2d2d2d' : 'white';
    var textColor = nightMode ? '#eee' : '#333';
    var borderColor = nightMode ? '#444' : '#ddd';

    var modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:10000;';

    var container = document.createElement('div');
    container.style.cssText = 'background:' + bg + ';color:' + textColor + ';border-radius:12px;padding:25px;width:90%;max-width:400px;position:relative;';

    var closeBtn = document.createElement('button');
    closeBtn.innerHTML = '<i class="fas fa-times"></i>';
    closeBtn.style.cssText = 'position:absolute;top:15px;right:15px;background:none;border:none;color:' + textColor + ';font-size:20px;cursor:pointer;';
    closeBtn.onclick = function() { modal.remove(); };
    container.appendChild(closeBtn);

    var title = document.createElement('h2');
    title.textContent = isEn() ? 'Enter File Name' : '输入文件名';
    title.style.cssText = 'text-align:center;margin-bottom:20px;margin-top:0;font-size:18px;font-weight:600;';
    container.appendChild(title);

    var input = document.createElement('input');
    input.type = 'text';
    input.value = defaultName;
    input.style.cssText = 'width:100%;padding:12px 15px;border:1px solid ' + borderColor + ';border-radius:8px;font-size:16px;background:' + (nightMode ? '#3d3d3d' : '#fff') + ';color:' + textColor + ';box-sizing:border-box;margin-bottom:20px;';
    input.placeholder = isEn() ? 'File name' : '文件名';
    container.appendChild(input);

    var extLabel = document.createElement('div');
    extLabel.textContent = '.' + ext;
    extLabel.style.cssText = 'text-align:center;color:#4a90e2;font-size:14px;margin-bottom:20px;';
    container.appendChild(extLabel);

    var btnContainer = document.createElement('div');
    btnContainer.style.cssText = 'display:flex;gap:10px;';

    var cancelBtn = document.createElement('button');
    cancelBtn.textContent = isEn() ? 'Cancel' : '取消';
    cancelBtn.style.cssText = 'flex:1;padding:12px;border:1px solid ' + borderColor + ';border-radius:8px;background:transparent;color:' + textColor + ';font-size:16px;cursor:pointer;';
    cancelBtn.onclick = function() { modal.remove(); };
    btnContainer.appendChild(cancelBtn);

    var confirmBtn = document.createElement('button');
    confirmBtn.textContent = isEn() ? 'Download' : '下载';
    confirmBtn.style.cssText = 'flex:1;padding:12px;border:none;border-radius:8px;background:#4a90e2;color:white;font-size:16px;cursor:pointer;';
    confirmBtn.onclick = function() {
        var filename = input.value.trim();
        if (!filename) {
            filename = defaultName;
        }
        modal.remove();
        callback(filename);
    };
    btnContainer.appendChild(confirmBtn);

    container.appendChild(btnContainer);
    modal.appendChild(container);
    document.body.appendChild(modal);

    setTimeout(function() {
        input.focus();
        input.select();
    }, 50);

    input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            confirmBtn.click();
        } else if (e.key === 'Escape') {
            modal.remove();
        }
    });

    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            modal.remove();
        }
    });
}

async function exportFile(content, ext) {
    var mimeTypes = { md: 'text/markdown', txt: 'text/plain', html: 'text/html', pdf: 'application/pdf' };
    var fileContent = content;

    // 获取默认文件名
    var defaultFileName = getCurrentFileName();

    // 纯文本导出：去掉 Markdown 标签
    if (ext === 'txt') {
        fileContent = markdownToPlainText(content);
    }

    // PDF 处理逻辑
    if (ext === 'pdf') {
        if (typeof global.showPrintDialog !== 'function') {
            await import('./print.js');
        }
        global.hideMobileActionSheet();
        global.showPrintDialog('export-pdf', function(settings) {
            showExportModeDialog(content, ext, 'PDF', settings);
        });
        return;
    }

    // HTML 处理逻辑
    if (ext === 'html') {
        // 懒加载打印模块
        if (typeof global.showPrintDialog !== 'function') {
            await import('./print.js');
        }
        global.hideMobileActionSheet();
        global.showPrintDialog('export-html', async function(settings) {
            try {
                var loadingModal = document.createElement('div');
                loadingModal.className = 'modal-overlay';
                loadingModal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.9);z-index:10001;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;';
                loadingModal.innerHTML = '<div style="background:white;color:#333;border-radius:12px;padding:30px;text-align:center;"><div style="font-size:24px;margin-bottom:15px;"><i class="fas fa-spinner fa-spin"></i></div><div style="font-size:16px;">' + (isEn() ? 'Processing...' : '处理中...') + '</div></div>';
                document.body.appendChild(loadingModal);

                if (!global.preparePrintContent) {
                    throw new Error(isEn() ? 'Print module not loaded' : '打印模块未加载');
                }
                var htmlContent = await global.preparePrintContent(content, settings);

                // 生成完整的HTML文档
                var finalHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>` + (window.i18n ? 'Exported Document' : '导出文档') + `</title>
</head>
<body>
    ${htmlContent}
</body>
</html>`;

                loadingModal.remove();

                // 显示文件名输入对话框
                showFilenameDialog(defaultFileName, 'html', async function(filename) {
                    var fullFilename = filename + '.html';

                    if (window.nativeFileOps && window.nativeFileOps.isTauriRuntime()) {
                        await window.nativeFileOps.saveFile(finalHtml, {
                            filename: fullFilename,
                            mimeType: 'text/html'
                        });
                        global.showMessage(isEn() ? 'Document exported as .html' : '文档已导出为.html格式');
                        return;
                    }

                    var blob = new Blob([finalHtml], { type: 'text/html' });
                    var url = URL.createObjectURL(blob);
                    var a = document.createElement('a');
                    a.href = url;
                    a.download = fullFilename;
                    document.body.appendChild(a);
                    a.click();

                    setTimeout(function() {
                        document.body.removeChild(a);
                        window.URL.revokeObjectURL(url);
                    }, 100);

                    global.showMessage(isEn() ? 'Document exported as .html' : '文档已导出为.html格式');
                });
            } catch (error) {
                console.error('HTML导出错误:', error);
                global.showMessage((isEn() ? 'HTML export failed: ' : 'HTML导出失败: ') + error.message);
                if (loadingModal) loadingModal.remove();
            }
        });
        return;
    }

    // DOCX 导出逻辑
    if (ext === 'docx') {
        if (typeof global.showPrintDialog !== 'function') {
            await import('./print.js');
        }
        global.hideMobileActionSheet();
        global.showPrintDialog('export-docx', function(settings) {
            showExportModeDialog(content, ext, 'Word', settings);
        });
        return;
    }

    // MD 和 TXT 导出逻辑
    showFilenameDialog(defaultFileName, ext, async function(filename) {
        var fullFilename = filename + '.' + ext;

        if (window.nativeFileOps && window.nativeFileOps.isTauriRuntime()) {
            await window.nativeFileOps.saveFile(fileContent, {
                filename: fullFilename,
                mimeType: mimeTypes[ext] || 'text/plain'
            });
            global.hideMobileActionSheet();
            global.showMessage(isEn() ? 'Document exported as .' + ext : '文档已导出为.' + ext + '格式');
            return;
        }

        var blob = new Blob([fileContent], { type: mimeTypes[ext] || 'text/plain' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = fullFilename;
        a.click();
        global.hideMobileActionSheet();
        global.showMessage(isEn() ? 'Document exported as .' + ext : '文档已导出为.' + ext + '格式');
    });
}

async function downloadGeneratedFile(payload, filename, mimeType) {
    if (window.nativeFileOps && window.nativeFileOps.isTauriRuntime()) {
        return window.nativeFileOps.saveFile(payload, {
            filename: filename,
            mimeType: mimeType
        });
    }

    var blob = payload instanceof Blob ? payload : new Blob([payload], { type: mimeType || 'application/octet-stream' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();

    setTimeout(function() {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 100);
}

global.exportContent = exportContent;
global.exportFile = exportFile;
global.showFilenameDialog = showFilenameDialog;
global.exportFileBackground = exportFileBackground;
global.showExportModeDialog = showExportModeDialog;
