/**
 * PPT生成器模块 - 整合到AI助手
 * 支持：大纲生成 -> 全屏分页预览 -> 单页重新生成 -> 下载PPT
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
        source: 'current',      // 生成方式: current(本文件) / topic(主题)
        cacheKey: '.ppt_draft_', // 缓存键前缀
        colorScheme: 'white-black' // 配色方案: white-black, black-white, traffic-light, traditional, business
    };

    // 配色方案定义
    var colorSchemes = {
        'white-black': {
            name: '白底黑字',
            bgColor: '#ffffff',
            textColor: '#2c3e50',
            subtitleColor: '#34495e',
            accentColor: '#4a90e2'
        },
        'black-white': {
            name: '黑底白字',
            bgColor: '#1a1a1a',
            textColor: '#ffffff',
            subtitleColor: '#e0e0e0',
            accentColor: '#4a90e2'
        },
        'traffic-light': {
            name: '红绿灯',
            bgColor: '#2d5016',
            textColor: '#c0392b',
            subtitleColor: '#e74c3c',
            accentColor: '#f1c40f'
        },
        'traditional': {
            name: '传统配色',
            bgColor: '#1e3a5f',
            textColor: '#ffffff',
            subtitleColor: '#ecf0f1',
            accentColor: '#f39c12'
        },
        'business': {
            name: '商务配色',
            bgColor: '#34495e',
            textColor: '#ecf0f1',
            subtitleColor: '#bdc3c7',
            accentColor: '#3498db'
        }
    };

    // 初始化PPT生成器
    function initPPTGenerator() {
        checkCachedDraft();
        initPPTGeneratorEvents();
        showPPTStep('input');
        updateSourceUI();
    }

    // 更新生成方式UI
    function updateSourceUI() {
        var fromCurrentBtn = document.getElementById('aiPPTFromCurrent');
        var fromTopicBtn = document.getElementById('aiPPTFromTopic');
        var topicSection = document.getElementById('aiPPTTopicSection');
        var topicLabel = document.querySelector('#aiPPTTopicSection label');

        if (pptState.source === 'current') {
            fromCurrentBtn.classList.add('active');
            fromTopicBtn.classList.remove('active');
            // 根据本文件生成时，显示主题输入框（可选）
            if (topicSection) topicSection.style.display = 'block';
            if (topicLabel) {
                topicLabel.innerHTML = '主题 <span id="topicRequired" style="color:#999;font-weight:normal;">（可选）</span>';
            }
        } else {
            fromTopicBtn.classList.add('active');
            fromCurrentBtn.classList.remove('active');
            // 输入主题生成时，显示主题输入框（必填）
            if (topicSection) topicSection.style.display = 'block';
            if (topicLabel) {
                topicLabel.innerHTML = '主题 <span id="topicRequired" style="color:#e74c3c;">*</span>';
            }
        }
    }

    // 初始化事件监听
    function initPPTGeneratorEvents() {
        // 生成方式选择
        var fromCurrentBtn = document.getElementById('aiPPTFromCurrent');
        var fromTopicBtn = document.getElementById('aiPPTFromTopic');
        
        if (fromCurrentBtn) {
            fromCurrentBtn.addEventListener('click', function() {
                pptState.source = 'current';
                updateSourceUI();
            });
        }
        
        if (fromTopicBtn) {
            fromTopicBtn.addEventListener('click', function() {
                pptState.source = 'topic';
                updateSourceUI();
            });
        }

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
                showCustomPrompt('编辑大纲：', 
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

        // PPT编辑器事件
        initPPTEditorEvents();
    }

    // 初始化PPT编辑器事件
    function initPPTEditorEvents() {
        // 关闭编辑器
        var closeBtn = document.getElementById('pptEditorClose');
        if (closeBtn) {
            closeBtn.addEventListener('click', function() {
                document.getElementById('pptEditorModal').style.display = 'none';
                saveDraft();
            });
        }

        // 上一页
        var prevBtn = document.getElementById('pptEditorPrev');
        if (prevBtn) {
            prevBtn.addEventListener('click', function() {
                if (pptState.currentPage > 0) {
                    selectPage(pptState.currentPage - 1);
                }
            });
        }

        // 下一页
        var nextBtn = document.getElementById('pptEditorNext');
        if (nextBtn) {
            nextBtn.addEventListener('click', function() {
                if (pptState.currentPage < pptState.outline.length - 1) {
                    selectPage(pptState.currentPage + 1);
                }
            });
        }

        // 重新生成当前页
        var regenBtn = document.getElementById('pptEditorRegen');
        if (regenBtn) {
            regenBtn.addEventListener('click', regenerateCurrentPage);
        }

        // 下载PPT
        var downloadBtn = document.getElementById('pptEditorDownload');
        if (downloadBtn) {
            downloadBtn.addEventListener('click', downloadPPT);
        }

        // 添加新页面
        var addPageBtn = document.getElementById('pptEditorAddPage');
        if (addPageBtn) {
            addPageBtn.addEventListener('click', addNewPage);
        }
    }

    // 初始化配色方案选择器（在大纲预览界面）
    function initColorSchemeSelector() {
        var selector = document.getElementById('pptColorSchemeSelector');
        if (!selector) return;

        selector.innerHTML = '';
        
        var schemes = [
            { key: 'white-black', class: 'ppt-scheme-white-black', label: '白底黑字' },
            { key: 'black-white', class: 'ppt-scheme-black-white', label: '黑底白字' },
            { key: 'traffic-light', class: 'ppt-scheme-traffic-light', label: '红绿灯' },
            { key: 'traditional', class: 'ppt-scheme-traditional', label: '传统' },
            { key: 'business', class: 'ppt-scheme-business', label: '商务' }
        ];

        schemes.forEach(function(scheme) {
            var btn = document.createElement('button');
            btn.className = 'ppt-color-scheme-btn ' + scheme.class;
            btn.setAttribute('data-scheme', scheme.key);
            btn.setAttribute('data-label', scheme.label);
            btn.title = scheme.label;
            if (scheme.key === pptState.colorScheme) {
                btn.classList.add('active');
            }
            btn.addEventListener('click', function() {
                selectColorScheme(scheme.key);
            });
            selector.appendChild(btn);
        });
    }

    // 选择配色方案
    function selectColorScheme(schemeKey) {
        pptState.colorScheme = schemeKey;
        
        // 更新按钮状态
        var selector = document.getElementById('pptColorSchemeSelector');
        if (selector) {
            selector.querySelectorAll('.ppt-color-scheme-btn').forEach(function(btn) {
                btn.classList.remove('active');
                if (btn.getAttribute('data-scheme') === schemeKey) {
                    btn.classList.add('active');
                }
            });
        }
        
        saveDraft();
    }

    // 显示指定步骤
    function showPPTStep(step) {
        var inputSection = document.getElementById('aiPPTInputSection');
        var outlineSection = document.getElementById('aiPPTOutlineSection');
        
        if (inputSection) inputSection.style.display = step === 'input' ? 'block' : 'none';
        if (outlineSection) outlineSection.style.display = step === 'outline' ? 'block' : 'none';
        
        // 当显示大纲预览步骤时，初始化配色方案选择器
        if (step === 'outline') {
            initColorSchemeSelector();
        }
    }

    // 获取编辑器内容
    function getEditorContent() {
        if (g('vditor') && typeof g('vditor').getValue === 'function') {
            return g('vditor').getValue() || '';
        }
        return '';
    }

    // 生成大纲
    async function generateOutline() {
        var input = document.getElementById('aiPPTInput').value.trim();
        var topicInput = document.getElementById('aiPPTTopicInput');
        var topic = topicInput ? topicInput.value.trim() : '';
        
        // 根据生成方式验证
        var fileContent = '';
        if (pptState.source === 'current') {
            // 根据本文件生成：主题和大纲都是可选的
            fileContent = getEditorContent();
            if (!fileContent) {
                if (global.showMessage) {
                    global.showMessage('当前文件内容为空，请先输入内容', 'error');
                }
                return;
            }
            // 从文件内容提取主题（如果用户没填）
            if (!topic && fileContent) {
                var lines = fileContent.split('\n');
                topic = lines[0].replace(/^#+\s*/, '').substring(0, 50);
            }
        } else {
            // 输入主题生成：主题必填
            if (!topic) {
                if (global.showMessage) {
                    global.showMessage('请输入PPT主题', 'error');
                }
                // 聚焦到主题输入框
                if (topicInput) topicInput.focus();
                return;
            }
        }

        pptState.topic = topic || 'PPT演示';
        
        var btn = document.getElementById('aiPPTGenerateOutline');
        var originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 生成中...';

        try {
            if (input && input.includes('第') && input.includes('页')) {
                parseOutline(input);
            } else {
                // 构建提示词
                var prompt = buildOutlinePrompt(topic, fileContent, input);
                var result = await callAIAPI(prompt, '');
                document.getElementById('aiPPTInput').value = result;
                parseOutline(result);
            }
            
            renderOutlinePreview();
            showPPTStep('outline');
            saveDraft();
        } catch (error) {
            if (global.showMessage) {
                global.showMessage('生成失败：' + error.message, 'error');
            }
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    }

    // 构建大纲生成提示词
    function buildOutlinePrompt(topic, fileContent, userOutline) {
        var ratio = pptState.ratio;
        var prompt = '';
        
        if (pptState.source === 'current' && fileContent) {
            prompt = `请根据以下文件内容生成一个PPT大纲，共5-8页。

文件内容：
${fileContent.substring(0, 3000)}

${topic ? 'PPT主题：' + topic : ''}

要求：
1. 每页必须有一个具体的、有意义的标题，不能只是"标题"二字
2. 标题应该概括该页的核心内容
3. 每页包含2-4个要点
4. 第一页是封面页，包含PPT主题
5. 内容要基于文件内容提炼，不要脱离原文

输出格式：
第1页：封面页标题
要点1：具体内容
要点2：具体内容

第2页：具体章节标题
要点1：具体内容
要点2：具体内容

请确保每个标题都是有意义的。`;
        } else {
            prompt = `请为主题"${topic}"生成一个详细的PPT大纲，包含5-8页。

${userOutline ? '用户提供的参考大纲：\n' + userOutline + '\n\n' : ''}

要求：
1. 每页必须有一个具体的、有意义的标题，不能只是"标题"二字
2. 标题应该概括该页的核心内容
3. 每页包含2-4个要点，每个要点要具体
4. 第一页是封面页

输出格式：
第1页：封面页标题
要点1：具体内容
要点2：具体内容

第2页：具体章节标题
要点1：具体内容
要点2：具体内容

请确保每个标题都是有意义的。`;
        }
        
        return prompt;
    }

    // 解析大纲
    function parseOutline(text) {
        var pages = [];
        var currentPage = null;
        
        var lines = text.split('\n');
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            if (!line) continue;
            
            // 匹配页面标题
            var pageMatch = line.match(/^第(\d+)页[：:]\s*(.+)$/) ||
                           line.match(/^\*\*第(\d+)页[：:]\s*(.+?)\*\*$/) ||
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
            } else if (currentPage && (line.startsWith('要点') || line.startsWith('-') || line.startsWith('•'))) {
                var content = line.replace(/^要点\d*[：:]\s*/, '').replace(/^[-•]\s*/, '').trim();
                if (content) {
                    currentPage.content.push(content);
                }
            } else if (currentPage && line && !line.match(/^第\d+页/)) {
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
        var isNightMode = document.body.classList.contains('night-mode');
        
        if (!pptState.outline || pptState.outline.length === 0) {
            container.innerHTML = '<p style="color:#999;text-align:center;padding:20px;">无大纲数据</p>';
            return;
        }
        
        var html = '';
        for (var i = 0; i < pptState.outline.length; i++) {
            var page = pptState.outline[i];
            var bgColor = isNightMode ? '#3d3d3d' : '#f8f9fa';
            html += '<div style="margin-bottom:15px;padding:12px;background:' + bgColor + ';border-radius:8px;border-left:3px solid #4a90e2;">';
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
                global.showMessage('请先生成大纲', 'error');
            }
            return;
        }

        // 显示全屏编辑器
        document.getElementById('pptEditorModal').style.display = 'flex';
        renderEditorPagesList();
        
        // 逐页生成
        for (var i = 0; i < pptState.outline.length; i++) {
            if (!pptState.pages[i]) {
                selectPage(i);
                showEditorLoading(true);
                
                try {
                    await generatePage(i);
                    renderEditorPagesList();
                    renderEditorPreview(i);
                    saveDraft();
                } catch (e) {
                    console.error('Failed to generate page ' + (i + 1), e);
                } finally {
                    showEditorLoading(false);
                }
                
                await new Promise(r => setTimeout(r, 500));
            }
        }
        
        selectPage(0);
    }

    // 生成单页
    async function generatePage(index) {
        var page = pptState.outline[index];
        
        // 检查标题是否是默认的"标题"
        var pageTitle = page.title;
        if (pageTitle === '标题' || pageTitle === '标题页' || !pageTitle) {
            if (page.content.length > 0) {
                pageTitle = page.content[0].substring(0, 25);
            } else {
                pageTitle = '第' + page.number + '页';
            }
        }
        
        var ratio = pptState.ratio;
        var aspectRatio = ratio === '16:9' ? '16:9' : '4:3';
        
        // 使用选定的配色方案，不再根据夜间模式改变
        var scheme = colorSchemes[pptState.colorScheme] || colorSchemes['white-black'];
        var bgColor = scheme.bgColor;
        var textColor = scheme.textColor;
        var subtitleColor = scheme.subtitleColor;
        var accentColor = scheme.accentColor;

        var prompt = buildPageJsonPrompt(page, pageTitle, aspectRatio, {
            bgColor: bgColor,
            textColor: textColor,
            subtitleColor: subtitleColor,
            accentColor: accentColor,
            schemeName: scheme.name
        });

        var aiResult = await callAIAPI(prompt, '');
        var pageJson = parsePptPageJson(aiResult, page, pageTitle, index);
        var html = renderPageFromJson(pageJson, {
            bgColor: bgColor,
            textColor: textColor,
            subtitleColor: subtitleColor,
            accentColor: accentColor,
            schemeName: scheme.name
        });

        pptState.pages[index] = normalizePptHtml(html);
    }

    function buildPageJsonPrompt(page, pageTitle, aspectRatio, scheme) {
        var points = (page.content || []).slice(0, 6).map(function(item, idx) {
            return '- 要点' + (idx + 1) + ': ' + item;
        }).join('\n');

        return `你是PPT内容助手。请根据以下信息生成单页内容，必须返回纯 JSON，不要返回 HTML/Markdown/解释。

页面主题：${pageTitle}
页面要点：
${points || '- 无'}
画面比例：${aspectRatio}
配色参考：${scheme.schemeName}（主色 ${scheme.bgColor}，文字 ${scheme.textColor}，强调 ${scheme.accentColor}）

硬性要求：
1. 仅输出一个 JSON 对象，不要代码块。
2. 字段中的文案禁止出现“第x页”“第1页”“第2页”等页码描述。
3. 文案简洁，每条要点不超过30字。
4. layout 只能是 "cover"、"content"、"two-column" 之一。
5. icon 为单个 emoji 或短符号（最多2字符）。
6. emphasis 为 1-3 条重点短句（每条不超过16字）。

JSON 结构：
{
  "layout": "content",
  "title": "",
  "subtitle": "",
  "icon": "",
  "emphasis": ["", ""],
  "bullets": ["", ""],
  "highlights": ["", ""],
  "leftTitle": "",
  "leftBullets": ["", ""],
  "rightTitle": "",
  "rightBullets": ["", ""]
}`;
    }

    function parsePptPageJson(raw, page, fallbackTitle, index) {
        var fallback = {
            layout: index === 0 ? 'cover' : 'content',
            title: sanitizePageText(fallbackTitle || page.title || ''),
            subtitle: '',
            icon: index === 0 ? '🎯' : '📌',
            emphasis: [],
            bullets: (page.content || []).slice(0, 5).map(sanitizePageText).filter(Boolean),
            highlights: [],
            leftTitle: '核心要点',
            leftBullets: (page.content || []).slice(0, 3).map(sanitizePageText).filter(Boolean),
            rightTitle: '补充说明',
            rightBullets: (page.content || []).slice(3, 6).map(sanitizePageText).filter(Boolean)
        };

        if (!raw || typeof raw !== 'string') return fallback;

        var cleaned = raw.trim()
            .replace(/^```(?:json)?\s*/i, '')
            .replace(/\s*```\s*$/i, '');

        var parsed = null;
        try {
            parsed = JSON.parse(cleaned);
        } catch (e) {
            var start = cleaned.indexOf('{');
            var end = cleaned.lastIndexOf('}');
            if (start !== -1 && end !== -1 && end > start) {
                try {
                    parsed = JSON.parse(cleaned.slice(start, end + 1));
                } catch (ignore) {
                    parsed = null;
                }
            }
        }

        if (!parsed || typeof parsed !== 'object') return fallback;

        var layout = sanitizePageText(readStringField(parsed, ['layout', 'type', 'layoutType'])).toLowerCase();
        if (layout !== 'cover' && layout !== 'content' && layout !== 'two-column') {
            layout = fallback.layout;
        }

        var bullets = readArrayField(parsed, ['bullets', 'points', 'items', '要点']);
        var emphasis = readArrayField(parsed, ['emphasis', 'keyMessage', '重点']);
        var highlights = readArrayField(parsed, ['highlights', 'keywords', '亮点']);
        var leftBullets = readArrayField(parsed, ['leftBullets', 'leftPoints', 'leftItems']);
        var rightBullets = readArrayField(parsed, ['rightBullets', 'rightPoints', 'rightItems']);

        return {
            layout: layout,
            title: sanitizePageText(readStringField(parsed, ['title', '标题'])) || fallback.title,
            subtitle: sanitizePageText(readStringField(parsed, ['subtitle', 'summary', '副标题'])),
            icon: normalizePageIcon(readStringField(parsed, ['icon', 'emoji', 'symbol'])) || fallback.icon,
            emphasis: normalizeTextArray(emphasis, 3),
            bullets: normalizeTextArray(bullets, 6) || fallback.bullets,
            highlights: normalizeTextArray(highlights, 4),
            leftTitle: sanitizePageText(readStringField(parsed, ['leftTitle', 'leftHeader'])) || fallback.leftTitle,
            leftBullets: normalizeTextArray(leftBullets, 4) || fallback.leftBullets,
            rightTitle: sanitizePageText(readStringField(parsed, ['rightTitle', 'rightHeader'])) || fallback.rightTitle,
            rightBullets: normalizeTextArray(rightBullets, 4) || fallback.rightBullets
        };
    }

    function renderPageFromJson(pageData, scheme) {
        var title = escapeHtml(pageData.title || '');
        var subtitle = escapeHtml(pageData.subtitle || '');
        var icon = escapeHtml(pageData.icon || '');
        var emphasis = (pageData.emphasis || []).map(escapeHtml);
        var bullets = (pageData.bullets || []).map(escapeHtml);
        var highlights = (pageData.highlights || []).map(escapeHtml);
        var leftBullets = (pageData.leftBullets || []).map(escapeHtml);
        var rightBullets = (pageData.rightBullets || []).map(escapeHtml);
        var base = 'width:100%;height:100%;padding:5.5%;box-sizing:border-box;overflow:hidden;background:linear-gradient(140deg,' + scheme.bgColor + ' 0%,' + scheme.bgColor + 'dd 60%,' + scheme.accentColor + '26 100%);color:' + scheme.textColor + ';font-family:Arial,\'Microsoft YaHei\',sans-serif;';

        if (pageData.layout === 'cover') {
            return '<div style="' + base + 'display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;gap:2.5%;">'
                + '<h1 style="margin:0;font-size:5.2vw;line-height:1.2;max-width:90%;">' + (icon ? (icon + ' ') : '') + title + '</h1>'
                + (subtitle ? '<p style="margin:0;font-size:2.1vw;color:' + scheme.subtitleColor + ';max-width:78%;">' + subtitle + '</p>' : '')
                + (emphasis.length ? '<div style="display:flex;flex-wrap:wrap;justify-content:center;gap:1.2%;max-width:82%;">' + emphasis.map(function(item) {
                    return '<span style="padding:0.6% 1.3%;border-radius:10px;background:rgba(255,255,255,0.16);font-size:1.7vw;color:' + scheme.textColor + ';">' + item + '</span>';
                }).join('') + '</div>' : '')
                + (highlights.length ? '<div style="display:flex;flex-wrap:wrap;justify-content:center;gap:1.2%;margin-top:2%;">' + highlights.map(function(item) {
                    return '<span style="padding:0.6% 1.2%;border-radius:999px;background:' + scheme.accentColor + '33;color:' + scheme.textColor + ';font-size:1.6vw;">' + item + '</span>';
                }).join('') + '</div>' : '')
                + '</div>';
        }

        if (pageData.layout === 'two-column') {
            return '<div style="' + base + 'display:flex;flex-direction:column;">'
                + '<h1 style="margin:0 0 2.5% 0;font-size:3.6vw;line-height:1.2;">' + (icon ? (icon + ' ') : '') + title + '</h1>'
                + (emphasis.length ? '<div style="display:flex;flex-wrap:wrap;gap:1.1%;margin:0 0 2.2% 0;">' + emphasis.map(function(item) {
                    return '<span style="padding:0.45% 1%;border-radius:999px;background:' + scheme.accentColor + '2e;color:' + scheme.textColor + ';font-size:1.55vw;">' + item + '</span>';
                }).join('') + '</div>' : '')
                + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:2.2%;height:80%;">'
                + renderColumnBlock(escapeHtml(pageData.leftTitle || '核心信息'), leftBullets, scheme, icon)
                + renderColumnBlock(escapeHtml(pageData.rightTitle || '补充信息'), rightBullets, scheme, icon)
                + '</div>'
                + '</div>';
        }

        return '<div style="' + base + 'display:flex;flex-direction:column;">'
            + '<h1 style="margin:0 0 2.2% 0;font-size:3.8vw;line-height:1.2;">' + (icon ? (icon + ' ') : '') + title + '</h1>'
            + (subtitle ? '<p style="margin:0 0 2.8% 0;color:' + scheme.subtitleColor + ';font-size:2vw;">' + subtitle + '</p>' : '')
            + (emphasis.length ? '<div style="display:flex;flex-wrap:wrap;gap:1%;margin:0 0 2.3% 0;">' + emphasis.map(function(item) {
                return '<span style="padding:0.45% 0.95%;border-radius:8px;background:' + scheme.accentColor + '2e;color:' + scheme.textColor + ';font-size:1.55vw;">' + item + '</span>';
            }).join('') + '</div>' : '')
            + '<div style="display:flex;flex-direction:column;gap:1.8%;">'
            + (bullets.length ? bullets.map(function(item) {
                return '<div style="display:flex;align-items:flex-start;gap:1.2%;padding:1.4% 1.8%;border-radius:12px;background:rgba(255,255,255,0.14);border-left:0.35vw solid ' + scheme.accentColor + ';">'
                    + '<span style="font-size:2.1vw;color:' + scheme.accentColor + ';line-height:1;">' + (icon || '▸') + '</span>'
                    + '<span style="font-size:2.1vw;line-height:1.35;color:' + scheme.textColor + ';">' + item + '</span>'
                    + '</div>';
            }).join('') : '<div style="font-size:2.1vw;color:' + scheme.subtitleColor + ';">暂无要点</div>')
            + '</div>'
            + '</div>';
    }

    function renderColumnBlock(title, items, scheme, icon) {
        var content = items.length ? items.map(function(item) {
            return '<li style="margin:0 0 1.3% 0;line-height:1.4;font-size:1.85vw;color:' + scheme.textColor + ';">' + item + '</li>';
        }).join('') : '<li style="font-size:1.85vw;color:' + scheme.subtitleColor + ';">暂无内容</li>';
        return '<div style="background:rgba(255,255,255,0.14);border:1px solid rgba(255,255,255,0.18);border-radius:14px;padding:4.2% 4.8%;overflow:hidden;">'
            + '<h3 style="margin:0 0 3% 0;font-size:2.2vw;color:' + scheme.accentColor + ';">' + (icon ? (icon + ' ') : '') + title + '</h3>'
            + '<ul style="margin:0;padding-left:1.4em;">' + content + '</ul>'
            + '</div>';
    }

    function normalizePageIcon(iconText) {
        var icon = sanitizePageText(iconText || '').trim();
        if (!icon) return '';
        // 限制 icon 为短符号，避免模型返回完整短语
        if (icon.length > 2) {
            return icon.charAt(0);
        }
        return icon;
    }

    function readStringField(obj, keys) {
        for (var i = 0; i < keys.length; i++) {
            if (typeof obj[keys[i]] === 'string') {
                return obj[keys[i]];
            }
        }
        return '';
    }

    function readArrayField(obj, keys) {
        for (var i = 0; i < keys.length; i++) {
            if (Array.isArray(obj[keys[i]])) {
                return obj[keys[i]];
            }
        }
        return [];
    }

    function normalizeTextArray(arr, maxLen) {
        if (!Array.isArray(arr)) return [];
        return arr
            .map(function(item) { return sanitizePageText(String(item || '')); })
            .filter(Boolean)
            .slice(0, maxLen || 6);
    }

    function sanitizePageText(text) {
        if (!text) return '';
        return text
            .replace(/第\s*\d+\s*页[：:]?/gi, '')
            .replace(/page\s*\d+[：:]?/gi, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    // 渲染编辑器页面列表 - 水平排列
    function renderEditorPagesList() {
        var container = document.getElementById('pptEditorPagesList');
        if (!container) return;
        
        var html = '';
        for (var i = 0; i < pptState.outline.length; i++) {
            var page = pptState.outline[i];
            var isGenerated = pptState.pages[i] !== null;
            var isActive = i === pptState.currentPage;
            
            // 水平排列的缩略图 - 所有文字始终白色以确保清晰可见
            html += '<div class="ppt-editor-thumb" data-index="' + i + '" data-active="' + isActive + '" style="flex-shrink:0;width:140px;padding:10px;border-radius:8px;cursor:pointer;transition:all 0.3s ease;position:relative;">';
            
            // 删除按钮
            html += '<button class="ppt-delete-page-btn" data-delete-index="' + i + '" style="position:absolute;top:4px;right:4px;width:22px;height:22px;border:none;border-radius:50%;color:white;font-size:10px;cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:10;opacity:0.9;transition:all 0.2s;">';
            html += '<i class="fas fa-times"></i>';
            html += '</button>';
            
            // 在当前页后插入新页的按钮
            html += '<button class="ppt-insert-page-btn" data-insert-index="' + i + '" style="position:absolute;top:4px;right:30px;width:22px;height:22px;border:none;border-radius:50%;color:white;font-size:10px;cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:10;opacity:0.9;transition:all 0.2s;" title="在此页后插入">';
            html += '<i class="fas fa-plus"></i>';
            html += '</button>';
            
            // 第x页 - 始终白色
            html += '<div class="page-number" style="font-size:12px;font-weight:bold;padding-right:50px;color:#ffffff !important;text-shadow:0 1px 2px rgba(0,0,0,0.3);">第' + page.number + '页</div>';
            
            // 页面标题 - 始终白色
            html += '<div class="page-title" style="font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:4px;color:#ffffff !important;opacity:0.95;">' + escapeHtml(page.title) + '</div>';
            
            // 生成状态 - 始终白色
            html += '<div class="page-status-text" style="font-size:10px;margin-top:6px;color:#ffffff !important;">';
            if (isGenerated) {
                html += '<i class="fas fa-check-circle" style="color:#2ecc71;margin-right:4px;"></i><span>已生成</span>';
            } else {
                html += '<i class="fas fa-clock" style="color:#f1c40f;margin-right:4px;"></i><span style="opacity:0.8;">待生成</span>';
            }
            html += '</div>';
            html += '</div>';
        }
        
        container.innerHTML = html;
        
        // 页面点击事件
        container.querySelectorAll('.ppt-editor-thumb').forEach(function(thumb) {
            thumb.addEventListener('click', function(e) {
                // 如果点击的是按钮，不触发页面选择
                if (e.target.closest('.ppt-delete-page-btn') || e.target.closest('.ppt-insert-page-btn')) {
                    return;
                }
                selectPage(parseInt(this.getAttribute('data-index')));
            });
        });
        
        // 删除按钮事件
        container.querySelectorAll('.ppt-delete-page-btn').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                var index = parseInt(this.getAttribute('data-delete-index'));
                deletePage(index);
            });
        });
        
        // 插入按钮事件
        container.querySelectorAll('.ppt-insert-page-btn').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                var index = parseInt(this.getAttribute('data-insert-index'));
                insertPageAfter(index);
            });
        });
    }
    
    // 删除页面
    function deletePage(index) {
        if (pptState.outline.length <= 1) {
            if (global.showMessage) {
                global.showMessage('至少需要保留一页', 'error');
            }
            return;
        }
        
        showCustomConfirm(
            '确定要删除第' + (index + 1) + '页吗？',
            function() {
                pptState.outline.splice(index, 1);
                pptState.pages.splice(index, 1);
                
                // 重新编号
                for (var i = 0; i < pptState.outline.length; i++) {
                    pptState.outline[i].number = i + 1;
                }
                
                // 调整当前页
                if (pptState.currentPage >= pptState.outline.length) {
                    pptState.currentPage = pptState.outline.length - 1;
                }
                
                renderEditorPagesList();
                renderEditorPreview(pptState.currentPage);
                updateEditorPageNum();
                saveDraft();
                
                if (global.showMessage) {
                    global.showMessage('页面已删除', 'success');
                }
            }
        );
    }
    
    // 在指定位置后插入新页面
    async function insertPageAfter(index) {
        showCustomPrompt('输入新页面标题：', '', async function(title) {
            if (!title) return;
            
            var insertIndex = index + 1;
            
            // 插入到大纲数组
            pptState.outline.splice(insertIndex, 0, {
                number: insertIndex + 1,
                title: title,
                content: []
            });
            pptState.pages.splice(insertIndex, 0, null);
            
            // 重新编号
            for (var i = 0; i < pptState.outline.length; i++) {
                pptState.outline[i].number = i + 1;
            }
            
            renderEditorPagesList();
            selectPage(insertIndex);
            saveDraft();
            
            // 自动生成新页面内容
            showEditorLoading(true);
            try {
                await generatePage(insertIndex);
                renderEditorPagesList();
                renderEditorPreview(insertIndex);
                saveDraft();
                if (global.showMessage) {
                    global.showMessage('新页面已生成', 'success');
                }
            } catch (e) {
                console.error('生成页面失败', e);
                if (global.showMessage) {
                    global.showMessage('页面生成失败', 'error');
                }
            } finally {
                showEditorLoading(false);
            }
        });
    }

    // 选择页面
    function selectPage(index) {
        pptState.currentPage = index;
        renderEditorPagesList();
        renderEditorPreview(index);
        updateEditorPageNum();
    }

    // 渲染编辑器预览 - 使用相对单位和缩放
    function renderEditorPreview(index) {
        var container = document.getElementById('pptEditorPreview');
        var wrapper = document.getElementById('pptEditorPreviewContainer');
        if (!container || !wrapper) return;
        
        var html = normalizePptHtml(pptState.pages[index]);
        
        if (!html) {
            container.innerHTML = '<p style="text-align:center;color:#999;padding-top:100px;">页面尚未生成</p>';
            updatePreviewSize(wrapper);
            return;
        }
        
        // 将HTML包装在一个具有正确比例的容器中 - 无padding确保与PPT一致
        var ratio = pptState.ratio === '16:9' ? '16/9' : '4/3';
        var wrappedHtml = '<div class="ppt-slide-content" style="width:100%;height:100%;aspect-ratio:' + ratio + ';box-sizing:border-box;overflow:hidden;">' + html + '</div>';
        
        container.innerHTML = wrappedHtml;
        updatePreviewSize(wrapper);
        
        // 应用缩放使内容适应容器
        applyPreviewScale(wrapper);
    }

    // 更新预览尺寸
    function updatePreviewSize(wrapper) {
        var panel = wrapper.parentElement;
        var panelWidth = panel.clientWidth - 40;
        var panelHeight = panel.clientHeight - 40;
        
        var aspectRatio = pptState.ratio === '16:9' ? 16/9 : 4/3;
        
        var width, height;
        if (panelWidth / panelHeight > aspectRatio) {
            height = Math.min(panelHeight, panelWidth / aspectRatio);
            width = height * aspectRatio;
        } else {
            width = Math.min(panelWidth, panelHeight * aspectRatio);
            height = width / aspectRatio;
        }
        
        // 限制最大尺寸
        var maxWidth = Math.min(width, panelWidth * 0.95);
        var maxHeight = maxWidth / aspectRatio;
        
        wrapper.style.width = maxWidth + 'px';
        wrapper.style.height = maxHeight + 'px';
    }

    // 应用预览缩放 - 确保内容适应容器
    function applyPreviewScale(wrapper) {
        var content = wrapper.querySelector('.ppt-slide-content');
        if (!content) return;
        
        // 使用CSS transform进行缩放以适应容器
        content.style.transformOrigin = 'top left';
        content.style.width = '100%';
        content.style.height = '100%';
    }

    // 更新页码显示
    function updateEditorPageNum() {
        var label = document.getElementById('pptEditorPageNum');
        if (label) {
            label.textContent = (pptState.currentPage + 1) + ' / ' + pptState.outline.length;
        }
    }

    // 显示/隐藏加载
    function showEditorLoading(show) {
        var loading = document.getElementById('pptEditorLoading');
        if (loading) loading.style.display = show ? 'block' : 'none';
    }

    // 重新生成当前页面
    async function regenerateCurrentPage() {
        showEditorLoading(true);
        try {
            await generatePage(pptState.currentPage);
            renderEditorPagesList();
            renderEditorPreview(pptState.currentPage);
            saveDraft();
            if (global.showMessage) {
                global.showMessage('页面已重新生成', 'success');
            }
        } catch (e) {
            if (global.showMessage) {
                global.showMessage('重新生成失败', 'error');
            }
        } finally {
            showEditorLoading(false);
        }
    }

    // 添加新页面（在末尾添加并自动生成）
    async function addNewPage() {
        showCustomPrompt('输入页面标题：', '', async function(title) {
            if (!title) return;
            
            var newPageNum = pptState.outline.length + 1;
            var newIndex = pptState.outline.length;
            
            pptState.outline.push({
                number: newPageNum,
                title: title,
                content: []
            });
            pptState.pages.push(null);
            
            renderEditorPagesList();
            selectPage(newIndex);
            saveDraft();
            
            // 自动生成新页面内容
            showEditorLoading(true);
            try {
                await generatePage(newIndex);
                renderEditorPagesList();
                renderEditorPreview(newIndex);
                saveDraft();
                if (global.showMessage) {
                    global.showMessage('新页面已生成', 'success');
                }
            } catch (e) {
                console.error('生成页面失败', e);
                if (global.showMessage) {
                    global.showMessage('页面生成失败', 'error');
                }
            } finally {
                showEditorLoading(false);
            }
        });
    }

    // 下载PPT
    async function downloadPPT() {
        var ungeneratedPages = [];
        for (var i = 0; i < pptState.pages.length; i++) {
            if (!pptState.pages[i]) {
                ungeneratedPages.push(i + 1);
            }
        }
        
        if (ungeneratedPages.length > 0) {
            showCustomConfirm(
                '第' + ungeneratedPages.join(', ') + '页尚未生成，是否继续？',
                function() {
                    doDownloadPPT();
                }
            );
        } else {
            doDownloadPPT();
        }
    }

    // 实际下载 - 调用后端 API 生成 PPT
    async function doDownloadPPT() {
        var btn = document.getElementById('pptEditorDownload');
        if (!btn) return;

        var originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 生成中...';

        try {
            // 准备请求数据
            var exportData = {
                topic: pptState.topic || 'PPT',
                pages: pptState.pages,
                outline: pptState.outline,
                ratio: pptState.ratio
            };

            // 调用后端 API
            var apiUrl = (global.getApiBaseUrl ? global.getApiBaseUrl() : '/api') + '/ppt-export';

            var response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + (g('currentUser') ? (g('currentUser').token || g('currentUser').username) : '')
                },
                body: JSON.stringify(exportData)
            });

            if (!response.ok) {
                // 尝试解析错误信息
                var errorData;
                try {
                    errorData = await response.json();
                } catch (e) {
                    throw new Error('HTTP ' + response.status);
                }
                throw new Error(errorData.message || '导出失败');
            }

            // 获取文件名
            var contentDisposition = response.headers.get('Content-Disposition');
            var fileName = pptState.topic || 'PPT';
            if (contentDisposition) {
                var filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
                if (filenameMatch) {
                    fileName = decodeURIComponent(filenameMatch[1].replace(/['"]/g, ''));
                }
            }
            fileName = fileName.replace(/\.pptx$/i, '') + '.pptx';

            // 下载文件
            var blob = await response.blob();
            var url = window.URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);

            if (global.showMessage) {
                global.showMessage('PPT下载成功', 'success');
            }
            clearDraft();
        } catch (e) {
            console.error('Failed to generate PPT:', e);
            if (global.showMessage) {
                global.showMessage('PPT生成失败：' + e.message, 'error');
            }
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    }

    // 保存草稿
    function saveDraft() {
        var draft = {
            topic: pptState.topic,
            outline: pptState.outline,
            pages: pptState.pages,
            ratio: pptState.ratio,
            source: pptState.source,
            colorScheme: pptState.colorScheme,
            timestamp: new Date().toISOString()
        };
        localStorage.setItem(pptState.cacheKey + 'draft', JSON.stringify(draft));
    }

    // 检查缓存
    function checkCachedDraft() {
        var draftStr = localStorage.getItem(pptState.cacheKey + 'draft');
        if (draftStr) {
            try {
                var draft = JSON.parse(draftStr);
                var time = new Date(draft.timestamp);
                if ((new Date() - time) / (1000 * 60 * 60) < 24) {
                    showCustomConfirm(
                        '发现未保存的PPT草稿，创建于' + time.toLocaleString() + '，是否继续编辑？',
                        function() {
                            pptState.topic = draft.topic || '';
                            pptState.outline = draft.outline || [];
                            pptState.pages = draft.pages || [];
                            pptState.ratio = draft.ratio || '16:9';
                            pptState.source = draft.source || 'current';
                            pptState.colorScheme = draft.colorScheme || 'white-black';
                            
                            var input = document.getElementById('aiPPTInput');
                            if (input && pptState.outline) {
                                input.value = pptState.outline.map(function(p) {
                                    return '第' + p.number + '页：' + p.title + '\n' + p.content.map(function(c) { return '要点：' + c; }).join('\n');
                                }).join('\n\n');
                            }
                            
                            updateSourceUI();
                            renderOutlinePreview();
                            showPPTStep('outline');
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

    // 清除草稿
    function clearDraft() {
        localStorage.removeItem(pptState.cacheKey + 'draft');
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
            body: JSON.stringify({ prompt: prompt, content: content })
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

    // 自定义确认对话框
    function showCustomConfirm(message, onConfirm, onCancel) {
        var overlay = document.createElement('div');
        overlay.className = 'confirm-overlay';
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:10005;';
        
        var isNightMode = document.body.classList.contains('night-mode');
        var bgColor = isNightMode ? '#2d2d2d' : 'white';
        var textColor = isNightMode ? '#eee' : '#333';
        var borderColor = isNightMode ? '#555' : '#ddd';
        var cancelBg = isNightMode ? 'transparent' : 'transparent';
        var cancelColor = isNightMode ? '#aaa' : '#666';
        
        overlay.innerHTML = `
            <div class="confirm-dialog" style="background:${bgColor};color:${textColor};padding:25px;border-radius:12px;max-width:400px;width:90%;box-shadow:0 10px 40px rgba(0,0,0,0.3);">
                <p style="margin:0 0 20px 0;font-size:15px;line-height:1.6;">${escapeHtml(message)}</p>
                <div style="display:flex;gap:10px;justify-content:flex-end;">
                    <button class="confirm-cancel" style="padding:10px 20px;background:${cancelBg};border:1px solid ${borderColor};border-radius:6px;cursor:pointer;font-size:14px;color:${cancelColor};">取消</button>
                    <button class="confirm-ok" style="padding:10px 20px;background:#4a90e2;color:white;border:none;border-radius:6px;cursor:pointer;font-size:14px;">确认</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(overlay);
        
        overlay.querySelector('.confirm-cancel').addEventListener('click', function() {
            document.body.removeChild(overlay);
            if (onCancel) onCancel();
        });
        
        overlay.querySelector('.confirm-ok').addEventListener('click', function() {
            document.body.removeChild(overlay);
            if (onConfirm) onConfirm();
        });
    }

    // 自定义输入对话框
    function showCustomPrompt(message, defaultValue, onConfirm) {
        var overlay = document.createElement('div');
        overlay.className = 'prompt-overlay';
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:10005;';
        
        var isNightMode = document.body.classList.contains('night-mode');
        var bgColor = isNightMode ? '#2d2d2d' : 'white';
        var textColor = isNightMode ? '#eee' : '#333';
        var borderColor = isNightMode ? '#555' : '#ddd';
        var inputBg = isNightMode ? '#3d3d3d' : 'white';
        var inputColor = isNightMode ? '#eee' : '#333';
        var cancelColor = isNightMode ? '#aaa' : '#666';
        
        overlay.innerHTML = `
            <div class="prompt-dialog" style="background:${bgColor};color:${textColor};padding:25px;border-radius:12px;max-width:500px;width:90%;box-shadow:0 10px 40px rgba(0,0,0,0.3);">
                <p style="margin:0 0 15px 0;font-size:15px;">${escapeHtml(message)}</p>
                <textarea class="prompt-input" style="width:100%;min-height:100px;padding:12px;border:1px solid ${borderColor};border-radius:8px;font-size:14px;resize:vertical;margin-bottom:15px;background:${inputBg};color:${inputColor};">${escapeHtml(defaultValue || '')}</textarea>
                <div style="display:flex;gap:10px;justify-content:flex-end;">
                    <button class="prompt-cancel" style="padding:10px 20px;background:transparent;border:1px solid ${borderColor};border-radius:6px;cursor:pointer;font-size:14px;color:${cancelColor};">取消</button>
                    <button class="prompt-ok" style="padding:10px 20px;background:#4a90e2;color:white;border:none;border-radius:6px;cursor:pointer;font-size:14px;">确定</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(overlay);
        
        var input = overlay.querySelector('.prompt-input');
        input.focus();
        input.select();
        
        overlay.querySelector('.prompt-cancel').addEventListener('click', function() {
            document.body.removeChild(overlay);
            if (onConfirm) onConfirm(null);
        });
        
        overlay.querySelector('.prompt-ok').addEventListener('click', function() {
            var value = input.value;
            document.body.removeChild(overlay);
            if (onConfirm) onConfirm(value);
        });
    }

    // 规范化 AI 返回的 HTML，避免代码块/实体转义导致预览显示原始代码
    function normalizePptHtml(rawHtml) {
        if (!rawHtml || typeof rawHtml !== 'string') return '';

        var html = rawHtml.trim();

        // 移除 markdown 代码块包裹
        html = html.replace(/^```(?:html)?\s*/i, '').replace(/\s*```\s*$/i, '');

        // 先尝试解码一次实体，处理 &lt;div&gt; 这类返回
        if (html.indexOf('&lt;') !== -1 || html.indexOf('&gt;') !== -1 || html.indexOf('&amp;') !== -1) {
            html = decodeHtmlEntities(html);
        }

        // 移除整页包装标签，保留 body 内部内容
        html = html.replace(/<html[^>]*>|<\/html>/gi, '');
        html = html.replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '');
        html = html.replace(/<body[^>]*>|<\/body>/gi, '');

        // 若仍是纯文本且看起来像被转义的 HTML，再解码一次
        if (!/<[a-z][\s\S]*>/i.test(html) && /&lt;\/?[a-z]/i.test(html)) {
            html = decodeHtmlEntities(html);
        }

        return html.trim();
    }

    function decodeHtmlEntities(text) {
        if (!text) return '';
        var textarea = document.createElement('textarea');
        textarea.innerHTML = text;
        return textarea.value;
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
        clearDraft: clearDraft
    };

})(typeof window !== 'undefined' ? window : this);
