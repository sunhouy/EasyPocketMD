interface ShareData {
    filename: string;
    content: string;
    mode: string;
    expires_at?: string;
    is_expired: boolean;
    share_id: string;
}

function generatePasswordForm(shareId: string): string {
    return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>输入访问密码</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
        }
        .password-container {
            background: white;
            padding: 40px;
            border-radius: 10px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            text-align: center;
            max-width: 400px;
            width: 90%;
        }
        h2 {
            color: #333;
            margin-bottom: 20px;
        }
        input[type="password"] {
            width: 100%;
            padding: 12px;
            border: 2px solid #ddd;
            border-radius: 5px;
            font-size: 16px;
            box-sizing: border-box;
            margin-bottom: 20px;
            transition: border-color 0.3s;
        }
        input[type="password"]:focus {
            border-color: #667eea;
            outline: none;
        }
        button {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            padding: 12px 30px;
            border-radius: 5px;
            font-size: 16px;
            cursor: pointer;
            transition: transform 0.2s;
            width: 100%;
        }
        button:hover {
            transform: translateY(-2px);
        }
        .error {
            color: #e74c3c;
            margin-top: 10px;
            display: none;
        }
    </style>
</head>
<body>
    <div class="password-container">
        <h2>🔒 需要访问密码</h2>
        <p>该文档已设置访问密码，请输入密码继续查看</p>
        <input type="password" id="password" placeholder="请输入访问密码">
        <div class="error" id="errorMsg">密码错误，请重试</div>
        <button onclick="submitPassword()">确认</button>
    </div>
    
    <script>
        function submitPassword() {
            const password = document.getElementById('password').value;
            const shareId = '${shareId}';
            
            if (!password) {
                showError('请输入密码');
                return;
            }
            
            // 使用POST方式提交密码
            fetch('/api/share/get', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    share_id: shareId,
                    password: password
                })
            })
            .then(response => response.json())
            .then(data => {
                if (data.code === 200) {
                    // 密码正确，跳转到查看页面
                    window.location.href = '/api/share/view?share_id=' + shareId + '&password=' + encodeURIComponent(password);
                } else {
                    showError(data.message || '密码错误');
                }
            })
            .catch(error => {
                showError('网络错误，请重试');
            });
        }
        
        function showError(message) {
            const errorEl = document.getElementById('errorMsg');
            errorEl.textContent = message;
            errorEl.style.display = 'block';
        }
        
        // 回车键提交
        document.getElementById('password').addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                submitPassword();
            }
        });
    </script>
