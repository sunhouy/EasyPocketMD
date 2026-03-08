import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import * as pdfjsLib from 'pdfjs-dist';
// Vite handles the worker URL import
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

// Set worker source
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

/**
 * Generate PDF from HTML content
 * @param {string} htmlContent - The HTML content to convert
 * @param {object} settings - Print settings (margin, etc.)
 * @param {string} [filename] - If provided, triggers download
 * @returns {Promise<Blob>} - Returns Blob
 */
export async function generatePDF(htmlContent, settings, filename) {
    console.log('[PDF Debug] generatePDF start');
    
    // Create a temporary container
    const container = document.createElement('div');
    
    // Debug: Check if content is empty
    if (!htmlContent || htmlContent.trim() === '') {
        console.warn('[PDF Debug] generatePDF received empty content');
        htmlContent = '<div style="padding: 20px; font-size: 16px; color: #666; text-align: center;">(文档内容为空)</div>';
    } else {
        console.log('[PDF Debug] Content length:', htmlContent.length);
    }

    container.innerHTML = htmlContent;

    // Detect night mode for better UX
    const isNightMode = window.nightMode === true;
    const bgColor = isNightMode ? '#2d2d2d' : '#ffffff';
    const textColor = isNightMode ? '#eeeeee' : '#000000';

    // Create a mask to hide the container while rendering
    const mask = document.createElement('div');
    mask.style.position = 'fixed';
    mask.style.left = '0';
    mask.style.top = '0';
    mask.style.width = '100%';
    mask.style.height = '100%';
    mask.style.backgroundColor = bgColor; 
    mask.style.zIndex = '20000'; // Very high to cover everything
    mask.style.display = 'flex';
    mask.style.alignItems = 'center';
    mask.style.justifyContent = 'center';
    mask.innerHTML = `<div style="color:${textColor};font-size:16px;"><i class="fas fa-spinner fa-spin"></i> 正在处理页面...</div>`;
    document.body.appendChild(mask);
    console.log('[PDF Debug] Mask appended');

    // Force display block for container
    container.style.display = 'block';
    
    // Create a wrapper to ensure isolation
    const wrapper = document.createElement('div');
    wrapper.style.position = 'absolute'; 
    wrapper.style.left = '0';
    wrapper.style.top = '0';
    wrapper.style.zIndex = '19999';
    wrapper.style.width = '794px';
    // Use minHeight instead of height to allow content to grow
    wrapper.style.minHeight = '1123px';
    wrapper.style.backgroundColor = '#ffffff';
    wrapper.appendChild(container);
    
    // Modified: Place element within viewport but behind the mask
    container.style.position = 'relative'; // Change to relative inside wrapper
    container.style.width = '100%';
    container.style.height = 'auto';
    container.style.background = '#ffffff'; // PDF content is always white background
    container.style.color = '#000000'; // Text is black
    
    // 强制重置一些样式，防止被全局样式影响
    container.style.margin = '0';
    container.style.padding = '20px'; // Add some padding
    container.style.border = 'none';
    container.style.overflow = 'visible'; // 确保内容溢出可见
    
    // Apply basic styles
    const style = document.createElement('style');
    style.innerHTML = `
        body { font-family: "SimSun", "宋体", serif; }
        img { max-width: 100%; height: auto; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #ddd; padding: 8px; }
        .katex { font-size: 1.1em; }
        .mermaid { text-align: center; }
        /* Force visibility */
        * { visibility: visible !important; opacity: 1 !important; }
    `;
    container.appendChild(style);

    // Save original body overflow style to prevent scrollbar flicker
    const originalBodyOverflowX = document.body.style.overflowX;
    document.body.style.overflowX = 'hidden';

    document.body.appendChild(wrapper);
    console.log('[PDF Debug] Wrapper appended. Dimensions:', wrapper.offsetWidth, 'x', wrapper.offsetHeight);

    try {
        // 等待图片加载完成
        const images = wrapper.querySelectorAll('img');
        console.log('[PDF Debug] Waiting for images:', images.length);
        if (images.length > 0) {
            await Promise.all(Array.from(images).map(img => {
                if (img.complete) return Promise.resolve();
                return new Promise(resolve => {
                    img.onload = resolve;
                    img.onerror = () => {
                        console.warn('[PDF Debug] Image load error:', img.src);
                        resolve();
                    };
                    // 超时机制，防止卡死
                    setTimeout(() => {
                        console.warn('[PDF Debug] Image load timeout:', img.src);
                        resolve();
                    }, 2000);
                });
            }));
        }
        console.log('[PDF Debug] Images loaded');
        
        // Wait a bit for layout to settle
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Ensure fonts are loaded
        await document.fonts.ready;
        console.log('[PDF Debug] Fonts loaded');

        console.log('[PDF Debug] Starting html2canvas capture...');
        
        // Manually scroll to top to ensure html2canvas captures from top
        window.scrollTo(0, 0);

        const canvas = await html2canvas(wrapper, {
            scale: 2,
            useCORS: true,
            logging: true,
            backgroundColor: '#ffffff',
            width: wrapper.offsetWidth,
            windowWidth: wrapper.offsetWidth,
            height: wrapper.offsetHeight,
            windowHeight: wrapper.offsetHeight,
            ignoreElements: (element) => {
                if (element.style.zIndex && parseInt(element.style.zIndex) >= 20000) return true;
                return false;
            }
        });
        
        console.log('[PDF Debug] Canvas captured. Dimensions:', canvas.width, 'x', canvas.height);

        // Calculate PDF dimensions
        // A4 size in mm: 210 x 297
        const imgWidth = 210; 
        const pageHeight = 297; 
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        let heightLeft = imgHeight;
        let position = 0;

        const doc = new jsPDF('p', 'mm', 'a4');
        const imgData = canvas.toDataURL('image/jpeg', 0.98);

        // First page
        doc.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;

        // Subsequent pages if content is longer than one page
        while (heightLeft > 0) {
            position = heightLeft - imgHeight;
            doc.addPage();
            doc.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
            heightLeft -= pageHeight;
        }

        if (filename) {
            doc.save(filename);
            console.log('[PDF Debug] PDF saved');
            return null;
        }

        const pdfBlob = doc.output('blob');
        console.log('[PDF Debug] PDF blob generated. Size:', pdfBlob.size);
        return pdfBlob;

    } catch (e) {
        console.error('[PDF Debug] PDF generation error:', e);
        throw e;
    } finally {
        if (document.body.contains(wrapper)) {
            document.body.removeChild(wrapper);
        }
        if (document.body.contains(mask)) {
            document.body.removeChild(mask);
        }
        document.body.style.overflowX = originalBodyOverflowX;
        console.log('[PDF Debug] Cleanup done');
    }
}

/**
 * Render PDF blob to a container using pdf.js
 * @param {Blob} pdfBlob 
 * @param {HTMLElement} container 
 */
export async function renderPDF(pdfBlob, container) {
    const url = URL.createObjectURL(pdfBlob);
    
    try {
        const loadingTask = pdfjsLib.getDocument(url);
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
    } finally {
        URL.revokeObjectURL(url);
    }
}
