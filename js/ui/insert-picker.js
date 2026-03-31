
(function(global) {
    'use strict';

    function g(name) { return global[name]; }
    function isEn() { return window.i18n && window.i18n.getLanguage() === 'en'; }

    var currentModal = null;

    // 所有可插入的内容项
    var insertItems = [
        // 格式类
        { id: 'heading1', icon: 'fas fa-heading', name: isEn() ? 'Heading 1' : '标题1', category: 'format', keywords: ['heading', 'h1', '标题'], insert: '# ' },
        { id: 'heading2', icon: 'fas fa-heading', name: isEn() ? 'Heading 2' : '标题2', category: 'format', keywords: ['heading', 'h2', '标题'], insert: '## ' },
        { id: 'heading3', icon: 'fas fa-heading', name: isEn() ? 'Heading 3' : '标题3', category: 'format', keywords: ['heading', 'h3', '标题'], insert: '### ' },
        { id: 'bold', icon: 'fas fa-bold', name: isEn() ? 'Bold' : '粗体', category: 'format', keywords: ['bold', '粗体'], insert: '**粗体文字**' },
        { id: 'italic', icon: 'fas fa-italic', name: isEn() ? 'Italic' : '斜体', category: 'format', keywords: ['italic', '斜体'], insert: '*斜体文字*' },
        { id: 'strikethrough', icon: 'fas fa-strikethrough', name: isEn() ? 'Strikethrough' : '删除线', category: 'format', keywords: ['strikethrough', '删除线'], insert: '~~删除线文字~~' },
        { id: 'code', icon: 'fas fa-code', name: isEn() ? 'Code Block' : '代码块', category: 'format', keywords: ['code', '代码'], insert: '```\n代码块\n```' },
        { id: 'inlineCode', icon: 'fas fa-terminal', name: isEn() ? 'Inline Code' : '行内代码', category: 'format', keywords: ['inline', 'code', '行内代码'], insert: '`行内代码`' },
        { id: 'quote', icon: 'fas fa-quote-right', name: isEn() ? 'Quote' : '引用', category: 'format', keywords: ['quote', '引用'], insert: '> 引用文字' },

        // 插入类
        { id: 'link', icon: 'fas fa-link', name: isEn() ? 'Link' : '链接', category: 'insert', keywords: ['link', '链接'], insert: '[链接文字](https://)' },
        { id: 'image', icon: 'fas fa-image', name: isEn() ? 'Image' : '图片', category: 'insert', keywords: ['image', '图片'], action: 'uploadImage' },
        { id: 'file', icon: 'fas fa-file-upload', name: isEn() ? 'File' : '文件', category: 'insert', keywords: ['file', '文件'], action: 'uploadFile' },
        { id: 'webImage', icon: 'fas fa-globe', name: isEn() ? 'Web Image' : '网络图片', category: 'insert', keywords: ['web', 'image', '网络图片'], insert: '![图片描述](图片地址)' },
        { id: 'table', icon: 'fas fa-table', name: isEn() ? 'Table' : '表格', category: 'insert', keywords: ['table', '表格'], action: 'table' },
        { id: 'ul', icon: 'fas fa-list-ul', name: isEn() ? 'Unordered List' : '无序列表', category: 'insert', keywords: ['list', 'ul', '无序列表'], insert: '- 列表项' },
        { id: 'ol', icon: 'fas fa-list-ol', name: isEn() ? 'Ordered List' : '有序列表', category: 'insert', keywords: ['list', 'ol', '有序列表'], insert: '1. 列表项' },
        { id: 'task', icon: 'fas fa-tasks', name: isEn() ? 'Task List' : '任务列表', category: 'insert', keywords: ['task', '任务'], insert: '- [ ] 任务项' },
        { id: 'divider', icon: 'fas fa-minus', name: isEn() ? 'Divider' : '分隔线', category: 'insert', keywords: ['divider', '分隔线'], insert: '\n---\n' },
        { id: 'emoji', icon: 'fas fa-smile', name: isEn() ? 'Emoji' : '表情', category: 'insert', keywords: ['emoji', '表情'], action: 'emoji' },
        { id: 'formula', icon: 'fas fa-superscript', name: isEn() ? 'Formula' : '公式', category: 'insert', keywords: ['formula', '公式', 'latex'], action: 'formula' },
        { id: 'chart', icon: 'fas fa-chart-bar', name: isEn() ? 'Chart' : '图表', category: 'insert', keywords: ['chart', '图表', 'mermaid'], action: 'chart' },
        { id: 'footnote', icon: 'fas fa-sticky-note', name: isEn() ? 'Footnote' : '脚注', category: 'insert', keywords: ['footnote', '脚注', 'note'], action: 'footnote' },
        { id: 'mindmap', icon: 'fas fa-brain', name: isEn() ? 'Mind Map' : '脑图', category: 'insert', keywords: ['mindmap', '脑图', '思维导图'], action: 'mindmap' }
    ];

    function closeInsertPicker() {
        if (currentModal && currentModal.parentNode) {
            currentModal.parentNode.removeChild(currentModal);
        }
        currentModal = null;
    }

    function insertText(text) {
        try {
            if (g('vditor')) {
                g('vditor').insertValue(text + '\n\n');
            }
        } catch (e) {
            console.error('插入文本错误', e);
            if (global.showMessage) {
                global.showMessage(isEn() ? 'Insert failed' : '插入失败', 'error');
            }
        }
        closeInsertPicker();
    }

    function insertTable() {
        var tableMarkdown = '\n| 标题1 | 标题2 | 标题3 |\n|-------|-------|-------|\n| 内容1 | 内容2 | 内容3 |\n| 内容4 | 内容5 | 内容6 |\n\n';
        try {
            if (g('vditor')) {
                g('vditor').insertValue(tableMarkdown);
                global.showMessage(isEn() ? 'Table inserted' : '表格已插入');
            }
        } catch (e) {
            console.error('插入表格错误', e);
            if (global.showMessage) {
                global.showMessage(isEn() ? 'Insert table failed' : '插入表格失败', 'error');
            }
        }
        closeInsertPicker();
    }

    function handleItemClick(item) {
        if (item.action) {
            switch (item.action) {
                case 'uploadImage':
                    closeInsertPicker();
                    if (global.triggerImageUpload) global.triggerImageUpload();
                    break;
                case 'uploadFile':
                    closeInsertPicker();
                    if (global.triggerFileUpload) global.triggerFileUpload();
                    break;
                case 'table':
                    insertTable();
                    break;
                case 'emoji':
                    closeInsertPicker();
                    if (typeof window.showEmojiPicker !== 'function') {
                        import('../emoji-picker.js').then(function() {
                            if (typeof window.showEmojiPicker === 'function') window.showEmojiPicker();
                        });
                    } else {
                        window.showEmojiPicker();
                    }
                    break;
                case 'formula':
                    closeInsertPicker();
                    if (typeof window.showFormulaPicker !== 'function') {
                        import('../formula-picker.js').then(function() {
                            if (typeof window.showFormulaPicker === 'function') window.showFormulaPicker();
                        });
                    } else {
                        window.showFormulaPicker();
                    }
                    break;
                case 'chart':
                    closeInsertPicker();
                    if (typeof window.showChartPicker !== 'function') {
                        import('./chart.js').then(function() {
                            if (typeof window.showChartPicker === 'function') window.showChartPicker();
                        });
                    } else {
                        window.showChartPicker();
                    }
                    break;
                case 'echarts':
                    closeInsertPicker();
                    if (typeof window.showEChartsPicker === 'function') window.showEChartsPicker();
                    break;
                case 'footnote':
                    closeInsertPicker();
                    showFootnotePicker();
                    break;
                case 'mindmap':
                    closeInsertPicker();
                    showMindmapPicker();
                    break;
            }
        } else if (item.insert) {
            insertText(item.insert);
        }
    }

    // AI搜索功能 - 搜索Markdown代码
    async function performAISearch(keyword) {
        // 检查关键词长度
        if (keyword.length > 10) {
            global.showMessage(isEn() ? 'Search keyword too long (max 10 characters)' : '搜索关键词过长（最多10个字）', 'error');
            return;
        }

        var itemGrid = document.getElementById('insertItemGrid');
        if (!itemGrid) return;

        itemGrid.innerHTML = '';

        // 创建加载提示
        var loadingDiv = document.createElement('div');
        loadingDiv.style.cssText = 'text-align:center;padding:40px 0;grid-column: 1/-1;';

        var loadingIcon = document.createElement('div');
        loadingIcon.innerHTML = '<i class="fas fa-magic" style="font-size: 32px; color: #4a90e2;"></i>';
        loadingIcon.style.cssText = 'margin-bottom: 15px;';

        var loadingText = document.createElement('div');
        loadingText.textContent = isEn() ? 'AI is searching...' : 'AI搜索中...';
        loadingText.style.cssText = 'color: #4a90e2; font-size: 14px;';

        loadingDiv.appendChild(loadingIcon);
        loadingDiv.appendChild(loadingText);
        itemGrid.appendChild(loadingDiv);

        try {
            var apiUrl = (window.getApiBaseUrl ? window.getApiBaseUrl() : 'api') + '/ai/markdown';

            var response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + (window.currentUser ? (window.currentUser.token || window.currentUser.username) : '')
                },
                body: JSON.stringify({
                    keyword: keyword,
                    language: isEn() ? 'en' : 'zh'
                })
            });

            var result = await response.json();

            if (result.code === 200 && result.data) {
                var aiResults = parseAIResponse(result.data);
                if (aiResults.length > 0) {
                    renderAIResults(aiResults, keyword);
                } else {
                    showAINoResult(keyword);
                }
            } else {
                showAIError(result.message || (isEn() ? 'AI search failed' : 'AI搜索失败'));
            }
        } catch (error) {
            console.error('AI搜索错误:', error);
            showAIError(isEn() ? 'Network error, please try again' : '网络错误，请重试');
        }
    }

    function parseAIResponse(aiResponse) {
        var results = [];

        try {
            var parsed = JSON.parse(aiResponse);
            if (Array.isArray(parsed)) {
                return parsed.map(function(item) {
                    return {
                        name: item.name || item.display || item.title,
                        markdown: item.markdown || item.code || item.content
                    };
                });
            }
        } catch (e) {
            // 不是JSON格式，尝试按行解析
        }

        var lines = aiResponse.split('\n').filter(function(line) { return line.trim(); });

        for (var i = 0; i < lines.length; i++) {
            var trimmed = lines[i].trim();
            if (!trimmed) continue;

            if (trimmed.startsWith('以下是') || trimmed.startsWith('Here are') ||
                trimmed.startsWith('这是') || trimmed.startsWith('These are')) {
                continue;
            }

            var name = '';
            var markdown = '';

            if (trimmed.includes('|')) {
                var parts = trimmed.split('|').map(function(p) { return p.trim(); });
                if (parts.length >= 2) {
                    name = parts[0];
                    markdown = parts[1];
                }
            } else if (trimmed.includes(':')) {
                var parts = trimmed.split(':').map(function(p) { return p.trim(); });
                if (parts.length >= 2) {
                    name = parts[0];
                    markdown = parts[1];
                }
            } else {
                name = trimmed;
                markdown = trimmed;
            }

            if (markdown) {
                results.push({
                    name: name || markdown,
                    markdown: markdown
                });
            }
        }

        return results;
    }

    function renderAIResults(results, keyword) {
        var grid = document.getElementById('insertItemGrid');
        if (!grid) return;

        grid.innerHTML = '';

        // 添加AI搜索结果标题
        var resultHeader = document.createElement('div');
        resultHeader.style.cssText = 'grid-column: 1/-1; padding: 10px 0; border-bottom: 1px solid ' + (window.nightMode ? '#444' : '#eee') + '; margin-bottom: 10px;';
        resultHeader.innerHTML = '<span style="color: #4a90e2; font-weight: bold;">' + (isEn() ? 'AI Search Results' : 'AI搜索结果') + '</span>';
        grid.appendChild(resultHeader);

        // 渲染结果列表
        results.forEach(function(item) {
            var btn = document.createElement('button');
            btn.style.cssText = 'padding: 12px 8px; border: 2px solid transparent; background: ' + (window.nightMode ? '#3d3d3d' : '#f5f5f5') + '; cursor: pointer; border-radius: 8px; transition: all 0.2s; text-align: center; color: ' + (window.nightMode ? '#eee' : '#333') + '; min-height: 70px; display: flex; flex-direction: column; align-items: center; justify-content: center;';

            var nameDiv = document.createElement('div');
            nameDiv.style.cssText = 'font-size: 14px; font-weight: 500; margin-bottom: 4px;';
            nameDiv.textContent = item.name;

            var previewDiv = document.createElement('div');
            previewDiv.style.cssText = 'font-size: 10px; color: ' + (window.nightMode ? '#aaa' : '#666') + '; font-family: monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%;';
            previewDiv.textContent = item.markdown.substring(0, 30) + (item.markdown.length > 30 ? '...' : '');

            btn.appendChild(nameDiv);
            btn.appendChild(previewDiv);

            btn.onclick = function() {
                insertText(item.markdown);
            };

            btn.onmouseenter = function() {
                this.style.background = window.nightMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)';
                this.style.borderColor = '#4a90e2';
            };

            btn.onmouseleave = function() {
                this.style.background = window.nightMode ? '#3d3d3d' : '#f5f5f5';
                this.style.borderColor = 'transparent';
            };

            grid.appendChild(btn);
        });

        // 添加返回提示
        var backHint = document.createElement('div');
        backHint.style.cssText = 'grid-column: 1/-1; text-align: center; padding: 10px 0; font-size: 12px; color: ' + (window.nightMode ? '#888' : '#888') + ';';
        backHint.textContent = isEn() ? 'Click to insert' : '点击插入';
        grid.appendChild(backHint);
    }

    function showAINoResult(keyword) {
        var grid = document.getElementById('insertItemGrid');
        if (!grid) return;

        grid.innerHTML = '';

        var emptyMsg = document.createElement('div');
        emptyMsg.style.cssText = 'text-align:center;color:#888;padding:30px 0;grid-column: 1/-1;';
        emptyMsg.innerHTML = '<div style="margin-bottom: 10px;">' + (isEn() ? 'AI could not find matching results' : 'AI未找到匹配结果') + '</div><div style="font-size: 12px; color: #aaa;">' + (isEn() ? 'Try different keywords' : '请尝试其他关键词') + '</div>';
        grid.appendChild(emptyMsg);
    }

    function showAIError(errorMessage) {
        var grid = document.getElementById('insertItemGrid');
        if (!grid) return;

        grid.innerHTML = '';

        var errorDiv = document.createElement('div');
        errorDiv.style.cssText = 'text-align:center;color:#dc3545;padding:30px 0;grid-column: 1/-1;';
        errorDiv.innerHTML = '<div style="margin-bottom: 10px;"><i class="fas fa-exclamation-circle"></i></div><div>' + errorMessage + '</div>';
        grid.appendChild(errorDiv);
    }

    function showInsertPicker() {
        var nightMode = g('nightMode') === true;

        if (currentModal) {
            closeInsertPicker();
        }

        // 创建模态框
        var modal = document.createElement('div');
        modal.className = 'insert-picker-modal';
        modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); z-index: 2000; display: flex; flex-direction: column; align-items: center; justify-content: center;';
        currentModal = modal;

        // 创建容器
        var container = document.createElement('div');
        container.style.cssText = 'background: ' + (nightMode ? '#2d2d2d' : 'white') + '; border-radius: 12px; padding: 20px; width: 90%; max-width: 600px; max-height: 85vh; overflow: hidden; display: flex; flex-direction: column;';

        // 标题
        var title = document.createElement('div');
        title.textContent = isEn() ? 'Insert' : '插入';
        title.style.cssText = 'font-size: 18px; font-weight: 600; margin-bottom: 15px; text-align: center; color: ' + (nightMode ? '#eee' : '#333') + ';';
        container.appendChild(title);

        // 搜索框
        var searchBox = document.createElement('input');
        searchBox.type = 'text';
        searchBox.placeholder = isEn() ? 'Search (max 10 chars)...' : '搜索（最多10字）...';
        searchBox.maxLength = 20;
        searchBox.style.cssText = 'width: 100%; padding: 10px 12px; margin-bottom: 15px; border: 1px solid ' + (nightMode ? '#444' : '#ccc') + '; border-radius: 6px; font-size: 14px; background: ' + (nightMode ? '#222' : '#fafafa') + '; color: ' + (nightMode ? '#eee' : '#333') + '; outline: none; box-sizing: border-box;';
        container.appendChild(searchBox);

        // 项目网格
        var itemGrid = document.createElement('div');
        itemGrid.id = 'insertItemGrid';
        itemGrid.style.cssText = 'display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; overflow-y: auto; max-height: 350px; padding-right: 5px;';
        container.appendChild(itemGrid);

        // 渲染项目列表
        function renderItems(items) {
            itemGrid.innerHTML = '';

            if (!items || items.length === 0) {
                var emptyMsg = document.createElement('div');
                emptyMsg.style.cssText = 'text-align: center; color: #888; padding: 30px; grid-column: 1/-1;';

                var searchKeyword = searchBox.value.trim();

                var hintText = document.createElement('div');
                hintText.textContent = isEn() ? 'No matching items found' : '无匹配项';
                hintText.style.cssText = 'margin-bottom: 10px;';
                emptyMsg.appendChild(hintText);

                if (searchKeyword) {
                    // 检查长度限制
                    if (searchKeyword.length > 10) {
                        var lengthError = document.createElement('div');
                        lengthError.textContent = isEn() ? 'Keyword too long (max 10 chars)' : '关键词过长（最多10字）';
                        lengthError.style.cssText = 'color: #dc3545; font-size: 12px;';
                        emptyMsg.appendChild(lengthError);
                    } else {
                        var aiSearchLink = document.createElement('a');
                        aiSearchLink.href = 'javascript:void(0)';
                        aiSearchLink.textContent = isEn() ? 'Try AI Search' : '试试AI搜索';
                        aiSearchLink.style.cssText = 'color: #4a90e2; text-decoration: underline; cursor: pointer; font-size: 14px;';
                        aiSearchLink.addEventListener('click', function() {
                            performAISearch(searchKeyword);
                        });
                        emptyMsg.appendChild(aiSearchLink);
                    }
                }

                itemGrid.appendChild(emptyMsg);
                return;
            }

            items.forEach(function(item) {
                var btn = document.createElement('button');
                btn.style.cssText = 'padding: 12px 8px; border: 2px solid transparent; background: ' + (nightMode ? '#3d3d3d' : '#f5f5f5') + '; cursor: pointer; border-radius: 8px; transition: all 0.2s; text-align: center; color: ' + (nightMode ? '#eee' : '#333') + '; min-height: 70px; display: flex; flex-direction: column; align-items: center; justify-content: center;';

                var iconDiv = document.createElement('div');
                iconDiv.style.cssText = 'font-size: 20px; margin-bottom: 6px; color: #4a90e2;';
                iconDiv.innerHTML = '<i class="' + item.icon + '"></i>';

                var nameDiv = document.createElement('div');
                nameDiv.style.cssText = 'font-size: 12px; font-weight: 500;';
                nameDiv.textContent = item.name;

                btn.appendChild(iconDiv);
                btn.appendChild(nameDiv);

                btn.onclick = function() {
                    handleItemClick(item);
                };

                btn.onmouseenter = function() {
                    this.style.background = nightMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)';
                    this.style.borderColor = '#4a90e2';
                };

                btn.onmouseleave = function() {
                    this.style.background = nightMode ? '#3d3d3d' : '#f5f5f5';
                    this.style.borderColor = 'transparent';
                };

                itemGrid.appendChild(btn);
            });
        }

        // 初始渲染
        renderItems(insertItems);

        // 搜索功能
        searchBox.addEventListener('input', function() {
            // 限制输入长度
            if (this.value.length > 10) {
                this.value = this.value.substring(0, 10);
            }

            var q = this.value.trim().toLowerCase();
            if (!q) {
                renderItems(insertItems);
                return;
            }

            var results = insertItems.filter(function(item) {
                if (item.name.toLowerCase().includes(q)) return true;
                if (item.keywords && item.keywords.some(function(k) { return k.toLowerCase().includes(q); })) return true;
                return false;
            });

            renderItems(results);
        });

        // 右上角关闭按钮
        var closeBtn = document.createElement('button');
        closeBtn.innerHTML = '<i class="fas fa-times"></i>';
        closeBtn.style.cssText = 'position: absolute; top: 15px; right: 15px; width: 32px; height: 32px; background: ' + (nightMode ? '#444' : '#f5f5f5') + '; color: ' + (nightMode ? '#eee' : '#333') + '; border: none; border-radius: 50%; cursor: pointer; font-size: 16px; display: flex; align-items: center; justify-content: center;';
        closeBtn.onclick = closeInsertPicker;
        container.style.position = 'relative';
        container.appendChild(closeBtn);

        modal.appendChild(container);
        document.body.appendChild(modal);

        // 点击外部关闭
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                closeInsertPicker();
            }
        });

        // 键盘事件
        function handleKeydown(e) {
            if (e.key === 'Escape') {
                closeInsertPicker();
                document.removeEventListener('keydown', handleKeydown);
            }
        }
        document.addEventListener('keydown', handleKeydown);

        // 聚焦搜索框
        searchBox.focus();
    }

    // 脚注选择器
    function showFootnotePicker() {
        var nightMode = g('nightMode') === true;

        // 创建模态框
        var modal = document.createElement('div');
        modal.className = 'footnote-picker-modal';
        modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); z-index: 2000; display: flex; flex-direction: column; align-items: center; justify-content: center;';

        // 创建容器
        var container = document.createElement('div');
        container.style.cssText = 'background: ' + (nightMode ? '#2d2d2d' : 'white') + '; border-radius: 12px; padding: 20px; width: 90%; max-width: 500px; max-height: 85vh; overflow: hidden; display: flex; flex-direction: column;';

        // 标题
        var title = document.createElement('div');
        title.textContent = isEn() ? 'Insert Footnote' : '插入脚注';
        title.style.cssText = 'font-size: 18px; font-weight: 600; margin-bottom: 15px; text-align: center; color: ' + (nightMode ? '#eee' : '#333') + ';';
        container.appendChild(title);

        // 说明文字
        var desc = document.createElement('div');
        var footnoteExampleEn = '<p style="margin-bottom:10px;color:' + (nightMode ? '#aaa' : '#666') + ';font-size:13px;">Footnote format:</p><pre style="background:' + (nightMode ? '#1a1a1a' : '#f5f5f5') + ';padding:10px;border-radius:6px;font-size:12px;overflow-x:auto;color:' + (nightMode ? '#eee' : '#333') + ';">Text with footnote[^1]\\n\\n[^1]: First footnote definition.\\n[^bignote]: Footnote definitions can use multiple paragraphs.</pre>';
        var footnoteExampleZh = '<p style="margin-bottom:10px;color:' + (nightMode ? '#aaa' : '#666') + ';font-size:13px;">脚注格式：</p><pre style="background:' + (nightMode ? '#1a1a1a' : '#f5f5f5') + ';padding:10px;border-radius:6px;font-size:12px;overflow-x:auto;color:' + (nightMode ? '#eee' : '#333') + ';">带有脚注的文本[^1]\\n\\n[^1]: 第一个脚注定义。\\n[^bignote]: 脚注定义可使用多段内容。</pre>';
        desc.innerHTML = isEn() ? footnoteExampleEn : footnoteExampleZh;
        desc.style.cssText = 'margin-bottom: 20px;';
        container.appendChild(desc);

        // 脚注ID输入
        var idLabel = document.createElement('label');
        idLabel.textContent = isEn() ? 'Footnote ID:' : '脚注标识：';
        idLabel.style.cssText = 'display: block; margin-bottom: 8px; font-size: 14px; color: ' + (nightMode ? '#ddd' : '#333') + ';';
        container.appendChild(idLabel);

        var idInput = document.createElement('input');
        idInput.type = 'text';
        idInput.placeholder = isEn() ? 'e.g., 1, note1, ref' : '如：1、note1、ref';
        idInput.style.cssText = 'width: 100%; padding: 10px 12px; margin-bottom: 15px; border: 1px solid ' + (nightMode ? '#444' : '#ccc') + '; border-radius: 6px; font-size: 14px; background: ' + (nightMode ? '#222' : '#fafafa') + '; color: ' + (nightMode ? '#eee' : '#333') + '; box-sizing: border-box;';
        container.appendChild(idInput);

        // 脚注内容输入
        var contentLabel = document.createElement('label');
        contentLabel.textContent = isEn() ? 'Footnote Content:' : '脚注内容：';
        contentLabel.style.cssText = 'display: block; margin-bottom: 8px; font-size: 14px; color: ' + (nightMode ? '#ddd' : '#333') + ';';
        container.appendChild(contentLabel);

        var contentInput = document.createElement('textarea');
        contentInput.placeholder = isEn() ? 'Enter footnote content...' : '输入脚注内容...';
        contentInput.rows = 4;
        contentInput.style.cssText = 'width: 100%; padding: 10px 12px; margin-bottom: 20px; border: 1px solid ' + (nightMode ? '#444' : '#ccc') + '; border-radius: 6px; font-size: 14px; background: ' + (nightMode ? '#222' : '#fafafa') + '; color: ' + (nightMode ? '#eee' : '#333') + '; box-sizing: border-box; resize: vertical;';
        container.appendChild(contentInput);

        // 按钮栏
        var buttonBar = document.createElement('div');
        buttonBar.style.cssText = 'display: flex; gap: 10px; justify-content: flex-end;';

        var cancelBtn = document.createElement('button');
        cancelBtn.textContent = isEn() ? 'Cancel' : '取消';
        cancelBtn.style.cssText = 'padding: 10px 20px; background: ' + (nightMode ? '#444' : '#f5f5f5') + '; color: ' + (nightMode ? '#eee' : '#333') + '; border: none; border-radius: 6px; cursor: pointer; font-size: 14px;';
        cancelBtn.onclick = function() {
            document.body.removeChild(modal);
        };
        buttonBar.appendChild(cancelBtn);

        var insertBtn = document.createElement('button');
        insertBtn.innerHTML = '<i class="fas fa-plus"></i> ' + (isEn() ? 'Insert' : '插入');
        insertBtn.style.cssText = 'padding: 10px 20px; background: #4a90e2; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px;';
        insertBtn.onclick = function() {
            var footnoteId = idInput.value.trim() || '1';
            var footnoteContent = contentInput.value.trim() || (isEn() ? 'Footnote content' : '脚注内容');

            // 生成脚注文本
            var footnoteText = '[^' + footnoteId + ']';
            var footnoteDef = '\n\n[^' + footnoteId + ']: ' + footnoteContent;

            // 插入脚注引用
            insertText(footnoteText);

            // 延迟插入脚注定义到文档末尾
            setTimeout(function() {
                try {
                    if (g('vditor')) {
                        var currentValue = g('vditor').getValue();
                        g('vditor').setValue(currentValue + footnoteDef);
                    }
                } catch (e) {
                    console.error('插入脚注定义错误', e);
                }
            }, 100);

            document.body.removeChild(modal);
        };
        buttonBar.appendChild(insertBtn);

        container.appendChild(buttonBar);

        // 右上角关闭按钮
        var closeBtn = document.createElement('button');
        closeBtn.innerHTML = '<i class="fas fa-times"></i>';
        closeBtn.style.cssText = 'position: absolute; top: 15px; right: 15px; width: 32px; height: 32px; background: ' + (nightMode ? '#444' : '#f5f5f5') + '; color: ' + (nightMode ? '#eee' : '#333') + '; border: none; border-radius: 50%; cursor: pointer; font-size: 16px; display: flex; align-items: center; justify-content: center;';
        closeBtn.onclick = function() {
            document.body.removeChild(modal);
        };
        container.style.position = 'relative';
        container.appendChild(closeBtn);

        modal.appendChild(container);
        document.body.appendChild(modal);

        // 点击外部关闭
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                document.body.removeChild(modal);
            }
        });

        // 键盘事件
        function handleKeydown(e) {
            if (e.key === 'Escape') {
                document.body.removeChild(modal);
                document.removeEventListener('keydown', handleKeydown);
            }
        }
        document.addEventListener('keydown', handleKeydown);

        // 聚焦输入框
        idInput.focus();
    }

    // 脑图选择器
    function showMindmapPicker() {
        var nightMode = g('nightMode') === true;

        // 创建模态框
        var modal = document.createElement('div');
        modal.className = 'mindmap-picker-modal';
        modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); z-index: 2000; display: flex; flex-direction: column; align-items: center; justify-content: center;';

        // 创建容器
        var container = document.createElement('div');
        container.style.cssText = 'background: ' + (nightMode ? '#2d2d2d' : 'white') + '; border-radius: 12px; padding: 20px; width: 90%; max-width: 600px; max-height: 85vh; overflow: hidden; display: flex; flex-direction: column;';

        // 标题
        var title = document.createElement('div');
        title.textContent = isEn() ? 'Insert Mind Map' : '插入脑图';
        title.style.cssText = 'font-size: 18px; font-weight: 600; margin-bottom: 15px; text-align: center; color: ' + (nightMode ? '#eee' : '#333') + ';';
        container.appendChild(title);

        // 说明文字
        var desc = document.createElement('div');
        desc.innerHTML = isEn() ?
            '<p style="margin-bottom:10px;color:' + (nightMode ? '#aaa' : '#666') + ';font-size:13px;">Use Markdown list format to create mind map:</p>' :
            '<p style="margin-bottom:10px;color:' + (nightMode ? '#aaa' : '#666') + ';font-size:13px;">使用 Markdown 列表格式创建脑图：</p>';
        desc.style.cssText = 'margin-bottom: 15px;';
        container.appendChild(desc);

        // 脑图内容输入
        var contentLabel = document.createElement('label');
        contentLabel.textContent = isEn() ? 'Mind Map Content:' : '脑图内容：';
        contentLabel.style.cssText = 'display: block; margin-bottom: 8px; font-size: 14px; color: ' + (nightMode ? '#ddd' : '#333') + ';';
        container.appendChild(contentLabel);

        var contentInput = document.createElement('textarea');
        contentInput.placeholder = isEn() ?
            '- Main Topic\n  - Subtopic 1\n    - Detail 1\n    - Detail 2\n  - Subtopic 2\n    - Detail 3' :
            '- 主题\n  - 子主题1\n    - 细节1\n    - 细节2\n  - 子主题2\n    - 细节3';
        contentInput.rows = 10;
        contentInput.style.cssText = 'width: 100%; padding: 10px 12px; margin-bottom: 15px; border: 1px solid ' + (nightMode ? '#444' : '#ccc') + '; border-radius: 6px; font-size: 14px; background: ' + (nightMode ? '#222' : '#fafafa') + '; color: ' + (nightMode ? '#eee' : '#333') + '; box-sizing: border-box; resize: vertical; font-family: monospace;';
        container.appendChild(contentInput);

        // 方向选择
        var directionLabel = document.createElement('label');
        directionLabel.textContent = isEn() ? 'Direction:' : '方向：';
        directionLabel.style.cssText = 'display: block; margin-bottom: 8px; font-size: 14px; color: ' + (nightMode ? '#ddd' : '#333') + ';';
        container.appendChild(directionLabel);

        var directionSelect = document.createElement('select');
        directionSelect.style.cssText = 'width: 100%; padding: 10px 12px; margin-bottom: 20px; border: 1px solid ' + (nightMode ? '#444' : '#ccc') + '; border-radius: 6px; font-size: 14px; background: ' + (nightMode ? '#222' : '#fafafa') + '; color: ' + (nightMode ? '#eee' : '#333') + '; box-sizing: border-box;';

        var directions = [
            { value: 'LR', label: isEn() ? 'Left to Right' : '从左到右' },
            { value: 'RL', label: isEn() ? 'Right to Left' : '从右到左' },
            { value: 'TB', label: isEn() ? 'Top to Bottom' : '从上到下' },
            { value: 'BT', label: isEn() ? 'Bottom to Top' : '从下到上' }
        ];

        directions.forEach(function(dir) {
            var option = document.createElement('option');
            option.value = dir.value;
            option.textContent = dir.label;
            directionSelect.appendChild(option);
        });
        container.appendChild(directionSelect);

        // 按钮栏
        var buttonBar = document.createElement('div');
        buttonBar.style.cssText = 'display: flex; gap: 10px; justify-content: flex-end;';

        var cancelBtn = document.createElement('button');
        cancelBtn.textContent = isEn() ? 'Cancel' : '取消';
        cancelBtn.style.cssText = 'padding: 10px 20px; background: ' + (nightMode ? '#444' : '#f5f5f5') + '; color: ' + (nightMode ? '#eee' : '#333') + '; border: none; border-radius: 6px; cursor: pointer; font-size: 14px;';
        cancelBtn.onclick = function() {
            document.body.removeChild(modal);
        };
        buttonBar.appendChild(cancelBtn);

        var insertBtn = document.createElement('button');
        insertBtn.innerHTML = '<i class="fas fa-plus"></i> ' + (isEn() ? 'Insert' : '插入');
        insertBtn.style.cssText = 'padding: 10px 20px; background: #4a90e2; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px;';
        insertBtn.onclick = function() {
            var mindmapContent = contentInput.value.trim();
            var direction = directionSelect.value;

            if (!mindmapContent) {
                mindmapContent = isEn() ?
                    '- Main Topic\n  - Subtopic 1\n  - Subtopic 2' :
                    '- 主题\n  - 子主题1\n  - 子主题2';
            }

            // 生成 Mermaid 脑图代码
            var mermaidCode = '```mermaid\nmindmap\n  root(("' + (isEn() ? 'Main Topic' : '主题') + '"))\n';

            // 解析列表并转换为脑图格式
            var lines = mindmapContent.split('\n');
            var currentIndent = 0;
            var indentStack = [0];

            lines.forEach(function(line) {
                if (!line.trim()) return;

                // 计算缩进级别
                var indent = 0;
                var trimmedLine = line;
                while (trimmedLine.startsWith(' ') || trimmedLine.startsWith('\t')) {
                    indent++;
                    trimmedLine = trimmedLine.substring(1);
                }

                // 移除列表标记
                trimmedLine = trimmedLine.replace(/^[-*+]+\s*/, '').trim();
                if (!trimmedLine) return;

                // 计算相对缩进级别
                var level = Math.floor(indent / 2) + 1;

                // 生成脑图节点
                var indentStr = '    '.repeat(level);
                mermaidCode += indentStr + trimmedLine + '\n';
            });

            mermaidCode += '```';

            insertText(mermaidCode);
            document.body.removeChild(modal);
        };
        buttonBar.appendChild(insertBtn);

        container.appendChild(buttonBar);

        // 右上角关闭按钮
        var closeBtn = document.createElement('button');
        closeBtn.innerHTML = '<i class="fas fa-times"></i>';
        closeBtn.style.cssText = 'position: absolute; top: 15px; right: 15px; width: 32px; height: 32px; background: ' + (nightMode ? '#444' : '#f5f5f5') + '; color: ' + (nightMode ? '#eee' : '#333') + '; border: none; border-radius: 50%; cursor: pointer; font-size: 16px; display: flex; align-items: center; justify-content: center;';
        closeBtn.onclick = function() {
            document.body.removeChild(modal);
        };
        container.style.position = 'relative';
        container.appendChild(closeBtn);

        modal.appendChild(container);
        document.body.appendChild(modal);

        // 点击外部关闭
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                document.body.removeChild(modal);
            }
        });

        // 键盘事件
        function handleKeydown(e) {
            if (e.key === 'Escape') {
                document.body.removeChild(modal);
                document.removeEventListener('keydown', handleKeydown);
            }
        }
        document.addEventListener('keydown', handleKeydown);

        // 聚焦输入框
        contentInput.focus();
    }

    global.showInsertPicker = showInsertPicker;
    global.showFootnotePicker = showFootnotePicker;
    global.showMindmapPicker = showMindmapPicker;

})(typeof window !== 'undefined' ? window : this);
