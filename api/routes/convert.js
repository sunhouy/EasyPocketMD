const express = require('express');
const router = express.Router();
const markdownIt = require('markdown-it');
const markdownItTaskLists = require('markdown-it-task-lists');
const markdownItMathjax3 = require('markdown-it-mathjax3');
const markdownItFootnote = require('markdown-it-footnote');
const wkhtmltopdf = require('wkhtmltopdf');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const { spawn } = require('child_process');
const { v4: uuidv4 } = require('uuid');

// Initialize markdown-it with common options
const md = markdownIt({
    html: true,        // Enable HTML tags in source
    xhtmlOut: true,    // Use '/' to close single tags (<br />)
    breaks: true,      // Convert '\n' in paragraphs into <br>
    linkify: true,     // Autoconvert URL-like text to links
    typographer: true  // Enable some language-neutral replacement + quotes beautification
});

// Use plugins
md.use(markdownItTaskLists);
md.use(markdownItMathjax3);
md.use(markdownItFootnote);

/**
 * Clean up MathJax-related content from HTML (Node.js version using regex)
 * 1. Remove all MathJax scripts
 * 2. Remove <mjx-assistive-mml> nodes
 * 3. Process <mjx-container> to keep only SVG wrapped in div
 * @param {string} html - The HTML content to clean
 * @returns {string} - Cleaned HTML
 */
function cleanMathJaxContent(html) {
    try {
        let cleaned = html;
        
        cleaned = cleaned.replace(/<script[^>]*src[^>]*mathjax[^>]*>[\s\S]*?<\/script>/gi, '');
        cleaned = cleaned.replace(/<script[^>]*id[^>]*MathJax[^>]*>[\s\S]*?<\/script>/gi, '');
        
        cleaned = cleaned.replace(/<script[^>]*>[\s\S]*?mathjax[\s\S]*?<\/script>/gi, '');
        
        cleaned = cleaned.replace(/<mjx-assistive-mml[^>]*>[\s\S]*?<\/mjx-assistive-mml>/gi, '');
        
        cleaned = cleaned.replace(/<mjx-container([^>]*)>([\s\S]*?)<\/mjx-container>/gi, (_match, attrs, content) => {
            // Extract SVG from the content
            const svgMatch = content.match(/<svg[\s\S]*?<\/svg>/i);
            if (svgMatch) {
                const isDisplayMath = /display\s*=\s*"true"/i.test(attrs || '');
                const svg = svgMatch[0]
                    .replace(/<svg\b/i, '<svg preserveAspectRatio="xMidYMid meet"')
                    .replace(/\sstyle\s*=\s*"[^"]*"/i, '');

                if (isDisplayMath) {
                    return `<div class="docx-math-svg docx-math-display">${svg}</div>`;
                }

                return `<span class="docx-math-svg docx-math-inline">${svg}</span>`;
            }
            return '';
        });
        
        return cleaned;
    } catch (error) {
        console.error('[PDF Debug] Error cleaning MathJax content:', error);
        return html;
    }
}

router.post('/markdown', (req, res) => {
    try {
        const { content } = req.body;
        
        if (!content) {
            return res.status(400).json({ 
                code: 400, 
                message: 'Content is required' 
            });
        }

        const html = md.render(content);
        
        return res.json({
            code: 200,
            data: html
        });
    } catch (error) {
        console.error('Markdown conversion error:', error);
        return res.status(500).json({
            code: 500,
            message: 'Conversion failed',
            error: error.message
        });
    }
});

