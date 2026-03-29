
(function(global) {
    'use strict';

    let initialized = false;

    async function processAllImages() {
        const images = document.querySelectorAll('img');
        for (const img of images) {
            const src = img.src || img.getAttribute('data-original-src');
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
