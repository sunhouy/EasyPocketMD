let imageCompressorModule = null;
let imageCompressorLoadPromise = null;

async function pickAvailableModulePath(candidates) {
    for (let i = 0; i < candidates.length; i++) {
        const url = candidates[i];
        try {
            const response = await fetch(url, { method: 'GET', cache: 'no-store' });
            if (!response.ok) {
                continue;
            }
            const contentType = (response.headers.get('content-type') || '').toLowerCase();
            if (contentType.indexOf('text/html') !== -1) {
                continue;
            }
            return url;
        } catch (e) {
            // Try next candidate
        }
    }
    return null;
}

export async function loadImageCompressor(options) {
    if (imageCompressorModule) {
        return imageCompressorModule;
    }

    if (imageCompressorLoadPromise) {
        return imageCompressorLoadPromise;
    }

    imageCompressorLoadPromise = (async () => {
        try {
            var candidates = [
                new URL('./wasm_text_engine/image_compressor.js', window.location.href).href,
                new URL('./wasm_text_engine/dist/image_compressor.js', window.location.href).href
            ];

            var modulePath = await pickAvailableModulePath(candidates);
            if (!modulePath) {
                throw new Error('Image compressor module not found');
            }

            var mod = await import(modulePath);
            var factory = mod.default;
            imageCompressorModule = await factory({});
            return imageCompressorModule;
        } catch (e) {
            imageCompressorLoadPromise = null;
            throw e;
        }
    })();

    return imageCompressorLoadPromise;
}

export function isImageCompressorLoaded() {
    return !!imageCompressorModule;
}

export async function compressImage(imageData, width, height, options) {
    var module = await loadImageCompressor();
    var opts = options || {};
    var quality = opts.quality || 80;
    var maxWidth = opts.maxWidth || 1920;

    try {
        var result = module.compressImage(
            imageData,
            width,
            height,
            4,
            quality,
            maxWidth
        );

        if (!result.success) {
            return { code: 500, message: result.error || 'compress failed', data: null };
        }

        return {
            code: 200,
            message: 'ok',
            data: {
                data: result.data,
                width: result.width,
                height: result.height,
                originalSize: result.originalSize,
                compressedSize: result.compressedSize
            }
        };
    } catch (e) {
        return { code: 500, message: 'compress failed: ' + e.message, data: null };
    }
}

export async function encodeImage(rgbaData, width, height, channels, format, quality) {
    var module = await loadImageCompressor();

    try {
        var result = module.encodeImage(rgbaData, width, height, channels, format, quality);

        if (!result.success) {
            return { code: 500, message: result.error || 'encode failed', data: null };
        }

        return {
            code: 200,
            message: 'ok',
            data: {
                data: result.data
            }
        };
    } catch (e) {
        return { code: 500, message: 'encode failed: ' + e.message, data: null };
    }
}

export async function decodeImage(rawData, format) {
    var module = await loadImageCompressor();

    try {
        var result = module.decodeImage(rawData, format);

        if (!result.success) {
            return { code: 500, message: result.error || 'decode failed', data: null };
        }

        return {
            code: 200,
            message: 'ok',
            data: {
                data: result.data,
                width: result.width,
                height: result.height,
                channels: result.channels
            }
        };
    } catch (e) {
        return { code: 500, message: 'decode failed: ' + e.message, data: null };
    }
}