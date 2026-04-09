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
        // 对所有用户默认启用智能文本引擎。
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

    function getBuildTag() {
        if (typeof __APP_BUILD_TAG__ === 'string' && __APP_BUILD_TAG__) {
            return __APP_BUILD_TAG__;
        }
        return '';
    }

    function withCacheTag(url, cacheTag) {
        if (!cacheTag) return url;
        try {
            const target = new URL(url, window.location.href);
            if (!target.searchParams.has('v')) {
                target.searchParams.set('v', cacheTag);
            }
            return target.href;
        } catch (e) {
            return url;
        }
    }

    function buildModuleOptions(cacheTag) {
        if (!cacheTag) return {};
        return {
            locateFile: function(path, scriptDirectory) {
                try {
                    const located = new URL(path, scriptDirectory || window.location.href);
                    // Avoid query suffix for local file:// runtime (e.g., Electron offline bundle).
                    if (located.protocol !== 'file:' && !located.searchParams.has('v')) {
                        located.searchParams.set('v', cacheTag);
                    }
                    return located.href;
                } catch (e) {
                    return (scriptDirectory || '') + path;
                }
            }
        };
    }

    async function pickAvailableModulePath(explicitPath, cacheTag) {
        const rawCandidates = explicitPath
            ? [explicitPath]
            : [
                new URL('./wasm_text_engine/text_engine.js', window.location.href).href,
                new URL('./wasm_text_engine/dist/text_engine.js', window.location.href).href
            ];
        const candidates = rawCandidates.map(function(url) {
            return withCacheTag(url, cacheTag);
        });

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
                const cacheTag = getBuildTag();

                const modulePath = await pickAvailableModulePath(options && options.modulePath, cacheTag);
                if (!modulePath) {
                    return {
                        code: 500,
                        message: 'Text engine artifact not found'
                    };
                }

                const moduleOptions = Object.assign(
                    {},
                    buildModuleOptions(cacheTag),
                    options && options.moduleOptions ? options.moduleOptions : {}
                );

                const res = await state.client.init({ modulePath: modulePath, moduleOptions: moduleOptions });
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

    function isHiddenCrossSearchFile(filename) {
        const name = String(filename || '').trim();
        if (!name) return false;
        return /(^|[\/])\.[^\/]/.test(name);
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
            if (!file || file.type !== 'file' || !file.id || isHiddenCrossSearchFile(file.name)) return;
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

    function normalizePath(input) {
        if (!isUsable()) throw new Error('smart normalizePath unavailable');
        return state.client.normalizePath(input || '');
    }

    function parentPath(path) {
        if (!isUsable()) throw new Error('smart parentPath unavailable');
        return state.client.parentPath(path || '');
    }

    function basenamePath(path) {
        if (!isUsable()) throw new Error('smart basenamePath unavailable');
        return state.client.basenamePath(path || '');
    }

    function pathBasename(path) {
        if (!isUsable()) throw new Error('smart pathBasename unavailable');
        return state.client.pathBasename(path || '');
    }

    function compareVersions(originalContent, newContent) {
        if (!isUsable()) throw new Error('smart compareVersions unavailable');
        const res = state.client.compareVersions(originalContent || '', newContent || '');
        if (!res || res.code !== 200 || !res.data) {
            throw new Error((res && res.message) || 'compareVersions failed');
        }
        return res.data;
    }

    function isHiddenCrossSearchFile(filename) {
        if (!isUsable()) throw new Error('smart isHiddenCrossSearchFile unavailable');
        const res = state.client.isHiddenCrossSearchFile(filename || '');
        if (!res || res.code !== 200 || !res.data) {
            throw new Error((res && res.message) || 'isHiddenCrossSearchFile failed');
        }
        return !!res.data.hidden;
    }

    function collectFolderPaths(entriesPayload) {
        if (!isUsable()) throw new Error('smart collectFolderPaths unavailable');
        const res = state.client.collectFolderPaths(entriesPayload || '');
        if (!res || res.code !== 200 || !res.data || !Array.isArray(res.data.folders)) {
            throw new Error((res && res.message) || 'collectFolderPaths failed');
        }
        return res.data.folders;
    }

    function replaceAllText(text, query, replacement, options) {
        if (!isUsable()) return { code: 500, message: 'smart replace unavailable' };
        return state.client.replaceAllText(text || '', query || '', replacement || '', options || {});
    }

    function analyze(text) {
        if (!isUsable()) return { code: 500, message: 'smart analyze unavailable' };
        return state.client.analyze(text || '');
    }

    function similarity(leftText, rightText) {
        if (!isUsable()) return { code: 500, message: 'smart similarity unavailable' };
        return state.client.similarity(leftText || '', rightText || '');
    }

    function extractTags(text) {
        if (!isUsable()) return { code: 500, message: 'smart extractTags unavailable' };
        return state.client.extractTags(text || '');
    }

    function slashPalette(query, options) {
        if (!isUsable()) return { code: 500, message: 'slash palette unavailable' };
        if (!state.client || typeof state.client.slashPalette !== 'function') {
            return { code: 500, message: 'slash palette unavailable' };
        }
        return state.client.slashPalette(query || '', options || {});
    }

    function slashPaletteSettings(language) {
        if (!isUsable()) return { code: 500, message: 'slash palette settings unavailable' };
        if (!state.client || typeof state.client.slashPaletteSettings !== 'function') {
            return { code: 500, message: 'slash palette settings unavailable' };
        }
        return state.client.slashPaletteSettings(language || '');
    }

    function searchFilesDetailed(query, options) {
        if (!isUsable()) return { code: 500, message: 'smart search unavailable' };

        try {
            const rebuildRes = rebuildIndex(global.files || []);
            if (!rebuildRes || rebuildRes.code !== 200) {
                return rebuildRes;
            }

            const searchRes = state.client.search(query || '', options || {});
            if (!searchRes || searchRes.code !== 200 || !searchRes.data) {
                throw new Error((searchRes && searchRes.message) || 'search failed');
            }

            const files = Array.isArray(global.files) ? global.files : [];
            const fileMap = {};
            files.forEach(function(file) {
                if (!file || !file.id || isHiddenCrossSearchFile(file.name)) return;
                fileMap[String(file.id)] = file;
            });

            const rows = Array.isArray(searchRes.data.results) ? searchRes.data.results : [];
            const results = rows.map(function(row) {
                const file = fileMap[String(row.docId)] || {};
                const fileContent = String(file.content || '');
                const hits = Array.isArray(row.hits) ? row.hits.map(function(hit, idx) {
                    const startByte = Number(hit.start || 0);
                    const endByte = Number(hit.end || startByte);
                    const startChar = byteToCharIndex(fileContent, startByte);
                    const endChar = byteToCharIndex(fileContent, endByte);
                    return {
                        index: idx,
                        start: startChar,
                        end: Math.max(startChar, endChar),
                        snippet: hit.snippet || buildSnippetByCharIndex(fileContent, startChar, endChar, 30)
                    };
                }) : [];
                return {
                    docId: String(row.docId || ''),
                    filename: file.name || row.filename || '',
                    matchCount: hits.length,
                    hits: hits
                };
            });
            const totalMatches = results.reduce(function(sum, item) {
                return sum + (item.matchCount || 0);
            }, 0);

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
        normalizePath: normalizePath,
        parentPath: parentPath,
        basenamePath: basenamePath,
        pathBasename: pathBasename,
        compareVersions: compareVersions,
        isHiddenCrossSearchFile: isHiddenCrossSearchFile,
        collectFolderPaths: collectFolderPaths,
        replaceAllText: replaceAllText,
        analyze: analyze,
        similarity: similarity,
        extractTags: extractTags,
        slashPalette: slashPalette,
        slashPaletteSettings: slashPaletteSettings,
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

