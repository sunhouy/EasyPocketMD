
const global = window;

function g(name) { return global[name]; }
function isEn() { return window.i18n && window.i18n.getLanguage() === 'en'; }
function t(key) { return window.i18n ? window.i18n.t(key) : key; }

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

function exportContent() {
    if (!g('vditor')) return;
    var content = g('vditor').getValue();
    var formats = [
        { name: isEn() ? 'Markdown File (.md)' : 'Markdown文件 (.md)', ext: 'md', icon: '<i class="fas fa-file-code"></i>' },
        { name: isEn() ? 'Plain Text File (.txt)' : '纯文本文件 (.txt)', ext: 'txt', icon: '<i class="fas fa-file-alt"></i>' },
        { name: isEn() ? 'HTML File (.html)' : 'HTML文件 (.html)', ext: 'html', icon: '<i class="fab fa-html5"></i>' },
        { name: isEn() ? 'Word File (.doc)' : 'Word文档 (.doc)', ext: 'docx', icon: '<i class="fas fa-file-word"></i>' },
        { name: isEn() ? 'PDF File (.pdf)' : 'PDF文件 (.pdf)', ext: 'pdf', icon: '<i class="fas fa-file-pdf"></i>' }
    ];

    var nightMode = g('nightMode') === true;
    var bg = nightMode ? '#2d2d2d' : 'white';
    var textColor = nightMode ? '#eee' : '#333';
    var borderColor = nightMode ? '#444' : '#ddd';

    // 创建模态框
    var modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:10000;';

    // 创建内容容器
    var container = document.createElement('div');
    container.style.cssText = 'background:' + bg + ';color:' + textColor + ';border-radius:12px;padding:25px;width:90%;max-width:400px;position:relative;';

    // 右上角关闭按钮
    var closeBtn = document.createElement('button');
    closeBtn.innerHTML = '<i class="fas fa-times"></i>';
    closeBtn.style.cssText = 'position:absolute;top:15px;right:15px;background:none;border:none;color:' + textColor + ';font-size:20px;cursor:pointer;';
    closeBtn.onclick = function() { modal.remove(); };
    container.appendChild(closeBtn);

    // 标题
    var title = document.createElement('h2');
    title.textContent = isEn() ? 'Export Format' : '导出格式';
    title.style.cssText = 'text-align:center;margin-bottom:20px;margin-top:0;font-size:18px;font-weight:600;';
    container.appendChild(title);

    // 格式选项列表
    formats.forEach(function(f) {
        var optionBtn = document.createElement('button');
        optionBtn.style.cssText = 'display:flex;align-items:center;width:100%;padding:15px 20px;background:' + (nightMode ? '#3d3d3d' : '#f5f5f5') + ';border:none;border-radius:8px;margin-bottom:10px;text-align:left;font-size:16px;color:' + textColor + ';cursor:pointer;transition:background 0.2s;';
        optionBtn.innerHTML = '<span style="font-size:20px;margin-right:15px;width:30px;text-align:center;color:#667eea;">' + f.icon + '</span><span>' + f.name + '</span>';

        optionBtn.onmouseenter = function() {
            this.style.background = nightMode ? '#4d4d4d' : '#e8e8e8';
        };
        optionBtn.onmouseleave = function() {
            this.style.background = nightMode ? '#3d3d3d' : '#f5f5f5';
        };

        optionBtn.onclick = function() {
            modal.remove();
            // 使用 setTimeout 确保模态框完全关闭后再执行导出
            setTimeout(function() {
                exportFile(content, f.ext);
            }, 50);
        };

        container.appendChild(optionBtn);
    });

    modal.appendChild(container);
    document.body.appendChild(modal);

    // 点击外部关闭
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            modal.remove();
        }
    });

    // 键盘事件
    function handleKeydown(e) {
        if (e.key === 'Escape') {
            modal.remove();
            document.removeEventListener('keydown', handleKeydown);
        }
    }
    document.addEventListener('keydown', handleKeydown);
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
    extLabel.style.cssText = 'text-align:center;color:#667eea;font-size:14px;margin-bottom:20px;';
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
    confirmBtn.style.cssText = 'flex:1;padding:12px;border:none;border-radius:8px;background:#667eea;color:white;font-size:16px;cursor:pointer;';
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
        // 懒加载打印模块
        if (typeof global.showPrintDialog !== 'function') {
            await import('./print.js');
        }
        global.hideMobileActionSheet();
        global.showPrintDialog('export-pdf', async function(settings) {
            try {
                var loadingModal = document.createElement('div');
                loadingModal.className = 'modal-overlay';
                loadingModal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.9);z-index:10001;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;';
                loadingModal.innerHTML = '<div style="background:white;color:#333;border-radius:12px;padding:30px;text-align:center;"><div style="font-size:24px;margin-bottom:15px;"><i class="fas fa-spinner fa-spin"></i></div><div style="font-size:16px;">' + (isEn() ? 'Generating PDF...' : '生成PDF中...') + '</div></div>';
                document.body.appendChild(loadingModal);

                if (!global.preparePrintContent) {
                    throw new Error(isEn() ? 'Print module not loaded' : '打印模块未加载');
                }
                var htmlContent = await global.preparePrintContent(content, settings);

                // 懒加载 PDF 生成器并生成PDF
                const { generatePDF } = await getPDFGenerator();
                var pdfUrl = await generatePDF(htmlContent, settings);

                loadingModal.remove();

                // 显示文件名输入对话框
                showFilenameDialog(defaultFileName, 'pdf', async function(filename) {
                    var fullFilename = filename + '.pdf';

                    // 如果是 Capacitor 环境，使用特殊的下载逻辑
                    if (window.Capacitor && window.Capacitor.isNativePlatform()) {
                        await downloadInCapacitor(pdfUrl, fullFilename, 'application/pdf');
                        return;
                    }

                    // 确保pdfUrl是完整的URL
                    var fullPdfUrl = pdfUrl;
                    if (!pdfUrl.startsWith('http://') && !pdfUrl.startsWith('https://') && !pdfUrl.startsWith('blob:')) {
                        // 构建完整的URL
                        var origin = window.getAppOrigin ? window.getAppOrigin() : window.location.origin;
                        var baseUrl = origin;
                        if (!pdfUrl.startsWith('/')) {
                            baseUrl += '/' + window.location.pathname.split('/').slice(0, -1).join('/') + '/';
                        }
                        fullPdfUrl = baseUrl + pdfUrl;
                    }

                    // 创建下载链接
                    var a = document.createElement('a');
                    a.href = fullPdfUrl;
                    a.download = fullFilename;
                    a.target = '_blank'; // 新窗口打开以防下载失败
                    document.body.appendChild(a);
                    a.click();

                    setTimeout(function() {
                        document.body.removeChild(a);
                    }, 100);

                    global.showMessage(isEn() ? 'Document exported as .pdf' : '文档已导出为.pdf格式');
                });
            } catch (error) {
                console.error('PDF导出错误:', error);
                global.showMessage((isEn() ? 'PDF export failed: ' : 'PDF导出失败: ') + error.message);
                if (loadingModal) loadingModal.remove();
            }
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

                    if (window.Capacitor && window.Capacitor.isNativePlatform()) {
                        await downloadInCapacitor(finalHtml, fullFilename, 'text/html', true);
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
        // 懒加载打印模块（如果未加载）
        if (typeof global.showPrintDialog !== 'function') {
            await import('./print.js');
        }
        global.hideMobileActionSheet();
        // 显示打印设置对话框，让用户配置导出选项
        global.showPrintDialog('export-docx', async function(settings) {
            // 懒加载 DOCX 生成器
            if (typeof global.exportDOCX !== 'function') {
                await import('./docx-generator.js');
            }
            // 显示文件名输入对话框，然后导出
            showFilenameDialog(defaultFileName, 'docx', async function(filename) {
                await global.exportDOCX(content, settings, filename);
            });
        });
        return;
    }

    // MD 和 TXT 导出逻辑
    showFilenameDialog(defaultFileName, ext, async function(filename) {
        var fullFilename = filename + '.' + ext;

        if (window.Capacitor && window.Capacitor.isNativePlatform()) {
            await downloadInCapacitor(fileContent, fullFilename, mimeTypes[ext] || 'text/plain', true);
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

/**
 * 在 Capacitor 中处理文件下载/分享
 * @param {string} data 数据内容（可以是 URL 也可以是纯文本/HTML）
 * @param {string} filename 文件名
 * @param {string} mimeType MIME 类型
 * @param {boolean} isRawData 是否是原始数据（不是 URL）
 */
async function downloadInCapacitor(data, filename, mimeType, isRawData = false) {
    try {
        const { Filesystem, Directory } = await import('@capacitor/filesystem');
        const { Share } = await import('@capacitor/share');

        let base64Data = '';
        if (isRawData) {
            // 原始文本数据转 base64
            base64Data = btoa(unescape(encodeURIComponent(data)));
        } else {
            // 如果是 URL，尝试获取并转为 base64
            const response = await fetch(data);
            const blob = await response.blob();
            base64Data = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => {
                    const base64 = reader.result.split(',')[1];
                    resolve(base64);
                };
                reader.readAsDataURL(blob);
            });
        }

        // 写入临时文件
        const writeResult = await Filesystem.writeFile({
            path: filename,
            data: base64Data,
            directory: Directory.Cache
        });

        // 分享文件（这在移动端通常是保存到文件的最佳方式）
        await Share.share({
            title: filename,
            text: filename,
            url: writeResult.uri,
            dialogTitle: isEn() ? 'Save or Share File' : '保存或分享文件'
        });

        global.showMessage(isEn() ? 'File ready to save' : '文件已就绪，请选择保存位置');
    } catch (error) {
        console.error('Capacitor download error:', error);
        global.showMessage((isEn() ? 'Download failed: ' : '下载失败: ') + error.message, 'error');
    }
}

global.exportContent = exportContent;
global.exportFile = exportFile;
