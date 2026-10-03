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
        constructor() { this.cCompilerEndpoint = '/api/code-runner/run'; }
        async runPython(code) {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 30000);
            try {
                const base = global.getApiBaseUrl ? global.getApiBaseUrl() : '/api';
                const response = await fetch(base.replace(/\/$/, '') + '/code-runner/run', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ language: 'python', code }), signal: controller.signal
                });
                const result = await response.json();
                if (!response.ok && !result.error) result.error = 'Python execution failed';
                return result;
            } catch (error) {
                return { success: false, error: error.name === 'AbortError' ? t('codeRunTimeout', '代码运行超时', 'Execution timed out') : String(error.message || error) };
            } finally { clearTimeout(timeout); }
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

    // 初始化代码运行器
    const codeRunner = new CodeRunner();
    const runnerUiState = {
        initialized: false,
        activeCodeBlock: null,
        host: null,
        button: null,
        outputPanel: null,
        outputBody: null,
        scheduleToken: false
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
            if (runnerUiState.activeCodeBlock) {
                showRunnerButtonFor(runnerUiState.activeCodeBlock);
            }
        });
    }

    function appendImages(images) {
        if (!Array.isArray(images)) return;
        images.slice(0, 8).forEach((image, index) => {
            if (image.mime !== 'image/png' || typeof image.data !== 'string' || image.data.length > 2800000 || !/^[A-Za-z0-9+/=]+$/.test(image.data)) return;
            const img = document.createElement('img');
            img.src = 'data:image/png;base64,' + image.data;
            img.alt = 'Python figure ' + (index + 1);
            img.style.cssText = 'display:block;max-width:100%;height:auto;margin:12px auto;background:#fff;';
            runnerUiState.outputBody.appendChild(img);
        });
    }

    function renderOutput(result) {
        if (!runnerUiState.outputPanel || !runnerUiState.outputBody) return;

        runnerUiState.outputPanel.style.display = 'block';
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
            return;
        }

        runnerUiState.outputPanel.style.borderColor = '#efc2c2';
        runnerUiState.outputPanel.style.background = '#fff5f5';
        var err = document.createElement('pre');
        err.style.cssText = 'margin:0;white-space:pre-wrap;word-break:break-word;color:#a93131;';
        err.textContent = 'Error: ' + (result.error || 'Unknown error');
        runnerUiState.outputBody.appendChild(err);
        if (result.output) { const output = document.createElement('pre'); output.textContent = result.output; runnerUiState.outputBody.appendChild(output); }
        appendImages(result.images);
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
            'overflow: auto',
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
        outputHeader.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;font-family:inherit;font-size:12px;color:#5b6573;';
        outputHeader.textContent = t('codeRunOutput', '运行输出', 'Run Output');
        var closeBtn = document.createElement('button');
        closeBtn.textContent = 'x';
        closeBtn.style.cssText = 'border:none;background:transparent;cursor:pointer;color:#5b6573;font-size:13px;line-height:1;';
        closeBtn.addEventListener('click', function() {
            outputPanel.style.display = 'none';
        });
        outputHeader.appendChild(closeBtn);

        var outputBody = document.createElement('div');
        outputBody.style.cssText = 'white-space:pre-wrap;word-break:break-word;';

        outputPanel.appendChild(outputHeader);
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
            if (button.disabled) return;
            button.disabled = true;
            try {
                var language = getLanguageFromCodeBlock(runnerUiState.activeCodeBlock);
                var code = runnerUiState.activeCodeBlock.textContent || '';
                renderOutput({ success: true, output: t('codeRunning', '运行中...', 'Running...') });
                var result = await codeRunner.runCode(language, code);
                renderOutput(result);
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
