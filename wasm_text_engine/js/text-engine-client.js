function ok(data, message) {
    return { code: 200, message: message || 'ok', data: data || {} };
}

function err(message) {
    return { code: 500, message: message || 'error' };
}

export class WasmTextEngineClient {
    constructor() {
        this.module = null;
        this.engine = null;
    }

    async init(options) {
        try {
            var opts = options || {};
            var modulePath = opts.modulePath || '../dist/text_engine.js';
            var mod = await import(modulePath);
            var factory = mod.default;
            this.module = await factory(opts.moduleOptions || {});
            this.engine = new this.module.WasmTextEngine();
            return ok({ ready: true }, 'initialized');
        } catch (e) {
            return err('init failed: ' + e.message);
        }
    }

    diff(oldText, newText) {
        try {
            return ok(JSON.parse(this.engine.diff(oldText || '', newText || '')));
        } catch (e) {
            return err('diff failed: ' + e.message);
        }
    }

    merge3(baseText, localText, remoteText, strategy) {
        try {
            return ok(JSON.parse(this.engine.merge3(baseText || '', localText || '', remoteText || '', strategy || 'manual')));
        } catch (e) {
            return err('merge3 failed: ' + e.message);
        }
    }

    indexDocument(docId, text) {
        try {
            this.engine.indexDocument(docId || '', text || '');
            return ok({ indexed: true });
        } catch (e) {
            return err('indexDocument failed: ' + e.message);
        }
    }

    removeDocument(docId) {
        try {
            this.engine.removeDocument(docId || '');
            return ok({ removed: true });
        } catch (e) {
            return err('removeDocument failed: ' + e.message);
        }
    }

    clearIndex() {
        try {
            this.engine.clearIndex();
            return ok({ cleared: true });
        } catch (e) {
            return err('clearIndex failed: ' + e.message);
        }
    }

    search(query, options) {
        var opts = options || {};
        try {
            return ok(JSON.parse(this.engine.search(
                query || '',
                opts.limit || 20,
                !!opts.caseSensitive,
                !!opts.wholeWord
            )));
        } catch (e) {
            return err('search failed: ' + e.message);
        }
    }

    analyze(text) {
        try {
            return ok(JSON.parse(this.engine.analyze(text || '')));
        } catch (e) {
            return err('analyze failed: ' + e.message);
        }
    }

    similarity(leftText, rightText) {
        try {
            return ok(JSON.parse(this.engine.similarity(leftText || '', rightText || '')));
        } catch (e) {
            return err('similarity failed: ' + e.message);
        }
    }
}


