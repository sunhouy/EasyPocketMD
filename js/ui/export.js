
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
                    
                    // 确保pdfUrl是完整的URL
                    var fullPdfUrl = pdfUrl;
                    if (!pdfUrl.startsWith('http://') && !pdfUrl.startsWith('https://')) {
                        // 构建完整的URL
                        var baseUrl = window.location.origin;
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
                    
                    var blob = new Blob([finalHtml], { type: 'text/html' });
                    var url = URL.createObjectURL(blob);
                    var a = document.createElement('a');
                    a.href = url;
                    a.download = '文档_' + new Date().toISOString().slice(0, 10) + '.html';
                    document.body.appendChild(a);
                    a.click();
                    
                    setTimeout(function() {
                        document.body.removeChild(a);
                        window.URL.revokeObjectURL(url);
                    }, 100);
                    
                    loadingModal.remove();
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

    var blob = new Blob([fileContent], { type: mimeTypes[ext] || 'text/plain' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = '文档_' + new Date().toISOString().slice(0, 10) + '.' + ext;
    a.click();
    global.hideMobileActionSheet();
    global.showMessage(isEn() ? 'Document exported as .' + ext : '文档已导出为.' + ext + '格式');
}

global.exportContent = exportContent;
global.exportFile = exportFile;
