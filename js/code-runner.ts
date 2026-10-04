import { explainPythonError, pythonErrorLine } from './python-run-diagnostics';
import { RunnerFilesUi } from './code-runner-files';
import { floatingRunWindow } from './code-runner-window';
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
        async runPython(code, command?: string) {
            const controller = new AbortController();
            this.abortRun = () => controller.abort();
            const timeout = setTimeout(() => controller.abort(), 310000);
            try {
                const base = global.getApiBaseUrl ? global.getApiBaseUrl() : '/api';
                const endpoint = base.replace(/\/$/, '') + '/code-runner';
                const workspace = runnerFiles ? await runnerFiles.workspace() : undefined;
                const response = await fetch(endpoint + '/run', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ language: 'python', code, interactive:true, ...(workspace ? {workspace} : {}), ...(command !== undefined ? {command} : {}) }), signal: controller.signal
                });
                if (!response.ok || !response.headers?.get?.('content-type')?.includes('ndjson')) {
                    const result=await response.json();
                    if(String(result.error||'').includes('沙箱文件会话已过期'))runnerFiles?.resetExpired();
                    return result;
                }
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

    global.openCodeSandboxTools = async function(tab, button) {
        ensureRunnerUi(); runnerUiState.outputPanel.style.display='flex';runnerUiState.minimized=false;updatePanelSize();
        if(tab==='upload') await runnerFiles.pick(button);
        else await runnerFiles.show(tab==='terminal'?'terminal':'files');
    };

    async function runSandboxCommand(command) {
        if(runnerUiState.button.disabled || runnerFiles.uploading) return {success:false,error:'请等待当前任务结束'};
        runnerUiState.button.disabled=true; runnerUiState.runContext=null;refreshErrorHighlight();
        try {renderOutput({success:true,output:'正在执行命令…'});const result=await codeRunner.runPython('pass',command);renderOutput(result);return result;}
        finally {runnerUiState.button.disabled=false;}
    }

    // 初始化代码运行器
    const codeRunner = new CodeRunner();
    let runnerFiles: RunnerFilesUi;
    let floatingPanel: ReturnType<typeof floatingRunWindow>;
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
        floatingPanel?.update(runnerUiState.maximized, runnerUiState.minimized);
        runnerFiles?.setMinimized(runnerUiState.minimized);
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
        help.textContent = '运行方式与环境\n\nPython：服务器隔离 Docker 沙箱，Python 3.12，禁止联网；支持 NumPy、pandas、SciPy、SymPy、Matplotlib、seaborn、scikit-learn、statsmodels、Polars、DuckDB、SQLAlchemy、NetworkX、Pillow、OpenCV、scikit-image、ImageIO、Plotly、openpyxl、XlsxWriter、xlrd、python-docx、python-pptx、pypdf、reportlab、BeautifulSoup、lxml、PyYAML、regex、requests、httpx、dateutil、tabulate、tqdm、Faker、psutil；Matplotlib 支持中文字体。\n\n文件：使用代码块顶部的上传按钮。文件管理显示 /tmp/home 用户目录，支持复制路径、下载、删除；可用相对路径读取文件。代码与命令行共享目录，生成文件在结束后更新到列表。会话空闲 30 分钟后清理，刷新页面或重启服务后可能丢失，请及时下载。最多 64 个文件、总大小 8 MB，上传单文件 5 MB；输出图片/文件提供下载和插入文档按钮。\n\n命令行：在同样的隔离沙箱里执行 shell 命令，例如 ls -la、pwd、cat data.csv、python -c "print(1)"。cd 可切换到用户目录内的文件夹。每条命令是独立进程，不保留 shell 变量、后台任务或软件安装；交互式 Python input() 仍在运行代码时显示输入框。\n\n限制：最多同时运行 5 个任务；计算限时 20 秒，输入等待最长 2 分钟、整次运行最多 5 分钟。单任务内存 256/512 MB，全部沙箱共享服务器容量对应的总资源预算。代码 64 KB，最多 8 张 Matplotlib 图，图片总计 2 MB。\n\n其他语言：JavaScript/TypeScript 在浏览器 Worker 执行（TypeScript 按 JavaScript 语法）；HTML 使用隔离 iframe；C/C++ 通过服务器 Emscripten 编译后运行。\n\n窗口：拖动标题栏移动，拖动边缘调整大小；输出文字可直接选中复制，右上角复制按钮可复制完整运行结果。';
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
        if(result.workspace) runnerFiles?.accept(result);
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
        runnerFiles = new RunnerFilesUi(global, () => !!runnerUiState.button?.disabled || !!codeRunner.abortRun, runSandboxCommand);
        action('沙箱命令行', 'terminal', () => runnerFiles.show('terminal'));
        action('沙箱文件管理', 'folder-open', () => runnerFiles.show('files'));
        action('复制运行结果', 'copy', copyRunResult);
        const maximize = action('最大化/恢复', 'expand', () => {
            runnerUiState.maximized = !runnerUiState.maximized; runnerUiState.minimized = false; updatePanelSize();
            maximize.innerHTML = '<i class="fas fa-' + (runnerUiState.maximized ? 'compress' : 'expand') + '" aria-hidden="true"></i>';
        });
        action('最小化/展开', 'window-minimize', () => { runnerUiState.minimized = !runnerUiState.minimized; updatePanelSize(); });
        action('关闭', 'times', () => { codeRunner.abortRun?.(); outputPanel.style.display = 'none'; refreshErrorHighlight(); });
        outputHeader.appendChild(actions);

        var outputBody = document.createElement('div');
        outputBody.style.cssText = 'white-space:pre-wrap;word-break:break-word;overflow:auto;min-height:0;flex:1;user-select:text;-webkit-user-select:text;cursor:text;';
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
        floatingPanel = floatingRunWindow(outputPanel, outputHeader);
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
