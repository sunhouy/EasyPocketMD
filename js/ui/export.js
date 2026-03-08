
import { generatePDF } from './pdf-generator.js';

const global = window;

function g(name) { return global[name]; }

function exportContent() {
    if (!g('vditor')) return;
    var content = g('vditor').getValue();
    var formats = [
        { name: 'Markdown文件 (.md)', ext: 'md' }, 
        { name: '纯文本文件 (.txt)', ext: 'txt' }, 
        { name: 'HTML文件 (.html)', ext: 'html' },
        { name: 'PDF文件 (.pdf)', ext: 'pdf' }
    ];
    var exportOptions = formats.map(function(f) {
        return { icon: '<i class="fas fa-file-download"></i>', text: f.name, action: async function() { await exportFile(content, f.ext); } };
    });
    global.showMobileActionSheet('导出格式', exportOptions);
}

async function exportFile(content, ext) {
    var mimeTypes = { md: 'text/markdown', txt: 'text/plain', html: 'text/html', pdf: 'application/pdf' };
    var fileContent = content;

    // PDF 处理逻辑
    if (ext === 'pdf') {
         try {
            var loadingModal = document.createElement('div');
            loadingModal.className = 'modal-overlay';
            loadingModal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.9);z-index:10001;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;';
            loadingModal.innerHTML = '<div style="background:white;color:#333;border-radius:12px;padding:30px;text-align:center;"><div style="font-size:24px;margin-bottom:15px;"><i class="fas fa-spinner fa-spin"></i></div><div style="font-size:16px;">生成PDF中...</div></div>';
            document.body.appendChild(loadingModal);

            var settings = {
                titleFontSize: 24,
                bodyFontSize: 12,
                pageMargin: 15,
                lineHeight: 1.2,
                paragraphSpacing: 0.5,
                titleSpacing: 0.8,
                alignment: 'left',
                titleAlignment: 'center',
                fitToPage: false,
                indentParagraph: true
            };

            if (!global.preparePrintContent) {
                 throw new Error('Print module not loaded');
            }
            var htmlContent = await global.preparePrintContent(content, settings);
            
            // 直接下载
            await generatePDF(htmlContent, settings, '文档_' + new Date().toISOString().slice(0, 10) + '.pdf');
            
            loadingModal.remove();
            global.hideMobileActionSheet();
            global.showMessage('文档已导出为.pdf格式');
            return;
         } catch (error) {
            console.error('PDF导出错误:', error);
            global.showMessage('PDF导出失败: ' + error.message);
            if (loadingModal) loadingModal.remove();
            return;
         }
    }

    // 如果是导出为HTML，使用与云打印相同的处理逻辑
    if (ext === 'html') {
        try {
            // 显示加载状态
            var loadingModal = document.createElement('div');
            loadingModal.className = 'modal-overlay';
            loadingModal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.9);z-index:10001;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;';

            var loadingContent = document.createElement('div');
            loadingContent.style.cssText = 'background:white;color:#333;border-radius:12px;padding:30px;text-align:center;';
            loadingContent.innerHTML = '<div style="font-size:24px;margin-bottom:15px;"><i class="fas fa-spinner fa-spin"></i></div><div style="font-size:16px;">处理中...</div>';

            loadingModal.appendChild(loadingContent);
            document.body.appendChild(loadingModal);

            // 使用与云打印相同的处理逻辑
            var settings = {
                titleFontSize: 24,
                bodyFontSize: 12,
                pageMargin: 15,
                lineHeight: 1.2,
                paragraphSpacing: 0.5,
                titleSpacing: 0.8,
                alignment: 'left',
                titleAlignment: 'center',
                fitToPage: false,
                indentParagraph: true
            };

            // 使用preparePrintContent函数处理内容
            // 需要确保 global.preparePrintContent 可用，它在 print.js 中定义
            if (!global.preparePrintContent) {
                 throw new Error('Print module not loaded');
            }
            var htmlContent = await global.preparePrintContent(content, settings);

            // 生成完整的HTML文档
            fileContent = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>导出文档</title>
    <style>
        body {
            font-family: "SimSun", "宋体", serif;
            font-size: 12pt;
            line-height: 1.2;
            color: #333;
            padding: 15mm;
        }
        h1, h2, h3, h4, h5, h6 {
            text-align: center;
            font-weight: bold;
            margin-top: 0.8em;
            margin-bottom: 0.8em;
            line-height: 1.2;
        }
        h1 { font-size: 18pt; }
        h2 { font-size: 16pt; }
        h3 { font-size: 14pt; }
        h4 { font-size: 12pt; }
        p {
            font-size: 12pt;
            margin: 0 0 0.5em 0;
            padding: 0;
            text-align: left;
        }
        .code-block {
            background: #f8f9fa;
            border: 1px solid #ddd;
            border-radius: 4px;
            padding: 15px;
            font-family: monospace;
            font-size: 10pt;
            overflow-x: auto;
            margin: 0.8em 0;
            text-align: left;
        }
        img {
            max-width: 100%;
            height: auto;
            margin: 1em 0;
        }
    </style>
</head>
<body>
    ${htmlContent}
</body>
</html>`;

            // 移除加载状态
            loadingModal.remove();
        } catch (error) {
            console.error('HTML导出错误:', error);
            global.showMessage('HTML导出失败: ' + error.message);
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
    global.showMessage('文档已导出为.' + ext + '格式');
}

global.exportContent = exportContent;
global.exportFile = exportFile;
