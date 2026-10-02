/** Lute DOM -> Markdown is CPU-heavy. Keep cursor conversion off the UI thread. */
function workerMain() {
    const scope: any = self;
    let loaded = false;
    scope.onmessage = (event: MessageEvent) => {
        const { id, url, html, marked, marker, mode, options } = event.data;
        try {
            if (!loaded) { scope.importScripts(url); loaded = true; }
            const lute = scope.Lute.New(); const md = options.preview.markdown;
            const setters: Record<string, any> = {
                SetAutoSpace: md.autoSpace, SetGFMAutoLink: md.gfmAutoLink, SetVditorCodeBlockPreview: md.codeBlockPreview,
                SetFixTermTypo: md.fixTermTypo, SetFootnotes: md.footnotes, SetHeadingAnchor: false,
                SetInlineMathAllowDigitAfterOpenMarker: options.preview.math.inlineDigit,
                SetLinkBase: md.linkBase, SetLinkPrefix: md.linkPrefix, SetRenderListStyle: md.listStyle,
                SetMark: md.mark, SetVditorMathBlockPreview: md.mathBlockPreview,
                SetChineseParagraphBeginningSpace: md.paragraphBeginningSpace, SetSanitize: md.sanitize,
                SetSub: md.sub, SetSup: md.sup, SetToC: md.toc
            };
            for (const [key, value] of Object.entries(setters)) lute[key](value);
            lute.PutEmojis(options.hint.emoji); lute.SetEmojiSite(options.hint.emojiPath);
            const convert = mode === 'ir' ? lute.VditorIRDOM2Md.bind(lute) : lute.VditorDOM2Md.bind(lute);
            scope.postMessage({ id, source: convert(html), converted: marked ? convert(marked) : undefined, marker });
        } catch (error: any) { scope.postMessage({ id, error: error.message }); }
    };
}
export function createCursorMapper() {
    let worker: Worker | undefined, next = 0;
    const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();
    function destroy() { worker?.terminate(); worker = undefined; for (const task of pending.values()) task.reject(new Error('Cursor mapper stopped')); pending.clear(); }
    async function convert(instance: any, html: string, marked?: string, marker?: string): Promise<{ source: string; converted?: string }> {
        if (!worker) {
            const url = URL.createObjectURL(new Blob(['(' + workerMain.toString() + ')()'], { type: 'text/javascript' }));
            try { worker = new Worker(url); } finally { URL.revokeObjectURL(url); }
            worker.onmessage = event => { const task = pending.get(event.data.id); if (!task) return; pending.delete(event.data.id); event.data.error ? task.reject(new Error(event.data.error)) : task.resolve(event.data); };
            worker.onerror = () => destroy();
        }
        const options = instance.vditor.options;
        const url = new URL(options.cdn.replace(/\/$/, '') + '/dist/js/lute/lute.min.js', document.baseURI).href;
        const id = ++next;
        return new Promise((resolve, reject) => {
            pending.set(id, { resolve, reject }); worker!.postMessage({ id, url, html, marked, marker, mode: instance.vditor.currentMode,
                options: { preview: { markdown: options.preview.markdown, math: { inlineDigit: options.preview.math.inlineDigit } }, hint: { emoji: options.hint.emoji, emojiPath: options.hint.emojiPath } } });
        });
    }
    return { convert, destroy };
}
