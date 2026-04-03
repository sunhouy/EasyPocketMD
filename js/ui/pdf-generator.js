import * as pdfjsLib from 'pdfjs-dist';
import htmlToPdfmake from 'html-to-pdfmake';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// Use Vite-resolved URL so worker path works with non-root deployments.
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

// 保存 pdfmake 实例，用于按需初始化
let pdfMake = null;
let pdfMakeInitialized = false;

/**
 * 动态加载 script 文件
 */
function loadScript(url) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = url;
        script.onload = () => {
            // console.log('[PDF Debug] Script loaded:', url);
            resolve();
        };
        script.onerror = (error) => {
            console.error('[PDF Debug] Script load failed:', url, error);
            reject(error);
        };
        document.head.appendChild(script);
    });
}

/**
 * 按需初始化 pdfmake 并加载中文字体支持
 */
async function initPdfMakeWithChineseFonts() {
    if (pdfMakeInitialized) {
        return pdfMake;
    }
    
    // console.log('[PDF Debug] Initializing pdfmake with Chinese fonts...');
    
    try {
        // 先设置全局的 pdfMake 对象
        window.pdfMake = {};
        
        // 加载 pdfmake 和 vfs_fonts 作为普通脚本，而不是模块
        await loadScript('./pdfmake.min.js');
        await loadScript('./vfs_fonts.js');
        
        // 此时 window.pdfMake 应该已经有完整的 vfs 了
        pdfMake = window.pdfMake;
        
        // console.log('[PDF Debug] vfs keys:', Object.keys(pdfMake.vfs || {}));
        
    } catch (e) {
        console.error('[PDF Debug] Initialization failed:', e);
        throw e;
    }
    
    // 设置字体，注意是大写的 TTF，和 vfs 中的键名一致
    pdfMake.fonts = {
        Roboto: {
            normal: 'Roboto-Regular.ttf',
            bold: 'Roboto-Regular.ttf',
            italics: 'Roboto-Regular.ttf',
            bolditalics: 'Roboto-Regular.ttf'
        },
        fangzhen: {
            normal: 'fzhei-jt.TTF',
            bold: 'fzhei-jt.TTF',
            italics: 'fzhei-jt.TTF',
            bolditalics: 'fzhei-jt.TTF'
        }
    };
    
    pdfMakeInitialized = true;
    // console.log('[PDF Debug] pdfmake with Chinese fonts initialized');
    
    return pdfMake;
}

/**
 * Generate PDF from HTML content using local conversion (html-to-pdfmake + pdfmake)
 * @param {string} htmlContent - The HTML content to convert
 * @param {object} settings - Print settings (margin, etc.)
 * @returns {Promise<string>} - Returns blob URL for the generated PDF
 */