router.post('/pdf', (req, res) => {
    let writeStream = null;
    let pdfStream = null;

    try {
        let { html, settings } = req.body;

        if (!html) {
            return res.status(400).json({
                code: 400,
                message: 'HTML content is required'
            });
        }

        html = cleanMathJaxContent(html);

        // 处理字体设置
        const titleFont = settings?.titleFont || 'SimHei';
        const bodyFont = settings?.bodyFont || 'SimSun';

        // 注入字体样式到HTML
        html = html.replace(
            /<style>/i,
            `<style>
                h1, h2, h3, h4, h5, h6 { font-family: "${titleFont}", sans-serif !important; }
                body, p, li, td, th { font-family: "${bodyFont}", serif !important; }
            `
        );

        const filename = `${uuidv4()}.pdf`;
        const uploadDir = path.join(__dirname, '../../uploads');

        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }

        const filePath = path.join(uploadDir, filename);
        const fileUrl = `/uploads/${filename}`;

        const options = {
            pageSize: 'A4',
            marginTop: settings?.pageMargin ? `${settings.pageMargin}mm` : '15mm',
            marginBottom: settings?.pageMargin ? `${settings.pageMargin}mm` : '15mm',
            marginLeft: settings?.pageMargin ? `${settings.pageMargin}mm` : '15mm',
            marginRight: settings?.pageMargin ? `${settings.pageMargin}mm` : '15mm',
            printMediaType: true,
            enableLocalFileAccess: true,
            encoding: 'UTF-8'
        };

        writeStream = fs.createWriteStream(filePath);
        pdfStream = wkhtmltopdf(html, options);
        
        const cleanup = () => {
            if (pdfStream) {
                pdfStream.destroy();
                pdfStream = null;
            }
            if (writeStream) {
                writeStream.destroy();
                writeStream = null;
            }
        };

        pdfStream.on('error', (err) => {
            console.error('[PDF Debug] wkhtmltopdf command error:', err);
            cleanup();
            if (!res.headersSent) {
                res.status(500).json({
                    code: 500,
                    message: 'PDF generation failed (command error)',
                    error: err.message
                });
            }
            if (fs.existsSync(filePath)) {
                fs.unlink(filePath, () => {});
            }
        });

        writeStream.on('error', (err) => {
            console.error('[PDF Debug] writeStream error:', err);
            cleanup();
            if (!res.headersSent) {
                res.status(500).json({
                    code: 500,
                    message: 'PDF generation failed (stream error)',
                    error: err.message
                });
            }
        });

        pdfStream.pipe(writeStream)
            .on('finish', () => {
                if (fs.existsSync(filePath)) {
                    const stats = fs.statSync(filePath);
                    if (stats.size > 0) {
                        if (!res.headersSent) {
                            res.json({
                                code: 200,
                                message: 'PDF generated successfully',
                                url: fileUrl
                            });
                        }
                    } else {
                        console.error('[PDF Debug] PDF generation failed: file is empty');
                        cleanup();
                        fs.unlink(filePath, () => {});
                        if (!res.headersSent) {
                            res.status(500).json({
                                code: 500,
                                message: 'PDF generation failed: file is empty'
                            });
                        }
                    }
                } else {
                    console.error('[PDF Debug] PDF generation failed: file not found');
                    cleanup();
                    if (!res.headersSent) {
                        res.status(500).json({
                            code: 500,
                            message: 'PDF generation failed: file not found'
                        });
                    }
                }
            });

        const timeout = setTimeout(() => {
            if (!res.headersSent) {
                cleanup();
                if (fs.existsSync(filePath)) {
                    fs.unlink(filePath, () => {});
                }
                res.status(504).json({
                    code: 504,
                    message: 'PDF generation timeout'
                });
            }
        }, 120000);

        res.on('finish', () => {
            clearTimeout(timeout);
        });

    } catch (error) {
        console.error('PDF conversion endpoint error:', error);
        if (writeStream) writeStream.destroy();
        if (pdfStream) pdfStream.destroy();
        return res.status(500).json({
            code: 500,
            message: 'Server error during PDF conversion',
            error: error.message
        });
    }
});

