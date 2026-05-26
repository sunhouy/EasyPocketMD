
(function(global) {
    'use strict';

    let initialized = false;
    let observer = null;
    let processTimer = null;

    function scheduleProcessImages() {
        if (processTimer) clearTimeout(processTimer);
        processTimer = setTimeout(processAllImages, 80);
    }

    async function processAllImages() {
        const images = document.querySelectorAll('img');
        for (const img of images) {
            const rawSrc = img.getAttribute('src') || img.getAttribute('data-original-src') || img.src;
            const src = global.normalizeAppResourceUrl ? global.normalizeAppResourceUrl(rawSrc) : rawSrc;
            if (src && src !== rawSrc) {
                img.setAttribute('data-original-src', rawSrc);
                img.src = src;
            }
            // 只处理本地图片，云端图片保持原链接
            if (!src || src.startsWith('blob:') || src.startsWith('data:') || src.startsWith('http://') || src.startsWith('https://')) {
                continue;
            }

            try {
                img.setAttribute('data-original-src', src);
                const blobUrl = await global.ResourceLoader.loadImage(src);
                if (blobUrl && blobUrl !== src) {
                    img.src = blobUrl;
                }
            } catch (e) {
                console.error('Failed to process image:', e);
            }
        }
    }

    async function init() {
        if (initialized) return;
        initialized = true;

        try {
            await global.IndexedDBManager.initDB();
            
            const processImages = () => {
                setTimeout(processAllImages, 100);
                setTimeout(processAllImages, 500);
                setTimeout(processAllImages, 1000);
                setTimeout(processAllImages, 2000);
            };

            if (document.readyState === 'complete') {
                processImages();
            } else {
                window.addEventListener('load', processImages);
            }

            observer = new MutationObserver(function(mutations) {
                for (const mutation of mutations) {
                    if (mutation.type === 'childList' && mutation.addedNodes.length) {
                        scheduleProcessImages();
                        return;
                    }
                    if (mutation.type === 'attributes' && mutation.target && mutation.target.tagName === 'IMG') {
                        scheduleProcessImages();
                        return;
                    }
                }
            });
            observer.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['src']
            });
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
        processAllImages,
        init
    };

})(typeof window !== 'undefined' ? window : this);
