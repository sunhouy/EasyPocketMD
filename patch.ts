const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'js/main.js');
let code = fs.readFileSync(file, 'utf8');

const regex = /\/\/\s*添加粘贴事件监听器，限制粘贴文本长度.*?(?=\/\/ 初始化应用生命周期管理)/s;

const replaceCode = `// 处理粘贴事件，限制长度并处理AI格式
            function handlePasteEvent(e) {
                var clipboardData = e.clipboardData || window.clipboardData;
                var pastedText = clipboardData.getData('text');
                
                if (pastedText.length > 10000) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    window.showMessage(window.i18n ? window.i18n.t('pasteTextTooLong') : '粘贴文本过长，请减少粘贴内容后重试', 'error');
                    return;
                }
                
                var aiRegex = /\\\\\\\\[[\\\\s\\\\S]*?\\\\\\\\]|\\\\\\\\\\([\\\\s\\\\S]*?\\\\\\\\)/;
                if (aiRegex.test(pastedText)) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    
                    window.customConfirm(
                        window.i18n && window.i18n.t('detectAiMarkdownFormat') && window.i18n.t('detectAiMarkdownFormat') !== 'detectAiMarkdownFormat' ? 
                        window.i18n.t('detectAiMarkdownFormat') : 
                        '检测到当前粘贴的格式可能与编辑器的KaTeX渲染格式不一致（例如包含 \\\\[...\\\\] 或 \\\\(...\\\\)）。是否自动将其转换为标准格式？'
                    ).then(function(shouldConvert) {
                        var textToInsert = pastedText;
                        if (shouldConvert) {
                            textToInsert = textToInsert.replace(/\\\\\\\\[([\\\\s\\\\S]*?)\\\\\\\\]/g, '$$$$$$$$$1$$$$$$$$');
                            textToInsert = textToInsert.replace(/\\\\\\\\\\(([\\\\s\\\\S]*?)\\\\\\\\\\)/g, '$$$$$1$$$$');
                            textToInsert = textToInsert.replace(/\\\\\\\\_/g, '_');
                            textToInsert = textToInsert.replace(/\\\\\\\\\\\\$/g, '$');
                        }
                        
                        if (window.vditor && typeof window.vditor.insertValue === 'function') {
                            window.vditor.insertValue(textToInsert);
                        } else {
                            document.execCommand('insertText', false, textToInsert);
                        }
                    });
                }
            }

            if (window.vditor && window.vditor.vditor && window.vditor.vditor.ir) {
                window.vditor.vditor.ir.element.addEventListener('paste', handlePasteEvent, true);
            }
            if (window.vditor && window.vditor.vditor && window.vditor.vditor.wysiwyg) {
                window.vditor.vditor.wysiwyg.element.addEventListener('paste', handlePasteEvent, true);
            }
            if (window.vditor && window.vditor.vditor && window.vditor.vditor.sv) {
                window.vditor.vditor.sv.element.addEventListener('paste', handlePasteEvent, true);
            }

            `;

if(regex.test(code)) {
    fs.writeFileSync(file, code.replace(regex, () => replaceCode));
    console.log("Patched successfully");
} else {
    console.log("Could not find regex");
}
