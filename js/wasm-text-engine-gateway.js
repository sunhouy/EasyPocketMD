(function(global) {
    'use strict';

    const state = {
        enabled: false,
        ready: false,
        disabledByError: false,
        initPromise: null,
        initError: null,
        warned: false,
        client: null
    };

    function getEnabledFlag() {
        const override = localStorage.getItem('vditor_enable_wasm_text_engine');
        if (override === 'true' || override === 'false') {
            return override === 'true';
        }
        if (global.userSettings && typeof global.userSettings.enableWasmTextEngine === 'boolean') {
            return global.userSettings.enableWasmTextEngine;
        }
        return false;
    }

    function warnOnce(message) {
        if (state.warned) return;
        state.warned = true;
        console.warn('[wasm-text-engine]', message);
    }

    async function pickAvailableModulePath(explicitPath) {
        const candidates = explicitPath
            ? [explicitPath]
            : [
                new URL('./wasm_text_engine/text_engine.js', window.location.href).href,
                new URL('./wasm_text_engine/dist/text_engine.js', window.location.href).href
            ];

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
                // Try next candidate.
            }
        }

        return null;
    }

    async function init(options) {
        if (state.disabledByError) {
            return { code: 500, message: state.initError || 'wasm gateway disabled' };
        }

        state.enabled = getEnabledFlag();
        if (!state.enabled) {
            return { code: 200, message: 'disabled', data: { enabled: false, ready: false } };
        }

        if (state.ready) {
            return { code: 200, message: 'ready', data: { enabled: true, ready: true } };
        }

        if (state.initPromise) {
            return state.initPromise;
        }

        state.initPromise = (async function() {
            try {
                const mod = await import('../wasm_text_engine/js/text-engine-client.js');
                const Client = mod.WasmTextEngineClient;
                state.client = new Client();

                const modulePath = await pickAvailableModulePath(options && options.modulePath);
                if (!modulePath) {
                    return {
                        code: 500,
                        message: 'WASM artifact not found. Build it with: npm run wasm:text:build && npm run build'
                    };
                }

                const res = await state.client.init({ modulePath: modulePath });
                if (!res || res.code !== 200) {
                    throw new Error((res && res.message) || 'init failed');
                }

                state.ready = true;
                return { code: 200, message: 'ready', data: { enabled: true, ready: true } };
            } catch (error) {
                state.disabledByError = true;
                state.initError = error && error.message ? error.message : 'unknown init error';
                warnOnce('init failed, fallback to JS implementation: ' + state.initError);
                return { code: 500, message: state.initError };
            }
        })();

        return state.initPromise;
    }

    function isUsable() {
        if (!getEnabledFlag()) return false;
        if (state.disabledByError || !state.ready || !state.client) return false;
        return true;
    }

    function diff(leftText, rightText) {
        if (!isUsable()) return null;

        const res = state.client.diff(leftText || '', rightText || '');
        if (!res || res.code !== 200 || !res.data || !Array.isArray(res.data.ops)) {
            return null;
        }

        const mapped = [];
        res.data.ops.forEach(function(op) {
            if (op.type === 'equal') {
                mapped.push({ type: 'same', left: op.text || '', right: op.text || '' });
            } else if (op.type === 'add') {
                mapped.push({ type: 'added', left: '', right: op.text || '' });
            } else if (op.type === 'delete') {
                mapped.push({ type: 'removed', left: op.text || '', right: '' });
            }
        });

        return mapped;
    }

    function merge3(baseText, localText, remoteText, strategy) {
        if (!isUsable()) return { code: 500, message: 'wasm merge unavailable' };
        return state.client.merge3(baseText || '', localText || '', remoteText || '', strategy || 'manual');
    }

    function rebuildIndex(files) {
        if (!isUsable()) return { code: 500, message: 'wasm search unavailable' };
        const docs = Array.isArray(files) ? files : [];

        state.client.clearIndex();
        docs.forEach(function(file) {
            if (!file || file.type !== 'file' || !file.id) return;
            state.client.indexDocument(String(file.id), file.content || '');
        });

        return { code: 200, message: 'ok', data: { indexedCount: docs.length } };
    }

    function searchFiles(query, options) {
        if (!isUsable()) return { code: 500, message: 'wasm search unavailable' };
        const rebuildRes = rebuildIndex(global.files || []);
        if (!rebuildRes || rebuildRes.code !== 200) {
            return rebuildRes;
        }
        return state.client.search(query || '', options || {});
    }

    global.wasmTextEngineGateway = {
        init: init,
        diff: diff,
        merge3: merge3,
        searchFiles: searchFiles,
        getStatus: function() {
            return {
                enabled: getEnabledFlag(),
                ready: state.ready,
                disabledByError: state.disabledByError,
                initError: state.initError
            };
        }
    };
})(typeof window !== 'undefined' ? window : this);

