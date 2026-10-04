import { explainPythonError, pythonErrorLine } from './python-run-diagnostics';
import { RunnerFilesUi } from './code-runner-files';
(function(global) {
    'use strict';

    function g(name) { return global[name]; }

    function t(key, zhFallback, enFallback) {
        if (global.i18n && typeof global.i18n.t === 'function') {
            var value = global.i18n.t(key);
            if (value && value !== key) return value;
        }
        var isEn = global.i18n && global.i18n.getLanguage && global.i18n.getLanguage() === 'en';
        return isEn ? (enFallback || zhFallback) : zhFallback;
    }

    var SUPPORTED_LANGUAGES = new Set(['python', 'py', 'javascript', 'js', 'typescript', 'ts', 'html', 'htm', 'c', 'cpp', 'c++']);
    // Python runs in the server's isolated container; no browser interpreter is loaded.
    class CodeRunner {
        abortRun: (() => void) | null = null;
        constructor() { this.cCompilerEndpoint = '/api/code-runner/run'; }
        async runPython(code) {
            const controller = new AbortController();
            this.abortRun = () => controller.abort();
            const timeout = setTimeout(() => controller.abort(), 310000);
            try {
                const base = global.getApiBaseUrl ? global.getApiBaseUrl() : '/api';
                const endpoint = base.replace(/\/$/, '') + '/code-runner';
                const response = await fetch(endpoint + '/run', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ language: 'python', code, interactive:true, ...(runnerFiles?.tokens().length ? {files:runnerFiles.tokens()} : {}) }), signal: controller.signal
                });
                if (!response.ok || !response.headers?.get?.('content-type')?.includes('ndjson')) return await response.json();
                const reader = response.body.getReader();
                const decoder = new TextDecoder(); let buffer = '';
                for (;;) {
                    const {value, done} = await reader.read();
                    buffer += decoder.decode(value, {stream:!done});
                    let newline;
                    while ((newline = buffer.indexOf('\n')) >= 0) {
                        const event = JSON.parse(buffer.slice(0,newline)); buffer = buffer.slice(newline+1);
                        if (event.type === 'result') return event;
                        if (event.type === 'input') showInteractiveInput(event, endpoint, controller);
                    }
                    if (done) throw new Error('Execution connection closed');
                }
            } catch (error) {
                return { success: false, error: error.name === 'AbortError' ? t('codeRunCancelled', '运行已取消或超时', 'Execution cancelled or timed out') : String(error.message || error) };
            } finally { clearTimeout(timeout); this.abortRun = null; }
        }

        async runHtml(code) {
            return {
                success: true,
                output: String(code || ''),
                outputType: 'html'
            };
        }

        // 运行JavaScript/TypeScript代码
        runJavaScript(code) {
            return new Promise((resolve) => {
                const worker = new Worker(URL.createObjectURL(new Blob([`
                    self.onmessage = function(e) {
                        try {
                            const result = eval(e.data);
                            self.postMessage({ success: true, output: result });
                        } catch (error) {
                            self.postMessage({ success: false, error: error.message });
                        }
                    }
                `], { type: 'application/javascript' })));

                worker.onmessage = function(e) {
                    resolve(e.data);
                    worker.terminate();
                };

                worker.onerror = function(error) {
                    resolve({ success: false, error: error.message });
                    worker.terminate();
                };

                worker.postMessage(code);
            });
        }

        // 运行C/C++代码（通过Emscripten编译）
        async runCpp(code, language) {
            try {
                const response = await fetch(this.cCompilerEndpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        code: code,
                        language: language
                    })
                });

                const payload = await response.json().catch(function() {
                    return null;
                });

                if (!response.ok || !payload || payload.success === false) {
                    return {
                        success: false,
                        error: (payload && payload.error) || 'Failed to execute C/C++ code'
                    };
                }

                return {
                    success: true,
                    output: payload.output || ''
                };
            } catch (error) {
                return {
                    success: false,
                    error: error && error.message ? error.message : String(error)
                };
            }
        }

        // 根据语言类型运行代码
        async runCode(language, code) {
            var normalizedLanguage = String(language || '').toLowerCase();

            switch (normalizedLanguage) {
                case 'python':
                case 'py':
                    return this.runPython(code);
                case 'javascript':
                case 'js':
                case 'typescript':
                case 'ts':
                    return this.runJavaScript(code);
                case 'html':
                case 'htm':
                    return this.runHtml(code);
                case 'c':
                case 'cpp':
                case 'c++':
                    return this.runCpp(code, normalizedLanguage);
                default:
                    return { success: false, error: 'Unsupported language: ' + language };
            }
        }
    }

    function showInteractiveInput(event, endpoint, controller) {
        renderOutput({success:true,output:event.output || ''});
        runnerUiState.minimized = false; updatePanelSize();
        const form = document.createElement('form');
        form.style.cssText = 'display:flex;flex-direction:column;gap:8px;padding:10px;border:1px solid #aaa;border-radius:6px;';
        const label = document.createElement('label');
        label.textContent = event.prompt || t('codeInput', '程序正在等待输入：', 'The program is waiting for input:');
        const input = document.createElement('input'); input.type = 'text'; input.autocomplete = 'off';
        input.style.cssText = 'display:block;width:100%;box-sizing:border-box;padding:8px;margin-top:8px;color:#222;background:white;border:1px solid #aaa;border-radius:4px;';
        label.appendChild(input); form.appendChild(label);
        const buttons = document.createElement('div'); buttons.style.cssText = 'display:flex;gap:8px;';
        const submit = document.createElement('button'); submit.type = 'submit'; submit.textContent = t('codeInputSubmit','提交输入','Submit input');
        const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = t('cancel','取消运行','Cancel execution');
        cancel.onclick = () => controller.abort(); buttons.append(submit,cancel); form.appendChild(buttons);
        const status = document.createElement('span'); status.setAttribute('role','status'); form.appendChild(status);
        form.onsubmit = async eventSubmit => {
            eventSubmit.preventDefault(); if (submit.disabled) return;
            submit.disabled = true; input.readOnly = true; status.textContent = t('codeInputSending','正在提交…','Submitting…');
            try {
                const response = await fetch(endpoint + '/input', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:event.token,value:input.value}),signal:controller.signal});
                if (!response.ok) throw new Error((await response.json()).error || 'Input failed');
                if (form.isConnected) renderOutput({success:true,output:(event.output || '') + (event.prompt || '') + '\n' + t('codeRunning','运行中…','Running…')});
            } catch (error) {
                if (!controller.signal.aborted && form.isConnected) {
                    status.textContent = t('codeInputFailed','输入提交失败，请重试：','Input failed, please retry: ') + error.message;
                    submit.disabled = false; input.readOnly = false;
                }
            }
        };
        runnerUiState.outputBody.appendChild(form); input.focus();
    }

    global.runCodeBlock = async function(context) {
        ensureRunnerUi();
        if (runnerUiState.button.disabled || runnerFiles?.uploading) return;
        runnerUiState.button.disabled = true;
        if (runnerUiState.runContext?.editor) global.highlightCodeError?.(runnerUiState.runContext.editor, null);
        runnerUiState.runContext = context; runnerUiState.minimized = false;
        try {
            renderOutput({success:true, output:t('codeRunning', '运行中...', 'Running...')});
            const result = await codeRunner.runCode(context.language, context.code);
            if (runnerUiState.outputPanel.style.display !== 'none') renderOutput(result);
        } finally { runnerUiState.button.disabled = false; }
    };

    // 初始化代码运行器
    const codeRunner = new CodeRunner();
    let runnerFiles: RunnerFilesUi;
    const runnerUiState = {
        initialized: false,
        activeCodeBlock: null,
        host: null,
        button: null,
        outputPanel: null,
        outputBody: null,
        scheduleToken: false,
        runContext: null,
        lastResult: null,
        explanation: '',
        errorLine: null,
        lineOverlay: null,
        help: null,
        maximized: false,
        minimized: false
    };

    function getLanguageFromCodeBlock(codeBlock) {
        return String(codeBlock && codeBlock.className ? codeBlock.className : '')
            .replace('language-', '')
            .split(' ')[0]
            .toLowerCase();
    }

    function isRunnableCodeBlock(codeBlock) {
        if (!codeBlock || !codeBlock.isConnected) return false;
        if (isEditableCodeBlock(codeBlock)) return false;
        return SUPPORTED_LANGUAGES.has(getLanguageFromCodeBlock(codeBlock));
    }

    function getCodeBlockFromTarget(target) {
        if (!target || !target.closest) return null;
        var codeNode = target.closest('pre code');
        if (codeNode) return codeNode;
        var preNode = target.closest('pre');
        if (preNode && preNode.querySelector) {
            return preNode.querySelector('code');
        }
        return null;
    }

    function hideRunnerButton() {
        if (!runnerUiState.button) return;
        runnerUiState.button.style.display = 'none';
    }

    function showRunnerButtonFor(codeBlock) {
        if (!runnerUiState.button) return;

        if (!isRunnableCodeBlock(codeBlock)) {
            hideRunnerButton();
            runnerUiState.activeCodeBlock = null;
            return;
        }

        runnerUiState.activeCodeBlock = codeBlock;
        var rect = codeBlock.getBoundingClientRect();
        if (!rect || rect.width === 0 || rect.height === 0) {
            hideRunnerButton();
            return;
        }

        var top = Math.max(8, rect.top + 6);
        var right = Math.max(8, window.innerWidth - rect.right + 6);
        runnerUiState.button.style.display = 'inline-flex';
        runnerUiState.button.style.top = Math.round(top) + 'px';
        runnerUiState.button.style.right = Math.round(right) + 'px';
    }

    function scheduleButtonRefresh() {
        if (runnerUiState.scheduleToken) return;
        runnerUiState.scheduleToken = true;
        requestAnimationFrame(function() {
            runnerUiState.scheduleToken = false;
            refreshErrorHighlight();
            if (runnerUiState.activeCodeBlock) {
                showRunnerButtonFor(runnerUiState.activeCodeBlock);
            }
        });
    }

    function appendImages(images) {
        if (!Array.isArray(images)) return;
        images.slice(0, 8).forEach((image, index) => {
            if (image.mime !== 'image/png' || typeof image.data !== 'string' || image.data.length > 2800000 || !/^[A-Za-z0-9+/=]+$/.test(image.data)) return;
            runnerFiles?.appendArtifact(runnerUiState.outputBody,'figure-' + (index + 1) + '.png',image.data,'image/png',true);
        });
    }

    function appendFiles(result) {
        if (Array.isArray(result.files)) result.files.slice(0,16).forEach(file => runnerFiles?.appendArtifact(runnerUiState.outputBody,file.name,file.data));
        if (result.fileWarning) { const warning = document.createElement('p'); warning.textContent = result.fileWarning; runnerUiState.outputBody.append(warning); }
    }

    function updatePanelSize() {
        const panel = runnerUiState.outputPanel;
        if (!panel) return;
        panel.style.inset = runnerUiState.maximized && !runnerUiState.minimized ? 'max(8px, env(safe-area-inset-top)) 8px max(8px, env(safe-area-inset-bottom)) 8px' : 'auto 12px max(12px, env(safe-area-inset-bottom)) auto';
        panel.style.width = runnerUiState.maximized && !runnerUiState.minimized ? 'auto' : 'min(560px, calc(100vw - 24px))';
        panel.style.maxHeight = runnerUiState.maximized && !runnerUiState.minimized ? 'none' : 'min(45dvh, 380px)';
        runnerUiState.outputBody.hidden = runnerUiState.minimized;
        if (runnerUiState.help) runnerUiState.help.hidden = runnerUiState.minimized || runnerUiState.help.dataset.open !== 'true';
    }

    function refreshErrorHighlight() {
        if (!runnerUiState.lineOverlay) return;
        runnerUiState.lineOverlay.replaceChildren();
        const context = runnerUiState.runContext;
        const line = runnerUiState.errorLine;
        if (context?.editor) {
            const wanted = context.editor.state.doc.toString() === context.code && runnerUiState.outputPanel.style.display !== 'none' ? line : null;
            if (context.highlightedLine !== wanted) { global.highlightCodeError?.(context.editor, wanted); context.highlightedLine = wanted; }
            return;
        }
        if (!line || !context?.block?.isConnected || context.block.textContent !== context.code || runnerUiState.outputPanel.style.display === 'none') return;
        const lines = context.code.split('\n');
        if (line > lines.length) return;
        const start = lines.slice(0, line - 1).reduce((offset, text) => offset + text.length + 1, 0);
        const end = start + Math.max(1, lines[line - 1].length);
        const walker = document.createTreeWalker(context.block, NodeFilter.SHOW_TEXT);
        const range = document.createRange();
        let node, offset = 0, started = false, ended = false;
        while ((node = walker.nextNode())) {
            const next = offset + node.textContent.length;
            if (!started && start < next) { range.setStart(node, start - offset); started = true; }
            if (started && end <= next) { range.setEnd(node, end - offset); ended = true; break; }
            offset = next;
        }
        if (!started || !ended) return;
        for (const rect of range.getClientRects()) {
            if (rect.bottom < 0 || rect.top > window.innerHeight) continue;
            const mark = document.createElement('div');
            mark.style.cssText = `position:fixed;pointer-events:none;left:${rect.left}px;top:${rect.top}px;width:${Math.max(6, rect.width)}px;height:${rect.height}px;background:rgba(220,38,38,.22);border-bottom:2px solid #dc2626;border-radius:2px;`;
            runnerUiState.lineOverlay.appendChild(mark);
        }
    }

    function appendErrorSource(line) {
        const lines = runnerUiState.runContext.code.split('\n');
        if (line < 1 || line > lines.length) return;
        const source = document.createElement('div');
        source.setAttribute('aria-label', '报错行及上下文');
        source.style.cssText = 'margin-top:10px;overflow:auto;background:rgba(0,0,0,.06);border-radius:4px;';
        for (let i = Math.max(0, line - 4); i < Math.min(lines.length, line + 3); i++) {
            const row = document.createElement('div');
            row.textContent = `${String(i + 1).padStart(4)}  ${lines[i]}`;
            row.style.cssText = 'white-space:pre;padding:3px 8px;';
            if (i + 1 === line) {
                row.style.background = '#991b1b'; row.style.color = '#fff'; row.style.fontWeight = 'bold';
                row.setAttribute('aria-label', '报错行 ' + line);
            }
            source.appendChild(row);
        }
        runnerUiState.outputBody.appendChild(source);
    }

    function showEnvironmentHelp() {
        const help = runnerUiState.help;
        help.dataset.open = help.dataset.open === 'true' ? 'false' : 'true';
        runnerUiState.minimized = false;
        help.textContent = '运行方式与环境\n\nPython：在服务器隔离 Docker 沙箱中运行，Python 3.12。已安装 NumPy、pandas、SciPy、SymPy、Matplotlib、seaborn、scikit-learn、Pillow、openpyxl，支持中文字体及图表图片返回。禁止联网、只允许 /tmp 临时写入；每次运行独立容器。右上角上传文件后复制 /tmp/uploads/ 路径，使用 open()、pandas.read_csv() 等读取；最多 8 个文件，单文件 5 MB，总大小 8 MB，暂存 30 分钟。当前工作目录为 /tmp/output，代码以相对路径写入的文件（如 result.csv、plot.png）会自动返回，最多 16 个文件、总大小 4 MB；输出提供下载及插入当前文档按钮，插入沿用附件存储/加密设置。每次运行完成会销毁容器，请及时下载或插入输出文件。计算限时 20 秒（等待输入不计入）；input() 或 stdin.readline() 会在此窗口请求输入，单次等待最多 2 分钟、整次运行最多 5 分钟。内存按服务器容量限制为 256/512 MB、代码 64 KB，最多返回 8 张图，图片总计不超过 2 MB。\n\nJavaScript：在浏览器 Worker 中执行，没有页面 DOM。TypeScript 当前按 JavaScript 语法执行，不支持类型标注。HTML：在隔离 iframe 中预览。C/C++：在服务器通过 Emscripten 编译成 WebAssembly，再由 Node.js 执行；编译最长 30 秒，运行最长 15 秒。\n\n复制：复制文字、原始错误及中文解释；支持富文本剪贴板时同时复制图表。报错行对应本次运行的代码，编辑代码后原位置高亮自动清除。';
        updatePanelSize();
    }

    async function copyRunResult(button) {
        const result = runnerUiState.lastResult;
        if (!result) return;
        const text = [result.output === undefined ? '' : String(result.output), result.success ? '' : 'Error: ' + (result.error || 'Unknown error'), runnerUiState.explanation ? '中文解释：' + runnerUiState.explanation : ''].filter(Boolean).join('\n\n');
        button.disabled = true;
        try {
            if (navigator.clipboard?.write && global.ClipboardItem && result.images?.length) {
                const rich = document.createElement('div');
                const pre = document.createElement('pre'); pre.textContent = text; rich.appendChild(pre);
                for (const image of result.images.slice(0, 8)) {
                    if (image.mime !== 'image/png' || typeof image.data !== 'string' || image.data.length > 2800000 || !/^[A-Za-z0-9+/=]+$/.test(image.data)) continue;
                    const img = document.createElement('img'); img.src = 'data:image/png;base64,' + image.data; rich.appendChild(img);
                }
                try {
                    await navigator.clipboard.write([new global.ClipboardItem({'text/plain': new Blob([text], {type:'text/plain'}), 'text/html': new Blob([rich.innerHTML], {type:'text/html'})})]);
                } catch { await navigator.clipboard.writeText(text); }
            } else if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
            else {
                const input = document.createElement('textarea'); input.value = text;
                input.style.cssText = 'position:fixed;opacity:0;'; document.body.appendChild(input); input.select();
                const copied = document.execCommand('copy'); input.remove();
                if (!copied) throw Error('剪贴板不可用，请手动选择输出内容复制');
            }
            button.title = '已复制';
            if (global.showToast) global.showToast('运行结果已复制', 'success');
        } catch (error) { if (global.showToast) global.showToast('复制失败：' + error.message, 'error'); }
        finally { button.disabled = false; }
    }

    function renderOutput(result) {
        if (!runnerUiState.outputPanel || !runnerUiState.outputBody) return;

        runnerUiState.lastResult = result;
        runnerUiState.explanation = '';
        runnerUiState.errorLine = null;
        runnerUiState.outputPanel.style.display = 'flex';
        updatePanelSize();
        refreshErrorHighlight();
        runnerUiState.outputBody.innerHTML = '';

        if (result.success) {
            runnerUiState.outputPanel.style.borderColor = '#b7e1b9';
            runnerUiState.outputPanel.style.background = '#f3fbf3';

            if (result.outputType === 'html') {
                var iframe = document.createElement('iframe');
                iframe.setAttribute('sandbox', 'allow-forms allow-modals allow-popups allow-scripts');
                iframe.setAttribute('referrerpolicy', 'no-referrer');
                iframe.style.cssText = [
                    'display: block',
                    'width: 100%',
                    'height: 320px',
                    'border: 1px solid #d7deea',
                    'border-radius: 4px',
                    'background: #fff'
                ].join(';');
                iframe.srcdoc = result.output || '';
                runnerUiState.outputBody.appendChild(iframe);
                return;
            }

            var pre = document.createElement('pre');
            pre.style.cssText = 'margin:0;white-space:pre-wrap;word-break:break-word;';
            pre.textContent = result.output !== undefined ? String(result.output) : 'Execution completed successfully';
            runnerUiState.outputBody.appendChild(pre);
            appendImages(result.images);
            appendFiles(result);
            return;
        }

        runnerUiState.outputPanel.style.borderColor = '#efc2c2';
        runnerUiState.outputPanel.style.background = '#fff5f5';
        var err = document.createElement('pre');
        err.style.cssText = 'margin:0;white-space:pre-wrap;word-break:break-word;color:#a93131;';
        err.textContent = 'Error: ' + (result.error || 'Unknown error');
        runnerUiState.outputBody.appendChild(err);
        if (['python', 'py'].includes(runnerUiState.runContext?.language)) {
            runnerUiState.explanation = explainPythonError(result.error);
            const explanation = document.createElement('p');
            explanation.style.cssText = 'margin:10px 0;color:#a93131;';
            explanation.textContent = '中文解释：' + runnerUiState.explanation;
            runnerUiState.outputBody.appendChild(explanation);
            runnerUiState.errorLine = pythonErrorLine(result.error, result.errorLine);
            if (runnerUiState.errorLine) appendErrorSource(runnerUiState.errorLine);
            refreshErrorHighlight();
        }
        if (result.output) { const output = document.createElement('pre'); output.textContent = result.output; runnerUiState.outputBody.appendChild(output); }
        appendImages(result.images);
        appendFiles(result);
    }

    function ensureRunnerUi() {
        if (runnerUiState.initialized) return;
        runnerUiState.initialized = true;

        var host = document.createElement('div');
        host.className = 'code-runner-ui-host';
        host.style.cssText = [
            'position: fixed',
            'inset: 0',
            'pointer-events: none',
            'z-index: 1500'
        ].join(';');

        var button = document.createElement('button');
        button.className = 'code-run-button';
        button.innerHTML = '<i class="fas fa-play"></i> ' + t('codeRun', '运行', 'Run');
        button.style.cssText = [
            'position: fixed',
            'display: none',
            'align-items: center',
            'gap: 6px',
            'padding: 5px 10px',
            'background: var(--theme-accent, #4a90e2)',
            'color: #fff',
            'border: none',
            'border-radius: 4px',
            'font-size: 12px',
            'cursor: pointer',
            'box-shadow: 0 2px 10px rgba(0,0,0,0.16)',
            'pointer-events: auto'
        ].join(';');

        var outputPanel = document.createElement('div');
        outputPanel.className = 'code-output';
        outputPanel.style.cssText = [
            'position: fixed',
            'right: 12px',
            'bottom: 12px',
            'width: min(560px, calc(100vw - 24px))',
            'max-height: min(45vh, 380px)',
            'overflow: hidden',
            'flex-direction: column',
            'padding: 10px',
            'border: 1px solid #d7deea',
            'border-radius: 6px',
            'background: #f7f9fc',
            'font-family: monospace',
            'font-size: 14px',
            'display: none',
            'pointer-events: auto',
            'box-shadow: 0 8px 24px rgba(0,0,0,0.15)'
        ].join(';');

        var outputHeader = document.createElement('div');
        outputHeader.style.cssText = 'display:flex;flex-shrink:0;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px;font-size:12px;color:#5b6573;';
        const title = document.createElement('span'); title.textContent = t('codeRunOutput', '运行输出', 'Run Output');
        outputHeader.appendChild(title);
        const actions = document.createElement('div'); actions.style.cssText = 'display:flex;gap:2px;';
        function action(label, icon, callback) {
            const btn = document.createElement('button'); btn.type = 'button'; btn.title = label; btn.setAttribute('aria-label', label);
            btn.innerHTML = '<i class="fas fa-' + icon + '" aria-hidden="true"></i>';
            btn.style.cssText = 'border:0;background:transparent;color:inherit;cursor:pointer;width:30px;height:30px;padding:4px;';
            btn.addEventListener('click', () => callback(btn)); actions.appendChild(btn); return btn;
        }
        action('运行方式与环境', 'question-circle', showEnvironmentHelp);
        runnerFiles = new RunnerFilesUi(global, () => !!runnerUiState.button?.disabled || !!codeRunner.abortRun);
        action('上传运行文件（Python）', 'file-upload', btn => runnerFiles.pick(btn));
        action('复制运行结果', 'copy', copyRunResult);
        const maximize = action('最大化/恢复', 'expand', () => {
            runnerUiState.maximized = !runnerUiState.maximized; runnerUiState.minimized = false; updatePanelSize();
            maximize.innerHTML = '<i class="fas fa-' + (runnerUiState.maximized ? 'compress' : 'expand') + '" aria-hidden="true"></i>';
        });
        action('最小化/展开', 'window-minimize', () => { runnerUiState.minimized = !runnerUiState.minimized; updatePanelSize(); });
        action('关闭', 'times', () => { codeRunner.abortRun?.(); outputPanel.style.display = 'none'; refreshErrorHighlight(); });
        outputHeader.appendChild(actions);

        var outputBody = document.createElement('div');
        outputBody.style.cssText = 'white-space:pre-wrap;word-break:break-word;overflow:auto;min-height:0;flex:1;';
        const help = document.createElement('div');
        help.hidden = true; help.style.cssText = 'white-space:pre-wrap;font-family:system-ui;font-size:13px;overflow:auto;max-height:55%;padding:10px;background:rgba(0,0,0,.05);margin-bottom:8px;flex-shrink:0;';
        runnerUiState.help = help;
        const lineOverlay = document.createElement('div'); lineOverlay.style.pointerEvents = 'none';
        runnerUiState.lineOverlay = lineOverlay;
        host.appendChild(lineOverlay);

        outputPanel.appendChild(outputHeader);
        outputPanel.appendChild(help);
        runnerFiles.attach(outputPanel);
        outputPanel.appendChild(outputBody);
        host.appendChild(button);
        host.appendChild(outputPanel);
        document.body.appendChild(host);

        runnerUiState.host = host;
        runnerUiState.button = button;
        runnerUiState.outputPanel = outputPanel;
        runnerUiState.outputBody = outputBody;

        button.addEventListener('click', async function() {
            if (!runnerUiState.activeCodeBlock) return;
            if (button.disabled || runnerFiles?.uploading) return;
            button.disabled = true;
            try {
                const block = runnerUiState.activeCodeBlock;
                var language = getLanguageFromCodeBlock(block);
                var code = block.textContent || '';
                if (runnerUiState.runContext?.editor) global.highlightCodeError?.(runnerUiState.runContext.editor, null);
                runnerUiState.runContext = { block, language, code };
                runnerUiState.minimized = false;
                renderOutput({ success: true, output: t('codeRunning', '运行中...', 'Running...') });
                var result = await codeRunner.runCode(language, code);
                if (runnerUiState.outputPanel.style.display !== 'none') renderOutput(result);
            } finally { button.disabled = false; }
            scheduleButtonRefresh();
        });

        document.addEventListener('mousemove', function(event) {
            var codeBlock = getCodeBlockFromTarget(event.target);
            if (codeBlock) {
                showRunnerButtonFor(codeBlock);
            }
        }, true);

        document.addEventListener('click', function(event) {
            var codeBlock = getCodeBlockFromTarget(event.target);
            if (codeBlock) {
                showRunnerButtonFor(codeBlock);
                return;
            }

            if (!event.target.closest || !event.target.closest('.code-run-button')) {
                hideRunnerButton();
                runnerUiState.activeCodeBlock = null;
            }
        }, true);

        window.addEventListener('scroll', scheduleButtonRefresh, true);
        window.addEventListener('resize', scheduleButtonRefresh);
    }

    function isEditableCodeBlock(codeBlock) {
        if (!codeBlock || !codeBlock.closest) return false;
        return !!codeBlock.closest('.vditor-ir__input, textarea, input');
    }

    function getCodeBlocks(root) {
        var scope = root && root.querySelectorAll ? root : document;
        return Array.from(scope.querySelectorAll('pre code'));
    }

    function getRunnableCodeBlocks(root) {
        return getCodeBlocks(root).filter(function(codeBlock) {
            if (!codeBlock || isEditableCodeBlock(codeBlock)) return false;
            var language = String(codeBlock.className || '').replace('language-', '').split(' ')[0].toLowerCase();
            return SUPPORTED_LANGUAGES.has(language);
        });
    }

    // 为代码块添加运行按钮
    function addRunButtons(root) {
        ensureRunnerUi();

        var codeBlocks = getRunnableCodeBlocks(root);
        if (codeBlocks.length > 0 && !runnerUiState.activeCodeBlock) {
            showRunnerButtonFor(codeBlocks[0]);
        }

        scheduleButtonRefresh();
    }

    // 监听DOM变化，为新添加的代码块添加运行按钮
    const observer = new MutationObserver(function(mutations) {
        if (runnerUiState.errorLine && mutations.some(mutation => !runnerUiState.host?.contains(mutation.target))) refreshErrorHighlight();
        mutations.forEach(function(mutation) {
            if (mutation.type === 'childList') {
                mutation.addedNodes.forEach(function(node) {
                    if (node.nodeType === 1) {
                        if (node.tagName === 'PRE' && node.querySelector('code')) {
                            addRunButtons(node.parentNode || document);
                        } else if (node.querySelectorAll) {
                            const codeBlocks = getRunnableCodeBlocks(node);
                            if (codeBlocks.length > 0) {
                                addRunButtons(node);
                            }
                        }
                    }
                });
            }
        });
    });

    // 开始观察DOM变化
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    // 暴露到全局
    global.CodeRunner = CodeRunner;
    global.codeRunner = codeRunner;
    global.addRunButtons = addRunButtons;

})(typeof window !== 'undefined' ? window : this);
