(function(global) {
    'use strict';

    function g(name) { return global[name]; }

    function formatSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    async function showFileManager() {
        if (!g('currentUser')) {
            global.showMessage('请先登录', 'error');
            return;
        }

        const nightMode = g('nightMode') === true;
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:10005;';

        const bg = nightMode ? '#2d2d2d' : 'white';
        const textColor = nightMode ? '#eee' : '#333';
        const borderColor = nightMode ? '#444' : '#ddd';

        const content = document.createElement('div');
        content.style.cssText = `background:${bg};color:${textColor};border-radius:12px;padding:25px;width:90%;max-width:800px;max-height:85vh;display:flex;flex-direction:column;position:relative;`;

        // Close button
        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '<i class="fas fa-times"></i>';
        closeBtn.style.cssText = `position:absolute;top:15px;right:15px;background:none;border:none;color:${textColor};font-size:20px;cursor:pointer;`;
        closeBtn.onclick = () => modal.remove();
        content.appendChild(closeBtn);

        // Header
        const header = document.createElement('h2');
        header.textContent = '我的文件';
        header.style.cssText = 'margin-top:0;margin-bottom:20px;text-align:center;';
        content.appendChild(header);

        // Usage Info
        const usageInfo = document.createElement('div');
        usageInfo.style.cssText = `margin-bottom:20px;padding:15px;background:${nightMode ? '#3d3d3d' : '#f8f9fa'};border-radius:8px;text-align:center;`;
        usageInfo.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 正在加载...';
        content.appendChild(usageInfo);

        // File List
        const fileListContainer = document.createElement('div');
        fileListContainer.style.cssText = 'flex:1;overflow-y:auto;min-height:200px;border:1px solid ' + borderColor + ';border-radius:8px;padding:10px;';
        content.appendChild(fileListContainer);

        modal.appendChild(content);
        document.body.appendChild(modal);

        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });

        // Fetch Data
        try {
            const response = await fetch('api/user_files/list', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: g('currentUser').username,
                    password: g('currentUser').password
                })
            });
            const result = await response.json();

            if (result.code === 200) {
                // Update Usage
                usageInfo.innerHTML = `
                    <div style="font-size:16px;margin-bottom:5px;">已用空间: <strong>${formatSize(result.totalSize)}</strong></div>
                    <div style="font-size:12px;color:${nightMode ? '#aaa' : '#666'};">共 ${result.data.length} 个文件</div>
                `;

                // Render Files
                if (result.data.length === 0) {
                    fileListContainer.innerHTML = `<div style="text-align:center;padding:40px;color:${nightMode ? '#aaa' : '#666'};">暂无文件</div>`;
                } else {
                    const list = document.createElement('div');
                    list.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill, minmax(100px, 1fr));gap:10px;';
                    
                    result.data.forEach(file => {
                        const item = document.createElement('div');
                        item.style.cssText = `border:1px solid ${borderColor};border-radius:6px;padding:8px;position:relative;display:flex;flex-direction:column;align-items:center;transition:all 0.2s;`;
                        item.onmouseover = () => item.style.borderColor = '#2196F3';
                        item.onmouseout = () => item.style.borderColor = borderColor;

                        // Display name logic: remove timestamp prefix (digits + underscore)
                        const displayName = file.name.replace(/^\d+_/, '');

                        // Preview
                        let preview = '';
                        if (/\.(jpg|jpeg|png|gif|webp|svg)$/i.test(file.name)) {
                            preview = `<div style="width:100%;height:80px;background-image:url('${file.thumbUrl || file.url}');background-size:contain;background-repeat:no-repeat;background-position:center;border-radius:4px;margin-bottom:5px;"></div>`;
                        } else {
                            preview = `<div style="width:100%;height:80px;display:flex;align-items:center;justify-content:center;background:${nightMode ? '#444' : '#eee'};border-radius:4px;margin-bottom:5px;"><i class="fas fa-file" style="font-size:32px;color:#999;"></i></div>`;
                        }

                        item.innerHTML = `
                            ${preview}
                            <div style="font-size:12px;width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:center;margin-bottom:2px;" title="${displayName}">${displayName}</div>
                            <div style="font-size:10px;color:${nightMode ? '#aaa' : '#666'};">${formatSize(file.size)}</div>
                            <div style="display:flex;gap:5px;margin-top:5px;width:100%;">
                                <button class="copy-btn" style="flex:1;background:#2196F3;color:white;border:none;border-radius:3px;padding:2px;font-size:10px;cursor:pointer;">复制</button>
                                <button class="del-btn" style="flex:1;background:#dc3545;color:white;border:none;border-radius:3px;padding:2px;font-size:10px;cursor:pointer;">删除</button>
                            </div>
                        `;

                        // Events
                        const copyBtn = item.querySelector('.copy-btn');
                        copyBtn.onclick = () => {
                            let link = file.url;
                            if (/\.(jpg|jpeg|png|gif|webp|svg)$/i.test(file.name)) {
                                link = `![${displayName}](${file.url})`;
                            } else {
                                link = `[${displayName}](${file.url})`;
                            }
                            navigator.clipboard.writeText(link).then(() => {
                                global.showMessage('链接已复制', 'success');
                            });
                        };

                        const delBtn = item.querySelector('.del-btn');
                        delBtn.onclick = async () => {
                            if (confirm(`确定要删除 ${displayName} 吗？`)) {
                                try {
                                    const delRes = await fetch('api/user_files/delete', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({
                                            username: g('currentUser').username,
                                            password: g('currentUser').password,
                                            filename: file.name
                                        })
                                    });
                                    const delResult = await delRes.json();
                                    if (delResult.code === 200) {
                                        item.remove();
                                        global.showMessage('删除成功', 'success');
                                        // Update usage visually if needed, or just let it be until refresh
                                    } else {
                                        global.showMessage(delResult.message || '删除失败', 'error');
                                    }
                                } catch (err) {
                                    global.showMessage('网络错误', 'error');
                                }
                            }
                        };

                        list.appendChild(item);
                    });
                    fileListContainer.appendChild(list);
                }
            } else {
                usageInfo.innerHTML = `<span style="color:#dc3545;">加载失败: ${result.message}</span>`;
            }
        } catch (err) {
            console.error(err);
            usageInfo.innerHTML = `<span style="color:#dc3545;">加载出错</span>`;
        }
    }

    global.showFileManager = showFileManager;

})(typeof window !== 'undefined' ? window : this);