// 公式选择器
function showFormulaPicker() {
    function isEn() { return window.i18n && window.i18n.getLanguage() === 'en'; }
    
    // 增强的LaTeX公式分类
    const formulaCategories = {
        [isEn() ? 'Basic Operations' : '基础运算']: [
            {display: '+', latex: '+'},
            {display: '-', latex: '-'},
            {display: '×', latex: '\\times'},
            {display: '÷', latex: '\\div'},
            {display: '=', latex: '='},
            {display: '≠', latex: '\\neq'},
            {display: '≈', latex: '\\approx'},
            {display: '±', latex: '\\pm'},
            {display: '∓', latex: '\\mp'}
        ],
        [isEn() ? 'Relational Symbols' : '关系符号']: [
            {display: '<', latex: '<'},
            {display: '>', latex: '>'},
            {display: '≤', latex: '\\leq'},
            {display: '≥', latex: '\\geq'},
            {display: '≦', latex: '\\leqq'},
            {display: '≧', latex: '\\geqq'},
            {display: '≪', latex: '\\ll'},
            {display: '≫', latex: '\\gg'},
            {display: '≡', latex: '\\equiv'},
            {display: '≢', latex: '\\not\\equiv'}
        ],
        [isEn() ? 'Set Symbols' : '集合符号']: [
            {display: '∈', latex: '\\in'},
            {display: '∉', latex: '\\notin'},
            {display: '⊂', latex: '\\subset'},
            {display: '⊃', latex: '\\supset'},
            {display: '⊆', latex: '\\subseteq'},
            {display: '⊇', latex: '\\supseteq'},
            {display: '∪', latex: '\\cup'},
            {display: '∩', latex: '\\cap'},
            {display: '∅', latex: '\\emptyset'},
            {display: '∞', latex: '\\infty'}
        ],
        [isEn() ? 'Greek Letters' : '希腊字母']: [
            {display: 'α', latex: '\\alpha'},
            {display: 'β', latex: '\\beta'},
            {display: 'γ', latex: '\\gamma'},
            {display: 'δ', latex: '\\delta'},
            {display: 'ε', latex: '\\epsilon'},
            {display: 'ζ', latex: '\\zeta'},
            {display: 'η', latex: '\\eta'},
            {display: 'θ', latex: '\\theta'},
            {display: 'λ', latex: '\\lambda'},
            {display: 'μ', latex: '\\mu'},
            {display: 'ν', latex: '\\nu'},
            {display: 'ξ', latex: '\\xi'},
            {display: 'π', latex: '\\pi'},
            {display: 'ρ', latex: '\\rho'},
            {display: 'σ', latex: '\\sigma'},
            {display: 'τ', latex: '\\tau'},
            {display: 'φ', latex: '\\phi'},
            {display: 'χ', latex: '\\chi'},
            {display: 'ψ', latex: '\\psi'},
            {display: 'ω', latex: '\\omega'}
        ],
        [isEn() ? 'Calculus' : '微积分']: [
            {display: '∫', latex: '\\int'},
            {display: '∮', latex: '\\oint'},
            {display: '∬', latex: '\\iint'},
            {display: '∭', latex: '\\iiint'},
            {display: '∂', latex: '\\partial'},
            {display: '∇', latex: '\\nabla'},
            {display: '∆', latex: '\\Delta'},
            {display: '∑', latex: '\\sum'},
            {display: '∏', latex: '\\prod'},
            {display: '∐', latex: '\\coprod'},
            {display: 'lim', latex: '\\lim_{x \\to a} f(x)'},
            {display: 'dx', latex: '\\,dx'},
            {display: 'dy/dx', latex: '\\frac{dy}{dx}'},
            {display: '∫ f(x) dx', latex: '\\int f(x) \\,dx'}
        ],
        [isEn() ? 'Logic Symbols' : '逻辑符号']: [
            {display: '∀', latex: '\\forall'},
            {display: '∃', latex: '\\exists'},
            {display: '∄', latex: '\\nexists'},
            {display: '∧', latex: '\\wedge'},
            {display: '∨', latex: '\\vee'},
            {display: '¬', latex: '\\neg'},
            {display: '∴', latex: '\\therefore'},
            {display: '∵', latex: '\\because'},
            {display: '∎', latex: '\\blacksquare'}
        ],
        [isEn() ? 'Arrow Symbols' : '箭头符号']: [
            {display: '→', latex: '\\to'},
            {display: '←', latex: '\\leftarrow'},
            {display: '↔', latex: '\\leftrightarrow'},
            {display: '↦', latex: '\\mapsto'},
            {display: '⇒', latex: '\\Rightarrow'},
            {display: '⇐', latex: '\\Leftarrow'},
            {display: '⇔', latex: '\\Leftrightarrow'},
            {display: '⇑', latex: '\\Uparrow'},
            {display: '⇓', latex: '\\Downarrow'}
        ],
        [isEn() ? 'Geometry Symbols' : '几何符号']: [
            {display: '∠', latex: '\\angle'},
            {display: '⊥', latex: '\\perp'},
            {display: '∥', latex: '\\parallel'},
            {display: '≅', latex: '\\cong'},
            {display: '∼', latex: '\\sim'},
            {display: '∽', latex: '\\backsim'},
            {display: '∝', latex: '\\propto'},
            {display: '∘', latex: '\\circ'},
            {display: '•', latex: '\\bullet'}
        ],
        [isEn() ? 'Fractions & Exponents' : '分数指数']: [
            {display: '½', latex: '\\frac{1}{2}'},
            {display: '⅓', latex: '\\frac{1}{3}'},
            {display: '¼', latex: '\\frac{1}{4}'},
            {display: '√', latex: '\\sqrt{}'},
            {display: '∛', latex: '\\sqrt[3]{}'},
            {display: '∜', latex: '\\sqrt[4]{}'},
            {display: 'ⁿ', latex: '^{n}'},
            {display: 'a/b', latex: '\\frac{a}{b}'},
            {display: 'aⁿ', latex: 'a^{n}'},
            {display: '√a', latex: '\\sqrt{a}'}
        ],
        [isEn() ? 'Linear Algebra' : '线性代数']: [
            {display: 'Aᵀ', latex: 'A^{T}'},
            {display: 'det(A)', latex: '\\det(A)'},
            {display: 'tr(A)', latex: '\\operatorname{tr}(A)'},
            {display: 'rank(A)', latex: '\\operatorname{rank}(A)'},
            {display: 'Iₙ', latex: 'I_{n}'},
            {display: '0ₙ', latex: '\\mathbf{0}_{n}'},
            {display: 'u·v', latex: '\\mathbf{u} \\cdot \\mathbf{v}'},
            {display: 'u×v', latex: '\\mathbf{u} \\times \\mathbf{v}'},
            {display: '‖v‖', latex: '\\|\\mathbf{v}\\|'},
            {display: isEn() ? 'Matrix' : '矩阵', latex: '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}'},
            {display: isEn() ? 'Determinant' : '行列式', latex: '\\begin{vmatrix} a & b \\\\ c & d \\end{vmatrix}'},
            {display: isEn() ? 'Vector' : '向量', latex: '\\begin{bmatrix} x \\\\ y \\\\ z \\end{bmatrix}'}
        ],
        [isEn() ? 'Chemistry Symbols' : '化学符号']: [
            {display: '→', latex: '\\rightarrow'},
            {display: '⇌', latex: '\\rightleftharpoons'},
            {display: '↑', latex: '\\uparrow'},
            {display: '↓', latex: '\\downarrow'},
            {display: 'H₂O', latex: '\\mathrm{H_2O}'},
            {display: 'CO₂', latex: '\\mathrm{CO_2}'},
            {display: 'H⁺', latex: '\\mathrm{H^+}'},
            {display: 'OH⁻', latex: '\\mathrm{OH^-}'},
            {display: 'ΔH', latex: '\\Delta H'},
            {display: isEn() ? '⇌ Equilibrium' : '⇌ 平衡', latex: '\\mathrm{A} + \\mathrm{B} \\rightleftharpoons \\mathrm{C}'},
            {display: isEn() ? '→ Reaction' : '→ 反应', latex: '2\\mathrm{H_2} + \\mathrm{O_2} \\rightarrow 2\\mathrm{H_2O}'}
        ],
        [isEn() ? 'Function Operations' : '函数运算']: [
            {display: 'sin', latex: '\\sin'},
            {display: 'cos', latex: '\\cos'},
            {display: 'tan', latex: '\\tan'},
            {display: 'log', latex: '\\log'},
            {display: 'ln', latex: '\\ln'},
            {display: 'exp', latex: '\\exp'},
            {display: 'max', latex: '\\max'},
            {display: 'min', latex: '\\min'},
            {display: 'argmax', latex: '\\arg\\max'},
            {display: 'argmin', latex: '\\arg\\min'}
        ],
        [isEn() ? 'Brackets' : '括号']: [
            {display: '( )', latex: '()'},
            {display: '[ ]', latex: '[]'},
            {display: '{ }', latex: '\\{\\}'},
            {display: '⟨ ⟩', latex: '\\langle \\rangle'},
            {display: '⌊ ⌋', latex: '\\lfloor \\rfloor'},
            {display: '⌈ ⌉', latex: '\\lceil \\rceil'},
            {display: '∣ ∣', latex: '| |'},
            {display: '∥ ∥', latex: '\\| \\|'}
        ],
        [isEn() ? 'Subscripts & Superscripts' : '上下标']: [
            {display: 'a₁', latex: 'a_{1}'},
            {display: 'x²', latex: 'x^{2}'},
            {display: 'x̄', latex: '\\bar{x}'},
            {display: 'x̂', latex: '\\hat{x}'},
            {display: 'x̃', latex: '\\tilde{x}'},
            {display: 'ẋ', latex: '\\dot{x}'},
            {display: 'ẍ', latex: '\\ddot{x}'},
            {display: 'Aᵢⱼ', latex: 'A_{ij}'}
        ],
        [isEn() ? 'Special Symbols' : '特殊符号']: [
            {display: 'ℕ', latex: '\\mathbb{N}'},
            {display: 'ℤ', latex: '\\mathbb{Z}'},
            {display: 'ℚ', latex: '\\mathbb{Q}'},
            {display: 'ℝ', latex: '\\mathbb{R}'},
            {display: 'ℂ', latex: '\\mathbb{C}'},
            {display: 'ℙ', latex: '\\mathbb{P}'},
            {display: '𝔼', latex: '\\mathbb{E}'},
            {display: '∇·', latex: '\\nabla \\cdot'},
            {display: '∇×', latex: '\\nabla \\times'},
            {display: '□', latex: '\\Box'}
        ],
        [isEn() ? 'Common Formula Templates' : '常用公式模板']: [
            {display: isEn() ? 'Quadratic Formula' : '二次公式', latex: 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}'},
            {display: isEn() ? 'Euler\'s Formula' : '欧拉公式', latex: 'e^{i\\theta} = \\cos\\theta + i\\sin\\theta'},
            {display: isEn() ? 'Integration by Parts' : '分部积分', latex: '\\int u \\, dv = uv - \\int v \\, du'},
            {display: isEn() ? 'Chain Rule' : '链式法则', latex: '\\frac{dy}{dx} = \\frac{dy}{du} \\cdot \\frac{du}{dx}'},
            {display: isEn() ? 'Fourier Transform' : '傅里叶变换', latex: 'F(\\omega) = \\int_{-\\infty}^{\\infty} f(t) e^{-i\\omega t} dt'},
            {display: isEn() ? 'Schrödinger Equation' : '薛定谔方程', latex: 'i\\hbar\\frac{\\partial}{\\partial t}\\Psi = \\hat{H}\\Psi'}
        ]
    };

    // 创建公式选择器界面
    const formulaSheet = document.createElement('div');
    formulaSheet.className = 'formula-picker-modal';
    formulaSheet.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.7);
        z-index: 2000;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
    `;

    // 创建选择器容器
    const formulaContainer = document.createElement('div');
    formulaContainer.style.cssText = `
        background: ${(window.nightMode === true) ? '#2d2d2d' : 'white'};
        border-radius: 12px;
        padding: 20px;
        width: 90%;
        max-width: 600px;
        max-height: 80vh;
        overflow: hidden;
        display: flex;
        flex-direction: column;
    `;


    // 创建标题
    const title = document.createElement('div');
    title.textContent = isEn() ? 'Insert LaTeX Formula' : '插入LaTeX公式';
    title.style.cssText = `
        font-size: 18px;
        font-weight: 600;
        margin-bottom: 8px;
        text-align: center;
        color: ${(window.nightMode === true) ? '#eee' : '#333'};
    `;
    formulaContainer.appendChild(title);

    // 创建搜索输入框
    const searchBox = document.createElement('input');
    searchBox.type = 'text';
    searchBox.placeholder = isEn() ? 'Search formula by keyword, symbol, or LaTeX...' : '输入关键词、符号或LaTeX搜索公式...';
    searchBox.style.cssText = `
        width: 100%;
        padding: 8px 12px;
        margin-bottom: 10px;
        border: 1px solid ${(window.nightMode === true) ? '#444' : '#ccc'};
        border-radius: 6px;
        font-size: 14px;
        background: ${(window.nightMode === true) ? '#222' : '#fafafa'};
        color: ${(window.nightMode === true) ? '#eee' : '#333'};
        outline: none;
        box-sizing: border-box;
    `;
    formulaContainer.appendChild(searchBox);

    // 创建分类标签
    const categoryTabs = document.createElement('div');
    categoryTabs.style.cssText = `
        display: flex;
        overflow-x: auto;
        padding: 10px 0;
        margin-bottom: 10px;
        border-bottom: 1px solid ${(window.nightMode === true) ? '#444' : '#eee'};
    `;

    // 创建符号网格容器
    const formulaGrid = document.createElement('div');
    formulaGrid.id = 'formulaGrid';
    formulaGrid.style.cssText = `
        display: grid;
        grid-template-columns: repeat(5, 1fr);
        gap: 8px;
        padding: 10px 0;
        overflow-y: auto;
        max-height: 300px;
        flex: 1;
    `;
    formulaContainer.appendChild(formulaGrid);

    // 创建底部按钮
    const bottomBar = document.createElement('div');
    bottomBar.style.cssText = `
        display: flex;
        justify-content: space-between;
        margin-top: 15px;
        padding-top: 15px;
        border-top: 1px solid ${(window.nightMode === true) ? '#444' : '#eee'};
    `;

    const insertBtn = document.createElement('button');
    insertBtn.textContent = isEn() ? 'Insert LaTeX' : '插入LaTeX';
    insertBtn.style.cssText = `
        padding: 10px 20px;
        background: #4a90e2;
        color: white;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-size: 14px;
    `;

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = isEn() ? 'Cancel' : '取消';
    cancelBtn.style.cssText = `
        padding: 10px 20px;
        background: ${(window.nightMode === true) ? '#444' : '#f5f5f5'};
        color: ${(window.nightMode === true) ? '#eee' : '#333'};
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-size: 14px;
    `;

    const wrapInDollarBtn = document.createElement('button');
    wrapInDollarBtn.textContent = isEn() ? 'Insert Inline' : '插入行内公式';
    wrapInDollarBtn.style.cssText = `
        padding: 10px 20px;
        background: #4a90e2;
        color: white;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-size: 14px;
        margin-left: 10px;
    `;

    const wrapInDoubleDollarBtn = document.createElement('button');
    wrapInDoubleDollarBtn.textContent = isEn() ? 'Insert Block' : '插入多行公式';
    wrapInDoubleDollarBtn.style.cssText = `
        padding: 10px 20px;
        background: #4a90e2;
        color: white;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-size: 14px;
        margin-left: 10px;
    `;

    const buttonGroup = document.createElement('div');
    buttonGroup.style.cssText = `
        display: flex;
        flex-wrap: wrap;
        gap: 5px;
    `;
    buttonGroup.appendChild(insertBtn);
    buttonGroup.appendChild(wrapInDollarBtn);
    buttonGroup.appendChild(wrapInDoubleDollarBtn);

    bottomBar.appendChild(buttonGroup);
    bottomBar.appendChild(cancelBtn);
    formulaContainer.appendChild(bottomBar);

    formulaSheet.appendChild(formulaContainer);
    document.body.appendChild(formulaSheet);

    let selectedFormula = null;


    // 分类标签和搜索结果标签
    let searchActive = false;
    function renderCategoryTabs() {
        categoryTabs.innerHTML = '';
        // 搜索时显示“搜索结果”标签
        if (searchActive) {
            const searchTab = document.createElement('button');
            searchTab.textContent = isEn() ? 'Search Results' : '搜索结果';
            searchTab.className = 'formula-tab';
            searchTab.style.cssText = `
                padding: 8px 12px;
                margin-right: 10px;
                border: none;
                background: #4a90e2;
                border-radius: 20px;
                white-space: nowrap;
                cursor: pointer;
                color: white;
                font-size: 12px;
                font-weight: 600;
            `;
            categoryTabs.appendChild(searchTab);
        } else {
            Object.keys(formulaCategories).forEach(category => {
                const tab = document.createElement('button');
                tab.textContent = category;
                tab.style.cssText = `
                    padding: 8px 12px;
                    margin-right: 10px;
                    border: none;
                    background: ${(window.nightMode === true) ? '#444' : '#f5f5f5'};
                    border-radius: 20px;
                    white-space: nowrap;
                    cursor: pointer;
                    color: ${(window.nightMode === true) ? '#eee' : '#333'};
                    font-size: 12px;
                `;
                tab.addEventListener('click', () => {
                    document.querySelectorAll('.formula-tab').forEach(t => {
                        t.style.background = (window.nightMode === true) ? '#444' : '#f5f5f5';
                        t.style.color = (window.nightMode === true) ? '#eee' : '#333';
                        t.style.fontWeight = 'normal';
                    });
                    tab.style.background = '#4a90e2';
                    tab.style.color = 'white';
                    tab.style.fontWeight = '600';
                    showFormulaCategory(category);
                });
                tab.className = 'formula-tab';
                categoryTabs.appendChild(tab);
            });
        }
    }

    formulaContainer.insertBefore(categoryTabs, formulaGrid);

    // 搜索和分类切换的渲染逻辑
    function showFormulaCategory(category) {
        formulaGrid.innerHTML = '';
        selectedFormula = null;
        let items = formulaCategories[category];
        renderFormulaGrid(items);
    }

    function renderFormulaGrid(items) {
        formulaGrid.innerHTML = '';
        selectedFormula = null;
        if (!items || items.length === 0) {
            const emptyMsg = document.createElement('div');
            emptyMsg.style.cssText = 'text-align:center;color:#888;padding:30px 0;grid-column: 1/-1;';
            
            // 获取当前搜索关键词
            const searchKeyword = searchBox.value.trim();
            
            // 创建提示文本
            const hintText = document.createElement('div');
            hintText.textContent = isEn() ? 'No matching formula found.' : '无匹配公式';
            hintText.style.cssText = 'margin-bottom: 10px;';
            emptyMsg.appendChild(hintText);
            
            // 创建AI搜索链接
            if (searchKeyword) {
                const aiSearchLink = document.createElement('a');
                aiSearchLink.href = 'javascript:void(0)';
                aiSearchLink.textContent = isEn() ? 'Try AI Search' : '试试AI搜索';
                aiSearchLink.style.cssText = 'color: #667eea; text-decoration: underline; cursor: pointer; font-size: 14px;';
                aiSearchLink.addEventListener('click', function() {
                    performAISearch(searchKeyword);
                });
                emptyMsg.appendChild(aiSearchLink);
            }
            
            formulaGrid.appendChild(emptyMsg);
            return;
        }
        items.forEach(item => {
            const symbolBtn = document.createElement('button');
            symbolBtn.innerHTML = `<span style="font-size: 16px;">${item.display}</span>`;
            symbolBtn.title = `LaTeX: ${item.latex}`;
            symbolBtn.style.cssText = `
                padding: 10px;
                border: 2px solid transparent;
                background: none;
                cursor: pointer;
                border-radius: 6px;
                transition: all 0.2s;
                display: flex;
                align-items: center;
                justify-content: center;
                font-family: 'Times New Roman', serif;
                color: ${(window.nightMode === true) ? '#fff' : '#333'};
                text-align: center;
                word-break: break-all;
                min-height: 60px;
                flex-direction: column;
            `;
            const latexPreview = document.createElement('div');
            latexPreview.textContent = item.latex;
            latexPreview.style.cssText = `
                font-size: 10px;
                color: ${(window.nightMode === true) ? '#aaa' : '#666'};
                margin-top: 5px;
                font-family: 'Courier New', monospace;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                max-width: 100%;
            `;
            symbolBtn.appendChild(latexPreview);
            symbolBtn.addEventListener('click', () => {
                document.querySelectorAll('#formulaGrid button').forEach(btn => {
                    btn.style.borderColor = 'transparent';
                    btn.style.background = 'none';
                });
                symbolBtn.style.borderColor = '#4a90e2';
                symbolBtn.style.background = (window.nightMode === true) ? 'rgba(74, 144, 226, 0.2)' : 'rgba(74, 144, 226, 0.1)';
                selectedFormula = item;
            });
            symbolBtn.addEventListener('mouseenter', function() {
                if (selectedFormula !== item) {
                    this.style.background = (window.nightMode === true) ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)';
                }
            });
            symbolBtn.addEventListener('mouseleave', function() {
                if (selectedFormula !== item) {
                    this.style.background = 'none';
                }
            });
            formulaGrid.appendChild(symbolBtn);
        });
    }

    // 搜索逻辑
    searchBox.addEventListener('input', function() {
        const q = this.value.trim().toLowerCase();
        if (!q) {
            searchActive = false;
            renderCategoryTabs();
            // 默认显示第一个分类
            const firstTab = categoryTabs.querySelector('.formula-tab');
            if (firstTab) firstTab.click();
            return;
        }
        // 搜索所有分类下所有公式
        let results = [];
        Object.values(formulaCategories).forEach(arr => {
            arr.forEach(item => {
                // 支持 display、latex、keywords 匹配
                let match = false;
                if (item.display && item.display.toLowerCase().includes(q)) match = true;
                else if (item.latex && item.latex.toLowerCase().includes(q)) match = true;
                else if (item.keywords && Array.isArray(item.keywords)) {
                    for (let kw of item.keywords) {
                        if (kw.toLowerCase().includes(q)) { match = true; break; }
                    }
                }
                if (match) results.push(item);
            });
        });
        searchActive = true;
        renderCategoryTabs();
        renderFormulaGrid(results);
    });

    // 初始渲染
    renderCategoryTabs();
    // 默认显示第一个分类
    if (!searchActive) {
        const firstTab = categoryTabs.querySelector('.formula-tab');
        if (firstTab) firstTab.click();
    }

    // 获取当前选中的公式（支持本地和AI搜索结果）
    function getSelectedFormula() {
        // 优先使用本地选中的公式
        if (selectedFormula) return selectedFormula;
        // 其次使用AI搜索结果选中的公式
        if (window.selectedFormula) return window.selectedFormula;
        return null;
    }

    // 插入按钮点击事件
    insertBtn.addEventListener('click', () => {
        const formula = getSelectedFormula();
        if (formula && vditor) {
            vditor.insertValue(formula.latex + '\n\n');
            closeFormulaPicker();
            showMessage(isEn() ? 'LaTeX formula inserted' : 'LaTeX公式已插入');
        } else {
            showMessage(isEn() ? 'Please select a formula first' : '请先选择一个公式', 'error');
        }
    });

    // 插入带$的公式
    wrapInDollarBtn.addEventListener('click', () => {
        const formula = getSelectedFormula();
        if (formula && vditor) {
            vditor.insertValue(`$${formula.latex}$` + '\n\n');
            closeFormulaPicker();
            showMessage(isEn() ? 'Inline formula inserted' : '行内公式已插入');
        } else {
            showMessage(isEn() ? 'Please select a formula first' : '请先选择一个公式', 'error');
        }
    });

    // 插入带$$的公式
    wrapInDoubleDollarBtn.addEventListener('click', () => {
        const formula = getSelectedFormula();
        if (formula && vditor) {
            vditor.insertValue(`$$${formula.latex}$$` + '\n\n');
            closeFormulaPicker();
            showMessage(isEn() ? 'Block formula inserted' : '块级公式已插入');
        } else {
            showMessage(isEn() ? 'Please select a formula first' : '请先选择一个公式', 'error');
        }
    });

    // 取消按钮点击事件
    cancelBtn.addEventListener('click', closeFormulaPicker);

    // 点击模态框外部关闭
    formulaSheet.addEventListener('click', (e) => {
        if (e.target === formulaSheet) {
            closeFormulaPicker();
        }
    });

    // 关闭公式选择器
    function closeFormulaPicker() {
        if (formulaSheet.parentNode) {
            formulaSheet.parentNode.removeChild(formulaSheet);
        }
        // 清理全局选中的公式
        window.selectedFormula = null;
    }

    // 添加键盘事件支持
    function handleKeydown(e) {
        if (e.key === 'Escape') {
            closeFormulaPicker();
            document.removeEventListener('keydown', handleKeydown);
        }
    }
    document.addEventListener('keydown', handleKeydown);
}

// AI搜索公式功能
async function performAISearch(keyword) {
    function isEn() { return window.i18n && window.i18n.getLanguage() === 'en'; }
    
    // 显示AI搜索加载状态
    const formulaGrid = document.getElementById('formulaGrid');
    if (!formulaGrid) return;
    
    formulaGrid.innerHTML = '';
    
    // 创建加载提示
    const loadingDiv = document.createElement('div');
    loadingDiv.style.cssText = 'text-align:center;padding:40px 0;grid-column: 1/-1;';
    
    const loadingIcon = document.createElement('div');
    loadingIcon.innerHTML = '<i class="fas fa-magic" style="font-size: 32px; color: #667eea;"></i>';
    loadingIcon.style.cssText = 'margin-bottom: 15px;';
    
    const loadingText = document.createElement('div');
    loadingText.textContent = isEn() ? 'AI is searching...' : 'AI搜索中...';
    loadingText.style.cssText = 'color: #667eea; font-size: 14px;';
    
    loadingDiv.appendChild(loadingIcon);
    loadingDiv.appendChild(loadingText);
    formulaGrid.appendChild(loadingDiv);
    
    try {
        // 调用AI接口搜索公式
        const apiUrl = (window.getApiBaseUrl ? window.getApiBaseUrl() : 'api') + '/ai/formula';
        
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + (window.currentUser ? (window.currentUser.token || window.currentUser.username) : '')
            },
            body: JSON.stringify({
                keyword: keyword,
                language: isEn() ? 'en' : 'zh'
            })
        });
        
        const result = await response.json();
        
        if (result.code === 200 && result.data) {
            // 解析AI返回的公式数据
            const aiFormulas = parseAIFormulaResponse(result.data);
            
            if (aiFormulas.length > 0) {
                // 显示AI搜索结果
                renderAIFormulaResults(aiFormulas, keyword);
            } else {
                // AI也没找到结果
                showAINoResult(keyword);
            }
        } else {
            // API调用失败，显示错误
            showAIError(result.message || (isEn() ? 'AI search failed' : 'AI搜索失败'));
        }
    } catch (error) {
        console.error('AI搜索错误:', error);
        showAIError(isEn() ? 'Network error, please try again' : '网络错误，请重试');
    }
}

// 解析AI返回的公式响应
function parseAIFormulaResponse(aiResponse) {
    const formulas = [];
    
    // 尝试解析JSON格式的响应
    try {
        // 如果AI返回的是JSON数组
        const parsed = JSON.parse(aiResponse);
        if (Array.isArray(parsed)) {
            return parsed.map(item => ({
                display: item.display || item.name || item.latex,
                latex: item.latex || item.formula || item.code,
                description: item.description || ''
            }));
        }
    } catch (e) {
        // 不是JSON格式，尝试按行解析
    }
    
    // 尝试按常见格式解析文本响应
    // 格式1: display | latex
    // 格式2: display: latex
    const lines = aiResponse.split('\n').filter(line => line.trim());
    
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        
        // 跳过说明性文字
        if (trimmed.startsWith('以下是') || trimmed.startsWith('Here are') || 
            trimmed.startsWith('这是') || trimmed.startsWith('These are')) {
            continue;
        }
        
        let display = '';
        let latex = '';
        
        // 尝试匹配 | 分隔符
        if (trimmed.includes('|')) {
            const parts = trimmed.split('|').map(p => p.trim());
            if (parts.length >= 2) {
                display = parts[0];
                latex = parts[1];
            }
        }
        // 尝试匹配 : 分隔符
        else if (trimmed.includes(':')) {
            const parts = trimmed.split(':').map(p => p.trim());
            if (parts.length >= 2) {
                display = parts[0];
                latex = parts[1];
            }
        }
        // 尝试匹配 LaTeX 代码（以 \ 开头）
        else if (trimmed.includes('\\')) {
            const latexMatch = trimmed.match(/(\\[a-zA-Z]+(?:\{[^}]*\})*)/);
            if (latexMatch) {
                latex = latexMatch[1];
                display = trimmed.replace(latex, '').trim() || latex;
            } else {
                latex = trimmed;
                display = trimmed;
            }
        }
        // 默认情况
        else {
            display = trimmed;
            latex = trimmed;
        }
        
        if (latex) {
            formulas.push({
                display: display || latex,
                latex: latex,
                description: ''
            });
        }
    }
    
    return formulas;
}

// 显示AI搜索结果
function renderAIFormulaResults(formulas, keyword) {
    function isEn() { return window.i18n && window.i18n.getLanguage() === 'en'; }
    
    const formulaGrid = document.getElementById('formulaGrid');
    if (!formulaGrid) return;
    
    formulaGrid.innerHTML = '';
    
    // 添加AI搜索结果标题
    const resultHeader = document.createElement('div');
    resultHeader.style.cssText = 'grid-column: 1/-1; padding: 10px 0; border-bottom: 1px solid #eee; margin-bottom: 10px;';
    resultHeader.innerHTML = `<span style="color: #667eea; font-weight: bold;">${isEn() ? 'AI Search Results' : 'AI搜索结果'}</span> <span style="color: #888; font-size: 12px;">"${keyword}"</span>`;
    formulaGrid.appendChild(resultHeader);
    
    // 渲染公式列表
    formulas.forEach(item => {
        const symbolBtn = document.createElement('button');
        symbolBtn.innerHTML = `<span style="font-size: 16px;">${item.display}</span>`;
        symbolBtn.title = `LaTeX: ${item.latex}`;
        symbolBtn.style.cssText = `
            padding: 10px;
            border: 2px solid transparent;
            background: none;
            cursor: pointer;
            border-radius: 6px;
            transition: all 0.2s;
            display: flex;
            align-items: center;
            justify-content: center;
            font-family: 'Times New Roman', serif;
            color: ${(window.nightMode === true) ? '#fff' : '#333'};
            text-align: center;
            word-break: break-all;
            min-height: 60px;
            flex-direction: column;
        `;
        
        const latexPreview = document.createElement('div');
        latexPreview.textContent = item.latex;
        latexPreview.style.cssText = `
            font-size: 10px;
            color: ${(window.nightMode === true) ? '#aaa' : '#666'};
            margin-top: 5px;
            font-family: 'Courier New', monospace;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            max-width: 100%;
        `;
        symbolBtn.appendChild(latexPreview);
        
        // 点击选择公式
        symbolBtn.addEventListener('click', () => {
            document.querySelectorAll('#formulaGrid button').forEach(btn => {
                btn.style.borderColor = 'transparent';
                btn.style.background = 'none';
            });
            symbolBtn.style.borderColor = '#667eea';
            symbolBtn.style.background = (window.nightMode === true) ? 'rgba(102, 126, 234, 0.2)' : 'rgba(102, 126, 234, 0.1)';
            
            // 保存选中的公式到全局变量供插入按钮使用
            window.selectedFormula = item;
        });
        
        symbolBtn.addEventListener('mouseenter', function() {
            if (window.selectedFormula !== item) {
                this.style.background = (window.nightMode === true) ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)';
            }
        });
        
        symbolBtn.addEventListener('mouseleave', function() {
            if (window.selectedFormula !== item) {
                this.style.background = 'none';
            }
        });
        
        formulaGrid.appendChild(symbolBtn);
    });
    
    // 添加返回提示
    const backHint = document.createElement('div');
    backHint.style.cssText = 'grid-column: 1/-1; text-align: center; padding: 10px 0; font-size: 12px; color: #888;';
    backHint.textContent = isEn() ? 'Click a formula to select it, then use the buttons below to insert' : '点击公式选择，然后使用下方按钮插入';
    formulaGrid.appendChild(backHint);
}

// 显示AI无结果
function showAINoResult(keyword) {
    function isEn() { return window.i18n && window.i18n.getLanguage() === 'en'; }
    
    const formulaGrid = document.getElementById('formulaGrid');
    if (!formulaGrid) return;
    
    formulaGrid.innerHTML = '';
    
    const emptyMsg = document.createElement('div');
    emptyMsg.style.cssText = 'text-align:center;color:#888;padding:30px 0;grid-column: 1/-1;';
    emptyMsg.innerHTML = `
        <div style="margin-bottom: 10px;">${isEn() ? 'AI could not find matching formulas' : 'AI未找到匹配的公式'}</div>
        <div style="font-size: 12px; color: #aaa;">${isEn() ? 'Try different keywords' : '请尝试其他关键词'}</div>
    `;
    formulaGrid.appendChild(emptyMsg);
}

// 显示AI错误
function showAIError(errorMessage) {
    function isEn() { return window.i18n && window.i18n.getLanguage() === 'en'; }
    
    const formulaGrid = document.getElementById('formulaGrid');
    if (!formulaGrid) return;
    
    formulaGrid.innerHTML = '';
    
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = 'text-align:center;color:#dc3545;padding:30px 0;grid-column: 1/-1;';
    errorDiv.innerHTML = `
        <div style="margin-bottom: 10px;"><i class="fas fa-exclamation-circle"></i></div>
        <div>${errorMessage}</div>
    `;
    formulaGrid.appendChild(errorDiv);
}

// 导出函数到全局对象
if (typeof window !== 'undefined') {
    window.showFormulaPicker = showFormulaPicker;
}
