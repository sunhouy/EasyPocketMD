(function(global) {
    'use strict';

    function g(name) { return global[name]; }
    function isEn() { return window.i18n && window.i18n.getLanguage() === 'en'; }

    // AI智能排版历史记录
    var aiLayoutHistory = [];
    // 当前AI排版设置
    var currentAISettings = {
        style: 'academic',
        format: 'standard'
    };

    // 懒加载 PDF 生成器
    async function getPDFGenerator() {
        if (!global.generatePDF) {
            const module = await import('./pdf-generator.js');
            global.generatePDF = module.generatePDF;
            global.renderPDF = module.renderPDF;
        }
        return { generatePDF: global.generatePDF, renderPDF: global.renderPDF };
    }

    function showAILayoutDialog(parentModalContent, cleanupFunc, parentModal) {
        var nightMode = g('nightMode') === true;
        
        // 创建AI排版对话框
        var aiModal = document.createElement('div');
        aiModal.className = 'modal-overlay';
        aiModal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:10002;';
        
        var bg = nightMode ? '#2d2d2d' : 'white';
        var textColor = nightMode ? '#eee' : '#333';
        var borderColor = nightMode ? '#444' : '#ddd';
        
        var modalContent = document.createElement('div');
        modalContent.style.cssText = 'background:' + bg + ';color:' + textColor + ';border-radius:12px;padding:25px;width:90%;max-width:500px;max-height:85vh;overflow-y:auto;';
        
        modalContent.innerHTML = `
            <div style="text-align:center;margin-bottom:20px;">
                <div style="font-size:40px;margin-bottom:10px;background:linear-gradient(135deg, #4a90e2 0%, #357abd 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;">
                    <i class="fas fa-magic"></i>
                </div>
                <h2 style="margin:0;">${isEn() ? 'AI Smart Layout' : 'AI智能排版'}</h2>
                <p style="margin-top:5px;font-size:14px;color:${nightMode ? '#aaa' : '#666'};">${isEn() ? 'Based on Qwen model, one-click document layout optimization' : '基于通义千问大模型，一键优化文档排版'}</p>
            </div>
            
            <div style="margin-bottom:20px;">
                <label style="display:block;margin-bottom:8px;font-weight:bold;">${isEn() ? 'Layout Style' : '排版风格'}</label>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                    <div class="ai-style-option selected" data-value="academic" style="border:2px solid #4a90e2;border-radius:8px;padding:10px;cursor:pointer;background:${nightMode ? '#3d3d3d' : '#f0f4ff'};">
                        <div style="font-weight:bold;margin-bottom:5px;"><i class="fas fa-graduation-cap"></i> ${isEn() ? 'Academic' : '学术论文'}</div>
                        <div style="font-size:12px;color:${nightMode ? '#bbb' : '#666'};">${isEn() ? 'Rigorous and standardized, suitable for papers and reports' : '严谨规范，适合论文、报告'}</div>
                    </div>
                    <div class="ai-style-option" data-value="business" style="border:1px solid ${borderColor};border-radius:8px;padding:10px;cursor:pointer;">
                        <div style="font-weight:bold;margin-bottom:5px;"><i class="fas fa-briefcase"></i> ${isEn() ? 'Business' : '商务公文'}</div>
                        <div style="font-size:12px;color:${nightMode ? '#bbb' : '#666'};">${isEn() ? 'Formal and professional, suitable for documents and bids' : '正式专业，适合公文、标书'}</div>
                    </div>
                    <div class="ai-style-option" data-value="creative" style="border:1px solid ${borderColor};border-radius:8px;padding:10px;cursor:pointer;">
                        <div style="font-weight:bold;margin-bottom:5px;"><i class="fas fa-paint-brush"></i> ${isEn() ? 'Creative' : '创意设计'}</div>
                        <div style="font-size:12px;color:${nightMode ? '#bbb' : '#666'};">${isEn() ? 'Beautiful and elegant, suitable for articles and blogs' : '美观大方，适合文章、博客'}</div>
                    </div>
                    <div class="ai-style-option" data-value="simple" style="border:1px solid ${borderColor};border-radius:8px;padding:10px;cursor:pointer;">
                        <div style="font-weight:bold;margin-bottom:5px;"><i class="fas fa-feather"></i> ${isEn() ? 'Simple' : '极简阅读'}</div>
                        <div style="font-size:12px;color:${nightMode ? '#bbb' : '#666'};">${isEn() ? 'Clear and readable, suitable for reading and notes' : '清晰易读，适合阅读、笔记'}</div>
                    </div>
                </div>
            </div>
            
            <div style="margin-bottom:20px;">
                <label style="display:block;margin-bottom:8px;font-weight:bold;">${isEn() ? 'Layout Requirements (Optional)' : '排版要求（可选）'}</label>
                <textarea id="aiRequirements" placeholder="${isEn() ? 'For example: Please center all level 1 headings, indent first line of paragraphs, use Song font...' : '例如：请将所有一级标题居中，段落首行缩进，使用宋体...'}" style="width:100%;padding:10px;border:1px solid ${borderColor};border-radius:8px;background:${nightMode ? '#3d3d3d' : 'white'};color:${textColor};height:80px;resize:none;"></textarea>
            </div>
            
            <div style="display:flex;gap:10px;margin-top:25px;">
                <button id="startAILayoutBtn" style="flex:2;padding:12px;font-weight:bold;background:linear-gradient(135deg, #4a90e2 0%, #357abd 100%);color:white;border:none;border-radius:6px;cursor:pointer;font-size:16px;">
                    <i class="fas fa-sparkles"></i> ${isEn() ? 'Start Smart Layout' : '开始智能排版'}
                </button>
                <button id="cancelAIBtn" style="flex:1;padding:12px;background:${nightMode ? '#555' : '#9E9E9E'};color:white;border:none;border-radius:6px;cursor:pointer;">${isEn() ? 'Cancel' : '取消'}</button>
            </div>
        `;
        
        aiModal.appendChild(modalContent);
        document.body.appendChild(aiModal);
        
        // 样式选择交互
        var styleOptions = modalContent.querySelectorAll('.ai-style-option');
        styleOptions.forEach(function(option) {
            option.onclick = function() {
                styleOptions.forEach(function(opt) {
                    opt.classList.remove('selected');
                    opt.style.border = '1px solid ' + borderColor;
                    opt.style.background = 'transparent';
                });
                this.classList.add('selected');
                this.style.border = '2px solid #4a90e2';
                this.style.background = nightMode ? '#3d3d3d' : '#f0f4ff';
                currentAISettings.style = this.getAttribute('data-value');
            };
        });
        
        // 取消按钮
        modalContent.querySelector('#cancelAIBtn').onclick = function() {
            aiModal.remove();
        };
        
        // 开始排版按钮
        modalContent.querySelector('#startAILayoutBtn').onclick = function() {
            var requirements = modalContent.querySelector('#aiRequirements').value;
            currentAISettings.requirements = requirements;
            
            // 关闭当前对话框
            aiModal.remove();
            
            // 如果有父级对话框（打印设置），也关闭它
            if (parentModal) {
                if (cleanupFunc) cleanupFunc();
                parentModal.remove();
            }
            
            // 开始AI排版流程
            startAILayout();
        };
        
        // 点击外部关闭
        aiModal.addEventListener('click', function(e) {
            if (e.target === aiModal) aiModal.remove();
        });
    }

    function showAILoadingModal() {
        var nightMode = g('nightMode') === true;
        var loadingModal = document.createElement('div');
        loadingModal.id = 'aiLoadingModal';
        loadingModal.className = 'modal-overlay';
        loadingModal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;z-index:10005;backdrop-filter:blur(5px);';
        
        var content = document.createElement('div');
        content.style.cssText = 'background:' + (nightMode ? '#2d2d2d' : 'white') + ';color:' + (nightMode ? '#eee' : '#333') + ';border-radius:16px;padding:40px;width:90%;max-width:400px;text-align:center;box-shadow:0 10px 30px rgba(0,0,0,0.3);';
        
        content.innerHTML = `
            <div style="margin-bottom:25px;position:relative;height:60px;">
                <div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:50px;height:50px;border-radius:50%;border:3px solid transparent;border-top-color:#4a90e2;animation:spin 1s linear infinite;"></div>
                <div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:30px;height:30px;border-radius:50%;border:3px solid transparent;border-top-color:#3a7bc8;animation:spin 1.5s linear infinite reverse;"></div>
                <i class="fas fa-magic" style="font-size:20px;color:#4a90e2;position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);"></i>
            </div>
            <h3 style="margin:0 0 10px 0;font-size:20px;">${isEn() ? 'AI is thinking...' : 'AI正在思考中...'}</h3>
            <p id="aiLoadingStatus" style="margin:0;color:${nightMode ? '#aaa' : '#666'};font-size:14px;">${isEn() ? 'Analyzing document structure' : '正在分析文档结构'}</p>
            <style>@keyframes spin { 0% { transform: translate(-50%,-50%) rotate(0deg); } 100% { transform: translate(-50%,-50%) rotate(360deg); } }</style>
        `;
        
        loadingModal.appendChild(content);
        document.body.appendChild(loadingModal);
    }

    function updateAILoadingStatus(text) {
        var statusEl = document.getElementById('aiLoadingStatus');
        if (statusEl) statusEl.textContent = text;
    }

    async function startAILayout() {
        showAILoadingModal();
        
        try {
            // 1. 获取当前文档内容
            var content = g('vditor') ? g('vditor').getValue() : '';
            if (!content) {
                throw new Error(isEn() ? 'Document content is empty' : '文档内容为空');
            }
            
            // 2. 准备提示词
            var stylePrompts = {
                academic: isEn() ? 'Please reformat the following Markdown content into academic paper style. Do not modify the content text in any way, no matter how casual the content is.' : '请将以下Markdown内容重新排版为学术论文风格。不得对内容文本进行任何修改，无论内容多么随意。',
                business: isEn() ? 'Please reformat the following Markdown content into business document style. Do not modify the content text in any way, no matter how casual the content is.' : '请将以下Markdown内容重新排版为商务公文风格。不得对内容文本进行任何修改，无论内容多么随意。',
                creative: isEn() ? 'Please reformat the following Markdown content into creative design style. Do not modify the content text in any way, no matter how casual the content is.' : '请将以下Markdown内容重新排版为创意设计风格。不得对内容文本进行任何修改，无论内容多么随意。',
                simple: isEn() ? 'Please reformat the following Markdown content into simple reading style. Do not modify the content text in any way, no matter how casual the content is.' : '请将以下Markdown内容重新排版为极简阅读风格。不得对内容文本进行任何修改，无论内容多么随意。'
            };
            
            var prompt = stylePrompts[currentAISettings.style] || stylePrompts.academic;
            if (currentAISettings.requirements) {
                prompt += '\n' + (isEn() ? 'Additional requirements: ' : '额外要求：') + currentAISettings.requirements;
            }
            
            // 3. 调用通义千问API
            updateAILoadingStatus(isEn() ? 'AI may modify the document content, please review carefully' : 'AI可能会改变文档内容，请仔细审查后使用');
            var aiResponse = await callQwenAPI(content, prompt);
            
            updateAILoadingStatus(isEn() ? 'Generating preview...' : '正在生成预览...');
            
            // 4. 解析AI返回的内容
            // 假设AI返回的是Markdown格式
            var optimizedMarkdown = aiResponse;
            
            // 5. 将Markdown转换为HTML用于预览
            // 简单的Markdown转HTML处理，用于快速预览
            // 打印时会再次处理
            var previewHtml = await convertSimpleMarkdown(optimizedMarkdown);
            
            // 6. 显示预览对比界面
            showAILayoutPreview(optimizedMarkdown, previewHtml);
            
            var loadingModal = document.getElementById('aiLoadingModal');
            if (loadingModal) loadingModal.remove();
            
        } catch (error) {
            console.error('AI排版错误:', error);
            var loadingModal = document.getElementById('aiLoadingModal');
            if (loadingModal) loadingModal.remove();
            
            if (error.message === 'Failed to fetch' || error.message.includes('NetworkError')) {
                if (global.showNetworkErrorBanner) {
                    global.showNetworkErrorBanner();
                } else {
                    global.showMessage(isEn() ? 'Network not connected, please connect to the network' : '网络未连接，请连接网络', 'error');
                }
            } else {
                global.showMessage((isEn() ? 'AI layout failed: ' : 'AI排版失败: ') + error.message, 'error');
            }
        }
    }

    async function callQwenAPI(content, systemPrompt) {
        // 构建请求体
        var requestBody = {
            model: "deepseek-v4-pro", // 使用deepseek模型
            input: {
                messages: [
                    {
                        role: "system",
                        content: systemPrompt + "\n" + (isEn() ? 'Please directly return the formatted Markdown content. Do not modify the content text in any way, no matter how casual the content is. Do not include any explanations, preambles, or postscripts. Do not wrap with code blocks.' : '请直接返回排版后的Markdown内容，不得对内容文本进行任何修改，无论内容多么随意。不要包含任何解释、前言或后语。不要使用代码块包裹。')
                    },
                    {
                        role: "user",
                        content: content
                    }
                ]
            },
            parameters: {
                result_format: "message"
            }
        };

        // 调用后端代理接口
        try {
            var apiUrl = (global.getApiBaseUrl ? global.getApiBaseUrl() : 'api') + '/ai/layout';
            
            // 如果后端没有专门的AI接口，我们可以暂时模拟或者使用一个通用的处理接口
            // 这里假设后端有一个处理AI请求的接口
            var response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + (g('currentUser') ? (g('currentUser').token || g('currentUser').username) : '')
                },
                body: JSON.stringify({
                    content: content,
                    style: currentAISettings.style,
                    requirements: currentAISettings.requirements
                })
            });
            
            var result = await response.json();
            
            if (result.code === 200 && result.data) {
                return result.data;
            } else {
                // 如果API调用失败，抛出错误
                throw new Error(result.message || (isEn() ? 'AI service temporarily unavailable' : 'AI服务暂时不可用'));
            }
        } catch (e) {
            // 如果后端接口不存在
             throw e;
        }
    }
    
    // 简单的Markdown转HTML，用于AI预览
    async function convertSimpleMarkdown(markdown) {
        // 使用现有的 formatForPrint 函数，但使用默认设置
        if (global.preparePrintContent) {
            var settings = {
                titleFontSize: 24,
                bodyFontSize: 12,
                pageMargin: 15,
                lineHeight: 1.5,
                paragraphSpacing: 0.8,
                titleSpacing: 1.0,
                alignment: 'justify',
                titleAlignment: 'center',
                fitToPage: false,
                indentParagraph: true
            };
            return await global.preparePrintContent(markdown, settings);
        }
        return markdown; // 降级处理
    }

    async function showAILayoutPreview(markdown, html) {
        var nightMode = g('nightMode') === true;
        var previewModal = null;

        var cleanup = function() {
            if (previewModal) previewModal.remove();
        };
        
        // Use default print settings for AI preview
        var settings = {
            titleFontSize: 24,
            bodyFontSize: 12,
            pageMargin: 15,
            lineHeight: 1.5,
            paragraphSpacing: 0.8,
            titleSpacing: 1.0,
            alignment: 'justify',
            titleAlignment: 'center',
            fitToPage: false,
            indentParagraph: true
        };
        
        // Show loading modal while generating PDF
        var loadingModal = document.createElement('div');
        loadingModal.className = 'modal-overlay';
        loadingModal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.9);z-index:21000;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;';
        loadingModal.innerHTML = '<div style="background:' + (nightMode ? '#2d2d2d' : 'white') + ';color:' + (nightMode ? '#eee' : '#333') + ';border-radius:12px;padding:30px;text-align:center;"><div style="font-size:24px;margin-bottom:15px;"><i class="fas fa-spinner fa-spin"></i></div><div style="font-size:16px;">' + (isEn() ? 'Generating AI layout preview...' : '正在生成AI排版预览...') + '</div></div>';
        document.body.appendChild(loadingModal);

        try {
            // 懒加载 PDF 生成器
            const { generatePDF, renderPDF } = await getPDFGenerator();

            var pdfUrl = await generatePDF(html, settings);

            loadingModal.remove();

            previewModal = document.createElement('div');
            previewModal.className = 'modal-overlay';
            previewModal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.9);z-index:10003;display:flex;flex-direction:column;align-items:stretch;justify-content:stretch;padding:0;';

            var previewContent = document.createElement('div');
            previewContent.style.cssText = 'background:' + (nightMode ? '#1a1a1a' : '#f0f0f0') + ';border-radius:0;display:flex;flex-direction:column;flex:1;box-shadow:none;border:none;min-height:0;';

            var closeBtn = document.createElement('button');
            closeBtn.innerHTML = '<i class="fas fa-times"></i>';
            closeBtn.style.cssText = 'position:absolute;top:10px;right:10px;background:' + (nightMode ? '#333' : '#fff') + ';border:1px solid ' + (nightMode ? '#555' : '#ddd') + ';color:#666;font-size:16px;cursor:pointer;padding:8px;border-radius:4px;z-index:10;';

            // Document container
            var docContainer = document.createElement('div');
            docContainer.style.cssText = 'flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;overflow:auto;padding:20px;min-height:0;';

            var pagesWrapper = document.createElement('div');
            pagesWrapper.style.cssText = 'display:flex;flex-direction:column;gap:20px;align-items:center;width:100%;max-width:800px;';

            docContainer.appendChild(pagesWrapper);

            // Render PDF
            await renderPDF(pdfUrl, pagesWrapper);
            
            // Bottom action buttons
            var buttonContainer = document.createElement('div');
            buttonContainer.style.cssText = 'display:flex;gap:8px;padding:12px;background:' + (nightMode ? '#2d2d2d' : '#f8f9fa') + ';border-top:1px solid ' + (nightMode ? '#444' : '#eee') + ';justify-content:flex-end;';

            // 1. 补充需求 (Regenerate)
            var refineBtn = document.createElement('button');
            refineBtn.innerHTML = '<i class="fas fa-magic"></i> ' + (isEn() ? 'Refine' : '补充需求');
            refineBtn.style.cssText = 'padding:8px 16px;background:' + (nightMode ? '#444' : '#e0e0e0') + ';color:' + (nightMode ? '#eee' : '#333') + ';border:none;border-radius:4px;cursor:pointer;font-size:14px;';
            refineBtn.onclick = function() {
                cleanup();
                showAILayoutModifyDialog();
            };

            // 2. 打印 (Print)
            var printBtn = document.createElement('button');
            printBtn.innerHTML = '<i class="fas fa-print"></i> ' + (isEn() ? 'Print' : '打印');
            printBtn.style.cssText = 'padding:8px 16px;background:#4a90e2;color:white;border:none;border-radius:4px;cursor:pointer;font-size:14px;font-weight:bold;';
            printBtn.onclick = function() {
                // Use the new sendToPrint which accepts PDF URL
                global.sendToPrint(settings, pdfUrl);
            };

            // 3. 下载 (Download)
            var pdfBtn = document.createElement('button');
            pdfBtn.innerHTML = '<i class="fas fa-file-pdf"></i> ' + (isEn() ? 'Download' : '下载');
            pdfBtn.style.cssText = 'padding:8px 16px;background:#dc3545;color:white;border:none;border-radius:4px;cursor:pointer;font-size:14px;font-weight:bold;';
            pdfBtn.onclick = async function() {
                 try {
                    var filename = isEn() ? 'AI_Layout_Document.pdf' : 'AI排版文档.pdf';
                    if (window.nativeFileOps && window.nativeFileOps.isTauriRuntime()) {
                        await window.nativeFileOps.saveFile({ url: pdfUrl }, {
                            filename: filename,
                            mimeType: 'application/pdf'
                        });
                        return;
                    }

                    var a = document.createElement('a');
                    a.href = pdfUrl;
                    a.download = filename;
                    a.target = '_blank';
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                 } catch (error) {
                    global.showMessage((isEn() ? 'Download failed: ' : '下载失败: ') + ((error && error.message) || ''), 'error');
                 }
            };

            // 4. 关闭 (Close)
            var cancelBtn = document.createElement('button');
            cancelBtn.innerHTML = '<i class="fas fa-times"></i> ' + (isEn() ? 'Close' : '关闭');
            cancelBtn.style.cssText = 'padding:8px 16px;background:' + (nightMode ? '#555' : '#6c757d') + ';color:white;border:none;border-radius:4px;cursor:pointer;font-size:14px;';
            cancelBtn.onclick = cleanup;

            buttonContainer.appendChild(refineBtn);
            buttonContainer.appendChild(printBtn);
            buttonContainer.appendChild(pdfBtn);
            buttonContainer.appendChild(cancelBtn);

            previewContent.appendChild(closeBtn);
            previewContent.appendChild(docContainer);
            previewContent.appendChild(buttonContainer);
            previewModal.appendChild(previewContent);
            document.body.appendChild(previewModal);
            
            closeBtn.onclick = cleanup;
            previewModal.addEventListener('click', function(e) {
                if (e.target === previewModal) cleanup();
            });

        } catch (error) {
            console.error('AI预览生成错误:', error);
            if (loadingModal.parentNode) loadingModal.remove();
            global.showMessage((isEn() ? 'AI preview generation failed: ' : 'AI预览生成失败: ') + error.message, 'error');
        }
    }

    function showAILayoutModifyDialog() {
        // 重新显示设置对话框，保留之前的设置
        showAILayoutDialog(null, null, null);
        
        // 填充之前的要求
        setTimeout(function() {
            var reqInput = document.getElementById('aiRequirements');
            if (reqInput && currentAISettings.requirements) {
                reqInput.value = currentAISettings.requirements;
            }
            
            // 选中之前的风格
            var styleOptions = document.querySelectorAll('.ai-style-option');
            styleOptions.forEach(function(opt) {
                if (opt.getAttribute('data-value') === currentAISettings.style) {
                    opt.click();
                }
            });
        }, 100);
    }

    global.showAILayoutDialog = showAILayoutDialog;
    global.startAILayout = startAILayout;
    global.callQwenAPI = callQwenAPI;

})(typeof window !== 'undefined' ? window : this);
