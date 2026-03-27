/**
 * PPT生成器模块
 * 支持：大纲生成 -> 分页预览 -> 单页重新生成 -> HTML转PPTX -> 下载
 */

(function(global) {
    'use strict';

    function g(name) { return global[name]; }
    function isEn() { return window.i18n && window.i18n.getLanguage() === 'en'; }

    // PPT生成状态
    var pptState = {
        outline: null,           // 大纲数据
        pages: [],              // 每页HTML内容
        currentPage: 0,         // 当前编辑的页面
        isGenerating: false,    // 是否正在生成
        ratio: '16:9',          // PPT比例
        topic: '',              // 主题
        cacheKey: '.ppt_draft_' // 缓存键前缀
    };

    // 动态加载html-to-pptx库
    var htmlToPptxLoaded = false;
    var htmlToPptxLoading = false;

    async function loadHtmlToPptx() {
        if (htmlToPptxLoaded) return true;
        if (htmlToPptxLoading) {
            // 等待加载完成
            while (htmlToPptxLoading) {
                await new Promise(r => setTimeout(r, 100));
            }
            return htmlToPptxLoaded;
        }

        htmlToPptxLoading = true;
        try {
            // 动态导入html-to-pptx
            const module = await import('html-to-pptx');
            global.HtmlToPptx = module.default || module;
            htmlToPptxLoaded = true;
            return true;
        } catch (e) {
            console.error('Failed to load html-to-pptx:', e);
            return false;
        } finally {
            htmlToPptxLoading = false;
        }
    }

    // 显示PPT生成器面板
    function showPPTGenerator() {
        // 检查是否有缓存的草稿
        checkCachedDraft();
        
        var modal = document.getElementById('pptGeneratorModal');
        if (!modal) {
            createPPTGeneratorUI();
            modal = document.getElementById('pptGeneratorModal');
        }
        
        modal.style.display = 'flex';
        showPPTStep('input');
    }

    // 创建PPT生成器UI
    function createPPTGeneratorUI() {
        var nightMode = g('nightMode') === true;
        var bg = nightMode ? '#2d2d2d' : 'white';
        var textColor = nightMode ? '#eee' : '#333';
        var borderColor = nightMode ? '#444' : '#ddd';

        var modal = document.createElement('div');
        modal.id = 'pptGeneratorModal';
        modal.className = 'modal-overlay';
        modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);display:none;align-items:center;justify-content:center;z-index:10003;backdrop-filter:blur(5px);';

        modal.innerHTML = `
            <div class="ppt-generator-modal" style="background:${bg};color:${textColor};border-radius:16px;width:95%;max-width:900px;max-height:90vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
                <!-- 头部 -->
                <div class="ppt-generator-header" style="padding:20px 25px;border-bottom:1px solid ${borderColor};display:flex;justify-content:space-between;align-items:center;flex-shrink:0;">
                    <div>
                        <h2 style="margin:0;font-size:22px;display:flex;align-items:center;gap:10px;">
                            <i class="fas fa-file-powerpoint" style="color:#e74c3c;"></i>
                            ${isEn() ? 'PPT Generator' : 'PPT生成器'}
                        </h2>
                        <p style="margin:5px 0 0 0;font-size:13px;color:${nightMode ? '#aaa' : '#666'};">
                            ${isEn() ? 'AI-powered PPT creation with preview' : 'AI驱动的PPT创建，支持实时预览'}
                        </p>
                    </div>
                    <button id="closePPTGenerator" style="background:none;border:none;font-size:24px;cursor:pointer;color:${nightMode ? '#aaa' : '#666'};padding:5px;border-radius:4px;transition:all 0.2s;">
                        <i class="fas fa-times"></i>
                    </button>
                </div>

                <!-- 内容区域 -->
                <div class="ppt-generator-content" style="flex:1;overflow-y:auto;padding:25px;">
                    <!-- 步骤1：输入主题/大纲 -->
                    <div id="pptStepInput" class="ppt-step">
                        <div style="margin-bottom:20px;">
                            <label style="display:block;margin-bottom:8px;font-weight:500;">${isEn() ? 'PPT Topic' : 'PPT主题'}</label>
                            <input type="text" id="pptTopicInput" placeholder="${isEn() ? 'Enter PPT topic...' : '输入PPT主题...'}" 
                                style="width:100%;padding:12px 15px;border:1px solid ${borderColor};border-radius:8px;font-size:15px;background:${nightMode ? '#3d3d3d' : 'white'};color:${textColor};">
                        </div>
                        
                        <div style="margin-bottom:20px;">
                            <label style="display:block;margin-bottom:8px;font-weight:500;">${isEn() ? 'Outline (Optional)' : '大纲（可选）'}</label>
                            <textarea id="pptOutlineInput" placeholder="${isEn() ? 'Enter outline or leave empty for AI generation...' : '输入大纲，留空则由AI生成...'}" 
                                style="width:100%;min-height:150px;padding:12px 15px;border:1px solid ${borderColor};border-radius:8px;font-size:14px;resize:vertical;background:${nightMode ? '#3d3d3d' : 'white'};color:${textColor};font-family:inherit;"></textarea>
                        </div>

                        <div style="margin-bottom:25px;">
                            <label style="display:block;margin-bottom:10px;font-weight:500;">${isEn() ? 'Aspect Ratio' : 'PPT比例'}</label>
                            <div style="display:flex;gap:15px;">
                                <label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:10px 15px;border:2px solid ${pptState.ratio === '16:9' ? '#4a90e2' : borderColor};border-radius:8px;transition:all 0.2s;" data-ratio="16:9">
                                    <input type="radio" name="pptRatioSelect" value="16:9" ${pptState.ratio === '16:9' ? 'checked' : ''} style="accent-color:#4a90e2;">
                                    <span>16:9</span>
                                </label>
                                <label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:10px 15px;border:2px solid ${pptState.ratio === '4:3' ? '#4a90e2' : borderColor};border-radius:8px;transition:all 0.2s;" data-ratio="4:3">
                                    <input type="radio" name="pptRatioSelect" value="4:3" ${pptState.ratio === '4:3' ? 'checked' : ''} style="accent-color:#4a90e2;">
                                    <span>4:3</span>
                                </label>
                            </div>
                        </div>

                        <button id="generatePPTOutline" style="width:100%;padding:14px;background:linear-gradient(135deg, #4a90e2 0%, #357abd 100%);color:white;border:none;border-radius:8px;font-size:16px;font-weight:500;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px;transition:all 0.3s;">
                            <i class="fas fa-magic"></i>
                            ${isEn() ? 'Generate Outline' : '生成大纲'}
                        </button>
                    </div>

                    <!-- 步骤2：大纲预览和编辑 -->
                    <div id="pptStepOutline" class="ppt-step" style="display:none;">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:15px;">
                            <h3 style="margin:0;">${isEn() ? 'Outline Preview' : '大纲预览'}</h3>
                            <button id="editOutlineBtn" style="padding:6px 12px;background:transparent;border:1px solid ${borderColor};border-radius:6px;cursor:pointer;font-size:13px;color:${textColor};">
                                <i class="fas fa-edit"></i> ${isEn() ? 'Edit' : '编辑'}
                            </button>
                        </div>
                        <div id="outlinePreview" style="background:${nightMode ? '#1e1e1e' : '#f8f9fa'};border:1px solid ${borderColor};border-radius:8px;padding:15px;max-height:300px;overflow-y:auto;font-size:14px;line-height:1.8;">
                            <!-- 大纲内容将在这里显示 -->
                        </div>
                        <div style="display:flex;gap:10px;margin-top:20px;">
                            <button id="backToInput" style="flex:1;padding:12px;background:transparent;border:1px solid ${borderColor};border-radius:8px;cursor:pointer;font-size:15px;color:${textColor};">
                                <i class="fas fa-arrow-left"></i> ${isEn() ? 'Back' : '返回'}
                            </button>
                            <button id="generatePages" style="flex:2;padding:12px;background:linear-gradient(135deg, #27ae60 0%, #219a52 100%);color:white;border:none;border-radius:8px;font-size:15px;font-weight:500;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;">
                                <i class="fas fa-play"></i> ${isEn() ? 'Generate Pages' : '生成页面'}
                            </button>
                        </div>
                    </div>

                    <!-- 步骤3：分页预览和编辑 -->
                    <div id="pptStepPages" class="ppt-step" style="display:none;">
                        <div style="display:flex;gap:15px;height:500px;">
                            <!-- 左侧页面列表 -->
                            <div style="width:200px;flex-shrink:0;display:flex;flex-direction:column;">
                                <h3 style="margin:0 0 10px 0;font-size:14px;">${isEn() ? 'Pages' : '页面列表'}</h3>
                                <div id="pagesList" style="flex:1;overflow-y:auto;border:1px solid ${borderColor};border-radius:8px;padding:10px;background:${nightMode ? '#1e1e1e' : '#f8f9fa'};">
                                    <!-- 页面缩略图列表 -->
                                </div>
                                <button id="addNewPage" style="margin-top:10px;padding:10px;background:transparent;border:1px dashed ${borderColor};border-radius:6px;cursor:pointer;font-size:13px;color:${nightMode ? '#aaa' : '#666'};display:flex;align-items:center;justify-content:center;gap:5px;">
                                    <i class="fas fa-plus"></i> ${isEn() ? 'Add Page' : '添加页面'}
                                </button>
                            </div>
                            
                            <!-- 右侧预览和编辑 -->
                            <div style="flex:1;display:flex;flex-direction:column;">
                                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                                    <span id="currentPageLabel" style="font-size:14px;color:${nightMode ? '#aaa' : '#666'};">Page 1 / 5</span>
                                    <div style="display:flex;gap:8px;">
                                        <button id="regenerateCurrentPage" style="padding:6px 12px;background:transparent;border:1px solid ${borderColor};border-radius:6px;cursor:pointer;font-size:12px;color:${textColor};display:flex;align-items:center;gap:5px;">
                                            <i class="fas fa-redo"></i> ${isEn() ? 'Regenerate' : '重新生成'}
                                        </button>
                                        <button id="editCurrentPage" style="padding:6px 12px;background:transparent;border:1px solid ${borderColor};border-radius:6px;cursor:pointer;font-size:12px;color:${textColor};display:flex;align-items:center;gap:5px;">
                                            <i class="fas fa-edit"></i> ${isEn() ? 'Edit' : '编辑'}
                                        </button>
                                    </div>
                                </div>
                                
                                <!-- 页面预览 -->
                                <div id="pagePreviewContainer" style="flex:1;border:1px solid ${borderColor};border-radius:8px;overflow:hidden;background:white;position:relative;">
                                    <div id="pagePreview" style="width:100%;height:100%;padding:30px;overflow:auto;box-sizing:border-box;color:#333;">
                                        <!-- 页面内容 -->
                                    </div>
                                    <!-- 加载遮罩 -->
                                    <div id="pageLoadingMask" style="display:none;position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);align-items:center;justify-content:center;z-index:10;">
                                        <div style="text-align:center;color:white;">
                                            <i class="fas fa-spinner fa-spin" style="font-size:32px;margin-bottom:10px;"></i>
                                            <p style="margin:0;">${isEn() ? 'Generating...' : '生成中...'}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <div style="display:flex;gap:10px;margin-top:20px;">
                            <button id="backToOutline" style="flex:1;padding:12px;background:transparent;border:1px solid ${borderColor};border-radius:8px;cursor:pointer;font-size:15px;color:${textColor};">
                                <i class="fas fa-arrow-left"></i> ${isEn() ? 'Back' : '返回'}
                            </button>
                            <button id="downloadPPT" style="flex:2;padding:12px;background:linear-gradient(135deg, #e74c3c 0%, #c0392b 100%);color:white;border:none;border-radius:8px;font-size:15px;font-weight:500;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;">
                                <i class="fas fa-download"></i> ${isEn() ? 'Download PPT' : '下载PPT'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        initPPTGeneratorEvents();
    }

    // 初始化事件监听
    function initPPTGeneratorEvents() {
        // 关闭按钮
        document.getElementById('closePPTGenerator').addEventListener('click', function() {
            // 保存草稿
            saveDraft();
            document.getElementById('pptGeneratorModal').style.display = 'none';
        });

        // 比例选择
        document.querySelectorAll('input[name="pptRatioSelect"]').forEach(function(radio) {
            radio.addEventListener('change', function() {
                pptState.ratio = this.value;
                updateRatioSelection();
            });
        });

        // 生成大纲
        document.getElementById('generatePPTOutline').addEventListener('click', generateOutline);

        // 编辑大纲
        document.getElementById('editOutlineBtn').addEventListener('click', function() {
            var outlineText = document.getElementById('pptOutlineInput').value;
            var newOutline = prompt(isEn() ? 'Edit outline:' : '编辑大纲：', outlineText);
            if (newOutline !== null) {
                document.getElementById('pptOutlineInput').value = newOutline;
                parseOutline(newOutline);
                renderOutlinePreview();
            }
        });

        // 返回输入
        document.getElementById('backToInput').addEventListener('click', function() {
            showPPTStep('input');
        });

        // 生成页面
        document.getElementById('generatePages').addEventListener('click', generateAllPages);

        // 返回大纲
        document.getElementById('backToOutline').addEventListener('click', function() {
            showPPTStep('outline');
        });

        // 添加新页面
        document.getElementById('addNewPage').addEventListener('click', addNewPage);

        // 重新生成当前页面
        document.getElementById('regenerateCurrentPage').addEventListener('click', regenerateCurrentPage);

        // 编辑当前页面
        document.getElementById('editCurrentPage').addEventListener('click', editCurrentPage);

        // 下载PPT
        document.getElementById('downloadPPT').addEventListener('click', downloadPPT);
    }

    // 更新比例选择UI
    function updateRatioSelection() {
        document.querySelectorAll('[data-ratio]').forEach(function(label) {
            var ratio = label.getAttribute('data-ratio');
            var nightMode = g('nightMode') === true;
            var borderColor = nightMode ? '#444' : '#ddd';
            label.style.borderColor = ratio === pptState.ratio ? '#4a90e2' : borderColor;
        });
    }

    // 显示指定步骤
    function showPPTStep(step) {
        document.getElementById('pptStepInput').style.display = 'none';
        document.getElementById('pptStepOutline').style.display = 'none';
        document.getElementById('pptStepPages').style.display = 'none';
        document.getElementById('pptStep' + step.charAt(0).toUpperCase() + step.slice(1)).style.display = 'block';
    }

    // 生成大纲
    async function generateOutline() {
        var topic = document.getElementById('pptTopicInput').value.trim();
        var outlineText = document.getElementById('pptOutlineInput').value.trim();
        
        if (!topic && !outlineText) {
            if (global.showMessage) {
                global.showMessage(isEn() ? 'Please enter topic or outline' : '请输入主题或大纲', 'error');
            }
            return;
        }

        pptState.topic = topic;
        
        var btn = document.getElementById('generatePPTOutline');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ' + (isEn() ? 'Generating...' : '生成中...');

        try {
            if (outlineText) {
                // 使用用户提供的大纲
                parseOutline(outlineText);
            } else {
                // 调用AI生成大纲
                var prompt = `请为主题"${topic}"生成一个PPT大纲，包含5-8页。每页包含标题和要点。比例：${pptState.ratio}。`;
                var result = await callAIAPI(prompt, '');
                document.getElementById('pptOutlineInput').value = result;
                parseOutline(result);
            }
            
            renderOutlinePreview();
            showPPTStep('outline');
            saveDraft();
        } catch (error) {
            if (global.showMessage) {
                global.showMessage(isEn() ? 'Generation failed: ' : '生成失败：' + error.message, 'error');
            }
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-magic"></i> ' + (isEn() ? 'Generate Outline' : '生成大纲');
        }
    }

    // 解析大纲
    function parseOutline(text) {
        var pages = [];
        var currentPage = null;
        
        var lines = text.split('\n');
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            if (!line) continue;
            
            // 匹配页面标题（支持多种格式）
            var pageMatch = line.match(/^\*\*第(\d+)页[：:]\s*(.+?)\*\*$/) || 
                           line.match(/^第(\d+)页[：:]\s*(.+)$/) ||
                           line.match(/^##?\s*第?(\d+)?[页\s]*[：:]?\s*(.+)$/);
            
            if (pageMatch) {
                if (currentPage) {
                    pages.push(currentPage);
                }
                currentPage = {
                    number: parseInt(pageMatch[1]) || pages.length + 1,
                    title: pageMatch[2].replace(/\*\*/g, '').trim(),
                    content: []
                };
            } else if (currentPage && line.startsWith('-')) {
                currentPage.content.push(line.substring(1).trim());
            } else if (currentPage && line) {
                currentPage.content.push(line);
            }
        }
        
        if (currentPage) {
            pages.push(currentPage);
        }
        
        pptState.outline = pages;
        pptState.pages = new Array(pages.length).fill(null);
    }

    // 渲染大纲预览
    function renderOutlinePreview() {
        var container = document.getElementById('outlinePreview');
        if (!pptState.outline || pptState.outline.length === 0) {
            container.innerHTML = '<p style="color:#999;text-align:center;">' + (isEn() ? 'No outline data' : '无大纲数据') + '</p>';
            return;
        }
        
        var html = '';
        for (var i = 0; i < pptState.outline.length; i++) {
            var page = pptState.outline[i];
            html += '<div style="margin-bottom:15px;padding:10px;background:' + (g('nightMode') ? '#2d2d2d' : 'white') + ';border-radius:6px;border-left:3px solid #4a90e2;">';
            html += '<strong style="color:#4a90e2;">第' + page.number + '页：</strong>' + page.title;
            if (page.content.length > 0) {
                html += '<ul style="margin:8px 0 0 0;padding-left:20px;">';
                for (var j = 0; j < page.content.length; j++) {
                    html += '<li>' + page.content[j] + '</li>';
                }
                html += '</ul>';
            }
            html += '</div>';
        }
        container.innerHTML = html;
    }

    // 生成所有页面
    async function generateAllPages() {
        if (!pptState.outline || pptState.outline.length === 0) {
            if (global.showMessage) {
                global.showMessage(isEn() ? 'Please generate outline first' : '请先生成大纲', 'error');
            }
            return;
        }

        showPPTStep('pages');
        renderPagesList();
        
        // 逐页生成
        for (var i = 0; i < pptState.outline.length; i++) {
            if (!pptState.pages[i]) {
                pptState.currentPage = i;
                updateCurrentPageLabel();
                showPageLoading(true);
                
                try {
                    await generatePage(i);
                    renderPagesList();
                    if (i === pptState.currentPage) {
                        renderPagePreview(i);
                    }
                    saveDraft();
                } catch (e) {
                    console.error('Failed to generate page ' + (i + 1), e);
                } finally {
                    showPageLoading(false);
                }
                
                // 延迟一下再生成下一页，避免请求过快
                await new Promise(r => setTimeout(r, 500));
            }
        }
        
        // 显示第一页
        selectPage(0);
    }

    // 生成单页
    async function generatePage(index) {
        var page = pptState.outline[index];
        var prompt = `请为PPT第${page.number}页生成HTML内容。
主题：${pptState.topic}
页面标题：${page.title}
要点：${page.content.join('\n')}

要求：
1. 使用简洁的HTML，只包含body内的内容
2. 使用内联样式，确保美观
3. 包含标题和要点内容
4. 适合${pptState.ratio}比例的PPT展示
5. 背景色使用白色，文字使用深色`;

        var html = await callAIAPI(prompt, '');
        
        // 清理HTML，只保留body内容
        html = html.replace(/<html[^>]*>|<\/html>/gi, '');
        html = html.replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '');
        html = html.replace(/<body[^>]*>|<\/body>/gi, '');
        html = html.replace(/```html?|```/g, '');
        
        pptState.pages[index] = html.trim();
    }

    // 渲染页面列表
    function renderPagesList() {
        var container = document.getElementById('pagesList');
        var html = '';
        
        for (var i = 0; i < pptState.outline.length; i++) {
            var page = pptState.outline[i];
            var isGenerated = pptState.pages[i] !== null;
            var isActive = i === pptState.currentPage;
            
            html += '<div class="page-thumbnail" data-index="' + i + '" style="padding:10px;margin-bottom:8px;border-radius:6px;cursor:pointer;transition:all 0.2s;' + 
                    (isActive ? 'background:#4a90e2;color:white;' : 'background:' + (g('nightMode') ? '#2d2d2d' : 'white') + ';border:1px solid ' + (g('nightMode') ? '#444' : '#ddd') + ';') + '">';
            html += '<div style="font-size:12px;font-weight:bold;">第' + page.number + '页</div>';
            html += '<div style="font-size:11px;opacity:0.8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + page.title + '</div>';
            html += '<div style="font-size:10px;margin-top:4px;">';
            html += isGenerated ? '<i class="fas fa-check-circle" style="color:' + (isActive ? 'white' : '#27ae60') + ';"></i> ' + (isEn() ? 'Ready' : '已生成') : '<i class="fas fa-clock" style="color:#999;"></i> ' + (isEn() ? 'Pending' : '待生成');
            html += '</div>';
            html += '</div>';
        }
        
        container.innerHTML = html;
        
        // 绑定点击事件
        container.querySelectorAll('.page-thumbnail').forEach(function(thumb) {
            thumb.addEventListener('click', function() {
                selectPage(parseInt(this.getAttribute('data-index')));
            });
        });
    }

    // 选择页面
    function selectPage(index) {
        pptState.currentPage = index;
        renderPagesList();
        renderPagePreview(index);
        updateCurrentPageLabel();
    }

    // 渲染页面预览
    function renderPagePreview(index) {
        var container = document.getElementById('pagePreview');
        var html = pptState.pages[index];
        
        if (!html) {
            container.innerHTML = '<p style="text-align:center;color:#999;padding-top:100px;">' + (isEn() ? 'Page not generated yet' : '页面尚未生成') + '</p>';
            return;
        }
        
        // 设置比例
        var aspectRatio = pptState.ratio === '16:9' ? '16/9' : '4/3';
        container.style.aspectRatio = aspectRatio;
        container.innerHTML = html;
    }

    // 更新当前页面标签
    function updateCurrentPageLabel() {
        var label = document.getElementById('currentPageLabel');
        label.textContent = 'Page ' + (pptState.currentPage + 1) + ' / ' + pptState.outline.length;
    }

    // 显示/隐藏页面加载
    function showPageLoading(show) {
        document.getElementById('pageLoadingMask').style.display = show ? 'flex' : 'none';
    }

    // 重新生成当前页面
    async function regenerateCurrentPage() {
        showPageLoading(true);
        try {
            await generatePage(pptState.currentPage);
            renderPagesList();
            renderPagePreview(pptState.currentPage);
            saveDraft();
            if (global.showMessage) {
                global.showMessage(isEn() ? 'Page regenerated' : '页面已重新生成', 'success');
            }
        } catch (e) {
            if (global.showMessage) {
                global.showMessage(isEn() ? 'Regeneration failed' : '重新生成失败', 'error');
            }
        } finally {
            showPageLoading(false);
        }
    }

    // 编辑当前页面
    function editCurrentPage() {
        var currentHtml = pptState.pages[pptState.currentPage] || '';
        var newHtml = prompt(isEn() ? 'Edit HTML content:' : '编辑HTML内容：', currentHtml);
        if (newHtml !== null) {
            pptState.pages[pptState.currentPage] = newHtml;
            renderPagePreview(pptState.currentPage);
            saveDraft();
        }
    }

    // 添加新页面
    function addNewPage() {
        var newPageNum = pptState.outline.length + 1;
        var title = prompt(isEn() ? 'Enter page title:' : '输入页面标题：');
        if (title) {
            pptState.outline.push({
                number: newPageNum,
                title: title,
                content: []
            });
            pptState.pages.push(null);
            renderPagesList();
            selectPage(pptState.outline.length - 1);
            saveDraft();
        }
    }

    // 下载PPT
    async function downloadPPT() {
        // 检查是否所有页面都已生成
        var ungeneratedPages = [];
        for (var i = 0; i < pptState.pages.length; i++) {
            if (!pptState.pages[i]) {
                ungeneratedPages.push(i + 1);
            }
        }
        
        if (ungeneratedPages.length > 0) {
            if (!confirm((isEn() ? 'Pages ' : '第') + ungeneratedPages.join(', ') + (isEn() ? ' are not generated yet. Continue?' : '页尚未生成，是否继续？'))) {
                return;
            }
        }

        var btn = document.getElementById('downloadPPT');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ' + (isEn() ? 'Loading library...' : '加载库中...');

        // 加载html-to-pptx库
        var loaded = await loadHtmlToPptx();
        if (!loaded) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-download"></i> ' + (isEn() ? 'Download PPT' : '下载PPT');
            if (global.showMessage) {
                global.showMessage(isEn() ? 'Failed to load PPT library' : '加载PPT库失败', 'error');
            }
            return;
        }

        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ' + (isEn() ? 'Generating PPT...' : '生成PPT中...');

        try {
            // 使用html-to-pptx生成PPT
            var pptx = global.HtmlToPptx || window.HtmlToPptx;
            if (!pptx) {
                throw new Error('HtmlToPptx not available');
            }

            // 创建PPT
            var presentation = new pptx();
            
            // 设置幻灯片大小
            var slideWidth = pptState.ratio === '16:9' ? 10 : 10;
            var slideHeight = pptState.ratio === '16:9' ? 5.625 : 7.5;
            presentation.defineSlideSize({ width: slideWidth, height: slideHeight });

            // 添加每页
            for (var i = 0; i < pptState.pages.length; i++) {
                if (pptState.pages[i]) {
                    var slide = presentation.addSlide();
                    
                    // 将HTML转换为PPT元素
                    // 这里简化处理，实际可能需要更复杂的转换
                    var tempDiv = document.createElement('div');
                    tempDiv.innerHTML = pptState.pages[i];
                    
                    // 提取文本内容
                    var text = tempDiv.textContent || tempDiv.innerText || '';
                    var lines = text.split('\n').filter(function(l) { return l.trim(); });
                    
                    if (lines.length > 0) {
                        // 第一行作为标题
                        slide.addText(lines[0], {
                            x: 0.5, y: 0.5, w: slideWidth - 1, h: 1,
                            fontSize: 24, bold: true, color: '363636'
                        });
                        
                        // 其余作为内容
                        if (lines.length > 1) {
                            slide.addText(lines.slice(1).join('\n'), {
                                x: 0.5, y: 1.5, w: slideWidth - 1, h: slideHeight - 2,
                                fontSize: 14, color: '666666'
                            });
                        }
                    }
                }
            }

            // 下载文件
            var fileName = (pptState.topic || 'PPT') + '.pptx';
            await presentation.writeFile({ fileName: fileName });

            if (global.showMessage) {
                global.showMessage(isEn() ? 'PPT downloaded successfully' : 'PPT下载成功', 'success');
            }
            
            // 清除草稿
            clearDraft();
        } catch (e) {
            console.error('Failed to generate PPT:', e);
            if (global.showMessage) {
                global.showMessage(isEn() ? 'PPT generation failed: ' : 'PPT生成失败：' + e.message, 'error');
            }
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-download"></i> ' + (isEn() ? 'Download PPT' : '下载PPT');
        }
    }

    // 保存草稿到localStorage
    function saveDraft() {
        var draft = {
            topic: pptState.topic,
            outline: pptState.outline,
            pages: pptState.pages,
            ratio: pptState.ratio,
            timestamp: new Date().toISOString()
        };
        localStorage.setItem(pptState.cacheKey + 'draft', JSON.stringify(draft));
    }

    // 加载草稿
    function loadDraft() {
        var draftStr = localStorage.getItem(pptState.cacheKey + 'draft');
        if (draftStr) {
            try {
                var draft = JSON.parse(draftStr);
                pptState.topic = draft.topic || '';
                pptState.outline = draft.outline || [];
                pptState.pages = draft.pages || [];
                pptState.ratio = draft.ratio || '16:9';
                
                document.getElementById('pptTopicInput').value = pptState.topic;
                document.getElementById('pptOutlineInput').value = draft.outline ? 
                    draft.outline.map(function(p) { 
                        return '**第' + p.number + '页：' + p.title + '**\n' + p.content.map(function(c) { return '- ' + c; }).join('\n');
                    }).join('\n\n') : '';
                
                // 更新比例选择
                var ratioRadio = document.querySelector('input[name="pptRatioSelect"][value="' + pptState.ratio + '"]');
                if (ratioRadio) {
                    ratioRadio.checked = true;
                    updateRatioSelection();
                }
                
                return true;
            } catch (e) {
                console.error('Failed to load draft:', e);
            }
        }
        return false;
    }

    // 清除草稿
    function clearDraft() {
        localStorage.removeItem(pptState.cacheKey + 'draft');
    }

    // 检查缓存的草稿
    function checkCachedDraft() {
        var draftStr = localStorage.getItem(pptState.cacheKey + 'draft');
        if (draftStr) {
            try {
                var draft = JSON.parse(draftStr);
                var time = new Date(draft.timestamp);
                var now = new Date();
                var hoursDiff = (now - time) / (1000 * 60 * 60);
                
                // 如果草稿在24小时内
                if (hoursDiff < 24) {
                    if (confirm((isEn() ? 'Found unsaved PPT draft from ' : '发现未保存的PPT草稿，创建于') + 
                               time.toLocaleString() + (isEn() ? '. Continue?' : '，是否继续编辑？'))) {
                        loadDraft();
                    } else {
                        clearDraft();
                    }
                } else {
                    clearDraft();
                }
            } catch (e) {
                clearDraft();
            }
        }
    }

    // 调用AI API
    async function callAIAPI(prompt, content) {
        var apiUrl = (global.getApiBaseUrl ? global.getApiBaseUrl() : '/api') + '/ai/generate';
        
        var response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + (g('currentUser') ? (g('currentUser').token || g('currentUser').username) : '')
            },
            body: JSON.stringify({
                prompt: prompt,
                content: content
            })
        });

        if (!response.ok) {
            throw new Error('API request failed: ' + response.status);
        }

        var result = await response.json();
        
        if (result.code === 200 && result.data) {
            return result.data;
        } else {
            throw new Error(result.message || 'Unknown error');
        }
    }

    // 导出到全局
    global.showPPTGenerator = showPPTGenerator;
    global.PPTGenerator = {
        show: showPPTGenerator,
        saveDraft: saveDraft,
        loadDraft: loadDraft,
        clearDraft: clearDraft
    };

})(typeof window !== 'undefined' ? window : this);
