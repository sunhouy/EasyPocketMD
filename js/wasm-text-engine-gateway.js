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

    function utf8ByteLengthOfCodePoint(codePoint) {
        if (codePoint <= 0x7f) return 1;
        if (codePoint <= 0x7ff) return 2;
        if (codePoint <= 0xffff) return 3;
        return 4;
    }

    // Convert UTF-8 byte offset (from WASM) to JS UTF-16 index (for DOM highlight/slice).
    function byteToCharIndex(text, byteOffset) {
        const source = String(text || '');
        const target = Math.max(0, Number(byteOffset) || 0);
        let bytesSeen = 0;
        let utf16Index = 0;

        for (const ch of source) {
            if (bytesSeen >= target) break;
            const cp = ch.codePointAt(0) || 0;
            const cpBytes = utf8ByteLengthOfCodePoint(cp);
            if (bytesSeen + cpBytes > target) break;
            bytesSeen += cpBytes;
            utf16Index += ch.length;
        }

        return utf16Index;
    }

    function buildSnippetByCharIndex(text, startIndex, endIndex, sideChars) {
        const source = String(text || '');
        const start = Math.max(0, Math.min(Number(startIndex) || 0, source.length));
        const end = Math.max(start, Math.min(Number(endIndex) || start, source.length));
        const radius = Math.max(0, Number(sideChars) || 30);
        const left = Math.max(0, start - radius);
        const right = Math.min(source.length, end + radius);
        return source.slice(left, right);
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
            const startChar = byteToCharIndex(text || '', startByte);
            const endChar = byteToCharIndex(text || '', endByte);
            normalized.matches.push({
                start: startChar,
                end: Math.max(startChar, endChar),
                // Keep snippet semantics aligned with frontend JS fallback (char-index based slicing).
                snippet: buildSnippetByCharIndex(text || '', startChar, endChar, 30)
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

        try {
            const files = Array.isArray(global.files) ? global.files : [];
            const results = [];
            let totalMatches = 0;

            files.forEach(function(file) {
                if (!file || file.type !== 'file') return;
                const res = findInText(file.content || '', query || '', options || {});
                if (!res || res.code !== 200) {
                    throw new Error((res && res.message) || 'findInText failed in searchFilesDetailed');
                }
                if (!res.data || !Array.isArray(res.data.matches) || res.data.matches.length === 0) {
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
        } catch (e) {
            return { code: 500, message: 'smart search failed: ' + (e && e.message ? e.message : 'unknown error') };
        }
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

