(function(global) {
    'use strict';

    const IMAGE_COMPRESS_THRESHOLD = 10 * 1024 * 1024;
    const MAX_CANVAS_PIXELS = 4096 * 4096;
    let workerInstance = null;
    let workerInitializationPromise = null;
    let vipsUnsupportedWarned = false;

    function canUseWorkerCompression() {
        return typeof Worker !== 'undefined' && global.crossOriginIsolated === true;
    }

    function getVipsUnavailableReason() {
        if (typeof Worker === 'undefined') {
            return 'Worker API 不可用';
        }
        if (global.crossOriginIsolated !== true) {
            return 'crossOriginIsolated=false (缺少 COOP/COEP 响应头)';
        }
        return '未知原因';
    }

    function logVipsUnavailableOnce() {
        if (vipsUnsupportedWarned) {
            return;
        }
        vipsUnsupportedWarned = true;
        console.warn('[ImageCompressor] VIPS 压缩不可用，将使用 Canvas 降级。原因:', getVipsUnavailableReason());
    }

    function shouldCompress(file) {
        return file && file.type && file.type.startsWith('image/') && file.size > IMAGE_COMPRESS_THRESHOLD;
    }

    function getWorker() {
        if (workerInstance) {
            return workerInstance;
        }

        // 使用经典 worker (不是 module)，因为 vips-worker.js 使用 importScripts
        const workerUrl = '/js/vips-worker.js';
        workerInstance = new Worker(workerUrl);

        workerInstance.onerror = (error) => {
            console.error('Vips Worker error:', error);
            workerInstance = null;
        };

        return workerInstance;
    }

    function warmupWorker() {
        if (!canUseWorkerCompression()) {
            logVipsUnavailableOnce();
            return Promise.resolve(null);
        }

        if (workerInitializationPromise) {
            return workerInitializationPromise;
        }

        try {
            const worker = getWorker();
            workerInitializationPromise = new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    console.warn('Worker warmup timeout, will retry on next use');
                    workerInitializationPromise = null;
                    resolve(null);
                }, 30000);

                worker.addEventListener('message', function onInitMessage(e) {
                    if (e.data && (e.data.processedBuffer || e.data.error || e.data.ready)) {
                        clearTimeout(timeout);
                        worker.removeEventListener('message', onInitMessage);
                        if (e.data.error) {
                            console.warn('Worker warmup error:', e.data.error);
                            resolve(null);
                        } else {
                            console.info('[ImageCompressor] VIPS worker warmup ready:', e.data.runtime || {
                                crossOriginIsolated: global.crossOriginIsolated === true,
                                hasSharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined'
                            });
                            resolve(e.data);
                        }
                    }
                });

                worker.postMessage({ warmup: true });
            });
        } catch (err) {
            console.warn('Worker warmup failed, will retry on next use:', err);
            workerInitializationPromise = null;
        }

        return workerInitializationPromise;
    }

    function decodeImageFromFile(file) {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(file);
            const img = new Image();

            img.onload = () => {
                URL.revokeObjectURL(url);
                resolve(img);
            };

            img.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('Failed to decode image'));
            };

            img.src = url;
        });
    }

    function calculateTargetDimensions(width, height, maxDimension) {
        if (!width || !height) {
            return { width: maxDimension, height: maxDimension };
        }

        const edgeRatio = Math.min(1, maxDimension / Math.max(width, height));
        const pixelRatio = Math.min(1, Math.sqrt(MAX_CANVAS_PIXELS / (width * height)));
        const ratio = Math.min(edgeRatio, pixelRatio);

        return {
            width: Math.max(1, Math.round(width * ratio)),
            height: Math.max(1, Math.round(height * ratio))
        };
    }

    function createRenderSurface(width, height) {
        if (typeof OffscreenCanvas !== 'undefined') {
            return new OffscreenCanvas(width, height);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        return canvas;
    }

    function get2dContext(surface) {
        const ctx = surface.getContext('2d', {
            alpha: false,
            desynchronized: true,
            willReadFrequently: false
        });
        if (!ctx) {
            throw new Error('Canvas 2D context unavailable');
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        return ctx;
    }

    async function surfaceToBlob(surface, quality) {
        const normalizedQuality = Math.min(1, Math.max(0.1, quality / 100));
        if (typeof surface.convertToBlob === 'function') {
            return surface.convertToBlob({
                type: 'image/jpeg',
                quality: normalizedQuality
            });
        }

        return new Promise((resolve, reject) => {
            surface.toBlob((result) => {
                if (result) {
                    resolve(result);
                } else {
                    reject(new Error('Canvas compression failed'));
                }
            }, 'image/jpeg', normalizedQuality);
        });
    }

    async function decodeImageForCompression(file, targetWidth, targetHeight) {
        if (typeof createImageBitmap === 'function') {
            try {
                return await createImageBitmap(file, {
                    resizeWidth: targetWidth,
                    resizeHeight: targetHeight,
                    resizeQuality: 'high'
                });
            } catch (err) {
                console.warn('[ImageCompressor] createImageBitmap 缩放解码失败，回退到 Image:', err);
            }
        }

        return decodeImageFromFile(file);
    }

    async function drawScaledImage(source, sourceWidth, sourceHeight, targetWidth, targetHeight) {
        let currentSurface = source;
        let currentWidth = sourceWidth;
        let currentHeight = sourceHeight;

        while (currentWidth / 2 > targetWidth && currentHeight / 2 > targetHeight) {
            const nextWidth = Math.max(targetWidth, Math.round(currentWidth / 2));
            const nextHeight = Math.max(targetHeight, Math.round(currentHeight / 2));
            const nextSurface = createRenderSurface(nextWidth, nextHeight);
            const nextCtx = get2dContext(nextSurface);
            nextCtx.drawImage(currentSurface, 0, 0, nextWidth, nextHeight);

            if (currentSurface && typeof currentSurface.close === 'function') {
                currentSurface.close();
            }

            currentSurface = nextSurface;
            currentWidth = nextWidth;
            currentHeight = nextHeight;
        }

        const outputSurface = createRenderSurface(targetWidth, targetHeight);
        const outputCtx = get2dContext(outputSurface);
        outputCtx.fillStyle = '#ffffff';
        outputCtx.fillRect(0, 0, targetWidth, targetHeight);
        outputCtx.drawImage(currentSurface, 0, 0, targetWidth, targetHeight);

        if (currentSurface && currentSurface !== source && typeof currentSurface.close === 'function') {
            currentSurface.close();
        }

        return outputSurface;
    }

    async function compressImageWithCanvas(file, options = {}) {
        const quality = options.quality || 75;
        const maxDimension = options.maxDimension || 4096;
        console.warn('[ImageCompressor] 使用 Canvas 降级压缩:', {
            fileName: file.name,
            reason: getVipsUnavailableReason(),
            quality,
            maxDimension
        });
        const probe = await decodeImageFromFile(file);
        const originalWidth = probe.naturalWidth || probe.width;
        const originalHeight = probe.naturalHeight || probe.height;
        const targetSize = calculateTargetDimensions(originalWidth, originalHeight, maxDimension);
        const decoded = await decodeImageForCompression(file, targetSize.width, targetSize.height);
        const decodedWidth = decoded.width || originalWidth;
        const decodedHeight = decoded.height || originalHeight;
        const surface = await drawScaledImage(
            decoded,
            decodedWidth,
            decodedHeight,
            targetSize.width,
            targetSize.height
        );
        const blob = await surfaceToBlob(surface, quality);

        if (decoded && typeof decoded.close === 'function') {
            decoded.close();
        }

        const fileName = file.name.replace(/\.[^/.]+$/, '') + '.jpg';
        const compressedFile = new File([blob], fileName, { type: 'image/jpeg' });

        return {
            file: compressedFile,
            originalSize: file.size,
            compressedSize: blob.size,
            originalFileName: file.name,
            compressedFileName: fileName,
            compressionRatio: (1 - blob.size / file.size) * 100
        };
    }

    function compressImage(file, options = {}) {
        if (!shouldCompress(file)) {
            return Promise.resolve(null);
        }

        if (!canUseWorkerCompression()) {
            logVipsUnavailableOnce();
            return compressImageWithCanvas(file, options);
        }

        return new Promise((resolve, reject) => {
            const quality = options.quality || 75;
            const maxDimension = options.maxDimension || 4096;

            const reader = new FileReader();
            reader.onload = async (e) => {
                const buffer = e.target.result;

                try {
                    warmupWorker();

                    const worker = getWorker();
                    console.info('[ImageCompressor] 使用 VIPS worker 压缩:', {
                        fileName: file.name,
                        originalSize: file.size,
                        quality,
                        maxDimension
                    });
                    worker.postMessage(
                        {
                            fileBuffer: buffer,
                            fileName: file.name,
                            quality,
                            maxDimension
                        },
                        [buffer]
                    );

                    worker.onmessage = (msg) => {
                        if (msg.data.error) {
                            console.warn('[ImageCompressor] VIPS 压缩失败，降级 Canvas:', msg.data.error);
                            compressImageWithCanvas(file, options)
                                .then(resolve)
                                .catch(() => reject(new Error(msg.data.error)));
                            return;
                        }

                        const blob = new Blob([msg.data.processedBuffer], { type: 'image/jpeg' });
                        const compressedFile = new File([blob], msg.data.fileName, { type: 'image/jpeg' });

                        console.info('[ImageCompressor] VIPS 压缩成功:', {
                            fileName: msg.data.fileName,
                            originalSize: file.size,
                            compressedSize: blob.size,
                            originalWidth: msg.data.originalWidth,
                            originalHeight: msg.data.originalHeight,
                            outputWidth: msg.data.outputWidth,
                            outputHeight: msg.data.outputHeight
                        });

                        resolve({
                            file: compressedFile,
                            originalSize: file.size,
                            compressedSize: blob.size,
                            originalFileName: file.name,
                            compressedFileName: msg.data.fileName,
                            compressionRatio: (1 - blob.size / file.size) * 100
                        });
                    };

                    worker.onerror = (error) => {
                        const errorMsg = error.message || error.toString() || 'Unknown error';
                        const errorDetails = {
                            message: errorMsg,
                            filename: error.filename,
                            lineno: error.lineno,
                            colno: error.colno,
                            error: error.error ? error.error.message : null
                        };
                        console.error('Worker error details:', errorDetails);
                        console.warn('[ImageCompressor] VIPS worker error，降级 Canvas');
                        compressImageWithCanvas(file, options)
                            .then(resolve)
                            .catch(() => reject(new Error('Worker processing failed: ' + errorMsg)));
                    };
                } catch (err) {
                    console.warn('[ImageCompressor] VIPS 初始化异常，降级 Canvas:', err);
                    compressImageWithCanvas(file, options)
                        .then(resolve)
                        .catch(() => reject(err));
                }
            };

            reader.onerror = () => {
                reject(new Error('Failed to read file'));
            };

            reader.readAsArrayBuffer(file);
        });
    }

    function showCompressConfirm(file, compressCallback, skipCallback) {
        return new Promise((resolve) => {
            const nightMode = global.nightMode;
            const sizeInMB = (file.size / (1024 * 1024)).toFixed(2);

            const overlay = document.createElement('div');
            overlay.className = 'modal-overlay';
            overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:20000;';

            const bg = nightMode ? '#2d2d2d' : 'white';
            const textColor = nightMode ? '#eee' : '#333';

            const content = document.createElement('div');
            content.style.cssText = `background:${bg};color:${textColor};border-radius:12px;padding:25px;width:90%;max-width:450px;text-align:center;box-shadow: 0 4px 20px rgba(0,0,0,0.3);`;

            const t = (key) => window.i18n ? window.i18n.t(key) : key;

            content.innerHTML = `
                <h3 style="margin-top:0;">${t('compressLargeImageTitle') || '图片较大'}</h3>
                <p style="margin-bottom:20px;font-size:14px;">
                    ${t('compressLargeImageMessage') || '该图片超过 10MB，建议压缩以提升编辑和加载性能。'}
                    <br><br>
                    <strong>${file.name}</strong> (${sizeInMB} MB)
                </p>
                <div style="display:flex;gap:15px;">
                    <button id="compress-skip" style="flex:1;padding:12px;background:${nightMode ? '#555' : '#e0e0e0'};color:${textColor};border:none;border-radius:8px;font-weight:bold;cursor:pointer;">
                        ${t('compressSkip') || '跳过压缩'}
                    </button>
                    <button id="compress-confirm" style="flex:1;padding:12px;background:#4CAF50;color:white;border:none;border-radius:8px;font-weight:bold;cursor:pointer;">
                        ${t('compressConfirm') || '压缩并上传'}
                    </button>
                </div>
            `;

            overlay.appendChild(content);
            document.body.appendChild(overlay);

            const skipBtn = content.querySelector('#compress-skip');
            const confirmBtn = content.querySelector('#compress-confirm');

            skipBtn.onclick = () => {
                overlay.remove();
                resolve('skip');
            };

            confirmBtn.onclick = () => {
                overlay.remove();
                resolve('compress');
            };

            overlay.onclick = (e) => {
                if (e.target === overlay) {
                    overlay.remove();
                    resolve('skip');
                }
            };
        });
    }

    async function handleLargeImageUpload(file, options = {}) {
        if (!shouldCompress(file)) {
            return { action: 'upload', file };
        }

        const userChoice = await showCompressConfirm(file);

        if (userChoice === 'compress') {
            try {
                if (global.showMessage) {
                    global.showMessage('正在压缩图片...', 'info');
                }

                const result = await compressImage(file, {
                    quality: options.quality || 75,
                    maxDimension: options.maxDimension || 4096
                });

                if (result && result.file) {
                    const sizeBefore = (result.originalSize / (1024 * 1024)).toFixed(2);
                    const sizeAfter = (result.compressedSize / (1024 * 1024)).toFixed(2);
                    const ratio = result.compressionRatio.toFixed(1);

                    if (global.showMessage) {
                        global.showMessage(
                            `图片压缩完成: ${sizeBefore}MB → ${sizeAfter}MB (减少 ${ratio}%)`,
                            'success'
                        );
                    }

                    return {
                        action: 'upload',
                        file: result.file,
                        compressed: true,
                        compressionResult: result
                    };
                }
            } catch (err) {
                console.error('图片压缩失败:', err);
                if (global.showMessage) {
                    global.showMessage('图片压缩失败，将上传原图', 'warning');
                }
            }
        }

        return { action: 'upload', file, compressed: false };
    }

    global.handleLargeImageUpload = handleLargeImageUpload;
    global.shouldCompress = shouldCompress;
    global.warmupImageCompressor = warmupWorker;

})(typeof window !== 'undefined' ? window : this);
