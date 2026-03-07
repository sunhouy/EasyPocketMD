
(function(global) {
    'use strict';

    function g(name) { return global[name]; }

    // AI智能排版历史记录
    var aiLayoutHistory = [];
    // 当前AI排版设置
    var currentAISettings = {
        style: 'academic',
        format: 'standard'
    };

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
                <div style="font-size:40px;margin-bottom:10px;background:linear-gradient(135deg, #667eea 0%, #764ba2 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;">
                    <i class="fas fa-magic"></i>
                </div>
                <h2 style="margin:0;">AI智能排版</h2>
                <p style="margin-top:5px;font-size:14px;color:${nightMode ? '#aaa' : '#666'};">基于通义千问大模型，一键优化文档排版</p>
            </div>
            
            <div style="margin-bottom:20px;">
                <label style="display:block;margin-bottom:8px;font-weight:bold;">排版风格</label>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                    <div class="ai-style-option selected" data-value="academic" style="border:2px solid #667eea;border-radius:8px;padding:10px;cursor:pointer;background:${nightMode ? '#3d3d3d' : '#f0f4ff'};">
                        <div style="font-weight:bold;margin-bottom:5px;"><i class="fas fa-graduation-cap"></i> 学术论文</div>
                        <div style="font-size:12px;color:${nightMode ? '#bbb' : '#666'};">严谨规范，适合论文、报告</div>
                    </div>
                    <div class="ai-style-option" data-value="business" style="border:1px solid ${borderColor};border-radius:8px;padding:10px;cursor:pointer;">
                        <div style="font-weight:bold;margin-bottom:5px;"><i class="fas fa-briefcase"></i> 商务公文</div>
                        <div style="font-size:12px;color:${nightMode ? '#bbb' : '#666'};">正式专业，适合公文、标书</div>
                    </div>
                    <div class="ai-style-option" data-value="creative" style="border:1px solid ${borderColor};border-radius:8px;padding:10px;cursor:pointer;">
                        <div style="font-weight:bold;margin-bottom:5px;"><i class="fas fa-paint-brush"></i> 创意设计</div>
                        <div style="font-size:12px;color:${nightMode ? '#bbb' : '#666'};">美观大方，适合文章、博客</div>
                    </div>
                    <div class="ai-style-option" data-value="simple" style="border:1px solid ${borderColor};border-radius:8px;padding:10px;cursor:pointer;">
                        <div style="font-weight:bold;margin-bottom:5px;"><i class="fas fa-feather"></i> 极简阅读</div>
                        <div style="font-size:12px;color:${nightMode ? '#bbb' : '#666'};">清晰易读，适合阅读、笔记</div>
                    </div>
                </div>
            </div>
            
            <div style="margin-bottom:20px;">
                <label style="display:block;margin-bottom:8px;font-weight:bold;">排版要求（可选）</label>
                <textarea id="aiRequirements" placeholder="例如：请将所有一级标题居中，段落首行缩进，使用宋体..." style="width:100%;padding:10px;border:1px solid ${borderColor};border-radius:8px;background:${nightMode ? '#3d3d3d' : 'white'};color:${textColor};height:80px;resize:none;"></textarea>
            </div>
            
            <div style="display:flex;gap:10px;margin-top:25px;">
                <button id="startAILayoutBtn" style="flex:2;padding:12px;font-weight:bold;background:linear-gradient(135deg, #667eea 0%, #764ba2 100%);color:white;border:none;border-radius:6px;cursor:pointer;font-size:16px;">
                    <i class="fas fa-sparkles"></i> 开始智能排版
                </button>
                <button id="cancelAIBtn" style="flex:1;padding:12px;background:${nightMode ? '#555' : '#9E9E9E'};color:white;border:none;border-radius:6px;cursor:pointer;">取消</button>
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
                this.style.border = '2px solid #667eea';
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
                <div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:50px;height:50px;border-radius:50%;border:3px solid transparent;border-top-color:#667eea;animation:spin 1s linear infinite;"></div>
                <div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:30px;height:30px;border-radius:50%;border:3px solid transparent;border-top-color:#764ba2;animation:spin 1.5s linear infinite reverse;"></div>
                <i class="fas fa-magic" style="font-size:20px;color:#667eea;position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);"></i>
            </div>
            <h3 style="margin:0 0 10px 0;font-size:20px;">AI正在思考中...</h3>
            <p id="aiLoadingStatus" style="margin:0;color:${nightMode ? '#aaa' : '#666'};font-size:14px;">正在分析文档结构</p>
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
                throw new Error('文档内容为空');
            }
            
            // 2. 准备提示词
            var stylePrompts = {
                academic: '请将以下Markdown内容重新排版为学术论文风格。要求：标题清晰分级，段落结构严谨，适当使用加粗强调关键概念。',
                business: '请将以下Markdown内容重新排版为商务公文风格。要求：格式规范，条理清晰，语气正式，重点突出。',
                creative: '请将以下Markdown内容重新排版为创意设计风格。要求：排版活泼，富有设计感，适当使用引用和列表增强可读性。',
                simple: '请将以下Markdown内容重新排版为极简阅读风格。要求：去除冗余格式，保留核心内容，段落短小精悍，便于快速阅读。'
            };
            
            var prompt = stylePrompts[currentAISettings.style] || stylePrompts.academic;
            if (currentAISettings.requirements) {
                prompt += '\n额外要求：' + currentAISettings.requirements;
            }
            
            // 3. 调用通义千问API
            updateAILoadingStatus('正在连接通义千问大模型...');
            var aiResponse = await callQwenAPI(content, prompt);
            
            updateAILoadingStatus('正在生成排版预览...');
            
            // 4. 解析AI返回的内容
            // 假设AI返回的是Markdown格式
            var optimizedMarkdown = aiResponse;
            
            // 5. 将Markdown转换为HTML用于预览
            // 这里我们使用简单的转换或复用现有的转换逻辑
            // 为了预览效果，我们需要将Markdown转换为HTML
            // 这里可以使用 formatForPrint 但需要一些适配
            
            // 简单的Markdown转HTML处理，用于快速预览
            // 实际打印时会再次处理
            var previewHtml = await convertSimpleMarkdown(optimizedMarkdown);
            
            // 6. 显示预览对比界面
            var loadingModal = document.getElementById('aiLoadingModal');
            if (loadingModal) loadingModal.remove();
            
            showAILayoutPreview(optimizedMarkdown, previewHtml);
            
        } catch (error) {
            console.error('AI排版错误:', error);
            var loadingModal = document.getElementById('aiLoadingModal');
            if (loadingModal) loadingModal.remove();
            
            global.showMessage('AI排版失败: ' + error.message, 'error');
        }
    }

    async function callQwenAPI(content, systemPrompt) {
        // 构建请求体
        var requestBody = {
            model: "qwen-turbo", // 使用通义千问模型
            input: {
                messages: [
                    {
                        role: "system",
                        content: systemPrompt + "\n请直接返回排版后的Markdown内容，不要包含任何解释、前言或后语。不要使用代码块包裹。"
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
        // 注意：这里需要后端实现一个代理接口来转发请求到阿里云，以隐藏API Key
        // 或者使用通用的AI处理接口
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
                throw new Error(result.message || 'AI服务暂时不可用');
            }
        } catch (e) {
            // 如果后端接口不存在（开发阶段），我们可以模拟一个响应
            // console.warn('AI接口调用失败，使用模拟数据:', e);
            // return content + "\n\n> [AI已优化排版 - 模拟模式]";
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

    function showAILayoutPreview(markdown, html) {
        var nightMode = g('nightMode') === true;
        
        // Define settings to match those used in convertSimpleMarkdown
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
        
        var previewModal = document.createElement('div');
        previewModal.className = 'modal-overlay';
        previewModal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.9);display:flex;flex-direction:column;z-index:10003;align-items:stretch;justify-content:stretch;padding:0;';
        
        var header = document.createElement('div');
        header.style.cssText = 'padding:15px 20px;background:' + (nightMode ? '#2d2d2d' : 'white') + ';border-bottom:1px solid ' + (nightMode ? '#444' : '#ddd') + ';display:flex;justify-content:space-between;align-items:center;z-index:100;flex-shrink:0;';
        
        header.innerHTML = `
            <div style="display:flex;align-items:center;gap:15px;">
                <h3 style="margin:0;color:${nightMode ? '#eee' : '#333'};"><i class="fas fa-magic" style="color:#667eea;margin-right:10px;"></i>AI排版预览</h3>
                <span style="font-size:12px;padding:3px 8px;background:${nightMode ? '#3d3d3d' : '#f0f4ff'};color:#667eea;border-radius:4px;">${currentAISettings.style === 'academic' ? '学术风格' : currentAISettings.style === 'business' ? '商务风格' : currentAISettings.style === 'creative' ? '创意风格' : '极简风格'}</span>
            </div>
            <div style="display:flex;gap:10px;">
                <button id="regenerateBtn" style="padding:8px 15px;background:transparent;border:1px solid ${nightMode ? '#555' : '#ddd'};color:${nightMode ? '#eee' : '#333'};border-radius:6px;cursor:pointer;">
                    <i class="fas fa-redo"></i> 重新生成
                </button>
                <button id="applyAiBtn" style="padding:8px 20px;background:linear-gradient(135deg, #667eea 0%, #764ba2 100%);color:white;border:none;border-radius:6px;cursor:pointer;font-weight:bold;">
                    <i class="fas fa-check"></i> 应用并打印
                </button>
                <button id="closeAiPreviewBtn" style="padding:8px 15px;background:transparent;border:none;color:${nightMode ? '#aaa' : '#666'};cursor:pointer;font-size:18px;">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
        
        // Document container (adapted from print.js)
        var docContainer = document.createElement('div');
        docContainer.style.cssText = 'flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;overflow:auto;padding:20px;min-height:0;background:' + (nightMode ? '#1a1a1a' : '#f0f0f0') + ';';
        
        // Scaling variables
        var currentScale = 1.0;
        var initialDistance = 0;
        var a4Width = 595;
        var a4Height = 842;
        var a4Margin = settings.pageMargin;

        // Pages wrapper
        var pagesWrapper = document.createElement('div');
        pagesWrapper.style.cssText = 'display:flex;flex-direction:column;gap:20px;align-items:center;transform-origin:top center;';

        // Create page function
        function createPage() {
            var page = document.createElement('div');
            page.className = 'a4-page';
            page.style.cssText = 'width:' + a4Width + 'px;min-height:' + a4Height + 'px;background:white;box-shadow:0 2px 10px rgba(0,0,0,0.1);position:relative;border:1px solid #ccc;overflow:visible;';

            var contentDiv = document.createElement('div');
            contentDiv.style.cssText = 'width:100%;padding:' + a4Margin + 'mm;box-sizing:border-box;position:relative;';

            // Use global.getPrintStyles if available
            if (global.getPrintStyles) {
                var printStyles = global.getPrintStyles(settings);
                var styleElement = document.createElement('style');
                styleElement.textContent = printStyles;
                contentDiv.appendChild(styleElement);
            }

            page.appendChild(contentDiv);
            return { page: page, contentDiv: contentDiv };
        }

        // Create first page and content
        var { page: firstPage, contentDiv: firstContentDiv } = createPage();
        firstContentDiv.innerHTML += html;
        pagesWrapper.appendChild(firstPage);
        docContainer.appendChild(pagesWrapper);

        // Add page dividers
        function addPageDividers() {
            var marginPx = a4Margin * 3.78; // mm to px approx (1mm ≈ 3.78px)
            var usableHeight = a4Height - (marginPx * 2);
            var contentHeight = firstContentDiv.scrollHeight;
            var numPages = Math.ceil(contentHeight / usableHeight);

            if (numPages > 1) {
                for (var i = 1; i < numPages; i++) {
                    var divider = document.createElement('div');
                    divider.style.cssText = 'position:absolute;left:0;right:0;height:2px;background:linear-gradient(to right, transparent, #ff6b6b, transparent);z-index:10;';
                    divider.style.top = (usableHeight * i + marginPx) + 'px';
                    firstContentDiv.appendChild(divider);

                    var pageLabel = document.createElement('div');
                    pageLabel.style.cssText = 'position:absolute;left:50%;transform:translateX(-50%);top:' + ((usableHeight * i + marginPx) - 15) + 'px;font-size:11px;color:#ff6b6b;background:white;padding:2px 8px;border-radius:3px;z-index:11;';
                    pageLabel.textContent = '--- 第 ' + (i + 1) + '页开始 ---';
                    firstContentDiv.appendChild(pageLabel);
                }
            }
        }

        // Fit to screen
        function fitToScreen() {
            var containerWidth = docContainer.clientWidth - 40;
            var scale = Math.min(containerWidth / a4Width, 1.0);
            currentScale = scale;
            pagesWrapper.style.transform = 'scale(' + scale + ')';
        }

        // Event listeners for scaling (Touch)
        pagesWrapper.addEventListener('touchstart', function(e) {
            if (e.touches.length === 2) {
                e.preventDefault();
                var touch1 = e.touches[0];
                var touch2 = e.touches[1];
                initialDistance = Math.hypot(touch2.pageX - touch1.pageX, touch2.pageY - touch1.pageY);
            }
        });

        pagesWrapper.addEventListener('touchmove', function(e) {
            if (e.touches.length === 2 && initialDistance > 0) {
                e.preventDefault();
                var touch1 = e.touches[0];
                var touch2 = e.touches[1];
                var currentDistance = Math.hypot(touch2.pageX - touch1.pageX, touch2.pageY - touch1.pageY);
                var scale = currentDistance / initialDistance;
                var newScale = currentScale * scale;
                newScale = Math.min(3.0, Math.max(0.3, newScale));
                currentScale = newScale;
                pagesWrapper.style.transform = 'scale(' + newScale + ')';
            }
        });

        pagesWrapper.addEventListener('touchend', function(e) {
            if (e.touches.length < 2) {
                if (pagesWrapper.style.transform) {
                    var match = pagesWrapper.style.transform.match(/scale\(([^)]+)\)/);
                    if (match) currentScale = parseFloat(match[1]);
                }
                initialDistance = 0;
            }
        });
        
        previewModal.appendChild(header);
        previewModal.appendChild(docContainer);
        document.body.appendChild(previewModal);
        
        // Init layout
        setTimeout(function() {
            addPageDividers();
            fitToScreen();
        }, 100);
        window.addEventListener('resize', fitToScreen);

        // Cleanup function
        function cleanup() {
            window.removeEventListener('resize', fitToScreen);
        }
        
        // 绑定事件
        header.querySelector('#closeAiPreviewBtn').onclick = function() {
            cleanup();
            previewModal.remove();
        };
        
        header.querySelector('#regenerateBtn').onclick = function() {
            cleanup();
            previewModal.remove();
            showAILayoutModifyDialog();
        };
        
        header.querySelector('#applyAiBtn').onclick = function() {
            // 保存历史记录
            aiLayoutHistory.push({
                markdown: markdown,
                settings: JSON.parse(JSON.stringify(currentAISettings)),
                timestamp: new Date()
            });
            
            cleanup();
            // 直接进入打印流程
            previewModal.remove();
            printAILayout(html);
        };
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

    function printAILayout(htmlContent) {
        // 这里我们需要绕过常规的 formatForPrint，直接发送 HTML 到打印服务
        // 或者创建一个临时的打印预览
        
        // 我们可以复用 sendToPrint，但需要一种方式传递已生成的 HTML
        // 这里我们创建一个专门的打印函数
        
        if (!g('currentUser')) {
            global.showMessage('请先登录');
            return;
        }
        
        var username = g('currentUser').username;
        var userPassword = g('currentUser').password;
        var nightMode = g('nightMode') === true;
        
        // 显示发送状态
        var modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:10004;display:flex;align-items:center;justify-content:center;';
        
        var content = document.createElement('div');
        content.style.cssText = 'background:' + (nightMode ? '#2d2d2d' : 'white') + ';color:' + (nightMode ? '#eee' : '#333') + ';border-radius:12px;padding:30px;width:90%;max-width:400px;text-align:center;';
        
        content.innerHTML = `
            <h3 style="margin-top:0;">正在发送到打印机</h3>
            <p>AI排版文档正在处理中...</p>
            <div style="margin:20px 0;height:4px;background:#eee;border-radius:2px;overflow:hidden;">
                <div style="height:100%;background:#667eea;width:50%;animation:progress 2s infinite ease-in-out;"></div>
            </div>
            <style>@keyframes progress { 0% { width: 0%; transform: translateX(-100%); } 100% { width: 100%; transform: translateX(100%); } }</style>
        `;
        
        modal.appendChild(content);
        document.body.appendChild(modal);
        
        // 发送 WebSocket 请求
        var wsUrl = 'wss://print.yhsun.cn';
        var ws = new WebSocket(wsUrl);
        
        ws.onopen = function() {
            var fullHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>AI排版文档</title>
    <style>
        body { font-family: "SimSun", "宋体", serif; padding: 15mm; }
        /* 包含基本的打印样式 */
        img { max-width: 100%; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #ddd; padding: 8px; }
    </style>
</head>
<body>
    ${htmlContent}
</body>
</html>`;

            var printData = {
                type: 'print_request',
                username: username,
                password: userPassword,
                content: fullHtml,
                settings: { ai_layout: true, style: currentAISettings.style },
                timestamp: new Date().toISOString(),
                content_type: 'html'
            };
            
            ws.send(JSON.stringify(printData));
        };
        
        ws.onmessage = function(event) {
            try {
                var response = JSON.parse(event.data);
                if (response.type === 'print_queued') {
                    content.innerHTML = `
                        <div style="color:#28a745;font-size:48px;margin-bottom:15px;"><i class="fas fa-check-circle"></i></div>
                        <h3 style="margin:0;">发送成功</h3>
                        <p>文档已发送到打印客户端</p>
                        <button id="closePrintStatusBtn" style="margin-top:20px;padding:8px 20px;background:#667eea;color:white;border:none;border-radius:6px;cursor:pointer;">确定</button>
                    `;
                    document.getElementById('closePrintStatusBtn').onclick = function() {
                        modal.remove();
                    };
                } else if (response.type === 'error') {
                    throw new Error(response.message);
                }
            } catch (e) {
                content.innerHTML = `
                    <div style="color:#dc3545;font-size:48px;margin-bottom:15px;"><i class="fas fa-times-circle"></i></div>
                    <h3 style="margin:0;">发送失败</h3>
                    <p>${e.message || '未知错误'}</p>
                    <button id="closePrintStatusBtn" style="margin-top:20px;padding:8px 20px;background:#667eea;color:white;border:none;border-radius:6px;cursor:pointer;">关闭</button>
                `;
                document.getElementById('closePrintStatusBtn').onclick = function() {
                    modal.remove();
                };
            }
            ws.close();
        };
        
        ws.onerror = function() {
            content.innerHTML = `
                <div style="color:#dc3545;font-size:48px;margin-bottom:15px;"><i class="fas fa-exclamation-circle"></i></div>
                <h3 style="margin:0;">连接错误</h3>
                <p>无法连接到打印服务器</p>
                <button id="closePrintStatusBtn" style="margin-top:20px;padding:8px 20px;background:#667eea;color:white;border:none;border-radius:6px;cursor:pointer;">关闭</button>
            `;
            document.getElementById('closePrintStatusBtn').onclick = function() {
                modal.remove();
            };
        };
    }

    // 辅助函数：生成参考图HTML (用于AI分析)
    function generateReferenceHtml(content) {
        // ... 实现略 ...
        return content;
    }

    global.showAILayoutDialog = showAILayoutDialog;
    global.startAILayout = startAILayout;
    global.callQwenAPI = callQwenAPI;

})(typeof window !== 'undefined' ? window : this);
