/**
 * 不确定度计算器
 * 实现测量数据的不确定度计算，包括平均值、合成不确定度、相对不确定度等
 */

/**
 * 计算平均值
 * @param {Array<number>} values - 测量值数组
 * @returns {number} 平均值
 */
function calculateMean(values) {
    const sum = values.reduce((acc, val) => acc + val, 0);
    return sum / values.length;
}

/**
 * 计算标准偏差（贝塞尔公式）
 * @param {Array<number>} values - 测量值数组
 * @param {number} mean - 平均值
 * @returns {number} 标准偏差
 */
function calculateStdDev(values, mean) {
    const squaredDifferences = values.map(val => Math.pow(val - mean, 2));
    const variance = squaredDifferences.reduce((acc, val) => acc + val, 0) / (values.length - 1);
    return Math.sqrt(variance);
}

/**
 * 计算A类不确定度（直接等于标准偏差）
 * @param {Array<number>} values - 测量值数组
 * @returns {number} A类不确定度
 */
function calculateTypeAUncertainty(values) {
    const mean = calculateMean(values);
    const stdDev = calculateStdDev(values, mean);
    return stdDev; // 直接返回标准偏差，不除以 sqrt(n)
}

/**
 * 计算合成不确定度（直接测量）
 * @param {number} typeA - A类不确定度（标准偏差）
 * @param {number} typeB - B类不确定度
 * @returns {number} 合成不确定度
 */
function calculateCombinedUncertainty(typeA, typeB) {
    return Math.sqrt(Math.pow(typeA, 2) + Math.pow(typeB, 2));
}

/**
 * 计算相对不确定度（小数形式）
 * @param {number} combinedUncertainty - 合成不确定度
 * @param {number} mean - 平均值
 * @returns {number} 相对不确定度（小数）
 */
function calculateRelativeUncertainty(combinedUncertainty, mean) {
    return combinedUncertainty / mean;
}

/**
 * 处理不确定度的位数（只入不舍，按首位数字决定有效位数）
 * 返回修约后的数值以及修约参数
 * @param {number} uncertainty - 不确定度（正数）
 * @returns {Object} { value, sigDigits, factor, exponent }
 */
function processUncertaintyDigits(uncertainty) {
    if (uncertainty <= 0) return { value: 0, sigDigits: 1, factor: 1, exponent: 0 };
    
    const magnitude = Math.floor(Math.log10(uncertainty));
    const normalized = uncertainty / Math.pow(10, magnitude);
    const firstDigit = Math.floor(normalized);
    const significantDigits = (firstDigit >= 1 && firstDigit <= 3) ? 2 : 1;
    const factor = Math.pow(10, magnitude - (significantDigits - 1));
    let value = Math.ceil(uncertainty / factor) * factor;
    
    // 处理浮点数精度问题，确保结果不会有多余的小数位数
    // 计算需要保留的小数位数
    const decimalPlaces = magnitude < 0 ? -magnitude + (significantDigits - 1) : (significantDigits - 1 - magnitude);
    if (decimalPlaces > 0) {
        value = parseFloat(value.toFixed(decimalPlaces));
    } else if (decimalPlaces < 0) {
        value = Math.round(value / Math.pow(10, -decimalPlaces)) * Math.pow(10, -decimalPlaces);
    }
    
    return { value, sigDigits: significantDigits, factor, exponent: magnitude };
}

/**
 * 银行家舍入（四舍六入五成双）
 * @param {number} value - 需要舍入的数值
 * @param {number} decimals - 保留的小数位数
 * @returns {number} 舍入后的数值
 */
function bankersRound(value, decimals) {
    const factor = Math.pow(10, decimals);
    const scaled = value * factor;
    const integer = Math.floor(scaled);
    const remainder = scaled - integer;
    
    if (remainder < 0.5) {
        return integer / factor;
    } else if (remainder > 0.5) {
        return (integer + 1) / factor;
    } else {
        return (integer % 2 === 0) ? integer / factor : (integer + 1) / factor;
    }
}

/**
 * 处理测量结果的有效数字（与不确定度末位对齐，按银行家舍入）
 * @param {number} value - 测量平均值
 * @param {number} uncertainty - 已处理后的不确定度
 * @returns {number} 处理后的测量值
 */
function processResultDigits(value, uncertainty) {
    if (uncertainty === 0) return value;
    
    // 确定不确定度的小数位数（通过字符串精确获取）
    let decimalPlaces = getDecimalPlacesFromNumber(uncertainty);
    // 返回修约后的数值
    return bankersRound(value, decimalPlaces);
}

