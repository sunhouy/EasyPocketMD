const express = require('express');
const router = express.Router();
const markdownIt = require('markdown-it');
const markdownItTaskLists = require('markdown-it-task-lists');
const markdownItMathjax3 = require('markdown-it-mathjax3');
const wkhtmltopdf = require('wkhtmltopdf');
const path = require('path');
const fs = require('fs');
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
        cleaned = cleaned.replace(/<mjx-container[^>]*>([\s\S]*?)<\/mjx-container>/gi, (match, content) => {
            // Extract SVG from the content
            const svgMatch = content.match(/<svg[\s\S]*?<\/svg>/i);
            if (svgMatch) {
                // Wrap the SVG in a div with appropriate styling
                return `<div style="text-align: center; margin: 1em 0;">${svgMatch[0]}</div>`;
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

// Word (DOCX) Conversion endpoint
router.post('/docx', async (req, res) => {
    try {
        let { markdown, settings } = req.body;
        
        if (!markdown) {
            return res.status(400).json({ 
                code: 400, 
                message: 'Markdown content is required' 
            });
        }
        
        // Process mermaid diagrams - replace with placeholder text
        // Mermaid diagrams need to be rendered on frontend, backend can't generate images
        let processedMarkdown = markdown.replace(/```mermaid\n([\s\S]*?)```/g, (match, content) => {
            return `<div style="border: 1px solid #ddd; padding: 10px; margin: 10px 0; background: #f9f9f9; text-align: center;">
                <p style="color: #666; margin: 0;">[Mermaid Diagram]</p>
                <pre style="text-align: left; margin: 5px 0;">${content.trim()}</pre>
            </div>`;
        });
        
        // Render markdown to HTML
        let html = md.render(processedMarkdown);
        
        // Process MathJax content - convert to Word-compatible format
        // Keep the SVG rendering of formulas
        html = html.replace(/<mjx-container[^>]*>([\s\S]*?)<\/mjx-container>/gi, (match, content) => {
            // Extract SVG from the content
            const svgMatch = content.match(/<svg[\s\S]*?<\/svg>/i);
            if (svgMatch) {
                // Wrap the SVG in a div with appropriate styling
                return `<div style="text-align: center; margin: 1em 0;">${svgMatch[0]}</div>`;
            }
            // If no SVG found, try to extract the formula text
            const texMatch = content.match(/\\\[([\s\S]*?)\\\]/);
            if (texMatch) {
                return `<div style="text-align: center; margin: 1em 0; font-style: italic;">[Formula: ${texMatch[1].trim()}]</div>`;
            }
            return '';
        });
        
        // Remove MathJax scripts and assistive elements
        html = html.replace(/<script[^>]*src[^>]*mathjax[^>]*>[\s\S]*?<\/script>/gi, '');
        html = html.replace(/<script[^>]*id[^>]*MathJax[^>]*>[\s\S]*?<\/script>/gi, '');
        html = html.replace(/<mjx-assistive-mml[^>]*>[\s\S]*?<\/mjx-assistive-mml>/gi, '');
        
        // Get settings with defaults
        const margin = settings?.pageMargin || '25';
        const bodyFontSize = settings?.bodyFontSize || '12';
        const lineHeight = settings?.lineHeight || '1.5';
        const titleFontSize = settings?.titleFontSize || '18';
        
        // Build Word-readable HTML MIME format
        const wordHtml = `<html xmlns:o="urn:schemas-microsoft-com:office:office" 
      xmlns:w="urn:schemas-microsoft-com:office:word" 
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
    <meta charset="utf-8">
    <title>Document</title>
    <!--[if gte mso 9]>
    <xml>
        <w:WordDocument>
            <w:View>Print</w:View>
            <w:Zoom>100</w:Zoom>
            <w:DoNotOptimizeForBrowser/>
        </w:WordDocument>
    </xml>
    <![endif]-->
    <style>
        <!--
        @page {
            size: 21cm 29.7cm;
            margin: ${margin}mm;
        }
        @page Section1 {
            margin: ${margin}mm;
        }
        div.Section1 {
            page: Section1;
        }
        body {
            font-family: "SimSun", "宋体", serif;
            font-size: ${bodyFontSize}pt;
            line-height: ${lineHeight};
        }
        h1, h2, h3, h4, h5, h6 {
            font-weight: bold;
            margin: 1em 0;
        }
        h1 { font-size: ${parseInt(bodyFontSize) * 2}pt; }
        h2 { font-size: ${parseInt(bodyFontSize) * 1.5}pt; }
        h3 { font-size: ${parseInt(bodyFontSize) * 1.25}pt; }
        p {
            margin: 0 0 0.5em 0;
        }
        table {
            border-collapse: collapse;
            width: 100%;
        }
        td, th {
            border: 1px solid #000;
            padding: 8px;
        }
        th {
            background-color: #f8f9fa;
            font-weight: bold;
        }
        code {
            background: #f5f5f5;
            padding: 2px 4px;
            font-family: monospace;
        }
        pre {
            background: #f5f5f5;
            padding: 10px;
            overflow-x: auto;
            border: 1px solid #ddd;
        }
        svg {
            max-width: 100%;
            height: auto;
        }
        -->
    </style>
</head>
<body>
    <div class="Section1">
        ${html}
    </div>
</body>
</html>`;

        // Generate filename
        const filename = `document_${new Date().toISOString().slice(0, 10)}.doc`;
        
        // Set headers for file download
        res.setHeader('Content-Type', 'application/msword');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        
        // Send the Word HTML with BOM for UTF-8
        const bom = Buffer.from([0xEF, 0xBB, 0xBF]);
        const content = Buffer.from(wordHtml, 'utf8');
        res.send(Buffer.concat([bom, content]));

    } catch (error) {
        console.error('DOCX conversion endpoint error:', error);
        return res.status(500).json({
            code: 500,
            message: 'Server error during DOCX conversion',
            error: error.message
        });
    }
});

module.exports = router;
