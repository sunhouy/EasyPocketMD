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
        
        // 1. Remove all MathJax scripts
        // Remove script tags with src containing mathjax or MathJax in id
        cleaned = cleaned.replace(/<script[^>]*src[^>]*mathjax[^>]*>[\s\S]*?<\/script>/gi, '');
        cleaned = cleaned.replace(/<script[^>]*id[^>]*MathJax[^>]*>[\s\S]*?<\/script>/gi, '');
        
        // Remove script tags containing mathjax in their content
        // This is more complex with regex, so we'll do our best
        cleaned = cleaned.replace(/<script[^>]*>[\s\S]*?mathjax[\s\S]*?<\/script>/gi, '');
        
        // 2. Remove <mjx-assistive-mml> nodes (including all content inside)
        cleaned = cleaned.replace(/<mjx-assistive-mml[^>]*>[\s\S]*?<\/mjx-assistive-mml>/gi, '');
        
        // 3. Process <mjx-container> elements
        // We need to find all mjx-container elements and extract the SVG
        // This is a bit complex with regex, but we'll use a function to replace
        cleaned = cleaned.replace(/<mjx-container([^>]*)>([\s\S]*?)<\/mjx-container>/gi, (match, attrs, content) => {
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
            // If no SVG found, remove the container
            return '';
        });
        
        return cleaned;
    } catch (error) {
        console.error('[PDF Debug] Error cleaning MathJax content:', error);
        // If cleaning fails, return original HTML
        return html;
    }
}