/**
 * 获取一个数字精确的小数位数（通过字符串，避免浮点误差）
 * @param {number} num - 数字
 * @returns {number} 小数位数
 */
function getDecimalPlacesFromNumber(num) {
    // 对于修约后的不确定度，它应该是 factor 的整数倍，我们可以通过科学计数法精确获取小数位数
    // 更稳健：将数字转为字符串，但先确保不会出现超长尾数
    const str = num.toString();
    if (str.includes('e')) {
        // 科学计数法，例如 1.23e-4 -> 小数位数为 4 (1.23e-4 = 0.000123)
        const exp = parseInt(str.split('e-')[1]);
        if (!isNaN(exp)) return exp;
        return 0;
    }
    if (str.includes('.')) {
        return str.split('.')[1].length;
    }
    return 0;
}

/**
 * 格式化数字，保留指定小数位数（用于显示中间过程）
 * @param {number} num - 数字
 * @param {number} decimals - 小数位数，默认6
 * @returns {string}
 */
function formatNum(num, decimals = 6) {
    return num.toFixed(decimals).replace(/\.?0+$/, '');
}

/**
 * 格式化不确定度（根据修约结果，精确显示）
 * @param {Object} proc - processUncertaintyDigits 返回的对象
 * @returns {string} 格式化后的不确定度字符串
 */
function formatUncertainty(proc) {
    const { value, factor } = proc;
    if (value === 0) return '0';
    // 根据 factor 确定小数位数
    let decimalPlaces = 0;
    if (factor < 1) {
        decimalPlaces = -Math.floor(Math.log10(factor));
    }
    // 使用 toFixed 确保显示正确位数
    return value.toFixed(decimalPlaces);
}

/**
 * 格式化测量结果（与不确定度小数位数对齐）
 * @param {number} mean - 平均值
 * @param {number} decimalPlaces - 要保留的小数位数
 * @returns {string}
 */
function formatMean(mean, decimalPlaces) {
    return mean.toFixed(decimalPlaces);
}

/**
 * 将相对不确定度处理为两位有效数字的百分数（四舍五入）
 * @param {number} relative - 相对不确定度（小数）
 * @returns {string} 百分数字符串（如 "0.17%"）
 */
function formatRelativeUncertainty(relative) {
    if (relative <= 0) return "0%";
    const percent = relative * 100;
    let formatted = percent.toPrecision(2);
    if (formatted.includes('e')) {
        formatted = parseFloat(percent).toPrecision(2);
    }
    if (formatted.includes('.') && formatted.endsWith('.0')) {
        formatted = formatted.slice(0, -2);
    }
    return formatted + "%";
}

/**
 * 生成不确定度计算结果的Markdown（含详细计算过程）
 * @param {number} typeB - B类不确定度
 * @param {Array<number>} values - 测量值数组
 * @returns {string} 计算结果的Markdown
 */