</body>
</html>
    `;
}

function generateShareViewPage(shareData: ShareData): string {
    const filename = escapeHtml(shareData.filename);
    const content = shareData.content;
    const mode = shareData.mode;
    const isEditable = mode === 'edit';
    const expiresAt = shareData.expires_at;
    const isExpired = shareData.is_expired;
    const shareId = shareData.share_id;

    let expiryInfo = '';
    if (expiresAt) {
        const expiryDate = new Date(expiresAt).toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-');
        if (isExpired) {
            expiryInfo = `<div class='expired'>⚠️ 此分享链接已于 ${expiryDate} 过期</div>`;
        } else {
            expiryInfo = `<div class='expiry'>此分享链接将于 ${expiryDate} 过期</div>`;
        }
    }

    let editControls = '';
    if (isEditable && !isExpired) {
        editControls = `
        <div class="edit-controls">
            <button onclick="enableEdit()" id="editBtn">✏️ 编辑文档</button>
            <button onclick="saveChanges()" id="saveBtn" style="display:none">💾 保存修改</button>
            <button onclick="cancelEdit()" id="cancelBtn" style="display:none">❌ 取消</button>
        </div>
        `;
    }

    const modeText = isEditable ? '可编辑' : '仅查看';
    const isEditableJS = isEditable ? 'true' : 'false';
    const isExpiredJS = isExpired ? 'true' : 'false';
    const contentJS = JSON.stringify(content);

    return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>${filename} - 文档分享</title>
    <link rel="stylesheet" href="../css/styles.css" />
    <link rel="stylesheet" href="../vditor@3.11.2/dist/index.css" />
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
            background: #f6f8fa;
            color: #24292e;
            line-height: 1.6;
        }
        .header {
            background: white;
            border-bottom: 1px solid #e1e4e8;
            padding: 16px 24px;
            position: sticky;
            top: 0;
            z-index: 100;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        .header-content {
            max-width: 1200px;
            margin: 0 auto;
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 16px;
        }
        .title {
            font-size: 18px;
            font-weight: 600;
            color: #24292e;
        }
        .title span {
            color: #6a737d;
            font-size: 14px;
        }
        .mode-badge {
            display: inline-block;
            padding: 4px 8px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: 600;
            margin-left: 8px;
        }
        .mode-view {
            background: #f1f8ff;
            color: #0366d6;
        }
        .mode-edit {
            background: #dcffe4;
            color: #28a745;
        }
        .info-box {
            font-size: 14px;
            color: #6a737d;
            background: #f6f8fa;
            border-radius: 6px;
            padding: 8px 12px;
            border: 1px solid #e1e4e8;
        }
        .info-box .expired {
            color: #cf222e;
            font-weight: 500;
        }
        .info-box .expiry {
            color: #0969da;
        }
        .edit-controls {
            display: flex;
            gap: 8px;
        }
        button {
            padding: 8px 16px;
            border: 1px solid #d1d9e0;
            border-radius: 6px;
            background: white;
            color: #24292e;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s;
            display: flex;
            align-items: center;
            gap: 6px;
        }
        button:hover {
            background: #f6f8fa;
            border-color: #8b949e;
        }
        button:active {
            background: #ebf0f4;
        }
        #saveBtn {
            background: #2da44e;
            color: white;
            border-color: #2da44e;
        }
        #saveBtn:hover {
            background: #2c974b;
            border-color: #2c974b;
        }
        #cancelBtn {
            background: #f6f8fa;
            color: #cf222e;
            border-color: #d1d9e0;
        }
        .container {
            max-width: 1200px;
            margin: 24px auto;
            padding: 0 24px;
        }
        .markdown-body {
            background: white;
            border: 1px solid #e1e4e8;
            border-radius: 6px;
            padding: 32px;
            min-height: 400px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        #vditor {
            height: 600px;
            border: 1px solid #e1e4e8;
            border-radius: 6px;
            display: none;
        }
        .toast {
            position: fixed;
            bottom: 24px;
            right: 24px;
            padding: 12px 24px;
            border-radius: 6px;
            background: #24292e;
            color: white;
            font-size: 14px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            transform: translateY(100px);
            opacity: 0;
            transition: all 0.3s;
        }
        .toast.show {
            transform: translateY(0);
            opacity: 1;
        }
        .toast.success {
            background: #2da44e;
        }
        .toast.error {
            background: #cf222e;
        }
        @media (max-width: 768px) {
            .header-content {
                flex-direction: column;
                align-items: flex-start;
            }
            .edit-controls {
                width: 100%;
                justify-content: flex-start;
            }
            .container {
                padding: 0 16px;
            }
            #vditor {
                height: 500px;
            }
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="header-content">
            <div class="title">
                ${filename}
                <span class="mode-badge mode-${mode}">
                    ${modeText}
                </span>
            </div>
            <div class="info-box">
                ${expiryInfo}
            </div>
            ${editControls}
        </div>
    </div>
    
    <div class="container">
        <div id="viewer" class="markdown-body">
            <!-- Markdown内容将通过JavaScript渲染 -->
        </div>
        <div id="vditor"></div>
    </div>
    
    <div id="toast" class="toast"></div>
    
    <!-- 加载Vditor资源 -->
    <script src="../vditor@3.11.2/dist/index.min.js"></script>
    <script>
        // 初始化变量
        let originalContent = ${contentJS};
        let isEditing = false;
        let shareId = '${shareId}';
        let isEditable = ${isEditableJS};
        let isExpired = ${isExpiredJS};
        let vditor = null; // 全局声明vditor变量
        
        // 初始化页面
        document.addEventListener('DOMContentLoaded', async function() {
            // 渲染Markdown
            await renderMarkdown(originalContent);
            
            // 如果已过期且可编辑，禁用编辑功能
            if (isExpired && isEditable) {
                const editBtn = document.getElementById('editBtn');
                if (editBtn) {
                    editBtn.disabled = true;
                    editBtn.innerHTML = '⏰ 链接已过期';
                    editBtn.style.opacity = '0.6';
                    editBtn.style.cursor = 'not-allowed';
                }
            }
        });
        
        // 渲染Markdown内容
        async function renderMarkdown(content) {
            const viewer = document.getElementById('viewer');
            try {
                // 使用Vditor的HTML渲染能力（处理Promise返回值）
                const html = await Vditor.md2html(content, {
                    mark: true,
                    footnotes: true,
                    toc: true,
                    autoSpace: true,
                    code: {
                        highlight: true
                    },
                    math: {
                        engine: 'KaTeX'
                    },
                    emoji: {
                        enable: true
                    },
                    mermaid: {
                        enable: true
                    }
                });
                viewer.innerHTML = html;
                
                // 手动渲染mermaid图表
                if (window.mermaid) {
                    mermaid.init();
                }
            } catch (error) {
                console.error('渲染Markdown失败:', error);
                viewer.innerHTML = '<p style="color: red;">渲染失败，请刷新页面重试</p>';
            }
        }
        
        // 启用编辑模式
        function enableEdit() {
            if (isExpired) {
                showToast('分享链接已过期，无法编辑', 'error');
                return;
            }
            
            isEditing = true;
            document.getElementById('viewer').style.display = 'none';
            document.getElementById('vditor').style.display = 'block';
            document.getElementById('editBtn').style.display = 'none';
            document.getElementById('saveBtn').style.display = 'flex';
            document.getElementById('cancelBtn').style.display = 'flex';
            
            // 初始化Vditor编辑器
            initVditor(originalContent);
        }
        
        // 初始化Vditor
        function initVditor(content) {
            try {
                if (vditor) {
                    // 安全销毁Vditor实例
                    if (typeof vditor.destroy === 'function') {
                        vditor.destroy();
                    }
                    vditor = null;
                }
                
                vditor = new Vditor('vditor', {
                    height: '100%',
                    width: '100%',
                    placeholder: '开始编辑...支持 Markdown 语法',
                    toolbar: [],
                    customWysiwygToolbar: undefined,
                    theme: 'classic',
                    mode: 'ir',
                    cache: { enable: false },
                    outline: { enable: false },
                    hint: { emoji: {} },
                    value: content,
                    math: {
                        engine: 'KaTeX'
                    },
                    mermaid: {
                        enable: true
                    },
                    after: function() {
                        // 编辑器初始化完成
                    }
                });
            } catch (error) {
                console.error('初始化Vditor失败:', error);
                showToast('编辑器初始化失败，请刷新页面重试', 'error');
            }
        }
        
        // 取消编辑
        function cancelEdit() {
            isEditing = false;
            document.getElementById('viewer').style.display = 'block';
            document.getElementById('vditor').style.display = 'none';
            document.getElementById('editBtn').style.display = 'flex';
            document.getElementById('saveBtn').style.display = 'none';
            document.getElementById('cancelBtn').style.display = 'none';
            
            // 销毁Vditor实例
            try {
                if (vditor) {
                    // 安全销毁Vditor实例
                    if (typeof vditor.destroy === 'function') {
                        vditor.destroy();
                    }
                    vditor = null;
                }
            } catch (error) {
                console.error('销毁Vditor失败:', error);
            }
        }
        
        // 保存修改
        function saveChanges() {
            if (isExpired) {
                showToast('分享链接已过期，无法保存', 'error');
                return;
            }
            
            const newContent = vditor.getValue();
            
            // 获取密码（如果有）
            const urlParams = new URLSearchParams(window.location.search);
            const password = urlParams.get('password');
            
            // 发送更新请求
            fetch('/api/share/update', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    share_id: shareId,
                    content: newContent,
                    password: password
                })
            })
            .then(response => response.json())
            .then(async data => {
                if (data.code === 200) {
                    // 更新成功
                    originalContent = newContent;
                    await renderMarkdown(newContent);
                    cancelEdit();
                    showToast('文档更新成功', 'success');
                } else {
                    showToast('保存失败: ' + data.message, 'error');
                }
            })
            .catch(error => {
                showToast('网络错误，请重试', 'error');
            });
        }
        
        // 显示提示消息
        function showToast(message, type = 'info') {
            const toast = document.getElementById('toast');
            toast.textContent = message;
            toast.className = 'toast ' + type;
            toast.classList.add('show');
            
            setTimeout(() => {
                toast.classList.remove('show');
            }, 3000);
        }
        
        // 复制分享链接
        function copyShareLink() {
            const url = window.location.origin + '/api/share/view?share_id=' + shareId;
            navigator.clipboard.writeText(url)
                .then(() => showToast('链接已复制到剪贴板', 'success'))
                .catch(() => showToast('复制失败，请手动复制', 'error'));
        }
    </script>
</body>
</html>
    `;
}

function escapeHtml(text: string): string {
    if (!text) return '';
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

export {
    generatePasswordForm,
    generateShareViewPage
};
