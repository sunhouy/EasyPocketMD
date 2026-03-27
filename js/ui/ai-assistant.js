/**
 * AI助手功能模块
 * 包含：帮我写、帮我改、帮我排版、生成PPT
 */

(function(global) {
    'use strict';

    function g(name) { return global[name]; }
    function isEn() { return window.i18n && window.i18n.getLanguage() === 'en'; }

    // 当前AI助手状态
    var currentAIState = {
        currentMenu: 'main', // main, write, edit, format, ppt
        selectedType: null,
        lastResult: null,
        lastAction: null,
        lastInput: null
    };

    // 显示AI助手面板
    function showAIPanel() {
        var modal = document.getElementById('aiModalOverlay');
        if (!modal) return;

        // 重置状态
        currentAIState.currentMenu = 'main';
        currentAIState.selectedType = null;

        // 显示主菜单，隐藏其他
        showAIMenu('main');

        // 清空输入
        document.getElementById('aiWriteInput').value = '';
        document.getElementById('aiEditInput').value = '';
        document.getElementById('aiFormatInput').value = '';
        document.getElementById('aiPPTInput').value = '';

        // 清除选中状态
        document.querySelectorAll('.ai-option-btn').forEach(function(btn) {
            btn.classList.remove('selected');
        });

        modal.style.display = 'flex';
    }

    // 关闭AI助手面板
    function closeAIPanel() {
        var modal = document.getElementById('aiModalOverlay');
        if (modal) modal.style.display = 'none';
    }

    // 显示指定菜单
    function showAIMenu(menuName) {
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
                certificate: '请为我写一份证明。证明内容：' + input + '。要求：内容真实、表述准确、格式规范。'
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
            var ratioValue = ratio ? ratio.value : '16:9';
            return prompts[action][type] + '\n\nPPT比例：' + ratioValue + '\n\n' + (type === 'current' ? getEditorContent() : input);
        }

        return prompts[action][type] || '';
    }

    // 调用AI API
    async function callAIAPI(prompt, content) {
        // 模拟AI响应（实际使用时替换为真实API调用）
        await new Promise(resolve => setTimeout(resolve, 1500));

        // 这里应该调用实际的AI API
        // 示例：调用后端AI接口
        try {
            var apiUrl = (global.getApiBaseUrl ? global.getApiBaseUrl() : '/api') + '/ai/generate';

            var response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + (g('currentUser') ? (g('currentUser').token || g('currentUser').username) : '')
                },
                body: JSON.stringify({
                    prompt: prompt,
                    content: content,
                    timestamp: new Date().toISOString()
                })
            });

            if (response.ok) {
                var result = await response.json();
                if (result.code === 200 && result.data) {
                    return result.data;
                }
            }
        } catch (e) {
            console.log('API调用失败，使用模拟数据');
        }

        // 模拟返回结果
        return generateMockResult(prompt);
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
    function insertAIResultToEditor() {
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
    }

    // 初始化事件监听
    function initAIAssistant() {
        // 关闭按钮
        var closeBtn = document.getElementById('closeAIBtn');
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
        var resultBackBtn = document.getElementById('aiResultBack');
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
        var writeGenerateBtn = document.getElementById('aiWriteGenerate');
        if (writeGenerateBtn) {
            writeGenerateBtn.addEventListener('click', function() {
                // 添加点击动画效果
                this.style.transform = 'scale(0.98)';
                setTimeout(function() {
                    this.style.transform = '';
                }.bind(this), 100);

                var input = document.getElementById('aiWriteInput').value.trim();
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

        var editGenerateBtn = document.getElementById('aiEditGenerate');
        if (editGenerateBtn) {
            editGenerateBtn.addEventListener('click', function() {
                // 添加点击动画效果
                this.style.transform = 'scale(0.98)';
                setTimeout(function() {
                    this.style.transform = '';
                }.bind(this), 100);

                var input = document.getElementById('aiEditInput').value.trim();
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
                    document.getElementById('aiEditInput').value = input.substring(0, 500) + (input.length > 500 ? '...' : '');
                }
                generateContent('edit', currentAIState.selectedType, input);
            });
        }

        var formatGenerateBtn = document.getElementById('aiFormatGenerate');
        if (formatGenerateBtn) {
            formatGenerateBtn.addEventListener('click', function() {
                // 添加点击动画效果
                this.style.transform = 'scale(0.98)';
                setTimeout(function() {
                    this.style.transform = '';
                }.bind(this), 100);

                var input = document.getElementById('aiFormatInput').value.trim();
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
                    document.getElementById('aiFormatInput').value = input.substring(0, 500) + (input.length > 500 ? '...' : '');
                }
                generateContent('format', currentAIState.selectedType, input);
            });
        }

        var pptGenerateBtn = document.getElementById('aiPPTGenerate');
        if (pptGenerateBtn) {
            pptGenerateBtn.addEventListener('click', function() {
                // 添加点击动画效果
                this.style.transform = 'scale(0.98)';
                setTimeout(function() {
                    this.style.transform = '';
                }.bind(this), 100);

                var input = document.getElementById('aiPPTInput').value.trim();
                var ratio = document.querySelector('input[name="pptRatio"]:checked');
                var ratioValue = ratio ? ratio.value : '16:9';

                // 关闭AI助手面板
                closeAIPanel();

                // 打开PPT生成器
                if (typeof global.showPPTGenerator === 'function') {
                    global.showPPTGenerator();
                    
                    // 根据选择类型设置内容
                    if (currentAIState.selectedType === 'current') {
                        // 根据当前文件生成
                        var content = getEditorContent();
                        if (content) {
                            // 提取主题（使用第一行或文件名）
                            var topic = content.split('\n')[0].replace(/^#+\s*/, '').substring(0, 50);
                            setTimeout(function() {
                                var topicInput = document.getElementById('pptTopicInput');
                                var outlineInput = document.getElementById('pptOutlineInput');
                                if (topicInput) topicInput.value = topic;
                                if (outlineInput) outlineInput.value = content.substring(0, 2000);
                            }, 100);
                        }
                    } else if (input) {
                        // 根据输入的主题或大纲生成
                        setTimeout(function() {
                            var topicInput = document.getElementById('pptTopicInput');
                            var outlineInput = document.getElementById('pptOutlineInput');
                            if (topicInput) topicInput.value = input.substring(0, 100);
                            if (outlineInput && currentAIState.selectedType === 'outline') {
                                if (outlineInput) outlineInput.value = input;
                            }
                        }, 100);
                    }
                    
                    // 设置比例
                    setTimeout(function() {
                        var ratioRadio = document.querySelector('input[name="pptRatioSelect"][value="' + ratioValue + '"]');
                        if (ratioRadio) {
                            ratioRadio.checked = true;
                            ratioRadio.dispatchEvent(new Event('change'));
                        }
                    }, 100);
                } else {
                    if (global.showMessage) {
                        global.showMessage(isEn() ? 'PPT generator not loaded' : 'PPT生成器未加载', 'error');
                    }
                }
            });
        }

        // 结果操作按钮
        var copyBtn = document.getElementById('aiCopyResult');
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

        var regenerateBtn = document.getElementById('aiRegenerate');
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

        var insertBtn = document.getElementById('aiInsertResult');
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
                if (e.target === modal) {
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
