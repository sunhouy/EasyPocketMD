
(function(global) {
    'use strict';

    /**
     * 图片懒加载器 - 先显示缩略图，再加载原图
     * 支持两种模式：
     * 1. 上传新图片时：立即显示本地预览（或缩略图），然后加载原图
     * 2. 打开已有文件时：先显示缩略图占位，再加载原图
     */

    // 存储图片URL到缩略图URL的映射
    const thumbMap = new Map();

    /**
     * 注册图片的缩略图URL
     * @param {string} originalUrl - 原图URL
     * @param {string} thumbUrl - 缩略图URL
     */
    function registerThumbnail(originalUrl, thumbUrl) {
        if (originalUrl && thumbUrl) {
            thumbMap.set(originalUrl, thumbUrl);
        }
    }

    /**
     * 获取图片的缩略图URL
     * @param {string} originalUrl - 原图URL
     * @returns {string|null} 缩略图URL或null
     */
    function getThumbnailUrl(originalUrl) {
        if (!originalUrl) return null;
        
        // 如果已注册，直接返回
        if (thumbMap.has(originalUrl)) {
            return thumbMap.get(originalUrl);
        }
        
        // 尝试根据URL规则生成缩略图URL
        // 支持的路径格式：/uploads/xxx.jpg, /user_files/username/xxx.jpg, /screenshots/xxx.jpg
        if (originalUrl.includes('/uploads/') || 
            originalUrl.includes('/user_files/') || 
            originalUrl.includes('/screenshots/')) {
            const urlObj = new URL(originalUrl, window.location.href);
            const pathParts = urlObj.pathname.split('/');
            const filename = pathParts[pathParts.length - 1];
            
            // 如果文件名已经是thumb_开头，说明已经是缩略图
            if (filename.startsWith('thumb_')) {
                return originalUrl;
            }
            
            // 替换文件名为thumb_版本
            pathParts[pathParts.length - 1] = 'thumb_' + filename;
            urlObj.pathname = pathParts.join('/');
            return urlObj.toString();
        }
        
        return null;
    }

    /**
     * 创建带懒加载效果的图片元素
     * @param {string} originalUrl - 原图URL
     * @param {string} alt - 图片alt文本
     * @param {Object} options - 配置选项
     * @returns {HTMLElement} 图片容器元素
     */
    function createLazyImage(originalUrl, alt, options) {
        options = options || {};
        const thumbUrl = options.thumbUrl || getThumbnailUrl(originalUrl) || originalUrl;
        
        // 创建容器
        const container = document.createElement('div');
        container.className = 'lazy-image-container';
        container.style.cssText = 'position: relative; display: inline-block; max-width: 100%;';
        
        // 创建缩略图img元素
        const thumbImg = document.createElement('img');
        thumbImg.src = thumbUrl;
        thumbImg.alt = alt || '';
        thumbImg.className = 'lazy-image-thumb';
        thumbImg.style.cssText = 'max-width: 100%; height: auto; filter: blur(2px); transition: opacity 0.3s ease;';
        
        // 创建原图img元素（初始隐藏）
        const originalImg = document.createElement('img');
        originalImg.alt = alt || '';
        originalImg.className = 'lazy-image-original';
        originalImg.style.cssText = 'max-width: 100%; height: auto; position: absolute; top: 0; left: 0; opacity: 0; transition: opacity 0.3s ease;';
        
        container.appendChild(thumbImg);
        container.appendChild(originalImg);
        
        // 加载原图
        const loadOriginal = () => {
            originalImg.src = originalUrl;
            originalImg.onload = () => {
                // 原图加载完成后，显示原图，淡出缩略图
                originalImg.style.opacity = '1';
                thumbImg.style.opacity = '0';
                
                // 动画完成后移除缩略图
                setTimeout(() => {
                    if (thumbImg.parentNode === container) {
                        container.removeChild(thumbImg);
                    }
                    originalImg.style.position = 'static';
                }, 300);
            };
            
            originalImg.onerror = () => {
                // 原图加载失败，保持显示缩略图
                console.warn('Failed to load original image:', originalUrl);
                thumbImg.style.filter = 'none';
            };
        };
        
        // 如果缩略图已经加载完成，立即开始加载原图
        if (thumbImg.complete) {
            loadOriginal();
        } else {
            // 等待缩略图加载完成后再加载原图
            thumbImg.onload = loadOriginal;
            thumbImg.onerror = () => {
                // 缩略图加载失败，直接加载原图
                thumbImg.style.display = 'none';
                loadOriginal();
            };
        }
        
        return container;
    }

    /**
     * 处理Vditor编辑器中的图片，添加懒加载效果
     * 在文件打开时调用
     */
    function processVditorImages() {
        if (!window.vditor || !window.vditor.vditor) return;
        
        const previewElement = window.vditor.vditor.preview;
        if (!previewElement || !previewElement.element) return;
        
        const images = previewElement.element.querySelectorAll('img');
        images.forEach(img => {
            // 跳过已经处理过的图片
            if (img.dataset.lazyProcessed) return;
            
            const originalUrl = img.src;
            const alt = img.alt;
            
            // 检查是否是本地blob URL或data URL
            if (originalUrl.startsWith('blob:') || originalUrl.startsWith('data:')) {
                return; // 本地图片不需要懒加载
            }
            
            // 检查是否是外部图片（非本服务器）
            try {
                const urlObj = new URL(originalUrl);
                if (urlObj.origin !== window.location.origin) {
                    return; // 外部图片不处理
                }
            } catch (e) {
                return; // URL解析失败，跳过
            }
            
            const thumbUrl = getThumbnailUrl(originalUrl);
            if (!thumbUrl || thumbUrl === originalUrl) return;
            
            // 标记为已处理
            img.dataset.lazyProcessed = 'true';
            img.dataset.originalSrc = originalUrl;
            img.dataset.thumbSrc = thumbUrl;
            
            // 先显示缩略图
            img.src = thumbUrl;
            img.style.filter = 'blur(2px)';
            img.style.transition = 'filter 0.3s ease, opacity 0.3s ease';
            
            // 创建原图Image对象预加载
            const originalImg = new Image();
            originalImg.onload = () => {
                // 原图加载完成后切换
                img.style.opacity = '0';
                setTimeout(() => {
                    img.src = originalUrl;
                    img.style.filter = 'none';
                    img.style.opacity = '1';
                }, 50);
            };
            originalImg.src = originalUrl;
        });
    }

    /**
     * 生成带缩略图信息的Markdown图片语法
     * @param {string} originalUrl - 原图URL
     * @param {string} thumbUrl - 缩略图URL
     * @param {string} alt - 图片描述
     * @returns {string} Markdown图片语法
     */
    function generateLazyImageMarkdown(originalUrl, thumbUrl, alt) {
        // 注册缩略图映射
        registerThumbnail(originalUrl, thumbUrl);
        
        // 返回标准Markdown图片语法
        // 缩略图信息会存储在内存中，渲染时再使用
        return `![${alt || ''}](${originalUrl})`;
    }

    // 公开API
    global.LazyImageLoader = {
        registerThumbnail: registerThumbnail,
        getThumbnailUrl: getThumbnailUrl,
        createLazyImage: createLazyImage,
        processVditorImages: processVditorImages,
        generateLazyImageMarkdown: generateLazyImageMarkdown
    };

})(typeof window !== 'undefined' ? window : this);
