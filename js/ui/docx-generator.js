
const global = window;

function g(name) { return global[name]; }
function isEn() { return window.i18n && window.i18n.getLanguage() === 'en'; }

/**
 * 简单的 Markdown 解析器，将 Markdown 转换为结构化数据
 * @param {string} markdown - Markdown 内容
 * @returns {Array} 结构化数据数组
 */
function parseMarkdown(markdown) {
    if (!markdown) return [];

    const lines = markdown.split('\n');
    const result = [];
    let i = 0;

    while (i < lines.length) {
        const line = lines[i];
        const trimmedLine = line.trim();

        // 空行
        if (!trimmedLine) {
            i++;
            continue;
        }

        // 代码块
        if (trimmedLine.startsWith('```')) {
            const lang = trimmedLine.slice(3).trim();
            const codeLines = [];
            i++;
            while (i < lines.length && !lines[i].trim().startsWith('```')) {
                codeLines.push(lines[i]);
                i++;
            }
            result.push({
                type: 'code',
                content: codeLines.join('\n'),
                language: lang
            });
            i++;
            continue;
        }

        // 标题
        const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
        if (headingMatch) {
            result.push({
                type: 'heading',
                level: headingMatch[1].length,
                content: parseInline(headingMatch[2])
            });
            i++;
            continue;
        }

        // 表格
        if (trimmedLine.startsWith('|')) {
            const tableLines = [];
            while (i < lines.length && lines[i].trim().startsWith('|')) {
                tableLines.push(lines[i]);
                i++;
            }
            if (tableLines.length >= 2) {
                const table = parseTable(tableLines);
                if (table) {
                    result.push(table);
                }
            }
            continue;
        }

        // 引用
        if (trimmedLine.startsWith('>')) {
            const quoteLines = [];
            while (i < lines.length && lines[i].trim().startsWith('>')) {
                quoteLines.push(lines[i].replace(/^>\s*/, ''));
                i++;
            }
            result.push({
                type: 'quote',
                content: parseInline(quoteLines.join(' '))
            });
            continue;
        }

        // 无序列表
        if (trimmedLine.match(/^[-*+]\s+/)) {
            const items = [];
            while (i < lines.length && lines[i].trim().match(/^[-*+]\s+/)) {
                items.push(parseInline(lines[i].replace(/^[-*+]\s+/, '')));
                i++;
            }
            result.push({
                type: 'list',
                ordered: false,
                items: items
            });
            continue;
        }

        // 有序列表
        if (trimmedLine.match(/^\d+\.\s+/)) {
            const items = [];
            while (i < lines.length && lines[i].trim().match(/^\d+\.\s+/)) {
                items.push(parseInline(lines[i].replace(/^\d+\.\s+/, '')));
                i++;
            }
            result.push({
                type: 'list',
                ordered: true,
                items: items
            });
            continue;
        }

        // 分割线
        if (trimmedLine.match(/^[-*_]{3,}$/)) {
            result.push({ type: 'hr' });
            i++;
            continue;
        }

        // 普通段落
        const paraLines = [];
        while (i < lines.length && lines[i].trim() && !lines[i].trim().startsWith('#') && !lines[i].trim().startsWith('>') && !lines[i].trim().startsWith('|') && !lines[i].trim().startsWith('```') && !lines[i].trim().match(/^[-*+\d]/)) {
            paraLines.push(lines[i]);
            i++;
        }
        if (paraLines.length > 0) {
            result.push({
                type: 'paragraph',
                content: parseInline(paraLines.join(' '))
            });
        }
    }

    return result;
}

/**
 * 解析行内元素（粗体、斜体、链接等）
 * @param {string} text - 文本
 * @returns {Array} 行内元素数组
 */
