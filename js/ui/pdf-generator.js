import * as pdfjsLib from 'pdfjs-dist';
// Vite handles the worker URL import
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';
import htmlToPdfmake from 'html-to-pdfmake';

// Set worker source
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

// 保存 pdfmake 实例，用于按需初始化
let pdfMake = null;
let pdfMakeInitialized = false;

/**
 * 按需初始化 pdfmake 并加载中文字体支持
 */
async function initPdfMakeWithChineseFonts() {
    if (pdfMakeInitialized) {
        return pdfMake;
    }
    
    console.log('[PDF Debug] Initializing pdfmake with Chinese fonts...');
    
    // 动态加载 pdfmake-support-chinese-fonts
    const pdfMakeModule = await import('pdfmake-support-chinese-fonts/pdfmake.min');
    const pdfFontsModule = await import('pdfmake-support-chinese-fonts/vfs_fonts');
    
    pdfMake = pdfMakeModule.default || pdfMakeModule;
    const pdfFonts = pdfFontsModule.default || pdfFontsModule;
    
    // 设置 vfs
    if (pdfFonts && pdfFonts.pdfMake && pdfFonts.pdfMake.vfs) {
        pdfMake.vfs = pdfFonts.pdfMake.vfs;
    } else if (pdfFonts && pdfFonts.vfs) {
        pdfMake.vfs = pdfFonts.vfs;
    }
    
    // 设置字体
    pdfMake.fonts = {
        Roboto: {
            normal: 'Roboto-Regular.ttf',
            bold: 'Roboto-Regular.ttf',
            italics: 'Roboto-Regular.ttf',
            bolditalics: 'Roboto-Regular.ttf'
        },
        fangzhen: {
            normal: 'fzhei-jt.ttf',
            bold: 'fzhei-jt.ttf',
            italics: 'fzhei-jt.ttf',
            bolditalics: 'fzhei-jt.ttf'
        }
    };
    
    pdfMakeInitialized = true;
    console.log('[PDF Debug] pdfmake with Chinese fonts initialized');
    
    return pdfMake;
}

/**
 * Generate PDF from HTML content using local conversion (html-to-pdfmake + pdfmake)
 * @param {string} htmlContent - The HTML content to convert
 * @param {object} settings - Print settings (margin, etc.)
 * @returns {Promise<string>} - Returns blob URL for the generated PDF
 */
