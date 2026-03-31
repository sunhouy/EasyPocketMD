(function(global) {
    'use strict';

    const state = {
        enabled: true,
        ready: false,
        disabledByError: false,
        initPromise: null,
        initError: null,
        warned: false,
        client: null
    };

    function getEnabledFlag() {
        // 对所有用户默认启用智能文本引擎；失败时自动降级到 JS 兜底。
        return true;
    }

    function warnOnce(message) {
        if (state.warned) return;
        state.warned = true;
        console.warn('[text-engine]', message);
    }

    function isBuildTimeWasmPresent() {
        if (typeof __WASM_TEXT_ENGINE_PRESENT__ === 'boolean') {
            return __WASM_TEXT_ENGINE_PRESENT__;
        }
        return true;
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
            return { code: 500, message: state.initError || 'text engine disabled' };
        }

        state.enabled = getEnabledFlag();
        if (!state.enabled) {
            return { code: 200, message: 'disabled', data: { enabled: false, ready: false } };
        }

        if (!isBuildTimeWasmPresent()) {
            return {
                code: 500,
                message: 'Text engine artifact was not packaged in this build'
            };
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
                        message: 'Text engine artifact not found'
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
                warnOnce('init failed, fallback to built-in implementation: ' + state.initError);
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

    async function ensureReady() {
        if (isUsable()) return { code: 200, message: 'ready' };
        return init();
    }

    function byteOffsetToUtf16Index(text, byteOffset) {
        try {
            const encoder = new TextEncoder();
            const decoder = new TextDecoder();
            const bytes = encoder.encode(text || '');
            const end = Math.max(0, Math.min(byteOffset || 0, bytes.length));
            return decoder.decode(bytes.slice(0, end)).length;
        } catch (e) {
            return Math.max(0, Math.min(byteOffset || 0, (text || '').length));
        }
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
        if (!isUsable()) return { code: 500, message: 'smart merge unavailable' };
        return state.client.merge3(baseText || '', localText || '', remoteText || '', strategy || 'manual');
    }

    function rebuildIndex(files) {
        if (!isUsable()) return { code: 500, message: 'smart search unavailable' };
        const docs = Array.isArray(files) ? files : [];

        state.client.clearIndex();
        docs.forEach(function(file) {
            if (!file || file.type !== 'file' || !file.id) return;
            state.client.indexDocument(String(file.id), file.content || '');
        });

        return { code: 200, message: 'ok', data: { indexedCount: docs.length } };
    }

    function searchFiles(query, options) {
        if (!isUsable()) return { code: 500, message: 'smart search unavailable' };
        const rebuildRes = rebuildIndex(global.files || []);
        if (!rebuildRes || rebuildRes.code !== 200) {
            return rebuildRes;
        }
        return state.client.search(query || '', options || {});
    }

    function findInText(text, query, options) {
        if (!isUsable()) return { code: 500, message: 'smart find unavailable' };
        const res = state.client.findInText(text || '', query || '', options || {});
        if (!res || res.code !== 200 || !res.data) return res;

        const normalized = {
            query: res.data.query || query || '',
            count: Number(res.data.count || 0),
            matches: []
        };

        const raw = Array.isArray(res.data.matches) ? res.data.matches : [];
        raw.forEach(function(item) {
            const startByte = Number(item.start || 0);
            const endByte = Number(item.end || startByte);
            normalized.matches.push({
                start: byteOffsetToUtf16Index(text || '', startByte),
                end: byteOffsetToUtf16Index(text || '', endByte),
                snippet: item.snippet || ''
            });
        });

        normalized.count = normalized.matches.length;
        return { code: 200, message: 'ok', data: normalized };
    }

    function replaceAllText(text, query, replacement, options) {
        if (!isUsable()) return { code: 500, message: 'smart replace unavailable' };
        return state.client.replaceAllText(text || '', query || '', replacement || '', options || {});
    }

    function searchFilesDetailed(query, options) {
        if (!isUsable()) return { code: 500, message: 'smart search unavailable' };

        const files = Array.isArray(global.files) ? global.files : [];
        const results = [];
        let totalMatches = 0;

        files.forEach(function(file) {
            if (!file || file.type !== 'file') return;
            const res = findInText(file.content || '', query || '', options || {});
            if (!res || res.code !== 200 || !res.data || !Array.isArray(res.data.matches) || res.data.matches.length === 0) {
                return;
            }

            const hits = res.data.matches.map(function(hit, idx) {
                return {
                    index: idx,
                    start: hit.start,
                    end: hit.end,
                    snippet: hit.snippet || ''
                };
            });

            totalMatches += hits.length;
            results.push({
                docId: String(file.id),
                filename: file.name || '',
                matchCount: hits.length,
                hits: hits
            });
        });

        return {
            code: 200,
            message: 'ok',
            data: {
                query: query || '',
                files: results,
                fileCount: results.length,
                totalMatches: totalMatches
            }
        };
    }

    global.wasmTextEngineGateway = {
        init: init,
        ensureReady: ensureReady,
        diff: diff,
        merge3: merge3,
        searchFiles: searchFiles,
        searchFilesDetailed: searchFilesDetailed,
        findInText: findInText,
        replaceAllText: replaceAllText,
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

