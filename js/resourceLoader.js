
(function(global) {
    'use strict';

    const cache = new Map();
    const loadingPromises = new Map();
    const pendingRevokes = [];

    function createPlaceholderElement(isImage) {
        const placeholder = document.createElement('div');
        placeholder.className = 'resource-loading';
        placeholder.innerHTML = `
            <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;">
                <i class="fas fa-spinner fa-spin" style="font-size:24px;margin-bottom:10px;"></i>
                <span>${isImage ? '加载图片中...' : '加载文件中...'}</span>
            </div>
        `;
        return placeholder;
    }

    async function fetchResource(url, localData = null) {
        try {
            const headers = {};
            if (localData) {
                if (localData.etag) {
                    headers['If-None-Match'] = localData.etag;
                }
                if (localData.lastModified) {
                    const lastModifiedDate = new Date(localData.lastModified);
                    headers['If-Modified-Since'] = lastModifiedDate.toUTCString();
                }
            }

            const response = await fetch(url, { headers });

            if (response.status === 304) {
                return { notModified: true, data: localData.data, contentType: localData.contentType };
            }

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const arrayBuffer = await response.arrayBuffer();
            const contentType = response.headers.get('Content-Type') || 'application/octet-stream';
            const etag = response.headers.get('ETag');
            const lastModified = response.headers.get('Last-Modified');

            return {
                notModified: false,
                data: arrayBuffer,
                contentType,
                etag,
                lastModified: lastModified ? new Date(lastModified).getTime() : Date.now()
            };
        } catch (error) {
            console.error('Failed to fetch resource:', error);
            if (localData) {
                return { notModified: true, data: localData.data, contentType: localData.contentType };
            }
            throw error;
        }
    }

    async function loadResource(url, isImage = false) {
        if (cache.has(url)) {
            return cache.get(url);
        }

        if (loadingPromises.has(url)) {
            return loadingPromises.get(url);
        }

        const loadPromise = (async () => {
            try {
                const localData = await global.IndexedDBManager.getFile(url);
                
                if (localData) {
                    const blobUrl = global.IndexedDBManager.createBlobURL(localData.data, localData.contentType);
                    cache.set(url, blobUrl);
                    
                    (async () => {
                        try {
                            const result = await fetchResource(url, localData);
                            if (!result.notModified) {
                                await global.IndexedDBManager.saveFile(
                                    url,
                                    result.data,
                                    result.contentType,
                                    result.lastModified,
                                    result.etag
                                );
                                
                                if (cache.has(url)) {
                                    const oldBlobUrl = cache.get(url);
                                    pendingRevokes.push(oldBlobUrl);
                                }
                                
                                const newBlobUrl = global.IndexedDBManager.createBlobURL(result.data, result.contentType);
                                cache.set(url, newBlobUrl);
                                refreshResourceInDOM(url, newBlobUrl, isImage);
                            }
                        } catch (error) {
                            console.error('Background update failed:', error);
                        }
                    })();
                    
                    return blobUrl;
                }

                const result = await fetchResource(url);
                await global.IndexedDBManager.saveFile(
                    url,
                    result.data,
                    result.contentType,
                    result.lastModified,
                    result.etag
                );
                
                const blobUrl = global.IndexedDBManager.createBlobURL(result.data, result.contentType);
                cache.set(url, blobUrl);
                return blobUrl;
            } catch (error) {
                console.error('Failed to load resource:', error);
                return url;
            }
        })();

        loadingPromises.set(url, loadPromise);
        try {
            const result = await loadPromise;
            return result;
        } finally {
            loadingPromises.delete(url);
        }
    }

    function refreshResourceInDOM(url, newBlobUrl, isImage) {
        const selector = isImage ? `img[src="${url}"], img[data-original-src="${url}"]` : `[data-resource-url="${url}"]`;
        const elements = document.querySelectorAll(selector);
        
        elements.forEach(el => {
            if (isImage && el.tagName === 'IMG') {
                el.setAttribute('data-original-src', url);
                el.src = newBlobUrl;
            }
        });
    }

    async function loadImage(url) {
        return await loadResource(url, true);
    }

    async function loadFile(url) {
        return await loadResource(url, false);
    }

    async function storeLocalFile(file, url = null) {
        const arrayBuffer = await file.arrayBuffer();
        const fileUrl = url || `local://${Date.now()}-${file.name}`;
        await global.IndexedDBManager.saveFile(fileUrl, arrayBuffer, file.type);
        
        const blobUrl = global.IndexedDBManager.createBlobURL(arrayBuffer, file.type);
        if (global.LocalImageManager && global.LocalImageManager.registerUrlPair) {
            global.LocalImageManager.registerUrlPair(fileUrl, blobUrl);
        }
        cache.set(fileUrl, blobUrl);
        
        return fileUrl;
    }

    async function getLocalBlobUrl(url) {
        if (cache.has(url)) {
            return cache.get(url);
        }
        
        const localData = await global.IndexedDBManager.getFile(url);
        if (localData) {
            const blobUrl = global.IndexedDBManager.createBlobURL(localData.data, localData.contentType);
            if (global.LocalImageManager && global.LocalImageManager.registerUrlPair) {
                global.LocalImageManager.registerUrlPair(url, blobUrl);
            }
            cache.set(url, blobUrl);
            return blobUrl;
        }
        return null;
    }

    function cleanup() {
        pendingRevokes.forEach(url => {
            try {
                global.IndexedDBManager.revokeBlobURL(url);
            } catch (e) {}
        });
        pendingRevokes.length = 0;
    }

    global.ResourceLoader = {
        loadImage,
        loadFile,
        storeLocalFile,
        getLocalBlobUrl,
        createPlaceholderElement,
        cleanup,
        getUrlCache: () => cache
    };

    setInterval(cleanup, 60000);

})(typeof window !== 'undefined' ? window : this);