// Conversion endpoint
router.post('/markdown', (req, res) => {
    try {
        const { content } = req.body;
        
        if (!content) {
            return res.status(400).json({ 
                code: 400, 
                message: 'Content is required' 
            });
        }

        // Render markdown to HTML
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

// PDF Conversion endpoint
router.post('/pdf', (req, res) => {
    try {
        let { html, settings } = req.body;
        
        if (!html) {
            return res.status(400).json({ 
                code: 400, 
                message: 'HTML content is required' 
            });
        }
        
        // Clean up MathJax-related content before conversion
        // console.log('[PDF Debug] Cleaning MathJax content on backend...');
        html = cleanMathJaxContent(html);
        // console.log('[PDF Debug] MathJax content cleaned on backend');

        const filename = `${uuidv4()}.pdf`;
        // uploads folder is one level up from api/routes/ (api/routes/../uploads -> api/uploads -> no, server.js says ../uploads from api/)
        // server.js is in api/. routes/convert.js is in api/routes/.
        // so uploads is at ../../uploads relative to this file.
        const uploadDir = path.join(__dirname, '../../uploads');
        
        // Ensure uploads directory exists
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        
        const filePath = path.join(uploadDir, filename);
        const fileUrl = `/uploads/${filename}`;

        // Configure wkhtmltopdf options
        const options = {
            pageSize: 'A4',
            marginTop: settings?.pageMargin ? `${settings.pageMargin}mm` : '15mm',
            marginBottom: settings?.pageMargin ? `${settings.pageMargin}mm` : '15mm',
            marginLeft: settings?.pageMargin ? `${settings.pageMargin}mm` : '15mm',
            marginRight: settings?.pageMargin ? `${settings.pageMargin}mm` : '15mm',
            printMediaType: true,
            enableLocalFileAccess: true, // Needed for local images if any
            encoding: 'UTF-8'
        };

        
        const writeStream = fs.createWriteStream(filePath);
        
        // console.log('[PDF Debug] Starting wkhtmltopdf for filename:', filename);
        
        const pdfStream = wkhtmltopdf(html, options);
        
        pdfStream.on('error', (err) => {
            console.error('[PDF Debug] wkhtmltopdf command error:', err);
            if (!res.headersSent) {
                res.status(500).json({
                    code: 500,
                    message: 'PDF generation failed (command error)',
                    error: err.message
                });
            }
        });

        pdfStream.pipe(writeStream)
            .on('finish', () => {
                // Check if file exists and has content
                if (fs.existsSync(filePath)) {
                    const stats = fs.statSync(filePath);
                    if (stats.size > 0) {
                        // console.log('[PDF Debug] PDF generation successful, size:', stats.size);
                        if (!res.headersSent) {
                            res.json({
                                code: 200,
                                message: 'PDF generated successfully',
                                url: fileUrl
                            });
                        }
                    } else {
                        console.error('[PDF Debug] PDF generation failed: file is empty');
                        if (!res.headersSent) {
                            res.status(500).json({
                                code: 500,
                                message: 'PDF generation failed: file is empty'
                            });
                        }
                    }
                } else {
                    console.error('[PDF Debug] PDF generation failed: file not found');
                    if (!res.headersSent) {
                        res.status(500).json({
                            code: 500,
                            message: 'PDF generation failed: file not found'
                        });
                    }
                }
            })
            .on('error', (err) => {
                console.error('[PDF Debug] writeStream error:', err);
                if (!res.headersSent) {
                    res.status(500).json({
                        code: 500,
                        message: 'PDF generation failed (stream error)',
                        error: err.message
                    });
                }
            });

    } catch (error) {
        console.error('PDF conversion endpoint error:', error);
        return res.status(500).json({
            code: 500,
            message: 'Server error during PDF conversion',
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

    const headingSizes = {
        h1: useCustomHeadingSizes ? toFiniteNumber(settings.h1Size, 32) : titleFontSize * 2,
        h2: useCustomHeadingSizes ? toFiniteNumber(settings.h2Size, 28) : titleFontSize * 1.6,
        h3: useCustomHeadingSizes ? toFiniteNumber(settings.h3Size, 24) : titleFontSize * 1.35,
        h4: useCustomHeadingSizes ? toFiniteNumber(settings.h4Size, 20) : titleFontSize * 1.2,
        h5: useCustomHeadingSizes ? toFiniteNumber(settings.h5Size, 18) : titleFontSize,
        h6: useCustomHeadingSizes ? toFiniteNumber(settings.h6Size, 16) : Math.max(14, titleFontSize * 0.9)
    };

    const processedMarkdown = String(markdown || '').replace(/```mermaid\n([\s\S]*?)```/g, (match, content) => {
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
        body {
            font-family: "Noto Serif CJK SC", "SimSun", "Microsoft YaHei", serif;
            font-size: ${bodyFontSize}pt;
            line-height: ${lineHeight};
            text-align: ${bodyAlignment};
            word-break: break-word;
        }
        p {
            margin: 0 0 ${paragraphSpacing}em 0;
        }
        h1, h2, h3, h4, h5, h6 {
            text-align: ${headingAlignment};
            margin: 1em 0 0.6em 0;
            font-weight: 700;
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
        }
        code {
            font-family: "Consolas", "Courier New", monospace;
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
        }
        th {
            background: #f0f0f0;
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
    </style>
</head>
<body>
${html}
</body>
</html>`;
}

function normalizeDocxMarkdown(markdown) {
    return String(markdown || '').replace(/```mermaid\n([\s\S]*?)```/g, (match, content) => {
        return `\n> [Mermaid Diagram]\n>\n> ${String(content || '').trim().split('\n').join('\n> ')}\n`;
    });
}

async function runPandocDocx(inputContent, options = {}) {
    const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'easypocketmd-docx-'));
    const inputFormat = options.inputFormat || 'markdown+task_lists+tex_math_dollars+tex_math_single_backslash+fenced_code_blocks+pipe_tables';
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

        const configuredReference = (options.referenceDocx || process.env.PANDOC_REFERENCE_DOCX || '').trim();
        if (configuredReference) {
            const referencePath = path.isAbsolute(configuredReference)
                ? configuredReference
                : path.join(process.cwd(), configuredReference);
            if (fs.existsSync(referencePath)) {
                args.push('--reference-doc', referencePath);
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

        const docxBuffer = useNativeMath
            ? await runPandocDocx(normalizeDocxMarkdown(markdown), {
                referenceDocx,
                inputFormat: 'markdown+task_lists+tex_math_dollars+tex_math_single_backslash+fenced_code_blocks+pipe_tables'
            })
            : await runPandocDocx(buildDocxStyledHtml(markdown, docxSettings), {
                referenceDocx,
                inputFormat: 'html'
            });
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
