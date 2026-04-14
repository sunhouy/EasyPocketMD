(function(global) {
    'use strict';

    function g(name) { return global[name]; }

    var SUPPORTED_LANGUAGES = new Set(['python', 'py', 'javascript', 'js', 'typescript', 'ts', 'html', 'htm', 'c', 'cpp', 'c++']);
    var PYODIDE_VERSION = '0.25.1';
    var PYODIDE_CDN_BASES = [
        'https://static.yhsun.cn/cdn/pyodide/v' + PYODIDE_VERSION + '/full/'
    ];

    // 代码运行器类
    class CodeRunner {
        constructor() {
            this.cCompilerEndpoint = '/api/code-runner/run';
            this.pyodide = null;
            this.pyodideLoaded = false;
            this.pyodideLoadingPromise = null;
            this.pyodideCdnBase = null;
        }

        async initPyodide() {
            if (this.pyodideLoaded && this.pyodide) {
                return this.pyodide;
            }

            if (this.pyodideLoadingPromise) {
                return this.pyodideLoadingPromise;
            }

            var self = this;
            this.pyodideLoadingPromise = (async function() {
                var lastError = null;

                for (var i = 0; i < PYODIDE_CDN_BASES.length; i++) {
                    var baseUrl = PYODIDE_CDN_BASES[i];
                    try {
                        var moduleUrl = baseUrl + 'pyodide.mjs';
                        var pyodideModule = await import(moduleUrl);
                        self.pyodide = await pyodideModule.loadPyodide({
                            indexURL: baseUrl
                        });
                        self.pyodideLoaded = true;
                        self.pyodideCdnBase = baseUrl;
                        return self.pyodide;
                    } catch (error) {
                        lastError = error;
                    }
                }

                self.pyodideLoadingPromise = null;
                throw lastError || new Error('Failed to load Pyodide from CDN');
            })();

            try {
                return await this.pyodideLoadingPromise;
            } catch (error) {
                this.pyodideLoadingPromise = null;
                throw error;
            }
        }

        async runPython(code) {
            try {
                var pyodide = await this.initPyodide();
                var stdoutChunks = [];
                var stderrChunks = [];

                if (pyodide.setStdout) {
                    pyodide.setStdout({
                        batched: function(message) {
                            stdoutChunks.push(String(message));
                        }
                    });
                }

                if (pyodide.setStderr) {
                    pyodide.setStderr({
                        batched: function(message) {
                            stderrChunks.push(String(message));
                        }
                    });
                }

                var result = pyodide.runPython(code);
                var outputParts = [];
                if (stdoutChunks.length) outputParts.push(stdoutChunks.join(''));
                if (stderrChunks.length) outputParts.push(stderrChunks.join(''));
                if (result !== undefined && result !== null && String(result).length > 0) {
                    outputParts.push(String(result));
                }

                return { success: true, output: outputParts.join('') || 'Execution completed successfully' };
            } catch (error) {
                return { success: false, error: error && error.message ? error.message : String(error) };
            }
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
    const overlayState = {
        host: null,
        items: new Set(),
        scheduled: false,
        scrollHandlerBound: false
    };

    function ensureOverlayHost() {
        if (overlayState.host && overlayState.host.isConnected) {
            return overlayState.host;
        }

        var host = document.createElement('div');
        host.className = 'code-runner-overlay-host';
        host.style.cssText = [
            'position: fixed',
            'inset: 0',
            'pointer-events: none',
            'z-index: 99999'
        ].join(';');
        document.body.appendChild(host);
        overlayState.host = host;
        return host;
    }

    function getLanguageFromCodeBlock(codeBlock) {
        return String(codeBlock && codeBlock.className ? codeBlock.className : '')
            .replace('language-', '')
            .split(' ')[0]
            .toLowerCase();
    }

    function createOverlayItem(codeBlock) {
        var host = ensureOverlayHost();
        var item = document.createElement('div');
        item.className = 'code-runner-overlay-item';
        item.setAttribute('contenteditable', 'false');
        item.style.cssText = [
            'position: fixed',
            'left: 0',
            'top: 0',
            'right: auto',
            'transform: none',
            'visibility: hidden',
            'pointer-events: auto'
        ].join(';');

        var runButton = document.createElement('button');
        runButton.className = 'code-run-button';
        runButton.setAttribute('contenteditable', 'false');
        runButton.innerHTML = '<i class="fas fa-play"></i> Run';
        runButton.style.cssText = [
            'display: inline-flex',
            'align-items: center',
            'gap: 6px',
            'padding: 5px 10px',
            'background-color: #4a90e2',
            'color: white',
            'border: none',
            'border-radius: 4px',
            'font-size: 12px',
            'cursor: pointer',
            'box-shadow: 0 2px 10px rgba(0,0,0,0.18)',
            'pointer-events: auto'
        ].join(';');

        var outputDiv = document.createElement('div');
        outputDiv.className = 'code-output';
        outputDiv.setAttribute('contenteditable', 'false');
        outputDiv.style.cssText = [
            'margin-top: 8px',
            'max-width: min(720px, calc(100vw - 24px))',
            'max-height: 280px',
            'overflow: auto',
            'padding: 10px',
            'background-color: #f5f5f5',
            'border: 1px solid #ddd',
            'border-radius: 6px',
            'font-family: monospace',
            'font-size: 14px',
            'white-space: pre-wrap',
            'display: none',
            'box-shadow: 0 8px 24px rgba(0,0,0,0.15)',
            'pointer-events: auto'
        ].join(';');

        var toolbar = document.createElement('div');
        toolbar.style.cssText = [
            'display: inline-flex',
            'flex-direction: column',
            'align-items: flex-end',
            'pointer-events: auto'
        ].join(';');
        toolbar.appendChild(runButton);
        toolbar.appendChild(outputDiv);
        item.appendChild(toolbar);
        host.appendChild(item);

        var overlayItem = {
            codeBlock: codeBlock,
            item: item,
            button: runButton,
            output: outputDiv,
            language: getLanguageFromCodeBlock(codeBlock),
            isVisible: false
        };

        runButton.addEventListener('click', async function() {
            var code = codeBlock.textContent;
            outputDiv.style.display = 'block';
            outputDiv.textContent = 'Running...';

            var result = await codeRunner.runCode(overlayItem.language, code);

            if (result.success) {
                if (result.outputType === 'html') {
                    outputDiv.innerHTML = '';
                    var iframe = document.createElement('iframe');
                    iframe.setAttribute('sandbox', 'allow-forms allow-modals allow-popups allow-scripts');
                    iframe.setAttribute('referrerpolicy', 'no-referrer');
                    iframe.style.cssText = [
                        'display: block',
                        'width: 100%',
                        'height: 260px',
                        'border: 0',
                        'background: white',
                        'border-radius: 4px'
                    ].join(';');
                    iframe.srcdoc = result.output || '';
                    outputDiv.appendChild(iframe);
                } else {
                    outputDiv.textContent = result.output !== undefined ? result.output.toString() : 'Execution completed successfully';
                }
                outputDiv.style.backgroundColor = '#e8f5e8';
            } else {
                outputDiv.textContent = 'Error: ' + result.error;
                outputDiv.style.backgroundColor = '#ffe8e8';
            }

            updateOverlayItemPosition(overlayItem);
        });

        overlayState.items.add(overlayItem);
        return overlayItem;
    }

    function updateOverlayItemPosition(overlayItem) {
        if (!overlayItem || !overlayItem.codeBlock || !overlayItem.item) return;

        if (!overlayItem.codeBlock.isConnected || !overlayItem.item.isConnected) {
            if (overlayItem.item.parentNode) {
                overlayItem.item.parentNode.removeChild(overlayItem.item);
            }
            overlayState.items.delete(overlayItem);
            return;
        }

        var rect = overlayItem.codeBlock.getBoundingClientRect();
        if (!rect || rect.width === 0 || rect.height === 0) {
            overlayItem.item.style.visibility = 'hidden';
            overlayItem.isVisible = false;
            return;
        }

        var top = Math.max(8, rect.top + 6);
        var right = Math.max(8, window.innerWidth - rect.right + 8);
        overlayItem.item.style.left = 'auto';
        overlayItem.item.style.right = Math.round(right) + 'px';
        overlayItem.item.style.top = Math.round(top) + 'px';
        overlayItem.item.style.transform = 'none';
        overlayItem.item.style.maxWidth = Math.max(120, Math.round(rect.width) - 16) + 'px';
        overlayItem.item.style.display = 'block';
        overlayItem.item.style.visibility = 'visible';
        overlayItem.isVisible = true;
        overlayItem.item.querySelector('.code-run-button').style.position = 'static';
        overlayItem.item.querySelector('.code-output').style.position = 'relative';
        overlayItem.item.querySelector('.code-output').style.left = 'auto';
        overlayItem.item.querySelector('.code-output').style.right = 'auto';
        overlayItem.item.querySelector('.code-output').style.top = 'auto';
        overlayItem.item.style.pointerEvents = 'auto';
        overlayItem.item.style.zIndex = '99999';
    }

    function scheduleOverlayUpdate() {
        if (overlayState.scheduled) return;
        overlayState.scheduled = true;
        requestAnimationFrame(function() {
            overlayState.scheduled = false;
            overlayState.items.forEach(function(item) {
                if (item.codeBlock && item.codeBlock.isConnected && item.item && item.item.isConnected) {
                    updateOverlayItemPosition(item);
                }
            });
        });
    }

    function ensureOverlayListeners() {
        if (overlayState.scrollHandlerBound) return;
        overlayState.scrollHandlerBound = true;
        window.addEventListener('scroll', scheduleOverlayUpdate, true);
        window.addEventListener('resize', scheduleOverlayUpdate);
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
        const codeBlocks = getRunnableCodeBlocks(root);
        codeBlocks.forEach(codeBlock => {
            // 检查是否已经添加了运行按钮
            const preElement = codeBlock.parentElement;
            if (!preElement || preElement.dataset.codeRunnerBound === 'true') {
                return;
            }

            preElement.dataset.codeRunnerBound = 'true';
            createOverlayItem(codeBlock);
        });

        ensureOverlayListeners();
        scheduleOverlayUpdate();
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

    // 初始加载时添加运行按钮
    window.addEventListener('DOMContentLoaded', addRunButtons);

    // 暴露到全局
    global.CodeRunner = CodeRunner;
    global.codeRunner = codeRunner;
    global.addRunButtons = addRunButtons;

})(typeof window !== 'undefined' ? window : this);