function parseInline(text) {
    if (!text) return [{ type: 'text', text: '' }];

    const result = [];
    let remaining = text;

    // 正则表达式匹配各种行内元素
    const patterns = [
        { regex: /\*\*\*([^*]+)\*\*\*/g, type: 'boldItalic' },  // ***bold italic***
        { regex: /\*\*([^*]+)\*\*/g, type: 'bold' },           // **bold**
        { regex: /\*([^*]+)\*/g, type: 'italic' },             // *italic*
        { regex: /__([^_]+)__/g, type: 'bold' },               // __bold__
        { regex: /_([^_]+)_/g, type: 'italic' },               // _italic_
        { regex: /~~([^~]+)~~/g, type: 'strike' },             // ~~strike~~
        { regex: /`([^`]+)`/g, type: 'code' },                 // `code`
        { regex: /\[([^\]]+)\]\(([^)]+)\)/g, type: 'link' },   // [text](url)
    ];

    // 简单的行内解析：按顺序处理
    while (remaining) {
        let matched = false;

        for (const pattern of patterns) {
            pattern.regex.lastIndex = 0;
            const match = pattern.regex.exec(remaining);
            if (match && match.index === 0) {
                if (pattern.type === 'link') {
                    result.push({
                        type: 'link',
                        text: match[1],
                        url: match[2]
                    });
                } else {
                    result.push({
                        type: pattern.type,
                        text: match[1]
                    });
                }
                remaining = remaining.slice(match[0].length);
                matched = true;
                break;
            }
        }

        if (!matched) {
            // 找到下一个特殊标记的位置
            let nextSpecial = remaining.length;
            for (const pattern of patterns) {
                pattern.regex.lastIndex = 0;
                const match = pattern.regex.exec(remaining);
                if (match) {
                    nextSpecial = Math.min(nextSpecial, match.index);
                }
            }

            result.push({
                type: 'text',
                text: remaining.slice(0, nextSpecial)
            });
            remaining = remaining.slice(nextSpecial);
        }
    }

    return result;
}

/**
 * 解析表格
 * @param {Array} lines - 表格行
 * @returns {Object|null} 表格对象
 */
function parseTable(lines) {
    if (lines.length < 2) return null;

    // 解析表头
    const headerCells = lines[0].split('|').map(c => c.trim()).filter(c => c);
    // 跳过分隔行
    const bodyRows = [];
    for (let i = 2; i < lines.length; i++) {
        const cells = lines[i].split('|').map(c => c.trim()).filter(c => c);
        if (cells.length > 0) {
            bodyRows.push(cells);
        }
    }

    return {
        type: 'table',
        headers: headerCells,
        rows: bodyRows
    };
}

/**
 * 将 Markdown 转换为 DOCX 并下载
 * @param {string} markdown - Markdown 内容
 * @param {string} filename - 文件名（不含扩展名）
 */
async function generateDOCX(markdown, filename) {
    if (!markdown) {
        throw new Error(isEn() ? 'Content is empty' : '内容为空');
    }

    // 动态导入 docx
    const docxModule = await import('docx');
    const docx = docxModule.default || docxModule;
    const { Document, Packer, Paragraph, TextRun, Table, TableCell, TableRow, HeadingLevel, AlignmentType, BorderStyle } = docx;

    // 解析 Markdown
    const parsed = parseMarkdown(markdown);

    // 构建文档内容
    const children = [];

    for (const block of parsed) {
        switch (block.type) {
            case 'heading':
                children.push(new Paragraph({
                    text: block.content.map(c => c.text).join(''),
                    heading: HeadingLevel['HEADING_' + block.level],
                    spacing: { after: 200 }
                }));
                break;

            case 'paragraph':
                children.push(createParagraph(block.content, docx));
                break;

            case 'code':
                children.push(new Paragraph({
                    text: block.content,
                    style: 'Code',
                    spacing: { before: 100, after: 100 }
                }));
                break;

            case 'quote':
                children.push(new Paragraph({
                    children: block.content.map(c => createTextRun(c, docx)),
                    indent: { left: 720 },
                    spacing: { before: 100, after: 100 }
                }));
                break;

            case 'list':
                for (let i = 0; i < block.items.length; i++) {
                    const prefix = block.ordered ? (i + 1) + '. ' : '• ';
                    children.push(new Paragraph({
                        text: prefix + block.items[i].map(c => c.text).join(''),
                        indent: { left: 720 },
                        spacing: { after: 60 }
                    }));
                }
                break;

            case 'table':
                if (block.headers && block.rows) {
                    const tableRows = [];

                    // 表头行
                    const headerCells = block.headers.map(h => new TableCell({
                        children: [new Paragraph({
                            text: h,
                            bold: true
                        })],
                        shading: { fill: 'F0F0F0' }
                    }));
                    tableRows.push(new TableRow({ children: headerCells }));

                    // 数据行
                    for (const row of block.rows) {
                        const cells = row.map(c => new TableCell({
                            children: [new Paragraph({ text: c })]
                        }));
                        tableRows.push(new TableRow({ children: cells }));
                    }

                    children.push(new Table({
                        rows: tableRows,
                        width: { size: 100, type: 'pct' }
                    }));
                }
                break;

            case 'hr':
                children.push(new Paragraph({
                    text: '─────────────────',
                    alignment: AlignmentType.CENTER,
                    spacing: { before: 200, after: 200 }
                }));
                break;
        }
    }

    // 创建文档
    const doc = new Document({
        sections: [{
            properties: {},
            children: children
        }]
    });

    // 生成 Blob
    const blob = await Packer.toBlob(doc);

    // 下载文件
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename + '.docx';
    document.body.appendChild(a);
    a.click();

    // 清理
    setTimeout(function() {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 100);

    return true;
}

/**
 * 创建段落
 * @param {Array} content - 行内内容数组
 * @param {Object} docx - docx 模块
 * @returns {Paragraph} 段落对象
 */
function createParagraph(content, docx) {
    const { Paragraph } = docx;
    return new Paragraph({
        children: content.map(c => createTextRun(c, docx)),
        spacing: { after: 120 }
    });
}

/**
 * 创建文本运行
 * @param {Object} item - 行内元素
 * @param {Object} docx - docx 模块
 * @returns {TextRun} 文本运行对象
 */
function createTextRun(item, docx) {
    const { TextRun } = docx;

    const options = {
        text: item.text
    };

    switch (item.type) {
        case 'bold':
            options.bold = true;
            break;
        case 'italic':
            options.italics = true;
            break;
        case 'boldItalic':
            options.bold = true;
            options.italics = true;
            break;
        case 'strike':
            options.strike = true;
            break;
        case 'code':
            options.font = 'Courier New';
            options.shading = { fill: 'F5F5F5' };
            break;
        case 'link':
            options.color = '0563C1';
            options.underline = {
                type: 'single'
            };
            break;
    }

    return new TextRun(options);
}

/**
 * 导出 Markdown 为 DOCX 文件
 * @param {string} content - Markdown 内容
 */
async function exportDOCX(content) {
    var loadingModal = null;
    var timeoutId = null;

    try {
        // 显示加载状态
        var nightMode = g('nightMode') === true;
        loadingModal = document.createElement('div');
        loadingModal.className = 'modal-overlay';
        loadingModal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.9);z-index:10001;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;';
        loadingModal.innerHTML = '<div style="background:' + (nightMode ? '#2d2d2d' : 'white') + ';color:' + (nightMode ? '#eee' : '#333') + ';border-radius:12px;padding:30px;text-align:center;"><div style="font-size:24px;margin-bottom:15px;"><i class="fas fa-spinner fa-spin"></i></div><div style="font-size:16px;">' + (isEn() ? 'Generating DOCX...' : '生成 DOCX 中...') + '</div></div>';
        document.body.appendChild(loadingModal);

        // 设置超时处理（30秒）
        timeoutId = setTimeout(function() {
            if (loadingModal && loadingModal.parentNode) {
                loadingModal.remove();
                if (global.showMessage) {
                    global.showMessage(isEn() ? 'DOCX generation timeout, please try again' : 'DOCX 生成超时，请重试', 'error');
                }
            }
        }, 30000);

        // 生成文件名
        var filename = isEn() ? 'document' : '文档';
        if (g('currentFileId') && typeof g('fileTree') !== 'undefined') {
            try {
                var currentNode = g('fileTree').jstree(true).get_node(g('currentFileId'));
                if (currentNode) {
                    filename = currentNode.text.replace(/\.md$/, '');
                }
            } catch (e) {
                // 忽略错误，使用默认文件名
            }
        }
        filename = filename + '_' + new Date().toISOString().slice(0, 10);

        // 生成并下载 DOCX
        await generateDOCX(content, filename);

        // 清除超时
        if (timeoutId) clearTimeout(timeoutId);

        // 移除加载状态
        if (loadingModal && loadingModal.parentNode) {
            loadingModal.remove();
        }

        // 显示成功消息
        if (global.showMessage) {
            global.showMessage(isEn() ? 'Document exported as .docx' : '文档已导出为 .docx 格式');
        }

        return true;
    } catch (error) {
        // 清除超时
        if (timeoutId) clearTimeout(timeoutId);

        // 移除加载状态
        if (loadingModal && loadingModal.parentNode) {
            loadingModal.remove();
        }

        console.error('DOCX export error:', error);
        if (global.showMessage) {
            global.showMessage(isEn() ? 'Failed to generate DOCX: ' + error.message : '生成 DOCX 失败: ' + error.message, 'error');
        }
        throw error;
    }
}

// 导出到全局
global.generateDOCX = generateDOCX;
global.exportDOCX = exportDOCX;
