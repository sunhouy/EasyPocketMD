(function(global) {
    'use strict';

    function g(name) { return global[name]; }

    // 代码运行器类
    class CodeRunner {
        constructor() {
            this.pyodide = null;
            this.pyodideLoaded = false;
            this.emscriptenModule = null;
        }

        // 初始化Pyodide
        async initPyodide() {
            if (!this.pyodideLoaded) {
                try {
                    const Pyodide = await import('pyodide');
                    this.pyodide = await Pyodide.loadPyodide({
                        indexURL: './node_modules/pyodide/dist/'
                    });
                    this.pyodideLoaded = true;
                    console.log('Pyodide initialized successfully');
                } catch (error) {
                    console.error('Failed to initialize Pyodide:', error);
                    throw error;
                }
            }
            return this.pyodide;
        }

        // 运行Python代码
        async runPython(code) {
            try {
                const pyodide = await this.initPyodide();
                const result = pyodide.runPython(code);
                return { success: true, output: result };
            } catch (error) {
                return { success: false, error: error.message };
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
        async runCpp(code) {
            // 这里需要集成Emscripten编译和运行逻辑
            // 由于Emscripten编译过程复杂，这里只提供一个占位实现
            return {
                success: false,
                error: 'C/C++ code execution is not fully implemented yet. Please use JavaScript or Python for now.'
            };
        }

        // 根据语言类型运行代码
        async runCode(language, code) {
            switch (language.toLowerCase()) {
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
                    return this.runCpp(code);
                default:
                    return { success: false, error: `Unsupported language: ${language}` };
            }
        }
    }

    // 初始化代码运行器
    const codeRunner = new CodeRunner();

    // 为代码块添加运行按钮
    function addRunButtons() {
        const codeBlocks = document.querySelectorAll('pre code');
        codeBlocks.forEach(codeBlock => {
            // 检查是否已经添加了运行按钮
            if (codeBlock.parentElement.querySelector('.code-run-button')) {
                return;
            }

            // 获取语言类型
            const language = codeBlock.className.replace('language-', '').split(' ')[0];
            
            // 只处理支持的语言
            if (!['python', 'py', 'javascript', 'js', 'typescript', 'ts', 'c', 'cpp', 'c++'].includes(language.toLowerCase())) {
                return;
            }

            // 创建运行按钮
            const runButton = document.createElement('button');
            runButton.className = 'code-run-button';
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
            outputDiv.style.cssText = `
                margin-top: 10px;
                padding: 10px;
                background-color: #f5f5f5;
                border: 1px solid #ddd;
                border-radius: 4px;
                font-family: monospace;
                font-size: 14px;
                white-space: pre-wrap;
                display: none;
            `;

            // 为代码块容器添加相对定位
            const preElement = codeBlock.parentElement;
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
                    outputElement.textContent = `Error: ${result.error}`;
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
                            addRunButtons();
                        } else if (node.querySelectorAll) {
                            const codeBlocks = node.querySelectorAll('pre code');
                            if (codeBlocks.length > 0) {
                                addRunButtons();
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
