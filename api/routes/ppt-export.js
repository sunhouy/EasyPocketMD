const express = require('express');
const router = express.Router();
const PptxGenJS = require('pptxgenjs');

/**
 * PPT 导出 API
 * 接收前端传来的 PPT 数据，使用 pptxgenjs 在服务端生成 PPT 文件
 */

// POST /api/ppt-export - 导出 PPT
router.post('/', async (req, res) => {
    try {
        const { topic, pages, outline, ratio = '16:9' } = req.body;

        if (!pages || !Array.isArray(pages) || pages.length === 0) {
            return res.status(400).json({
                code: 400,
                message: 'PPT 页面数据不能为空'
            });
        }

        // 创建 PPT 实例
        const pptx = new PptxGenJS();

        // 设置 PPT 元数据
        pptx.title = topic || 'PPT演示';
        pptx.author = 'EasyPocketMD';
        pptx.subject = topic || 'PPT演示';
        pptx.company = 'EasyPocketMD';

        // 设置幻灯片尺寸
        if (ratio === '16:9') {
            pptx.defineLayout({ name: '16:9', width: 10, height: 5.625 });
        } else {
            pptx.defineLayout({ name: '4:3', width: 10, height: 7.5 });
        }
        pptx.layout = ratio === '16:9' ? '16:9' : '4:3';

        // 遍历所有页面生成幻灯片
        for (let i = 0; i < pages.length; i++) {
            const pageHtml = pages[i];
            const pageOutline = outline && outline[i] ? outline[i] : { title: `第${i + 1}页`, content: [] };

            // 创建新幻灯片
            const slide = pptx.addSlide();

            // 解析 HTML 内容并转换为 PPT 元素
            if (pageHtml) {
                await addHtmlToSlide(slide, pageHtml, pageOutline, ratio);
            } else {
                // 空白页或待生成页面
                addPlaceholderSlide(slide, pageOutline, i + 1, ratio);
            }
        }

        // 生成文件并发送给客户端
        const fileName = `${topic || 'PPT'}_${Date.now()}.pptx`;

        // 设置响应头
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);

        // 写入响应流
        await pptx.write({ outputType: 'stream' })
            .then(stream => {
                stream.pipe(res);
            })
            .catch(err => {
                console.error('PPT 生成失败:', err);
                res.status(500).json({
                    code: 500,
                    message: 'PPT 生成失败: ' + err.message
                });
            });

    } catch (error) {
        console.error('PPT 导出错误:', error);
        res.status(500).json({
            code: 500,
            message: '服务器内部错误: ' + error.message
        });
    }
});

/**
 * 将 HTML 内容转换为 PPT 幻灯片元素
 */
