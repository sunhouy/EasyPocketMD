
import { generatePDF } from './pdf-generator.js';

const global = window;

function g(name) { return global[name]; }
function isEn() { return window.i18n && window.i18n.getLanguage() === 'en'; }
function t(key) { return window.i18n ? window.i18n.t(key) : key; }

function exportContent() {
    if (!g('vditor')) return;
    var content = g('vditor').getValue();
    var formats = [
        { name: isEn() ? 'Markdown File (.md)' : 'Markdown文件 (.md)', ext: 'md' }, 
        { name: isEn() ? 'Plain Text File (.txt)' : '纯文本文件 (.txt)', ext: 'txt' }, 
        { name: isEn() ? 'HTML File (.html)' : 'HTML文件 (.html)', ext: 'html' },
        { name: isEn() ? 'PDF File (.pdf)' : 'PDF文件 (.pdf)', ext: 'pdf' }
    ];
    var exportOptions = formats.map(function(f) {
        return { icon: '<i class="fas fa-file-download"></i>', text: f.name, action: async function() { await exportFile(content, f.ext); } };
    });
    global.showMobileActionSheet(isEn() ? 'Export Format' : '导出格式', exportOptions);
}


async function exportFile(content, ext) {
    // Check for local files first
    if (global.checkAndUploadLocalFiles) {
        const ok = await global.checkAndUploadLocalFiles();
        if (!ok) return; // User cancelled upload
        // Refresh content in case it was replaced with cloud links
        content = g('vditor').getValue();
    }

    var mimeTypes = { md: 'text/markdown', txt: 'text/plain', html: 'text/html', pdf: 'application/pdf' };
    var fileContent = content;

    // PDF 处理逻辑
    if (ext === 'pdf') {
         if (global.showPrintDialog) {
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
                    
                    // 生成PDF并获取URL
                    var pdfUrl = await generatePDF(htmlContent, settings);
                    
                    // 如果是 Capacitor 环境，使用特殊的下载逻辑
                    if (window.Capacitor && window.Capacitor.isNativePlatform()) {
                        await downloadInCapacitor(pdfUrl, '文档_' + new Date().toISOString().slice(0, 10) + '.pdf', 'application/pdf');
                        loadingModal.remove();
                        return;
                    }

                    // 确保pdfUrl是完整的URL
                    var fullPdfUrl = pdfUrl;
                    if (!pdfUrl.startsWith('http://') && !pdfUrl.startsWith('https://')) {
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
                    a.download = '文档_' + new Date().toISOString().slice(0, 10) + '.pdf';
                    a.target = '_blank'; // 新窗口打开以防下载失败
                    document.body.appendChild(a);
                    a.click();
                    
                    setTimeout(function() {
                        document.body.removeChild(a);
                    }, 100);
                    
                    loadingModal.remove();
                    global.showMessage(isEn() ? 'Document exported as .pdf' : '文档已导出为.pdf格式');
                 } catch (error) {
                    console.error('PDF导出错误:', error);
                    global.showMessage((isEn() ? 'PDF export failed: ' : 'PDF导出失败: ') + error.message);
                    if (loadingModal) loadingModal.remove();
                 }
             });
             return;
         }
    }

    // HTML 处理逻辑
    if (ext === 'html') {
         if (global.showPrintDialog) {
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
                    
                    var filename = '文档_' + new Date().toISOString().slice(0, 10) + '.html';
                    if (window.Capacitor && window.Capacitor.isNativePlatform()) {
                        await downloadInCapacitor(finalHtml, filename, 'text/html', true);
                        return;
                    }

                    var blob = new Blob([finalHtml], { type: 'text/html' });
                    var url = URL.createObjectURL(blob);
                    var a = document.createElement('a');
                    a.href = url;
                    a.download = filename;
                    document.body.appendChild(a);
                    a.click();
                    
                    setTimeout(function() {
                        document.body.removeChild(a);
                        window.URL.revokeObjectURL(url);
                    }, 100);
                    
                    global.showMessage(isEn() ? 'Document exported as .html' : '文档已导出为.html格式');
                 } catch (error) {
                    console.error('HTML导出错误:', error);
                    global.showMessage((isEn() ? 'HTML export failed: ' : 'HTML导出失败: ') + error.message);
                    if (loadingModal) loadingModal.remove();
                 }
             });
             return;
         }
    }

    var filename = '文档_' + new Date().toISOString().slice(0, 10) + '.' + ext;
    if (window.Capacitor && window.Capacitor.isNativePlatform()) {
        await downloadInCapacitor(fileContent, filename, mimeTypes[ext] || 'text/plain', true);
        return;
    }

    var blob = new Blob([fileContent], { type: mimeTypes[ext] || 'text/plain' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    global.hideMobileActionSheet();
    global.showMessage(isEn() ? 'Document exported as .' + ext : '文档已导出为.' + ext + '格式');
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
