(function(global) {
    'use strict';

    function g(name) { return global[name]; }

    var SUPPORTED_LANGUAGES = new Set(['python', 'py', 'javascript', 'js', 'typescript', 'ts', 'c', 'cpp', 'c++']);
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
                var result = pyodide.runPython(code);
                return { success: true, output: result };
            } catch (error) {
                return { success: false, error: error && error.message ? error.message : String(error) };
            }
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
            if (!preElement || preElement.dataset.codeRunnerBound === 'true' || preElement.querySelector('.code-run-button')) {
                return;
            }

            preElement.dataset.codeRunnerBound = 'true';

            // 获取语言类型
            const language = codeBlock.className.replace('language-', '').split(' ')[0];

            // 创建运行按钮
            const runButton = document.createElement('button');
            runButton.className = 'code-run-button';
            runButton.setAttribute('contenteditable', 'false');
            runButton.innerHTML = '<i class="fas fa-play"></i> Run';
            runButton.style.cssText = `
                position: absolute;
                top: 5px;
                right: 5px;
                padding: 5px 10px;
                background-color: #4a90e2;
                color: white;
                border: none;
                border-radius: 4px;
                font-size: 12px;
                cursor: pointer;
                z-index: 10;
            `;

            // 创建输出区域
            const outputDiv = document.createElement('div');
            outputDiv.className = 'code-output';
            outputDiv.setAttribute('contenteditable', 'false');
            outputDiv.style.cssText = `
                position: absolute;
                left: 0;
                right: 0;
                top: calc(100% + 10px);
                padding: 10px;
                background-color: #f5f5f5;
                border: 1px solid #ddd;
                border-radius: 4px;
                font-family: monospace;
                font-size: 14px;
                white-space: pre-wrap;
                display: none;
                z-index: 9;
            `;

            // 为代码块容器添加相对定位
            preElement.style.position = 'relative';

            // 添加按钮和输出区域
            preElement.appendChild(runButton);
            preElement.parentNode.insertBefore(outputDiv, preElement.nextSibling);

            // 添加点击事件
            runButton.addEventListener('click', async function() {
                const code = codeBlock.textContent;
                const outputElement = preElement.parentNode.querySelector('.code-output');
                
                // 显示加载状态
                outputElement.style.display = 'block';
                outputElement.textContent = 'Running...';
                
                // 运行代码
                const result = await codeRunner.runCode(language, code);
                
                // 显示结果
                if (result.success) {
                    outputElement.textContent = result.output !== undefined ? result.output.toString() : 'Execution completed successfully';
                    outputElement.style.backgroundColor = '#e8f5e8';
                } else {
                    outputElement.textContent = 'Error: ' + result.error;
                    outputElement.style.backgroundColor = '#ffe8e8';
                }
            });
        });
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
