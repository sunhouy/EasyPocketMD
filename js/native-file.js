(function(global) {
    'use strict';

    function getTauriRoot() {
        return global.__TAURI__ || null;
    }

    function getDialogApi() {
        var root = getTauriRoot();
        if (!root) return null;
        if (root.dialog && typeof root.dialog.save === 'function') {
            return root.dialog;
        }
        if (root.core && root.core.dialog && typeof root.core.dialog.save === 'function') {
            return root.core.dialog;
        }
        if (root.plugin && root.plugin.dialog && typeof root.plugin.dialog.save === 'function') {
            return root.plugin.dialog;
        }
        if (root.core && root.core.plugin && root.core.plugin.dialog && typeof root.core.plugin.dialog.save === 'function') {
            return root.core.plugin.dialog;
        }
        return null;
    }

    function getFsApi() {
        var root = getTauriRoot();
        if (!root) return null;
        if (root.fs) return root.fs;
        if (root.core && root.core.fs) return root.core.fs;
        if (root.plugin && root.plugin.fs) return root.plugin.fs;
        if (root.core && root.core.plugin && root.core.plugin.fs) return root.core.plugin.fs;
        return null;
    }

    function getInvokeApi() {
        var root = getTauriRoot();
        if (!root) return null;
        if (root.core && typeof root.core.invoke === 'function') return root.core.invoke;
        if (typeof root.invoke === 'function') return root.invoke;
        return null;
    }

    function resolveUrl(url) {
        if (typeof url !== 'string') return url;
        if (typeof global.resolveResourceUrl === 'function') {
            var base = typeof global.getAppOrigin === 'function' ? global.getAppOrigin() : window.location.href;
            return global.resolveResourceUrl(url, base);
        }
        return url;
    }

    function blobToDataUrl(blob) {
        return new Promise(function(resolve, reject) {
            var reader = new FileReader();
            reader.onload = function() {
                resolve(String(reader.result || ''));
            };
            reader.onerror = function() {
                reject(reader.error || new Error('Failed to read blob'));
            };
            reader.readAsDataURL(blob);
        });
    }

    function isTauriRuntime() {
        return !!global.__TAURI__ || !!(global.desktopRuntime && global.desktopRuntime.type === 'tauri');
    }

    function isTextPayload(payload) {
        return typeof payload === 'string' || payload instanceof String;
    }

    function isBlobLike(payload) {
        return typeof Blob !== 'undefined' && payload instanceof Blob;
    }

    function isArrayBufferLike(payload) {
        return payload instanceof ArrayBuffer || ArrayBuffer.isView(payload);
    }

    function getFileExt(filename) {
        var match = String(filename || '').toLowerCase().match(/\.([a-z0-9]+)$/i);
        return match ? match[1] : '';
    }

    async function toUint8Array(payload) {
        if (payload instanceof Uint8Array) return payload;
        if (ArrayBuffer.isView(payload)) {
            return new Uint8Array(payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength));
        }
        if (payload instanceof ArrayBuffer) {
            return new Uint8Array(payload);
        }
        if (isBlobLike(payload)) {
            return new Uint8Array(await payload.arrayBuffer());
        }
        if (isTextPayload(payload)) {
            return new TextEncoder().encode(String(payload));
        }
        throw new Error('Unsupported binary payload');
    }

    async function saveWithTauri(payload, options) {
        var dialog = getDialogApi();
        var fs = getFsApi();
        var invoke = getInvokeApi();
        var filename = options && options.filename ? String(options.filename) : 'download';
        var defaultPath = options && options.defaultPath ? String(options.defaultPath) : filename;

        if ((!dialog || !fs) && !invoke) {
            throw new Error('Tauri file APIs are unavailable');
        }

        // Fallback path: use Rust-side save dialog + write command when JS plugin APIs are unavailable.
        if (!dialog || !fs) {
            var fallbackContent;
            if (payload && typeof payload.url === 'string') {
                var response = await fetch(resolveUrl(payload.url), { cache: 'no-store' });
                if (!response.ok) {
                    throw new Error('HTTP ' + response.status);
                }
                var blobFromUrl = await response.blob();
                fallbackContent = await blobToDataUrl(blobFromUrl);
            } else if (isTextPayload(payload)) {
                fallbackContent = String(payload);
            } else {
                var bytes = await toUint8Array(payload);
                var mimeType = (options && options.mimeType) || 'application/octet-stream';
                fallbackContent = await blobToDataUrl(new Blob([bytes], { type: mimeType }));
            }

            var fallbackPath = await invoke('save_file_with_dialog', {
                name: filename,
                content: fallbackContent,
                title: options && options.title ? String(options.title) : null
            });

            if (!fallbackPath) {
                return { canceled: true, path: null };
            }
            return { canceled: false, path: String(fallbackPath) };
        }

        var savePath = await dialog.save({
            defaultPath: defaultPath,
            title: options && options.title ? options.title : undefined
        });

        if (!savePath) {
            return { canceled: true, path: null };
        }

        if (isTextPayload(payload)) {
            if (typeof fs.writeTextFile === 'function') {
                await fs.writeTextFile(String(savePath), String(payload));
            } else if (typeof fs.writeFile === 'function') {
                await fs.writeFile(String(savePath), new TextEncoder().encode(String(payload)));
            } else {
                throw new Error('Tauri text writer is unavailable');
            }
            return { canceled: false, path: savePath };
        }

        var bytes = await toUint8Array(payload);
        if (typeof fs.writeFile === 'function') {
            await fs.writeFile(String(savePath), bytes);
        } else {
            throw new Error('Tauri binary writer is unavailable');
        }
        return { canceled: false, path: savePath };
    }

    async function saveFile(payload, options) {
        var filename = options && options.filename ? String(options.filename) : 'download';
        var mimeType = options && options.mimeType ? String(options.mimeType) : '';

        if (isTauriRuntime()) {
            return saveWithTauri(payload, {
                filename: filename,
                defaultPath: filename,
                title: options && options.title ? options.title : filename
            });
        }

        var blob;
        if (isBlobLike(payload)) {
            blob = payload;
        } else if (isArrayBufferLike(payload)) {
            blob = new Blob([payload], { type: mimeType || 'application/octet-stream' });
        } else if (isTextPayload(payload)) {
            blob = new Blob([String(payload)], { type: mimeType || 'text/plain' });
        } else if (payload && typeof payload.url === 'string') {
            var response = await fetch(payload.url, { cache: 'no-store' });
            if (!response.ok) {
                throw new Error('HTTP ' + response.status);
            }
            blob = await response.blob();
        } else {
            throw new Error('Unsupported payload for file save');
        }

        var objectUrl = window.URL.createObjectURL(blob);
        var anchor = document.createElement('a');
        anchor.href = objectUrl;
        anchor.download = filename;
        anchor.style.display = 'none';
        document.body.appendChild(anchor);
        anchor.click();
        setTimeout(function() {
            if (anchor.parentNode) {
                anchor.parentNode.removeChild(anchor);
            }
            window.URL.revokeObjectURL(objectUrl);
        }, 100);

        return { canceled: false, path: null };
    }

    global.nativeFileOps = {
        isTauriRuntime: isTauriRuntime,
        saveFile: saveFile,
        getResourceResolveBase: function() {
            if (isTauriRuntime() && typeof global.getAppOrigin === 'function') {
                return global.getAppOrigin();
            }
            return window.location.href;
        },
        getFileExt: getFileExt
    };
})(typeof window !== 'undefined' ? window : this);