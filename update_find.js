const fs = require('fs');
const content = fs.readFileSync('js/files.js', 'utf8');
const newFindFunc = `    function showFindDialog() {
        const nightMode = g('nightMode') === true;
        const bgColor = nightMode ? '#2d2d2d' : 'white';
        const textColor = nightMode ? '#eee' : '#333';
        const secondaryTextColor = nightMode ? '#aaa' : '#666';
        const borderColor = nightMode ? '#444' : '#ddd';
        const inputBg = nightMode ? '#3d3d3d' : '#f5f5f5';
        // 如果已存在查找框，先移除
        const existingModal = document.getElementById('findDialogModal');
        if (existingModal) {
            existingModal.remove();
        }
        // 创建非模态的浮动对话框
        const dialog = document.createElement('div');
        dialog.id = 'findDialogModal';
        dialog.style.cssText = 'position:fixed;top:80px;right:40px;background:' + bgColor + ';color:' + textColor + ';border-radius:12px;padding:20px;width:380px;box-shadow:0 4px 20px rgba(0,0,0,0.3);z-index:10001;border:1px solid ' + borderColor + ';display:flex;flex-direction:column;';
        dialog.innerHTML =
            '<div id="findDialogHeader" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:15px;cursor:move;user-select:none;">' +
                '<h3 style="margin:0;font-size:16px;">' + (isEn() ? 'Find and Replace' : '查找和替换') + '</h3>' +
                '<button id="closeFindBtn" style="background:none;border:none;font-size:20px;cursor:pointer;color:' + secondaryTextColor + ';padding:0;">&times;</button>' +
            '</div>' +
            '<div style="margin-bottom:10px;">' +
                '<input type="text" id="findInput" placeholder="' + (isEn() ? 'Enter search text...' : '输入查找内容...') + '" ' +
                    'style="width:100%;padding:8px 12px;border:1px solid ' + borderColor + ';border-radius:6px;font-size:13px;background:' + inputBg + ';color:' + textColor + ';box-sizing:border-box;outline:none;">' +
            '</div>' +
            '<div style="margin-bottom:15px;">' +
                '<input type="text" id="replaceInput" placeholder="' + (isEn() ? 'Enter replacement...' : '输入替换内容...') + '" ' +
                    'style="width:100%;padding:8px 12px;border:1px solid ' + borderColor + ';border-radius:6px;font-size:13px;background:' + inputBg + ';color:' + textColor + ';box-sizing:border-box;outline:none;">' +
            '</div>' +
            '<div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end;margin-bottom:10px;">' +
                '<button id="replaceBtn" style="padding:6px 12px;background:' + (nightMode ? '#3d3d3d' : '#f0f0f0') + ';color:' + textColor + ';border:1px solid ' + borderColor + ';border-radius:6px;cursor:pointer;font-size:12px;">' + (isEn() ? 'Replace' : '替换') + '</button>' +
                '<button id="replaceAllBtn" style="padding:6px 12px;background:' + (nightMode ? '#3d3d3d' : '#f0f0f0') + ';color:' + textColor + ';border:1px solid ' + borderColor + ';border-radius:6px;cursor:pointer;font-size:12px;">' + (isEn() ? 'Replace All' : '全部替换') + '</button>' +
                '<button id="findPrevBtn" style="padding:6px 12px;background:' + (nightMode ? '#667eea' : '#667eea') + ';color:white;border:none;border-radius:6px;cursor:pointer;font-size:12px;">' + (isEn() ? 'Prev' : '上一个') + '</button>' +
                '<button id="findNextBtn" style="padding:6px 12px;background:' + (nightMode ? '#667eea' : '#667eea') + ';color:white;border:none;border-radius:6px;cursor:pointer;font-size:12px;">' + (isEn() ? 'Next' : '下一个') + '</button>' +
            '</div>' +
            '<div id="findStatus" style="font-size:12px;color:' + secondaryTextColor + ';"></div>';
        document.body.appendChild(dialog);
        // 拖动逻辑
        const header = dialog.querySelector('#findDialogHeader');
        let isDragging = false;
        let startX, startY, startLeft, startTop;
        header.addEventListener('mousedown', function(e) {
            if (e.target.id === 'closeFindBtn') return;
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            const rect = dialog.getBoundingClientRect();
            startLeft = rect.left;
            startTop = rect.top;
            // 改变样式以防文字被选中
            document.body.style.userSelect = 'none';
        });
        document.addEventListener('mousemove', function(e) {
            if (!isDragging) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            // 计算新位置并防止超出视口
            let newLeft = startLeft + dx;
            let newTop = startTop + dy;
            newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - dialog.offsetWidth));
            newTop = Math.max(0, Math.min(newTop, window.innerHeight - dialog.offsetHeight));
            dialog.style.left = newLeft + 'px';
            dialog.style.top = newTop + 'px';
            dialog.style.right = 'auto'; // 覆盖初始的 right 样式
        });
        document.addEventListener('mouseup', function() {
            if (isDragging) {
                isDragging = false;
                document.body.style.userSelect = '';
            }
        });
        // 查找状态
        let matches = [];
        let currentMatchIndex = -1;
        let searchText = '';
        const findInput = dialog.querySelector('#findInput');
        const replaceInput = dialog.querySelector('#replaceInput');
        const findStatus = dialog.querySelector('#findStatus');
        const findNextBtn = dialog.querySelector('#findNextBtn');
        const findPrevBtn = dialog.querySelector('#findPrevBtn');
        const replaceBtn = dialog.querySelector('#replaceBtn');
        const replaceAllBtn = dialog.querySelector('#replaceAllBtn');
        const closeBtn = dialog.querySelector('#closeFindBtn');
        // 获取编辑器可搜索的DOM节点
        function getEditorElement() {
            const vditor = g('vditor');
            if (!vditor || !vditor.vditor) return null;
            const mode = vditor.vditor.currentMode || vditor.vditor.mode || vditor.vditor.currentOptions.mode;
            if (mode === 'wysiwyg' && vditor.vditor.wysiwyg) return vditor.vditor.wysiwyg.element;
            if (mode === 'ir' && vditor.vditor.ir) return vditor.vditor.ir.element;
            if (mode === 'sv' && vditor.vditor.sv) return vditor.vditor.sv.element;
            if (vditor.vditor.wysiwyg) return vditor.vditor.wysiwyg.element;
            if (vditor.vditor.ir) return vditor.vditor.ir.element;
            if (vditor.vditor.sv) return vditor.vditor.sv.element;
            return null;
        }
        // 聚焦输入框
        setTimeout(() => findInput.focus(), 100);
        // 执行查找
        function performFind() {
            searchText = findInput.value.trim();
            if (!searchText) {
                findStatus.textContent = '';
                clearHighlights();
                return;
            }
            const editorElement = getEditorElement();
            if (!editorElement) return;
            let domText = '';
            const walkerAll = document.createTreeWalker(
                editorElement,
                NodeFilter.SHOW_TEXT,
                null,
                false
            );
            let nodeAll;
            while (nodeAll = walkerAll.nextNode()) {
                domText += nodeAll.textContent;
            }
            matches = [];
            // 查找所有匹配位置
            let index = domText.toLowerCase().indexOf(searchText.toLowerCase());
            while (index !== -1) {
                matches.push({
                    start: index,
                    end: index + searchText.length,
                    text: domText.substring(index, index + searchText.length)
                });
                index = domText.toLowerCase().indexOf(searchText.toLowerCase(), index + 1);
            }
            if (matches.length === 0) {
                findStatus.textContent = isEn() ? 'No matches found' : '未找到匹配内容';
                findStatus.style.color = '#dc3545';
            } else {
                findStatus.textContent = (isEn() ? 'Found ' : '找到 ') + matches.length + (isEn() ? ' matches' : ' 个匹配');
                findStatus.style.color = secondaryTextColor;
                // 如果��前索引超出范围，重置为0
                if (currentMatchIndex < 0 || currentMatchIndex >= matches.length) {
                    currentMatchIndex = 0;
                }
                highlightMatch(currentMatchIndex);
            }
        }
        // 清除所有高亮标记
        function clearAllHighlightMarks() {
            const editorElement = getEditorElement();
            if (!editorElement) return;
            // 移除所有之前的高亮标记
            const marks = editorElement.querySelectorAll('mark.find-highlight');
            marks.forEach(mark => {
                const parent = mark.parentNode;
                if (parent) {
                    parent.replaceChild(document.createTextNode(mark.textContent), mark);
                    parent.normalize();
                }
            });
        }
        // 高亮匹配项
        function highlightMatch(index) {
            if (matches.length === 0 || index < 0 || index >= matches.length) return;
            const match = matches[index];
            // 更新状态
            findStatus.textContent = (isEn() ? 'Match ' : '匹配 ') + (index + 1) + ' / ' + matches.length;
            try {
                const editorElement = getEditorElement();
                if (editorElement) {
                    // 先清除之前的高亮
                    clearAllHighlightMarks();
                    // 创建范围并选择文本
                    const textNodes = [];
                    const walker = document.createTreeWalker(
                        editorElement,
                        NodeFilter.SHOW_TEXT,
                        null,
                        false
                    );
                    let node;
                    let currentPos = 0;
                    while (node = walker.nextNode()) {
                        const nodeLength = node.textContent.length;
                        if (currentPos + nodeLength > match.start && currentPos < match.end) {
                            textNodes.push({
                                node: node,
                                start: Math.max(0, match.start - currentPos),
                                end: Math.min(nodeLength, match.end - currentPos)
                            });
                        }
                        currentPos += nodeLength;
                        if (currentPos > match.end) break;
                    }
                    if (textNodes.length > 0) {
                        const range = document.createRange();
                        range.setStart(textNodes[0].node, textNodes[0].start);
                        range.setEnd(textNodes[textNodes.length - 1].node, textNodes[textNodes.length - 1].end);
                        // 创建高亮标记
                        const mark = document.createElement('mark');
                        mark.className = 'find-highlight';
                        mark.style.cssText = 'background:#ffeb3b;color:#000;padding:2px 0;border-radius:2px;';
                        let rect = null;
                        let targetNode = null;
                        try {
                            range.surroundContents(mark);
                            rect = mark.getBoundingClientRect();
                            targetNode = mark;
                        } catch (e) {
                            // 如果 surroundContents 失败，使用选择方式
                            const selection = window.getSelection();
                            selection.removeAllRanges();
                            selection.addRange(range);
                            rect = range.getBoundingClientRect();
                            targetNode = textNodes[0].node.parentElement;
                        }
                        // 滚动到可视区域
                        if (rect && rect.height > 0) {
                            const container = editorElement.closest('.vditor-ir') || editorElement.closest('.vditor-wysiwyg') || editorElement.closest('.vditor-sv') || editorElement;
                            if (container && targetNode) {
                                const containerRect = container.getBoundingClientRect();
                                if (rect.top < containerRect.top || rect.bottom > containerRect.bottom) {
                                    if (targetNode.scrollIntoView) {
                                        targetNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                    }
                                }
                            }
                        }
                    }
                }
            } catch (e) {
                console.error('Highlight error:', e);
            }
        }
        // 清除高亮
        function clearHighlights() {
            clearAllHighlightMarks();
            matches = [];
            currentMatchIndex = -1;
        }
        // 查找下一个
        function findNext() {
            if (matches.length === 0 || searchText !== findInput.value.trim()) {
                performFind();
                return;
            }
            currentMatchIndex = (currentMatchIndex + 1) % matches.length;
            highlightMatch(currentMatchIndex);
        }
        // 查找上一个
        function findPrev() {
            if (matches.length === 0 || searchText !== findInput.value.trim()) {
                performFind();
                return;
            }
            currentMatchIndex = (currentMatchIndex - 1 + matches.length) % matches.length;
            highlightMatch(currentMatchIndex);
        }
        // 执行替换功能
        function doReplace() {
            if (matches.length === 0 || currentMatchIndex < 0) {
                performFind();
                if (matches.length === 0) return; // 还是没匹配到就算了
            }
            const replaceText = replaceInput.value;
            const editorElement = getEditorElement();
            if (!editorElement) return;
            // 聚焦到编辑器，使用 document.execCommand 替换可以保留 Vditor 的撤销历史和状态
            editorElement.focus();
            // 获取当前的高亮节点
            const marks = editorElement.querySelectorAll('mark.find-highlight');
            if (marks.length > 0) {
                const mark = marks[0];
                const selection = window.getSelection();
                const range = document.createRange();
                range.selectNodeContents(mark);
                selection.removeAllRanges();
                selection.addRange(range);
                // 去除 mark 然后替换文本
                document.execCommand('insertText', false, replaceText);
                // 替换后需要重新解析内容建立新的索引
                setTimeout(() => {
                    performFind();
                }, 50);
            } else {
                // 如果没有 mark 但有选区
                 document.execCommand('insertText', false, replaceText);
                 setTimeout(() => {
                     performFind();
                 }, 50);
            }
        }
        // 全部替换
        function doReplaceAll() {
            performFind();
            if (matches.length === 0) return;
            const replaceText = replaceInput.value;
            const editorElement = getEditorElement();
            if (!editorElement) return;
            editorElement.focus();
            // 高效写法：直接在原始文本上整体操作 Vditor
            const vditor = g('vditor');
            if (vditor) {
                let text = vditor.getValue();
                // 使用正则表达式全局替换，保持大小写不敏感
                const escapeRegExp = (string) => string.replace(/[.*+?^\${}()|[\]\\\\]/g, '\\\\$&');
                const regex = new RegExp(escapeRegExp(searchText), 'gi');
                const matchCount = (text.match(regex) || []).length;
                if (matchCount > 0) {
                    const newText = text.replace(regex, replaceText);
                    // 重新设置内容
                    vditor.setValue(newText, true);
                    findStatus.textContent = (isEn() ? 'Replaced ' : '已替换 ') + matchCount + (isEn() ? ' occurrences' : ' 处');
                    findStatus.style.color = '#28a745';
                    clearHighlights();
                    matches = [];
                    currentMatchIndex = -1;
                }
            }
        }
        // 绑定事件
        let findTimeout;
        findInput.addEventListener('input', function() {
            clearTimeout(findTimeout);
            findTimeout = setTimeout(performFind, 200);
        });
        findInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                findNext();
            }
        });
        replaceInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                doReplace();
            }
        });
        findNextBtn.onclick = findNext;
        findPrevBtn.onclick = findPrev;
        replaceBtn.onclick = doReplace;
        replaceAllBtn.onclick = doReplaceAll;
        // 关闭对话框并清除高亮
        function closeFindDialog() {
            clearAllHighlightMarks();
            dialog.remove();
        }
        closeBtn.onclick = closeFindDialog;
        // ESC键关闭
        const handleEsc = function(e) {
            if (e.key === 'Escape') {
                closeFindDialog();
                document.removeEventListener('keydown', handleEsc);
            }
        };
        document.addEventListener('keydown', handleEsc);
    }
`;
// Replace the original showFindDialog in content
const oldStartIdx = content.indexOf('    function showFindDialog() {');
const endIdxStr = '    // 导出函数到全局对象';
const oldEndIdx = content.indexOf(endIdxStr);
if (oldStartIdx !== -1 && oldEndIdx !== -1) {
    const newContent = content.substring(0, oldStartIdx) + newFindFunc + '\n\n' + content.substring(oldEndIdx);
    fs.writeFileSync('js/files.js', newContent);
    console.log("Successfully replaced showFindDialog");
} else {
    console.log("Failed to find boundaries in js/files.js");
}
