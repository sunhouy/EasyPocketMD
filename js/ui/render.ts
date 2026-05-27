
(function(global) {
    'use strict';

    function g(name) { return global[name]; }

    function generateFormulaDataUrl(latex, displayMode) {
        try {
            // Create a simple text representation of the formula
            return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg width="300" height="50" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="white" stroke="#ddd" stroke-width="1"/><text x="150" y="30" font-family="Arial" font-size="14" text-anchor="middle" fill="#333">Formula: ' + latex + '</text></svg>');
        } catch (e) {
            console.error('Formula SVG generation error:', e);
            return null;
        }
    }

    function generateChartDataUrl(mermaidCode) {
        try {
            // Determine chart type
            var chartType = mermaidCode.toLowerCase().includes('graph') ? 'Flowchart' :
                mermaidCode.toLowerCase().includes('sequence') ? 'Sequence Diagram' :
                    mermaidCode.toLowerCase().includes('class') ? 'Class Diagram' :
                        mermaidCode.toLowerCase().includes('state') ? 'State Diagram' :
                            mermaidCode.toLowerCase().includes('gantt') ? 'Gantt Chart' :
                                mermaidCode.toLowerCase().includes('pie') ? 'Pie Chart' :
                                    mermaidCode.toLowerCase().includes('xychart') ? 'XY Chart' : 'Mermaid Chart';

            // Create a simple text representation of the chart
            return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg width="500" height="300" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="white" stroke="#ddd" stroke-width="1"/><text x="250" y="130" font-family="Arial" font-size="16" text-anchor="middle" fill="#333">' + chartType + '</text><text x="250" y="160" font-family="Arial" font-size="12" text-anchor="middle" fill="#666">Chart</text></svg>');
        } catch (e) {
            console.error('Chart SVG generation error:', e);
            return null;
        }
    }

    /**
     * 将公式和图表转换为图片。
     * options.useTempDir 为 true 时，会提示 uploadImage 使用临时目录（不携带用户信息）。
     */
    async function convertFormulasAndChartsToImages(html, options) {
        if (!html) {
            return html;
        }

        // 动态加载 html2canvas
        var html2canvas;
        try {
            html2canvas = (await import('html2canvas')).default;
        } catch (e) {
            console.error('[Render Debug] Failed to load html2canvas', e);
            return html;
        }

        var container = document.createElement('div');
        container.innerHTML = html;

        // 处理原始的Markdown公式格式
        var allElements = container.querySelectorAll('div, p, span');

        // 收集所有需要处理的元素
        var elementsToProcess = [];

        // 遍历所有元素，查找包含公式的元素
        for (var i = 0; i < allElements.length; i++) {
            var el = allElements[i];
            var textContent = el.textContent;
            var innerHTML = el.innerHTML;

            // 查找行内公式
            var inlineMatch = textContent.match(/\\\(([\s\S]*?)\\\)/);
            if (inlineMatch) {
                elementsToProcess.push({
                    element: el,
                    type: 'inline-formula',
                    content: inlineMatch[1]
                });
                continue;
            }

            // 查找行内公式 $...$ - 使用 [\s\S] 替代点号
            var dollarInlineMatch = textContent.match(/\$([\s\S]*?)\$/);
            if (dollarInlineMatch) {
                elementsToProcess.push({
                    element: el,
                    type: 'inline-formula',
                    content: dollarInlineMatch[1]
                });
                continue;
            }

            // 查找块级公式 \[...\] - 使用 [\s\S] 替代点号
            var blockMatch = textContent.match(/\\\[([\s\S]*?)\\\]/);
            if (blockMatch) {
                elementsToProcess.push({
                    element: el,
                    type: 'block-formula',
                    content: blockMatch[1]
                });
                continue;
            }

            // 查找块级公式 $$...$$ - 使用 [\s\S] 替代点号，并移除 s 标志
            var dollarMatch = textContent.match(/\$\$([\s\S]*?)\$\$/);
            if (dollarMatch) {
                elementsToProcess.push({
                    element: el,
                    type: 'block-formula',
                    content: dollarMatch[1]
                });
                continue;
            }
        }
        
        elementsToProcess = [];

        var mermaidElements = container.querySelectorAll('.mermaid, [data-mermaid]');

        for (var i = 0; i < mermaidElements.length; i++) {
            var el = mermaidElements[i];
            var mermaidCode = el.textContent || el.getAttribute('data-mermaid');
            if (!mermaidCode) continue;

            var tempDiv = null;
            var mermaidDiv = null;
            var dataUrl = null;

            try {
                tempDiv = document.createElement('div');
                tempDiv.className = 'mermaid';
                tempDiv.textContent = mermaidCode;
                tempDiv.style.cssText = 'position:fixed; left:-10000px; top:0; min-width:400px; min-height:400px; padding:20px; background:white; z-index:-1; overflow:visible; width:auto; height:auto;';
                document.body.appendChild(tempDiv);

                if (!window.mermaid) {
                    console.warn('[Render Debug] Mermaid库未加载，尝试动态加载...');
                    await new Promise((resolve, reject) => {
                        const script = document.createElement('script');
                        script.src = '/vditor/dist/js/mermaid/mermaid.min.js';
                        script.onload = resolve;
                        script.onerror = function() {
                            const fallback = document.createElement('script');
                            fallback.src = 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js';
                            fallback.onload = resolve;
                            fallback.onerror = reject;
                            document.head.appendChild(fallback);
                        };
                        document.head.appendChild(script);
                    });
                }

                if (!window.mermaid) {
                    throw new Error('Mermaid库加载失败');
                }

                var cleanedCode = mermaidCode.trim();
                if (cleanedCode.startsWith('---')) {
                    cleanedCode = cleanedCode.split('---').slice(2).join('---').trim();
                }

                mermaid.initialize({
                    startOnLoad: false,
                    theme: 'default',
                    securityLevel: 'loose',
                });

                mermaidDiv = document.createElement('div');
                mermaidDiv.className = 'mermaid';
                mermaidDiv.textContent = cleanedCode;
                mermaidDiv.style.cssText = 'background:white; padding:20px; position:fixed; left:-10000px; top:0;';
                document.body.appendChild(mermaidDiv);

                if (mermaid.run) {
                    await mermaid.run({ nodes: [mermaidDiv] });
                } else if (mermaid.init) {
                    mermaid.init(undefined, mermaidDiv);
                } else {
                    throw new Error('未找到可用的 Mermaid 渲染方法');
                }

                await new Promise(resolve => setTimeout(resolve, 300));

                var svgElement = mermaidDiv.querySelector('svg');
                if (!svgElement) {
                    throw new Error('Mermaid渲染未生成SVG');
                }

                var svgRect = svgElement.getBoundingClientRect();
                var width = Math.max(400, svgRect.width + 40);
                var height = Math.max(300, svgRect.height + 40);

                tempDiv.innerHTML = '';
                tempDiv.appendChild(svgElement.cloneNode(true));
                tempDiv.style.width = width + 'px';
                tempDiv.style.height = height + 'px';

                if (html2canvas) {
                    const canvas = await html2canvas(tempDiv, {
                        backgroundColor: '#ffffff',
                        scale: 1.5
                    });
                    dataUrl = canvas.toDataURL('image/png');
                } else {
                    throw new Error('html2canvas库不可用');
                }

                if (dataUrl && el.parentNode) {
                    var imgContainer = document.createElement('div');
                    imgContainer.style.cssText = 'text-align:center; margin:20px 0;';
                    var img = document.createElement('img');
                    img.alt = 'Chart';

                    if (options && options.useTempDir) {
                        // PDF/打印导出：内联 base64，避免 wkhtmltopdf 回连服务器拉取图片导致卡死
                        img.src = dataUrl;
                    } else {
                        var imgUrl = await global.uploadImage(dataUrl, false);
                        if (!imgUrl) {
                            throw new Error('图表图片上传失败');
                        }
                        img.src = imgUrl;
                    }

                    img.style.maxWidth = '100%';
                    img.style.height = 'auto';
                    imgContainer.appendChild(img);
                    el.parentNode.replaceChild(imgContainer, el);
                }
            } catch (e) {
                console.error('[Render Debug] Mermaid渲染错误:', e);
                if (el.parentNode) {
                    var fallback = document.createElement('div');
                    fallback.style.cssText = 'text-align:center;color:#666;margin:1em 0;padding:1em;border:1px dashed #ddd;';
                    fallback.textContent = '[Mermaid Diagram]';
                    el.parentNode.replaceChild(fallback, el);
                }
            } finally {
                if (tempDiv && tempDiv.parentNode === document.body) {
                    document.body.removeChild(tempDiv);
                }
                if (mermaidDiv && mermaidDiv.parentNode === document.body) {
                    document.body.removeChild(mermaidDiv);
                }
            }
        }
        return container.innerHTML;
    }

    function generateTableHtml(headers, rows, alignment) {
        if (!headers || headers.length === 0) return '';

        var html = '<div style="margin:1em 0;overflow-x:auto;"><table style="width:100%;border-collapse:collapse;text-align:' + alignment + ';">';

        // 表头
        html += '<thead><tr>';
        headers.forEach(header => {
            html += '<th style="border:1px solid #ddd;padding:8px;background:#f8f9fa;">' + header + '</th>';
        });
        html += '</tr></thead>';

        // 表体
        if (rows && rows.length > 0) {
            html += '<tbody>';
            rows.forEach(row => {
                html += '<tr>';
                row.forEach(cell => {
                    html += '<td style="border:1px solid #ddd;padding:8px;">' + cell + '</td>';
                });
                html += '</tr>';
            });
            html += '</tbody>';
        }

        html += '</table></div>';
        return html;
    }

    global.convertFormulasAndChartsToImages = convertFormulasAndChartsToImages;
    global.generateFormulaDataUrl = generateFormulaDataUrl;
    global.generateChartDataUrl = generateChartDataUrl;
    global.generateTableHtml = generateTableHtml;

})(typeof window !== 'undefined' ? window : this);
