
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

    async function convertFormulasAndChartsToImages(html) {
        if (!html) {
            return html;
        }

        // 动态加载 html-to-image
        var htmlToImage;
        try {
            htmlToImage = await import('html-to-image');
        } catch (e) {
            console.error('Failed to load html-to-image', e);
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

        // 处理公式元素
        for (var i = 0; i < elementsToProcess.length; i++) {
            var item = elementsToProcess[i];
            var el = item.element;
            var latex = item.content;
            var displayMode = item.type === 'block-formula';

            try {
                // Create a temporary div for rendering
                var tempDiv = document.createElement('div');
                tempDiv.style.cssText = 'position:fixed; left:0; top:0; padding:10px; background:white; z-index:-1;';
                tempDiv.style.width = 'auto';
                tempDiv.style.height = 'auto';
                tempDiv.style.display = 'inline-block';

                // Render KaTeX to the div
                if (window.katex) {
                    try {
                        katex.render(latex, tempDiv, {
                            throwOnError: false,
                            displayMode: displayMode,
                            output: 'html',
                            strict: 'ignore'
                        });
                    } catch (katexError) {
                        console.error('KaTeX渲染失败:', katexError);
                        continue;
                    }
                } else {
                    console.error('KaTeX库不可用，无法渲染公式');
                    continue;
                }

                document.body.appendChild(tempDiv);

                // 等待一小段时间确保渲染完成
                await new Promise(resolve => setTimeout(resolve, 200));

                // 获取渲染后公式的实际尺寸
                var formulaRect = tempDiv.getBoundingClientRect();

                // 根据公式实际尺寸调整容器大小
                tempDiv.style.width = (formulaRect.width + 20) + 'px'; // 加上20px的padding
                tempDiv.style.height = (formulaRect.height + 20) + 'px';

                // Convert to image using html-to-image
                if (htmlToImage) {
                    try {
                        var dataUrl = await htmlToImage.toPng(tempDiv);
                        document.body.removeChild(tempDiv);
                    } catch (imageError) {
                        console.error('图片转换失败:', imageError);
                        document.body.removeChild(tempDiv);
                        continue;
                    }
                } else {
                    console.error('html-to-image库不可用，无法转换为图片');
                    document.body.removeChild(tempDiv);
                    continue;
                }

                // Upload image to server
                var imgUrl = await global.uploadImage(dataUrl);

                if (imgUrl) {
                    // Create image container with proper styling
                    var imgContainer = document.createElement('div');
                    imgContainer.style.cssText = 'text-align:center; margin:10px 0;';
                    var img = document.createElement('img');
                    img.src = imgUrl;
                    img.alt = 'Formula';
                    img.style.maxWidth = '100%';
                    img.style.height = 'auto';
                    imgContainer.appendChild(img);

                    // 替换原始元素
                    el.parentNode.replaceChild(imgContainer, el);

                    // 检查并删除相邻的文本节点中的公式标记
                    var prevSibling = imgContainer.previousSibling;
                    var nextSibling = imgContainer.nextSibling;
                    var marker = item.type === 'inline-formula' ? '$' : '$$';

                    // 处理前面的节点
                    if (prevSibling && prevSibling.nodeType === 3) {
                        var prevText = prevSibling.textContent;
                        if (prevText.includes(marker)) {
                            // 删除包含标记的文本节点
                            prevSibling.parentNode.removeChild(prevSibling);
                        }
                    }

                    // 处理后面的节点
                    if (nextSibling && nextSibling.nodeType === 3) {
                        var nextText = nextSibling.textContent;
                        if (nextText.includes(marker)) {
                            // 删除包含标记的文本节点
                            nextSibling.parentNode.removeChild(nextSibling);
                        }
                    }

                    // 对于块级公式，还要检查是否有额外的结束标记节点
                    if (item.type === 'block-formula') {
                        var checkSibling = imgContainer.nextSibling;
                        var foundEnd = false;

                        while (checkSibling && !foundEnd) {
                            if (checkSibling.nodeType === 1) {
                                var checkContent = checkSibling.textContent;
                                if (checkContent.trim() === '$$') {
                                    checkSibling.parentNode.removeChild(checkSibling);
                                    foundEnd = true;
                                }
                            } else if (checkSibling.nodeType === 3) {
                                var checkText = checkSibling.textContent;
                                if (checkText.trim() === '$$') {
                                    checkSibling.parentNode.removeChild(checkSibling);
                                    foundEnd = true;
                                }
                            }
                            checkSibling = checkSibling.nextSibling;
                        }
                    }
                } else {
                    console.error('图片上传失败，URL为空');
                }
            } catch (e) {
                console.error('公式处理错误:', e);
            }
        }

        // Convert Mermaid charts to images and upload
        var mermaidElements = container.querySelectorAll('.mermaid, [data-mermaid]');

        for (var i = 0; i < mermaidElements.length; i++) {
            var el = mermaidElements[i];
            var mermaidCode = el.textContent || el.getAttribute('data-mermaid');
            if (!mermaidCode) continue;

            try {
                // Create a temporary div for rendering
                var tempDiv = document.createElement('div');
                tempDiv.className = 'mermaid';
                tempDiv.textContent = mermaidCode;
                tempDiv.style.cssText = 'position:fixed; left:0; top:0; min-width:400px; min-height:400px; padding:20px; background:white; z-index:-1;';
                tempDiv.style.overflow = 'visible';
                tempDiv.style.width = 'auto';
                tempDiv.style.height = 'auto';

                document.body.appendChild(tempDiv);

                // 尝试使用更直接的方法渲染 Mermaid 图表
                try {
                    // 确保 Mermaid 库已加载
                    if (!window.mermaid) {
                        // 尝试动态加载 Mermaid
                        console.warn('Mermaid库未加载，尝试动态加载...');
                        await new Promise((resolve, reject) => {
                            const script = document.createElement('script');
                            script.src = 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js';
                            script.onload = resolve;
                            script.onerror = reject;
                            document.head.appendChild(script);
                        });
                    }

                    if (!window.mermaid) {
                        throw new Error('Mermaid库加载失败');
                    }

                    // 清理 Mermaid 代码
                    var cleanedCode = mermaidCode.trim();
                    if (cleanedCode.startsWith('---')) {
                        cleanedCode = cleanedCode.split('---').slice(2).join('---').trim();
                    }

                    // 初始化 Mermaid
                    mermaid.initialize({
                        startOnLoad: false,
                        theme: 'default',
                        securityLevel: 'loose',
                    });

                    // 创建一个独立的 div 来渲染 Mermaid 图表
                    var mermaidDiv = document.createElement('div');
                    mermaidDiv.className = 'mermaid';
                    mermaidDiv.textContent = cleanedCode;
                    mermaidDiv.style.cssText = 'background:white; padding:20px;';
                    // 先添加到 body 以确保 mermaid 能正确计算尺寸
                    document.body.appendChild(mermaidDiv);
                    
                    try {
                        // 兼容新旧版本 Mermaid API
                        if (mermaid.run) {
                            await mermaid.run({ nodes: [mermaidDiv] });
                        } else if (mermaid.init) {
                            mermaid.init(undefined, mermaidDiv);
                        } else {
                            throw new Error('未找到可用的 Mermaid 渲染方法');
                        }

                        // 等待渲染完成
                        await new Promise(resolve => setTimeout(resolve, 500));

                        var svgElement = mermaidDiv.querySelector('svg');
                        if (svgElement) {
                            var svgRect = svgElement.getBoundingClientRect();
                            var width = Math.max(400, svgRect.width + 40);
                            var height = Math.max(300, svgRect.height + 40);
                            
                            // 将渲染好的 SVG 移动到 tempDiv
                            tempDiv.innerHTML = '';
                            tempDiv.appendChild(svgElement);
                            tempDiv.style.width = width + 'px';
                            tempDiv.style.height = height + 'px';
                        } else {
                            throw new Error('Mermaid渲染未生成SVG');
                        }
                    } finally {
                        if (mermaidDiv.parentNode === document.body) {
                            document.body.removeChild(mermaidDiv);
                        }
                    }
                } catch (mermaidError) {
                    console.error('Mermaid渲染失败:', mermaidError);
                    // 渲染失败时使用占位符
                    var svgCode = `
                        <svg width="600" height="400" xmlns="http://www.w3.org/2000/svg">
                            <rect width="100%" height="100%" fill="white" stroke="#ddd" stroke-width="1"/>
                            <text x="300" y="200" font-family="Arial" font-size="24" text-anchor="middle" fill="#333">Mermaid Chart</text>
                            <text x="300" y="240" font-family="Arial" font-size="16" text-anchor="middle" fill="#666">Chart Rendered</text>
                        </svg>
                    `;
                    tempDiv.innerHTML = svgCode;
                    console.log('使用占位符替代');
                }

                // Wait a bit for rendering to complete
                await new Promise(resolve => setTimeout(resolve, 1000)); // 增加等待时间确保渲染完成

                // Convert to image using html-to-image
                if (htmlToImage) {
                    try {
                        var dataUrl = await htmlToImage.toPng(tempDiv);
                        document.body.removeChild(tempDiv);
                    } catch (imageError) {
                        console.error('图表图片转换失败:', imageError);
                        document.body.removeChild(tempDiv);
                        continue;
                    }
                } else {
                    console.error('html-to-image库不可用，无法转换为图片');
                    document.body.removeChild(tempDiv);
                    continue;
                }

                // Upload image to server
                var imgUrl = await global.uploadImage(dataUrl);

                if (imgUrl && el.parentNode) {
                    // Create image container with proper styling
                    var imgContainer = document.createElement('div');
                    imgContainer.style.cssText = 'text-align:center; margin:20px 0;';
                    var img = document.createElement('img');
                    img.src = imgUrl;
                    img.alt = 'Chart';
                    img.style.maxWidth = '100%';
                    img.style.height = 'auto';
                    imgContainer.appendChild(img);
                    el.parentNode.replaceChild(imgContainer, el);
                } else {
                    console.error('图表图片上传失败，URL为空');
                }
            } catch (e) {
                console.error('Mermaid渲染错误:', e);
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
