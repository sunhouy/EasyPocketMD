import * as pdfjsLib from 'pdfjs-dist';
// Vite handles the worker URL import
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

// Set worker source
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

/**
 * Generate PDF from HTML content using server-side conversion
 * @param {string} htmlContent - The HTML content to convert
 * @param {object} settings - Print settings (margin, etc.)
 * @param {string} [filename] - Optional filename (not used for generation, but for download context)
 * @returns {Promise<string>} - Returns PDF URL
 */
export async function generatePDF(htmlContent, settings, filename) {
    console.log('[PDF Debug] generatePDF start');
    
    // Debug: Check if content is empty
    if (!htmlContent || htmlContent.trim() === '') {
        console.warn('[PDF Debug] generatePDF received empty content');
        htmlContent = '<div style="padding: 20px; font-size: 16px; color: #666; text-align: center;">(文档内容为空)</div>';
    } else {
        console.log('[PDF Debug] Content length:', htmlContent.length);
    }

    // Add print styles to the HTML content
    // We need to inject the styles directly into the HTML because wkhtmltopdf won't see the external CSS
    // or the styles added by print.js if they are not part of the html string.
    // print.js already adds <style> tag to htmlContent, so we might be good.
    // But we should ensure the HTML is a full document structure for best results.
    
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
        console.log('[PDF Debug] Sending request to server...');
        const response = await fetch('api/convert/pdf', {
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
            console.log('[PDF Debug] PDF generated successfully:', result.url);
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