async function generatePDFLocal(htmlContent, settings) {
    console.log('[PDF Debug] Starting local PDF generation...');
    
    console.log('[PDF Debug] Original htmlContent preview (first 500 chars):', htmlContent.substring(0, 500));
    
    // 按需初始化 pdfmake 并加载中文字体
    const currentPdfMake = await initPdfMakeWithChineseFonts();
    
    let processedContent = htmlContent;
    
    // 提取真正的内容，移除开头的 <style> 标签
    // 查找 <body> 标签或直接的内容
    const bodyMatch = processedContent.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (bodyMatch) {
        processedContent = bodyMatch[1];
    } else {
        // 如果没有 <body> 标签，尝试移除开头的 <style> 标签
        processedContent = processedContent.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
    }
    
    console.log('[PDF Debug] Processed content preview (first 500 chars):', processedContent.substring(0, 500));
    
    const cleanedHtml = processedContent
        .replace(/font-family\s*:\s*[^;]+;/gi, '')
        .replace(/font-family\s*:\s*[^"']+["']/gi, '')
        .replace(/font-family\s*:\s*[^}]+}/gi, '}');

    const fullHtml = `
        <div>
            ${cleanedHtml}
        </div>
    `;

    console.log('[PDF Debug] Converting HTML to pdfmake content...');
    
    const pdfMakeContent = htmlToPdfmake(fullHtml, {
        defaultStyles: {
            p: { fontSize: 12, lineHeight: 1.2, font: 'fangzhen' },
            h1: { fontSize: 24, bold: true, margin: [0, 0, 0, 10], font: 'fangzhen' },
            h2: { fontSize: 20, bold: true, margin: [0, 0, 0, 8], font: 'fangzhen' },
            h3: { fontSize: 16, bold: true, margin: [0, 0, 0, 6], font: 'fangzhen' },
            h4: { fontSize: 14, bold: true, margin: [0, 0, 0, 4], font: 'fangzhen' }
        }
    });

    console.log('[PDF Debug] htmlToPdfmake conversion done');

    const docDefinition = {
        content: pdfMakeContent,
        defaultStyle: {
            font: 'fangzhen',
            fontSize: 12
        },
        pageMargins: [
            (settings.pageMargin || 15) * 2.83465,
            (settings.pageMargin || 15) * 2.83465,
            (settings.pageMargin || 15) * 2.83465,
            (settings.pageMargin || 15) * 2.83465
        ]
    };

    console.log('[PDF Debug] Creating pdfmake document...');

    try {
        const pdfDoc = currentPdfMake.createPdf(docDefinition);
        console.log('[PDF Debug] pdfmake document created');
        
        console.log('[PDF Debug] Getting buffer...');
        const buffer = await pdfDoc.getBuffer();
        console.log('[PDF Debug] Buffer created, length:', buffer.length, 'bytes');
        
        const blob = new Blob([buffer], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        console.log('[PDF Debug] Blob URL created:', url);
        return url;
    } catch (error) {
        console.error('[PDF Debug] Local PDF generation error:', error);
        throw error;
    }
}

/**
 * Generate PDF from HTML content using server-side conversion
 * @param {string} htmlContent - The HTML content to convert
 * @param {object} settings - Print settings (margin, etc.)
 * @param {string} [filename] - Optional filename (not used for generation, but for download context)
 * @returns {Promise<string>} - Returns PDF URL
 */
export async function generatePDF(htmlContent, settings, filename) {
    if (settings && settings.conversionMethod === 'local') {
        return await generatePDFLocal(htmlContent, settings);
    }
    
    // Debug: Check if content is empty
    if (!htmlContent || htmlContent.trim() === '') {
        console.warn('[PDF Debug] generatePDF received empty content');
        htmlContent = '<div style="padding: 20px; font-size: 16px; color: #666; text-align: center;">(文档内容为空)</div>';
    } 
    
    const fullHtml = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                body { font-family: "SimSun", "宋体", serif; }
                img { max-width: 100%; height: auto; page-break-inside: avoid; display: block; margin: 10px auto; }
                table { border-collapse: collapse; width: 100%; page-break-inside: avoid; }
                tr { page-break-inside: avoid; page-break-after: auto; }
                th, td { border: 1px solid #ddd; padding: 8px; }
                .katex { font-size: 1.1em; page-break-inside: avoid; display: inline-block; }
                .katex-mathml { display: none !important; position: absolute; clip: rect(1px, 1px, 1px, 1px); padding: 0; border: 0; height: 1px; width: 1px; overflow: hidden; }
                .mermaid { text-align: center; page-break-inside: avoid; }
                pre { page-break-inside: avoid; white-space: pre-wrap; word-wrap: break-word; }
                blockquote { page-break-inside: avoid; }
                h1, h2, h3, h4, h5, h6 { page-break-after: avoid; }
            </style>
        </head>
        <body>
            ${htmlContent}
        </body>
        </html>
    `;

    try {
        var apiUrl = (window.getApiBaseUrl ? window.getApiBaseUrl() : 'api') + '/convert/pdf';
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                html: fullHtml,
                settings: settings
            })
        });

        const result = await response.json();
        
        if (result.code === 200 && result.url) {
            return result.url;
        } else {
            throw new Error(result.message || 'PDF generation failed');
        }

    } catch (e) {
        console.error('[PDF Debug] PDF generation error:', e);
        throw e;
    }
}

/**
 * Render PDF from URL to a container using pdf.js
 * @param {string} pdfUrl 
 * @param {HTMLElement} container 
 */
export async function renderPDF(pdfUrl, container) {
    try {
        console.log('[PDF Debug] Rendering PDF from URL:', pdfUrl);
        
        // Ensure absolute URL
        if (pdfUrl && !pdfUrl.startsWith('http://') && !pdfUrl.startsWith('https://') && !pdfUrl.startsWith('blob:')) {
            const origin = window.getAppOrigin ? window.getAppOrigin() : window.location.origin;
            pdfUrl = origin + (pdfUrl.startsWith('/') ? '' : '/') + pdfUrl;
            console.log('[PDF Debug] Converted to absolute URL:', pdfUrl);
        }

        const loadingTask = pdfjsLib.getDocument(pdfUrl);
        const pdf = await loadingTask.promise;
        
        container.innerHTML = ''; // Clear container

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            
            const scale = 1.5;
            const viewport = page.getViewport({ scale: scale });
            
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            
            // Style the canvas
            canvas.style.width = '100%';
            canvas.style.height = 'auto';
            canvas.style.marginBottom = '20px';
            canvas.style.boxShadow = '0 2px 10px rgba(0,0,0,0.1)';
            
            container.appendChild(canvas);
            
            const renderContext = {
                canvasContext: context,
                viewport: viewport
            };
            
            await page.render(renderContext).promise;
        }
    } catch (e) {
        console.error('Render PDF error:', e);
        container.innerHTML = `<div style="color:red;padding:20px;">预览加载失败: ${e.message}</div>`;
    }
}
