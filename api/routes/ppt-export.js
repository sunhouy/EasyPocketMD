const express = require('express');
const router = express.Router();
const PptxGenJS = require('pptxgenjs');

const DEFAULT_EXPORT_ENGINE = process.env.PPT_EXPORT_ENGINE || (process.env.NODE_ENV === 'test' ? 'legacy' : 'browser');
let browserInstancePromise = null;

/**
 * PPT 导出 API
 * 接收前端传来的 PPT 数据，使用 pptxgenjs 在服务端生成 PPT 文件
 */

// POST /api/ppt-export - 导出 PPT
router.post('/', async (req, res) => {
    try {
        const { topic, pages, outline, ratio = '16:9' } = req.body;
        const exportEngine = resolveExportEngine(req.body && req.body.engine);

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

            // 优先使用浏览器渲染导出（样式一致性更高），失败回退 legacy 解析
            if (pageHtml) {
                const rendered = await addBrowserRenderedSlide(slide, pageHtml, ratio, exportEngine);
                if (!rendered) {
                    await addHtmlToSlide(slide, pageHtml, pageOutline, ratio);
                }
            } else {
                // 空白页或待生成页面
                addPlaceholderSlide(slide, pageOutline, i + 1, ratio);
            }
        }

        // 生成文件并发送给客户端
        const fileName = `${topic || 'PPT'}_${Date.now()}.pptx`;
        const pptBuffer = await pptx.write({ outputType: 'nodebuffer' });

        // 仅在生成成功后写响应头，避免错误分支出现 headers 冲突
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
        return res.status(200).send(pptBuffer);

    } catch (error) {
        console.error('PPT 导出错误:', error);
        res.status(500).json({
            code: 500,
            message: '服务器内部错误: ' + error.message
        });
    }
});

function resolveExportEngine(requestedEngine) {
    const candidate = (requestedEngine || DEFAULT_EXPORT_ENGINE || '').toString().toLowerCase();
    return candidate === 'browser' ? 'browser' : 'legacy';
}

function getSlideSize(ratio) {
    return ratio === '16:9'
        ? { width: 10, height: 5.625 }
        : { width: 10, height: 7.5 };
}

async function addBrowserRenderedSlide(slide, html, ratio, exportEngine) {
    if (exportEngine !== 'browser') return false;

    try {
        const screenshotData = await renderHtmlToPngDataUrl(html, ratio);
        const { width, height } = getSlideSize(ratio);
        slide.addImage({
            data: screenshotData,
            x: 0,
            y: 0,
            w: width,
            h: height
        });
        return true;
    } catch (error) {
        console.error('PPT browser render failed, fallback to legacy engine:', error.message);
        return false;
    }
}

async function renderHtmlToPngDataUrl(rawHtml, ratio) {
    const chromium = getPlaywrightChromium();
    const browser = await getBrowserInstance(chromium);
    const page = await browser.newPage({
        viewport: ratio === '16:9'
            ? { width: 1600, height: 900 }
            : { width: 1200, height: 900 }
    });

    try {
        const normalizedHtml = normalizeHtmlInput(rawHtml);
        const wrapped = wrapSlideHtml(normalizedHtml, ratio);
        await page.setContent(wrapped, { waitUntil: 'networkidle' });

        // 等待字体和布局稳定，避免截图抖动
        await page.evaluate(async () => {
            if (document.fonts && document.fonts.ready) {
                await document.fonts.ready;
            }
        });

        const node = await page.$('#ppt-slide-root');
        if (!node) {
            throw new Error('render root not found');
        }
        const imageBuffer = await node.screenshot({ type: 'png' });
        return `data:image/png;base64,${imageBuffer.toString('base64')}`;
    } finally {
        await page.close();
    }
}

function wrapSlideHtml(innerHtml, ratio) {
    const size = ratio === '16:9'
        ? { width: 1600, height: 900 }
        : { width: 1200, height: 900 };

    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    html, body {
      margin: 0;
      padding: 0;
      width: ${size.width}px;
      height: ${size.height}px;
      overflow: hidden;
      background: #ffffff;
      font-family: "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", Arial, sans-serif;
    }
    #ppt-slide-root {
      width: ${size.width}px;
      height: ${size.height}px;
      overflow: hidden;
      box-sizing: border-box;
      position: relative;
    }
    #ppt-slide-root *, #ppt-slide-root *::before, #ppt-slide-root *::after {
      box-sizing: border-box;
    }
  </style>