router.post('/ocr', async (req, res) => {
    try {
        const imageUrl = String(req.body && req.body.imageUrl ? req.body.imageUrl : '').trim();
        const lang = String(req.body && req.body.lang ? req.body.lang : 'chi_tra+chi_sim+eng').trim();
        const fallbackOcrApi = String(req.body && req.body.fallbackOcrApi ? req.body.fallbackOcrApi : '').trim();
        const ocrApi = process.env.OCR_API_URL || fallbackOcrApi || 'https://ocr.yhsun.cn/';

        if (!imageUrl) {
            return res.status(400).json({
                code: 400,
                message: 'imageUrl is required'
            });
        }

        let imageResponse;
        try {
            imageResponse = await fetch(imageUrl);
        } catch (fetchErr) {
            return res.status(502).json({
                code: 502,
                message: 'Failed to fetch image from source',
                error: fetchErr.message
            });
        }

        if (!imageResponse.ok) {
            return res.status(502).json({
                code: 502,
                message: 'Failed to fetch image from source',
                error: 'HTTP ' + imageResponse.status
            });
        }

        const imageType = imageResponse.headers.get('content-type') || 'image/png';
        const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());

        const formData = new FormData();
        formData.append('file', new Blob([imageBuffer], { type: imageType }), 'ocr-image.png');
        formData.append('lang', lang);

        const ocrResponse = await fetch(ocrApi, {
            method: 'POST',
            body: formData
        });

        if (!ocrResponse.ok) {
            const fallbackText = await ocrResponse.text().catch(() => '');
            return res.status(502).json({
                code: 502,
                message: 'OCR upstream request failed',
                error: 'HTTP ' + ocrResponse.status + (fallbackText ? (': ' + fallbackText.slice(0, 200)) : '')
            });
        }

        let ocrData;
        try {
            ocrData = await ocrResponse.json();
        } catch (parseErr) {
            const rawText = await ocrResponse.text().catch(() => '');
            return res.status(502).json({
                code: 502,
                message: 'OCR upstream response parse failed',
                error: parseErr.message,
                raw: rawText.slice(0, 300)
            });
        }

        return res.json({
            code: 200,
            message: 'OCR success',
            data: ocrData
        });
    } catch (error) {
        console.error('OCR conversion endpoint error:', error);
        return res.status(500).json({
            code: 500,
            message: 'Server error during OCR conversion',
            error: error.message
        });
    }
});

