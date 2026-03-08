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
        const { html, settings } = req.body;
        
        if (!html) {
            return res.status(400).json({ 
                code: 400, 
                message: 'HTML content is required' 
            });
        }

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

        console.log('Generating PDF to:', filePath);
        
        const writeStream = fs.createWriteStream(filePath);
        
        wkhtmltopdf(html, options)
            .pipe(writeStream)
            .on('finish', () => {
                console.log('PDF generation successful');
                res.json({
                    code: 200,
                    message: 'PDF generated successfully',
                    url: fileUrl
                });
            })
            .on('error', (err) => {
                console.error('wkhtmltopdf error:', err);
                res.status(500).json({
                    code: 500,
                    message: 'PDF generation failed',
                    error: err.message
                });
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

module.exports = router;