async function generatePDFLocal(htmlContent, settings) {
    // console.log('[PDF Debug] Starting local PDF generation...');
    
    // console.log('[PDF Debug] Original htmlContent preview (first 500 chars):', htmlContent.substring(0, 500));
    
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
    
    // console.log('[PDF Debug] Processed content preview (first 500 chars):', processedContent.substring(0, 500));
    
    // 首先创建临时 DOM 来处理图片和公式
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = processedContent;
    
    // 处理图片：转换为 data URLs
    const images = tempDiv.querySelectorAll('img');
    // console.log('[PDF Debug] Found', images.length, 'images');
    
    // 将所有图片转换为 data URLs
    const imagePromises = [];
    images.forEach((img, index) => {
        imagePromises.push(
            new Promise((resolve) => {
                // 如果已经是 data URL，直接使用
                if (img.src.startsWith('data:')) {
                    resolve();
                    return;
                }
                
                // 尝试转换为 data URL
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                const tempImg = new Image();
                
                tempImg.crossOrigin = 'anonymous';
                
                tempImg.onload = () => {
                    canvas.width = tempImg.naturalWidth || tempImg.width;
                    canvas.height = tempImg.naturalHeight || tempImg.height;
                    ctx.drawImage(tempImg, 0, 0);
                    try {
                        const dataUrl = canvas.toDataURL('image/png');
                        img.src = dataUrl;
                        // console.log('[PDF Debug] Image', index, 'converted to data URL');
                    } catch (e) {
                        console.warn('[PDF Debug] Failed to convert image', index, ':', e);
                        img.remove();
                    }
                    resolve();
                };
                
                tempImg.onerror = () => {
                    console.warn('[PDF Debug] Failed to load image', index);
                    img.remove();
                    resolve();
                };
                
                tempImg.src = img.src;
            })
        );
    });
    
    // 等待所有图片处理完成
    await Promise.all(imagePromises);
    
    // 处理 LaTeX 公式：移除 SVG 元素
    const svgElements = tempDiv.querySelectorAll('svg');
    // console.log('[PDF Debug] Found', svgElements.length, 'SVG elements');
    
    // 移除所有 SVG 元素
    svgElements.forEach(svg => {
        const parent = svg.parentNode;
        if (parent) {
            const container = svg.closest('[data-mml-node], .mjx-chtml, .katex');
            if (container) {
                container.remove();
            } else {
                svg.remove();
            }
        }
    });
    
    // 清理字体样式
    let html = tempDiv.innerHTML;
    html = html
        .replace(/font-family\s*:\s*[^;]+;/gi, '')
        .replace(/font-family\s*:\s*[^"']+["']/gi, '')
        .replace(/font-family\s*:\s*[^}]+}/gi, '}');

    const fullHtml = `
        <div>
            ${html}
        </div>
    `;

    // console.log('[PDF Debug] Converting HTML to pdfmake content...');
    
    const pdfMakeContent = htmlToPdfmake(fullHtml, {
        defaultStyles: {
            p: { fontSize: 12, lineHeight: 1.2, font: 'fangzhen' },
            h1: { fontSize: 24, bold: true, margin: [0, 0, 0, 10], font: 'fangzhen' },
            h2: { fontSize: 20, bold: true, margin: [0, 0, 0, 8], font: 'fangzhen' },
            h3: { fontSize: 16, bold: true, margin: [0, 0, 0, 6], font: 'fangzhen' },
            h4: { fontSize: 14, bold: true, margin: [0, 0, 0, 4], font: 'fangzhen' },
            img: { maxWidth: 500 } // 500pt 大约是 A4 页面去掉边距的宽度
        }
    });

    // console.log('[PDF Debug] htmlToPdfmake conversion done');
    
    // 后处理：确保所有图片宽度不超过页面宽度
    function limitImageWidth(content) {
        if (Array.isArray(content)) {
            content.forEach(item => limitImageWidth(item));
        } else if (content && typeof content === 'object') {
            // 检查是否是图片
            if (content.image) {
                // A4 页面宽度：595pt，减去边距（每个边 15mm ≈ 42pt），所以 595 - 42*2 = 511pt
                // 我们设置最大 500pt 留一点余地
                const maxWidth = 500;
                if (!content.width || content.width > maxWidth) {
                    content.width = maxWidth;
                }
                // 确保图片自适应
                if (!content.fit) {
                    content.fit = [maxWidth, 1000]; // 高度足够大，保持比例
                }
            }
            // 递归处理子元素
            for (const key in content) {
                if (content.hasOwnProperty(key) && typeof content[key] === 'object') {
                    limitImageWidth(content[key]);
                }
            }
        }
    }
    
    limitImageWidth(pdfMakeContent);
    // console.log('[PDF Debug] Image width limiting done');

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

    // console.log('[PDF Debug] Creating pdfmake document...');

    try {
        const pdfDoc = currentPdfMake.createPdf(docDefinition);
        // console.log('[PDF Debug] pdfmake document created');
        
        // console.log('[PDF Debug] Getting buffer...');
        const buffer = await new Promise((resolve, reject) => {
            pdfDoc.getBuffer((buffer) => {
                resolve(buffer);
            }, (error) => {
                reject(error);
            });
        });
        // console.log('[PDF Debug] Buffer created, length:', buffer.length, 'bytes');
        
        const blob = new Blob([buffer], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        // console.log('[PDF Debug] Blob URL created:', url);
        return url;
    } catch (error) {
        console.error('[PDF Debug] Local PDF generation error:', error);
        throw error;
    }
}

/**
 * Clean up MathJax-related content from HTML
 * 1. Remove all MathJax scripts
 * 2. Remove <mjx-assistive-mml> nodes
 * 3. Process <mjx-container> to keep only SVG wrapped in div
 * @param {string} html - The HTML content to clean
 * @returns {string} - Cleaned HTML
 */
function cleanMathJaxContent(html) {
    // Create a temporary DOM element to parse HTML
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    
    // 1. Remove all MathJax scripts
    const scripts = tempDiv.querySelectorAll('script[src*="mathjax"], script[id*="MathJax"]');
    scripts.forEach(script => script.remove());
    
    // Remove any other MathJax-related scripts
    const allScripts = tempDiv.querySelectorAll('script');
    allScripts.forEach(script => {
        if (script.textContent && script.textContent.toLowerCase().includes('mathjax')) {
            script.remove();
        }
    });
    
    // 2. Remove <mjx-assistive-mml> nodes
    const assistiveMml = tempDiv.querySelectorAll('mjx-assistive-mml');
    assistiveMml.forEach(el => el.remove());
    
    // 3. Process <mjx-container> elements
    const mjxContainers = tempDiv.querySelectorAll('mjx-container');
    mjxContainers.forEach(container => {
        // Find the SVG inside
        const svg = container.querySelector('svg');
        if (svg) {
            // Create a div to wrap the SVG
            const wrapper = document.createElement('div');
            wrapper.style.cssText = 'text-align: center; margin: 1em 0;';
            
            // Clone the SVG to avoid reference issues
            const svgClone = svg.cloneNode(true);
            wrapper.appendChild(svgClone);
            
            // Replace the mjx-container with our wrapper div
            container.parentNode.replaceChild(wrapper, container);
        } else {
            // If no SVG found, just remove the container
            container.remove();
        }
    });
    
    return tempDiv.innerHTML;
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
    
    // Clean up MathJax-related content before sending to backend
    // console.log('[PDF Debug] Cleaning MathJax content...');
    const cleanedHtmlContent = cleanMathJaxContent(htmlContent);
    // console.log('[PDF Debug] MathJax content cleaned');
    
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
            ${cleanedHtmlContent}
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
        // console.log('[PDF Debug] Rendering PDF from URL:', pdfUrl);

        const isNativeLike = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) ||
            !!window.electron ||
            (window.location && window.location.protocol === 'file:');
        const resolveBase = isNativeLike && window.getAppOrigin
            ? window.getAppOrigin()
            : window.location.href;
        
        // Ensure the URL is resolvable in both web and native containers.
        pdfUrl = window.resolveResourceUrl
            ? window.resolveResourceUrl(pdfUrl, resolveBase)
            : pdfUrl;

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
        container.innerHTML = '';

        const fallbackWrap = document.createElement('div');
        fallbackWrap.style.cssText = 'width:100%;display:flex;flex-direction:column;gap:12px;padding:16px;box-sizing:border-box;';

        const message = document.createElement('div');
        message.style.cssText = 'padding:12px 14px;border-radius:8px;background:#fff3cd;color:#856404;border:1px solid #ffe69c;font-size:14px;line-height:1.5;';
        message.textContent = `预览加载失败，已切换为直接打开 PDF。${e.message ? ' ' + e.message : ''}`;

        const viewer = document.createElement('object');
        viewer.data = pdfUrl;
        viewer.type = 'application/pdf';
        viewer.style.cssText = 'width:100%;min-height:70vh;border:none;border-radius:8px;background:white;';

        const link = document.createElement('a');
        link.href = pdfUrl;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = '在新标签页打开 PDF';
        link.style.cssText = 'align-self:flex-start;display:inline-block;padding:10px 14px;border-radius:6px;background:#4a90e2;color:white;text-decoration:none;font-size:14px;';

        fallbackWrap.appendChild(message);
        fallbackWrap.appendChild(viewer);
        fallbackWrap.appendChild(link);
        container.appendChild(fallbackWrap);
    }
}