function toFiniteNumber(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function toSafeAlign(value, fallback) {
    const normalized = String(value || '').toLowerCase();
    if (normalized === 'left' || normalized === 'center' || normalized === 'right' || normalized === 'justify') {
        return normalized;
    }
    return fallback;
}

function buildDocxStyledHtml(markdown, settings = {}) {
    const pageMargin = toFiniteNumber(settings.pageMargin, 25);
    const bodyFontSize = toFiniteNumber(settings.bodyFontSize, 12);
    const lineHeight = toFiniteNumber(settings.lineHeight, 1.5);
    const paragraphSpacing = toFiniteNumber(settings.paragraphSpacing, 0.5);
    const titleFontSize = toFiniteNumber(settings.titleFontSize, 18);
    const useCustomHeadingSizes = settings.useCustomHeadingSizes === true;

    const bodyAlignment = toSafeAlign(settings.alignment, 'left');
    const headingAlignment = toSafeAlign(settings.titleAlignment, 'left');
    const imgWidth = settings.imgWidth || '100%';
    const imgHeight = settings.imgHeight || 'auto';

    // 获取字体设置
    const titleFont = settings.titleFont || 'SimHei';
    const bodyFont = settings.bodyFont || 'SimSun';

    const headingSizes = {
        h1: useCustomHeadingSizes ? toFiniteNumber(settings.h1Size, 32) : titleFontSize * 2,
        h2: useCustomHeadingSizes ? toFiniteNumber(settings.h2Size, 28) : titleFontSize * 1.6,
        h3: useCustomHeadingSizes ? toFiniteNumber(settings.h3Size, 24) : titleFontSize * 1.35,
        h4: useCustomHeadingSizes ? toFiniteNumber(settings.h4Size, 20) : titleFontSize * 1.2,
        h5: useCustomHeadingSizes ? toFiniteNumber(settings.h5Size, 18) : titleFontSize,
        h6: useCustomHeadingSizes ? toFiniteNumber(settings.h6Size, 16) : Math.max(14, titleFontSize * 0.9)
    };

    const processedMarkdown = String(markdown || '').replace(/```mermaid\n([\s\S]*?)```/g, (_match, content) => {
        return `\n> [Mermaid Diagram]\n>\n> ${String(content || '').trim().split('\n').join('\n> ')}\n`;
    });

    let html = md.render(processedMarkdown);
    html = cleanMathJaxContent(html);

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="utf-8" />
    <style>
        @page { margin: ${pageMargin}mm; }
        * {
            color: #000000 !important;
        }
        body {
            font-family: "${bodyFont}", "Noto Serif CJK SC", "SimSun", "Microsoft YaHei", serif;
            font-size: ${bodyFontSize}pt;
            line-height: ${lineHeight};
            text-align: ${bodyAlignment};
            word-break: break-word;
            color: #000000;
        }
        p {
            margin: 0 0 ${paragraphSpacing}em 0;
            font-family: "${bodyFont}", "Noto Serif CJK SC", "SimSun", "Microsoft YaHei", serif;
            font-size: ${bodyFontSize}pt;
            color: #000000;
        }
        h1, h2, h3, h4, h5, h6 {
            font-family: "${titleFont}", "SimHei", "Microsoft YaHei", sans-serif;
            text-align: ${headingAlignment};
            margin: 1em 0 0.6em 0;
            font-weight: 700;
            color: #000000 !important;
        }
        h1 { font-size: ${headingSizes.h1}pt; }
        h2 { font-size: ${headingSizes.h2}pt; }
        h3 { font-size: ${headingSizes.h3}pt; }
        h4 { font-size: ${headingSizes.h4}pt; }
        h5 { font-size: ${headingSizes.h5}pt; }
        h6 { font-size: ${headingSizes.h6}pt; }
        pre {
            background: #f7f7f7;
            border: 1px solid #e0e0e0;
            border-radius: 4px;
            padding: 10px;
            white-space: pre-wrap;
            font-family: "Consolas", "Courier New", monospace;
        }
        code {
            font-family: "Consolas", "Courier New", monospace;
            color: #000000;
        }
        blockquote {
            border-left: 3px solid #d0d0d0;
            margin: 0.8em 0;
            padding-left: 0.8em;
            color: #555;
        }
        table {
            border-collapse: collapse;
            width: 100%;
            margin: 0.8em 0;
        }
        th, td {
            border: 1px solid #333;
            padding: 6px 8px;
            font-family: "${bodyFont}", "Noto Serif CJK SC", "SimSun", "Microsoft YaHei", serif;
            font-size: ${bodyFontSize}pt;
            color: #000000;
        }
        th {
            background: #f0f0f0;
            font-weight: 700;
        }
        li {
            font-family: "${bodyFont}", "Noto Serif CJK SC", "SimSun", "Microsoft YaHei", serif;
            font-size: ${bodyFontSize}pt;
            color: #000000;
        }
        img {
            display: block;
            width: auto;
            height: ${imgHeight};
            max-width: 100%;
            margin: 0.8em auto;
        }
        .docx-math-svg {
            line-height: 1;
        }
        .docx-math-inline {
            display: inline-block;
            vertical-align: middle;
            margin: 0 0.1em;
        }
        .docx-math-display {
            display: block;
            text-align: center;
            margin: 0.8em 0;
        }
        .docx-math-svg svg {
            display: inline-block;
            width: auto;
            height: auto;
            max-width: ${imgWidth};
        }
        a {
            color: #0066cc;
            text-decoration: underline;
        }
    </style>
</head>
<body>
${html}
</body>
</html>`;
}

function normalizeDocxMarkdown(markdown) {
    let normalized = String(markdown || '');

    normalized = normalized.replace(/```mermaid\n([\s\S]*?)```/g, (_match, content) => {
        return `\n> [Mermaid Diagram]\n>\n> ${String(content || '').trim().split('\n').join('\n> ')}\n`;
    });

    normalized = normalized
        .replace(/\\\\\[([\s\S]*?)\\\\\]/g, (_, expr) => `$$\n${String(expr || '').trim()}\n$$`)
        .replace(/\\\\\(([\s\S]*?)\\\\\)/g, (_, expr) => `$${String(expr || '').trim()}$`);

    normalized = normalized
        .replace(/\\\$\\\$([\s\S]*?)\\\$\\\$/g, (_, expr) => `$$\n${String(expr || '').trim()}\n$$`)
        .replace(/\\\$([^\n$]+?)\\\$/g, (_, expr) => `$${String(expr || '').trim()}$`);

    return normalized;
}

async function runPandocDocx(inputContent, options = {}) {
    const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'easypocketmd-docx-'));
    const inputFormat = options.inputFormat || 'markdown+task_lists+tex_math_dollars+tex_math_single_backslash+tex_math_double_backslash+fenced_code_blocks+pipe_tables';
    const inputExt = inputFormat === 'html' ? 'html' : 'md';
    const inputPath = path.join(tempDir, `input.${inputExt}`);
    const outputPath = path.join(tempDir, 'output.docx');

    try {
        await fsp.writeFile(inputPath, inputContent, 'utf8');

        const args = [
            inputPath,
            '-f',
            inputFormat,
            '-t',
            'docx',
            '-o',
            outputPath,
            '--standalone'
        ];

        // 根据字体选择reference文档
        const titleFont = options.titleFont || 'SimHei';
        const bodyFont = options.bodyFont || 'SimSun';

        // 构建reference文档路径
        const referenceDir = path.join(__dirname, '../../reference-docs');
        const fontKey = `${titleFont.toLowerCase()}-${bodyFont.toLowerCase()}`;
        const referenceMap = {
            'simhei-simsun': 'reference-simhei-simsun.docx',
            'simhei-simkai': 'reference-simhei-simkai.docx',
            'simsun-simsun': 'reference-simsun-simsun.docx',
            'simkai-simsun': 'reference-simkai-simsun.docx',
        };

        const referenceFile = referenceMap[fontKey] || 'reference.docx';
        const referencePath = path.join(referenceDir, referenceFile);

        // 优先使用字体对应的reference文档
        if (fs.existsSync(referencePath)) {
            args.push('--reference-doc', referencePath);
        } else {
            // 如果没有找到，尝试使用配置的reference文档
            const configuredReference = (options.referenceDocx || process.env.PANDOC_REFERENCE_DOCX || '').trim();
            if (configuredReference) {
                const configPath = path.isAbsolute(configuredReference)
                    ? configuredReference
                    : path.join(process.cwd(), configuredReference);
                if (fs.existsSync(configPath)) {
                    args.push('--reference-doc', configPath);
                }
            }
        }

        await new Promise((resolve, reject) => {
            const child = spawn('pandoc', args, {
                windowsHide: true
            });

            let stderr = '';

            child.stderr.on('data', (chunk) => {
                stderr += chunk.toString();
            });

            child.on('error', (error) => {
                reject(error);
            });

            child.on('close', (code) => {
                if (code === 0) {
                    resolve();
                    return;
                }
                reject(new Error(`Pandoc exited with code ${code}: ${stderr || 'unknown error'}`));
            });
        });

        return await fsp.readFile(outputPath);
    } finally {
        await fsp.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
}

// Word (DOCX) Conversion endpoint (Pandoc)
router.post('/docx', async (req, res) => {
    try {
        const { markdown, referenceDocx, settings } = req.body || {};

        if (!markdown || typeof markdown !== 'string') {
            return res.status(400).json({
                code: 400,
                message: 'Markdown content is required'
            });
        }

        const docxSettings = settings || {};
        const docxMathMode = String(docxSettings.docxMathMode || '').toLowerCase();
        const useNativeMath = docxMathMode !== 'svg' && docxMathMode !== 'html';

        const pandocOptions = {
            referenceDocx,
            titleFont: docxSettings.titleFont || 'SimHei',
            bodyFont: docxSettings.bodyFont || 'SimSun',
            inputFormat: useNativeMath
                ? 'markdown+task_lists+tex_math_dollars+tex_math_single_backslash+tex_math_double_backslash+fenced_code_blocks+pipe_tables'
                : 'html'
        };

        const docxBuffer = useNativeMath
            ? await runPandocDocx(normalizeDocxMarkdown(markdown), pandocOptions)
            : await runPandocDocx(buildDocxStyledHtml(markdown, docxSettings), pandocOptions);

        const filename = `document_${new Date().toISOString().slice(0, 10)}.docx`;

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
        return res.status(200).send(docxBuffer);
    } catch (error) {
        console.error('DOCX conversion endpoint error:', error);

        const missingPandoc = error && (error.code === 'ENOENT' || /pandoc/i.test(error.message || ''));
        return res.status(500).json({
            code: 500,
            message: missingPandoc
                ? 'Pandoc is not installed or not available in PATH'
                : 'DOCX conversion failed: ' + (error.message || 'unknown error')
        });
    }
});

module.exports = router;
