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
        pages: [],              // 每页 Slide DSL JSON
        currentPage: 0,         // 当前编辑的页面
        isGenerating: false,    // 是否正在生成
        ratio: '16:9',          // PPT比例
        topic: '',              // 主题
        source: 'current',      // 生成方式: current(本文件) / topic(主题)
        cacheKey: '.ppt_draft_', // 缓存键前缀
        colorScheme: 'white-black', // 配色方案: white-black, black-white, traffic-light, traditional, business
        isAcademic: false
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
                            parseOutline(newOutline, {
                                topic: pptState.topic,
                                isAcademic: pptState.isAcademic
                            });
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
        pptState.isAcademic = detectAcademicContext([pptState.topic, fileContent, input].join('\n'));
        
        var btn = document.getElementById('aiPPTGenerateOutline');
        var originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 生成中...';

        try {
            if (input && input.includes('第') && input.includes('页')) {
                parseOutline(input, {
                    topic: pptState.topic,
                    isAcademic: pptState.isAcademic
                });
            } else {
                // 构建提示词
                var prompt = buildOutlinePrompt(topic, fileContent, input);
                var result = await callAIAPI(prompt, '');
                document.getElementById('aiPPTInput').value = result;
                parseOutline(result, {
                    topic: pptState.topic,
                    isAcademic: pptState.isAcademic
                });
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
        var contextText = [topic || '', fileContent || '', userOutline || ''].join('\n');
        var isAcademic = detectAcademicContext(contextText);
        var prompt = '';
        
        if (pptState.source === 'current' && fileContent) {
            prompt = `请根据以下文件内容生成一个PPT大纲，页数由内容复杂度自动决定（5-30页）。

文件内容：
${fileContent.substring(0, 3000)}

${topic ? 'PPT主题：' + topic : ''}

要求：
1. 必须包含：封面页、目录页、正文页、致谢页。
2. ${isAcademic ? '如果是正式的学术/研究类主题，增加参考资料页（放在致谢前）' : '请根据是否是正式的学术或研究内容选择是否添加参考资料页'}
3. 页数按信息量决定，最少5页，最多30页。
4. 每页标题必须具体，不能使用“标题”“内容页”等空泛词。
5. 正文页每页2-5个要点，至少2个，避免重复。
6. 目录页的要点应列出主要章节，不要写空话。

输出格式：
第1页：封面页标题
要点1：具体内容
要点2：具体内容

第2页：目录
要点1：章节A
要点2：章节B

第3页：具体章节标题
要点1：具体内容
要点2：具体内容

...（按需扩展）

最后1页：致谢
要点1：感谢语/问答引导

${isAcademic ? '倒数第2页：参考资料\n要点1：文献1\n要点2：文献2\n' : ''}

参考资料必须是正确的参考资料格式，给出准确的来源。请只输出大纲正文，不要解释。`;
        } else {
            prompt = `请为主题"${topic}"生成一个详细的PPT大纲，页数由内容复杂度自动决定（5-30页）。

${userOutline ? '用户提供的参考大纲：\n' + userOutline + '\n\n' : ''}

要求：
1. 必须包含：封面页、目录页、正文页、致谢页。
2. ${isAcademic ? '如果是正式的学术/研究类主题，增加参考资料页（放在致谢前）' : '请根据是否是正式的学术或研究内容选择是否添加参考资料页'}
3. 页数不要凑数，按信息量决定，最少5页，最多30页。
4. 每页标题必须具体，不能使用“标题”“内容页”等空泛词。
5. 正文页每页2-5个要点，至少2个，避免重复。
6. 目录页的要点应列出主要章节，不要写空话。

输出格式：
第1页：封面页标题
要点1：具体内容
要点2：具体内容

第2页：目录
要点1：章节A
要点2：章节B

第3页：具体章节标题
要点1：具体内容
要点2：具体内容

...（按需扩展）

最后1页：致谢
要点：感谢语

${isAcademic ? '倒数第2页：参考资料\n要点1：文献1\n要点2：文献2\n' : ''}

请只输出大纲正文，不要解释。`;
        }
        
        return prompt;
    }

    // 解析大纲
    function parseOutline(text, options) {
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

        pages = normalizeOutlinePages(pages, options || {});
        
        pptState.outline = pages;
        pptState.pages = new Array(pages.length).fill(null);
    }

    function detectAcademicContext(text) {
        if (!text) return false;
        var source = String(text).toLowerCase();
        return /(论文|研究|实验|文献|参考资料|学术|模型|方法|study|research|paper|dataset|methodology|reference)/.test(source);
    }

    function normalizeOutlinePages(rawPages, options) {
        var pages = Array.isArray(rawPages) ? rawPages.map(function(page, idx) {
            return {
                number: idx + 1,
                title: sanitizePageText(page && page.title ? page.title : ('第' + (idx + 1) + '页')),
                content: Array.isArray(page && page.content) ? page.content.map(sanitizePageText).filter(Boolean).slice(0, 5) : [],
                role: inferPageRole(page && page.title ? page.title : '', idx)
            };
        }).filter(function(p) {
            return p.title;
        }) : [];

        var topic = sanitizePageText(options.topic || pptState.topic || 'PPT演示');
        var isAcademic = typeof options.isAcademic === 'boolean' ? options.isAcademic : detectAcademicContext(topic + '\n' + JSON.stringify(pages));
        pptState.isAcademic = isAcademic;

        if (!pages.length) {
            pages = [makeOutlinePage(topic, ['演讲主题', '演讲人'], 'cover')];
        }

        var coverIndex = findPageIndexByRole(pages, 'cover');
        if (coverIndex === -1) {
            pages.unshift(makeOutlinePage(topic, ['演讲主题', '演讲人'], 'cover'));
        } else if (coverIndex > 0) {
            pages.unshift(pages.splice(coverIndex, 1)[0]);
        }

        if (!pages[0].title || /^(封面|标题|首页)$/i.test(pages[0].title)) {
            pages[0].title = topic || '主题汇报';
        }
        pages[0].role = 'cover';

        var tocIndex = findPageIndexByRole(pages, 'toc');
        if (tocIndex === -1) {
            pages.splice(1, 0, makeOutlinePage('目录', [], 'toc'));
        } else if (tocIndex !== 1) {
            pages.splice(1, 0, pages.splice(tocIndex, 1)[0]);
        }

        var thanksIndex = findPageIndexByRole(pages, 'thanks');
        if (thanksIndex === -1) {
            pages.push(makeOutlinePage('致谢', ['感谢聆听', '欢迎提问交流'], 'thanks'));
        } else if (thanksIndex !== pages.length - 1) {
            pages.push(pages.splice(thanksIndex, 1)[0]);
        }

        if (isAcademic) {
            var refIndex = findPageIndexByRole(pages, 'references');
            var lastIndex = pages.length - 1;
            if (refIndex === -1) {
                pages.splice(lastIndex, 0, makeOutlinePage('参考资料', ['文献来源1', '文献来源2'], 'references'));
            } else if (refIndex > lastIndex - 1) {
                pages.splice(lastIndex, 0, pages.splice(refIndex, 1)[0]);
            }
        }

        while (pages.length < 5) {
            var insertPos = pages.length - 1;
            if (isAcademic && insertPos > 0 && pages[insertPos - 1].role === 'references') {
                insertPos -= 1;
            }
            pages.splice(insertPos, 0, makeOutlinePage('核心内容 ' + insertPos, ['关键观点', '案例支撑', '阶段结论'], 'body'));
        }

        if (pages.length > 30) {
            var fixed = [];
            fixed.push(pages[0]);
            fixed.push(pages[1]);
            var tail = [];
            if (isAcademic) {
                var refPage = pages.find(function(p) { return p.role === 'references'; });
                if (refPage) tail.push(refPage);
            }
            tail.push(pages[pages.length - 1]);

            var bodyPages = pages.slice(2, pages.length - 1).filter(function(p) {
                return p.role !== 'references' && p.role !== 'thanks' && p.role !== 'cover' && p.role !== 'toc';
            });
            var maxBody = Math.max(0, 30 - fixed.length - tail.length);
            pages = fixed.concat(bodyPages.slice(0, maxBody)).concat(tail);
        }

        var bodyTitles = pages.filter(function(p) {
            return p.role !== 'cover' && p.role !== 'toc' && p.role !== 'thanks' && p.role !== 'references';
        }).map(function(p) {
            return p.title;
        }).slice(0, 8);

        if (pages[1]) {
            pages[1].title = '目录';
            pages[1].role = 'toc';
            pages[1].content = bodyTitles.length ? bodyTitles : ['背景与目标', '核心内容', '总结'];
        }

        for (var i = 0; i < pages.length; i++) {
            pages[i].number = i + 1;
            if (!pages[i].role || pages[i].role === 'body') {
                pages[i].role = inferPageRole(pages[i].title || '', i, pages.length, isAcademic);
            }
        }

        return pages;
    }

    function makeOutlinePage(title, content, role) {
        return {
            number: 0,
            title: sanitizePageText(title || ''),
            content: Array.isArray(content) ? content.map(sanitizePageText).filter(Boolean) : [],
            role: role || 'body'
        };
    }

    function findPageIndexByRole(pages, role) {
        for (var i = 0; i < pages.length; i++) {
            if (pages[i] && pages[i].role === role) return i;
        }
        return -1;
    }

    function inferPageRole(title, index, total, isAcademic) {
        var t = String(title || '').toLowerCase();
        if (index === 0 || /(封面|标题|开场|title slide|cover)/.test(t)) return 'cover';
        if (index === 1 || /(目录|议程|agenda|contents?)/.test(t)) return 'toc';
        if (/(致谢|感谢|thanks|thank you|q&a)/.test(t) || index === total - 1) return 'thanks';
        if ((isAcademic || /(论文|研究|study|paper|research)/.test(t)) && /(参考|文献|references?|bibliography)/.test(t)) return 'references';
        return 'body';
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
        var pageRole = page.role || inferPageRole(pageTitle, index, (pptState.outline || []).length, pptState.isAcademic);
        var preferredLayout = suggestLayoutForPage(page, index, (pptState.outline || []).length);

        var prompt = buildPageJsonPrompt(page, pageTitle, aspectRatio, {
            bgColor: bgColor,
            textColor: textColor,
            subtitleColor: subtitleColor,
            accentColor: accentColor,
            schemeName: scheme.name
        }, {
            role: pageRole,
            preferredLayout: preferredLayout
        });

        var aiResult = await callAIAPI(prompt, '');
        var pageJson = parsePptPageJson(aiResult, page, pageTitle, index, preferredLayout, pageRole);

        // 验证并修复内容
        pageJson = validateAndFixContent(pageJson, page);

        pageJson.role = pageRole;
        pageJson.themeToken = pptState.colorScheme;
        pageJson.scheme = {
            bgColor: bgColor,
            textColor: textColor,
            subtitleColor: subtitleColor,
            accentColor: accentColor,
            schemeName: scheme.name
        };

        // 智能配图：对于 image-left 和 image-right 布局，自动搜索图片
        if ((preferredLayout === 'image-left' || preferredLayout === 'image-right') && !pageJson.image) {
            try {
                // 1. 提取关键词
                var keywordsResponse = await fetch('/api/pexels/extract-keywords', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        pageTitle: pageTitle,
                        pageContent: page.content
                    })
                });
                var keywordsData = await keywordsResponse.json();

                if (keywordsData.code === 200 && keywordsData.data) {
                    // 2. 搜索图片
                    var imagesResponse = await fetch('/api/pexels/search-images', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            keywords: keywordsData.data,
                            perPage: 3
                        })
                    });
                    var imagesData = await imagesResponse.json();

                    if (imagesData.code === 200 && imagesData.data && imagesData.data.length > 0) {
                        // 3. 选择第一张图片
                        var selectedImage = imagesData.data[0];

                        // 4. 下载并转换为 base64
                        var imageBase64 = await downloadImageAsBase64(selectedImage.url);

                        if (imageBase64) {
                            pageJson.image = {
                                url: imageBase64,
                                caption: selectedImage.alt || pageTitle,
                                fit: 'cover'
                            };
                        }
                    }
                }
            } catch (error) {
                console.error('Failed to add smart image:', error);
                // 配图失败不影响页面生成
            }
        }

        pptState.pages[index] = pageJson;
    }

        function suggestLayoutForPage(page, index, total) {
                var role = page && page.role ? page.role : inferPageRole(page && page.title ? page.title : '', index, total, pptState.isAcademic);
                if (role === 'cover') return 'cover';
                if (role === 'toc') return 'toc';
                if (role === 'thanks') return 'thanks';
                if (role === 'references') return 'references';

                var title = String((page && page.title) || '').toLowerCase();
                if (/(时间|里程碑|阶段|进展|timeline|roadmap)/.test(title)) return 'timeline';
                if (/(对比|比较|差异|优劣|vs|versus)/.test(title)) return 'comparison';
                if (/(数据|指标|统计|增长|结果|kpi|metric|result)/.test(title)) return 'stats';
                if (/(总结|结论|启示|观点|takeaway|conclusion)/.test(title)) return 'quote';
                if (/(架构|模块|框架|体系|组成|structure|architecture)/.test(title)) return 'two-column';
                if (/(案例|产品|图示|图片|界面|demo|screenshot)/.test(title)) return index % 2 === 0 ? 'image-left' : 'image-right';

                var cycle = ['image-left', 'content', 'image-right', 'two-column', 'image-left', 'timeline', 'image-right', 'comparison', 'image-left', 'stats', 'image-right', 'quote'];
                return cycle[index % cycle.length];
        }

        function buildPageJsonPrompt(page, pageTitle, aspectRatio, scheme, pageMeta) {
        var points = (page.content || []).slice(0, 6).map(function(item, idx) {
            return '- 要点' + (idx + 1) + ': ' + item;
        }).join('\n');

                return `你是PPT内容助手。请根据以下信息生成单页内容，必须返回纯 JSON，不要返回 HTML/Markdown/解释。

页面主题：${pageTitle}
页面要点：
${points || '- 无'}
画面比例：${aspectRatio}
页面角色：${pageMeta && pageMeta.role ? pageMeta.role : 'body'}
建议布局：${pageMeta && pageMeta.preferredLayout ? pageMeta.preferredLayout : 'content'}
配色参考：${scheme.schemeName}（主色 ${scheme.bgColor}，文字 ${scheme.textColor}，强调 ${scheme.accentColor}）

硬性要求：
1. 仅输出一个 JSON 对象，不要代码块。
2. 字段中的文案禁止出现”第x页””第1页””第2页”等页码描述。
3. 文案简洁，主点不超过60字，二级点不超过45字。
4. layout 只能是 “cover”、”toc”、”content”、”two-column”、”image-left”、”image-right”、”timeline”、”comparison”、”stats”、”quote”、”references”、”thanks” 之一。
5. bullets 最多 8 条，每条允许最多 2 条 subBullets。
6. 如果没有可靠图片链接，image 填 null。
7. role 为 toc 时优先产出 sections；role 为 stats 时优先产出 stats；role 为 quote 时提供 quote 且 author 必须填写（可以是主题名或”佚名”）；role 为 references 时给出具体文献列表的 sections 或 bullets，不能为空。
8. stats 的 label 必须是具体指标名称，禁止使用”指标1”、”指标2”、”指标”、”数据A”等占位符。
   正确示例：label: “用户增长率”, “月活跃用户”, “客户满意度”, “转化率”
   错误示例：label: “指标1”, “指标2”, “指标”, “数据A”, “KPI1”
9. sections 的 title 必须是具体章节名称，禁止使用”方案A”、”方案B”、”维度1”、”章节”等占位符。
   正确示例：title: “技术架构方案”, “市场推广策略”, “成本控制措施”
   错误示例：title: “方案A”, “方案B”, “维度1”, “章节”, “部分1”
10. bullets 的 text 必须是完整句子或短语，内容具体，长度适中（10-60字）。
    禁止过短（<8字）。
    禁止使用”内容1”、”要点A”等占位符。
11. 所有文本内容必须与页面主题紧密相关，不能是泛泛而谈的通用内容。
12. quote 的 author 字段不能为空，如果没有明确作者，填写页面主题或”佚名”。
13. references 页面必须提供具体的参考文献列表，不能留空，至少提供3条相关文献。

JSON 结构：
{
    "layout": "${pageMeta && pageMeta.preferredLayout ? pageMeta.preferredLayout : 'content'}",
    "role": "${pageMeta && pageMeta.role ? pageMeta.role : 'body'}",
    "themeToken": "${pptState.colorScheme}",
  "title": "",
  "subtitle": "",
    "highlights": ["", ""],
    "bullets": [
        {
            "text": "",
            "subBullets": ["", ""]
        }
    ],
    "sections": [
        {
            "title": "",
            "items": ["", ""]
        }
    ],
    "stats": [
        {
            "label": "",
            "value": "",
            "note": ""
        }
    ],
    "quote": {
        "text": "",
        "author": ""
    },
    "image": {
        "url": "",
        "caption": "",
        "fit": "contain"
    }
}`;
    }

        function parsePptPageJson(raw, page, fallbackTitle, index, expectedLayout, expectedRole) {
        var fallback = {
                        layout: expectedLayout || (index === 0 ? 'cover' : 'content'),
                        role: expectedRole || (page && page.role ? page.role : 'body'),
            themeToken: pptState.colorScheme,
            title: sanitizePageText(fallbackTitle || page.title || ''),
            subtitle: '',
            bullets: (page.content || []).slice(0, 6).map(function(item) {
                return { text: sanitizePageText(item), subBullets: [] };
            }).filter(function(item) {
                return item.text;
            }),
                        highlights: (page.content || []).slice(0, 3).map(sanitizePageText).filter(Boolean),
                        sections: [],
                        stats: [],
                        quote: null,
            image: null
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
        var role = sanitizePageText(readStringField(parsed, ['role', 'pageRole'])).toLowerCase() || fallback.role;
        var validLayouts = ['cover', 'toc', 'content', 'two-column', 'image-left', 'image-right', 'timeline', 'comparison', 'stats', 'quote', 'references', 'thanks'];
        if (validLayouts.indexOf(layout) === -1) {
            layout = fallback.layout;
        }

        if (role === 'cover') layout = 'cover';
        if (role === 'toc') layout = 'toc';
        if (role === 'thanks') layout = 'thanks';
        if (role === 'references') layout = 'references';

        var rawBullets = readArrayField(parsed, ['bullets', 'points', 'items', '要点']);
        var bullets = normalizeBulletItems(rawBullets);
        if (!bullets.length) {
            bullets = fallback.bullets;
        }

        var highlights = normalizeTextArray(readArrayField(parsed, ['highlights', 'keywords', 'tags']), 4);
        var sections = normalizeSections(readArrayField(parsed, ['sections', 'columns', 'groups']));
        var stats = normalizeStats(readArrayField(parsed, ['stats', 'metrics', 'dataCards']));
        var quote = normalizeQuote(parsed.quote || readStringField(parsed, ['quoteText', 'quote']));

        var image = null;
        if (parsed.image && typeof parsed.image === 'object') {
            var imageUrl = sanitizePageText(parsed.image.url || parsed.image.data || '');
            if (imageUrl) {
                image = {
                    url: imageUrl,
                    caption: sanitizePageText(parsed.image.caption || ''),
                    fit: sanitizePageText(parsed.image.fit || '').toLowerCase() === 'cover' ? 'cover' : 'contain'
                };
            }
        }

        return {
            layout: layout,
            role: role,
            themeToken: sanitizePageText(readStringField(parsed, ['themeToken', 'theme'])) || pptState.colorScheme,
            title: sanitizePageText(readStringField(parsed, ['title', '标题'])) || fallback.title,
            subtitle: sanitizePageText(readStringField(parsed, ['subtitle', 'summary', '副标题'])),
            bullets: bullets,
            highlights: highlights,
            sections: sections,
            stats: stats,
            quote: quote,
            image: image
        };
    }

    // 验证并修复 AI 生成的内容，移除占位符
    function validateAndFixContent(pageJson, outlinePage) {
        // 检测占位符模式
        var placeholderPatterns = [
            /指标[0-9一二三四五]/,
            /方案[A-Z一二三四五]/,
            /维度[0-9一二三四五]/,
            /内容[0-9一二三四五]/,
            /要点[A-Z一二三四五]/,
            /章节[0-9一二三四五]/,
            /^指标$/,
            /^方案$/,
            /^维度$/,
            /^内容$/
        ];

        // 验证 stats
        if (pageJson.stats && Array.isArray(pageJson.stats)) {
            pageJson.stats = pageJson.stats.filter(function(stat) {
                if (!stat || !stat.label) return false;
                var hasPlaceholder = placeholderPatterns.some(function(p) {
                    return p.test(stat.label);
                });
                return !hasPlaceholder && stat.label.length >= 3;
            });

            // 如果过滤后为空，使用大纲内容生成
            if (pageJson.stats.length === 0 && outlinePage && outlinePage.content && outlinePage.content.length > 0) {
                pageJson.stats = outlinePage.content.slice(0, 6).map(function(item) {
                    return {
                        label: item.substring(0, 18),
                        value: (Math.floor(Math.random() * 90) + 10) + '%',
                        note: ''
                    };
                });
            }
        }

        // 验证 sections
        if (pageJson.sections && Array.isArray(pageJson.sections)) {
            pageJson.sections = pageJson.sections.filter(function(section) {
                if (!section || !section.title) return false;
                var hasPlaceholder = placeholderPatterns.some(function(p) {
                    return p.test(section.title);
                });
                return !hasPlaceholder && section.title.length >= 3;
            });

            // 如果过滤后为空，使用大纲内容生成
            if (pageJson.sections.length === 0 && outlinePage && outlinePage.content && outlinePage.content.length > 0) {
                pageJson.sections = outlinePage.content.slice(0, 8).map(function(item) {
                    return {
                        title: item.substring(0, 42),
                        items: []
                    };
                });
            }
        }

        // 验证 bullets
        if (pageJson.bullets && Array.isArray(pageJson.bullets)) {
            pageJson.bullets = pageJson.bullets.filter(function(bullet) {
                if (!bullet || !bullet.text) return false;
                var hasPlaceholder = placeholderPatterns.some(function(p) {
                    return p.test(bullet.text);
                });
                return !hasPlaceholder && bullet.text.length >= 5;
            });
        }

        return pageJson;
    }

    // 下载图片并转换为 base64
    async function downloadImageAsBase64(imageUrl) {
        try {
            var response = await fetch(imageUrl);
            var blob = await response.blob();
            return new Promise(function(resolve, reject) {
                var reader = new FileReader();
                reader.onloadend = function() {
                    resolve(reader.result);
                };
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        } catch (error) {
            console.error('Failed to download image:', error);
            return null;
        }
    }

    function renderPageFromJson(pageData, scheme) {
        var activeScheme = scheme || pageData.scheme || colorSchemes[pageData.themeToken] || colorSchemes['white-black'];
        var title = escapeHtml(pageData.title || '');
        var subtitle = escapeHtml(pageData.subtitle || '');
        var bullets = normalizeBulletItems(pageData.bullets);
        var highlights = normalizeTextArray(pageData.highlights || [], 4);
        var sections = normalizeSections(pageData.sections || []);
        var stats = normalizeStats(pageData.stats || []);
        var quote = normalizeQuote(pageData.quote || null);
        var leftBullets = bullets.slice(0, Math.ceil(bullets.length / 2));
        var rightBullets = bullets.slice(Math.ceil(bullets.length / 2));
        var image = pageData.image && pageData.image.url ? pageData.image : null;
        var base = 'position:relative;width:100%;height:100%;padding:5.5%;box-sizing:border-box;overflow:hidden;background:linear-gradient(140deg,' + activeScheme.bgColor + ' 0%,' + activeScheme.bgColor + 'dd 60%,' + activeScheme.accentColor + '26 100%);color:' + activeScheme.textColor + ';font-family:Arial,\'Microsoft YaHei\',sans-serif;';
        var deco = '<div style="position:absolute;left:0;top:0;width:1.8%;height:100%;background:' + activeScheme.accentColor + '66;"></div>'
            + '<div style="position:absolute;right:-5%;top:-8%;width:30%;height:42%;border-radius:999px;background:' + activeScheme.accentColor + '2b;"></div>'
            + '<div style="position:absolute;right:0;bottom:0;width:22%;height:12%;background:' + activeScheme.accentColor + '44;border-top-left-radius:18px;"></div>';

        if (pageData.layout === 'cover') {
            return '<div style="' + base + 'display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;gap:2.5%;">'
                + deco
                + '<h1 style="margin:0;font-size:5.2vw;line-height:1.2;max-width:90%;">' + title + '</h1>'
                + (subtitle ? '<p style="margin:0;font-size:2.1vw;color:' + activeScheme.subtitleColor + ';max-width:78%;">' + subtitle + '</p>' : '')
                + (highlights.length ? '<div style="display:flex;flex-wrap:wrap;justify-content:center;gap:1.2%;margin-top:1%;">' + highlights.map(function(item) {
                    return '<span style="padding:0.55% 1.2%;border-radius:999px;background:' + activeScheme.accentColor + '2f;font-size:1.4vw;">' + escapeHtml(item) + '</span>';
                }).join('') + '</div>' : '')
                + (bullets.length ? '<div style="display:flex;flex-direction:column;gap:1.4%;max-width:82%;position:relative;z-index:1;">' + bullets.slice(0, 3).map(function(item) {
                    return '<div style="padding:0.8% 1.3%;border-radius:10px;background:rgba(255,255,255,0.16);border:1px solid rgba(255,255,255,0.24);font-size:1.8vw;color:' + activeScheme.textColor + ';">• ' + escapeHtml(item.text) + '</div>';
                }).join('') + '</div>' : '')
                + '</div>';
        }

        if (pageData.layout === 'toc') {
            var tocItems = (sections.length ? sections.map(function(sec) { return sec.title; }) : bullets.map(function(item) { return item.text; })).slice(0, 10);
            return '<div style="' + base + 'display:flex;flex-direction:column;">'
                + deco
                + '<h1 style="margin:0 0 2.8% 0;font-size:3.9vw;line-height:1.2;">' + title + '</h1>'
                + (subtitle ? '<p style="margin:0 0 2.5% 0;color:' + activeScheme.subtitleColor + ';font-size:1.9vw;">' + subtitle + '</p>' : '')
                + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:2%;height:76%;">'
                + renderTocColumn(tocItems.slice(0, Math.ceil(tocItems.length / 2)), activeScheme, 1)
                + renderTocColumn(tocItems.slice(Math.ceil(tocItems.length / 2)), activeScheme, Math.ceil(tocItems.length / 2) + 1)
                + '</div>'
                + '</div>';
        }

        if (pageData.layout === 'two-column') {
            return '<div style="' + base + 'display:flex;flex-direction:column;">'
                + deco
                + '<h1 style="margin:0 0 2.5% 0;font-size:3.6vw;line-height:1.2;">' + title + '</h1>'
                + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:2.2%;height:80%;">'
                + renderColumnBlock('核心信息', leftBullets, activeScheme)
                + renderColumnBlock('补充信息', rightBullets, activeScheme)
                + '</div>'
                + '</div>';
        }

        if (pageData.layout === 'timeline') {
            var timelineItems = (sections.length ? sections.map(function(sec) {
                return { title: sec.title, desc: (sec.items || []).slice(0, 1).join(' / ') };
            }) : bullets.map(function(item) {
                return { title: item.text, desc: (item.subBullets || []).slice(0, 1).join(' / ') };
            })).slice(0, 6);

            return '<div style="' + base + 'display:flex;flex-direction:column;">'
                + deco
                + '<h1 style="margin:0 0 2.4% 0;font-size:3.7vw;line-height:1.2;">' + title + '</h1>'
                + '<div style="position:relative;height:80%;padding-left:4%;">'
                + '<div style="position:absolute;left:1.2%;top:2%;bottom:2%;width:0.35%;background:' + activeScheme.accentColor + '66;border-radius:6px;"></div>'
                + timelineItems.map(function(item, idx) {
                    return '<div style="position:relative;margin-bottom:2.6%;padding:1.2% 1.6% 1.2% 2.2%;border-radius:12px;background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.2);">'
                        + '<div style="position:absolute;left:-1.55%;top:36%;width:1.1%;height:24%;border-radius:999px;background:' + activeScheme.accentColor + ';"></div>'
                        + '<div style="font-size:2vw;font-weight:600;">' + escapeHtml(item.title) + '</div>'
                        + (item.desc ? '<div style="font-size:1.4vw;color:' + activeScheme.subtitleColor + ';margin-top:0.4%;">' + escapeHtml(item.desc) + '</div>' : '')
                        + '</div>';
                }).join('')
                + '</div>'
                + '</div>';
        }

        if (pageData.layout === 'comparison') {
            var compareSections = sections.length >= 2 ? sections.slice(0, 2) : [
                { title: '方案 A', items: leftBullets.map(function(item) { return item.text; }) },
                { title: '方案 B', items: rightBullets.map(function(item) { return item.text; }) }
            ];
            return '<div style="' + base + 'display:flex;flex-direction:column;">'
                + deco
                + '<h1 style="margin:0 0 2.5% 0;font-size:3.6vw;line-height:1.2;">' + title + '</h1>'
                + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:2.2%;height:80%;">'
                + renderSectionCard(compareSections[0], activeScheme)
                + renderSectionCard(compareSections[1], activeScheme)
                + '</div>'
                + '</div>';
        }

        if (pageData.layout === 'stats') {
            var statItems = stats.slice(0, 6);
            if (!statItems.length) {
                statItems = bullets.slice(0, 4).map(function(item, idx) {
                    return { label: '指标' + (idx + 1), value: item.text, note: (item.subBullets || []).join(' / ') };
                });
            }
            return '<div style="' + base + 'display:flex;flex-direction:column;">'
                + deco
                + '<h1 style="margin:0 0 2.2% 0;font-size:3.7vw;line-height:1.2;">' + title + '</h1>'
                + '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1.6%;height:78%;">'
                + statItems.map(function(item) {
                    return '<div style="padding:8% 7%;border-radius:14px;background:rgba(255,255,255,0.16);border:1px solid rgba(255,255,255,0.22);display:flex;flex-direction:column;justify-content:space-between;">'
                        + '<div style="font-size:1.4vw;color:' + activeScheme.subtitleColor + ';">' + escapeHtml(item.label) + '</div>'
                        + '<div style="font-size:2.8vw;font-weight:700;line-height:1.1;color:' + activeScheme.accentColor + ';">' + escapeHtml(item.value) + '</div>'
                        + '<div style="font-size:1.2vw;color:' + activeScheme.subtitleColor + ';">' + escapeHtml(item.note || '') + '</div>'
                        + '</div>';
                }).join('')
                + '</div>'
                + '</div>';
        }

        if (pageData.layout === 'quote') {
            var quoteText = quote && quote.text ? quote.text : (bullets[0] ? bullets[0].text : title);
            var quoteAuthor = quote && quote.author ? quote.author : '';
            return '<div style=”' + base + 'display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;”>'
                + deco
                + '<div style=”font-size:8vw;line-height:0.8;color:' + activeScheme.accentColor + ';”>”</div>'
                + '<div style=”max-width:84%;font-size:2.8vw;line-height:1.45;font-weight:600;”>' + escapeHtml(quoteText) + '</div>'
                + (quoteAuthor ? '<div style=”margin-top:2%;font-size:1.6vw;color:' + activeScheme.subtitleColor + ';”>—— ' + escapeHtml(quoteAuthor) + '</div>' : '<div style=”margin-top:2%;font-size:1.6vw;color:' + activeScheme.subtitleColor + ';opacity:0.6;”>—— ' + escapeHtml(title) + '</div>')
                + '</div>';
        }

        if (pageData.layout === 'references') {
            var refs = sections.length ? sections.reduce(function(acc, sec) {
                return acc.concat(sec.items || []);
            }, []) : bullets.map(function(item) { return item.text; });
            refs = refs.slice(0, 10);
            return '<div style="' + base + 'display:flex;flex-direction:column;">'
                + deco
                + '<h1 style="margin:0 0 2.4% 0;font-size:3.6vw;line-height:1.2;">' + title + '</h1>'
                + '<ol style="margin:0;padding:0 0 0 1.5em;display:flex;flex-direction:column;gap:1.1%;">'
                + refs.map(function(item) {
                    return '<li style="font-size:1.45vw;line-height:1.35;padding:0.65% 1%;border-radius:8px;background:rgba(255,255,255,0.12);">' + escapeHtml(item) + '</li>';
                }).join('')
                + '</ol>'
                + '</div>';
        }

        if (pageData.layout === 'thanks') {
            return '<div style="' + base + 'display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;gap:2%;">'
                + deco
                + '<h1 style="margin:0;font-size:5vw;line-height:1.15;">' + title + '</h1>'
                + (subtitle ? '<p style="margin:0;font-size:2vw;color:' + activeScheme.subtitleColor + ';">' + subtitle + '</p>' : '')
                + '<div style="font-size:1.8vw;color:' + activeScheme.accentColor + ';">Q & A</div>'
                + '</div>';
        }

        if ((pageData.layout === 'image-left' || pageData.layout === 'image-right') && image) {
            var imageBlock = '<div style="width:34%;height:100%;border-radius:14px;overflow:hidden;background:rgba(255,255,255,0.14);display:flex;align-items:center;justify-content:center;">'
                + '<img src="' + escapeHtml(image.url) + '" style="max-width:100%;max-height:100%;object-fit:contain;" />'
                + '</div>';
            var textBlock = '<div style="width:64%;display:flex;flex-direction:column;gap:1.8%;">'
                + (bullets.length ? bullets.map(function(item) {
                    var subs = (item.subBullets || []).map(function(sub) {
                        return '<div style="font-size:1.5vw;line-height:1.3;color:' + activeScheme.subtitleColor + ';margin-top:0.5%;">- ' + escapeHtml(sub) + '</div>';
                    }).join('');
                    return '<div style="padding:1.4% 1.8%;border-radius:12px;background:rgba(255,255,255,0.14);border-left:0.35vw solid ' + activeScheme.accentColor + ';">'
                        + '<div style="font-size:2.1vw;line-height:1.35;color:' + activeScheme.textColor + ';">' + escapeHtml(item.text) + '</div>'
                        + subs
                        + '</div>';
                }).join('') : '<div style="font-size:2.1vw;color:' + activeScheme.subtitleColor + ';">暂无要点</div>')
                + (image.caption ? '<div style="font-size:1.4vw;color:' + activeScheme.subtitleColor + ';margin-top:1%;">' + escapeHtml(image.caption) + '</div>' : '')
                + '</div>';

            return '<div style="' + base + 'display:flex;flex-direction:column;">'
                + deco
                + '<h1 style="margin:0 0 2.2% 0;font-size:3.8vw;line-height:1.2;">' + title + '</h1>'
                + (subtitle ? '<p style="margin:0 0 2.8% 0;color:' + activeScheme.subtitleColor + ';font-size:2vw;">' + subtitle + '</p>' : '')
                + '<div style="display:flex;gap:2%;height:75%;">'
                + (pageData.layout === 'image-left' ? (imageBlock + textBlock) : (textBlock + imageBlock))
                + '</div>'
                + '</div>';
        }

        return '<div style="' + base + 'display:flex;flex-direction:column;">'
            + deco
            + '<h1 style="margin:0 0 2.2% 0;font-size:3.8vw;line-height:1.2;">' + title + '</h1>'
            + (subtitle ? '<p style="margin:0 0 2.8% 0;color:' + activeScheme.subtitleColor + ';font-size:2vw;">' + subtitle + '</p>' : '')
            + (highlights.length ? '<div style="display:flex;flex-wrap:wrap;gap:1%;margin:0 0 2.1% 0;">' + highlights.map(function(item) {
                return '<span style="padding:0.45% 1%;border-radius:999px;background:' + activeScheme.accentColor + '2f;font-size:1.35vw;">' + escapeHtml(item) + '</span>';
            }).join('') + '</div>' : '')
            + '<div style="display:flex;flex-direction:column;gap:1.8%;">'
            + (bullets.length ? bullets.map(function(item) {
                var subs = (item.subBullets || []).map(function(sub) {
                    return '<div style="font-size:1.5vw;line-height:1.3;color:' + activeScheme.subtitleColor + ';margin-top:0.5%;">- ' + escapeHtml(sub) + '</div>';
                }).join('');
                return '<div style="display:flex;align-items:flex-start;gap:1.2%;padding:1.4% 1.8%;border-radius:12px;background:rgba(255,255,255,0.14);border-left:0.35vw solid ' + activeScheme.accentColor + ';">'
                    + '<span style="font-size:2.1vw;color:' + activeScheme.accentColor + ';line-height:1;">▸</span>'
                    + '<span style="font-size:2.1vw;line-height:1.35;color:' + activeScheme.textColor + ';">' + escapeHtml(item.text) + subs + '</span>'
                    + '</div>';
            }).join('') : '<div style="font-size:2.1vw;color:' + activeScheme.subtitleColor + ';">暂无要点</div>')
            + '</div>'
            + '</div>';
    }

    function renderTocColumn(items, scheme, startNo) {
        if (!items.length) {
            return '<div style="padding:5%;border-radius:12px;background:rgba(255,255,255,0.13);">暂无章节</div>';
        }
        return '<div style="padding:5%;border-radius:12px;background:rgba(255,255,255,0.13);border:1px solid rgba(255,255,255,0.2);display:flex;flex-direction:column;gap:1.2%;">'
            + items.map(function(item, idx) {
                return '<div style="display:flex;align-items:center;gap:1.1%;font-size:1.75vw;line-height:1.3;">'
                    + '<span style="display:inline-flex;align-items:center;justify-content:center;width:1.6em;height:1.6em;border-radius:999px;background:' + scheme.accentColor + '38;color:' + scheme.textColor + ';font-size:0.75em;">' + (startNo + idx) + '</span>'
                    + '<span>' + escapeHtml(item) + '</span>'
                    + '</div>';
            }).join('')
            + '</div>';
    }

    function renderSectionCard(section, scheme) {
        section = section || { title: '', items: [] };
        var items = Array.isArray(section.items) ? section.items : [];
        return '<div style="background:rgba(255,255,255,0.14);border:1px solid rgba(255,255,255,0.18);border-radius:14px;padding:4.2% 4.8%;overflow:hidden;">'
            + '<h3 style="margin:0 0 3% 0;font-size:2.2vw;color:' + scheme.accentColor + ';">' + escapeHtml(section.title || '维度') + '</h3>'
            + '<ul style="margin:0;padding-left:1.4em;display:flex;flex-direction:column;gap:0.8%;">'
            + (items.length ? items.map(function(item) {
                return '<li style="font-size:1.65vw;line-height:1.35;">' + escapeHtml(item) + '</li>';
            }).join('') : '<li style="font-size:1.65vw;color:' + scheme.subtitleColor + ';">暂无内容</li>')
            + '</ul>'
            + '</div>';
    }

    function renderColumnBlock(title, items, scheme) {
        var content = items.length ? items.map(function(item) {
            var text = escapeHtml(item.text || '');
            var sub = (item.subBullets || []).map(function(subItem) {
                return '<div style="font-size:1.4vw;color:' + scheme.subtitleColor + ';line-height:1.2;">- ' + escapeHtml(subItem) + '</div>';
            }).join('');
            return '<li style="margin:0 0 1.3% 0;line-height:1.4;font-size:1.85vw;color:' + scheme.textColor + ';">' + text + sub + '</li>';
        }).join('') : '<li style="font-size:1.85vw;color:' + scheme.subtitleColor + ';">暂无内容</li>';
        return '<div style="background:rgba(255,255,255,0.14);border:1px solid rgba(255,255,255,0.18);border-radius:14px;padding:4.2% 4.8%;overflow:hidden;">'
            + '<h3 style="margin:0 0 3% 0;font-size:2.2vw;color:' + scheme.accentColor + ';">' + title + '</h3>'
            + '<ul style="margin:0;padding-left:1.4em;">' + content + '</ul>'
            + '</div>';
    }

    function normalizeBulletItems(items) {
        if (!Array.isArray(items)) return [];
        return items.map(function(item) {
            if (typeof item === 'string') {
                return {
                    text: sanitizePageText(item),
                    subBullets: []
                };
            }
            if (!item || typeof item !== 'object') return null;
            var text = sanitizePageText(item.text || item.title || item.label || '');
            var subs = Array.isArray(item.subBullets)
                ? item.subBullets.map(function(sub) { return sanitizePageText(sub); }).filter(Boolean).slice(0, 2)
                : [];
            if (!text) return null;
            return {
                text: text,
                subBullets: subs
            };
        }).filter(Boolean).slice(0, 12);
    }

    function normalizeSections(items) {
        if (!Array.isArray(items)) return [];
        return items.map(function(item) {
            if (!item || typeof item !== 'object') {
                var line = sanitizePageText(item || '');
                if (!line) return null;
                return { title: line, items: [] };
            }
            var title = sanitizePageText(item.title || item.header || item.name || '');
            var lines = Array.isArray(item.items)
                ? item.items.map(function(it) { return sanitizePageText(it); }).filter(Boolean).slice(0, 5)
                : [];
            if (!title && !lines.length) return null;
            return { title: title || (lines[0] || '章节'), items: lines };
        }).filter(Boolean).slice(0, 8);
    }

    function normalizeStats(items) {
        if (!Array.isArray(items)) return [];
        return items.map(function(item) {
            if (!item || typeof item !== 'object') return null;
            var label = sanitizePageText(item.label || item.name || item.title || '');
            var value = sanitizePageText(item.value || item.data || '');
            var note = sanitizePageText(item.note || item.desc || item.description || '');
            if (!label && !value) return null;
            return {
                label: label || '指标',
                value: value || '--',
                note: note
            };
        }).filter(Boolean).slice(0, 6);
    }

    function normalizeQuote(raw) {
        if (!raw) return null;
        if (typeof raw === 'string') {
            var textOnly = sanitizePageText(raw);
            return textOnly ? { text: textOnly, author: '' } : null;
        }
        if (typeof raw === 'object') {
            var text = sanitizePageText(raw.text || raw.quote || '');
            var author = sanitizePageText(raw.author || raw.from || '');
            if (!text) return null;
            return { text: text, author: author };
        }
        return null;
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
        showCustomPrompt('输入新页面内容：', '', async function(title) {
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
        var pageData = pptState.pages[index];
        var html = '';

        if (pageData && typeof pageData === 'object' && !Array.isArray(pageData)) {
            html = renderPageFromJson(pageData, pageData.scheme || colorSchemes[pageData.themeToken] || colorSchemes[pptState.colorScheme] || colorSchemes['white-black']);
        } else {
            // 兼容旧草稿中的字符串 HTML
            html = normalizePptHtml(pageData);
        }
        
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
                    promptFilenameAndDownloadPPT();
                }
            );
        } else {
            promptFilenameAndDownloadPPT();
        }
    }

    function getDefaultPPTFileName() {
        var defaultName = isEn() ? 'presentation' : '演示文稿';
        var currentFileId = g('currentFileId');
        if (!currentFileId || typeof g('fileTree') === 'undefined') {
            return pptState.topic || defaultName;
        }
        try {
            var currentNode = g('fileTree').jstree(true).get_node(currentFileId);
            if (currentNode && currentNode.text) {
                return currentNode.text.replace(/\.md$/i, '');
            }
        } catch (e) {
            console.error('获取PPT文件名失败:', e);
        }
        return pptState.topic || defaultName;
    }

    function promptFilenameAndDownloadPPT() {
        var defaultFileName = getDefaultPPTFileName();

        if (document && document.activeElement && typeof document.activeElement.blur === 'function') {
            document.activeElement.blur();
        }

        var openFilenameDialog = function() {
            if (typeof global.showFilenameDialog === 'function') {
                global.showFilenameDialog(defaultFileName, 'pptx', function(filename) {
                    doDownloadPPT(filename);
                });
                return;
            }

            showCustomPrompt(isEn() ? 'Enter file name:' : '输入文件名：', defaultFileName, function(filename) {
                if (filename === null) return;
                var finalName = (filename || defaultFileName).trim();
                doDownloadPPT(finalName || defaultFileName);
            });
        };

        openFilenameDialog();
    }

    // 实际下载 - 调用后端 API 生成 PPT
    async function doDownloadPPT(customFilename) {
        var btn = document.getElementById('pptEditorDownload');
        if (!btn) return;

        var originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 生成中...';

        try {
            // 准备请求数据
            var exportData = {
                topic: pptState.topic || 'PPT',
                pages: pptState.pages.map(function(page, idx) {
                    if (page && typeof page === 'object' && !Array.isArray(page)) {
                        return {
                            layout: page.layout || (idx === 0 ? 'cover' : 'content'),
                            role: page.role || (pptState.outline[idx] && pptState.outline[idx].role) || 'body',
                            themeToken: page.themeToken || pptState.colorScheme,
                            title: sanitizePageText(page.title || ''),
                            subtitle: sanitizePageText(page.subtitle || ''),
                            bullets: normalizeBulletItems(page.bullets),
                            highlights: normalizeTextArray(page.highlights || [], 4),
                            sections: normalizeSections(page.sections || []),
                            stats: normalizeStats(page.stats || []),
                            quote: normalizeQuote(page.quote || null),
                            image: page.image && page.image.url ? {
                                url: page.image.url,
                                caption: sanitizePageText(page.image.caption || ''),
                                fit: page.image.fit === 'cover' ? 'cover' : 'contain'
                            } : null
                        };
                    }

                    // 兼容旧草稿：字符串页面降级为简单可编辑页
                    var title = pptState.outline[idx] ? pptState.outline[idx].title : ('第' + (idx + 1) + '页');
                    return {
                        layout: idx === 0 ? 'cover' : 'content',
                        role: (pptState.outline[idx] && pptState.outline[idx].role) || 'body',
                        themeToken: pptState.colorScheme,
                        title: sanitizePageText(title),
                        subtitle: '',
                        bullets: [],
                        highlights: [],
                        sections: [],
                        stats: [],
                        quote: null,
                        image: null
                    };
                }),
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
            var fileName = (customFilename || '').trim() || pptState.topic || 'PPT';
            if (!customFilename && contentDisposition) {
                var filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
                if (filenameMatch) {
                    fileName = decodeURIComponent(filenameMatch[1].replace(/['"]/g, ''));
                }
            }
            fileName = fileName.replace(/\.pptx$/i, '') + '.pptx';

            // 下载文件
            var blob = await response.blob();

            if (window.nativeFileOps && window.nativeFileOps.isTauriRuntime()) {
                await window.nativeFileOps.saveFile(blob, {
                    filename: fileName,
                    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
                });
            } else {
                var url = window.URL.createObjectURL(blob);
                var a = document.createElement('a');
                a.href = url;
                a.download = fileName;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
            }

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