function generateUncertaintyResult(typeB, values) {
    const n = values.length;
    const mean = calculateMean(values);
    const typeA = calculateTypeAUncertainty(values);
    const combined = calculateCombinedUncertainty(typeA, typeB);
    
    // 处理不确定度的修约，获取精确的修约信息
    const uncProc = processUncertaintyDigits(combined);
    const processedUncertainty = uncProc.value;
    const uncDecimalPlaces = getDecimalPlacesFromNumber(processedUncertainty);
    
    // 处理测量结果的修约（与不确定度末位对齐）
    const processedMeanValue = processResultDigits(mean, processedUncertainty);
    const formattedMean = formatMean(processedMeanValue, uncDecimalPlaces);
    
    // 相对不确定度（使用原始修约后的数值计算，保证一致性）
    const relative = calculateRelativeUncertainty(processedUncertainty, processedMeanValue);
    const processedRelative = formatRelativeUncertainty(relative);
    
    // 格式化后的不确定度字符串（精确）
    const formattedUncertainty = formatUncertainty(uncProc);
    
    // 中间过程数据
    const sum = values.reduce((a,b) => a+b, 0);
    const residuals = values.map(x => x - mean);
    const squaredResiduals = residuals.map(r => r * r);
    const sumSq = squaredResiduals.reduce((a,b) => a+b, 0);
    const variance = sumSq / (n - 1);
    const stdDev = Math.sqrt(variance);
    
    // 不确定度修约过程（用于展示）
    const mag = uncProc.exponent;
    const norm = combined / Math.pow(10, mag);
    const firstDigit = Math.floor(norm);
    const sigDigits = uncProc.sigDigits;
    const factor = uncProc.factor;
    const ceilUnc = uncProc.value;
    
    // 测量结果修约过程（小数位数）
    const alignDecimals = uncDecimalPlaces;
    
    // 构建Markdown
    let md = `# 不确定度计算结果

## 输入数据
- B类不确定度: ${typeB}
- 测量次数: ${n}
- 测量值: ${values.join(', ')}

## 1. 计算平均值

$$\\bar{x} = \\frac{1}{n}\\sum_{i=1}^{n} x_i = \\frac{${values.map(v => formatNum(v)).join(' + ')}}{${n}} = ${formatNum(sum)} \\div ${n} = ${formatNum(mean, 10)}$$

## 2. 计算残差及残差平方和

| i | 测量值 $x_i$ | 残差 $x_i - \\bar{x}$ | 残差平方 $(x_i - \\bar{x})^2$ |
|---|-------------|----------------------|---------------------------|
${values.map((v, i) => `| ${i+1} | ${formatNum(v)} | ${formatNum(residuals[i])} | ${formatNum(squaredResiduals[i])} |`).join('\n')}

残差平方和：
$$\\sum_{i=1}^{n} (x_i - \\bar{x})^2 = ${formatNum(sumSq)}$$

## 3. 计算标准偏差

$$s = \\sqrt{\\frac{\\sum_{i=1}^{n} (x_i - \\bar{x})^2}{n-1}} = \\sqrt{\\frac{${formatNum(sumSq)}}{${n-1}}} = \\sqrt{${formatNum(variance)}} = ${formatNum(stdDev)}$$

## 4. A类不确定度

$$u_A = s = ${formatNum(stdDev)}$$

## 5. B类不确定度

$$u_B = ${typeB}$$

## 6. 合成不确定度

$$u_c = \\sqrt{u_A^2 + u_B^2} = \\sqrt{${formatNum(typeA)}^2 + ${typeB}^2} = \\sqrt{${formatNum(typeA*typeA)} + ${typeB*typeB}} = \\sqrt{${formatNum(typeA*typeA + typeB*typeB)}} = ${formatNum(combined)}$$

## 7. 不确定度修约

- 合成不确定度原始值：${formatNum(combined)}
- 首位数字：${firstDigit}
- 因为首位数字 ${firstDigit} ${firstDigit <= 3 ? '≤3' : '>3'}，故取 ${sigDigits} 位有效数字

处理后不确定度：${formattedUncertainty}

## 8. 测量结果修约

- 平均值原始值：${formatNum(mean, 10)}
- 不确定度已修约为 ${formattedUncertainty}，其小数位数为 ${alignDecimals}
- 将平均值修约到 ${alignDecimals} 位小数

四舍六入五成双，得到修约后测量结果数值：${formattedMean}

## 9. 相对不确定度

$$U_r = \\frac{u_c}{\\bar{x}} \\times 100\\% = \\frac{${formattedUncertainty}}{${formattedMean}} \\times 100\\% = ${(relative*100).toFixed(6)}\\%$$

保留两位有效数字：${processedRelative}

## 10. 最终结果

$$${formattedMean} \\pm ${formattedUncertainty}$$

$$U_r = ${processedRelative}$$

---

计算器代码已开源在[Github](https://github.com/sunhouy/EasyPocketMD/blob/main/js/uncertainty-calculator.js)，如果对你有帮助，请给我点个star，谢谢！
如有bug，请联系我：sunhouyun@emails.bjut.edu.cn
`;

    return md;
}

/**
 * 显示不确定度计算器对话框
 */
