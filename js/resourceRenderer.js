
(function(global) {
    'use strict';

    let initialized = false;
    const observerOptions = {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['src']
    };

    function isImageUrl(url) {
        if (!url) return false;
        const imageExtensions = /\.(jpg|jpeg|png|gif|bmp|webp|svg)$/i;
        return imageExtensions.test(url) || (url.startsWith('data:') && url.includes('image/'));
    }

    async function processImage(imgElement) {
        const originalSrc = imgElement.getAttribute('src') || imgElement.getAttribute('data-original-src');
        
        if (!originalSrc || originalSrc.startsWith('blob:') || originalSrc.startsWith('data:')) {
            return;
        }

        try {
            imgElement.setAttribute('data-original-src', originalSrc);
            
            const blobUrl = await global.ResourceLoader.loadImage(originalSrc);
            if (blobUrl && blobUrl !== originalSrc) {
                imgElement.src = blobUrl;
            }
        } catch (error) {
            console.error('Failed to process image:', error);
        }
    }

    async function processAllImagesInContainer(container) {
        const images = container.querySelectorAll('img');
        for (const img of images) {
            processImage(img);
        }
    }

    function setupMutationObserver() {
        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === 'attributes' && mutation.target.tagName === 'IMG') {
                    processImage(mutation.target);
                } else if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === 1) {
                            if (node.tagName === 'IMG') {
                                processImage(node);
                            } else {
                                processAllImagesInContainer(node);
                            }
                        }
                    });
                }
            }
        });

        const vditorElement = document.getElementById('vditor');
        if (vditorElement) {
            observer.observe(vditorElement, observerOptions);
        }

        observer.observe(document.body, observerOptions);
    }

    async function init() {
        if (initialized) return;
        initialized = true;

        try {
            await global.IndexedDBManager.initDB();
            
            setTimeout(() => {
                setupMutationObserver();
                processAllImagesInContainer(document.body);
            }, 1000);
        } catch (error) {
            console.error('Failed to initialize resource renderer:', error);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    global.ResourceRenderer = {
        init,
        processImage,
        processAllImagesInContainer
    };

})(typeof window !== 'undefined' ? window : this);
