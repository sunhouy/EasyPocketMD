
export const localImageApi = (function(global: Window) {
    'use strict';

    const localToBlobMap = new Map();
    const blobToLocalMap = new Map();

    function registerUrlPair(localUrl, blobUrl) {
        localToBlobMap.set(localUrl, blobUrl);
        blobToLocalMap.set(blobUrl, localUrl);
    }

    async function convertLocalToBlob(markdown) {
        if (!markdown) return markdown;
        
        let result = markdown;
        const localUrls = [];
        
        const tempPattern = /\((local:\/\/[^\)]+)\)/g;
        let match;
        while ((match = tempPattern.exec(markdown)) !== null) {
            localUrls.push(match[1]);
        }
        
        for (const url of localUrls) {
            try {
                let blobUrl = localToBlobMap.get(url);
                if (!blobUrl) {
                    blobUrl = global.E2EAttachments?.encryptedUrl(url) ? await global.E2EAttachments.load(url) : await global.ResourceLoader.getLocalBlobUrl(url);
                    if (blobUrl) {
                        registerUrlPair(url, blobUrl);
                    }
                }
                if (blobUrl) {
                    result = result.replace(new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), blobUrl);
                }
            } catch (e) {
                console.error('Failed to convert local to blob:', url, e);
            }
        }
        
        return result;
    }

    function convertBlobToLocal(markdown) {
        if (!markdown) return markdown;
        
        let result = markdown;
        
        result = result.replace(/\((blob:[^\)]+)\)/g, (match, blobUrl) => {
            const localUrl = blobToLocalMap.get(blobUrl);
            if (localUrl) {
                return `(${localUrl})`;
            }
            return match;
        });
        
        return result;
    }

    return global.LocalImageManager = {
        convertLocalToBlob,
        convertBlobToLocal,
        registerUrlPair
    };

})(window);