function showUncertaintyCalculator() {
    // 创建对话框HTML
    const isNightMode = document.body.classList.contains('night-mode');
    const modalBg = isNightMode ? '#333' : 'white';
    const textColor = isNightMode ? '#f0f0f0' : 'black';
    const borderColor = isNightMode ? '#555' : '#ddd';
    const inputBg = isNightMode ? '#444' : 'white';
    const inputColor = isNightMode ? '#f0f0f0' : 'black';
    const secondaryBtnBg = isNightMode ? '#555' : '#f5f5f5';
    const secondaryBtnColor = isNightMode ? '#f0f0f0' : 'black';
    
    const dialogHTML = `
        <div class="modal-overlay" id="uncertaintyCalculatorOverlay" style="display: flex; align-items: center; justify-content: center; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 10000;">
            <div class="modal" style="background: ${modalBg}; border-radius: 8px; padding: 20px; width: 90%; max-width: 500px; max-height: 80vh; overflow-y: auto; color: ${textColor};">
                <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <h2>不确定度计算器</h2>
                    <button class="modal-close-btn" id="closeUncertaintyCalculator" style="background: none; border: none; font-size: 20px; cursor: pointer; color: ${textColor};">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                
                <div class="modal-form">
                    <div class="form-group" style="margin-bottom: 15px;">
                        <label for="typeBInput" style="display: block; margin-bottom: 5px;">B类不确定度（仪器误差）:</label>
                        <input type="number" id="typeBInput" step="0.0001" placeholder="请输入仪器误差" style="width: 100%; padding: 8px; border: 1px solid ${borderColor}; border-radius: 4px; background: ${inputBg}; color: ${inputColor};">
                    </div>
                    
                    <div class="form-group" style="margin-bottom: 15px;">
                        <label style="display: block; margin-bottom: 5px;">输入方式:</label>
                        <div style="display: flex; gap: 10px;">
                            <button id="tableInputBtn" class="input-mode-btn" style="flex: 1; padding: 6px; border: 1px solid ${borderColor}; border-radius: 4px; background: ${secondaryBtnBg}; color: ${secondaryBtnColor}; cursor: pointer;">表格输入</button>
                            <button id="commaInputBtn" class="input-mode-btn" style="flex: 1; padding: 6px; border: 1px solid ${borderColor}; border-radius: 4px; background: ${inputBg}; color: ${inputColor}; cursor: pointer;">逗号分割</button>
                        </div>
                    </div>
                    
                    <!-- 表格输入模式 -->
                    <div id="tableInputMode" style="margin-bottom: 20px;">
                        <div class="form-group" style="margin-bottom: 15px;">
                            <label for="measurementCount" style="display: block; margin-bottom: 5px;">测量次数:</label>
                            <input type="number" id="measurementCount" min="2" value="5" style="width: 100%; padding: 8px; border: 1px solid ${borderColor}; border-radius: 4px; background: ${inputBg}; color: ${inputColor};">
                        </div>
                        
                        <div id="measurementsContainer" style="margin-bottom: 20px;">
                            <h3 style="margin-bottom: 10px;">测量值:</h3>
                            <!-- 测量值输入框将动态生成 -->
                        </div>
                    </div>
                    
                    <!-- 逗号分割输入模式 -->
                    <div id="commaInputMode" style="margin-bottom: 20px; display: none;">
                        <div class="form-group" style="margin-bottom: 15px;">
                            <label for="commaInput" style="display: block; margin-bottom: 5px;">测量值（用逗号分隔）:</label>
                            <textarea id="commaInput" placeholder="例如：1.23, 2.34, 3.45" style="width: 100%; padding: 8px; border: 1px solid ${borderColor}; border-radius: 4px; background: ${inputBg}; color: ${inputColor}; min-height: 100px;"></textarea>
                            <small style="display: block; margin-top: 5px; font-size: 12px; color: ${isNightMode ? '#aaa' : '#666'};">支持中英文逗号，自动去除空格</small>
                        </div>
                    </div>
                    
                    <div class="modal-actions" style="display: flex; justify-content: space-between;">
                        <button class="modal-btn secondary" id="cancelUncertaintyBtn" style="padding: 8px 16px; border: 1px solid ${borderColor}; border-radius: 4px; background: ${secondaryBtnBg}; color: ${secondaryBtnColor}; cursor: pointer;">取消</button>
                        <button class="modal-btn primary" id="calculateUncertaintyBtn" style="padding: 8px 16px; border: none; border-radius: 4px; background: #0366d6; color: white; cursor: pointer;">计算</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', dialogHTML);
    updateMeasurementInputs();
    
    document.getElementById('measurementCount').addEventListener('change', updateMeasurementInputs);
    
    // 输入方式切换
    const tableInputBtn = document.getElementById('tableInputBtn');
    const commaInputBtn = document.getElementById('commaInputBtn');
    const tableInputMode = document.getElementById('tableInputMode');
    const commaInputMode = document.getElementById('commaInputMode');
    
    tableInputBtn.addEventListener('click', function() {
        tableInputMode.style.display = 'block';
        commaInputMode.style.display = 'none';
        tableInputBtn.style.background = inputBg;
        tableInputBtn.style.color = inputColor;
        commaInputBtn.style.background = secondaryBtnBg;
        commaInputBtn.style.color = secondaryBtnColor;
    });
    
    commaInputBtn.addEventListener('click', function() {
        tableInputMode.style.display = 'none';
        commaInputMode.style.display = 'block';
        commaInputBtn.style.background = inputBg;
        commaInputBtn.style.color = inputColor;
        tableInputBtn.style.background = secondaryBtnBg;
        tableInputBtn.style.color = secondaryBtnColor;
    });
    
    document.getElementById('calculateUncertaintyBtn').addEventListener('click', function() {
        const typeBInput = document.getElementById('typeBInput');
        const typeB = parseFloat(typeBInput.value);
        if (isNaN(typeB) || typeB <= 0) {
            g('customAlert')('请输入有效的B类不确定度');
            return;
        }
        
        let values = [];
        
        // 根据当前输入模式获取测量值
        if (tableInputMode.style.display !== 'none') {
            // 表格输入模式
            const measurementInputs = document.querySelectorAll('#measurementsContainer input');
            for (const input of measurementInputs) {
                const value = parseFloat(input.value);
                if (isNaN(value)) {
                    g('customAlert')('请输入有效的测量值');
                    return;
                }
                values.push(value);
            }
        } else {
            // 逗号分割输入模式
            const commaInput = document.getElementById('commaInput');
            const inputText = commaInput.value;
            
            // 支持中英文逗号，自动去除空格
            const valueStrings = inputText.split(/[,，]/).map(s => s.trim()).filter(s => s !== '');
            
            if (valueStrings.length < 2) {
                g('customAlert')('至少需要输入2个测量值');
                return;
            }
            
            for (const s of valueStrings) {
                const value = parseFloat(s);
                if (isNaN(value)) {
                    g('customAlert')('请输入有效的测量值');
                    return;
                }
                values.push(value);
            }
        }
        
        if (values.length < 2) {
            g('customAlert')('至少需要2个测量值');
            return;
        }
        
        const resultMarkdown = generateUncertaintyResult(typeB, values);
        if (window.vditor) {
            window.vditor.setValue(resultMarkdown);
        } else {
            g('customAlert')('结果已生成，但未找到编辑器，请检查Vditor是否已加载。');
        }
        closeUncertaintyCalculator();
    });
    
    document.getElementById('cancelUncertaintyBtn').addEventListener('click', closeUncertaintyCalculator);
    document.getElementById('closeUncertaintyCalculator').addEventListener('click', closeUncertaintyCalculator);
    document.getElementById('uncertaintyCalculatorOverlay').addEventListener('click', function(e) {
        if (e.target === this) closeUncertaintyCalculator();
    });
}

/**
 * 更新测量值输入框
 */
function updateMeasurementInputs() {
    const count = parseInt(document.getElementById('measurementCount').value) || 5;
    const container = document.getElementById('measurementsContainer');
    const existingInputs = container.querySelectorAll('.measurement-input-group');
    existingInputs.forEach(group => group.remove());
    
    const isNightMode = document.body.classList.contains('night-mode');
    const borderColor = isNightMode ? '#555' : '#ddd';
    const inputBg = isNightMode ? '#444' : 'white';
    const inputColor = isNightMode ? '#f0f0f0' : 'black';
    const labelColor = isNightMode ? '#f0f0f0' : 'black';
    
    for (let i = 1; i <= count; i++) {
        const inputGroup = document.createElement('div');
        inputGroup.className = 'measurement-input-group';
        inputGroup.style.marginBottom = '8px';
        inputGroup.innerHTML = `
            <label for="measurement${i}" style="display: inline-block; width: 60px; color: ${labelColor};">测量${i}:</label>
            <input type="number" id="measurement${i}" step="0.0001" placeholder="请输入值" style="width: calc(100% - 70px); padding: 6px; border: 1px solid ${borderColor}; border-radius: 4px; background: ${inputBg}; color: ${inputColor};">
        `;
        container.appendChild(inputGroup);
    }
}

/**
 * 关闭不确定度计算器对话框
 */
function closeUncertaintyCalculator() {
    const overlay = document.getElementById('uncertaintyCalculatorOverlay');
    if (overlay) overlay.remove();
}

// 暴露到全局
window.showUncertaintyCalculator = showUncertaintyCalculator;
window.closeUncertaintyCalculator = closeUncertaintyCalculator;