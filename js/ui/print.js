
import { generatePDF, renderPDF } from './pdf-generator.js';

const global = window;

function g(name) { return global[name]; }

    function showDownloadClientModal() {
        var nightMode = g('nightMode') === true;
        var modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:10005;';

        var bg = nightMode ? '#2d2d2d' : 'white';
        var textColor = nightMode ? '#eee' : '#333';
        var borderColor = nightMode ? '#444' : '#ddd';
        
        var content = document.createElement('div');
        content.style.cssText = 'background:' + bg + ';color:' + textColor + ';border-radius:12px;padding:25px;width:90%;max-width:500px;max-height:85vh;overflow-y:auto;position:relative;box-shadow:0 4px 12px rgba(0,0,0,0.15);';

        var closeBtn = document.createElement('button');
        closeBtn.innerHTML = '<i class="fas fa-times"></i>';
        closeBtn.style.cssText = 'position:absolute;top:15px;right:15px;background:none;border:none;color:' + textColor + ';font-size:18px;cursor:pointer;opacity:0.7;padding:5px;';
        closeBtn.onclick = function() { modal.remove(); };
        content.appendChild(closeBtn);

        var title = document.createElement('h3');
        title.textContent = '下载打印客户端';
        title.style.cssText = 'margin-top:0;margin-bottom:20px;text-align:center;font-size:18px;';
        content.appendChild(title);

        var ua = navigator.userAgent;
        var isWin = ua.indexOf('Win') !== -1;
        var isMac = ua.indexOf('Mac') !== -1;
        var isLinux = ua.indexOf('Linux') !== -1 && ua.indexOf('Android') === -1;

        // Fallback if none detected or specific override needed
        if (!isWin && !isMac && !isLinux) {
            isWin = true; // Default to Windows recommendation
        }

        function createSection(osName, isRecommended, links) {
            var section = document.createElement('div');
            var recStyle = isRecommended ? 'border:2px solid #2196F3;background:' + (nightMode ? 'rgba(33, 150, 243, 0.15)' : 'rgba(33, 150, 243, 0.05)') : 'border:1px solid ' + borderColor;
            section.style.cssText = 'margin-bottom:15px;padding:15px;border-radius:8px;' + recStyle + ';transition:all 0.2s;';
            
            var headerHtml = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">' +
                '<span style="font-weight:bold;font-size:16px;">' + osName + '</span>' + 
                (isRecommended ? '<span style="font-size:12px;background:#2196F3;color:white;padding:2px 8px;border-radius:4px;">推荐 (当前系统)</span>' : '') +
                '</div>';
            
            var linksHtml = '<div style="display:flex;flex-wrap:wrap;gap:10px;">';
            links.forEach(function(link) {
                var btnBg = nightMode ? '#444' : '#f0f0f0';
                var btnHover = nightMode ? '#555' : '#e0e0e0';
                linksHtml += `<a href="${link.url}" target="_blank" class="download-link-btn" style="display:flex;align-items:center;padding:8px 12px;background:${btnBg};color:${textColor};text-decoration:none;border-radius:4px;font-size:14px;transition:background 0.2s;" onmouseover="this.style.background='${btnHover}'" onmouseout="this.style.background='${btnBg}'">` +
                    `<i class="fas fa-download" style="margin-right:6px;"></i>${link.name}</a>`;
            });
            linksHtml += '</div>';

            section.innerHTML = headerHtml + linksHtml;
            return section;
        }

        // Order based on recommendation
        var sections = [];
        
        var winSection = createSection('Windows', isWin, [
            { name: '下载Windows版本', url: 'https://static.yhsun.cn/print_client_windows.exe' }
        ]);
        
        var linuxSection = createSection('Linux', isLinux, [
            { name: 'print_client_linux', url: 'https://static.yhsun.cn/print_client_linux' }
        ]);
        
        var macSection = createSection('macOS', isMac, [
            { name: 'print_client_macos', url: 'https://static.yhsun.cn/print_client_macos' }
        ]);

        if (isWin) {
            content.appendChild(winSection);
            content.appendChild(macSection);
            content.appendChild(linuxSection);
        } else if (isMac) {
            content.appendChild(macSection);
            content.appendChild(winSection);
            content.appendChild(linuxSection);
        } else {
            content.appendChild(linuxSection);
            content.appendChild(winSection);
            content.appendChild(macSection);
        }

        modal.appendChild(content);
        document.body.appendChild(modal);

        modal.addEventListener('click', function(e) {
            if (e.target === modal) modal.remove();
        });
    }

    function showPrintDialog(mode, callback) {
        // Default mode is 'print'
        mode = mode || 'print';
        
        // 检查用户是否登录
        if (!g('currentUser')) {
            global.showMessage('请先登录后再使用此功能');
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

        var dialogTitle = '云打印设置';
        if (mode === 'export-pdf') dialogTitle = '导出 PDF 设置';
        if (mode === 'export-html') dialogTitle = '导出 HTML 设置';
        
        var title = '<h2 style="text-align:center;margin-bottom:20px;">' + dialogTitle + '</h2>';

        // AI智能排版按钮区域 (仅在打印模式显示)
        var aiSection = '';
        if (mode === 'print') {
            aiSection = `
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
        }

        var downloadLink = '<a href="javascript:void(0)" id="downloadClientBtn" style="color:#4a90e2;cursor:pointer;text-decoration:underline;">点击下载打印客户端</a>';

        // 客户端连接状态区域 (仅在打印模式显示)
        var statusSection = '';
        if (mode === 'print') {
            statusSection = `
                <div style="margin-bottom:20px;padding:15px;background:` + (nightMode ? '#3d3d3d' : '#f8f9fa') + `;border-radius:8px;">
                    <h3 style="margin-top:0;margin-bottom:10px;">打印客户端状态</h3>
                    <div id="clientStatus" style="display:flex;align-items:center;gap:10px;">
                        <div id="statusIndicator" style="width:12px;height:12px;border-radius:50%;background:#dc3545;"></div>
                        <span id="statusText" style="font-size:14px;">请连接打印客户端</span>
                    </div>
                    <p style="margin-top:10px;font-size:14px;color:` + (nightMode ? '#aaa' : '#666') + `;">` + downloadLink + `</p>
                </div>
            `;
        }

        var settingsSection = `
            <div style="margin-bottom:20px;">
                <h3 style="margin-top:0;margin-bottom:15px;">基础设置</h3>
                <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(200px, 1fr));gap:15px;">
                    <div>
                        <label style="display:block;margin-bottom:5px;font-size:14px;">基础标题字号 (H4)</label>
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

            <!-- Advanced Heading Settings -->
            <div style="margin-bottom:20px;border-top:1px solid ${borderColor};padding-top:15px;">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;cursor:pointer;" onclick="var el = this.nextElementSibling; el.style.display = el.style.display === 'none' ? 'block' : 'none'; this.querySelector('i').classList.toggle('fa-chevron-down'); this.querySelector('i').classList.toggle('fa-chevron-right');">
                    <h3 style="margin:0;font-size:16px;">高级标题字号设置</h3>
                    <i class="fas fa-chevron-right" style="font-size:14px;color:${nightMode ? '#aaa' : '#666'};"></i>
                </div>
                <div id="advancedHeadingSettings" style="display:none;">
                    <div style="margin-bottom:15px;">
                        <label style="display:flex;align-items:center;gap:10px;cursor:pointer;margin-bottom:10px;">
                            <input type="checkbox" id="useCustomHeadingSizes" style="width:16px;height:16px;">
                            <span style="font-size:14px;">启用自定义标题字号</span>
                        </label>
                    </div>
                    <div id="customHeadingInputs" style="display:grid;grid-template-columns:repeat(3, 1fr);gap:15px;opacity:0.5;pointer-events:none;transition:opacity 0.2s;">
                        <div>
                            <label style="display:block;margin-bottom:5px;font-size:12px;">H1 字号 (pt)</label>
                            <input type="number" id="h1Size" value="36" style="width:100%;padding:6px;border:1px solid ${borderColor};border-radius:4px;background:${nightMode ? '#3d3d3d' : 'white'};color:${textColor};">
                        </div>
                        <div>
                            <label style="display:block;margin-bottom:5px;font-size:12px;">H2 字号 (pt)</label>
                            <input type="number" id="h2Size" value="31" style="width:100%;padding:6px;border:1px solid ${borderColor};border-radius:4px;background:${nightMode ? '#3d3d3d' : 'white'};color:${textColor};">
                        </div>
                        <div>
                            <label style="display:block;margin-bottom:5px;font-size:12px;">H3 字号 (pt)</label>
                            <input type="number" id="h3Size" value="26" style="width:100%;padding:6px;border:1px solid ${borderColor};border-radius:4px;background:${nightMode ? '#3d3d3d' : 'white'};color:${textColor};">
                        </div>
                        <div>
                            <label style="display:block;margin-bottom:5px;font-size:12px;">H4 字号 (pt)</label>
                            <input type="number" id="h4Size" value="24" style="width:100%;padding:6px;border:1px solid ${borderColor};border-radius:4px;background:${nightMode ? '#3d3d3d' : 'white'};color:${textColor};">
                        </div>
                        <div>
                            <label style="display:block;margin-bottom:5px;font-size:12px;">H5 字号 (pt)</label>
                            <input type="number" id="h5Size" value="21" style="width:100%;padding:6px;border:1px solid ${borderColor};border-radius:4px;background:${nightMode ? '#3d3d3d' : 'white'};color:${textColor};">
                        </div>
                        <div>
                            <label style="display:block;margin-bottom:5px;font-size:12px;">H6 字号 (pt)</label>
                            <input type="number" id="h6Size" value="19" style="width:100%;padding:6px;border:1px solid ${borderColor};border-radius:4px;background:${nightMode ? '#3d3d3d' : 'white'};color:${textColor};">
                        </div>
                        <div style="grid-column:1/-1;margin-top:10px;display:flex;align-items:center;gap:10px;">
                            <label style="font-size:12px;">快速设置递减量 (pt):</label>
                            <input type="number" id="headingStep" value="4" style="width:60px;padding:4px;border:1px solid ${borderColor};border-radius:4px;">
                            <button id="applyHeadingStep" style="padding:4px 8px;font-size:12px;background:#4a90e2;color:white;border:none;border-radius:4px;cursor:pointer;">应用递减</button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Image Settings -->
            <div style="margin-bottom:20px;border-top:1px solid ${borderColor};padding-top:15px;">
                 <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;cursor:pointer;" onclick="var el = this.nextElementSibling; el.style.display = el.style.display === 'none' ? 'block' : 'none'; this.querySelector('i').classList.toggle('fa-chevron-down'); this.querySelector('i').classList.toggle('fa-chevron-right');">
                    <h3 style="margin:0;font-size:16px;">图片设置</h3>
                    <i class="fas fa-chevron-right" style="font-size:14px;color:${nightMode ? '#aaa' : '#666'};"></i>
                </div>
                <div id="imageSettings" style="display:none;grid-template-columns:1fr 1fr;gap:15px;">
                    <div>
                        <label style="display:block;margin-bottom:5px;font-size:14px;">图片宽度</label>
                        <input type="text" id="imgWidth" value="100%" placeholder="如 100%, 300px" style="width:100%;padding:8px;border:1px solid ${borderColor};border-radius:6px;background:${nightMode ? '#3d3d3d' : 'white'};color:${textColor};">
                    </div>
                    <div>
                        <label style="display:block;margin-bottom:5px;font-size:14px;">图片高度</label>
                        <input type="text" id="imgHeight" value="auto" placeholder="如 auto, 200px" style="width:100%;padding:8px;border:1px solid ${borderColor};border-radius:6px;background:${nightMode ? '#3d3d3d' : 'white'};color:${textColor};">
                    </div>
                </div>
            </div>
        `;

        var actionButtons = '';
        if (mode === 'print') {
            actionButtons = `
                <div style="display:flex;gap:10px;margin-top:20px;">
                    <button id="printPreviewBtn" style="flex:1;padding:12px;font-weight:bold;background:#4CAF50;color:white;border:none;border-radius:6px;cursor:pointer;">预览</button>
                    <button id="printSendBtn" style="flex:1;padding:12px;font-weight:bold;background:#2196F3;color:white;border:none;border-radius:6px;cursor:pointer;">发送打印</button>
                    <button id="printCancelBtn" style="flex:1;padding:12px;background:` + (nightMode ? '#555' : '#9E9E9E') + `;color:white;border:none;border-radius:6px;cursor:pointer;">取消</button>
                </div>
            `;
        } else {
            var actionName = mode === 'export-pdf' ? '导出 PDF' : '导出 HTML';
            actionButtons = `
                <div style="display:flex;gap:10px;margin-top:20px;">
                    <button id="confirmExportBtn" style="flex:1;padding:12px;font-weight:bold;background:#2196F3;color:white;border:none;border-radius:6px;cursor:pointer;">${actionName}</button>
                    <button id="printCancelBtn" style="flex:1;padding:12px;background:` + (nightMode ? '#555' : '#9E9E9E') + `;color:white;border:none;border-radius:6px;cursor:pointer;">取消</button>
                </div>
            `;
        }

        modalContent.innerHTML = title + aiSection + statusSection + settingsSection + actionButtons;
        printModal.appendChild(modalContent);
        document.body.appendChild(printModal);

        // --- Event Listeners for New Settings ---
        
        // Custom Heading Sizes Toggle
        var useCustomHeadingSizes = modalContent.querySelector('#useCustomHeadingSizes');
        var customHeadingInputs = modalContent.querySelector('#customHeadingInputs');
        if (useCustomHeadingSizes) {
            useCustomHeadingSizes.onchange = function() {
                if (this.checked) {
                    customHeadingInputs.style.opacity = '1';
                    customHeadingInputs.style.pointerEvents = 'auto';
                } else {
                    customHeadingInputs.style.opacity = '0.5';
                    customHeadingInputs.style.pointerEvents = 'none';
                    // Re-sync with base title size logic if unchecked? 
                    // No, let's leave values as is, just disabled.
                }
            };
        }

        // Apply Heading Step
        var applyHeadingStep = modalContent.querySelector('#applyHeadingStep');
        if (applyHeadingStep) {
            applyHeadingStep.onclick = function() {
                var h1 = parseFloat(modalContent.querySelector('#h1Size').value) || 36;
                var step = parseFloat(modalContent.querySelector('#headingStep').value) || 4;
                
                modalContent.querySelector('#h2Size').value = Math.max(1, h1 - step);
                modalContent.querySelector('#h3Size').value = Math.max(1, h1 - step * 2);
                modalContent.querySelector('#h4Size').value = Math.max(1, h1 - step * 3);
                modalContent.querySelector('#h5Size').value = Math.max(1, h1 - step * 4);
                modalContent.querySelector('#h6Size').value = Math.max(1, h1 - step * 5);
            };
        }

        // Download client button event
        var downloadClientBtn = modalContent.querySelector('#downloadClientBtn');
        if (downloadClientBtn) {
            downloadClientBtn.onclick = function() {
                showDownloadClientModal();
            };
        }

        // Connect to WebSocket only if in print mode
        if (mode === 'print') {
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

        // 预览和发送按钮也需要关闭连接
        var previewBtn = modalContent.querySelector('#printPreviewBtn');
        if (previewBtn) {
            previewBtn.onclick = global.debounce(async function() {
                cleanup();
                await showPrintPreview(getPrintSettings(modalContent));
            }, 500);
        }

        var sendBtn = modalContent.querySelector('#printSendBtn');
        if (sendBtn) {
            sendBtn.onclick = global.debounce(function() {
                cleanup();
                sendToPrint(getPrintSettings(modalContent));
            }, 500);
        }

        // 上传文件打印按钮事件
        var printFileBtn = modalContent.querySelector('#printFileBtn');
        if (printFileBtn) {
            // 移除水波纹效果
            printFileBtn.onclick = global.debounce(function() {
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
                var response = await fetch('api/external/upload', {
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
                    global.showMessage('网络未连接，请连接网络', 'error');
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
                var response = await fetch('api/external/upload', {
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
                global.showMessage('网络未连接，请连接网络', 'error');
                reject(error);
                ws.close();
            };

                ws.onclose = function() {
                    clearTimeout(timeout);
                };
            });
        }

        } // End of if (mode === 'print')

        // 取消按钮逻辑 (所有模式通用)
        var cancelBtn = modalContent.querySelector('#printCancelBtn');
        if (cancelBtn) {
            cancelBtn.onclick = function() {
                if (typeof cleanup === 'function') cleanup();
                printModal.remove();
            };
        }

        // 打印模态框点击外部关闭时也需要清除定时器
        printModal.addEventListener('click', function(e) {
            if (e.target === printModal) {
                if (typeof cleanup === 'function') cleanup();
                printModal.remove();
            }
        });

        // Export Button Logic
        var confirmExportBtn = modalContent.querySelector('#confirmExportBtn');
        if (confirmExportBtn) {
            confirmExportBtn.onclick = function() {
                if (callback) {
                    var settings = getPrintSettings(modalContent);
                    printModal.remove();
                    callback(settings);
                }
            };
        }

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
                if (global.showAILayoutDialog) {
                    global.showAILayoutDialog(modalContent, cleanup, printModal);
                } else {
                    console.error('AI Layout module not loaded');
                }
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
            indentParagraph: modalContent.querySelector('#indentParagraph').checked,
            // New settings
            useCustomHeadingSizes: modalContent.querySelector('#useCustomHeadingSizes') ? modalContent.querySelector('#useCustomHeadingSizes').checked : false,
            h1Size: modalContent.querySelector('#h1Size') ? modalContent.querySelector('#h1Size').value : 36,
            h2Size: modalContent.querySelector('#h2Size') ? modalContent.querySelector('#h2Size').value : 31,
            h3Size: modalContent.querySelector('#h3Size') ? modalContent.querySelector('#h3Size').value : 26,
            h4Size: modalContent.querySelector('#h4Size') ? modalContent.querySelector('#h4Size').value : 24,
            h5Size: modalContent.querySelector('#h5Size') ? modalContent.querySelector('#h5Size').value : 21,
            h6Size: modalContent.querySelector('#h6Size') ? modalContent.querySelector('#h6Size').value : 19,
            imgWidth: modalContent.querySelector('#imgWidth') ? modalContent.querySelector('#imgWidth').value : '100%',
            imgHeight: modalContent.querySelector('#imgHeight') ? modalContent.querySelector('#imgHeight').value : 'auto'
        };
    }

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

        // Calculate heading sizes
        var headingSizes = {};
        if (settings.useCustomHeadingSizes) {
            headingSizes = {
                1: parseInt(settings.h1Size) * scale,
                2: parseInt(settings.h2Size) * scale,
                3: parseInt(settings.h3Size) * scale,
                4: parseInt(settings.h4Size) * scale,
                5: parseInt(settings.h5Size) * scale,
                6: parseInt(settings.h6Size) * scale
            };
        } else {
            headingSizes = {
                1: titleFontSize * 1.5,
                2: titleFontSize * 1.3,
                3: titleFontSize * 1.1,
                4: titleFontSize,
                5: titleFontSize * 0.9,
                6: titleFontSize * 0.8
            };
        }

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
                html += global.escapeHtml(line) + '\n';
                continue;
            }

            if (line.trim() === '') {
                if (inTable) {
                    html += global.generateTableHtml(tableHeaders, tableRows, alignment);
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
                html += global.generateTableHtml(tableHeaders, tableRows, alignment);
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
                var imgStyle = 'max-width:' + (settings.imgWidth || '100%') + ';height:' + (settings.imgHeight || 'auto') + ';';
                html += '<div style="text-align:center;margin:1em 0;"><img src="' + imgUrl + '" alt="' + altText + '" style="' + imgStyle + '"></div>';
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
                var currentHeadingSize = headingSizes[level];
                html += '<h' + level + ' style="text-align:' + titleAlignment + ';font-size:' + currentHeadingSize + 'pt;margin-top:' + titleSpacing + 'em;margin-bottom:' + titleSpacing + 'em;line-height:' + lineHeight + ';">' + titleText + '</h' + level + '>';
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
            html += global.generateTableHtml(tableHeaders, tableRows, alignment);
        }

        // 处理未关闭的公式块
        if (inFormulaBlock) {
            var formula = formulaBuffer.join('\n');
            html += '<div style="text-align:center;margin:1em 0;">\\[' + formula + '\\]</div>';
        }

        return html;
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

        // Calculate heading sizes for CSS
        var h1Size, h2Size, h3Size, h4Size, h5Size, h6Size;
        if (settings.useCustomHeadingSizes) {
            h1Size = parseInt(settings.h1Size) * scale;
            h2Size = parseInt(settings.h2Size) * scale;
            h3Size = parseInt(settings.h3Size) * scale;
            h4Size = parseInt(settings.h4Size) * scale;
            h5Size = parseInt(settings.h5Size) * scale;
            h6Size = parseInt(settings.h6Size) * scale;
        } else {
            h1Size = titleFontSize * 1.5;
            h2Size = titleFontSize * 1.3;
            h3Size = titleFontSize * 1.1;
            h4Size = titleFontSize;
            h5Size = titleFontSize * 0.9;
            h6Size = titleFontSize * 0.8;
        }

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
            h1 { font-size: ${h1Size}pt; }
            h2 { font-size: ${h2Size}pt; }
            h3 { font-size: ${h3Size}pt; }
            h4 { font-size: ${h4Size}pt; }
            h5 { font-size: ${h5Size}pt; }
            h6 { font-size: ${h6Size}pt; }
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
                max-width: ${settings.imgWidth || '100%'};
                height: ${settings.imgHeight || 'auto'};
                margin: 1em 0;
            }
            .mermaid-chart {
                margin: 1em 0;
                text-align: center;
            }
            .katex {
                margin: 1em 0;
            }
            .katex-mathml {
                display: none !important;
                position: absolute;
                clip: rect(1px, 1px, 1px, 1px);
                padding: 0;
                border: 0;
                height: 1px;
                width: 1px;
                overflow: hidden;
            }
            @media print {
                body { -webkit-print-color-adjust: exact; }
                ${settings.fitToPage ? '@page { size: auto; margin: 5mm; }' : ''}
            }
        `;
    }

    async function downloadAsPDF(content, settings) {
        // 显示加载状态
        var nightMode = g('nightMode') === true;
        var loadingModal = document.createElement('div');
        loadingModal.className = 'modal-overlay';
        loadingModal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.9);z-index:21000;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;';
        loadingModal.innerHTML = '<div style="background:' + (nightMode ? '#2d2d2d' : 'white') + ';color:' + (nightMode ? '#eee' : '#333') + ';border-radius:12px;padding:30px;text-align:center;"><div style="font-size:24px;margin-bottom:15px;"><i class="fas fa-spinner fa-spin"></i></div><div style="font-size:16px;">正在生成PDF...</div></div>';
        document.body.appendChild(loadingModal);

        try {
            var htmlContent = await preparePrintContent(content, settings);
            // generatePDF returns a URL now
            var pdfUrl = await generatePDF(htmlContent, settings, 'document.pdf');
            
            loadingModal.remove();

            // 确保pdfUrl是完整的URL
            var fullPdfUrl = pdfUrl;
            if (!pdfUrl.startsWith('http://') && !pdfUrl.startsWith('https://')) {
                // 构建完整的URL
                var baseUrl = window.location.origin;
                if (!pdfUrl.startsWith('/')) {
                    baseUrl += '/' + window.location.pathname.split('/').slice(0, -1).join('/') + '/';
                }
                fullPdfUrl = baseUrl + pdfUrl;
            }

            // Trigger download using fetch and blob to force download behavior
            // This is more reliable than simple anchor click for same-origin or CORS enabled resources
            var response = await fetch(fullPdfUrl);
            var blob = await response.blob();
            var url = window.URL.createObjectURL(blob);
            
            var a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            // Get filename from current file name if available
            var currentFileName = '文档';
            var currentNode = g('currentFileId') ? g('fileTree').jstree(true).get_node(g('currentFileId')) : null;
            if (currentNode) {
                currentFileName = currentNode.text.replace(/\.md$/, '');
            }
            a.download = currentFileName + '.pdf';
            document.body.appendChild(a);
            a.click();
            
            // Cleanup
            setTimeout(function() {
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
            }, 100);

        } catch (error) {
            console.error('PDF download error:', error);
            loadingModal.remove();
            alert('PDF生成失败: ' + error.message);
        }
    }

    async function showPrintPreview(settings) {
        var nightMode = g('nightMode') === true;
        var content = g('vditor') ? g('vditor').getValue() : '';

        // 显示加载状态
        var loadingModal = document.createElement('div');
        loadingModal.className = 'modal-overlay';
        // Ensure z-index is higher than any mask used in generatePDF (which uses 20000)
        loadingModal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.9);z-index:21000;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;';
        loadingModal.innerHTML = '<div style="background:' + (nightMode ? '#2d2d2d' : 'white') + ';color:' + (nightMode ? '#eee' : '#333') + ';border-radius:12px;padding:30px;text-align:center;"><div style="font-size:24px;margin-bottom:15px;"><i class="fas fa-spinner fa-spin"></i></div><div style="font-size:16px;">正在生成PDF预览...</div></div>';
        document.body.appendChild(loadingModal);

        try {
            var htmlContent = await preparePrintContent(content, settings);
            var pdfUrl = await generatePDF(htmlContent, settings);

            loadingModal.remove();

            var previewModal = document.createElement('div');
            previewModal.className = 'modal-overlay';
            previewModal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.9);z-index:10001;display:flex;flex-direction:column;align-items:stretch;justify-content:stretch;padding:0;';

            var previewContent = document.createElement('div');
            previewContent.style.cssText = 'background:' + (nightMode ? '#1a1a1a' : '#f0f0f0') + ';border-radius:0;display:flex;flex-direction:column;flex:1;box-shadow:none;border:none;min-height:0;';
            
            var closeBtn = document.createElement('button');
            closeBtn.innerHTML = '<i class="fas fa-times"></i>';
            closeBtn.style.cssText = 'position:absolute;top:10px;right:10px;background:' + (nightMode ? '#333' : '#fff') + ';border:1px solid ' + (nightMode ? '#555' : '#ddd') + ';color:#666;font-size:16px;cursor:pointer;padding:8px;border-radius:4px;z-index:10;';

            var docContainer = document.createElement('div');
            docContainer.style.cssText = 'flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;overflow:auto;padding:20px;min-height:0;';

            var pagesWrapper = document.createElement('div');
            pagesWrapper.style.cssText = 'display:flex;flex-direction:column;gap:20px;align-items:center;width:100%;max-width:800px;';
            
            docContainer.appendChild(pagesWrapper);

            await renderPDF(pdfUrl, pagesWrapper);

            var buttonContainer = document.createElement('div');
            buttonContainer.style.cssText = 'display:flex;gap:8px;padding:12px;background:' + (nightMode ? '#2d2d2d' : '#f8f9fa') + ';border-top:1px solid ' + (nightMode ? '#444' : '#eee') + ';justify-content:flex-end;';

            var printBtn = document.createElement('button');
            printBtn.innerHTML = '<i class="fas fa-print"></i> 打印';
            printBtn.style.cssText = 'padding:8px 16px;background:#4a90e2;color:white;border:none;border-radius:4px;cursor:pointer;font-size:14px;font-weight:bold;';
            printBtn.onclick = function() {
                sendToPrint(settings, pdfUrl);
            };

            var pdfBtn = document.createElement('button');
            pdfBtn.innerHTML = '<i class="fas fa-file-pdf"></i> 下载';
            pdfBtn.style.cssText = 'padding:8px 16px;background:#dc3545;color:white;border:none;border-radius:4px;cursor:pointer;font-size:14px;font-weight:bold;';
            pdfBtn.onclick = function() {
                 var a = document.createElement('a');
                 a.href = pdfUrl;
                 a.download = '文档.pdf';
                 a.target = '_blank';
                 document.body.appendChild(a);
                 a.click();
                 document.body.removeChild(a);
            };

            var cancelBtn = document.createElement('button');
            cancelBtn.innerHTML = '<i class="fas fa-times"></i> 关闭';
            cancelBtn.style.cssText = 'padding:8px 16px;background:' + (nightMode ? '#555' : '#6c757d') + ';color:white;border:none;border-radius:4px;cursor:pointer;font-size:14px;';

            buttonContainer.appendChild(printBtn);
            buttonContainer.appendChild(pdfBtn);
            buttonContainer.appendChild(cancelBtn);

            previewContent.appendChild(closeBtn);
            previewContent.appendChild(docContainer);
            previewContent.appendChild(buttonContainer);
            previewModal.appendChild(previewContent);
            document.body.appendChild(previewModal);

            function cleanup() {
                previewModal.remove();
            }
            
            closeBtn.onclick = cleanup;
            cancelBtn.onclick = cleanup;
            previewModal.addEventListener('click', function(e) {
                if (e.target === previewModal) cleanup();
            });

        } catch (error) {
            console.error('预览错误:', error);
            loadingModal.remove();
            alert('预览失败: ' + error.message);
        }
    }

    async function sendToPrint(settings, existingPdfUrl) {
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
        statusText.textContent = '正在准备打印内容...';
        statusText.style.cssText = 'font-size:16px;margin-bottom:10px;';

        var statusDetail = document.createElement('div');
        statusDetail.id = 'printStatusDetail';
        statusDetail.textContent = '正在生成PDF文档...';
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
        var isCancelled = false;

        cancelBtn.onclick = function() {
            isCancelled = true;
            cleanup();
            modal.remove();
        };

        function updateStatus(text, detail, isError) {
            if (isCancelled) return;
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
            // 1. 生成PDF (如果未提供)
            let pdfUrl = existingPdfUrl;
            if (!pdfUrl) {
                var htmlContent = await preparePrintContent(content, settings);
                if (isCancelled) return;
                pdfUrl = await generatePDF(htmlContent, settings);
            }
            
            if (isCancelled) return;

            // 2. 连接 WebSocket (不再需要上传，因为PDF已经在服务器上)
            updateStatus('连接打印服务器...', '正在建立连接...');
            var wsUrl = 'wss://print.yhsun.cn';
            ws = new WebSocket(wsUrl);

            timeout = setTimeout(function() {
                updateStatus('连接超时', '无法连接到打印服务器，请检查网络连接', true);
                cleanup();
            }, 10000);

            ws.onopen = async function() {
                clearTimeout(timeout);
                if (isCancelled) {
                    ws.close();
                    return;
                }
                updateStatus('连接成功', '正在发送打印任务...');

                // Ensure fileUrl is absolute
                var fullFileUrl = pdfUrl;
                if (!fullFileUrl.startsWith('http://') && !fullFileUrl.startsWith('https://')) {
                    var baseUrl = window.location.origin;
                    if (!fullFileUrl.startsWith('/')) {
                        baseUrl += '/' + window.location.pathname.split('/').slice(0, -1).join('/') + '/';
                    }
                    fullFileUrl = baseUrl + fullFileUrl;
                }

                var printData = {
                    type: 'print_request',
                    username: username,
                    password: userPassword,
                    content: fullFileUrl,
                    content_type: 'file',
                    file_name: 'print_job.pdf',
                    settings: {
                        print_file: true
                    },
                    timestamp: new Date().toISOString()
                };

                ws.send(JSON.stringify(printData));
            };

            ws.onmessage = function(event) {
                if (isCancelled) return;
                try {
                    var response = JSON.parse(event.data);
                    if (response.type === 'client_status') {
                        if (response.connected) {
                            updateStatus('客户端已连接', '正在发送任务...');
                        } else {
                            updateStatus('客户端未连接', '请确保打印客户端已启动并登录', true);
                        }
                    } else if (response.type === 'print_queued') {
                        updateStatus('打印任务已发送', '打印任务已添加到打印队列', false);
                        cleanup();
                        setTimeout(function() {
                            if (!isCancelled) modal.remove();
                        }, 2000);
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
                if (!event.wasClean && !isCancelled) {
                    updateStatus('连接意外关闭', '代码: ' + event.code, true);
                }
            };

            modal.addEventListener('click', function(e) {
                if (e.target === modal) {
                    isCancelled = true;
                    cleanup();
                    modal.remove();
                }
            });

        } catch (error) {
            if (!isCancelled) {
                updateStatus('失败', error.toString(), true);
                cleanup();
            }
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
        console.log('[Print Debug] preparePrintContent start. Content length:', content ? content.length : 0);
        
        // 生成缓存键
        var cacheKey = generateCacheKey(content, settings);

        // 检查缓存是否存在
        if (printContentCache[cacheKey]) {
            console.log('[Print Debug] Using cached content');
            return printContentCache[cacheKey];
        }

        // 使用服务端 API 进行 Markdown 转换
        var htmlContent = '';
        try {
            var api = global.getApiBaseUrl ? global.getApiBaseUrl() : 'api';
            // 兼容 api 路径可能不包含 /api 的情况 (取决于 getApiBaseUrl 实现)
            // 如果 getApiBaseUrl 返回 'api' (相对路径), 则 fetch('api/convert/markdown')
            // 如果返回完整 URL, 需要拼接
            var apiUrl = api.startsWith('http') ? api + '/convert/markdown' : 'api/convert/markdown';
            
            console.log('[Print Debug] Fetching markdown conversion from:', apiUrl);
            var response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ content: content })
            });
            
            var result = await response.json();
            if (result.code === 200) {
                htmlContent = result.data;
                console.log('[Print Debug] Server conversion success. HTML length:', htmlContent.length);
            } else {
                console.error('[Print Debug] Markdown conversion failed:', result.message);
                // Fallback to local formatting if server fails
                htmlContent = formatForPrint(content, settings);
                console.log('[Print Debug] Fallback to local formatting. HTML length:', htmlContent.length);
            }
        } catch (e) {
            console.error('[Print Debug] Markdown conversion error:', e);
            // Fallback to local formatting
            htmlContent = formatForPrint(content, settings);
            console.log('[Print Debug] Fallback to local formatting (error). HTML length:', htmlContent.length);
        }

        // Post-process HTML to match expected structure for Mermaid and others
        var tempDiv = document.createElement('div');
        tempDiv.innerHTML = htmlContent;

        // Transform mermaid code blocks: <pre><code class="language-mermaid">...</code></pre> -> <div class="mermaid">...</div>
        var mermaidCodes = tempDiv.querySelectorAll('code.language-mermaid');
        console.log('[Print Debug] Found mermaid blocks:', mermaidCodes.length);
        mermaidCodes.forEach(function(code) {
            var pre = code.parentNode;
            if (pre.tagName === 'PRE') {
                var div = document.createElement('div');
                div.className = 'mermaid';
                div.setAttribute('data-mermaid', code.textContent);
                div.textContent = code.textContent;
                div.style.textAlign = 'center';
                div.style.margin = '1em 0';
                pre.parentNode.replaceChild(div, pre);
            }
        });

        // Update htmlContent
        htmlContent = tempDiv.innerHTML;

        // Convert formulas and charts to images and upload
        if (!global.convertFormulasAndChartsToImages) {
             console.error('[Print Debug] Render module not loaded');
             throw new Error('Render module not loaded');
        }
        
        console.log('[Print Debug] Starting convertFormulasAndChartsToImages...');
        var processedHtml = await global.convertFormulasAndChartsToImages(htmlContent);
        console.log('[Print Debug] convertFormulasAndChartsToImages done. HTML length:', processedHtml.length);

        // For print, we need to ensure formulas, charts, and images are properly rendered
        // Create a temporary container to process the content
        var tempContainer = document.createElement('div');
        tempContainer.innerHTML = processedHtml;

        // Process images - convert to data URLs to avoid network errors
        processImages(tempContainer);

        var finalHtml = tempContainer.innerHTML;
        
        // Add print styles
        const printStyle = getPrintStyles(settings);
        finalHtml = `<style>${printStyle}</style><div class="print-content">${finalHtml}</div>`;
        
        console.log('[Print Debug] Final HTML prepared. Length:', finalHtml.length);

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
    
    // showFilePrintDialog implementation
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
                <p style="margin-top:10px;font-size:14px;">
                    <a href="javascript:void(0)" id="fileDownloadClientBtn" style="color:#4a90e2;cursor:pointer;text-decoration:underline;">点击下载打印客户端</a>
                </p>
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

        // Download client button event
        var fileDownloadClientBtn = modalContent.querySelector('#fileDownloadClientBtn');
        if (fileDownloadClientBtn) {
            fileDownloadClientBtn.onclick = function() {
                showDownloadClientModal();
            };
        }

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
            filePrintBtn.onclick = global.debounce(async function() {
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
                    var response = await fetch('api/external/upload', {
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
                    global.showMessage('网络未连接，请连接网络', 'error');
                    reject(error);
                    ws.close();
                };

                ws.onclose = function(event) {
                    clearTimeout(timeout);
                };
            });
        }
    }

    global.showPrintDialog = showPrintDialog;
    global.getPrintSettings = getPrintSettings;
    global.showPrintPreview = showPrintPreview;
    global.sendToPrint = sendToPrint;
    global.preparePrintContent = preparePrintContent;
    global.showFilePrintDialog = showFilePrintDialog;
