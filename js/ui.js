/**
分享、操作面板、格式/插入/图表、导出、上传、夜间模式、云打印
 */
(function(global) {
    'use strict';

    function g(name) { return global[name]; }

    function hideMobileActionSheet() {
        var actionSheet = document.getElementById('mobileActionSheet');
        var overlay = document.getElementById('mobileActionSheetOverlay');
        if (actionSheet) actionSheet.classList.remove('show');
        if (overlay) overlay.classList.remove('show');
    }

    function showMobileActionSheet(title, options) {
        var actionSheet = document.getElementById('mobileActionSheet');
        var overlay = document.getElementById('mobileActionSheetOverlay');
        if (!actionSheet || !overlay) return;
        var nightMode = g('nightMode') === true;
        actionSheet.innerHTML = '';
        var titleEl = document.createElement('div');
        titleEl.style.cssText = 'text-align:center;font-weight:600;font-size:18px;margin-bottom:15px;padding:0 20px;color:' + (nightMode ? '#eee' : '#333') + ';';
        titleEl.textContent = title;
        actionSheet.appendChild(titleEl);
        options.forEach(function(option) {
            var optionEl = document.createElement('button');
            optionEl.style.cssText = 'display:flex;align-items:center;width:100%;padding:15px 20px;background:none;border:none;text-align:left;font-size:16px;border-bottom:1px solid ' + (nightMode ? '#444' : '#eee') + ';color:' + (nightMode ? '#eee' : '#333') + ';';
            optionEl.innerHTML = '<span style="font-size:20px;margin-right:15px;width:30px;text-align:center;">' + option.icon + '</span><span>' + option.text + '</span>';
            optionEl.addEventListener('click', function() { option.action(); hideMobileActionSheet(); });
            actionSheet.appendChild(optionEl);
        });
        var cancelEl = document.createElement('button');
        cancelEl.style.cssText = 'display:block;width:90%;margin:15px auto 0;padding:15px;background:' + (nightMode ? '#444' : '#f5f5f5') + ';border:none;border-radius:12px;font-size:16px;font-weight:600;text-align:center;color:' + (nightMode ? '#eee' : '#333') + ';';
        cancelEl.textContent = '取消';
        cancelEl.addEventListener('click', hideMobileActionSheet);
        actionSheet.appendChild(cancelEl);
        actionSheet.classList.add('show');
        overlay.classList.add('show');
        overlay.onclick = hideMobileActionSheet;
    }

    function insertText(text) {
        try {
            if (g('vditor')) {
                // 在插入内容后添加两个空行
                g('vditor').insertValue(text + '\n\n');
            }
        } catch (e) {
            console.error('插入文本错误', e);
            // 显示错误信息给用户
            if (global.showMessage) {
                global.showMessage('插入失败，请重试', 'error');
            }
        }
        hideMobileActionSheet();
    }

    function insertTable() {
        var tableMarkdown = '\n| 标题1 | 标题2 | 标题3 |\n|-------|-------|-------|\n| 内容1 | 内容2 | 内容3 |\n| 内容4 | 内容5 | 内容6 |\n\n\n';
        try {
            if (g('vditor')) {
                g('vditor').insertValue(tableMarkdown);
                global.showMessage('表格已插入，可编辑表格内容');
            }
        } catch (e) {
            console.error('插入表格错误', e);
            if (global.showMessage) {
                global.showMessage('插入表格失败，请重试', 'error');
            }
        }
        hideMobileActionSheet();
    }

    function exportContent() {
        if (!g('vditor')) return;
        var content = g('vditor').getValue();
        var formats = [{ name: 'Markdown文件 (.md)', ext: 'md' }, { name: '纯文本文件 (.txt)', ext: 'txt' }, { name: 'HTML文件 (.html)', ext: 'html' }];
        var exportOptions = formats.map(function(f) {
            return { icon: '<i class="fas fa-file-download"></i>', text: f.name, action: async function() { await exportFile(content, f.ext); } };
        });
        showMobileActionSheet('导出格式', exportOptions);
    }

    async function exportFile(content, ext) {
        var mimeTypes = { md: 'text/markdown', txt: 'text/plain', html: 'text/html' };
        var fileContent = content;

        // 如果是导出为HTML，使用与云打印相同的处理逻辑
        if (ext === 'html') {
            try {
                // 显示加载状态
                var loadingModal = document.createElement('div');
                loadingModal.className = 'modal-overlay';
                loadingModal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.9);z-index:10001;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;';

                var loadingContent = document.createElement('div');
                loadingContent.style.cssText = 'background:white;color:#333;border-radius:12px;padding:30px;text-align:center;';
                loadingContent.innerHTML = '<div style="font-size:24px;margin-bottom:15px;"><i class="fas fa-spinner fa-spin"></i></div><div style="font-size:16px;">处理中...</div>';

                loadingModal.appendChild(loadingContent);
                document.body.appendChild(loadingModal);

                // 使用与云打印相同的处理逻辑
                var nightMode = g('nightMode') === true;
                var settings = {
                    titleFontSize: 24,
                    bodyFontSize: 12,
                    pageMargin: 15,
                    lineHeight: 1.2,
                    paragraphSpacing: 0.5,
                    titleSpacing: 0.8,
                    alignment: 'left',
                    titleAlignment: 'center',
                    fitToPage: false,
                    indentParagraph: true
                };

                // 使用preparePrintContent函数处理内容
                var htmlContent = await preparePrintContent(content, settings);

                // 生成完整的HTML文档
                fileContent = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>导出文档</title>
    <style>
        body {
            font-family: "SimSun", "宋体", serif;
            font-size: 12pt;
            line-height: 1.2;
            color: #333;
            padding: 15mm;
        }
        h1, h2, h3, h4, h5, h6 {
            text-align: center;
            font-weight: bold;
            margin-top: 0.8em;
            margin-bottom: 0.8em;
            line-height: 1.2;
        }
        h1 { font-size: 18pt; }
        h2 { font-size: 16pt; }
        h3 { font-size: 14pt; }
        h4 { font-size: 12pt; }
        p {
            font-size: 12pt;
            margin: 0 0 0.5em 0;
            padding: 0;
            text-align: left;
        }
        .code-block {
            background: #f8f9fa;
            border: 1px solid #ddd;
            border-radius: 4px;
            padding: 15px;
            font-family: monospace;
            font-size: 10pt;
            overflow-x: auto;
            margin: 0.8em 0;
            text-align: left;
        }
        img {
            max-width: 100%;
            height: auto;
            margin: 1em 0;
        }
    </style>
</head>
<body>
    ${htmlContent}
</body>
</html>`;

                // 移除加载状态
                loadingModal.remove();
            } catch (error) {
                console.error('HTML导出错误:', error);
                global.showMessage('HTML导出失败: ' + error.message);
                return;
            }
        }

        var blob = new Blob([fileContent], { type: mimeTypes[ext] || 'text/plain' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = '文档_' + new Date().toISOString().slice(0, 10) + '.' + ext;
        a.click();
        hideMobileActionSheet();
        global.showMessage('文档已导出为.' + ext + '格式');
    }

    function toggleNightMode() {
        global.nightMode = !global.nightMode;
        if (global.nightMode) {
            document.body.classList.add('night-mode');
            // var modeToggle = document.getElementById('modeToggle');
            if (modeToggle) modeToggle.innerHTML = '<i class="fas fa-sun"></i>';
            localStorage.setItem('vditor_night_mode', 'true');
            if (g('vditor')) g('vditor').setTheme('dark');
            global.showMessage('已切换到夜间模式');
        } else {
            document.body.classList.remove('night-mode');
            var modeToggle = document.getElementById('modeToggle');
            if (modeToggle) modeToggle.innerHTML = '<i class="fas fa-moon"></i>';
            localStorage.setItem('vditor_night_mode', 'false');
            if (g('vditor')) g('vditor').setTheme('classic');
            global.showMessage('已切换到日间模式');
        }
    }

    function showFormatMenu() {
        var formatOptions = [
            { icon: '<i class="fas fa-heading"></i>', text: '标题1', action: function() { insertText('# '); } },
            { icon: '<i class="fas fa-heading"></i>', text: '标题2', action: function() { insertText('## '); } },
            { icon: '<i class="fas fa-heading"></i>', text: '标题3', action: function() { insertText('### '); } },
            { icon: '<i class="fas fa-bold"></i>', text: '粗体', action: function() { insertText('**粗体文字**'); } },
            { icon: '<i class="fas fa-italic"></i>', text: '斜体', action: function() { insertText('*斜体文字*'); } },
            { icon: '<i class="fas fa-strikethrough"></i>', text: '删除线', action: function() { insertText('~~删除线文字~~'); } },
            { icon: '<i class="fas fa-code"></i>', text: '代码块', action: function() { insertText('```\n代码块\n```'); } },
            { icon: '<i class="fas fa-quote-right"></i>', text: '引用', action: function() { insertText('> 引用文字'); } }
        ];
        showMobileActionSheet('选择格式', formatOptions);
    }

    function showInsertMenu() {
        var insertOptions = [
            { icon: '<i class="fas fa-link"></i>', text: '链接', action: function() { insertText('[链接文字](https://)'); } },
            { icon: '<i class="fas fa-image"></i>', text: '上传图片', action: function() { triggerImageUpload(); } },
            { icon: '<i class="fas fa-file-upload"></i>', text: '上传文件', action: function() { triggerFileUpload(); } },
            { icon: '<i class="fas fa-globe"></i>', text: '网络图片', action: function() { insertText('![图片描述](图片地址)'); } },
            { icon: '<i class="fas fa-table"></i>', text: '表格', action: insertTable },
            { icon: '<i class="fas fa-list-ul"></i>', text: '无序列表', action: function() { insertText('- 列表项'); } },
            { icon: '<i class="fas fa-list-ol"></i>', text: '有序列表', action: function() { insertText('1. 列表项'); } },
            { icon: '<i class="fas fa-tasks"></i>', text: '任务列表', action: function() { insertText('- [ ] 任务项'); } },
            { icon: '<i class="fas fa-minus"></i>', text: '分割线', action: function() { insertText('\n---\n'); } },
            { icon: '<i class="fas fa-smile"></i>', text: '表情符号', action: function() { if (typeof showEmojiPicker === 'function') showEmojiPicker(); } }
        ];
        showMobileActionSheet('插入内容', insertOptions);
    }

    var chartTemplates = [
        { icon: '<i class="fas fa-project-diagram"></i>', name: '流程图 (Flowchart)', template: '```mermaid\ngraph TD\n    A[开始] --> B(处理过程)\n    B --> C{决策?}\n    C -->|是| D[结束]\n    C -->|否| B\n```' },
        { icon: '<i class="fas fa-exchange-alt"></i>', name: '序列图 (Sequence Diagram)', template: '```mermaid\nsequenceDiagram\n    participant A as 用户\n    participant B as 系统\n    A->>B: 请求数据\n    B-->>A: 返回数据\n    Note right of B: 这是注释\n    A->>B: 确认接收\n```' },
        { icon: '<i class="fas fa-sitemap"></i>', name: '类图 (Class Diagram)', template: '```mermaid\nclassDiagram\n    Class01 <|-- Class02 : 继承\n    Class03 *-- Class04 : 组合\n    Class05 o-- Class06 : 聚合\n    Class07 .. Class08 : 关联\n    Class09 --> Class10 : 依赖\n    class Class01 {\n        +属性1\n        -属性2\n        +方法1()\n        -方法2()\n    }\n```' },
        { icon: '<i class="fas fa-sync-alt"></i>', name: '状态图 (State Diagram)', template: '```mermaid\nstateDiagram-v2\n    [*] --> 状态1\n    状态1 --> 状态2 : 事件1\n    状态2 --> 状态3 : 事件2\n    状态3 --> [*] : 事件3\n    state 状态1 {\n        [*] --> 子状态1\n        子状态1 --> 子状态2\n    }\n```' },
        { icon: '<i class="fas fa-chart-gantt"></i>', name: '甘特图 (Gantt Chart)', template: '```mermaid\ngantt\n    title 项目开发计划\n    dateFormat YYYY-MM-DD\n    section 设计\n    需求分析 :done, des1, 2024-01-01, 7d\n    技术设计 :active, des2, after des1, 5d\n    section 开发\n    前端开发 :dev1, after des2, 10d\n    后端开发 :dev2, after des2, 12d\n    section 测试\n    单元测试 :test1, after dev1, 5d\n    集成测试 :test2, after dev2, 7d\n```' },
        { icon: '<i class="fas fa-chart-pie"></i>', name: '饼图 (Pie Chart)', template: '```mermaid\npie title 市场份额\n    "产品A" : 35\n    "产品B" : 25\n    "产品C" : 20\n    "产品D" : 15\n    "其他" : 5\n```' },
        { icon: '<i class="fas fa-chart-line"></i>', name: '折线图 (Line Chart)', template: '```mermaid\n---\ntitle: 折线图示例\n---\nxychart-beta\n    title "销售增长"\n    x-axis [2020, 2021, 2022, 2023, 2024]\n    y-axis "销售额（万元）" 0 --> 100\n    line [30, 45, 60, 75, 90]\n```' },
        { icon: '<i class="fas fa-chart-bar"></i>', name: '柱状图 (Bar Chart)', template: '```mermaid\n---\ntitle: 柱状图示例\n---\nxychart-beta\n    title "季度销售额"\n    x-axis ["Q1", "Q2", "Q3", "Q4"]\n    y-axis "销售额" 0 --> 200\n    bar [150, 180, 120, 190]\n```' }
    ];

    function insertChartTemplate(template) {
        try {
            if (g('vditor')) {
                // 确保在插入图表后添加两个空行
                g('vditor').insertValue(template + '\n\n');
                global.showMessage('图表模板已插入');
            }
        } catch (e) {
            console.error('插入图表错误', e);
            if (global.showMessage) {
                global.showMessage('插入图表失败，请重试', 'error');
            }
        }
        hideMobileActionSheet();
    }

    function showChartPicker() {
        var chartOptions = chartTemplates.map(function(opt) {
            return { icon: opt.icon, text: opt.name, action: function() { insertChartTemplate(opt.template); } };
        });
        showMobileActionSheet('选择图表类型', chartOptions);
    }

    function triggerFileUpload() {
        var input = document.createElement('input');
        input.type = 'file';
        input.multiple = true;
        input.onchange = async function(e) {
            var files = Array.from(e.target.files || []);
            if (files.length > 0) {
                hideMobileActionSheet();
                try {
                    await global.uploadFiles(files, true);
                } catch (err) {
                    global.showMessage('上传失败', 'error');
                }
            }
        };
        input.click();
    }

    function triggerImageUpload() {
        var input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.multiple = true;
        input.onchange = async function(e) {
            var files = Array.from(e.target.files || []);
            if (files.length > 0) {
                hideMobileActionSheet();
                try {
                    await global.uploadFiles(files, true);
                } catch (err) {
                    global.showMessage('上传失败', 'error');
                }
            }
        };
        input.click();
    }

    async function uploadFiles(filesArray, autoInsert) {
        autoInsert = autoInsert !== false;
        var formData = new FormData();
        for (var i = 0; i < filesArray.length; i++) formData.append('files[]', filesArray[i]);
        formData.append('uploadDir', 'uploads');
        try {
            global.showUploadStatus('正在上传文件...', 'info');
            var response = await fetch('api/upload.php', { method: 'POST', body: formData });
            var result = await response.json();
            if (result.success) {
                global.showUploadStatus('上传成功！共' + result.count + '个文件', 'success');
                var markdownLinks = result.urls.map(function(url) {
                    var fileName = url.split('/').pop();
                    return /\.(jpg|jpeg|png|gif|bmp|webp|svg)$/i.test(fileName) ? '![' + fileName + '](' + url + ')' : '[' + fileName + '](' + url + ')';
                });
                if (autoInsert && markdownLinks.length > 0 && g('vditor')) {
                    g('vditor').insertValue(markdownLinks.join('\n\n') + '\n\n');
                }
                return markdownLinks.join('\n\n');

            }
            global.showUploadStatus('上传失败: ' + (result.message || ''), 'error');
            throw new Error(result.message || '上传失败');
        } catch (error) {
            console.error('上传错误', error);
            global.showUploadStatus('上传失败，请检查网络', 'error');
            throw error;
        }
    }

    async function createShareLink(filename, mode, sharePassword, expireDays) {
        mode = mode || 'view';
        expireDays = expireDays || 7;
        if (!g('currentUser')) throw new Error('用户未登录');
        try {
            var body = { username: g('currentUser').username, token: g('currentUser').token, password: g('currentUser').password, filename: filename, mode: mode, expire_days: expireDays };
            if (sharePassword && sharePassword.trim()) body.share_password = sharePassword.trim();
            var apiUrl = (global.getApiBaseUrl ? global.getApiBaseUrl() : 'api/index.php') + '?action=create_share';
            var response = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            if (global.parseJsonResponse) return await global.parseJsonResponse(response);
            var text = await response.text();
            if ((text || '').trim().charAt(0) === '<') return { code: 500, message: '接口返回了非 JSON 内容，请检查 API 与后端服务' };
            try { return JSON.parse(text); } catch (e) { return { code: 500, message: '响应解析失败' }; }
        } catch (e) {
            console.error('创建分享链接失败', e);
            return { code: 500, message: '网络错误: ' + (e.message || '') };
        }
    }

    function showShareResult(shareData, oldModal) {
        if (oldModal) oldModal.remove();
        var nightMode = g('nightMode') === true;
        var resultModal = document.createElement('div');
        resultModal.className = 'modal-overlay';
        resultModal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:10000;';
        var modalContent = document.createElement('div');
        modalContent.style.cssText = 'background:' + (nightMode ? '#2d2d2d' : 'white') + ';color:' + (nightMode ? '#eee' : '#333') + ';border-radius:12px;padding:25px;width:90%;max-width:500px;';
        modalContent.innerHTML = '<div style="text-align:center;margin-bottom:20px;color:#2ecc71;"><i class="fas fa-check-circle" style="font-size:48px;"></i></div><h2 style="text-align:center;margin-bottom:15px;">分享链接创建成功</h2><div style="background:' + (nightMode ? '#3d3d3d' : '#f5f5f5') + ';padding:15px;border-radius:8px;margin-bottom:20px;"><div style="font-size:12px;margin-bottom:5px;">分享链接：</div><div style="word-break:break-all;font-size:14px;padding:8px;">' + shareData.share_url + '</div></div><div style="display:flex;gap:10px;"><button class="share-copy-btn" style="flex:1;padding:12px;background:#4a90e2;color:white;border:none;border-radius:6px;cursor:pointer;">复制链接</button><button class="share-close-btn" style="flex:1;padding:12px;background:' + (nightMode ? '#555' : '#6c757d') + ';color:white;border:none;border-radius:6px;cursor:pointer;">完成</button></div>';
        resultModal.appendChild(modalContent);
        document.body.appendChild(resultModal);
        modalContent.querySelector('.share-copy-btn').onclick = function() {
            navigator.clipboard.writeText(shareData.share_url).then(function() {
                global.showMessage('链接已复制');
            });
        };
        modalContent.querySelector('.share-close-btn').onclick = function() { resultModal.remove(); };
        resultModal.addEventListener('click', function(e) { if (e.target === resultModal) resultModal.remove(); });
    }

    function showShareDialog() {
        if (!g('currentUser')) { global.showMessage('请先登录以使用分享功能', 'error'); return; }
        if (!g('currentFileId')) { global.showMessage('请先打开或创建文件', 'error'); return; }
        var files = g('files');
        var file = files.find(function(f) { return f.id === g('currentFileId'); });
        if (!file) { global.showMessage('未找到当前文件', 'error'); return; }
        var nightMode = g('nightMode') === true;

        // 创建分享对话框
        var shareModal = document.createElement('div');
        shareModal.className = 'modal-overlay';
        shareModal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:10000;';
        var bg = nightMode ? '#2d2d2d' : 'white';
        var textColor = nightMode ? '#eee' : '#333';
        var shareContent = document.createElement('div');
        shareContent.style.cssText = 'background:' + bg + ';color:' + textColor + ';border-radius:12px;padding:25px;width:90%;max-width:500px;';

        // 显示加载状态
        shareContent.innerHTML = '<h2 style="text-align:center;margin-bottom:15px;">分享文档</h2><p style="text-align:center;margin-bottom:20px;">文件: ' + file.name + '</p><div style="text-align:center;padding:30px;"><i class="fas fa-spinner fa-spin" style="font-size:24px;"></i><p style="margin-top:10px;">检查分享链接...</p></div>';
        shareModal.appendChild(shareContent);
        document.body.appendChild(shareModal);

        // 检查是否已有分享链接
        checkExistingShareLink(file.name, shareModal, shareContent, nightMode, bg, textColor);

        shareModal.addEventListener('click', function(e) { if (e.target === shareModal) shareModal.remove(); });
    }

    async function checkExistingShareLink(filename, shareModal, shareContent, nightMode, bg, textColor) {
        try {
            // 调用API检查是否已有分享链接
            var body = { username: g('currentUser').username, token: g('currentUser').token, password: g('currentUser').password, filename: filename };
            var apiUrl = (global.getApiBaseUrl ? global.getApiBaseUrl() : 'api/index.php') + '?action=list_shares';
            var response = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            var result = await global.parseJsonResponse(response);

            if (result.code === 200 && result.data && result.data.shares) {
                // 查找当前文件的分享链接
                var existingShare = result.data.shares.find(function(share) { return share.filename === filename; });
                if (existingShare) {
                    // 显示已有的分享链接
                    showExistingShareLink(existingShare, filename, shareModal, shareContent, nightMode, bg, textColor);
                } else {
                    // 没有分享链接，显示创建界面
                    showCreateShareLink(filename, shareModal, shareContent, nightMode, bg, textColor);
                }
            } else {
                // API调用失败，显示创建界面
                showCreateShareLink(filename, shareModal, shareContent, nightMode, bg, textColor);
            }
        } catch (error) {
            console.error('检查分享链接失败:', error);
            // 出错时显示创建界面
            showCreateShareLink(filename, shareModal, shareContent, nightMode, bg, textColor);
        }
    }

    function showExistingShareLink(existingShare, filename, shareModal, shareContent, nightMode, bg, textColor) {
        // 生成过期时间选项
        var expiryOptions = '';
        var expiryValues = [7, 30, 0];
        var expiryLabels = ['7天后', '30天后', '永不过期'];
        var currentExpiry = 7; // 默认值

        // 计算当前过期时间（如果有）
        if (existingShare.expires_at) {
            var now = new Date();
            var expiryDate = new Date(existingShare.expires_at);
            var daysDiff = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));
            if (daysDiff <= 7) currentExpiry = 7;
            else if (daysDiff <= 30) currentExpiry = 30;
            else currentExpiry = 0;
        } else {
            currentExpiry = 0; // 永不过期
        }

        for (var i = 0; i < expiryValues.length; i++) {
            var selected = (expiryValues[i] === currentExpiry) ? 'selected' : '';
            expiryOptions += '<option value="' + expiryValues[i] + '" ' + selected + '>' + expiryLabels[i] + '</option>';
        }

        // 更新对话框内容
        shareContent.innerHTML = `
            <h2 style="text-align:center;margin-bottom:15px;">分享文档</h2>
            <p style="text-align:center;margin-bottom:20px;">文件: ${filename}</p>
            
            <!-- 现有分享链接信息 -->
            <div style="background:${nightMode ? '#3d3d3d' : '#f5f5f5'};padding:15px;border-radius:8px;margin-bottom:20px;">
                <h3 style="margin-bottom:10px;">现有分享链接</h3>
                <div style="word-break:break-all;margin-bottom:10px;">
                    <strong>链接:</strong> <a href="${existingShare.share_url}" target="_blank" style="color:#4a90e2;">${existingShare.share_url}</a>
                </div>
                <div style="font-size:14px;color:${nightMode ? '#aaa' : '#666'};">
                    <p><strong>模式:</strong> ${existingShare.mode === 'view' ? '仅查看' : '允许编辑'}</p>
                    <p><strong>创建时间:</strong> ${new Date(existingShare.created_at).toLocaleString()}</p>
                    ${existingShare.expires_at ? `<p><strong>过期时间:</strong> ${new Date(existingShare.expires_at).toLocaleString()}</p>` : '<p><strong>过期时间:</strong> 永不过期</p>'}
                </div>
            </div>
            
            <!-- 编辑选项 -->
            <div style="margin-bottom:15px;">
                <label>分享模式</label>
                <div style="margin-top:8px;">
                    <label><input type="radio" name="shareMode" value="view" ${existingShare.mode === 'view' ? 'checked' : ''}> 仅查看</label>
                    <label><input type="radio" name="shareMode" value="edit" ${existingShare.mode === 'edit' ? 'checked' : ''}> 允许编辑</label>
                </div>
            </div>
            
            <div style="margin-bottom:15px;">
                <label>过期时间</label>
                <select id="shareExpiry" style="width:100%;padding:8px;margin-top:5px;">
                    ${expiryOptions}
                </select>
            </div>
            
            <div id="shareError" style="color:#e74c3c;font-size:13px;margin-bottom:10px;display:none;"></div>
            
            <div style="display:flex;gap:10px;margin-top:20px;">
                <button type="button" id="shareCancelBtn" style="flex:1;padding:10px;background:${nightMode ? '#555' : '#6c757d'};color:white;border:none;border-radius:6px;cursor:pointer;">取消</button>
                <button type="button" id="shareDeleteBtn" style="flex:1;padding:10px;background:${nightMode ? '#555' : '#dc3545'};color:white;border:none;border-radius:6px;cursor:pointer;">删除链接</button>
                <button type="button" id="shareUpdateBtn" style="flex:2;padding:10px;background:#4a90e2;color:white;border:none;border-radius:6px;cursor:pointer;">更新链接</button>
            </div>
        `;

        // 绑定按钮事件
        shareContent.querySelector('#shareCancelBtn').onclick = function() { shareModal.remove(); };

        // 删除分享链接
        shareContent.querySelector('#shareDeleteBtn').onclick = async function() {
            if (confirm('确定要删除这个分享链接吗？删除后将无法恢复。')) {
                var btn = this;
                btn.disabled = true;
                btn.textContent = '删除中...';
                try {
                    var body = { username: g('currentUser').username, token: g('currentUser').token, password: g('currentUser').password, share_id: existingShare.share_id };
                    var apiUrl = (global.getApiBaseUrl ? global.getApiBaseUrl() : 'api/index.php') + '?action=delete_share';
                    var response = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
                    var result = await global.parseJsonResponse(response);
                    if (result.code === 200) {
                        global.showMessage('分享链接已删除');
                        shareModal.remove();
                    } else {
                        shareContent.querySelector('#shareError').textContent = result.message || '删除失败';
                        shareContent.querySelector('#shareError').style.display = 'block';
                        btn.disabled = false;
                        btn.textContent = '删除链接';
                    }
                } catch (err) {
                    shareContent.querySelector('#shareError').textContent = err.message || '网络错误';
                    shareContent.querySelector('#shareError').style.display = 'block';
                    btn.disabled = false;
                    btn.textContent = '删除链接';
                }
            }
        };

        // 更新分享链接
        shareContent.querySelector('#shareUpdateBtn').onclick = async function() {
            var btn = this;
            btn.disabled = true;
            btn.textContent = '更新中...';
            var mode = shareContent.querySelector('input[name="shareMode"]:checked').value;
            var expireDays = parseInt(shareContent.querySelector('#shareExpiry').value) || 7;
            try {
                // 直接更新分享属性
                var updateBody = {
                    username: g('currentUser').username,
                    token: g('currentUser').token,
                    password: g('currentUser').password,
                    share_id: existingShare.share_id,
                    mode: mode,
                    expire_days: expireDays
                };
                var updateUrl = (global.getApiBaseUrl ? global.getApiBaseUrl() : 'api/index.php') + '?action=update_share_properties';
                var updateResponse = await fetch(updateUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updateBody) });
                var updateResult = await global.parseJsonResponse(updateResponse);

                if (updateResult.code === 200 && updateResult.data) {
                    // 更新成功，显示结果
                    showShareResult(updateResult.data, shareModal);
                } else {
                    shareContent.querySelector('#shareError').textContent = updateResult.message || '更新失败';
                    shareContent.querySelector('#shareError').style.display = 'block';
                    btn.disabled = false;
                    btn.textContent = '更新链接';
                }
            } catch (err) {
                shareContent.querySelector('#shareError').textContent = err.message || '网络错误';
                shareContent.querySelector('#shareError').style.display = 'block';
                btn.disabled = false;
                btn.textContent = '更新链接';
            }
        };
    }

    function showCreateShareLink(filename, shareModal, shareContent, nightMode, bg, textColor) {
        // 更新对话框内容为创建界面
        shareContent.innerHTML = `
            <h2 style="text-align:center;margin-bottom:15px;">分享文档</h2>
            <p style="text-align:center;margin-bottom:20px;">文件: ${filename}</p>
            <div style="margin-bottom:15px;">
                <label>分享模式</label>
                <div style="margin-top:8px;">
                    <label><input type="radio" name="shareMode" value="view" checked> 仅查看</label> <label><input type="radio" name="shareMode" value="edit"> 允许编辑</label>
                </div>
            </div>
            <div style="margin-bottom:15px;">
                <label>过期时间</label>
                <select id="shareExpiry" style="width:100%;padding:8px;margin-top:5px;">
                    <option value="7">7天后</option>
                    <option value="30">30天后</option>
                    <option value="0">永不过期</option>
                </select>
            </div>
            <div id="shareError" style="color:#e74c3c;font-size:13px;margin-bottom:10px;display:none;"></div>
            <div style="display:flex;gap:10px;margin-top:20px;">
                <button type="button" id="shareCancelBtn" style="flex:1;padding:10px;background:${nightMode ? '#555' : '#6c757d'};color:white;border:none;border-radius:6px;cursor:pointer;">取消</button>
                <button type="button" id="shareCreateBtn" style="flex:2;padding:10px;background:#4a90e2;color:white;border:none;border-radius:6px;cursor:pointer;">创建分享链接</button>
            </div>
        `;

        // 绑定按钮事件
        shareContent.querySelector('#shareCancelBtn').onclick = function() { shareModal.remove(); };

        shareContent.querySelector('#shareCreateBtn').onclick = async function() {
            var btn = this;
            btn.disabled = true;
            btn.textContent = '创建中...';
            var mode = shareContent.querySelector('input[name="shareMode"]:checked').value;
            var expireDays = parseInt(shareContent.querySelector('#shareExpiry').value) || 7;
            try {
                var result = await createShareLink(filename, mode, null, expireDays);
                if (result.code === 200 && result.data) {
                    showShareResult(result.data, shareModal);
                } else {
                    shareContent.querySelector('#shareError').textContent = result.message || '创建失败';
                    shareContent.querySelector('#shareError').style.display = 'block';
                    btn.disabled = false;
                    btn.textContent = '创建分享链接';
                }
            } catch (err) {
                shareContent.querySelector('#shareError').textContent = err.message || '网络错误';
                shareContent.querySelector('#shareError').style.display = 'block';
                btn.disabled = false;
                btn.textContent = '创建分享链接';
            }
        };
    }

    function showPrintDialog() {
        // 检查用户是否登录
        if (!g('currentUser')) {
            global.showMessage('请先登录后再使用云打印功能');
            if (g('showLoginModal')) {
                g('showLoginModal')();
            }
            return;
        }

        var nightMode = g('nightMode') === true;
        var printModal = document.createElement('div');
        printModal.className = 'modal-overlay';
        printModal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:10000;';

        var bg = nightMode ? '#2d2d2d' : 'white';
        var textColor = nightMode ? '#eee' : '#333';
        var borderColor = nightMode ? '#444' : '#ddd';
        var modalContent = document.createElement('div');
        modalContent.style.cssText = 'background:' + bg + ';color:' + textColor + ';border-radius:12px;padding:25px;width:90%;max-width:600px;max-height:85vh;overflow-y:auto;';

        var title = '<h2 style="text-align:center;margin-bottom:20px;">云打印设置</h2>';

        // AI智能排版按钮区域
        var aiSection = `
            <div style="margin-bottom:20px;">
                <button id="aiLayoutBtn" style="width:100%;padding:12px;font-weight:bold;background:linear-gradient(135deg, #667eea 0%, #764ba2 100%);color:white;border:none;border-radius:6px;cursor:pointer;font-size:15px;">
                    <i class="fas fa-magic"></i> AI智能排版
                </button>
            </div>
            <div style="margin-bottom:20px;">
                <button id="printFileBtn" style="width:100%;padding:12px;font-weight:bold;background:#4CAF50;color:white;border:none;border-radius:6px;cursor:pointer;">
                    <i class="fas fa-file-upload"></i> 上传文件打印
                </button>
            </div>
        `;


// 检测操作系统并返回对应的下载信息
        function getDownloadInfo() {
            var ua = navigator.userAgent;
            if (ua.indexOf('Win') !== -1) {
                return {
                    file: 'print_client.exe',
                    text: '点击下载打印客户端 (Windows)'
                };
            } else if (ua.indexOf('Linux') !== -1 && ua.indexOf('Android') === -1) {
                // 排除 Android 设备（如果也想支持 Android 可单独处理）
                return {
                    file: 'print_client.tar.gz',
                    text: '点击下载打印客户端 (Linux)'
                };
            } else if (ua.indexOf('Mac') !== -1) {
                // macOS 用户，可提示或不提供专门版本，此处仍给 Windows 并提醒
                return {
                    file: 'print_client.exe',
                    text: '暂不支持macos系统，点击下载windows版本'
                };
            } else {
                // 其他未知系统，默认提供 Windows 版本
                return {
                    file: 'print_client.exe',
                    text: '点击下载打印客户端 (Windows版本)'
                };
            }
        }

        var downloadInfo = getDownloadInfo();
        var downloadLink = '<a href="' + downloadInfo.file + '" target="_blank" style="color:#4a90e2;">' + downloadInfo.text + '</a>';

// 客户端连接状态区域
        var statusSection = `
    <div style="margin-bottom:20px;padding:15px;background:` + (nightMode ? '#3d3d3d' : '#f8f9fa') + `;border-radius:8px;">
        <h3 style="margin-top:0;margin-bottom:10px;">打印客户端状态</h3>
        <div id="clientStatus" style="display:flex;align-items:center;gap:10px;">
            <div id="statusIndicator" style="width:12px;height:12px;border-radius:50%;background:#dc3545;"></div>
            <span id="statusText" style="font-size:14px;">请连接打印客户端</span>
        </div>
        <p style="margin-top:10px;font-size:14px;color:` + (nightMode ? '#aaa' : '#666') + `;">` + downloadLink + `</p>
    </div>
`;

        var settingsSection = `
            <div style="margin-bottom:20px;">
                <h3 style="margin-top:0;margin-bottom:15px;">打印设置</h3>
                <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(200px, 1fr));gap:15px;">
                    <div>
                        <label style="display:block;margin-bottom:5px;font-size:14px;">标题字号</label>
                        <div style="position:relative;">
                            <input type="number" id="titleFontSize" value="24" min="8" max="72" style="width:100%;padding:8px;border:1px solid ` + borderColor + `;border-radius:6px;background:` + (nightMode ? '#3d3d3d' : 'white') + `;color:` + textColor + `;">
                            <span style="position:absolute;right:10px;top:50%;transform:translateY(-50%);color:` + (nightMode ? '#aaa' : '#666') + `;">pt</span>
                        </div>
                    </div>
                    <div>
                        <label style="display:block;margin-bottom:5px;font-size:14px;">正文字号</label>
                        <div style="position:relative;">
                            <input type="number" id="bodyFontSize" value="12" min="6" max="48" style="width:100%;padding:8px;border:1px solid ` + borderColor + `;border-radius:6px;background:` + (nightMode ? '#3d3d3d' : 'white') + `;color:` + textColor + `;">
                            <span style="position:absolute;right:10px;top:50%;transform:translateY(-50%);color:` + (nightMode ? '#aaa' : '#666') + `;">pt</span>
                        </div>
                    </div>
                    <div>
                        <label style="display:block;margin-bottom:5px;font-size:14px;">页边距</label>
                        <select id="pageMargin" style="width:100%;padding:8px;border:1px solid ` + borderColor + `;border-radius:6px;background:` + (nightMode ? '#3d3d3d' : 'white') + `;color:` + textColor + `;">
                            <option value="10">10mm (小)</option>
                            <option value="15" selected>15mm (默认)</option>
                            <option value="20">20mm (大)</option>
                            <option value="25">25mm (特大)</option>
                        </select>
                    </div>
                    <div>
                        <label style="display:block;margin-bottom:5px;font-size:14px;">行距</label>
                        <select id="lineHeight" style="width:100%;padding:8px;border:1px solid ` + borderColor + `;border-radius:6px;background:` + (nightMode ? '#3d3d3d' : 'white') + `;color:` + textColor + `;">
                            <option value="1.0">1.0倍</option>
                            <option value="1.2" selected>1.2倍 (默认)</option>
                            <option value="1.4">1.4倍</option>
                            <option value="1.5">1.5倍</option>
                            <option value="2.0">2.0倍</option>
                        </select>
                    </div>
                    <div>
                        <label style="display:block;margin-bottom:5px;font-size:14px;">段落间距</label>
                        <select id="paragraphSpacing" style="width:100%;padding:8px;border:1px solid ` + borderColor + `;border-radius:6px;background:` + (nightMode ? '#3d3d3d' : 'white') + `;color:` + textColor + `;">
                            <option value="0.2">0.2倍 (小)</option>
                            <option value="0.5" selected>0.5倍 (默认)</option>
                            <option value="0.8">0.8倍</option>
                            <option value="1.0">1.0倍</option>
                            <option value="1.2">1.2倍 (大)</option>
                        </select>
                    </div>
                    <div>
                        <label style="display:block;margin-bottom:5px;font-size:14px;">标题间距</label>
                        <select id="titleSpacing" style="width:100%;padding:8px;border:1px solid ` + borderColor + `;border-radius:6px;background:` + (nightMode ? '#3d3d3d' : 'white') + `;color:` + textColor + `;">
                            <option value="0.5">0.5倍 (小)</option>
                            <option value="0.8" selected>0.8倍 (默认)</option>
                            <option value="1.0">1.0倍</option>
                            <option value="1.2">1.2倍</option>
                            <option value="1.5">1.5倍 (大)</option>
                        </select>
                    </div>
                    <div>
        <label style="display:block;margin-bottom:5px;font-size:14px;">标题对齐</label>
        <div style="display:flex;gap:8px;">
            <button class="title-align-btn" data-align="left" style="flex:1;padding:8px;background:${nightMode ? '#424242' : '#E0E0E0'};color:${textColor};border:none;border-radius:6px;cursor:pointer;">居左</button>
            <button class="title-align-btn active" data-align="center" style="flex:1;padding:8px;background:#2196F3;color:white;border:none;border-radius:6px;cursor:pointer;">居中</button>
            <button class="title-align-btn" data-align="right" style="flex:1;padding:8px;background:${nightMode ? '#424242' : '#E0E0E0'};color:${textColor};border:none;border-radius:6px;cursor:pointer;">居右</button>
        </div>
    </div>
                    <div>
        <label style="display:block;margin-bottom:5px;font-size:14px;">内容对齐</label>
        <div style="display:flex;gap:8px;">
            <button class="align-btn active" data-align="left" style="flex:1;padding:8px;background:#2196F3;color:white;border:none;border-radius:6px;cursor:pointer;">居左</button>
            <button class="align-btn" data-align="center" style="flex:1;padding:8px;background:${nightMode ? '#424242' : '#E0E0E0'};color:${textColor};border:none;border-radius:6px;cursor:pointer;">居中</button>
            <button class="align-btn" data-align="right" style="flex:1;padding:8px;background:${nightMode ? '#424242' : '#E0E0E0'};color:${textColor};border:none;border-radius:6px;cursor:pointer;">居右</button>
        </div>
                        <div style="margin-top:10px;">
                            <label style="display:flex;align-items:center;gap:10px;cursor:pointer;">
                                <input type="checkbox" id="indentParagraph" checked style="width:18px;height:18px;">
                                <span style="font-size:14px;">每段段首自动空两格</span>
                            </label>
                        </div>
                    </div>
                </div>
                <div style="margin-top:15px;">
                    <label style="display:flex;align-items:center;gap:10px;cursor:pointer;">
                        <input type="checkbox" id="fitToPage" style="width:18px;height:18px;">
                        <span style="font-size:14px;">自动排版至一页</span>
                    </label>
                </div>
            </div>
        `;

        var actionButtons = `
            <div style="display:flex;gap:10px;margin-top:20px;">
                <button id="printPreviewBtn" style="flex:1;padding:12px;font-weight:bold;background:#4CAF50;color:white;border:none;border-radius:6px;cursor:pointer;">预览</button>
                <button id="printSendBtn" style="flex:1;padding:12px;font-weight:bold;background:#2196F3;color:white;border:none;border-radius:6px;cursor:pointer;">发送打印</button>
                <button id="printCancelBtn" style="flex:1;padding:12px;background:` + (nightMode ? '#555' : '#9E9E9E') + `;color:white;border:none;border-radius:6px;cursor:pointer;">取消</button>
            </div>
        `;

        modalContent.innerHTML = title + aiSection + statusSection + settingsSection + actionButtons;
        printModal.appendChild(modalContent);
        document.body.appendChild(printModal);

        // 连接到打印服务器检查客户端状态
        var statusIndicator = modalContent.querySelector('#statusIndicator');
        var statusText = modalContent.querySelector('#statusText');

        var ws = null;
        var wsTimeout = null;
        var statusCheckInterval = null;

        function closeWebSocket() {
            if (ws) {
                ws.close();
                ws = null;
            }
            if (wsTimeout) {
                clearTimeout(wsTimeout);
                wsTimeout = null;
            }
        }

        function updateClientStatus(connected) {
            if (connected) {
                statusIndicator.style.backgroundColor = '#28a745';
                statusText.textContent = '打印客户端已连接';
            } else {
                statusIndicator.style.backgroundColor = '#dc3545';
                statusText.textContent = '请连接打印客户端';
            }
        }

        // 连接到打印服务器检查状态
        function checkClientStatus() {
            var wsUrl = 'wss://print.yhsun.cn';
            ws = new WebSocket(wsUrl);
            wsTimeout = setTimeout(function() {
                updateClientStatus(false);
                closeWebSocket();
            }, 5000);

            ws.onopen = function() {
                clearTimeout(wsTimeout);
                // 发送状态检查请求，使用用户的账号信息
                ws.send(JSON.stringify({
                    type: 'check_client_status',
                    username: g('currentUser').username,
                    password: g('currentUser').password
                }));
            };

            ws.onmessage = function(event) {
                try {
                    var response = JSON.parse(event.data);
                    if (response.type === 'client_status') {
                        updateClientStatus(response.connected);
                    }
                    closeWebSocket();
                } catch (e) {
                    console.error('响应解析错误:', e);
                    updateClientStatus(false);
                    closeWebSocket();
                }
            };

            ws.onerror = function(error) {
                clearTimeout(wsTimeout);
                console.error('WebSocket错误:', error);
                updateClientStatus(false);
                closeWebSocket();
            };

            ws.onclose = function(event) {
                clearTimeout(wsTimeout);
            };
        }

        // 初始检查客户端状态
        checkClientStatus();

        // 设置定时器，每3秒检查一次客户端状态
        statusCheckInterval = setInterval(checkClientStatus, 3000);

        // 关闭模态框时关闭WebSocket连接和清除定时器
        function cleanup() {
            closeWebSocket();
            if (statusCheckInterval) {
                clearInterval(statusCheckInterval);
                statusCheckInterval = null;
            }
        }

        // 关闭模态框时关闭WebSocket连接
        var cancelBtn = modalContent.querySelector('#printCancelBtn');
        if (cancelBtn) {
            cancelBtn.onclick = function() {
                cleanup();
                printModal.remove();
            };
        }

        // 预览和发送按钮也需要关闭连接
        var previewBtn = modalContent.querySelector('#printPreviewBtn');
        if (previewBtn) {
            previewBtn.onclick = debounce(async function() {
                cleanup();
                await showPrintPreview(getPrintSettings(modalContent));
            }, 500);
        }

        var sendBtn = modalContent.querySelector('#printSendBtn');
        if (sendBtn) {
            sendBtn.onclick = debounce(function() {
                cleanup();
                sendToPrint(getPrintSettings(modalContent));
            }, 500);
        }

        // 上传文件打印按钮事件
        var printFileBtn = modalContent.querySelector('#printFileBtn');
        if (printFileBtn) {
            // 移除水波纹效果
            printFileBtn.onclick = debounce(function() {
                // 创建文件输入元素
                var input = document.createElement('input');
                input.type = 'file';
                input.multiple = true;
                input.accept = '.pdf,.doc,.docx,.xls,.xlsx,.txt,.ppt,.pptx,.png,.jpg,.jpeg';
                input.onchange = async function(e) {
                    var files = Array.from(e.target.files || []);
                    if (files.length > 0) {
                        cleanup();
                        printModal.remove();
                        // 直接处理选择的文件
                        await handleSelectedFiles(files);
                    }
                };
                input.click();
            }, 500);
        }

        // 处理选择的文件
        async function handleSelectedFiles(files) {
            if (!g('currentUser')) {
                global.showMessage('请先登录后再使用文件打印功能');
                if (g('showLoginModal')) {
                    g('showLoginModal')();
                }
                return;
            }

            // 检查打印客户端连接状态
            var isConnected = await checkPrintClientConnection();
            if (!isConnected) {
                // 连接失败，显示连接提示
                showConnectionErrorDialog(files);
                return;
            }

            try {
                global.showMessage('正在处理上传的文件...');

                // 上传文件到服务器
                var formData = new FormData();
                files.forEach(function(file) {
                    formData.append('files[]', file);
                });

                // 发送文件到打印服务器
                var response = await fetch('api/upload.php', {
                    method: 'POST',
                    body: formData
                });

                var result = await response.json();
                if (result.success) {
                    // 调用打印函数发送文件URL到打印服务器
                    for (var i = 0; i < result.urls.length; i++) {
                        await sendFileToPrint(result.urls[i], files[i].name);
                    }
                    global.showMessage('文件打印任务已发送');
                } else {
                    global.showMessage('文件上传失败: ' + (result.message || '未知错误'), 'error');
                }
            } catch (error) {
                console.error('文件打印失败:', error);
                global.showMessage('文件打印失败: ' + error.message, 'error');
            }
        }

        // 检查打印客户端连接状态
        function checkPrintClientConnection() {
            return new Promise(function(resolve) {
                var wsUrl = 'wss://print.yhsun.cn';
                var ws = new WebSocket(wsUrl);
                var timeout = setTimeout(function() {
                    resolve(false);
                    if (ws) ws.close();
                }, 5000);

                ws.onopen = function() {
                    clearTimeout(timeout);
                    // 发送状态检查请求
                    ws.send(JSON.stringify({
                        type: 'check_client_status',
                        username: g('currentUser').username,
                        password: g('currentUser').password
                    }));
                };

                ws.onmessage = function(event) {
                    try {
                        var response = JSON.parse(event.data);
                        if (response.type === 'client_status') {
                            resolve(response.connected);
                        } else {
                            resolve(false);
                        }
                    } catch (e) {
                        resolve(false);
                    } finally {
                        clearTimeout(timeout);
                        if (ws) ws.close();
                    }
                };

                ws.onerror = function() {
                    clearTimeout(timeout);
                    resolve(false);
                    if (ws) ws.close();
                };

                ws.onclose = function() {
                    clearTimeout(timeout);
                    resolve(false);
                };
            });
        }

        // 显示连接错误对话框
        function showConnectionErrorDialog(files) {
            var nightMode = g('nightMode') === true;
            var bg = nightMode ? '#2d2d2d' : 'white';
            var textColor = nightMode ? '#eee' : '#333';

            var connectionModal = document.createElement('div');
            connectionModal.className = 'modal-overlay';
            connectionModal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:10001;';

            var modalContent = document.createElement('div');
            modalContent.style.cssText = 'background:' + bg + ';color:' + textColor + ';border-radius:12px;padding:25px;width:90%;max-width:500px;';

            modalContent.innerHTML = `
                <h2 style="text-align:center;margin-top:0;margin-bottom:20px;">打印客户端连接</h2>
                <div style="text-align:center;margin-bottom:20px;">
                    <i class="fas fa-exclamation-circle" style="font-size:48px;color:#ff9800;margin-bottom:15px;"></i>
                    <p style="font-size:16px;">无法连接到打印客户端</p>
                    <p style="font-size:14px;color:${nightMode ? '#aaa' : '#666'};margin-top:10px;">请确保打印客户端已启动并使用您的账号密码绑定</p>
                </div>
                <div style="display:flex;gap:10px;margin-top:20px;">
                    <button id="retryConnectionBtn" style="flex:1;padding:12px;font-weight:bold;background:#4CAF50;color:white;border:none;border-radius:6px;cursor:pointer;">重新连接</button>
                    <button id="cancelConnectionBtn" style="flex:1;padding:12px;background:${nightMode ? '#555' : '#9E9E9E'};color:white;border:none;border-radius:6px;cursor:pointer;">取消</button>
                </div>
            `;

            connectionModal.appendChild(modalContent);
            document.body.appendChild(connectionModal);

            // 重新连接按钮事件
            var retryBtn = modalContent.querySelector('#retryConnectionBtn');
            if (retryBtn) {
                retryBtn.onclick = async function() {
                    retryBtn.disabled = true;
                    retryBtn.textContent = '连接中...';

                    var isConnected = await checkPrintClientConnection();
                    if (isConnected) {
                        // 连接成功，关闭连接对话框并继续处理文件
                        connectionModal.remove();
                        await handleFilesAfterConnection(files);
                    } else {
                        // 连接失败，继续显示对话框
                        global.showMessage('连接失败，请确保打印客户端已启动并使用正确的账号密码登录', 'error');
                        retryBtn.disabled = false;
                        retryBtn.textContent = '重新连接';
                    }
                };
            }

            // 取消按钮事件
            var cancelBtn = modalContent.querySelector('#cancelConnectionBtn');
            if (cancelBtn) {
                cancelBtn.onclick = function() {
                    connectionModal.remove();
                };
            }

            // 点击外部关闭
            connectionModal.addEventListener('click', function(e) {
                if (e.target === connectionModal) {
                    connectionModal.remove();
                }
            });
        }

        // 连接成功后处理文件
        async function handleFilesAfterConnection(files) {
            try {
                global.showMessage('正在处理上传的文件...');

                // 上传文件到服务器
                var formData = new FormData();
                files.forEach(function(file) {
                    formData.append('files[]', file);
                });

                // 发送文件到打印服务器
                var response = await fetch('api/upload.php', {
                    method: 'POST',
                    body: formData
                });

                var result = await response.json();
                if (result.success) {
                    // 调用打印函数发送文件URL到打印服务器
                    for (var i = 0; i < result.urls.length; i++) {
                        await sendFileToPrint(result.urls[i], files[i].name);
                    }
                    global.showMessage('文件打印任务已发送');
                } else {
                    global.showMessage('文件上传失败: ' + (result.message || '未知错误'), 'error');
                }
            } catch (error) {
                console.error('文件打印失败:', error);
                global.showMessage('文件打印失败: ' + error.message, 'error');
            }
        }

        // 发送文件到打印服务器
        async function sendFileToPrint(fileUrl, fileName) {
            var username = g('currentUser').username;
            var userPassword = g('currentUser').password;

            return new Promise(function(resolve, reject) {
                var wsUrl = 'wss://print.yhsun.cn';
                var ws = new WebSocket(wsUrl);
                var timeout = setTimeout(function() {
                    reject(new Error('连接超时'));
                }, 5000);

                ws.onopen = function() {
                    clearTimeout(timeout);

                    // 确保fileUrl是完整的URL
                    var fullFileUrl = fileUrl;
                    if (!fileUrl.startsWith('http://') && !fileUrl.startsWith('https://')) {
                        // 构建完整的URL
                        var baseUrl = window.location.origin;
                        if (!fileUrl.startsWith('/')) {
                            baseUrl += '/' + window.location.pathname.split('/').slice(0, -1).join('/') + '/';
                        }
                        fullFileUrl = baseUrl + fileUrl;
                    }

                    var printData = {
                        type: 'print_request',
                        username: username,
                        password: userPassword,
                        content: fullFileUrl,
                        content_type: 'file',
                        file_name: fileName,
                        settings: {
                            print_file: true
                        },
                        timestamp: new Date().toISOString()
                    };

                    ws.send(JSON.stringify(printData));
                };

                ws.onmessage = function(event) {
                    try {
                        var response = JSON.parse(event.data);
                        if (response.type === 'print_queued') {
                            resolve();
                        } else if (response.type === 'error') {
                            reject(new Error(response.message || '打印失败'));
                        }
                    } catch (e) {
                        reject(e);
                    } finally {
                        ws.close();
                    }
                };

                ws.onerror = function(error) {
                    clearTimeout(timeout);
                    reject(error);
                    ws.close();
                };

                ws.onclose = function() {
                    clearTimeout(timeout);
                };
            });
        }

        // 打印模态框点击外部关闭时也需要清除定时器
        printModal.addEventListener('click', function(e) {
            if (e.target === printModal) {
                cleanup();
                printModal.remove();
            }
        });

        // 对齐按钮切换
        var alignButtons = modalContent.querySelectorAll('.align-btn');
        alignButtons.forEach(function(btn) {
            btn.onclick = function() {
                alignButtons.forEach(function(b) {
                    b.classList.remove('active');
                    b.style.backgroundColor = nightMode ? '#424242' : '#E0E0E0';
                    b.style.color = textColor;
                });
                this.classList.add('active');
                this.style.backgroundColor = '#2196F3';
                this.style.color = 'white';
            };
        });

        // 标题对齐按钮切换
        var titleAlignButtons = modalContent.querySelectorAll('.title-align-btn');
        titleAlignButtons.forEach(function(btn) {
            btn.onclick = function() {
                titleAlignButtons.forEach(function(b) {
                    b.classList.remove('active');
                    b.style.backgroundColor = nightMode ? '#424242' : '#E0E0E0';
                    b.style.color = textColor;
                });
                this.classList.add('active');
                this.style.backgroundColor = '#2196F3';
                this.style.color = 'white';
            };
        });

        // AI智能排版按钮点击事件
        var aiLayoutBtn = modalContent.querySelector('#aiLayoutBtn');
        if (aiLayoutBtn) {
            aiLayoutBtn.onclick = function() {
                showAILayoutDialog(modalContent, cleanup, printModal);
            };
        }

    }

    function getPrintSettings(modalContent) {
        return {
            titleFontSize: modalContent.querySelector('#titleFontSize').value,
            bodyFontSize: modalContent.querySelector('#bodyFontSize').value,
            pageMargin: modalContent.querySelector('#pageMargin').value,
            lineHeight: modalContent.querySelector('#lineHeight').value,
            paragraphSpacing: modalContent.querySelector('#paragraphSpacing').value,
            titleSpacing: modalContent.querySelector('#titleSpacing').value,
            // 使用 active 类选择器
            alignment: (modalContent.querySelector('.align-btn.active')?.getAttribute('data-align')) || 'left',
            titleAlignment: (modalContent.querySelector('.title-align-btn.active')?.getAttribute('data-align')) || 'center',
            fitToPage: modalContent.querySelector('#fitToPage').checked,
            indentParagraph: modalContent.querySelector('#indentParagraph').checked
        };
    }

    // ==================== 修改后的 formatForPrint 函数 ====================
    function formatForPrint(markdown, settings) {
        var lines = markdown.split('\n');
        var html = '';
        var inCodeBlock = false;
        var inFormulaBlock = false;
        var formulaBuffer = [];
        var inTable = false;
        var tableHeaders = [];
        var tableRows = [];
        var alignment = settings.alignment || 'left';
        var titleAlignment = settings.titleAlignment || 'center';

        // 从 settings 中获取并计算打印尺寸
        var scale = settings.fitToPage ? 0.85 : 1.0;
        var bodyFontSize = parseInt(settings.bodyFontSize) * scale;
        var titleFontSize = parseInt(settings.titleFontSize) * scale;
        var lineHeight = parseFloat(settings.lineHeight || '1.2');
        var paragraphSpacing = parseFloat(settings.paragraphSpacing || '0.5');
        var titleSpacing = parseFloat(settings.titleSpacing || '0.8');
        var codeBlockLang = '';   // 声明变量用于保存代码块语言

        function convertMarkdownElements(text) {
            text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
            text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');
            text = text.replace(/~~(.*?)~~/g, '<del>$1</del>');
            return text;
        }

        for (var i = 0; i < lines.length; i++) {
            var line = lines[i];

            // 处理代码块
            if (line.trim().startsWith('```')) {
                if (!inCodeBlock) {
                    inCodeBlock = true;
                    var langMatch = line.match(/^```(\w+)/);
                    codeBlockLang = langMatch ? langMatch[1] : '';
                    if (codeBlockLang === 'mermaid') {
                        html += '<div class="mermaid" data-mermaid="" style="margin:1em 0;text-align:center;">';
                    } else {
                        html += '<pre class="code-block"><code class="language-' + codeBlockLang + '">';
                    }
                } else {
                    inCodeBlock = false;
                    if (codeBlockLang === 'mermaid') {
                        html += '</div>';
                    } else {
                        html += '</code></pre>';
                    }
                }
                continue;
            }

            // 处理公式块 $$...$$
            if (line.trim() === '$$') {
                if (!inFormulaBlock) {
                    inFormulaBlock = true;
                    formulaBuffer = [];
                    continue;
                } else {
                    inFormulaBlock = false;
                    var formula = formulaBuffer.join('\n');
                    html += '<div style="text-align:center;margin:1em 0;">\\[' + formula + '\\]</div>';
                    continue;
                }
            }

            if (inFormulaBlock) {
                formulaBuffer.push(line);
                continue;
            }

            if (inCodeBlock) {
                html += escapeHtml(line) + '\n';
                continue;
            }

            if (line.trim() === '') {
                if (inTable) {
                    html += generateTableHtml(tableHeaders, tableRows, alignment);
                    inTable = false;
                    tableHeaders = [];
                    tableRows = [];
                }
                continue;
            }

            // 表格处理
            if (line.trim().startsWith('|')) {
                if (!inTable) {
                    inTable = true;
                }
                var cells = line.split('|').map(cell => cell.trim()).filter(cell => cell !== '');
                if (i + 1 < lines.length && lines[i + 1].trim().startsWith('|') && lines[i + 1].trim().includes('-')) {
                    tableHeaders = cells;
                } else if (lines[i - 1] && lines[i - 1].trim().startsWith('|') && lines[i - 1].trim().includes('-')) {
                    tableRows.push(cells);
                }
                continue;
            }

            if (inTable) {
                html += generateTableHtml(tableHeaders, tableRows, alignment);
                inTable = false;
                tableHeaders = [];
                tableRows = [];
            }

            var processed = false;

            // 图片处理
            var imgMatch = line.match(/!\[(.*?)\]\((.*?)\)/);
            if (imgMatch) {
                var altText = imgMatch[1];
                var imgUrl = imgMatch[2];
                if (!imgUrl.startsWith('http://') && !imgUrl.startsWith('https://')) {
                    imgUrl = 'https://md.yhsun.cn' + (imgUrl.startsWith('/') ? '' : '/') + imgUrl;
                }
                html += '<div style="text-align:center;margin:1em 0;"><img src="' + imgUrl + '" alt="' + altText + '" style="max-width:100%;height:auto;"></div>';
                processed = true;
            }

            // 文件链接处理
            var linkMatch = line.match(/\[(.*?)\]\((.*?)\)/);
            if (!processed && linkMatch) {
                var linkText = linkMatch[1];
                var linkUrl = linkMatch[2];
                if (!linkUrl.startsWith('http://') && !linkUrl.startsWith('https://')) {
                    linkUrl = 'https://md.yhsun.cn' + (linkUrl.startsWith('/') ? '' : '/') + linkUrl;
                }
                html += '<div style="text-align:' + alignment + ';margin:0.5em 0;"><a href="' + linkUrl + '" target="_blank" style="color:#0066cc;text-decoration:underline;">' + linkText + '</a></div>';
                processed = true;
            }

            // 公式处理 (行内公式，块级已由公式块处理)
            var mathMatch = line.match(/\\\((.*?)\\\)|\\\[(.*?)\\\]/);
            if (mathMatch) {
                var formula = mathMatch[1] || mathMatch[2];
                var displayMode = mathMatch[2] !== undefined;
                if (displayMode) {
                    html += '<div style="text-align:center;margin:1em 0;">\\[' + formula + '\\]</div>';
                } else {
                    html += '<div style="text-align:center;margin:1em 0;">\\(' + formula + '\\)</div>';
                }
                processed = true;
            }

            // 标题
            var hMatch = line.match(/^(#{1,6})\s+(.*)$/);
            if (!processed && hMatch) {
                var level = hMatch[1].length;
                var titleText = hMatch[2];
                titleText = convertMarkdownElements(titleText);
                html += '<h' + level + ' style="text-align:' + titleAlignment + ';font-size:' + titleFontSize + 'pt;margin-top:' + titleSpacing + 'em;margin-bottom:' + titleSpacing + 'em;line-height:' + lineHeight + ';">' + titleText + '</h' + level + '>';
                processed = true;
            }

            // 无序列表
            if (!processed && line.match(/^[\*\-\+]\s+(.*)$/)) {
                var listItem = line.replace(/^([\*\-\+])\s+/, '');
                listItem = convertMarkdownElements(listItem);
                html += '<div style="text-align:' + alignment + ';margin-left:20px;"><span style="display:inline-block;margin-right:8px;">•</span><span>' + listItem + '</span></div>';
                processed = true;
            }

            // 有序列表
            if (!processed && line.match(/^(\d+)\.\s+(.*)$/)) {
                var match = line.match(/^(\d+)\.\s+(.*)$/);
                var orderNumber = match[1];
                var listItem = match[2];
                listItem = convertMarkdownElements(listItem);
                html += '<div style="text-align:' + alignment + ';margin-left:20px;"><span style="display:inline-block;margin-right:8px;width:20px;">' + orderNumber + '.</span><span>' + listItem + '</span></div>';
                processed = true;
            }

            // 分割线
            if (!processed && line.match(/^-{3,}$/)) {
                html += '<hr style="margin:1em 0;border:0;border-top:1px solid #ccc;">';
                processed = true;
            }

            // 引用
            if (!processed && line.match(/^>\s+(.*)$/)) {
                var quoteText = line.replace(/^>\s+/, '');
                quoteText = convertMarkdownElements(quoteText);
                html += '<blockquote style="margin:1em 0;padding:0.5em 1em;border-left:3px solid #ccc;background:#f9f9f9;">' + quoteText + '</blockquote>';
                processed = true;
            }

            // 段落
            if (!processed) {
                var alignStyle = 'text-align:' + alignment + ';';
                var indentStyle = settings.indentParagraph ? 'text-indent:2em;' : '';
                var lineHeightStyle = 'line-height:' + lineHeight + ';';
                var marginStyle = 'margin:0 0 ' + paragraphSpacing + 'em 0;';
                var paddingStyle = 'padding:0;';
                var processedLine = convertMarkdownElements(line);
                html += '<p style="font-size:' + bodyFontSize + 'pt;' + marginStyle + paddingStyle + indentStyle + alignStyle + lineHeightStyle + '">' + processedLine + '</p>';
                processed = true;
            }
        }

        // 处理结尾可能未关闭的表格
        if (inTable) {
            html += generateTableHtml(tableHeaders, tableRows, alignment);
        }

        // 处理未关闭的公式块
        if (inFormulaBlock) {
            var formula = formulaBuffer.join('\n');
            html += '<div style="text-align:center;margin:1em 0;">\\[' + formula + '\\]</div>';
        }

        return html;
    }
    // ==================== 修改后的 formatForPrint 结束 ====================

    function generateTableHtml(headers, rows, alignment) {
        if (!headers || headers.length === 0) return '';

        var html = '<div style="margin:1em 0;overflow-x:auto;"><table style="width:100%;border-collapse:collapse;text-align:' + alignment + ';">';

        // 表头
        html += '<thead><tr>';
        headers.forEach(header => {
            html += '<th style="border:1px solid #ddd;padding:8px;background:#f8f9fa;">' + header + '</th>';
        });
        html += '</tr></thead>';

        // 表体
        if (rows && rows.length > 0) {
            html += '<tbody>';
            rows.forEach(row => {
                html += '<tr>';
                row.forEach(cell => {
                    html += '<td style="border:1px solid #ddd;padding:8px;">' + cell + '</td>';
                });
                html += '</tr>';
            });
            html += '</tbody>';
        }

        html += '</table></div>';
        return html;
    }

    function escapeHtml(text) {
        var map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, function(m) { return map[m]; });
    }

    function getPrintStyles(settings) {
        var margin = settings.pageMargin + 'mm';
        var scale = settings.fitToPage ? 0.85 : 1.0;
        var bodyFontSize = parseInt(settings.bodyFontSize) * scale;
        var titleFontSize = parseInt(settings.titleFontSize) * scale;
        var lineHeight = parseFloat(settings.lineHeight || '1.2');
        var paragraphSpacing = parseFloat(settings.paragraphSpacing || '0.5');
        var titleSpacing = parseFloat(settings.titleSpacing || '0.8');
        var titleAlignment = settings.titleAlignment || 'center';
        var listMargin = settings.fitToPage ? '6px' : '8px';

        return `
            @page { size: A4; margin: ${margin}; }
            body { 
                font-family: "SimSun", "宋体", serif;
                font-size: ${bodyFontSize}pt;
                line-height: ${lineHeight};
                color: #333;
                padding: 0 10px;
            }
            h1, h2, h3, h4, h5, h6 { 
                text-align: ${titleAlignment};
                font-weight: bold;
                margin-top: ${titleSpacing}em;
                margin-bottom: ${titleSpacing}em;
                line-height: ${lineHeight};
            }
            h1 { font-size: ${titleFontSize * 1.5}pt; }
            h2 { font-size: ${titleFontSize * 1.3}pt; }
            h3 { font-size: ${titleFontSize * 1.1}pt; }
            h4 { font-size: ${titleFontSize}pt; }
            h5 { font-size: ${titleFontSize * 0.9}pt; }
            h6 { font-size: ${titleFontSize * 0.8}pt; }
            p { 
                font-size: ${bodyFontSize}pt;
                margin: 0 0 ${paragraphSpacing}em 0;
                padding: 0;
                text-align: ${settings.alignment || 'left'};
            }
            .code-block {
                background: #f8f9fa;
                border: 1px solid #ddd;
                border-radius: 4px;
                padding: ${settings.fitToPage ? '10px' : '15px'};
                font-family: monospace;
                font-size: ${bodyFontSize * 0.9}pt;
                overflow-x: auto;
                margin: ${titleSpacing}em 0;
                text-align: left;
            }
            li {
                margin-bottom: ${listMargin};
                text-align: ${settings.alignment || 'center'};
            }
            table {
                width: 100%;
                border-collapse: collapse;
                margin: 1em 0;
            }
            th, td {
                border: 1px solid #ddd;
                padding: 8px;
                text-align: ${settings.alignment || 'left'};
            }
            th {
                background-color: #f8f9fa;
                font-weight: bold;
            }
            img {
                max-width: 100%;
                height: auto;
                margin: 1em 0;
            }
            .mermaid-chart {
                margin: 1em 0;
                text-align: center;
            }
            .katex {
                margin: 1em 0;
            }
            @media print {
                body { -webkit-print-color-adjust: exact; }
                ${settings.fitToPage ? '@page { size: auto; margin: 5mm; }' : ''}
            }
        `;
    }

    async function downloadAsPDF(content, settings) {
        var htmlContent = await preparePrintContent(content, settings);
        var printWindow = window.open('', '_blank');

        // 使用更简单的方式，直接使用打印对话框让用户保存为PDF
        printWindow.document.open();
        printWindow.document.write('<!DOCTYPE html>');
        printWindow.document.write('<html>');
        printWindow.document.write('<head>');
        printWindow.document.write('<title></title>');
        printWindow.document.write('<style>');
        printWindow.document.write('@page { size: A4; margin: 15mm; }');
        printWindow.document.write('body { font-family: "SimSun", "宋体", serif; font-size: 12pt; line-height: 1.2; color: #333; padding: 0 10px; }');
        printWindow.document.write('h1, h2, h3, h4, h5, h6 { text-align: center; font-weight: bold; margin-top: 0.8em; margin-bottom: 0.8em; line-height: 1.2; }');
        printWindow.document.write('h1 { font-size: 18pt; }');
        printWindow.document.write('h2 { font-size: 16pt; }');
        printWindow.document.write('h3 { font-size: 14pt; }');
        printWindow.document.write('h4 { font-size: 12pt; }');
        printWindow.document.write('p { font-size: 12pt; margin: 0 0 0.5em 0; padding: 0; text-align: left; }');
        printWindow.document.write('.code-block { background: #f8f9fa; border: 1px solid #ddd; border-radius: 4px; padding: 15px; font-family: monospace; font-size: 10pt; overflow-x: auto; margin: 0.8em 0; text-align: left; }');
        printWindow.document.write('li { margin-bottom: 8px; text-align: left; }');
        printWindow.document.write('img { max-width: 100%; height: auto; margin: 1em 0; }');
        printWindow.document.write('@media print { body { -webkit-print-color-adjust: exact; } }');
        printWindow.document.write('</style>');
        printWindow.document.write('</head>');
        printWindow.document.write('<body>');
        printWindow.document.write('<div id="pdf-content">');
        printWindow.document.write(htmlContent);
        printWindow.document.write('</div>');
        printWindow.document.write('<script>');
        printWindow.document.write('window.onload = function() {');
        printWindow.document.write('  setTimeout(function() {');
        printWindow.document.write('    alert("请在打印对话框中选择\'保存为PDF\'选项");');
        printWindow.document.write('    window.print();');
        printWindow.document.write('  }, 100);');
        printWindow.document.write('};');
        printWindow.document.write('</script>');
        printWindow.document.write('</body>');
        printWindow.document.write('</html>');
        printWindow.document.close();
        printWindow.focus();
    }

    async function showPrintPreview(settings) {
        var nightMode = g('nightMode') === true;
        var content = g('vditor') ? g('vditor').getValue() : '';

        // 显示加载状态
        var loadingModal = document.createElement('div');
        loadingModal.className = 'modal-overlay';
        loadingModal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.9);z-index:10001;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;';

        var loadingContent = document.createElement('div');
        loadingContent.style.cssText = 'background:' + (nightMode ? '#2d2d2d' : 'white') + ';color:' + (nightMode ? '#eee' : '#333') + ';border-radius:12px;padding:30px;text-align:center;';
        loadingContent.innerHTML = '<div style="font-size:24px;margin-bottom:15px;"><i class="fas fa-spinner fa-spin"></i></div><div style="font-size:16px;">加载中...</div>';

        loadingModal.appendChild(loadingContent);
        document.body.appendChild(loadingModal);

        try {
            var htmlContent = await preparePrintContent(content, settings);

            // 移除加载状态
            loadingModal.remove();

            var previewModal = document.createElement('div');
            previewModal.className = 'modal-overlay';
            previewModal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.9);z-index:10001;display:flex;flex-direction:column;align-items:stretch;justify-content:stretch;padding:0;';

            var previewContent = document.createElement('div');
            previewContent.style.cssText = 'background:' + (nightMode ? '#1a1a1a' : '#f0f0f0') + ';border-radius:0;display:flex;flex-direction:column;flex:1;box-shadow:none;border:none;min-height:0;';
            // Preview close button
            var closeBtn = document.createElement('button');
            closeBtn.innerHTML = '<i class="fas fa-times"></i>';
            closeBtn.style.cssText = 'position:absolute;top:10px;right:10px;background:' + (nightMode ? '#333' : '#fff') + ';border:1px solid ' + (nightMode ? '#555' : '#ddd') + ';color:#666;font-size:16px;cursor:pointer;padding:8px;border-radius:4px;z-index:10;';

            // Document container - takes up most of the space
            var docContainer = document.createElement('div');
            docContainer.style.cssText = 'flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;overflow:auto;padding:20px;min-height:0;';

            // 缩放相关变量 - 只缩放整个视图，不缩放内容本身
            var currentScale = 1.0;
            var initialDistance = 0;
            var a4Width = 595;
            var a4Height = 842;
            var a4Margin = settings.pageMargin;

            // 多页内容容器 - 保持真实尺寸
            var pagesWrapper = document.createElement('div');
            pagesWrapper.style.cssText = 'display:flex;flex-direction:column;gap:20px;align-items:center;transform-origin:top center;';

            // 创建一页A4纸的函数
            function createPage() {
                var page = document.createElement('div');
                page.className = 'a4-page';
                page.style.cssText = 'width:' + a4Width + 'px;min-height:' + a4Height + 'px;background:white;box-shadow:0 2px 10px rgba(0,0,0,0.1);position:relative;border:1px solid #ccc;overflow:visible;';

                var contentDiv = document.createElement('div');
                contentDiv.style.cssText = 'width:100%;padding:' + a4Margin + 'mm;box-sizing:border-box;position:relative;';

                var printStyles = getPrintStyles(settings);
                var styleElement = document.createElement('style');
                styleElement.textContent = printStyles;
                contentDiv.appendChild(styleElement);

                page.appendChild(contentDiv);
                return { page: page, contentDiv: contentDiv };
            }

            // 创建第一页并放入所有内容 - 确保至少显示一个完整A4页面
            var { page: firstPage, contentDiv: firstContentDiv } = createPage();
            firstContentDiv.innerHTML += htmlContent;
            pagesWrapper.appendChild(firstPage);

            docContainer.appendChild(pagesWrapper);

            // 添加页面分割线指示
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

            // 自动适配屏幕大小 - 只缩放整个视图，保持内容真实尺寸
            function fitToScreen() {
                var containerWidth = docContainer.clientWidth - 40;
                var scale = Math.min(containerWidth / a4Width, 1.0);
                currentScale = scale;
                pagesWrapper.style.transform = 'scale(' + scale + ')';
            }

            // 触摸事件 - 只缩放整个视图
            pagesWrapper.addEventListener('touchstart', function(e) {
                if (e.touches.length === 2) {
                    e.preventDefault();
                    var touch1 = e.touches[0];
                    var touch2 = e.touches[1];
                    initialDistance = Math.hypot(
                        touch2.pageX - touch1.pageX,
                        touch2.pageY - touch1.pageY
                    );
                }
            });

            pagesWrapper.addEventListener('touchmove', function(e) {
                if (e.touches.length === 2 && initialDistance > 0) {
                    e.preventDefault();
                    var touch1 = e.touches[0];
                    var touch2 = e.touches[1];
                    var currentDistance = Math.hypot(
                        touch2.pageX - touch1.pageX,
                        touch2.pageY - touch1.pageY
                    );
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
                        if (match) {
                            currentScale = parseFloat(match[1]);
                        }
                    }
                    initialDistance = 0;
                }
            });

            // Bottom button container
            var buttonContainer = document.createElement('div');
            buttonContainer.style.cssText = 'display:flex;gap:8px;padding:12px;background:' + (nightMode ? '#2d2d2d' : '#f8f9fa') + ';border-top:1px solid ' + (nightMode ? '#444' : '#eee') + ';justify-content:flex-end;';

            var printBtn = document.createElement('button');
            printBtn.innerHTML = '<i class="fas fa-print"></i> 打印';
            printBtn.style.cssText = 'padding:8px 16px;background:#4a90e2;color:white;border:none;border-radius:4px;cursor:pointer;font-size:14px;font-weight:bold;';
            printBtn.onclick = function() {
                sendToPrint(settings);
            };

            var pdfBtn = document.createElement('button');
            pdfBtn.innerHTML = '<i class="fas fa-file-pdf"></i> 下载';
            pdfBtn.style.cssText = 'padding:8px 16px;background:#dc3545;color:white;border:none;border-radius:4px;cursor:pointer;font-size:14px;font-weight:bold;';
            pdfBtn.onclick = async function() {
                await downloadAsPDF(content, settings);
            };

            var cancelBtn = document.createElement('button');
            cancelBtn.innerHTML = '<i class="fas fa-times"></i> 关闭';
            cancelBtn.style.cssText = 'padding:8px 16px;background:' + (nightMode ? '#555' : '#6c757d') + ';color:white;border:none;border-radius:4px;cursor:pointer;font-size:14px;';

            buttonContainer.appendChild(printBtn);
            buttonContainer.appendChild(pdfBtn);
            buttonContainer.appendChild(cancelBtn);

            // Assemble the preview
            previewModal.appendChild(closeBtn);
            previewContent.appendChild(docContainer);
            previewContent.appendChild(buttonContainer);

            previewModal.appendChild(previewContent);
            document.body.appendChild(previewModal);

            // 等待DOM渲染完成后执行适配和添加分割线
            setTimeout(function() {
                addPageDividers();
                fitToScreen();
            }, 100);
            window.addEventListener('resize', fitToScreen);

            // Event listeners
            previewModal.addEventListener('click', function(e) {
                if (e.target === previewModal) {
                    cleanup();
                    previewModal.remove();
                }
            });

            var handleKeydown = function(e) {
                if (e.key === 'Escape') {
                    cleanup();
                    previewModal.remove();
                    document.removeEventListener('keydown', handleKeydown);
                }
            };

            document.addEventListener('keydown', handleKeydown);

            function cleanup() {
                window.removeEventListener('resize', fitToScreen);
            }

            closeBtn.onclick = function() {
                cleanup();
                previewModal.remove();
            };

            cancelBtn.onclick = function() {
                cleanup();
                previewModal.remove();
            };
        } catch (error) {
            console.error('预览错误:', error);
            // 移除加载状态
            loadingModal.remove();
            alert('预览失败: ' + error.message);
        }
    }

    function sendToPrint(settings) {
        // 检查用户是否登录
        if (!g('currentUser')) {
            global.showMessage('请先登录后再使用云打印功能');
            if (g('showLoginModal')) {
                g('showLoginModal')();
            }
            return;
        }

        var nightMode = g('nightMode') === true;
        var content = g('vditor') ? g('vditor').getValue() : '';
        var username = g('currentUser').username;
        var userPassword = g('currentUser').password;

        var modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:10002;display:flex;align-items:center;justify-content:center;';

        var dialog = document.createElement('div');
        dialog.style.cssText = 'background:' + (nightMode ? '#2d2d2d' : 'white') + ';color:' + (nightMode ? '#eee' : '#333') + ';border-radius:12px;padding:25px;width:90%;max-width:500px;';

        var title = document.createElement('h3');
        title.textContent = '发送到云打印客户端';
        title.style.cssText = 'margin-top:0;margin-bottom:20px;text-align:center;';

        var statusDiv = document.createElement('div');
        statusDiv.id = 'printStatus';
        statusDiv.style.cssText = 'text-align:center;margin:20px 0;padding:15px;background:' + (nightMode ? '#3d3d3d' : '#f8f9fa') + ';border-radius:8px;';

        var statusText = document.createElement('div');
        statusText.id = 'printStatusText';
        statusText.textContent = '正在连接到打印服务器...';
        statusText.style.cssText = 'font-size:16px;margin-bottom:10px;';

        var statusDetail = document.createElement('div');
        statusDetail.id = 'printStatusDetail';
        statusDetail.textContent = '尝试连接到 wss://print.yhsun.cn';
        statusDetail.style.cssText = 'font-size:13px;color:' + (nightMode ? '#aaa' : '#666') + ';';

        statusDiv.appendChild(statusText);
        statusDiv.appendChild(statusDetail);

        var buttonContainer = document.createElement('div');
        buttonContainer.style.cssText = 'display:flex;gap:10px;margin-top:20px;';

        var cancelBtn = document.createElement('button');
        cancelBtn.textContent = '取消';
        cancelBtn.style.cssText = 'flex:1;padding:12px;background:' + (nightMode ? '#555' : '#6c757d') + ';color:white;border:none;border-radius:6px;cursor:pointer;';
        cancelBtn.onclick = function() {
            modal.remove();
        };

        buttonContainer.appendChild(cancelBtn);

        dialog.appendChild(title);
        dialog.appendChild(statusDiv);
        dialog.appendChild(buttonContainer);
        modal.appendChild(dialog);
        document.body.appendChild(modal);

        var ws = null;
        var timeout = null;

        function updateStatus(text, detail, isError) {
            statusText.textContent = text;
            statusDetail.textContent = detail;
            if (isError) {
                statusText.style.color = '#dc3545';
                statusDetail.style.color = '#dc3545';
            } else {
                statusText.style.color = nightMode ? '#eee' : '#333';
                statusDetail.style.color = nightMode ? '#aaa' : '#666';
            }
        }

        function cleanup() {
            if (ws && ws.readyState === WebSocket.OPEN) ws.close();
            if (timeout) clearTimeout(timeout);
        }

        try {
            // 生产环境使用wss://print.yhsun.cn
            var wsUrl = 'wss://print.yhsun.cn';
            ws = new WebSocket(wsUrl);

            timeout = setTimeout(function() {
                updateStatus('连接超时', '无法连接到打印服务器，请检查网络连接', true);
                cleanup();
            }, 5000);

            ws.onopen = async function() {
                clearTimeout(timeout);
                updateStatus('连接成功', '正在准备打印内容...');

                // 准备格式化的HTML内容
                var htmlContent = await preparePrintContent(content, settings);

                // 为打印客户端添加完整的HTML结构
                var scale = settings.fitToPage ? 0.85 : 1.0;
                var bodyFontSize = parseInt(settings.bodyFontSize) * scale;
                var titleFontSize = parseInt(settings.titleFontSize) * scale;
                var lineHeight = parseFloat(settings.lineHeight || '1.2');
                var paragraphSpacing = parseFloat(settings.paragraphSpacing || '0.5');
                var titleSpacing = parseFloat(settings.titleSpacing || '0.8');
                var alignment = settings.alignment || 'left';
                var titleAlignment = settings.titleAlignment || 'center';

                var fullHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>打印文档</title>
    <style>
        body {
            font-family: "SimSun", "宋体", serif;
            font-size: ${bodyFontSize}pt;
            line-height: ${lineHeight};
            color: #333;
            padding: ${settings.pageMargin}mm;
        }
        h1, h2, h3, h4, h5, h6 {
            text-align: ${titleAlignment};
            font-weight: bold;
            margin-top: ${titleSpacing};
            margin-bottom: ${titleSpacing};
            line-height: ${lineHeight};
        }
        h1 { font-size: ${titleFontSize * 1.5}; }
        h2 { font-size: ${titleFontSize * 1.3}; }
        h3 { font-size: ${titleFontSize * 1.1}pt; }
        h4 { font-size: ${titleFontSize}pt; }
        h5 { font-size: ${titleFontSize * 0.9}pt; }
        h6 { font-size: ${titleFontSize * 0.8}pt; }
        p {
            font-size: ${bodyFontSize}pt;
            margin: 0 0 ${paragraphSpacing}em 0;
            padding: 0;
            text-align: ${alignment};
        }
        .code-block {
            background: #f8f9fa;
            border: 1px solid #ddd;
            border-radius: 4px;
            padding: ${settings.fitToPage ? '10px' : '15px'};
            font-family: monospace;
            font-size: ${bodyFontSize * 0.9}pt;
            overflow-x: auto;
            margin: ${titleSpacing}em 0;
            text-align: left;
        }
        img {
            max-width: 100%;
            height: auto;
            margin: 1em 0;
        }
    </style>
</head>
<body>
    ${htmlContent}
</body>
</html>`;

                updateStatus('连接成功', '正在发送打印任务...');

                var printData = {
                    type: 'print_request',
                    username: username,
                    password: userPassword,
                    content: fullHtml,
                    settings: settings,
                    timestamp: new Date().toISOString(),
                    content_type: 'html' // 标记内容类型为HTML
                };

                ws.send(JSON.stringify(printData));
            };

            ws.onmessage = function(event) {
                try {
                    var response = JSON.parse(event.data);
                    if (response.type === 'client_status') {
                        // 客户端状态更新
                        if (response.connected) {
                            updateStatus('客户端已连接', '正在准备打印任务...');
                        } else {
                            updateStatus('客户端未连接', '请确保打印客户端已启动并使用您的账号密码登录', true);
                        }
                    } else if (response.type === 'print_queued') {
                        updateStatus('打印任务已发送', '打印任务已添加到打印队列', false);
                        cleanup();
                    } else if (response.type === 'error') {
                        updateStatus('打印失败: ' + response.message, response.details || '', true);
                        cleanup();
                    }
                } catch (e) {
                    updateStatus('响应解析错误', e.toString(), true);
                    cleanup();
                }
            };

            ws.onerror = function(error) {
                clearTimeout(timeout);
                updateStatus('连接错误', '无法连接到打印服务器，请检查网络连接', true);
                console.error('WebSocket错误:', error);
            };

            ws.onclose = function(event) {
                clearTimeout(timeout);
                if (!event.wasClean) {
                    updateStatus('连接意外关闭', '代码: ' + event.code + ', 原因: ' + event.reason, true);
                }
            };

            cancelBtn.onclick = function() {
                cleanup();
                modal.remove();
            };

            modal.addEventListener('click', function(e) {
                if (e.target === modal) {
                    cleanup();
                    modal.remove();
                }
            });

        } catch (error) {
            updateStatus('连接失败', error.toString(), true);
            cleanup();
        }
    }

    // ==================== 修改后的 convertFormulasAndChartsToImages 函数 ====================
    async function convertFormulasAndChartsToImages(html) {
        if (!html) {
            return html;
        }
        var container = document.createElement('div');
        container.innerHTML = html;

        // 处理原始的Markdown公式格式
        var allElements = container.querySelectorAll('div, p, span');

        // 收集所有需要处理的元素
        var elementsToProcess = [];

        // 遍历所有元素，查找包含公式的元素
        for (var i = 0; i < allElements.length; i++) {
            var el = allElements[i];
            var textContent = el.textContent;
            var innerHTML = el.innerHTML;

            // 查找行内公式
            var inlineMatch = textContent.match(/\\\(([\s\S]*?)\\\)/);
            if (inlineMatch) {
                elementsToProcess.push({
                    element: el,
                    type: 'inline-formula',
                    content: inlineMatch[1]
                });
                continue;
            }

            // 查找行内公式 $...$ - 使用 [\s\S] 替代点号
            var dollarInlineMatch = textContent.match(/\$([\s\S]*?)\$/);
            if (dollarInlineMatch) {
                elementsToProcess.push({
                    element: el,
                    type: 'inline-formula',
                    content: dollarInlineMatch[1]
                });
                continue;
            }

            // 查找块级公式 \[...\] - 使用 [\s\S] 替代点号
            var blockMatch = textContent.match(/\\\[([\s\S]*?)\\\]/);
            if (blockMatch) {
                elementsToProcess.push({
                    element: el,
                    type: 'block-formula',
                    content: blockMatch[1]
                });
                continue;
            }

            // 查找块级公式 $$...$$ - 使用 [\s\S] 替代点号，并移除 s 标志
            var dollarMatch = textContent.match(/\$\$([\s\S]*?)\$\$/);
            if (dollarMatch) {
                elementsToProcess.push({
                    element: el,
                    type: 'block-formula',
                    content: dollarMatch[1]
                });
                continue;
            }
        }

        // 处理公式元素
        for (var i = 0; i < elementsToProcess.length; i++) {
            var item = elementsToProcess[i];
            var el = item.element;
            var latex = item.content;
            var displayMode = item.type === 'block-formula';

            try {
                // Create a temporary div for rendering
                var tempDiv = document.createElement('div');
                tempDiv.style.cssText = 'position:fixed; left:0; top:0; padding:10px; background:white; z-index:-1;';
                tempDiv.style.width = 'auto';
                tempDiv.style.height = 'auto';
                tempDiv.style.display = 'inline-block';

                // Render KaTeX to the div
                if (window.katex) {
                    try {
                        katex.render(latex, tempDiv, {
                            throwOnError: false,
                            displayMode: displayMode,
                            output: 'html'
                        });
                    } catch (katexError) {
                        console.error('KaTeX渲染失败:', katexError);
                        continue;
                    }
                } else {
                    console.error('KaTeX库不可用，无法渲染公式');
                    continue;
                }

                document.body.appendChild(tempDiv);

                // 等待一小段时间确保渲染完成
                await new Promise(resolve => setTimeout(resolve, 200));

                // 获取渲染后公式的实际尺寸
                var formulaRect = tempDiv.getBoundingClientRect();

                // 根据公式实际尺寸调整容器大小
                tempDiv.style.width = (formulaRect.width + 20) + 'px'; // 加上20px的padding
                tempDiv.style.height = (formulaRect.height + 20) + 'px';

                // Convert to image using html-to-image
                if (window.htmlToImage) {
                    try {
                        var dataUrl = await htmlToImage.toPng(tempDiv);
                        document.body.removeChild(tempDiv);
                    } catch (imageError) {
                        console.error('图片转换失败:', imageError);
                        document.body.removeChild(tempDiv);
                        continue;
                    }
                } else {
                    console.error('html-to-image库不可用，无法转换为图片');
                    document.body.removeChild(tempDiv);
                    continue;
                }

                // Upload image to server
                var imgUrl = await uploadImage(dataUrl);

                if (imgUrl) {
                    // Create image container with proper styling
                    var imgContainer = document.createElement('div');
                    imgContainer.style.cssText = 'text-align:center; margin:10px 0;';
                    var img = document.createElement('img');
                    img.src = imgUrl;
                    img.alt = 'Formula';
                    img.style.maxWidth = '100%';
                    img.style.height = 'auto';
                    imgContainer.appendChild(img);

                    // 替换原始元素
                    el.parentNode.replaceChild(imgContainer, el);

                    // 检查并删除相邻的文本节点中的公式标记
                    var prevSibling = imgContainer.previousSibling;
                    var nextSibling = imgContainer.nextSibling;
                    var marker = item.type === 'inline-formula' ? '$' : '$$';

                    // 处理前面的节点
                    if (prevSibling && prevSibling.nodeType === 3) {
                        var prevText = prevSibling.textContent;
                        if (prevText.includes(marker)) {
                            // 删除包含标记的文本节点
                            prevSibling.parentNode.removeChild(prevSibling);
                        }
                    }

                    // 处理后面的节点
                    if (nextSibling && nextSibling.nodeType === 3) {
                        var nextText = nextSibling.textContent;
                        if (nextText.includes(marker)) {
                            // 删除包含标记的文本节点
                            nextSibling.parentNode.removeChild(nextSibling);
                        }
                    }

                    // 对于块级公式，还要检查是否有额外的结束标记节点
                    if (item.type === 'block-formula') {
                        var checkSibling = imgContainer.nextSibling;
                        var foundEnd = false;

                        while (checkSibling && !foundEnd) {
                            if (checkSibling.nodeType === 1) {
                                var checkContent = checkSibling.textContent;
                                if (checkContent.trim() === '$$') {
                                    checkSibling.parentNode.removeChild(checkSibling);
                                    foundEnd = true;
                                }
                            } else if (checkSibling.nodeType === 3) {
                                var checkText = checkSibling.textContent;
                                if (checkText.trim() === '$$') {
                                    checkSibling.parentNode.removeChild(checkSibling);
                                    foundEnd = true;
                                }
                            }
                            checkSibling = checkSibling.nextSibling;
                        }
                    }
                } else {
                    console.error('图片上传失败，URL为空');
                }
            } catch (e) {
                console.error('公式处理错误:', e);
            }
        }

        // Convert Mermaid charts to images and upload
        var mermaidElements = container.querySelectorAll('.mermaid, [data-mermaid]');

        for (var i = 0; i < mermaidElements.length; i++) {
            var el = mermaidElements[i];
            var mermaidCode = el.textContent || el.getAttribute('data-mermaid');
            if (!mermaidCode) continue;

            try {
                // Create a temporary div for rendering
                var tempDiv = document.createElement('div');
                tempDiv.className = 'mermaid';
                tempDiv.textContent = mermaidCode;
                tempDiv.style.cssText = 'position:fixed; left:0; top:0; min-width:400px; min-height:400px; padding:20px; background:white; z-index:-1;';
                tempDiv.style.overflow = 'visible';
                tempDiv.style.width = 'auto';
                tempDiv.style.height = 'auto';

                document.body.appendChild(tempDiv);

                // 尝试使用更直接的方法渲染 Mermaid 图表
                try {
                    // 确保 Mermaid 库已加载
                    if (!window.mermaid) {
                        throw new Error('Mermaid库未加载');
                    }

                    // 清理 Mermaid 代码，移除可能导致问题的前缀
                    var cleanedCode = mermaidCode.trim();
                    // 移除可能的 --- 开头的元数据
                    if (cleanedCode.startsWith('---')) {
                        cleanedCode = cleanedCode.split('---').slice(2).join('---').trim();
                    }

                    // 初始化 Mermaid 配置
                    mermaid.initialize({
                        startOnLoad: false,
                        theme: 'default',
                        securityLevel: 'loose',
                        flowchart: {
                            useMaxWidth: true,
                            htmlLabels: true
                        }
                    });

                    // 创建一个独立的 div 来渲染 Mermaid 图表
                    var mermaidDiv = document.createElement('div');
                    mermaidDiv.className = 'mermaid';
                    mermaidDiv.textContent = cleanedCode;
                    mermaidDiv.style.cssText = 'width:600px; height:400px; padding:20px; background:white;';
                    tempDiv.appendChild(mermaidDiv);

                    // 等待一小段时间确保 DOM 元素创建完成
                    await new Promise(resolve => setTimeout(resolve, 200));

                    // 使用 Mermaid 的 init 方法渲染图表
                    mermaid.init(undefined, mermaidDiv);

                    // 等待更长时间确保渲染完成
                    await new Promise(resolve => setTimeout(resolve, 1000));

                    // 检查是否渲染成功（是否生成了 SVG）
                    var svgElement = mermaidDiv.querySelector('svg');
                    if (svgElement) {
                        // 获取 SVG 元素的实际尺寸
                        var svgRect = svgElement.getBoundingClientRect();

                        // 根据 SVG 元素的实际尺寸调整容器大小
                        var containerWidth = Math.max(400, svgRect.width + 40); // 至少400px，加上40px的padding
                        var containerHeight = Math.max(400, svgRect.height + 40); // 至少400px，加上40px的padding
                        tempDiv.style.width = containerWidth + 'px';
                        tempDiv.style.height = containerHeight + 'px';

                        // 只保留 SVG 元素，移除原始文本
                        tempDiv.innerHTML = '';
                        tempDiv.appendChild(svgElement);
                    } else {
                        console.error('Mermaid渲染失败，未生成SVG元素');
                        throw new Error('Mermaid渲染失败，未生成SVG元素');
                    }
                } catch (mermaidError) {
                    console.error('Mermaid渲染失败:', mermaidError);
                    // 渲染失败时使用占位符
                    var svgCode = `
                        <svg width="600" height="400" xmlns="http://www.w3.org/2000/svg">
                            <rect width="100%" height="100%" fill="white" stroke="#ddd" stroke-width="1"/>
                            <text x="300" y="200" font-family="Arial" font-size="24" text-anchor="middle" fill="#333">Mermaid Chart</text>
                            <text x="300" y="240" font-family="Arial" font-size="16" text-anchor="middle" fill="#666">Chart Rendered</text>
                        </svg>
                    `;
                    tempDiv.innerHTML = svgCode;
                    console.log('使用占位符替代');
                }

                // Wait a bit for rendering to complete
                await new Promise(resolve => setTimeout(resolve, 1000)); // 增加等待时间确保渲染完成

                // Convert to image using html-to-image
                if (window.htmlToImage) {
                    try {
                        var dataUrl = await htmlToImage.toPng(tempDiv);
                        document.body.removeChild(tempDiv);
                    } catch (imageError) {
                        console.error('图表图片转换失败:', imageError);
                        document.body.removeChild(tempDiv);
                        continue;
                    }
                } else {
                    console.error('html-to-image库不可用，无法转换为图片');
                    document.body.removeChild(tempDiv);
                    continue;
                }

                // Upload image to server
                var imgUrl = await uploadImage(dataUrl);

                if (imgUrl && el.parentNode) {
                    // Create image container with proper styling
                    var imgContainer = document.createElement('div');
                    imgContainer.style.cssText = 'text-align:center; margin:20px 0;';
                    var img = document.createElement('img');
                    img.src = imgUrl;
                    img.alt = 'Chart';
                    img.style.maxWidth = '100%';
                    img.style.height = 'auto';
                    imgContainer.appendChild(img);
                    el.parentNode.replaceChild(imgContainer, el);
                } else {
                    console.error('图表图片上传失败，URL为空');
                }
            } catch (e) {
                console.error('Mermaid渲染错误:', e);
            }
        }

        return container.innerHTML;
    }
    // ==================== 修改后的 convertFormulasAndChartsToImages 结束 ====================

    function debounce(func, wait) {
        var timeout;
        return function() {
            var context = this;
            var args = arguments;
            clearTimeout(timeout);
            timeout = setTimeout(function() {
                func.apply(context, args);
            }, wait);
        };
    }

    function uploadImage(dataUrl) {
        return new Promise(function(resolve, reject) {
            // Convert data URL to Blob
            var arr = dataUrl.split(','), mime = arr[0].match(/:(.*?);/)[1],
                bstr = atob(arr[1]), n = bstr.length, u8arr = new Uint8Array(n);
            while(n--) {
                u8arr[n] = bstr.charCodeAt(n);
            }
            var blob = new Blob([u8arr], {type: mime});

            // Create FormData - 使用 'files[]' 字段名以匹配 upload.php 的期望
            var formData = new FormData();
            formData.append('files[]', blob, 'image.png');

            // Upload to server
            fetch('api/upload.php', {
                method: 'POST',
                body: formData
            })
                .then(function(response) {
                    return response.json();
                })
                .then(function(data) {
                    if (data.success && data.urls && data.urls.length > 0) {
                        // 从响应中获取第一个 URL
                        var imgUrl = data.urls[0];

                        // 确保返回的是绝对地址
                        if (imgUrl && !imgUrl.startsWith('http://') && !imgUrl.startsWith('https://')) {
                            // 构建完整的绝对地址
                            var absoluteUrl = 'https://md.yhsun.cn/' + imgUrl.replace(/^\//, '');
                            resolve(absoluteUrl);
                        } else {
                            resolve(imgUrl);
                        }
                    } else {
                        console.error('上传失败，响应格式不正确:', data);
                        resolve(null);
                    }
                })
                .catch(function(error) {
                    console.error('Upload error:', error);
                    resolve(null);
                });
        });
    }

    function convertElementToImage(element) {
        try {
            // Fallback: Create image element with base64 data
            var img = new Image();

            // Create SVG representation of the element
            var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('width', '400');
            svg.setAttribute('height', '200');
            svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

            // Create foreignObject to contain HTML
            var foreignObject = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
            foreignObject.setAttribute('width', '100%');
            foreignObject.setAttribute('height', '100%');
            foreignObject.setAttribute('x', '0');
            foreignObject.setAttribute('y', '0');

            // Clone the element and add to foreignObject
            var clonedElement = element.cloneNode(true);
            foreignObject.appendChild(clonedElement);
            svg.appendChild(foreignObject);

            // Convert SVG to data URL
            var svgData = new XMLSerializer().serializeToString(svg);
            var imgData = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgData);

            img.src = imgData;
            img.style.maxWidth = '100%';
            img.style.height = 'auto';

            return img;
        } catch (e) {
            console.error('Image conversion error:', e);
            // Fallback: Return a simple text representation
            var img = new Image();
            img.alt = 'Formula/Chart';
            img.title = 'Formula/Chart';
            return img;
        }
    }

    // 缓存对象，用于存储处理后的HTML内容
    var printContentCache = {};

    // 生成缓存键的函数
    function generateCacheKey(content, settings) {
        // 基于内容和设置生成唯一键
        var key = content + JSON.stringify(settings);
        // 使用简单的哈希函数生成键
        var hash = 0;
        for (var i = 0; i < key.length; i++) {
            var char = key.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // 转换为32位整数
        }
        return 'cache_' + hash;
    }

    async function preparePrintContent(content, settings) {
        // 生成缓存键
        var cacheKey = generateCacheKey(content, settings);

        // 检查缓存是否存在
        if (printContentCache[cacheKey]) {
            return printContentCache[cacheKey];
        }

        // Always use formatForPrint to ensure consistent processing and auto-layout
        var htmlContent = formatForPrint(content, settings);

        // Convert formulas and charts to images and upload
        var processedHtml = await convertFormulasAndChartsToImages(htmlContent);

        // For print, we need to ensure formulas, charts, and images are properly rendered
        // Create a temporary container to process the content
        var tempContainer = document.createElement('div');
        tempContainer.innerHTML = processedHtml;

        // Process images - convert to data URLs to avoid network errors
        processImages(tempContainer);

        var finalHtml = tempContainer.innerHTML;

        // 将处理后的内容存入缓存
        printContentCache[cacheKey] = finalHtml;

        return finalHtml;
    }

    function processImages(container) {
        // Process images to ensure they load without network errors
        var imgElements = container.querySelectorAll('img');
        imgElements.forEach(function(img) {
            var imgUrl = img.src;
            if (imgUrl && !imgUrl.startsWith('data:')) {
                // Create a placeholder image or convert to data URL
                // For now, we'll add a fallback to handle cases where image loading fails
                img.onerror = function() {
                    // If image fails to load, display alt text
                    this.style.border = '1px solid #ddd';
                    this.style.backgroundColor = '#f8f9fa';
                    this.style.padding = '20px';
                    this.alt = 'Image: ' + (this.alt || imgUrl);
                };
            }
        });
    }

    function processFormulasAndCharts(container) {
        // Process KaTeX formulas - preserve original elements for client-side rendering
        var mathElements = container.querySelectorAll('.katex, .katex-display, [data-katex]');
        mathElements.forEach(function(el) {
            var latex = el.getAttribute('data-katex') || el.textContent;
            if (!latex) return;

            try {
                // 为公式元素添加data-katex属性，确保客户端能够识别和渲染
                if (!el.hasAttribute('data-katex')) {
                    el.setAttribute('data-katex', latex);
                }
                // 为公式元素添加适当的类名
                if (!el.classList.contains('katex')) {
                    el.classList.add('katex');
                }
            } catch (e) {
                console.error('Formula processing error:', e);
            }
        });

        // Process Mermaid charts - preserve original elements for client-side rendering
        var mermaidElements = container.querySelectorAll('.mermaid, [data-mermaid]');
        mermaidElements.forEach(function(el) {
            var mermaidCode = el.textContent || el.getAttribute('data-mermaid');
            if (!mermaidCode) return;

            try {
                // 为图表元素添加data-mermaid属性，确保客户端能够识别和渲染
                if (!el.hasAttribute('data-mermaid')) {
                    el.setAttribute('data-mermaid', mermaidCode);
                }
                // 为图表元素添加适当的类名
                if (!el.classList.contains('mermaid')) {
                    el.classList.add('mermaid');
                }
            } catch (e) {
                console.error('Chart processing error:', e);
            }
        });
    }

    // Simplified functions for generating formula and chart representations
    function generateFormulaDataUrl(latex, displayMode) {
        try {
            // Create a simple text representation of the formula
            return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg width="300" height="50" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="white" stroke="#ddd" stroke-width="1"/><text x="150" y="30" font-family="Arial" font-size="14" text-anchor="middle" fill="#333">Formula: ' + latex + '</text></svg>');
        } catch (e) {
            console.error('Formula SVG generation error:', e);
            return null;
        }
    }

    function generateChartDataUrl(mermaidCode) {
        try {
            // Determine chart type
            var chartType = mermaidCode.toLowerCase().includes('graph') ? 'Flowchart' :
                mermaidCode.toLowerCase().includes('sequence') ? 'Sequence Diagram' :
                    mermaidCode.toLowerCase().includes('class') ? 'Class Diagram' :
                        mermaidCode.toLowerCase().includes('state') ? 'State Diagram' :
                            mermaidCode.toLowerCase().includes('gantt') ? 'Gantt Chart' :
                                mermaidCode.toLowerCase().includes('pie') ? 'Pie Chart' :
                                    mermaidCode.toLowerCase().includes('xychart') ? 'XY Chart' : 'Mermaid Chart';

            // Create a simple text representation of the chart
            return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg width="500" height="300" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="white" stroke="#ddd" stroke-width="1"/><text x="250" y="130" font-family="Arial" font-size="16" text-anchor="middle" fill="#333">' + chartType + '</text><text x="250" y="160" font-family="Arial" font-size="12" text-anchor="middle" fill="#666">Chart</text></svg>');
        } catch (e) {
            console.error('Chart SVG generation error:', e);
            return null;
        }
    }

    global.showMobileActionSheet = showMobileActionSheet;
    global.hideMobileActionSheet = hideMobileActionSheet;
    global.insertText = insertText;
    global.insertTable = insertTable;
    global.exportContent = exportContent;
    global.exportFile = exportFile;
    global.toggleNightMode = toggleNightMode;
    global.showFormatMenu = showFormatMenu;
    global.showInsertMenu = showInsertMenu;
    global.showChartPicker = showChartPicker;
    global.triggerFileUpload = triggerFileUpload;
    global.triggerImageUpload = triggerImageUpload;
    global.uploadFiles = uploadFiles;
    global.showShareDialog = showShareDialog;
    global.createShareLink = createShareLink;
    global.showShareResult = showShareResult;
    global.showPrintDialog = showPrintDialog;
    global.getPrintSettings = getPrintSettings;
    global.showPrintPreview = showPrintPreview;
    global.sendToPrint = sendToPrint;
    global.convertFormulasAndChartsToImages = convertFormulasAndChartsToImages;
    global.showFilePrintDialog = showFilePrintDialog;

    function showFilePrintDialog() {
        // 检查用户是否登录
        if (!g('currentUser')) {
            alert('请先登录后再使用文件打印功能');
            if (g('showLoginModal')) {
                g('showLoginModal')();
            }
            return;
        }

        var nightMode = g('nightMode') === true;
        var printModal = document.createElement('div');
        printModal.className = 'modal-overlay';
        printModal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:10000;';

        var bg = nightMode ? '#2d2d2d' : 'white';
        var textColor = nightMode ? '#eee' : '#333';
        var borderColor = nightMode ? '#444' : '#ddd';
        var modalContent = document.createElement('div');
        modalContent.style.cssText = 'background:' + bg + ';color:' + textColor + ';border-radius:12px;padding:25px;width:90%;max-width:600px;max-height:85vh;overflow-y:auto;';

        var title = '<h2 style="text-align:center;margin-bottom:20px;">文件上传打印</h2>';

        // 客户端连接状态区域
        var statusSection = `
            <div style="margin-bottom:20px;padding:15px;background:` + (nightMode ? '#3d3d3d' : '#f8f9fa') + `;border-radius:8px;">
                <h3 style="margin-top:0;margin-bottom:10px;">打印客户端状态</h3>
                <div id="clientStatus" style="display:flex;align-items:center;gap:10px;">
                    <div id="statusIndicator" style="width:12px;height:12px;border-radius:50%;background:#dc3545;"></div>
                    <span id="statusText" style="font-size:14px;">请连接打印客户端</span>
                </div>
                <p style="margin-top:10px;font-size:14px;" id="download-container">
  <a href="#" target="_blank" style="color:#4a90e2;" id="download-link">正在检测操作系统...</a>
</p>

<script>
(function() {
  // 定义暗色模式变量（如果项目中已定义，可省略）
  const nightMode = false; // 或根据实际逻辑设置

  // 获取链接元素
  const link = document.getElementById('download-link');
  const container = document.getElementById('download-container');

  // 检测操作系统
  const userAgent = navigator.userAgent || navigator.platform;
  let os = 'windows'; // 默认 Windows

  if (userAgent.indexOf('Win') !== -1) {
    os = 'windows';
  } else if (userAgent.indexOf('Linux') !== -1 && userAgent.indexOf('Android') === -1) {
    // 排除 Android 设备（如果也想支持 Android，可单独处理）
    os = 'linux';
  } else if (userAgent.indexOf('Mac') !== -1) {
    // macOS 可以提示或提供通用版本，这里仍给 Windows 版本或显示不支持
    os = 'mac'; // 可自定义处理
  }

  // 根据操作系统设置下载链接
  let downloadUrl = '';
  let linkText = '';

  switch (os) {
    case 'windows':
      downloadUrl = 'print_client.exe';
      linkText = '点击下载 Windows 客户端';
      break;
    case 'linux':
      downloadUrl = 'print_client.tar.gz';
      linkText = '点击下载 Linux 客户端';
      break;
    default:
      // macOS 或其他系统，默认提供 Windows 版本并提示
      downloadUrl = 'print_client.exe';
      linkText = '点击下载客户端 (Windows 版本，您的系统可能不兼容)';
      break;
  }

  // 更新链接
  link.href = downloadUrl;
  link.textContent = linkText;
  link.target = '_blank';

  // 应用夜间模式样式（保留原逻辑）
  container.style.color = nightMode ? '#aaa' : '#666';
})();
</script>
                </div>
        `;

        // 文件上传区域
        var fileUploadSection = `
            <div style="margin-bottom:20px;padding:20px;background:` + (nightMode ? '#3d3d3d' : '#f8f9fa') + `;border-radius:8px;">
                <h3 style="margin-top:0;margin-bottom:15px;">上传文件</h3>
                <p style="margin-bottom:20px;font-size:14px;color:` + (nightMode ? '#aaa' : '#666') + `;">支持上传 PDF、DOC、DOCX、XLS、XLSX、TXT、PPT、PPTX、PNG、JPG 等格式的文件</p>
                <div style="margin-bottom:20px;">
                    <input type="file" id="printFileUpload" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.ppt,.pptx,.png,.jpg,.jpeg" style="width:100%;padding:12px;border:2px dashed ` + borderColor + `;border-radius:6px;background:` + (nightMode ? '#3d3d3d' : 'white') + `;color:` + textColor + `;cursor:pointer;">
                </div>
                <div id="uploadedFilesList" style="margin-top:15px;">
                    <!-- 上传文件列表将在这里显示 -->
                </div>
            </div>
        `;

        var actionButtons = `
            <div style="display:flex;gap:10px;margin-top:20px;">
                <button id="filePrintBtn" style="flex:1;padding:12px;font-weight:bold;background:#2196F3;color:white;border:none;border-radius:6px;cursor:pointer;">打印文件</button>
                <button id="filePrintCancelBtn" style="flex:1;padding:12px;background:` + (nightMode ? '#555' : '#9E9E9E') + `;color:white;border:none;border-radius:6px;cursor:pointer;">取消</button>
            </div>
        `;

        modalContent.innerHTML = title + statusSection + fileUploadSection + actionButtons;
        printModal.appendChild(modalContent);
        document.body.appendChild(printModal);

        // 连接到打印服务器检查客户端状态
        var statusIndicator = modalContent.querySelector('#statusIndicator');
        var statusText = modalContent.querySelector('#statusText');

        var ws = null;
        var wsTimeout = null;
        var statusCheckInterval = null;

        function closeWebSocket() {
            if (ws) {
                ws.close();
                ws = null;
            }
            if (wsTimeout) {
                clearTimeout(wsTimeout);
                wsTimeout = null;
            }
        }

        function updateClientStatus(connected) {
            if (connected) {
                statusIndicator.style.backgroundColor = '#28a745';
                statusText.textContent = '打印客户端已连接';
            } else {
                statusIndicator.style.backgroundColor = '#dc3545';
                statusText.textContent = '请连接打印客户端';
            }
        }

        // 连接到打印服务器检查状态
        function checkClientStatus() {
            var wsUrl = 'wss://print.yhsun.cn';
            ws = new WebSocket(wsUrl);
            wsTimeout = setTimeout(function() {
                updateClientStatus(false);
                closeWebSocket();
            }, 5000);

            ws.onopen = function() {
                clearTimeout(wsTimeout);
                // 发送状态检查请求，使用用户的账号信息
                ws.send(JSON.stringify({
                    type: 'check_client_status',
                    username: g('currentUser').username,
                    password: g('currentUser').password
                }));
            };

            ws.onmessage = function(event) {
                try {
                    var response = JSON.parse(event.data);
                    if (response.type === 'client_status') {
                        updateClientStatus(response.connected);
                    }
                    closeWebSocket();
                } catch (e) {
                    console.error('响应解析错误:', e);
                    updateClientStatus(false);
                    closeWebSocket();
                }
            };

            ws.onerror = function(error) {
                clearTimeout(wsTimeout);
                console.error('WebSocket错误:', error);
                updateClientStatus(false);
                closeWebSocket();
            };

            ws.onclose = function(event) {
                clearTimeout(wsTimeout);
            };
        }

        // 初始检查客户端状态
        checkClientStatus();

        // 设置定时器，每3秒检查一次客户端状态
        statusCheckInterval = setInterval(checkClientStatus, 3000);

        // 关闭模态框时关闭WebSocket连接和清除定时器
        function cleanup() {
            closeWebSocket();
            if (statusCheckInterval) {
                clearInterval(statusCheckInterval);
                statusCheckInterval = null;
            }
        }

        // 关闭模态框时关闭WebSocket连接
        var cancelBtn = modalContent.querySelector('#filePrintCancelBtn');
        if (cancelBtn) {
            var originalOnClick = cancelBtn.onclick;
            cancelBtn.onclick = function() {
                cleanup();
                if (originalOnClick) {
                    originalOnClick();
                } else {
                    printModal.remove();
                }
            };
        }

        // 打印按钮也需要关闭连接
        var printBtn = modalContent.querySelector('#filePrintBtn');
        if (printBtn) {
            var originalPrintOnClick = printBtn.onclick;
            printBtn.onclick = function() {
                cleanup();
                if (originalPrintOnClick) {
                    originalPrintOnClick();
                }
            };
        }

        // 打印模态框点击外部关闭时也需要清除定时器
        printModal.addEventListener('click', function(e) {
            if (e.target === printModal) {
                cleanup();
                printModal.remove();
            }
        });

        // 文件上传功能
        var fileUpload = modalContent.querySelector('#printFileUpload');
        var uploadedFilesList = modalContent.querySelector('#uploadedFilesList');
        var uploadedFiles = [];

        if (fileUpload) {
            fileUpload.addEventListener('change', function(e) {
                var files = Array.from(e.target.files || []);
                if (files.length > 0) {
                    uploadedFiles = uploadedFiles.concat(files);
                    updateUploadedFilesList();
                }
            });
        }

        function updateUploadedFilesList() {
            if (!uploadedFilesList) return;

            uploadedFilesList.innerHTML = '';
            if (uploadedFiles.length === 0) {
                uploadedFilesList.innerHTML = '<p style="text-align:center;color:' + (nightMode ? '#aaa' : '#666') + ';padding:20px;">暂无上传文件</p>';
                return;
            }

            var fileList = document.createElement('ul');
            fileList.style.cssText = 'list-style:none;padding:0;margin:0;';

            uploadedFiles.forEach(function(file, index) {
                var fileItem = document.createElement('li');
                fileItem.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:12px;border-bottom:1px solid ' + (nightMode ? '#444' : '#eee') + ';';

                var fileInfo = document.createElement('div');
                fileInfo.style.cssText = 'flex:1;';
                fileInfo.innerHTML = '<span style="font-size:14px;font-weight:500;">' + file.name + '</span><span style="font-size:12px;color:' + (nightMode ? '#aaa' : '#666') + ';margin-left:15px;">' + (file.size / 1024).toFixed(1) + ' KB</span>';

                var removeBtn = document.createElement('button');
                removeBtn.innerHTML = '<i class="fas fa-times"></i>';
                removeBtn.style.cssText = 'background:none;border:none;color:' + (nightMode ? '#dc3545' : '#dc3545') + ';cursor:pointer;font-size:16px;padding:8px;border-radius:50%;transition:all 0.2s ease;';
                removeBtn.onmouseover = function() {
                    this.style.backgroundColor = (nightMode ? 'rgba(220, 53, 69, 0.2)' : 'rgba(220, 53, 69, 0.1)');
                };
                removeBtn.onmouseout = function() {
                    this.style.backgroundColor = 'transparent';
                };
                removeBtn.onclick = function() {
                    uploadedFiles.splice(index, 1);
                    updateUploadedFilesList();
                };

                fileItem.appendChild(fileInfo);
                fileItem.appendChild(removeBtn);
                fileList.appendChild(fileItem);
            });

            uploadedFilesList.appendChild(fileList);
        }

        // 初始化上传文件列表
        updateUploadedFilesList();

        // 打印按钮事件
        var filePrintBtn = modalContent.querySelector('#filePrintBtn');
        if (filePrintBtn) {
            // 移除水波纹效果
            filePrintBtn.onclick = debounce(async function() {
                var username = g('currentUser').username;
                var userPassword = g('currentUser').password;

                if (uploadedFiles.length === 0) {
                    alert('请先上传文件');
                    return;
                }

                var btn = this;
                btn.disabled = true;
                btn.textContent = '打印中...';

                try {
                    global.showMessage('正在处理上传的文件...');

                    // 上传文件到服务器
                    var formData = new FormData();
                    uploadedFiles.forEach(function(file) {
                        formData.append('files[]', file);
                    });

                    // 发送文件到打印服务器
                    var response = await fetch('api/upload.php', {
                        method: 'POST',
                        body: formData
                    });

                    var result = await response.json();
                    if (result.success) {
                        // 调用打印函数发送文件URL到打印服务器
                        for (var i = 0; i < result.urls.length; i++) {
                            await sendFileToPrint(result.urls[i], uploadedFiles[i].name);
                        }
                        global.showMessage('文件打印任务已发送');
                        printModal.remove();
                    } else {
                        global.showMessage('文件上传失败: ' + (result.message || '未知错误'), 'error');
                        btn.disabled = false;
                        btn.textContent = '打印文件';
                    }
                } catch (error) {
                    console.error('文件打印失败:', error);
                    global.showMessage('文件打印失败: ' + error.message, 'error');
                    btn.disabled = false;
                    btn.textContent = '打印文件';
                }
            }, 500);
        }

        // 取消按钮事件
        var filePrintCancelBtn = modalContent.querySelector('#filePrintCancelBtn');
        if (filePrintCancelBtn) {
            // 移除水波纹效果
            filePrintCancelBtn.onclick = function() {
                printModal.remove();
            };
        }

        printModal.addEventListener('click', function(e) {
            if (e.target === printModal) printModal.remove();
        });

        // 发送文件到打印服务器
        async function sendFileToPrint(fileUrl, fileName) {
            var username = g('currentUser').username;
            var userPassword = g('currentUser').password;

            return new Promise(function(resolve, reject) {
                var wsUrl = 'wss://print.yhsun.cn';
                var ws = new WebSocket(wsUrl);
                var timeout = setTimeout(function() {
                    reject(new Error('连接超时'));
                }, 5000);

                ws.onopen = function() {
                    clearTimeout(timeout);

                    // 确保fileUrl是完整的URL
                    var fullFileUrl = fileUrl;
                    if (!fileUrl.startsWith('http://') && !fileUrl.startsWith('https://')) {
                        // 构建完整的URL
                        var baseUrl = window.location.origin;
                        if (!fileUrl.startsWith('/')) {
                            baseUrl += '/' + window.location.pathname.split('/').slice(0, -1).join('/') + '/';
                        }
                        fullFileUrl = baseUrl + fileUrl;
                    }

                    var printData = {
                        type: 'print_request',
                        username: username,
                        password: userPassword,
                        content: fullFileUrl,
                        content_type: 'file',
                        file_name: fileName,
                        settings: {
                            print_file: true
                        },
                        timestamp: new Date().toISOString()
                    };

                    ws.send(JSON.stringify(printData));
                };

                ws.onmessage = function(event) {
                    try {
                        var response = JSON.parse(event.data);
                        if (response.type === 'print_queued') {
                            resolve();
                        } else if (response.type === 'error') {
                            reject(new Error(response.message || '打印失败'));
                        }
                    } catch (e) {
                        reject(e);
                    } finally {
                        ws.close();
                    }
                };

                ws.onerror = function(error) {
                    clearTimeout(timeout);
                    reject(error);
                    ws.close();
                };

                ws.onclose = function() {
                    clearTimeout(timeout);
                };
            });
        }
    }

    // AI智能排版相关函数
    let aiLayoutHistory = []; // 存储历史对话记录
    let currentAISettings = null; // 当前的打印设置

    // 显示AI智能排版输入对话框
    function showAILayoutDialog(printModalContent, cleanupCallback, originalPrintModal) {
        var nightMode = g('nightMode') === true;
        var bg = nightMode ? '#2d2d2d' : 'white';
        var textColor = nightMode ? '#eee' : '#333';
        var borderColor = nightMode ? '#444' : '#ddd';

        var aiModal = document.createElement('div');
        aiModal.className = 'modal-overlay';
        aiModal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:10001;';

        var modalContent = document.createElement('div');
        modalContent.style.cssText = 'background:' + bg + ';color:' + textColor + ';border-radius:12px;padding:25px;width:90%;max-width:550px;';

        var title = '<h2 style="text-align:center;margin-bottom:20px;"><i class="fas fa-magic"></i> AI智能排版</h2>';

        var inputSection = `
            <div style="margin-bottom:15px;">
                <label style="display:block;margin-bottom:8px;font-size:14px;font-weight:bold;">排版需求描述</label>
                <textarea id="aiLayoutDescription" placeholder="用自然语言描述您的排版需求，例如：'使用商务风格，标题居中，正文宋体12pt，行距1.5倍，段落首行缩进'" 
                    style="width:100%;min-height:120px;padding:10px;border:1px solid ${borderColor};border-radius:6px;background:${nightMode ? '#3d3d3d' : 'white'};color:${textColor};resize:vertical;font-size:14px;box-sizing:border-box;"></textarea>
            </div>
            <div style="margin-bottom:20px;">
                <label style="display:flex;align-items:center;gap:10px;cursor:pointer;">
                    <input type="checkbox" id="keepFormatSettings" checked style="width:18px;height:18px;">
                    <span style="font-size:14px;">保留已选择的格式设置</span>
                </label>
            </div>
        `;

        var actionButtons = `
            <div style="display:flex;gap:10px;">
                <button id="aiLayoutCancelBtn" style="flex:1;padding:12px;background:${nightMode ? '#555' : '#6c757d'};color:white;border:none;border-radius:6px;cursor:pointer;">取消</button>
                <button id="aiLayoutStartBtn" style="flex:2;padding:12px;font-weight:bold;background:linear-gradient(135deg, #667eea 0%, #764ba2 100%);color:white;border:none;border-radius:6px;cursor:pointer;">开始排版</button>
            </div>
        `;

        modalContent.innerHTML = title + inputSection + actionButtons;
        aiModal.appendChild(modalContent);
        document.body.appendChild(aiModal);

        // 如果有历史记录，显示最后一条作为参考
        if (aiLayoutHistory.length > 0) {
            var lastDescription = aiLayoutHistory[aiLayoutHistory.length - 1].description;
            modalContent.querySelector('#aiLayoutDescription').value = lastDescription;
        }

        // 取消按钮
        modalContent.querySelector('#aiLayoutCancelBtn').onclick = function() {
            aiModal.remove();
        };

        // 开始排版按钮
        modalContent.querySelector('#aiLayoutStartBtn').onclick = debounce(async function() {
            var description = modalContent.querySelector('#aiLayoutDescription').value.trim();
            var keepFormatSettings = modalContent.querySelector('#keepFormatSettings').checked;

            if (!description) {
                global.showMessage('请输入排版需求描述', 'error');
                return;
            }

            // 保存当前设置
            currentAISettings = getPrintSettings(printModalContent);

            // 关闭对话框
            aiModal.remove();

            // 开始AI排版
            await startAILayout(description, keepFormatSettings, currentAISettings, cleanupCallback, originalPrintModal);
        }, 1000);

        // 点击背景关闭
        aiModal.addEventListener('click', function(e) {
            if (e.target === aiModal) {
                aiModal.remove();
            }
        });
    }

    // 显示AI排版加载状态
    function showAILoadingModal(statusText) {
        var nightMode = g('nightMode') === true;
        var bg = nightMode ? '#2d2d2d' : 'white';
        var textColor = nightMode ? '#eee' : '#333';

        var loadingModal = document.createElement('div');
        loadingModal.id = 'aiLoadingModal';
        loadingModal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.8);z-index:10002;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;';

        var loadingContent = document.createElement('div');
        loadingContent.style.cssText = 'background:' + bg + ';color:' + textColor + ';border-radius:12px;padding:30px;text-align:center;min-width:280px;';
        loadingContent.innerHTML = `
            <div style="font-size:32px;margin-bottom:15px;"><i class="fas fa-spinner fa-spin"></i></div>
            <div id="aiLoadingText" style="font-size:16px;margin-bottom:10px;">${statusText}</div>
            <div style="width:100%;height:6px;background:${nightMode ? '#444' : '#e0e0e0'};border-radius:3px;overflow:hidden;margin-top:10px;">
                <div id="aiProgressBar" style="height:100%;background:linear-gradient(90deg, #667eea 0%, #764ba2 100%);width:0%;transition:width 0.3s;"></div>
            </div>
        `;

        loadingModal.appendChild(loadingContent);
        document.body.appendChild(loadingModal);

        return loadingModal;
    }

    // 更新AI加载状态
    function updateAILoadingStatus(loadingModal, text, progress) {
        var loadingText = loadingModal.querySelector('#aiLoadingText');
        var progressBar = loadingModal.querySelector('#aiProgressBar');
        if (loadingText) loadingText.textContent = text;
        if (progressBar) progressBar.style.width = progress + '%';
    }

    // 调用后端AI排版接口
    async function callQwenAPI(markdown, description, settings, keepFormatSettings, loadingModal) {
        let referenceHtml = '';
        if (keepFormatSettings && settings) {
            updateAILoadingStatus(loadingModal, '正在生成参考HTML...', 20);
            referenceHtml = generateReferenceHtml(markdown, settings);
        }

        const requestBody = {
            markdown: markdown,
            description: description,
            settings: settings,
            keepFormatSettings: keepFormatSettings,
            referenceHtml: referenceHtml
        };

        console.log('========== AI智能排版 - 发送给后端的请求 ==========');
        console.log('Request Body:', requestBody);
        console.log('====================================================');

        try {
            updateAILoadingStatus(loadingModal, 'AI正在思考...', 50);
            
            const response = await fetch('api/ai_layout.php', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                let errorText = '';
                try {
                    const errorResult = await response.json();
                    errorText = JSON.stringify(errorResult);
                    console.error('后端错误详情:', errorResult);
                } catch (e) {
                    errorText = await response.text();
                    console.error('后端错误文本:', errorText);
                }
                throw new Error('后端请求失败: ' + response.status + ' - ' + errorText);
            }

            updateAILoadingStatus(loadingModal, 'AI正在思考中...', 45);
            
            const result = await response.json();
            
            console.log('========== AI智能排版 - 后端返回的响应 ==========');
            console.log('Complete Response:', result);
            console.log('====================================================');
            
            if (result.code === 200 && result.data && result.data.html) {
                let htmlContent = result.data.html;
                
                console.log('后端返回的HTML内容:', htmlContent);
                
                updateAILoadingStatus(loadingModal, '正在解析生成的内容...', 55);
                
                return htmlContent;
            } else {
                throw new Error(result.message || '后端返回错误');
            }
        } catch (error) {
            console.error('========== AI智能排版 - 调用失败 ==========');
            console.error('错误:', error);
            console.error('==========================================');
            throw error;
        }
    }

    // 生成参考HTML（公式和mermaid不转换）
    function generateReferenceHtml(markdown, settings) {
        var scale = settings.fitToPage ? 0.85 : 1.0;
        var bodyFontSize = parseInt(settings.bodyFontSize) * scale;
        var titleFontSize = parseInt(settings.titleFontSize) * scale;
        var lineHeight = parseFloat(settings.lineHeight || '1.2');
        var paragraphSpacing = parseFloat(settings.paragraphSpacing || '0.5');
        var titleSpacing = parseFloat(settings.titleSpacing || '0.8');
        var alignment = settings.alignment || 'left';
        var titleAlignment = settings.titleAlignment || 'center';
        var indentParagraph = settings.indentParagraph;

        var printStyles = `
    <style>
        body {
            font-family: "SimSun", "宋体", serif;
            font-size: ${bodyFontSize}pt;
            line-height: ${lineHeight};
            color: #333;
            padding: ${settings.pageMargin}mm;
        }
        h1, h2, h3, h4, h5, h6 {
            text-align: ${titleAlignment};
            font-weight: bold;
            margin-top: ${titleSpacing};
            margin-bottom: ${titleSpacing};
            line-height: ${lineHeight};
        }
        h1 { font-size: ${titleFontSize * 1.5}; }
        h2 { font-size: ${titleFontSize * 1.3}; }
        h3 { font-size: ${titleFontSize * 1.1}pt; }
        h4 { font-size: ${titleFontSize}pt; }
        h5 { font-size: ${titleFontSize * 0.9}pt; }
        h6 { font-size: ${titleFontSize * 0.8}pt; }
        p {
            font-size: ${bodyFontSize}pt;
            margin: 0 0 ${paragraphSpacing}em 0;
            padding: 0;
            text-align: ${alignment};
            ${indentParagraph ? 'text-indent: 2em;' : ''}
        }
        .code-block {
            background: #f8f9fa;
            border: 1px solid #ddd;
            border-radius: 4px;
            padding: ${settings.fitToPage ? '10px' : '15px'};
            font-family: monospace;
            font-size: ${bodyFontSize * 0.9}pt;
            overflow-x: auto;
            margin: ${titleSpacing};
            text-align: left;
        }
        img {
            max-width: 100%;
            height: auto;
            margin: 1em 0;
        }
    </style>
`;

        // 简单转换Markdown为HTML（不转换公式和mermaid）
        var html = printStyles;
        var lines = markdown.split('\n');
        var inCodeBlock = false;
        var inFormulaBlock = false;
        var inMermaidBlock = false;

        for (var i = 0; i < lines.length; i++) {
            var line = lines[i];

            // 处理代码块
            if (line.trim().startsWith('```')) {
                if (!inCodeBlock) {
                    inCodeBlock = true;
                    var langMatch = line.match(/^```(\w+)/);
                    var lang = langMatch ? langMatch[1] : '';
                    if (lang === 'mermaid') {
                        inMermaidBlock = true;
                        html += '<div class="mermaid" data-mermaid="">';
                    } else {
                        html += '<pre class="code-block"><code class="language-' + lang + '">';
                    }
                } else {
                    inCodeBlock = false;
                    if (inMermaidBlock) {
                        inMermaidBlock = false;
                        html += '</div>';
                    } else {
                        html += '</code></pre>';
                    }
                }
                continue;
            }

            if (inCodeBlock) {
                html += escapeHtml(line) + '\n';
                continue;
            }

            // 处理公式块 $$...$$
            if (line.trim() === '$$') {
                if (!inFormulaBlock) {
                    inFormulaBlock = true;
                    html += '<div style="text-align:center;margin:1em 0;">$$';
                } else {
                    inFormulaBlock = false;
                    html += '$$</div>';
                }
                continue;
            }

            if (inFormulaBlock) {
                html += line + '\n';
                continue;
            }

            // 处理标题
            var headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
            if (headingMatch) {
                var level = headingMatch[1].length;
                var text = headingMatch[2];
                html += '<h' + level + '>' + convertSimpleMarkdown(text) + '</h' + level + '>';
                continue;
            }

            // 处理段落
            if (line.trim()) {
                html += '<p>' + convertSimpleMarkdown(line) + '</p>';
            } else {
                html += '<p>&nbsp;</p>';
            }
        }

        return '<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body>' + html + '</body></html>';
    }

    // 简单的Markdown转换（不处理公式和代码）
    function convertSimpleMarkdown(text) {
        text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');
        text = text.replace(/~~(.*?)~~/g, '<del>$1</del>');
        return text;
    }

    // 开始AI排版
    async function startAILayout(description, keepFormatSettings, settings, cleanupCallback, originalPrintModal) {
        var content = g('vditor') ? g('vditor').getValue() : '';
        
        console.log('========== AI智能排版 - 开始 ==========');
        console.log('文档内容长度:', content.length);
        console.log('排版需求:', description);
        console.log('保留格式设置:', keepFormatSettings);
        console.log('打印设置:', settings);
        console.log('========================================');
        
        if (!content.trim()) {
            global.showMessage('文档内容为空，无法排版', 'error');
            return;
        }

        // 显示加载模态框
        var loadingModal = showAILoadingModal('初始化...');
        updateAILoadingStatus(loadingModal, '正在加载文档内容...', 10);

        try {
            // 保存到历史记录
            aiLayoutHistory.push({
                description: description,
                timestamp: new Date()
            });

            updateAILoadingStatus(loadingModal, '准备发送给AI...', 25);

            // 调用通义千问API
            var aiGeneratedHtml = await callQwenAPI(content, description, settings, keepFormatSettings, loadingModal);

            updateAILoadingStatus(loadingModal, '正在处理公式和图表...', 65);

            // 从AI生成的HTML中提取body内容
            var bodyContent = aiGeneratedHtml;
            var bodyMatch = aiGeneratedHtml.match(/<body[^>]*>([\s\S]*)<\/body>/i);
            if (bodyMatch) {
                bodyContent = bodyMatch[1];
                console.log('成功提取body内容，长度:', bodyContent.length);
            } else {
                console.log('未找到body标签，使用全部内容');
            }

            updateAILoadingStatus(loadingModal, '正在转换公式为图片...', 75);

            // 转换公式和图表
            var finalHtml = await convertFormulasAndChartsToImages(bodyContent);

            updateAILoadingStatus(loadingModal, '正在准备预览界面...', 90);

            // 关闭加载模态框
            loadingModal.remove();

            // 关闭原打印模态框
            if (cleanupCallback) cleanupCallback();
            if (originalPrintModal) originalPrintModal.remove();

            console.log('========== AI智能排版 - 完成 ==========');

            // 显示AI排版预览
            await showAILayoutPreview(finalHtml, aiGeneratedHtml, description, settings);

        } catch (error) {
            console.error('========== AI智能排版 - 失败 ==========');
            console.error('错误详情:', error);
            console.error('==========================================');
            loadingModal.remove();
            global.showMessage('AI排版失败: ' + error.message, 'error');
        }
    }

    // 显示AI排版预览
    async function showAILayoutPreview(htmlContent, fullHtml, description, settings) {
        var nightMode = g('nightMode') === true;
        var aiGeneratedHtml = fullHtml || htmlContent;

        var previewModal = document.createElement('div');
        previewModal.className = 'modal-overlay';
        previewModal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.9);z-index:10001;display:flex;flex-direction:column;align-items:stretch;justify-content:stretch;padding:0;';

        var previewContent = document.createElement('div');
        previewContent.style.cssText = 'background:' + (nightMode ? '#1a1a1a' : '#f0f0f0') + ';border-radius:0;display:flex;flex-direction:column;flex:1;box-shadow:none;border:none;min-height:0;';

        // 关闭按钮
        var closeBtn = document.createElement('button');
        closeBtn.innerHTML = '<i class="fas fa-times"></i>';
        closeBtn.style.cssText = 'position:absolute;top:10px;right:10px;background:' + (nightMode ? '#333' : '#fff') + ';border:1px solid ' + (nightMode ? '#555' : '#ddd') + ';color:#666;font-size:16px;cursor:pointer;padding:8px;border-radius:4px;z-index:10;';

        // 文档容器
        var docContainer = document.createElement('div');
        docContainer.style.cssText = 'flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;overflow:auto;padding:20px;min-height:0;';

        var currentScale = 1.0;
        var initialDistance = 0;
        var a4Width = 595;
        var a4Height = 842;
        var a4Margin = settings ? settings.pageMargin : 15;

        var pagesWrapper = document.createElement('div');
        pagesWrapper.style.cssText = 'display:flex;flex-direction:column;gap:20px;align-items:center;transform-origin:top center;';

        // 创建页面
        var page = document.createElement('div');
        page.className = 'a4-page';
        page.style.cssText = 'width:' + a4Width + 'px;min-height:' + a4Height + 'px;background:white;box-shadow:0 2px 10px rgba(0,0,0,0.1);position:relative;border:1px solid #ccc;overflow:visible;';

        var contentDiv = document.createElement('div');
        contentDiv.style.cssText = 'width:100%;padding:' + a4Margin + 'mm;box-sizing:border-box;position:relative;';
        contentDiv.innerHTML = htmlContent;

        page.appendChild(contentDiv);
        pagesWrapper.appendChild(page);
        docContainer.appendChild(pagesWrapper);

        // 底部按钮容器
        var buttonContainer = document.createElement('div');
        buttonContainer.style.cssText = 'display:flex;gap:8px;padding:12px;background:' + (nightMode ? '#2d2d2d' : '#f8f9fa') + ';border-top:1px solid ' + (nightMode ? '#444' : '#eee') + ';justify-content:center;flex-wrap:wrap;';

        var modifyBtn = document.createElement('button');
        modifyBtn.innerHTML = '<i class="fas fa-edit"></i> 修改需求';
        modifyBtn.style.cssText = 'padding:8px 16px;background:linear-gradient(135deg, #667eea 0%, #764ba2 100%);color:white;border:none;border-radius:4px;cursor:pointer;font-size:14px;font-weight:bold;';

        var printBtn = document.createElement('button');
        printBtn.innerHTML = '<i class="fas fa-print"></i> 打印';
        printBtn.style.cssText = 'padding:8px 16px;background:#4a90e2;color:white;border:none;border-radius:4px;cursor:pointer;font-size:14px;font-weight:bold;';

        var pdfBtn = document.createElement('button');
        pdfBtn.innerHTML = '<i class="fas fa-file-pdf"></i> 下载';
        pdfBtn.style.cssText = 'padding:8px 16px;background:#dc3545;color:white;border:none;border-radius:4px;cursor:pointer;font-size:14px;font-weight:bold;';

        var cancelBtn = document.createElement('button');
        cancelBtn.innerHTML = '<i class="fas fa-times"></i> 关闭';
        cancelBtn.style.cssText = 'padding:8px 16px;background:' + (nightMode ? '#555' : '#6c757d') + ';color:white;border:none;border-radius:4px;cursor:pointer;font-size:14px;';

        buttonContainer.appendChild(modifyBtn);
        buttonContainer.appendChild(printBtn);
        buttonContainer.appendChild(pdfBtn);
        buttonContainer.appendChild(cancelBtn);

        // 组装预览
        previewModal.appendChild(closeBtn);
        previewContent.appendChild(docContainer);
        previewContent.appendChild(buttonContainer);
        previewModal.appendChild(previewContent);
        document.body.appendChild(previewModal);

        // 自动适配屏幕
        function fitToScreen() {
            var containerWidth = docContainer.clientWidth - 40;
            var scale = Math.min(containerWidth / a4Width, 1.0);
            currentScale = scale;
            pagesWrapper.style.transform = 'scale(' + scale + ')';
        }

        setTimeout(fitToScreen, 100);
        window.addEventListener('resize', fitToScreen);

        // 触摸事件
        pagesWrapper.addEventListener('touchstart', function(e) {
            if (e.touches.length === 2) {
                e.preventDefault();
                var touch1 = e.touches[0];
                var touch2 = e.touches[1];
                initialDistance = Math.hypot(
                    touch2.pageX - touch1.pageX,
                    touch2.pageY - touch1.pageY
                );
            }
        });

        pagesWrapper.addEventListener('touchmove', function(e) {
            if (e.touches.length === 2 && initialDistance > 0) {
                e.preventDefault();
                var touch1 = e.touches[0];
                var touch2 = e.touches[1];
                var currentDistance = Math.hypot(
                    touch2.pageX - touch1.pageX,
                    touch2.pageY - touch1.pageY
                );
                var scale = currentDistance / initialDistance;
                var newScale = currentScale * scale;
                newScale = Math.min(3.0, Math.max(0.3, newScale));
                currentScale = newScale;
                pagesWrapper.style.transform = 'scale(' + newScale + ')';
            }
        });

        pagesWrapper.addEventListener('touchend', function(e) {
            if (e.touches.length < 2) {
                initialDistance = 0;
            }
        });

        // 事件处理
        function cleanup() {
            window.removeEventListener('resize', fitToScreen);
        }

        closeBtn.onclick = function() {
            cleanup();
            previewModal.remove();
        };

        cancelBtn.onclick = function() {
            cleanup();
            previewModal.remove();
        };

        previewModal.addEventListener('click', function(e) {
            if (e.target === previewModal) {
                cleanup();
                previewModal.remove();
            }
        });

        // 修改排版需求按钮
        modifyBtn.onclick = function() {
            cleanup();
            previewModal.remove();
            showAILayoutModifyDialog(description, settings);
        };

        // 打印按钮
        printBtn.onclick = function() {
            printAILayout(aiGeneratedHtml, settings);
        };

        // 下载PDF按钮
        pdfBtn.onclick = async function() {
            await downloadAILayoutAsPDF(aiGeneratedHtml, settings);
        };
    }

    // 显示修改排版需求对话框
    function showAILayoutModifyDialog(oldDescription, settings) {
        var nightMode = g('nightMode') === true;
        var bg = nightMode ? '#2d2d2d' : 'white';
        var textColor = nightMode ? '#eee' : '#333';
        var borderColor = nightMode ? '#444' : '#ddd';

        var aiModal = document.createElement('div');
        aiModal.className = 'modal-overlay';
        aiModal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:10001;';

        var modalContent = document.createElement('div');
        modalContent.style.cssText = 'background:' + bg + ';color:' + textColor + ';border-radius:12px;padding:25px;width:90%;max-width:550px;';

        var title = '<h2 style="text-align:center;margin-bottom:20px;"><i class="fas fa-edit"></i> 修改排版需求</h2>';

        var inputSection = `
            <div style="margin-bottom:15px;">
                <label style="display:block;margin-bottom:8px;font-size:14px;font-weight:bold;">新的排版需求</label>
                <textarea id="aiLayoutDescription" placeholder="用自然语言描述新的排版需求" 
                    style="width:100%;min-height:120px;padding:10px;border:1px solid ${borderColor};border-radius:6px;background:${nightMode ? '#3d3d3d' : 'white'};color:${textColor};resize:vertical;font-size:14px;box-sizing:border-box;">${oldDescription}</textarea>
            </div>
            <div style="margin-bottom:20px;">
                <label style="display:flex;align-items:center;gap:10px;cursor:pointer;">
                    <input type="checkbox" id="keepFormatSettings" checked style="width:18px;height:18px;">
                    <span style="font-size:14px;">保留已选择的格式设置</span>
                </label>
            </div>
        `;

        var actionButtons = `
            <div style="display:flex;gap:10px;">
                <button id="aiLayoutCancelBtn" style="flex:1;padding:12px;background:${nightMode ? '#555' : '#6c757d'};color:white;border:none;border-radius:6px;cursor:pointer;">取消</button>
                <button id="aiLayoutStartBtn" style="flex:2;padding:12px;font-weight:bold;background:linear-gradient(135deg, #667eea 0%, #764ba2 100%);color:white;border:none;border-radius:6px;cursor:pointer;">重新排版</button>
            </div>
        `;

        modalContent.innerHTML = title + inputSection + actionButtons;
        aiModal.appendChild(modalContent);
        document.body.appendChild(aiModal);

        // 取消按钮
        modalContent.querySelector('#aiLayoutCancelBtn').onclick = function() {
            aiModal.remove();
            showPrintDialog();
        };

        // 开始排版按钮
        modalContent.querySelector('#aiLayoutStartBtn').onclick = debounce(async function() {
            var description = modalContent.querySelector('#aiLayoutDescription').value.trim();
            var keepFormatSettings = modalContent.querySelector('#keepFormatSettings').checked;

            if (!description) {
                global.showMessage('请输入排版需求描述', 'error');
                return;
            }

            aiModal.remove();
            await startAILayout(description, keepFormatSettings, settings, null, null);
        }, 1000);

        // 点击背景关闭
        aiModal.addEventListener('click', function(e) {
            if (e.target === aiModal) {
                aiModal.remove();
                showPrintDialog();
            }
        });
    }

    // 打印AI排版内容
    function printAILayout(htmlContent, settings) {
        // 检查用户是否登录
        if (!g('currentUser')) {
            global.showMessage('请先登录后再使用云打印功能');
            if (g('showLoginModal')) {
                g('showLoginModal')();
            }
            return;
        }

        var nightMode = g('nightMode') === true;
        var username = g('currentUser').username;
        var userPassword = g('currentUser').password;

        var modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:10002;display:flex;align-items:center;justify-content:center;';

        var dialog = document.createElement('div');
        dialog.style.cssText = 'background:' + (nightMode ? '#2d2d2d' : 'white') + ';color:' + (nightMode ? '#eee' : '#333') + ';border-radius:12px;padding:25px;width:90%;max-width:500px;';

        var title = document.createElement('h3');
        title.textContent = '发送到云打印客户端';
        title.style.cssText = 'margin-top:0;margin-bottom:20px;text-align:center;';

        var statusDiv = document.createElement('div');
        statusDiv.id = 'printStatus';
        statusDiv.style.cssText = 'text-align:center;margin:20px 0;padding:15px;background:' + (nightMode ? '#3d3d3d' : '#f8f9fa') + ';border-radius:8px;';

        var statusText = document.createElement('div');
        statusText.id = 'printStatusText';
        statusText.textContent = '正在连接到打印服务器...';
        statusText.style.cssText = 'font-size:16px;margin-bottom:10px;';

        var statusDetail = document.createElement('div');
        statusDetail.id = 'printStatusDetail';
        statusDetail.textContent = '尝试连接到 wss://print.yhsun.cn';
        statusDetail.style.cssText = 'font-size:13px;color:' + (nightMode ? '#aaa' : '#666') + ';';

        statusDiv.appendChild(statusText);
        statusDiv.appendChild(statusDetail);

        var buttonContainer = document.createElement('div');
        buttonContainer.style.cssText = 'display:flex;gap:10px;margin-top:20px;';

        var cancelBtn = document.createElement('button');
        cancelBtn.textContent = '取消';
        cancelBtn.style.cssText = 'flex:1;padding:12px;background:' + (nightMode ? '#555' : '#6c757d') + ';color:white;border:none;border-radius:6px;cursor:pointer;';
        cancelBtn.onclick = function() {
            modal.remove();
        };

        buttonContainer.appendChild(cancelBtn);

        dialog.appendChild(title);
        dialog.appendChild(statusDiv);
        dialog.appendChild(buttonContainer);
        modal.appendChild(dialog);
        document.body.appendChild(modal);

        var ws = null;
        var timeout = null;

        function updateStatus(text, detail, isError) {
            statusText.textContent = text;
            statusDetail.textContent = detail;
            if (isError) {
                statusText.style.color = '#dc3545';
                statusDetail.style.color = '#dc3545';
            } else {
                statusText.style.color = nightMode ? '#eee' : '#333';
                statusDetail.style.color = nightMode ? '#aaa' : '#666';
            }
        }

        function cleanup() {
            if (ws && ws.readyState === WebSocket.OPEN) ws.close();
            if (timeout) clearTimeout(timeout);
        }

        try {
            var wsUrl = 'wss://print.yhsun.cn';
            ws = new WebSocket(wsUrl);

            timeout = setTimeout(function() {
                updateStatus('连接超时', '无法连接到打印服务器，请检查网络连接', true);
                cleanup();
            }, 5000);

            ws.onopen = async function() {
                clearTimeout(timeout);
                updateStatus('连接成功', '正在准备打印内容...');

                try {
                    var finalHtml = await convertFormulasAndChartsToImages(htmlContent);

                    var fullHtml = finalHtml;
                    if (!fullHtml.includes('<!DOCTYPE html')) {
                        fullHtml = '<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body>' + finalHtml + '</body></html>';
                    }

                    updateStatus('发送中', '正在发送到打印客户端...');

                    var printData = {
                        type: 'print_request',
                        username: username,
                        password: userPassword,
                        content: fullHtml,
                        settings: settings,
                        timestamp: new Date().toISOString(),
                        content_type: 'html'
                    };

                    ws.send(JSON.stringify(printData));
                    updateStatus('已发送', '文档已发送到打印客户端');
                } catch (error) {
                    updateStatus('准备失败', error.toString(), true);
                    cleanup();
                }
            };

            ws.onmessage = function(event) {
                try {
                    var response = JSON.parse(event.data);
                    if (response.type === 'print_queued') {
                        updateStatus('成功', '文档已加入打印队列');
                        setTimeout(function() { modal.remove(); }, 2000);
                    } else if (response.type === 'error') {
                        updateStatus('失败', response.message || '打印失败', true);
                        cleanup();
                    }
                } catch (e) {
                    console.error('响应解析错误:', e);
                }
            };

            ws.onerror = function(error) {
                clearTimeout(timeout);
                updateStatus('连接错误', '无法连接到打印服务器', true);
                cleanup();
            };

            ws.onclose = function() {
                clearTimeout(timeout);
            };
        } catch (error) {
            updateStatus('连接失败', error.toString(), true);
            cleanup();
        }
    }

    // 下载AI排版为PDF
    async function downloadAILayoutAsPDF(htmlContent, settings) {
        global.showMessage('正在准备PDF...', 'info');
        
        try {
            var finalHtml = await convertFormulasAndChartsToImages(htmlContent);
            
            var fullHtml = finalHtml;
            if (!fullHtml.includes('<!DOCTYPE html')) {
                fullHtml = '<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body>' + finalHtml + '</body></html>';
            }

            var blob = new Blob([fullHtml], { type: 'text/html' });
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = 'ai-layout-document.html';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            global.showMessage('HTML文档已下载，请使用浏览器打印功能保存为PDF', 'success');
        } catch (error) {
            console.error('下载PDF失败:', error);
            global.showMessage('下载失败: ' + error.message, 'error');
        }
    }

})(typeof window !== 'undefined' ? window : this);