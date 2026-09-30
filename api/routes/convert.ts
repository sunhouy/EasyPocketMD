const express = require('express');
const router = express.Router();
const markdownIt = require('markdown-it');
const markdownItTaskLists = require('markdown-it-task-lists');
const markdownItFootnote = require('markdown-it-footnote');
const { normalizeDocxSettings, applyDocxTypography } = require('../utils/docxTypography');
const { prepareDocxDiagrams } = require('../utils/docxDiagrams');
const { renderPdf, validatePdfHtml } = require('../utils/pdfProcess');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const { spawn } = require('child_process');
const { v4: uuidv4 } = require('uuid');

let mdInstance = null;
let mdInitialization = null;

/** Share async initialization; the CJS MathJax loader blocks on dynamic import. */
async function getMarkdownRenderer() {
    if (mdInstance) return mdInstance;
    if (!mdInitialization) {
        mdInitialization = (async () => {
            const mathjax = await import('markdown-it-mathjax3');
            const md = markdownIt({ html: true, xhtmlOut: true, breaks: true, linkify: true, typographer: true });
            md.use(markdownItTaskLists);
            md.use(mathjax.default || mathjax);
            md.use(markdownItFootnote);
            mdInstance = md;
            return md;
        })().catch(error => { mdInitialization = null; throw error; });
    }
    return mdInitialization;
}

/**
 * Clean up MathJax-related content from HTML (Node.js version using regex)
 * 1. Remove all MathJax scripts
 * 2. Remove <mjx-assistive-mml> nodes
 * 3. Process <mjx-container> to keep only SVG wrapped in div
 * @param {string} html - The HTML content to clean
 * @returns {string} - Cleaned HTML
 */
const STATIC_ASSET_DIRS = {
    uploads: path.join(__dirname, '../../uploads'),
    screenshots: path.join(__dirname, '../../screenshots'),
    user_files: path.join(__dirname, '../../user_files'),
};

function mimeTypeFromPath(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.png') return 'image/png';
    if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
    if (ext === '.gif') return 'image/gif';
    if (ext === '.webp') return 'image/webp';
    if (ext === '.svg') return 'image/svg+xml';
    return 'application/octet-stream';
}

