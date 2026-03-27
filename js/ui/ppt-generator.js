/**
 * PPT生成器模块 - 整合到AI助手
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

    // 初始化PPT生成器（在AI助手的PPT菜单中调用）
    function initPPTGenerator() {
        // 检查是否有缓存的草稿
        checkCachedDraft();
        
        // 初始化事件
        initPPTGeneratorEvents();
        
        // 显示输入步骤
        showPPTStep('input');
    }

    // 初始化事件监听
    function initPPTGeneratorEvents() {
        // 比例选择
        document.querySelectorAll('input[name="pptRatio"]').forEach(function(radio) {
            radio.addEventListener('change', function() {
                pptState.ratio = this.value;
            });
        });

        // 生成大纲按钮
        var generateOutlineBtn = document.getElementById('aiPPTGenerateOutline');
        if (generateOutlineBtn) {
            generateOutlineBtn.addEventListener('click', generateOutline);
        }

        // 编辑大纲按钮
        var editOutlineBtn = document.getElementById('aiPPTEEditOutline');
        if (editOutlineBtn) {
            editOutlineBtn.addEventListener('click', function() {
                showCustomPrompt(isEn() ? 'Edit outline:' : '编辑大纲：', 
                    document.getElementById('aiPPTInput').value,
                    function(newOutline) {
                        if (newOutline !== null) {
                            document.getElementById('aiPPTInput').value = newOutline;
                            parseOutline(newOutline);
                            renderOutlinePreview();
                        }
                    }
                );
            });
        }

        // 返回输入按钮
        var backToInputBtn = document.getElementById('aiPPTBackToInput');
        if (backToInputBtn) {
            backToInputBtn.addEventListener('click', function() {
                showPPTStep('input');
            });
        }

        // 生成页面按钮
        var generatePagesBtn = document.getElementById('aiPPTGeneratePages');
        if (generatePagesBtn) {
            generatePagesBtn.addEventListener('click', generateAllPages);
        }

        // 返回大纲按钮
        var backToOutlineBtn = document.getElementById('aiPPTBackToOutline');
        if (backToOutlineBtn) {
            backToOutlineBtn.addEventListener('click', function() {
                showPPTStep('outline');
            });
        }

        // 添加新页面按钮
        var addPageBtn = document.getElementById('aiPPTAddPage');
        if (addPageBtn) {
            addPageBtn.addEventListener('click', addNewPage);
        }

        // 重新生成当前页面按钮
        var regenerateBtn = document.getElementById('aiPPTRegeneratePage');
        if (regenerateBtn) {
            regenerateBtn.addEventListener('click', regenerateCurrentPage);
        }

        // 编辑当前页面按钮
        var editPageBtn = document.getElementById('aiPPTEditPage');
        if (editPageBtn) {
            editPageBtn.addEventListener('click', editCurrentPage);
        }

        // 下载PPT按钮
        var downloadBtn = document.getElementById('aiPPTDownload');
        if (downloadBtn) {
            downloadBtn.addEventListener('click', downloadPPT);
        }
    }

    // 显示指定步骤
    function showPPTStep(step) {
        var inputSection = document.getElementById('aiPPTInputSection');
        var outlineSection = document.getElementById('aiPPTOutlineSection');
        var pagesSection = document.getElementById('aiPPTPagesSection');
        
        if (inputSection) inputSection.style.display = step === 'input' ? 'block' : 'none';
        if (outlineSection) outlineSection.style.display = step === 'outline' ? 'block' : 'none';
        if (pagesSection) pagesSection.style.display = step === 'pages' ? 'block' : 'none';
    }

    // 生成大纲
    async function generateOutline() {
        var input = document.getElementById('aiPPTInput').value.trim();
        var topic = '';
        
        // 尝试从输入中提取主题
        if (input) {
            var lines = input.split('\n');
            topic = lines[0].replace(/^#+\s*/, '').substring(0, 50);
        }
        
        if (!topic && !input) {
            if (global.showMessage) {
                global.showMessage(isEn() ? 'Please enter topic or outline' : '请输入主题或大纲', 'error');
            }
            return;
        }

        pptState.topic = topic;
        
        var btn = document.getElementById('aiPPTGenerateOutline');
        var originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ' + (isEn() ? 'Generating...' : '生成中...');

        try {
            if (input && input.includes('第') && input.includes('页')) {
                // 使用用户提供的大纲
                parseOutline(input);
            } else {
                // 调用AI生成大纲
                var prompt = `请为主题"${topic || input}"生成一个详细的PPT大纲，包含5-8页。

重要要求：
1. 每页的标题必须是具体的、有意义的标题，不能只是"标题"二字
2. 标题应该概括该页的核心内容
3. 每页包含2-4个要点，每个要点要具体
4. 第一页通常是封面或概述页

格式要求：
**第1页：封面/概述标题**
- 要点1：具体内容
- 要点2：具体内容

**第2页：具体章节标题**
- 要点1：具体内容
- 要点2：具体内容

请确保每个标题都是有意义的，能够清晰表达该页的主题。`;
                
                var result = await callAIAPI(prompt, '');
                document.getElementById('aiPPTInput').value = result;
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
            btn.innerHTML = originalText;
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
        var container = document.getElementById('aiPPTOutlinePreview');
        if (!container) return;
        
        if (!pptState.outline || pptState.outline.length === 0) {
            container.innerHTML = '<p style="color:#999;text-align:center;padding:20px;">' + (isEn() ? 'No outline data' : '无大纲数据') + '</p>';
            return;
        }
        
        var nightMode = g('nightMode') === true;
        var html = '';
        for (var i = 0; i < pptState.outline.length; i++) {
            var page = pptState.outline[i];
            html += '<div style="margin-bottom:15px;padding:12px;background:' + (nightMode ? '#2d2d2d' : '#f8f9fa') + ';border-radius:8px;border-left:3px solid #4a90e2;">';
            html += '<strong style="color:#4a90e2;">第' + page.number + '页：</strong>' + escapeHtml(page.title);
            if (page.content.length > 0) {
                html += '<ul style="margin:8px 0 0 0;padding-left:20px;">';
                for (var j = 0; j < page.content.length; j++) {
                    html += '<li>' + escapeHtml(page.content[j]) + '</li>';
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
        
        // 检查标题是否是默认的"标题"，如果是则让AI生成一个更好的标题
        var pageTitle = page.title;
        if (pageTitle === '标题' || pageTitle === '标题页' || !pageTitle) {
            // 根据内容生成标题
            if (page.content.length > 0) {
                pageTitle = page.content[0].substring(0, 20);
            } else {
                pageTitle = '第' + page.number + '页';
            }
        }
        
        var prompt = `请为PPT第${page.number}页生成美观的HTML幻灯片内容。

PPT主题：${pptState.topic}
页面标题：${pageTitle}
页面要点：
${page.content.map((c, i) => (i + 1) + '. ' + c).join('\n')}

要求：
1. 生成一个完整的HTML幻灯片，包含在<div>中
2. 使用现代美观的PPT风格设计
3. 标题要醒目（使用大字号、粗体、居中或左对齐）
4. 内容要丰富，每个要点都要有详细说明（2-3句话）
5. 使用项目符号列表展示要点
6. 添加适当的颜色、间距和视觉层次
7. 可以使用图标或装饰元素增强视觉效果
8. 背景使用浅色（白色或浅灰），文字使用深色
9. 适合${pptState.ratio}比例的PPT展示

请直接返回HTML代码，不要包含markdown代码块标记。`;

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
        var container = document.getElementById('aiPPTPagesList');
        if (!container) return;
        
        var nightMode = g('nightMode') === true;
        var html = '';
        
        for (var i = 0; i < pptState.outline.length; i++) {
            var page = pptState.outline[i];
            var isGenerated = pptState.pages[i] !== null;
            var isActive = i === pptState.currentPage;
            
            html += '<div class="ppt-page-thumb" data-index="' + i + '" style="padding:10px;margin-bottom:8px;border-radius:6px;cursor:pointer;transition:all 0.2s;' + 
                    (isActive ? 'background:#4a90e2;color:white;' : 'background:' + (nightMode ? '#2d2d2d' : 'white') + ';border:1px solid ' + (nightMode ? '#444' : '#ddd') + ';') + '">';
            html += '<div style="font-size:12px;font-weight:bold;">第' + page.number + '页</div>';
            html += '<div style="font-size:11px;opacity:0.8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(page.title) + '</div>';
            html += '<div style="font-size:10px;margin-top:4px;">';
            html += isGenerated ? '<i class="fas fa-check-circle" style="color:' + (isActive ? 'white' : '#27ae60') + ';"></i> ' + (isEn() ? 'Ready' : '已生成') : '<i class="fas fa-clock" style="color:#999;"></i> ' + (isEn() ? 'Pending' : '待生成');
            html += '</div>';
            html += '</div>';
        }
        
        container.innerHTML = html;
        
        // 绑定点击事件
        container.querySelectorAll('.ppt-page-thumb').forEach(function(thumb) {
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
        var container = document.getElementById('aiPPTPagePreview');
        var wrapper = document.getElementById('aiPPTPagePreviewWrapper');
        if (!container || !wrapper) return;
        
        var html = pptState.pages[index];
        
        if (!html) {
            container.innerHTML = '<p style="text-align:center;color:#999;padding-top:100px;">' + (isEn() ? 'Page not generated yet' : '页面尚未生成') + '</p>';
            return;
        }
        
        // 设置比例 - 使用固定宽高比
        var aspectRatio = pptState.ratio === '16:9' ? 16/9 : 4/3;
        
        // 计算合适的尺寸以适应容器
        var maxWidth = wrapper.parentElement.clientWidth - 40;
        var maxHeight = wrapper.parentElement.clientHeight - 40;
        
        var width, height;
        if (maxWidth / maxHeight > aspectRatio) {
            // 高度限制
            height = maxHeight;
            width = height * aspectRatio;
        } else {
            // 宽度限制
            width = maxWidth;
            height = width / aspectRatio;
        }
        
        wrapper.style.width = width + 'px';
        wrapper.style.height = height + 'px';
        wrapper.style.aspectRatio = aspectRatio;
        
        container.innerHTML = html;
    }

    // 更新当前页面标签
    function updateCurrentPageLabel() {
        var label = document.getElementById('aiPPTCurrentPageLabel');
        if (label) {
            label.textContent = 'Page ' + (pptState.currentPage + 1) + ' / ' + pptState.outline.length;
        }
    }

    // 显示/隐藏页面加载
    function showPageLoading(show) {
        var mask = document.getElementById('aiPPTPageLoading');
        if (mask) mask.style.display = show ? 'flex' : 'none';
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
        showCustomPrompt(isEn() ? 'Edit HTML content:' : '编辑HTML内容：', currentHtml, function(newHtml) {
            if (newHtml !== null) {
                pptState.pages[pptState.currentPage] = newHtml;
                renderPagePreview(pptState.currentPage);
                saveDraft();
            }
        });
    }

    // 添加新页面
    function addNewPage() {
        showCustomPrompt(isEn() ? 'Enter page title:' : '输入页面标题：', '', function(title) {
            if (title) {
                var newPageNum = pptState.outline.length + 1;
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
        });
    }

    // 下载PPT - 使用更简单的方法生成PPTX
    async function downloadPPT() {
        // 检查是否所有页面都已生成
        var ungeneratedPages = [];
        for (var i = 0; i < pptState.pages.length; i++) {
            if (!pptState.pages[i]) {
                ungeneratedPages.push(i + 1);
            }
        }
        
        if (ungeneratedPages.length > 0) {
            showCustomConfirm(
                (isEn() ? 'Pages ' : '第') + ungeneratedPages.join(', ') + (isEn() ? ' are not generated yet. Continue?' : '页尚未生成，是否继续？'),
                function() {
                    doDownloadPPT();
                }
            );
        } else {
            doDownloadPPT();
        }
    }

    // 实际下载PPT
    async function doDownloadPPT() {
        var btn = document.getElementById('aiPPTDownload');
        if (!btn) return;
        
        var originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ' + (isEn() ? 'Generating...' : '生成中...');

        try {
            // 使用纯前端方式生成PPT
            // 由于html-to-pptx库有问题，我们使用Blob和简单的XML格式生成PPTX
            var pptxBlob = await generatePPTXBlob();
            
            // 下载文件
            var url = URL.createObjectURL(pptxBlob);
            var a = document.createElement('a');
            a.href = url;
            a.download = (pptState.topic || 'PPT') + '.pptx';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

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
            btn.innerHTML = originalText;
        }
    }

    // 生成PPTX Blob - 使用 pptxgenjs
    async function generatePPTXBlob() {
        // 动态导入 pptxgenjs
        const module = await import('pptxgenjs');
        // 处理不同的导出方式
        const PptxGen = module.default || module.PptxGenJS || module;
        
        // 创建演示文稿
        const pres = new PptxGen();
        
        // 设置幻灯片大小 - 使用 layout 属性
        if (pptState.ratio === '4:3') {
            pres.layout = 'LAYOUT_4x3';
        } else {
            pres.layout = 'LAYOUT_16x9';
        }
        
        // 设置元数据
        pres.title = pptState.topic || 'PPT';
        pres.subject = 'Generated by EasyPocketMD AI';
        pres.author = 'EasyPocketMD';
        
        // 为每页生成幻灯片
        for (var i = 0; i < pptState.outline.length; i++) {
            var page = pptState.outline[i];
            var html = pptState.pages[i] || '';
            
            // 获取标题 - 优先使用HTML中的标题
            var title = page ? page.title : ('Slide ' + (i + 1));
            
            // 检查标题是否是默认的"标题"，如果是则从内容中提取
            if (title === '标题' || title === '标题页' || !title) {
                if (page && page.content.length > 0) {
                    title = page.content[0].substring(0, 25);
                } else {
                    title = '第' + (i + 1) + '页';
                }
            }
            
            // 从HTML中提取标题和内容
            var extractedTitle = title;
            var content = '';
            
            if (html) {
                var tempDiv = document.createElement('div');
                tempDiv.innerHTML = html;
                
                // 尝试提取h1-h3作为标题
                var h1 = tempDiv.querySelector('h1, h2, h3');
                if (h1) {
                    extractedTitle = h1.textContent || h1.innerText || title;
                }
                
                // 移除标题元素，剩下的作为内容
                if (h1) h1.remove();
                
                // 提取内容
                var text = tempDiv.textContent || tempDiv.innerText || '';
                var lines = text.split('\n').filter(function(l) { return l.trim(); });
                content = lines.join('\n');
            }
            
            // 如果HTML中没有提取到内容，使用大纲中的要点
            if (!content && page && page.content && page.content.length > 0) {
                content = page.content.join('\n');
            }
            
            // 创建幻灯片
            var slide = pres.addSlide();
            
            // 获取幻灯片尺寸
            var slideWidth = pres.presLayout ? pres.presLayout.width : 10;
            var slideHeight = pres.presLayout ? pres.presLayout.height : 5.625;
            
            // 添加标题 - 调整字号和位置
            slide.addText(extractedTitle, {
                x: 0.3,
                y: 0.3,
                w: slideWidth - 0.6,
                h: 0.8,
                fontSize: 28,
                bold: true,
                color: '2c3e50',
                align: 'center',
                fontFace: 'Microsoft YaHei'
            });
            
            // 添加分隔线
            slide.addShape(pres.ShapeType.line, {
                x: 0.5,
                y: 1.2,
                w: slideWidth - 1,
                h: 0,
                line: { color: '3498db', width: 2 }
            });
            
            // 添加内容 - 调整字号和位置
            if (content) {
                // 将内容按行分割，创建项目符号列表
                var contentLines = content.split('\n').filter(function(l) { return l.trim(); });
                
                // 限制内容行数，避免超出页面
                var maxLines = slideHeight > 6 ? 8 : 6; // 4:3比例可以显示更多内容
                if (contentLines.length > maxLines) {
                    contentLines = contentLines.slice(0, maxLines);
                }
                
                var bulletPoints = contentLines.map(function(line) {
                    // 限制每行长度
                    var trimmedLine = line.trim();
                    if (trimmedLine.length > 100) {
                        trimmedLine = trimmedLine.substring(0, 97) + '...';
                    }
                    return { 
                        text: trimmedLine, 
                        options: { fontSize: 16, color: '34495e', breakLine: true } 
                    };
                });
                
                if (bulletPoints.length > 0) {
                    slide.addText(bulletPoints, {
                        x: 0.5,
                        y: 1.5,
                        w: slideWidth - 1,
                        h: slideHeight - 2.2,
                        bullet: { type: 'number', color: '3498db' },
                        lineSpacing: 28,
                        paraSpaceAfter: 8,
                        fontFace: 'Microsoft YaHei'
                    });
                }
            }
            
            // 添加页脚
            slide.addText('Generated by EasyPocketMD AI', {
                x: 0.5,
                y: slideHeight - 0.5,
                w: slideWidth - 1,
                h: 0.3,
                fontSize: 9,
                color: '95a5a6',
                align: 'center'
            });
        }
        
        // 生成 blob
        return await pres.write({ outputType: 'blob' });
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
                    showCustomConfirm(
                        (isEn() ? 'Found unsaved PPT draft from ' : '发现未保存的PPT草稿，创建于') + 
                        time.toLocaleString() + (isEn() ? '. Continue?' : '，是否继续编辑？'),
                        function() {
                            loadDraft();
                            if (pptState.outline && pptState.outline.length > 0) {
                                renderOutlinePreview();
                                showPPTStep('outline');
                            }
                        },
                        function() {
                            clearDraft();
                        }
                    );
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

    // 自定义确认对话框（替代浏览器confirm）
    function showCustomConfirm(message, onConfirm, onCancel) {
        var overlay = document.createElement('div');
        overlay.className = 'custom-confirm-overlay';
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:10005;';
        
        var nightMode = g('nightMode') === true;
        var bg = nightMode ? '#2d2d2d' : 'white';
        var textColor = nightMode ? '#eee' : '#333';
        var borderColor = nightMode ? '#444' : '#ddd';
        
        overlay.innerHTML = `
            <div style="background:${bg};color:${textColor};padding:25px;border-radius:12px;max-width:400px;width:90%;box-shadow:0 10px 40px rgba(0,0,0,0.3);">
                <p style="margin:0 0 20px 0;font-size:15px;line-height:1.6;">${escapeHtml(message)}</p>
                <div style="display:flex;gap:10px;justify-content:flex-end;">
                    <button class="custom-confirm-cancel" style="padding:10px 20px;background:transparent;border:1px solid ${borderColor};border-radius:6px;cursor:pointer;font-size:14px;color:${textColor};">
                        ${isEn() ? 'Cancel' : '取消'}
                    </button>
                    <button class="custom-confirm-ok" style="padding:10px 20px;background:#4a90e2;color:white;border:none;border-radius:6px;cursor:pointer;font-size:14px;">
                        ${isEn() ? 'Confirm' : '确认'}
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(overlay);
        
        overlay.querySelector('.custom-confirm-cancel').addEventListener('click', function() {
            document.body.removeChild(overlay);
            if (onCancel) onCancel();
        });
        
        overlay.querySelector('.custom-confirm-ok').addEventListener('click', function() {
            document.body.removeChild(overlay);
            if (onConfirm) onConfirm();
        });
        
        overlay.addEventListener('click', function(e) {
            if (e.target === overlay) {
                document.body.removeChild(overlay);
                if (onCancel) onCancel();
            }
        });
    }

    // 自定义输入对话框（替代浏览器prompt）
    function showCustomPrompt(message, defaultValue, onConfirm) {
        var overlay = document.createElement('div');
        overlay.className = 'custom-prompt-overlay';
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:10005;';
        
        var nightMode = g('nightMode') === true;
        var bg = nightMode ? '#2d2d2d' : 'white';
        var textColor = nightMode ? '#eee' : '#333';
        var borderColor = nightMode ? '#444' : '#ddd';
        
        overlay.innerHTML = `
            <div style="background:${bg};color:${textColor};padding:25px;border-radius:12px;max-width:500px;width:90%;box-shadow:0 10px 40px rgba(0,0,0,0.3);">
                <p style="margin:0 0 15px 0;font-size:15px;">${escapeHtml(message)}</p>
                <textarea class="custom-prompt-input" style="width:100%;min-height:100px;padding:12px;border:1px solid ${borderColor};border-radius:8px;font-size:14px;resize:vertical;background:${nightMode ? '#3d3d3d' : 'white'};color:${textColor};font-family:inherit;box-sizing:border-box;margin-bottom:15px;">${escapeHtml(defaultValue || '')}</textarea>
                <div style="display:flex;gap:10px;justify-content:flex-end;">
                    <button class="custom-prompt-cancel" style="padding:10px 20px;background:transparent;border:1px solid ${borderColor};border-radius:6px;cursor:pointer;font-size:14px;color:${textColor};">
                        ${isEn() ? 'Cancel' : '取消'}
                    </button>
                    <button class="custom-prompt-ok" style="padding:10px 20px;background:#4a90e2;color:white;border:none;border-radius:6px;cursor:pointer;font-size:14px;">
                        ${isEn() ? 'OK' : '确定'}
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(overlay);
        
        var input = overlay.querySelector('.custom-prompt-input');
        input.focus();
        input.select();
        
        overlay.querySelector('.custom-prompt-cancel').addEventListener('click', function() {
            document.body.removeChild(overlay);
            if (onConfirm) onConfirm(null);
        });
        
        overlay.querySelector('.custom-prompt-ok').addEventListener('click', function() {
            var value = input.value;
            document.body.removeChild(overlay);
            if (onConfirm) onConfirm(value);
        });
        
        overlay.addEventListener('click', function(e) {
            if (e.target === overlay) {
                document.body.removeChild(overlay);
                if (onConfirm) onConfirm(null);
            }
        });
    }

    // HTML转义
    function escapeHtml(text) {
        if (!text) return '';
        var div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // 导出到全局
    global.initPPTGenerator = initPPTGenerator;
    global.PPTGenerator = {
        init: initPPTGenerator,
        saveDraft: saveDraft,
        loadDraft: loadDraft,
        clearDraft: clearDraft
    };

})(typeof window !== 'undefined' ? window : this);