async function addHtmlToSlide(slide, html, outline, ratio) {
    // 解析 HTML 中的基本结构
    // 提取标题
    const titleMatch = html.match(/<h1[^>]*>(.*?)<\/h1>/i) ||
                       html.match(/<h2[^>]*>(.*?)<\/h2>/i) ||
                       html.match(/<h3[^>]*>(.*?)<\/h3>/i);
    const title = titleMatch ? stripHtml(titleMatch[1]) : (outline.title || '');

    // 提取列表项
    const listItems = [];
    const listRegex = /<li[^>]*>(.*?)<\/li>/gi;
    let match;
    while ((match = listRegex.exec(html)) !== null) {
        const itemText = stripHtml(match[1]);
        if (itemText) {
            listItems.push(itemText);
        }
    }

    // 如果没有从 HTML 中提取到列表项，使用大纲中的内容
    if (listItems.length === 0 && outline.content && Array.isArray(outline.content)) {
        outline.content.forEach(item => {
            if (typeof item === 'string') {
                listItems.push(item);
            }
        });
    }

    // 提取段落文本
    const paragraphs = [];
    const pRegex = /<p[^>]*>(.*?)<\/p>/gi;
    while ((match = pRegex.exec(html)) !== null) {
        const pText = stripHtml(match[1]);
        if (pText && !listItems.includes(pText)) {
            paragraphs.push(pText);
        }
    }

    // 获取背景色
    const bgMatch = html.match(/background[:\s]+([^;"]+)/i) ||
                    html.match(/background-color[:\s]+([^;"]+)/i);
    let bgColor = 'FFFFFF';
    if (bgMatch) {
        const bgValue = bgMatch[1].trim();
        if (bgValue.startsWith('#')) {
            bgColor = bgValue.replace('#', '');
        } else if (bgValue.includes('1e1e1e') || bgValue.includes('0d0d0d')) {
            // 深色背景
            bgColor = '1E1E1E';
        }
    }

    // 判断是否为深色背景
    const isDarkBg = bgColor === '1E1E1E' || bgColor === '2D2D2D' || bgColor === '333333';
    const textColor = isDarkBg ? 'FFFFFF' : '2C3E50';
    const subtitleColor = isDarkBg ? 'E0E0E0' : '34495E';

    // 设置幻灯片背景
    slide.background = { color: bgColor };

    // 计算布局参数
    const slideWidth = ratio === '16:9' ? 10 : 10;
    const slideHeight = ratio === '16:9' ? 5.625 : 7.5;
    const margin = 0.5;
    const contentWidth = slideWidth - margin * 2;

    // 添加标题
    if (title) {
        slide.addText(title, {
            x: margin,
            y: margin,
            w: contentWidth,
            h: 0.8,
            fontSize: 28,
            bold: true,
            color: textColor,
            align: 'center',
            fontFace: 'Microsoft YaHei'
        });
    }

    // 添加列表项
    if (listItems.length > 0) {
        const startY = title ? 1.2 : margin;
        const itemHeight = 0.6;
        const maxItems = Math.min(listItems.length, 6);

        for (let i = 0; i < maxItems; i++) {
            const itemY = startY + i * itemHeight;

            // 添加项目符号
            slide.addText('•', {
                x: margin + 0.1,
                y: itemY,
                w: 0.3,
                h: itemHeight,
                fontSize: 20,
                color: subtitleColor,
                align: 'center',
                fontFace: 'Microsoft YaHei'
            });

            // 添加列表文本
            slide.addText(listItems[i], {
                x: margin + 0.5,
                y: itemY,
                w: contentWidth - 0.6,
                h: itemHeight,
                fontSize: 16,
                color: subtitleColor,
                valign: 'middle',
                fontFace: 'Microsoft YaHei',
                wrap: true
            });
        }
    }

    // 添加段落文本（如果没有列表项）
    if (listItems.length === 0 && paragraphs.length > 0) {
        const startY = title ? 1.2 : margin;
        const combinedText = paragraphs.slice(0, 3).join('\n\n');

        slide.addText(combinedText, {
            x: margin,
            y: startY,
            w: contentWidth,
            h: slideHeight - startY - margin,
            fontSize: 14,
            color: subtitleColor,
            fontFace: 'Microsoft YaHei',
            wrap: true
        });
    }

    // 添加页码
    slide.addText(`${outline.number || 1}`, {
        x: slideWidth - margin - 0.5,
        y: slideHeight - margin - 0.3,
        w: 0.5,
        h: 0.3,
        fontSize: 10,
        color: isDarkBg ? '888888' : '999999',
        align: 'right',
        fontFace: 'Microsoft YaHei'
    });
}

/**
 * 添加空白占位幻灯片
 */
function addPlaceholderSlide(slide, outline, pageNum, ratio) {
    const slideWidth = ratio === '16:9' ? 10 : 10;
    const slideHeight = ratio === '16:9' ? 5.625 : 7.5;

    slide.background = { color: 'F5F5F5' };

    slide.addText(`第 ${pageNum} 页`, {
        x: 0,
        y: slideHeight / 2 - 0.5,
        w: slideWidth,
        h: 1,
        fontSize: 32,
        color: '999999',
        align: 'center',
        fontFace: 'Microsoft YaHei'
    });

    slide.addText('（待生成）', {
        x: 0,
        y: slideHeight / 2 + 0.3,
        w: slideWidth,
        h: 0.5,
        fontSize: 16,
        color: 'BBBBBB',
        align: 'center',
        fontFace: 'Microsoft YaHei'
    });
}

/**
 * 去除 HTML 标签
 */
function stripHtml(html) {
    if (!html) return '';
    return html
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .trim();
}

module.exports = router;