function resolveStaticAssetPath(src) {
    if (!src || typeof src !== 'string' || src.startsWith('data:')) {
        return null;
    }

    try {
        const normalized = src.replace(/^https?:\/\/[^/]+/i, '');
        const match = normalized.match(/^\/(uploads|screenshots|user_files)\/([^?#]+)/i);
        if (!match) {
            return null;
        }

        const localPath = path.join(STATIC_ASSET_DIRS[match[1]], decodeURIComponent(match[2]));
        if (!localPath.startsWith(STATIC_ASSET_DIRS[match[1]] + path.sep)) {
            return null;
        }
        if (fs.existsSync(localPath)) {
            return localPath;
        }
    } catch (error) {
        console.warn('[PDF Debug] Failed to resolve static asset path:', src, error.message);
    }

    return null;
}

/** Inline /uploads/ etc. as data URLs so wkhtmltopdf does not HTTP-fetch the same server. */
function inlineStaticAssetsForPdf(html) {
    let assetBytes = 0;
    return String(html || '').replace(
        /(<(?:img|embed)[^>]+src=)(["'])([^"']+)\2/gi,
        (full, prefix, quote, src) => {
            const localPath = resolveStaticAssetPath(src);
            if (!localPath) {
                return full;
            }

            try {
                const size = fs.statSync(localPath).size;
                if (size > 5 * 1024 * 1024 || assetBytes + size > 6 * 1024 * 1024) {
                    throw new Error('PDF images exceed the export size limit');
                }
                const data = fs.readFileSync(localPath);
                assetBytes += data.length;
                const dataUrl = `data:${mimeTypeFromPath(localPath)};base64,${data.toString('base64')}`;
                return `${prefix}${quote}${dataUrl}${quote}`;
            } catch (error) {
                if (error.message === 'PDF images exceed the export size limit') throw error;
                console.warn('[PDF Debug] Failed to inline asset:', src, error.message);
                return full;
            }
        }
    );
}

function sanitizeHtmlForWkhtmltopdf(html) {
    let cleaned = String(html || '');

    cleaned = cleaned.replace(/<script\b[\s\S]*?<\/script>/gi, '');

    cleaned = cleaned.replace(
        /<div\b[^>]*class=["'][^"']*mermaid[^"']*["'][^>]*>[\s\S]*?<\/div>/gi,
        (block) => {
            if (/<(?:img|svg)\b/i.test(block)) {
                return block;
            }
            return '<div style="text-align:center;color:#666;margin:1em 0;">[Diagram]</div>';
        }
    );

    cleaned = cleaned.replace(
        /<pre\b[^>]*>\s*<code\b[^>]*class=["'][^"']*language-mermaid[^"']*["'][^>]*>[\s\S]*?<\/code>\s*<\/pre>/gi,
        '<div style="text-align:center;color:#666;margin:1em 0;">[Diagram]</div>'
    );

    return cleaned;
}

function prepareHtmlForWkhtmltopdf(html) {
    let prepared = cleanMathJaxContent(html);
    prepared = sanitizeHtmlForWkhtmltopdf(prepared);
    prepared = inlineStaticAssetsForPdf(prepared);
    return prepared;
}

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
                const isDisplayMath = /display\s*=\s*["']true["']/i.test(attrs || '');
                const svg = svgMatch[0]
                    .replace(/<svg\b/i, '<svg preserveAspectRatio="xMidYMid meet"')
                    .replace(/\sstyle\s*=\s*"[^"]*"/i, '');

                if (isDisplayMath) {
                    return `<div class="docx-math-svg docx-math-display">${svg}</div>`;
                }

                return `<span class="docx-math-svg docx-math-inline" style="display:inline-block;vertical-align:middle;margin:0;white-space:nowrap;">${svg}</span>`;
            }
            return '';
        });
        
        return cleaned;
    } catch (error) {
        console.error('[PDF Debug] Error cleaning MathJax content:', error);
        return html;
    }
}

router.post('/markdown', async (req, res) => {
    try {
        const { content } = req.body;
        
        if (!content) {
            return res.status(400).json({ 
                code: 400, 
                message: 'Content is required' 
            });
        }

        const html = (await getMarkdownRenderer()).render(content);
        
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

router.post('/pdf', async (req, res) => {
    const controller = new AbortController();
    const cancel = () => { if (!res.writableEnded) controller.abort(); };
    res.on('close', cancel);
    let filePath = null;
    try {
        let { html, settings } = req.body;
        validatePdfHtml(html);
        html = prepareHtmlForWkhtmltopdf(html);
        validatePdfHtml(html);
        const titleFont = String(settings?.titleFont || 'SimHei').replace(/["\\<>]/g, '');
        const bodyFont = String(settings?.bodyFont || 'SimSun').replace(/["\\<>]/g, '');
        html = html.replace(/<style>/i, `<style>
            h1, h2, h3, h4, h5, h6 { font-family: "${titleFont}", sans-serif !important; }
            body, p, li, td, th { font-family: "${bodyFont}", serif !important; }
        `);
        const filename = `${uuidv4()}.pdf`;
        const uploadDir = path.join(__dirname, '../../uploads');
        await fsp.mkdir(uploadDir, { recursive: true });
        filePath = path.join(uploadDir, filename);
        const options = {
            pageSize: 'A4',
            marginTop: settings?.pageMargin ? `${settings.pageMargin}mm` : '15mm',
            marginBottom: settings?.pageMargin ? `${settings.pageMargin}mm` : '15mm',
            marginLeft: settings?.pageMargin ? `${settings.pageMargin}mm` : '15mm',
            marginRight: settings?.pageMargin ? `${settings.pageMargin}mm` : '15mm',
            printMediaType: true,
            disableLocalFileAccess: true,
            encoding: 'UTF-8',
            imageQuality: 75,
            imageDpi: 150,
            disableJavascript: true,
            loadErrorHandling: 'ignore',
            loadMediaErrorHandling: 'ignore'
        };

        await renderPdf(html, options, filePath, controller.signal);
        const stats = await fsp.stat(filePath);
        if (!stats.size) throw new Error('PDF generation failed: file is empty');
        if (!controller.signal.aborted) res.json({ code: 200, message: 'PDF generated successfully', url: `/uploads/${filename}` });
    } catch (error) {
        if (filePath) await fsp.unlink(filePath).catch(() => {});
        if (!controller.signal.aborted && !res.headersSent) {
            const status = error.status || 500;
            if (status === 503) res.set('Retry-After', '5');
            res.status(status).json({ code: status, message: error.message || 'PDF generation failed' });
        }
    } finally {
        res.removeListener('close', cancel);
    }
});

router.post('/ocr', async (req, res) => {
    try {
        const imageUrl = String(req.body && req.body.imageUrl ? req.body.imageUrl : '').trim();
        const lang = String(req.body && req.body.lang ? req.body.lang : 'chi_tra+chi_sim+eng').trim();
        const fallbackOcrApi = String(req.body && req.body.fallbackOcrApi ? req.body.fallbackOcrApi : '').trim();
        const ocrApi = 'https://ocr.yhsun.cn/';

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

async function buildDocxStyledHtml(markdown, settings = {}) {
    settings = normalizeDocxSettings(settings);
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
        h1: settings.h1Size, h2: settings.h2Size, h3: settings.h3Size,
        h4: settings.h4Size, h5: settings.h5Size, h6: settings.h6Size
    };

    const processedMarkdown = String(markdown || '').replace(/```mermaid\n([\s\S]*?)```/g, (_match, content) => {
        return `\n> [Mermaid Diagram]\n>\n> ${String(content || '').trim().split('\n').join('\n> ')}\n`;
    });

    let html = (await getMarkdownRenderer()).render(processedMarkdown);
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

async function runPandocDocx(inputContent, options: any = {}) {
    const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'easypocketmd-docx-'));
    const inputFormat = options.inputFormat || 'markdown+task_lists+tex_math_dollars+tex_math_single_backslash+tex_math_double_backslash+fenced_code_blocks+pipe_tables';
    const inputExt = inputFormat === 'html' ? 'html' : 'md';
    const inputPath = path.join(tempDir, `input.${inputExt}`);
    const outputPath = path.join(tempDir, 'output.docx');

    // 在函数开头定义所有需要的变量，确保作用域正确
    const titleFont = options.titleFont || 'SimHei';
    const bodyFont = options.bodyFont || 'SimSun';
    const titleFontSize = options.titleFontSize;
    const bodyFontSize = options.bodyFontSize;
    const h1Size = options.h1Size;
    const h2Size = options.h2Size;
    const h3Size = options.h3Size;
    const h4Size = options.h4Size;
    const h5Size = options.h5Size;
    const h6Size = options.h6Size;

    console.log(`[DOCX] Starting conversion with settings:`, {
        titleFont,
        bodyFont,
        titleFontSize,
        bodyFontSize,
        h1Size, h2Size, h3Size, h4Size, h5Size, h6Size,
        inputFormat
    });

    try {
        const diagramMarkdown = await prepareDocxDiagrams(inputContent, options.diagrams, tempDir);
        inputContent = inputFormat === 'html'
            ? await buildDocxStyledHtml(diagramMarkdown, options)
            : normalizeDocxMarkdown(diagramMarkdown);
        if (inputFormat === 'html') {
            // Pandoc's HTML reader lowercases SVG viewBox and cannot size ex units.
            // Give it standalone SVG files with explicit point dimensions instead.
            let mathIndex = 0;
            for (const match of Array.from(inputContent.matchAll(/<svg\b[\s\S]*?<\/svg>/gi)) as RegExpMatchArray[]) {
                const filename = 'math-' + mathIndex++ + '.svg';
                const svg = match[0].replace(/\b(width|height)="([\d.]+)ex"/g, (_, name, value) =>
                    name + '="' + (Number(value) * Number(options.bodyFontSize || 12) * 0.5) + 'pt"');
                await fsp.writeFile(path.join(tempDir, filename), svg, 'utf8');
                inputContent = inputContent.replace(match[0], '<img src="' + filename + '" alt="Formula" />');
            }
        }
        await fsp.writeFile(inputPath, inputContent, 'utf8');

        const args = [
            inputPath,
            '-f',
            inputFormat,
            '-t',
            'docx',
            '-o',
            outputPath,
            '--standalone',
            '--resource-path=' + tempDir
        ];

        // Templates supply layout; user typography is applied to the final OOXML.
        const referenceDir = path.join(__dirname, '../../reference-docs');
        const configured = String(options.referenceDocx || process.env.PANDOC_REFERENCE_DOCX || '').trim();
        const referencePath = configured
            ? (path.isAbsolute(configured) ? configured : path.resolve(configured))
            : path.join(referenceDir, 'reference.docx');

        // 添加reference-doc参数
        if (referencePath && fs.existsSync(referencePath)) {
            args.push('--reference-doc', referencePath);
            console.log(`[DOCX] ✅ Added --reference-doc: ${referencePath}`);
            console.log(`[DOCX] Final pandoc args:`, args);
        } else {
            console.log(`[DOCX] ❌ No reference-doc added, referencePath: ${referencePath}`);
        }

        // 对于HTML输入，添加额外的Pandoc参数来更好地保留样式
        if (inputFormat === 'html') {
            args.push('--wrap=preserve');
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

        const docxBuffer = await fsp.readFile(outputPath);
        return await applyDocxTypography(docxBuffer, options);
    } finally {
        await fsp.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
}

// Word (DOCX) Conversion endpoint (Pandoc)
router.post('/docx', async (req, res) => {
    try {
        const { markdown, referenceDocx, settings, diagrams } = req.body || {};

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
            ...normalizeDocxSettings(docxSettings),
            diagrams,
            referenceDocx,
            inputFormat: useNativeMath
                ? 'markdown+task_lists+tex_math_dollars+tex_math_single_backslash+tex_math_double_backslash+fenced_code_blocks+pipe_tables'
                : 'html'
        };

        const docxBuffer = await runPandocDocx(markdown, pandocOptions);

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
