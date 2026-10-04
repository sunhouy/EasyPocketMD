/**
 * AI助手功能模块
 * 包含：帮我写、帮我改、帮我排版、生成PPT、AI查询
 */

(function(global) {
    'use strict';

    function g<K extends keyof Window>(name: K): Window[K] { return global[name]; }
    function isEn() { return window.i18n && window.i18n.getLanguage() === 'en'; }

    let queryController: AbortController | null = null;
    let queryAnswer = '';
    const queryText = (key: string, zh: string, en: string) => global.i18n?.t(key) || (isEn() ? en : zh);

    // 当前AI助手状态
    var currentAIState = {
        currentMenu: 'main', // main, write, edit, format, ppt, query
        selectedType: null,
        lastResult: null,
        lastAction: null,
        lastInput: null
    };

    // 显示AI助手面板
    function showAIPanel() {
        var modal = document.getElementById('aiModalOverlay');
        if (!modal) return;

        clearQuery();
        // 重置状态
        currentAIState.currentMenu = 'main';
        currentAIState.selectedType = null;

        // 显示主菜单，隐藏其他
        showAIMenu('main');

        // 清空输入
        (document.getElementById('aiWriteInput') as HTMLTextAreaElement).value = '';
        (document.getElementById('aiEditInput') as HTMLTextAreaElement).value = '';
        (document.getElementById('aiFormatInput') as HTMLTextAreaElement).value = '';
        (document.getElementById('aiPPTInput') as HTMLTextAreaElement).value = '';

        // 清除选中状态
        document.querySelectorAll('.ai-option-btn').forEach(function(btn) {
            btn.classList.remove('selected');
        });

        modal.style.display = 'flex';
    }

    // 关闭AI助手面板
    function closeAIPanel() {
        cancelQuery(true);
        var modal = document.getElementById('aiModalOverlay');
        if (modal) modal.style.display = 'none';
    }

    // 显示指定菜单
    function showAIMenu(menuName) {
        if (menuName !== 'query') cancelQuery(true);
        const queryMenu = document.getElementById('aiQueryMenu');
        if (queryMenu) queryMenu.style.display = menuName === 'query' ? 'block' : 'none';
        // 隐藏所有菜单
        document.getElementById('aiMainMenu').style.display = 'none';
        document.getElementById('aiWriteMenu').style.display = 'none';
        document.getElementById('aiEditMenu').style.display = 'none';
        document.getElementById('aiFormatMenu').style.display = 'none';
        document.getElementById('aiPPTMenu').style.display = 'none';
        document.getElementById('aiResultArea').style.display = 'none';

        // 显示指定菜单
        if (menuName === 'main') {
            document.getElementById('aiMainMenu').style.display = 'grid';
        } else if (menuName === 'write') {
            document.getElementById('aiWriteMenu').style.display = 'block';
        } else if (menuName === 'edit') {
            document.getElementById('aiEditMenu').style.display = 'block';
        } else if (menuName === 'format') {
            document.getElementById('aiFormatMenu').style.display = 'block';
        } else if (menuName === 'ppt') {
            document.getElementById('aiPPTMenu').style.display = 'block';
        } else if (menuName === 'result') {
            document.getElementById('aiResultArea').style.display = 'block';
        }

        currentAIState.currentMenu = menuName;
    }

    // 获取当前编辑器内容
    function getEditorContent() {
        if (g('vditor') && typeof g('vditor').getValue === 'function') {
            return g('vditor').getValue() || '';
        }
        return '';
    }

    // 生成内容
    async function generateContent(action, type, input) {
        currentAIState.lastAction = action;
        currentAIState.lastInput = input;

        var prompt = buildPrompt(action, type, input);
        var content = '';

        if (action === 'edit' || action === 'format') {
            content = input || getEditorContent();
        }

        showAILoading();

        try {
            var result = await callAIAPI(prompt, content);
            currentAIState.lastResult = result;
            hideAILoading();
            showAIResult(result);
        } catch (error) {
            hideAILoading();
            showAIError(error.message);
        }
    }

    // 构建提示词
    function buildPrompt(action, type, input) {
        var prompts = {
            write: {
                outline: '请为我生成一篇文章大纲。主题：' + input + '。请提供清晰的层级结构，包括主要章节和子章节。',
                speech: '请为我写一篇讲话稿。主题：' + input + '。要求：语言流畅、有感染力、适合口头表达。',
                reflection: '请为我写一篇心得体会。主题：' + input + '。要求：真情实感、有深度思考、结构完整。',
                meeting: '请为我写一份会议纪要。会议主题：' + input + '。要求：包含会议基本信息、与会人员、主要议题、决议事项等。',
                weekly: '请为我写一份工作周报。本周工作内容：' + input + '。要求：条理清晰、重点突出、有数据支撑。',
                summary: '请为我写一篇总结。总结内容：' + input + '。要求：全面客观、有成绩有不足、有改进措施。',
                notice: '请为我写一份通知。通知事项：' + input + '。要求：格式规范、语言简洁、信息完整。',
                application: '请为我写一份申请。申请内容：' + input + '。要求：态度诚恳、理由充分、格式正确。',
                certificate: '请为我写一份证明。证明内容：' + input + '。要求：内容真实、表述准确、格式规范。',
                other: '请根据以下要求生成内容：' + input + '。要求：内容完整、结构清晰、语言流畅。'
            },
            edit: {
                formal: '请将以下文本改写成更正式的版本，保持原意不变：',
                academic: '请将以下文本改写成更学术的风格，使用专业术语和规范的学术表达：',
                party: '请将以下文本改写成党政公文风格，语言庄重、规范：',
                proofread: '请检查以下文本中的错别字、标点错误和语法问题，给出修正后的版本：'
            },
            format: {
                clean: '请对以下文本进行简洁排版，去除多余空行，统一格式：',
                academic: '请对以下文本进行学术排版，添加适当的标题层级、段落缩进等：',
                business: '请对以下文本进行商务排版，格式规范、专业美观：',
                creative: '请对以下文本进行创意排版，美观大方、有设计感：'
            },
            ppt: {
                current: '请根据以下内容生成PPT大纲和每页内容要点：',
                topic: '请为主题"' + input + '"生成PPT大纲和每页内容要点：',
                outline: '请根据以下大纲生成详细的PPT内容，每页包含标题和要点：'
            }
        };

        if (action === 'ppt') {
            var ratio = document.querySelector('input[name="pptRatio"]:checked');
            var ratioValue = ratio ? (ratio as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value : '16:9';
            return prompts[action][type] + '\n\nPPT比例：' + ratioValue + '\n\n' + (type === 'current' ? getEditorContent() : input);
        }

        return prompts[action][type] || '';
    }

    // 调用AI API
    async function callAIAPI(prompt, content) {
        // 前端直连：使用用户配置的 apiKey/baseUrl/model 调用 OpenAI 兼容接口
        var systemPrompt = '你是一个专业的写作助手，可以帮助用户生成各种类型的文档内容、改写文本、生成PPT大纲等。请根据用户的要求提供高质量的回复。直接返回结果，不要包含解释性文字。输出约束：严禁返回HTML标签（如<div>、<span>、<p>等）或完整HTML文档；默认只返回纯文本、Markdown或JSON。若用户要求JSON，必须返回可直接解析的合法JSON对象，不要使用代码块包裹。';
        var userPrompt = content ? prompt + '\n\n' + content : prompt;
        var aiClient = global.AIConfig;
        if (!aiClient) {
            throw new Error(isEn() ? 'AI config module unavailable' : 'AI 配置模块不可用');
        }
        return await aiClient.callText(systemPrompt, userPrompt, { temperature: 0.7 });
    }

    // 生成模拟结果
    function generateMockResult(prompt) {
        if (prompt.includes('大纲')) {
            return '# 文章大纲\n\n## 一、引言\n- 背景介绍\n- 问题提出\n- 研究意义\n\n## 二、主要内容\n### 2.1 第一部分\n- 要点1\n- 要点2\n- 要点3\n\n### 2.2 第二部分\n- 要点1\n- 要点2\n\n## 三、结论\n- 总结\n- 展望\n\n---\n*以上为AI生成的大纲，您可以根据需要进行调整。*';
        } else if (prompt.includes('讲话稿')) {
            return '# 讲话稿\n\n尊敬的各位领导、各位同事：\n\n大家好！\n\n今天，我非常荣幸能够在这里与大家分享我的一些想法。\n\n## 一、回顾过去\n\n在过去的一段时间里，我们取得了显著的成绩。这些成绩的取得，离不开大家的共同努力和辛勤付出。\n\n## 二、展望未来\n\n面对新的挑战和机遇，我们要继续保持昂扬的斗志，不断创新，勇于突破。\n\n## 三、结语\n\n让我们携手并进，共创美好明天！\n\n谢谢大家！\n\n---\n*以上为AI生成的讲话稿，您可以根据实际情况进行修改。*';
        } else if (prompt.includes('PPT') || prompt.includes('ppt')) {
            var ratio = prompt.includes('4:3') ? '4:3' : '16:9';
            return '# PPT内容大纲\n\n## 第1页：封面\n- 标题\n- 副标题\n- 演讲人\n- 日期\n\n## 第2页：目录\n1. 背景介绍\n2. 主要内容\n3. 总结展望\n\n## 第3页：背景介绍\n- 行业现状\n- 市场分析\n- 发展趋势\n\n## 第4页：主要内容\n- 核心观点1\n- 核心观点2\n- 核心观点3\n\n## 第5页：总结展望\n- 主要结论\n- 未来计划\n- 感谢语\n\n---\n*PPT比例：' + ratio + '*\n*以上为AI生成的PPT大纲，您可以根据需要调整页数和内容。*';
        } else if (prompt.includes('正式') || prompt.includes('学术') || prompt.includes('党政')) {
            return '# 修改后的文本\n\n' + (prompt.includes('正式') ? '【正式版】\n\n本文旨在探讨相关议题，通过深入分析研究发现，该领域具有重要的理论价值和实践意义。建议相关部门予以高度重视，并采取有效措施加以推进。' :
               prompt.includes('学术') ? '【学术版】\n\n本研究采用定量与定性相结合的研究方法，对研究对象进行了系统分析。研究结果表明，各变量之间存在显著相关性（p<0.05），为后续研究提供了重要的理论支撑。' :
               '【党政版】\n\n各单位要深入贯彻落实上级决策部署，切实提高政治站位，强化责任担当。要坚持以人民为中心的发展思想，统筹推进各项工作，确保各项任务落到实处、取得实效。');
        } else if (prompt.includes('排版')) {
            return '# 排版后的文本\n\n> **排版说明**：以下文本已按照' + (prompt.includes('简洁') ? '简洁' : prompt.includes('学术') ? '学术' : prompt.includes('商务') ? '商务' : '创意') + '风格进行排版。\n\n---\n\n## 第一节\n\n这是一段排版后的示例文本。通过合理的段落划分和格式调整，使内容更加清晰易读。\n\n## 第二节\n\n- 要点一：内容说明\n- 要点二：内容说明\n- 要点三：内容说明\n\n---\n\n*排版完成，您可以直接使用或进一步调整。*';
        }

        return '# AI生成结果\n\n' + prompt + '\n\n---\n\n*以上为AI根据您的要求生成的内容，请根据实际情况进行调整和完善。*';
    }

    // 显示加载状态
    function showAILoading() {
        var resultContent = document.getElementById('aiResultContent');
        resultContent.innerHTML = '<div style="text-align:center;padding:40px;"><i class="fas fa-spinner fa-spin" style="font-size:32px;color:#4a90e2;"></i><p style="margin-top:15px;color:#666;">' + (isEn() ? 'AI is generating...' : 'AI正在生成中...') + '</p></div>';
        showAIMenu('result');
    }

    // 隐藏加载状态
    function hideAILoading() {
        // 加载状态会自动被结果替换
    }

    // 显示AI结果
    function showAIResult(result) {
        var resultContent = document.getElementById('aiResultContent');
        resultContent.textContent = result;
    }

    // 显示AI错误
    function showAIError(message) {
        var resultContent = document.getElementById('aiResultContent');
        resultContent.innerHTML = '<div style="text-align:center;padding:20px;color:#e74c3c;"><i class="fas fa-exclamation-circle" style="font-size:24px;"></i><p style="margin-top:10px;">' + (isEn() ? 'Generation failed: ' : '生成失败：') + message + '</p></div>';
        showAIMenu('result');
    }

    // 复制结果
    function copyAIResult() {
        var result = currentAIState.lastResult;
        if (!result) return;

        if (navigator.clipboard) {
            navigator.clipboard.writeText(result).then(function() {
                if (global.showMessage) {
                    global.showMessage(isEn() ? 'Copied to clipboard' : '已复制到剪贴板', 'success');
                }
            });
        } else {
            var textarea = document.createElement('textarea');
            textarea.value = result;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            if (global.showMessage) {
                global.showMessage(isEn() ? 'Copied to clipboard' : '已复制到剪贴板', 'success');
            }
        }
    }

    // 重新生成
    function regenerateAIResult() {
        if (currentAIState.lastAction && currentAIState.selectedType) {
            generateContent(currentAIState.lastAction, currentAIState.selectedType, currentAIState.lastInput);
        }
    }

    // 插入到编辑器
    async function insertAIResultToEditor() {
        var result = currentAIState.lastResult;
        if (!result || !g('vditor')) return;

        // 在当前光标位置插入
        if (typeof g('vditor').insertValue === 'function') {
            g('vditor').insertValue(result);
        } else if (typeof g('vditor').setValue === 'function') {
            var current = g('vditor').getValue() || '';
            g('vditor').setValue(current + '\n\n' + result);
        }

        closeAIPanel();

        if (global.showMessage) {
            global.showMessage(isEn() ? 'Content inserted' : '内容已插入', 'success');
        }

        // 自动保存文件
        if (typeof global.saveCurrentFile === 'function') {
            try {
                await global.saveCurrentFile(false);
            } catch (e) {
                console.error('AI内容插入后保存失败:', e);
            }
        }

        // 刷新页面以显示格式
        setTimeout(function() {
            window.location.reload();
        }, 500);
    }

    function cancelQuery(markCancelled = false) {
        if (markCancelled && queryController) {
            const status = document.getElementById('aiQueryStatus');
            if (status) status.textContent = queryText('aiQueryCancelled', '查询已取消', 'Query cancelled');
        }
        queryController?.abort();
        queryController = null;
        const run = document.getElementById('aiQueryRun') as HTMLButtonElement;
        const cancel = document.getElementById('aiQueryCancel') as HTMLButtonElement;
        if (run) run.disabled = false;
        if (cancel) cancel.hidden = true;
    }

    function clearQuery() {
        cancelQuery(); queryAnswer = '';
        for (const id of ['aiQueryStatus', 'aiQueryAnswer', 'aiQuerySources']) document.getElementById(id)?.replaceChildren();
        const input = document.getElementById('aiQueryInput') as HTMLTextAreaElement;
        if (input) input.value = '';
        const copy = document.getElementById('aiQueryCopy') as HTMLButtonElement;
        if (copy) copy.hidden = true;
    }

    async function runQuery() {
        if (queryController) return;
        const input = document.getElementById('aiQueryInput') as HTMLTextAreaElement;
        const status = document.getElementById('aiQueryStatus');
        const answer = document.getElementById('aiQueryAnswer');
        const sources = document.getElementById('aiQuerySources');
        const question = input.value.trim();
        if (!question || question.length > 2000) {
            status.textContent = queryText('aiQueryQuestionRequired', '请输入 1–2000 字的问题', 'Enter a question of 1–2000 characters'); return;
        }
        if (!global.AIConfig?.isReady()) {
            status.textContent = queryText('aiQueryConfigure', '请先在设置中填写 AI API 地址、密钥和模型', 'Configure your AI API URL, key and model in Settings first'); return;
        }
        const controller = new AbortController(); queryController = controller;
        const user = global.currentUser;
        const username = user?.username, token = user?.token;
        const checkSession = () => {
            if (controller.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
            if (global.currentUser?.username !== username || global.currentUser?.token !== token) throw new Error(isEn() ? 'Account changed; retry the query' : '账号已切换，请重新查询');
        };
        queryAnswer = ''; answer.replaceChildren(); sources.replaceChildren();
        (document.getElementById('aiQueryCopy') as HTMLButtonElement).hidden = true;
        (document.getElementById('aiQueryRun') as HTMLButtonElement).disabled = true;
        (document.getElementById('aiQueryCancel') as HTMLButtonElement).hidden = false;
        status.textContent = queryText('aiQueryReading', '正在读取全部文档…', 'Reading all documents…');
        try {
            const [{ collectQueryDocuments }, { queryDocuments }] = await Promise.all([import('./ai-query-files'), import('./ai-query')]);
            checkSession();
            const corpus = await collectQueryDocuments({ signal: controller.signal,
                includeEncrypted: (document.getElementById('aiQueryEncrypted') as HTMLInputElement).checked,
                progress: (done, total) => { if (queryController === controller) status.textContent = (isEn() ? 'Reading documents: ' : '正在读取文档：') + done + '/' + total; }
            });
            checkSession();
            const result = await queryDocuments(question, corpus.documents, async (system, prompt, options) => {
                checkSession();
                const response = await global.AIConfig.callText(system, prompt, options);
                checkSession(); return response;
            }, { signal: controller.signal, progress: (done, total) => {
                if (queryController === controller) status.textContent = (isEn() ? 'Searching all documents: ' : '正在检索全部文档：') + done + '/' + total + (done === total ? (isEn() ? ' · Combining findings…' : ' · 正在整理答案…') : '');
            } });
            checkSession();
            if (queryController !== controller) return;
            queryAnswer = result.answer; answer.textContent = result.answer;
            status.textContent = (isEn() ? 'Searched documents: ' : '已检索文档：') + result.files;
            if (corpus.skipped.length) {
                status.textContent += (isEn() ? ' · Not searched (encrypted or unreadable): ' : ' · 未参与检索（加密或读取失败）：') + corpus.skipped.length;
                const skipped = document.createElement('details'); const title = document.createElement('summary');
                title.textContent = isEn() ? 'Documents not searched' : '未参与检索的文档';
                const list = document.createElement('p'); list.textContent = corpus.skipped.join('、'); skipped.append(title, list); sources.append(skipped);
            }
            if (result.sources.length) {
                const title = document.createElement('h4'); title.textContent = queryText('aiQuerySources', '来源与原文摘录', 'Sources and excerpts'); sources.append(title);
                for (const source of result.sources) {
                    const details = document.createElement('details'); const summary = document.createElement('summary');
                    summary.textContent = '[' + source.number + '] ' + source.path; details.append(summary);
                    for (const excerpt of source.excerpts) {
                        const label = document.createElement('small'); label.textContent = (isEn() ? 'Line ' : '行 ') + excerpt.line;
                        const quote = document.createElement('blockquote'); quote.textContent = excerpt.quote;
                        details.append(label, quote);
                    }
                    sources.append(details);
                }
            }
            (document.getElementById('aiQueryCopy') as HTMLButtonElement).hidden = false;
        } catch (error) {
            if (queryController === controller) status.textContent = error.name === 'AbortError' ? queryText('aiQueryCancelled', '查询已取消', 'Query cancelled') : error.message;
        } finally {
            if (queryController === controller) cancelQuery();
        }
    }

    // 初始化事件监听
    function initAIAssistant() {
        document.getElementById('aiQueryRun')?.addEventListener('click', runQuery);
        document.getElementById('aiQueryCancel')?.addEventListener('click', () => {
            cancelQuery();
            document.getElementById('aiQueryStatus').textContent = queryText('aiQueryCancelled', '查询已取消', 'Query cancelled');
        });
        document.getElementById('aiQueryCopy')?.addEventListener('click', async () => {
            if (!queryAnswer) return;
            const sourceTitles = [...document.querySelectorAll('#aiQuerySources summary')].map(node => node.textContent).filter(text => /^\[\d+\]/.test(text));
            try { await navigator.clipboard.writeText(queryAnswer + (sourceTitles.length ? '\n\n' + sourceTitles.join('\n') : '')); }
            catch { global.showMessage?.(isEn() ? 'Could not copy answer' : '复制失败，请手动选择答案复制', 'error'); }
        });
        window.addEventListener('e2e-account-reset', clearQuery);
        window.addEventListener('e2e-locked', clearQuery);
        // 关闭按钮
        var closeBtn = (document.getElementById('closeAIBtn') as HTMLButtonElement);
        if (closeBtn) {
            closeBtn.addEventListener('click', closeAIPanel);
        }

        // 主菜单按钮
        document.querySelectorAll('.ai-menu-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                // 添加点击动画效果
                this.style.transform = 'scale(0.95)';
                setTimeout(function() {
                    this.style.transform = '';
                }.bind(this), 100);

                var action = this.getAttribute('data-ai-action');
                if (action) {
                    showAIMenu(action);
                    // 如果是PPT菜单，懒加载并初始化PPT生成器
                    if (action === 'ppt') {
                        if (typeof global.initPPTGenerator !== 'function') {
                            import('./ppt-generator').then(function() {
                                if (typeof global.initPPTGenerator === 'function') {
                                    global.initPPTGenerator();
                                }
                            });
                        } else {
                            global.initPPTGenerator();
                        }
                    }
                }
            });
        });

        // 返回按钮
        document.querySelectorAll('.ai-back-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var backTo = this.getAttribute('data-back');
                if (backTo === 'main') {
                    showAIMenu('main');
                }
            });
        });

        // 结果返回按钮
        var resultBackBtn = (document.getElementById('aiResultBack') as HTMLButtonElement);
        if (resultBackBtn) {
            resultBackBtn.addEventListener('click', function() {
                showAIMenu(currentAIState.lastAction || 'main');
            });
        }

        // 选项按钮
        document.querySelectorAll('.ai-option-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                // 清除同组其他按钮的选中状态
                var parent = this.parentElement;
                parent.querySelectorAll('.ai-option-btn').forEach(function(b) {
                    b.classList.remove('selected');
                });
                // 选中当前按钮
                this.classList.add('selected');

                // 添加点击动画效果
                this.style.transform = 'scale(0.95)';
                setTimeout(function() {
                    this.style.transform = '';
                }.bind(this), 100);

                // 记录选中的类型
                var type = this.getAttribute('data-write-type') ||
                          this.getAttribute('data-edit-type') ||
                          this.getAttribute('data-format-type') ||
                          this.getAttribute('data-ppt-type');
                if (type) {
                    currentAIState.selectedType = type;
                }
            });
        });

        // 生成按钮
        var writeGenerateBtn = (document.getElementById('aiWriteGenerate') as HTMLButtonElement);
        if (writeGenerateBtn) {
            writeGenerateBtn.addEventListener('click', function() {
                // 添加点击动画效果
                this.style.transform = 'scale(0.98)';
                setTimeout(function() {
                    this.style.transform = '';
                }.bind(this), 100);

                var input = (document.getElementById('aiWriteInput') as HTMLTextAreaElement).value.trim();
                if (!currentAIState.selectedType) {
                    if (global.showMessage) {
                        global.showMessage(isEn() ? 'Please select a type' : '请选择类型', 'error');
                    }
                    return;
                }
                if (!input) {
                    if (global.showMessage) {
                        global.showMessage(isEn() ? 'Please enter content' : '请输入内容', 'error');
                    }
                    return;
                }
                generateContent('write', currentAIState.selectedType, input);
            });
        }

        var editGenerateBtn = (document.getElementById('aiEditGenerate') as HTMLButtonElement);
        if (editGenerateBtn) {
            editGenerateBtn.addEventListener('click', function() {
                // 添加点击动画效果
                this.style.transform = 'scale(0.98)';
                setTimeout(function() {
                    this.style.transform = '';
                }.bind(this), 100);

                var input = (document.getElementById('aiEditInput') as HTMLTextAreaElement).value.trim();
                if (!currentAIState.selectedType) {
                    if (global.showMessage) {
                        global.showMessage(isEn() ? 'Please select a style' : '请选择风格', 'error');
                    }
                    return;
                }
                if (!input) {
                    // 如果没有输入，使用编辑器当前内容
                    input = getEditorContent();
                    if (!input) {
                        if (global.showMessage) {
                            global.showMessage(isEn() ? 'Please enter content or ensure editor has content' : '请输入内容或确保编辑器有内容', 'error');
                        }
                        return;
                    }
                    (document.getElementById('aiEditInput') as HTMLTextAreaElement).value = input.substring(0, 500) + (input.length > 500 ? '...' : '');
                }
                generateContent('edit', currentAIState.selectedType, input);
            });
        }

        var formatGenerateBtn = (document.getElementById('aiFormatGenerate') as HTMLButtonElement);
        if (formatGenerateBtn) {
            formatGenerateBtn.addEventListener('click', function() {
                // 添加点击动画效果
                this.style.transform = 'scale(0.98)';
                setTimeout(function() {
                    this.style.transform = '';
                }.bind(this), 100);

                var input = (document.getElementById('aiFormatInput') as HTMLTextAreaElement).value.trim();
                if (!currentAIState.selectedType) {
                    if (global.showMessage) {
                        global.showMessage(isEn() ? 'Please select a format style' : '请选择排版风格', 'error');
                    }
                    return;
                }
                if (!input) {
                    input = getEditorContent();
                    if (!input) {
                        if (global.showMessage) {
                            global.showMessage(isEn() ? 'Please enter content or ensure editor has content' : '请输入内容或确保编辑器有内容', 'error');
                        }
                        return;
                    }
                    (document.getElementById('aiFormatInput') as HTMLTextAreaElement).value = input.substring(0, 500) + (input.length > 500 ? '...' : '');
                }
                generateContent('format', currentAIState.selectedType, input);
            });
        }

        // 结果操作按钮
        var copyBtn = (document.getElementById('aiCopyResult') as HTMLButtonElement);
        if (copyBtn) {
            copyBtn.addEventListener('click', function() {
                // 添加点击动画效果
                this.style.transform = 'scale(0.95)';
                setTimeout(function() {
                    this.style.transform = '';
                }.bind(this), 100);
                copyAIResult();
            });
        }

        var regenerateBtn = (document.getElementById('aiRegenerate') as HTMLButtonElement);
        if (regenerateBtn) {
            regenerateBtn.addEventListener('click', function() {
                // 添加点击动画效果
                this.style.transform = 'scale(0.95)';
                setTimeout(function() {
                    this.style.transform = '';
                }.bind(this), 100);
                regenerateAIResult();
            });
        }

        var insertBtn = (document.getElementById('aiInsertResult') as HTMLButtonElement);
        if (insertBtn) {
            insertBtn.addEventListener('click', function() {
                // 添加点击动画效果
                this.style.transform = 'scale(0.95)';
                setTimeout(function() {
                    this.style.transform = '';
                }.bind(this), 100);
                insertAIResultToEditor();
            });
        }

        // 点击遮罩关闭
        var modal = document.getElementById('aiModalOverlay');
        if (modal) {
            modal.addEventListener('click', function(e) {
                if (false && e.target === modal) {
                    closeAIPanel();
                }
            });
        }
    }

    // 导出到全局
    global.showAIPanel = showAIPanel;
    global.closeAIPanel = closeAIPanel;
    global.initAIAssistant = initAIAssistant;

    // DOM加载完成后初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initAIAssistant);
    } else {
        initAIAssistant();
    }

})(typeof window !== 'undefined' ? window : this);
