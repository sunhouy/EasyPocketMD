(function(global) {
    'use strict';

    const IMAGE_COMPRESS_THRESHOLD = 10 * 1024 * 1024;
    let workerInstance = null;
    let workerInitializationPromise = null;

    function shouldCompress(file) {
        return file && file.type && file.type.startsWith('image/') && file.size > IMAGE_COMPRESS_THRESHOLD;
    }

    function getWorker() {
        if (workerInstance) {
            return workerInstance;
        }

        // 使用经典 worker (不是 module)，因为 vips-worker.js 使用 importScripts
        // 设置 name 不为 em-pthread，防止 vips.js 自动初始化
        const workerUrl = '/js/vips-worker.js';
        workerInstance = new Worker(workerUrl, { name: 'vips-compressor' });

        workerInstance.onerror = (error) => {
            console.error('Vips Worker error:', error);
            workerInstance = null;
        };

        return workerInstance;
    }

    function warmupWorker() {
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

    function compressImage(file, options = {}) {
        if (!shouldCompress(file)) {
            return Promise.resolve(null);
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
                            reject(new Error(msg.data.error));
                            return;
                        }

                        const blob = new Blob([msg.data.processedBuffer], { type: 'image/jpeg' });
                        const compressedFile = new File([blob], msg.data.fileName, { type: 'image/jpeg' });

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
                        reject(new Error('Worker processing failed: ' + errorMsg));
                    };
                } catch (err) {
                    reject(err);
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