</head>
<body>
  <div id="ppt-slide-root">${innerHtml}</div>
</body>
</html>`;
}

function getPlaywrightChromium() {
    try {
        return require('playwright').chromium;
    } catch (error) {
        throw new Error('playwright not installed. Run: npm install playwright && npx playwright install chromium');
    }
}

async function getBrowserInstance(chromium) {
    if (!browserInstancePromise) {
        browserInstancePromise = chromium.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
    }
    return browserInstancePromise;
}

process.on('exit', async () => {
    if (!browserInstancePromise) return;
    try {
        const browser = await browserInstancePromise;
        await browser.close();
    } catch (e) {
        // ignore shutdown errors
    }
});

/**
 * 将 HTML 内容转换为 PPT 幻灯片元素
 */
async function addHtmlToSlide(slide, html, outline, ratio) {
    const normalizedHtml = normalizeHtmlInput(html);

    // 解析 HTML 中的基本结构
    // 提取标题
    const titleMatch = normalizedHtml.match(/<h1[^>]*>(.*?)<\/h1>/i) ||
                       normalizedHtml.match(/<h2[^>]*>(.*?)<\/h2>/i) ||
                       normalizedHtml.match(/<h3[^>]*>(.*?)<\/h3>/i);
    const title = titleMatch ? stripHtml(titleMatch[1]) : (outline.title || '');

    // 提取列表项
    const listItems = [];
    const listRegex = /<li[^>]*>(.*?)<\/li>/gi;
    let match;
    while ((match = listRegex.exec(normalizedHtml)) !== null) {
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
    while ((match = pRegex.exec(normalizedHtml)) !== null) {
        const pText = stripHtml(match[1]);
        if (pText && !listItems.includes(pText)) {
            paragraphs.push(pText);
        }
    }

    const stylePalette = extractStylePalette(normalizedHtml);
    const bgColor = stylePalette.bgColor;

    // 判断是否为深色背景
    const isDarkBg = isDarkColor(bgColor);
    const textColor = stylePalette.textColor || (isDarkBg ? 'FFFFFF' : '2C3E50');
    const subtitleColor = stylePalette.subtitleColor || (isDarkBg ? 'E0E0E0' : '34495E');

    // 设置幻灯片背景
    slide.background = { color: bgColor };

    // 渐变背景场景使用强调色形状块补偿导出视觉
    if (stylePalette.gradient && stylePalette.gradient.isGradient) {
        addGradientAccentShapes(slide, stylePalette.gradient, ratio);
    }

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

function normalizeHtmlInput(rawHtml) {
    if (!rawHtml || typeof rawHtml !== 'string') return '';

    let html = rawHtml.trim();
    html = html.replace(/^```(?:html)?\s*/i, '').replace(/\s*```\s*$/i, '');

    if (html.includes('&lt;') || html.includes('&gt;') || html.includes('&amp;')) {
        html = decodeHtmlEntities(html);
    }

    html = html.replace(/<html[^>]*>|<\/html>/gi, '');
    html = html.replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '');
    html = html.replace(/<body[^>]*>|<\/body>/gi, '');

    if (!/<[a-z][\s\S]*>/i.test(html) && /&lt;\/?[a-z]/i.test(html)) {
        html = decodeHtmlEntities(html);
    }

    return html.trim();
}

function decodeHtmlEntities(text) {
    if (!text) return '';
    return text
        .replace(/&nbsp;/g, ' ')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
}

function extractStylePalette(html) {
    const firstTagStyleMatch = html.match(/<[^>]+style\s*=\s*['\"]([^'\"]+)['\"][^>]*>/i);
    const styleText = firstTagStyleMatch ? firstTagStyleMatch[1] : '';

    const bgRaw = extractCssValue(styleText, 'background') || extractCssValue(styleText, 'background-color');
    const gradient = parseLinearGradientColors(bgRaw);
    const titleStyleMatch = html.match(/<h[1-3][^>]+style\s*=\s*['\"]([^'\"]+)['\"][^>]*>/i);
    const titleStyle = titleStyleMatch ? titleStyleMatch[1] : '';

    const bgColor = (gradient.isGradient ? gradient.primaryColor : parseCssColor(bgRaw)) || 'FFFFFF';
    const textColor = parseCssColor(extractCssValue(titleStyle, 'color') || extractCssValue(styleText, 'color'));
    const subtitleColor = parseCssColor(extractCssValue(styleText, 'color')) || gradient.accentColor;

    return { bgColor, textColor, subtitleColor, gradient };
}

function parseLinearGradientColors(backgroundValue) {
    if (!backgroundValue) {
        return { isGradient: false, primaryColor: '', accentColor: '' };
    }

    const raw = backgroundValue.trim();
    if (!/linear-gradient\s*\(/i.test(raw)) {
        return { isGradient: false, primaryColor: '', accentColor: '' };
    }

    const colorTokenRegex = /#(?:[0-9a-f]{3}|[0-9a-f]{6})\b|rgba?\([^\)]*\)|\b[a-z]+\b/gi;
    const colors = [];
    let tokenMatch;
    while ((tokenMatch = colorTokenRegex.exec(raw)) !== null) {
        const color = parseCssColor(tokenMatch[0]);
        if (color && !colors.includes(color)) {
            colors.push(color);
        }
    }

    const primaryColor = colors[0] || '';
    const accentColor = colors[1] || colors[0] || '';

    return {
        isGradient: !!primaryColor,
        primaryColor,
        accentColor
    };
}

function addGradientAccentShapes(slide, gradient, ratio) {
    const shapeType = PptxGenJS.ShapeType ? PptxGenJS.ShapeType.rect : 'rect';
    const slideWidth = 10;
    const slideHeight = ratio === '16:9' ? 5.625 : 7.5;
    const accent = gradient.accentColor || gradient.primaryColor || '4A90E2';

    slide.addShape(shapeType, {
        x: 0,
        y: 0,
        w: 0.22,
        h: slideHeight,
        fill: { color: accent, transparency: 40 },
        line: { color: accent, transparency: 100 }
    });

    slide.addShape(shapeType, {
        x: slideWidth - 2.0,
        y: slideHeight - 1.0,
        w: 2.0,
        h: 1.0,
        fill: { color: accent, transparency: 55 },
        line: { color: accent, transparency: 100 }
    });
}

function extractCssValue(styleText, property) {
    if (!styleText) return '';
    const regex = new RegExp(`${property}\\s*:\\s*([^;]+)`, 'i');
    const match = styleText.match(regex);
    return match ? match[1].trim() : '';
}

function parseCssColor(rawValue) {
    if (!rawValue) return '';
    const value = rawValue.trim().toLowerCase();

    // linear-gradient(...) 等场景，提取第一个可识别颜色
    const gradientHex = value.match(/#([0-9a-f]{3}|[0-9a-f]{6})\b/i);
    if (gradientHex) {
        return normalizeHexColor(gradientHex[0]);
    }

    const hexMatch = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (hexMatch) {
        return normalizeHexColor(hexMatch[0]);
    }

    const rgbMatch = value.match(/rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    if (rgbMatch) {
        const r = Number(rgbMatch[1]);
        const g = Number(rgbMatch[2]);
        const b = Number(rgbMatch[3]);
        return toHexColor(r, g, b);
    }

    const named = {
        white: 'FFFFFF',
        black: '000000',
        red: 'FF0000',
        green: '008000',
        blue: '0000FF',
        gray: '808080',
        grey: '808080',
        yellow: 'FFFF00',
        orange: 'FFA500'
    };
    return named[value] || '';
}

function normalizeHexColor(hex) {
    const raw = hex.replace('#', '').toUpperCase();
    if (raw.length === 3) {
        return `${raw[0]}${raw[0]}${raw[1]}${raw[1]}${raw[2]}${raw[2]}`;
    }
    return raw;
}

function toHexColor(r, g, b) {
    const clamp = (n) => Math.max(0, Math.min(255, n));
    return [clamp(r), clamp(g), clamp(b)]
        .map((n) => n.toString(16).padStart(2, '0'))
        .join('')
        .toUpperCase();
}

function isDarkColor(hexColor) {
    if (!hexColor || hexColor.length !== 6) return false;
    const r = parseInt(hexColor.slice(0, 2), 16);
    const g = parseInt(hexColor.slice(2, 4), 16);
    const b = parseInt(hexColor.slice(4, 6), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance < 0.5;
}

/**
 * 添加空白占位幻灯片
 */
function addPlaceholderSlide(slide, outline, pageNum, ratio) {
    const { width: slideWidth, height: slideHeight } = getSlideSize(ratio);

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
