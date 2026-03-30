// 公式选择器
function showFormulaPicker() {
    function isEn() { return window.i18n && window.i18n.getLanguage() === 'en'; }

    // 增强的LaTeX公式分类 - 包含完整的中英文关键词支持
    const formulaCategories = {
        [isEn() ? 'Basic Operations' : '基础运算']: [
            {display: '+', latex: '+', keywords: ['加', 'plus', 'add', 'jia', '加法', 'addition']},
            {display: '-', latex: '-', keywords: ['减', 'minus', 'subtract', 'jian', '减法', 'subtraction']},
            {display: '×', latex: '\\times', keywords: ['乘', 'times', 'multiply', 'cheng', '乘法', 'multiplication']},
            {display: '÷', latex: '\\div', keywords: ['除', 'div', 'divide', 'chu', '除法', 'division']},
            {display: '=', latex: '=', keywords: ['等于', 'equal', 'equals', 'dengyu', '等号', 'equality']},
            {display: '≠', latex: '\\neq', keywords: ['不等于', 'not equal', 'neq', 'budengyu', '不等号', 'inequality']},
            {display: '≈', latex: '\\approx', keywords: ['约等于', 'approx', 'approximately', 'yuedengyu', '约等', 'approximate']},
            {display: '±', latex: '\\pm', keywords: ['正负', 'plus minus', 'pm', 'zhengfu', '加减']},
            {display: '∓', latex: '\\mp', keywords: ['负正', 'minus plus', 'mp', 'fuzheng', '减加']},
            {display: '⋅', latex: '\\cdot', keywords: ['点乘', 'cdot', 'dot', 'diancheng', '内积', '点积', 'dot product']},
            {display: '∗', latex: '\\ast', keywords: ['星号', 'ast', 'asterisk', 'xinghao', '星乘']},
            {display: '⋆', latex: '\\star', keywords: ['星', 'star', 'xing', '五角星']},
            {display: '⊕', latex: '\\oplus', keywords: ['直和', 'oplus', 'direct sum', 'zhihe', '异或', 'xor']},
            {display: '⊗', latex: '\\otimes', keywords: ['张量积', 'otimes', 'tensor', 'zhangliang', '克罗内克积', 'kronecker']},
            {display: '†', latex: '\\dagger', keywords: [' dagger', '共轭转置', 'dagger', 'gongezhi', '埃尔米特']},
            {display: '‡', latex: '\\ddagger', keywords: ['双 dagger', 'ddagger', 'shuang']}
        ],
        [isEn() ? 'Relational Symbols' : '关系符号']: [
            {display: '<', latex: '<', keywords: ['小于', 'less', 'less than', 'xiaoyu', '小于号']},
            {display: '>', latex: '>', keywords: ['大于', 'greater', 'greater than', 'dayu', '大于号']},
            {display: '≤', latex: '\\leq', keywords: ['小于等于', 'less equal', 'leq', 'xiaoyudengyu', '小于等于号', 'less than or equal']},
            {display: '≥', latex: '\\geq', keywords: ['大于等于', 'greater equal', 'geq', 'dayudengyu', '大于等于号', 'greater than or equal']},
            {display: '≦', latex: '\\leqq', keywords: ['小于等于', 'leqq', 'less equal', 'xiaoyudengyu']},
            {display: '≧', latex: '\\geqq', keywords: ['大于等于', 'geqq', 'greater equal', 'dayudengyu']},
            {display: '≪', latex: '\\ll', keywords: ['远小于', 'much less', 'll', 'yuanxiaoyu', '远小于号']},
            {display: '≫', latex: '\\gg', keywords: ['远大于', 'much greater', 'gg', 'yuandayu', '远大于号']},
            {display: '≡', latex: '\\equiv', keywords: ['恒等于', 'equivalent', 'equiv', 'hengdengyu', '恒等', '恒等号', 'identical']},
            {display: '≢', latex: '\\not\\equiv', keywords: ['不恒等于', 'not equivalent', 'not equiv', 'buhengdengyu', '不恒等']},
            {display: '∼', latex: '\\sim', keywords: ['相似', 'similar', 'sim', 'xiangsi', '波浪号', 'tilde']},
            {display: '≃', latex: '\\simeq', keywords: ['近似等于', 'simeq', 'similar equal', 'jinsidengyu']},
            {display: '≅', latex: '\\cong', keywords: ['全等', 'congruent', 'cong', 'quandeng', '全等于', '全等号']},
            {display: '≈', latex: '\\approx', keywords: ['约等于', 'approx', 'approximately', 'yuedengyu', '约等']},
            {display: '≉', latex: '\\not\\approx', keywords: ['不约等于', 'not approx', 'buyuedengyu']},
            {display: '∝', latex: '\\propto', keywords: ['正比', 'proportional', 'propto', 'zhengbi', '正比于', '比例']},
            {display: '≺', latex: '\\prec', keywords: ['先于', 'prec', 'precedes', 'xianyu', '偏序']},
            {display: '≻', latex: '\\succ', keywords: ['后于', 'succ', 'succeeds', 'houyu']},
            {display: '≼', latex: '\\preceq', keywords: ['先于等于', 'preceq', 'precedes equal', 'xianyudengyu']},
            {display: '≽', latex: '\\succeq', keywords: ['后于等于', 'succeq', 'succeeds equal', 'houyudengyu']},
            {display: '⊏', latex: '\\sqsubset', keywords: ['方形子集', 'sqsubset', 'square subset', 'fangxingziji']},
            {display: '⊐', latex: '\\sqsupset', keywords: ['方形超集', 'sqsupset', 'square superset', 'fangxingchaoji']},
            {display: '⊑', latex: '\\sqsubseteq', keywords: ['方形子集等于', 'sqsubseteq', 'square subseteq', 'fangxingzijidengyu']},
            {display: '⊒', latex: '\\sqsupseteq', keywords: ['方形超集等于', 'sqsupseteq', 'square superseteq', 'fangxingchaojidengyu']}
        ],
        [isEn() ? 'Set Symbols' : '集合符号']: [
            {display: '∈', latex: '\\in', keywords: ['属于', 'in', 'element', 'shuyu', '属于符号', 'member']},
            {display: '∉', latex: '\\notin', keywords: ['不属于', 'not in', 'notin', 'bushuyu', '不属于符号']},
            {display: '∋', latex: '\\ni', keywords: ['包含', 'ni', 'contains', 'baohan', '包含元素']},
            {display: '∌', latex: '\\not\\ni', keywords: ['不包含', 'not ni', 'notni', 'bubaohan']},
            {display: '⊂', latex: '\\subset', keywords: ['真子集', 'subset', 'proper subset', 'zhenziji', '子集', '包含于']},
            {display: '⊃', latex: '\\supset', keywords: ['真超集', 'superset', 'proper superset', 'zhenchaoji', '超集', '包含']},
            {display: '⊆', latex: '\\subseteq', keywords: ['子集', 'subseteq', 'subset equal', 'ziji', '子集等于']},
            {display: '⊇', latex: '\\supseteq', keywords: ['超集', 'superseteq', 'superset equal', 'chaoji', '超集等于']},
            {display: '⊄', latex: '\\not\\subset', keywords: ['非子集', 'not subset', 'feiziji']},
            {display: '⊅', latex: '\\not\\supset', keywords: ['非超集', 'not superset', 'feichaoji']},
            {display: '⊈', latex: '\\nsubseteq', keywords: ['非子集等于', 'nsubseteq', 'not subseteq', 'feizijidengyu']},
            {display: '⊉', latex: '\\nsupseteq', keywords: ['非超集等于', 'nsupseteq', 'not superseteq', 'feichaojidengyu']},
            {display: '∪', latex: '\\cup', keywords: ['并集', 'union', 'cup', 'bingji', '并', '联合']},
            {display: '∩', latex: '\\cap', keywords: ['交集', 'intersection', 'cap', 'jiaoji', '交', '共同']},
            {display: '∖', latex: '\\setminus', keywords: ['差集', 'setminus', 'difference', 'chaji', '集合差']},
            {display: '△', latex: '\\triangle', keywords: ['对称差', 'triangle', 'symmetric difference', 'duichencha', '三角']},
            {display: '⊎', latex: '\\uplus', keywords: ['多重并', 'uplus', 'disjoint union', 'duochongbing']},
            {display: '∅', latex: '\\emptyset', keywords: ['空集', 'empty set', 'emptyset', 'kongji', '空集合', 'null']},
            {display: 'ℵ', latex: '\\aleph', keywords: ['阿列夫', 'aleph', 'alef', 'aliefu', '无穷基数']},
            {display: 'ℶ', latex: '\\beth', keywords: ['贝斯', 'beth', 'beisi', '连续统基数']},
            {display: '∀', latex: '\forall', keywords: ['任意', 'for all', 'forall', 'renyi', '全称量词', 'universal']},
            {display: '∃', latex: '\\exists', keywords: ['存在', 'exists', 'cunzai', '存在量词', 'existential']},
            {display: '∄', latex: '\\nexists', keywords: ['不存在', 'not exists', 'nexists', 'bucunzai']},
            {display: '∞', latex: '\\infty', keywords: ['无穷', 'infinity', 'infty', 'wuqiong', '无穷大', '无限']}
        ],
        [isEn() ? 'Greek Letters' : '希腊字母']: [
            {display: 'α', latex: '\\alpha', keywords: ['阿尔法', 'alpha', 'aerfa', '希腊字母a']},
            {display: 'β', latex: '\\beta', keywords: ['贝塔', 'beta', 'beita', '希腊字母b']},
            {display: 'γ', latex: '\\gamma', keywords: ['伽马', 'gamma', 'gama', '希腊字母g']},
            {display: 'δ', latex: '\\delta', keywords: ['德尔塔', 'delta', 'deerta', '希腊字母d']},
            {display: 'ε', latex: '\\epsilon', keywords: ['艾普西隆', 'epsilon', 'epsilon', '希腊字母e']},
            {display: 'ζ', latex: '\\zeta', keywords: ['泽塔', 'zeta', 'zeta', '希腊字母z']},
            {display: 'η', latex: '\\eta', keywords: ['伊塔', 'eta', 'yita', '希腊字母h']},
            {display: 'θ', latex: '\\theta', keywords: ['西塔', 'theta', 'theta', '希腊字母th']},
            {display: 'ι', latex: '\\iota', keywords: ['约塔', 'iota', 'yota', '希腊字母i']},
            {display: 'κ', latex: '\\kappa', keywords: ['卡帕', 'kappa', 'kapa', '希腊字母k']},
            {display: 'λ', latex: '\\lambda', keywords: ['拉姆达', 'lambda', 'lambda', '希腊字母l', '波长']},
            {display: 'μ', latex: '\\mu', keywords: ['缪', 'mu', 'miu', '希腊字母m', '微', '均值']},
            {display: 'ν', latex: '\\nu', keywords: ['纽', 'nu', 'niu', '希腊字母n', '频率']},
            {display: 'ξ', latex: '\\xi', keywords: ['克西', 'xi', 'xi', '希腊字母x']},
            {display: 'ο', latex: '\\omicron', keywords: ['奥密克戎', 'omicron', 'omikelong', '希腊字母o']},
            {display: 'π', latex: '\\pi', keywords: ['派', 'pi', 'pai', '希腊字母p', '圆周率']},
            {display: 'ρ', latex: '\\rho', keywords: ['柔', 'rho', 'rou', '希腊字母r', '密度']},
            {display: 'σ', latex: '\\sigma', keywords: ['西格玛', 'sigma', 'sigma', '希腊字母s', '求和', '标准差']},
            {display: 'τ', latex: '\\tau', keywords: ['陶', 'tau', 'tao', '希腊字母t']},
            {display: 'υ', latex: '\\upsilon', keywords: ['宇普西隆', 'upsilon', 'ypsilong', '希腊字母u']},
            {display: 'φ', latex: '\\phi', keywords: ['斐', 'phi', 'fei', '希腊字母ph', '黄金比例']},
            {display: 'χ', latex: '\\chi', keywords: ['喜', 'chi', 'xi', '希腊字母ch']},
            {display: 'ψ', latex: '\\psi', keywords: ['普西', 'psi', 'psi', '希腊字母ps']},
            {display: 'ω', latex: '\\omega', keywords: ['欧米伽', 'omega', 'omeiga', '希腊字母o', '角速度']},
            {display: 'Γ', latex: '\\Gamma', keywords: ['大写伽马', 'Gamma', 'Gamma', '希腊字母G']},
            {display: 'Δ', latex: '\\Delta', keywords: ['大写德尔塔', 'Delta', 'Delta', '希腊字母D', '差分', '拉普拉斯']},
            {display: 'Θ', latex: '\\Theta', keywords: ['大写西塔', 'Theta', 'Theta', '希腊字母Th']},
            {display: 'Λ', latex: '\\Lambda', keywords: ['大写拉姆达', 'Lambda', 'Lambda', '希腊字母L']},
            {display: 'Ξ', latex: '\\Xi', keywords: ['大写克西', 'Xi', 'Xi', '希腊字母X']},
            {display: 'Π', latex: '\\Pi', keywords: ['大写派', 'Pi', 'Pi', '希腊字母P', '连乘']},
            {display: 'Σ', latex: '\\Sigma', keywords: ['大写西格玛', 'Sigma', 'Sigma', '希腊字母S', '求和', 'sigma']},
            {display: 'Υ', latex: '\\Upsilon', keywords: ['大写宇普西隆', 'Upsilon', 'Ypsilon', '希腊字母U']},
            {display: 'Φ', latex: '\\Phi', keywords: ['大写斐', 'Phi', 'Fei', '希腊字母Ph']},
            {display: 'Ψ', latex: '\\Psi', keywords: ['大写普西', 'Psi', 'Psi', '希腊字母Ps']},
            {display: 'Ω', latex: '\\Omega', keywords: ['大写欧米伽', 'Omega', 'Omega', '希腊字母O', '欧姆']}
        ],
        [isEn() ? 'Calculus' : '微积分']: [
            {display: '∫', latex: '\\int', keywords: ['积分', 'integral', 'int', 'jifen', '不定积分', 'integration']},
            {display: '∮', latex: '\\oint', keywords: ['环路积分', 'contour integral', 'oint', 'huanlujifen', '围道积分']},
            {display: '∬', latex: '\\iint', keywords: ['二重积分', 'double integral', 'iint', 'erchongjifen', '面积分']},
            {display: '∭', latex: '\\iiint', keywords: ['三重积分', 'triple integral', 'iiint', 'sanchongjifen', '体积分']},
            {display: '⨌', latex: '\\iiiint', keywords: ['四重积分', 'quadruple integral', 'iiiint', 'sichongjifen']},
            {display: '∂', latex: '\\partial', keywords: ['偏导', 'partial', 'piandao', '偏微分', 'partial derivative']},
            {display: '∇', latex: '\\nabla', keywords: ['纳布拉', 'nabla', 'nabla', '梯度', '散度', '旋度', 'del']},
            {display: '∆', latex: '\\Delta', keywords: ['增量', 'delta', 'Delta', 'zengliang', '拉普拉斯', 'laplacian']},
            {display: '∑', latex: '\\sum', keywords: ['求和', 'sum', 'summation', 'qiuhe', '求和符号', 'sigma', '西格玛']},
            {display: '∏', latex: '\\prod', keywords: ['求积', 'product', 'prod', 'qiuji', '连乘', '乘积']},
            {display: '∐', latex: '\\coprod', keywords: ['余积', 'coproduct', 'coprod', 'yuji', '余求积']},
            {display: 'lim', latex: '\\lim_{x \\to a}', keywords: ['极限', 'limit', 'lim', 'jixian', '趋近']},
            {display: 'sup', latex: '\\sup', keywords: ['上确界', 'supremum', 'sup', 'shangquejie']},
            {display: 'inf', latex: '\\inf', keywords: ['下确界', 'infimum', 'inf', 'xiaquejie']},
            {display: 'max', latex: '\\max', keywords: ['最大值', 'maximum', 'max', 'zuidazhi', '最大']},
            {display: 'min', latex: '\\min', keywords: ['最小值', 'minimum', 'min', 'zuixiaozhi', '最小']},
            {display: 'argmax', latex: '\\arg\\max', keywords: ['最大参数', 'argmax', 'arg max', 'zuidacanshu']},
            {display: 'argmin', latex: '\\arg\\min', keywords: ['最小参数', 'argmin', 'arg min', 'zuixiaocanshu']},
            {display: 'dx', latex: '\\,dx', keywords: ['dx', '微分', 'differential', 'weifen']},
            {display: 'dy/dx', latex: '\\frac{dy}{dx}', keywords: ['导数', 'derivative', 'dy dx', 'daoshu', '微分']},
            {display: 'd²y/dx²', latex: '\\frac{d^2y}{dx^2}', keywords: ['二阶导数', 'second derivative', 'erjiedaoshu']},
            {display: '∂f/∂x', latex: '\\frac{\\partial f}{\\partial x}', keywords: ['偏导数', 'partial derivative', 'piandaoshu']},
            {display: '∫ₐᵇ', latex: '\\int_{a}^{b}', keywords: ['定积分', 'definite integral', 'dingjifen', '积分上下限']},
            {display: '∫ f(x) dx', latex: '\\int f(x) \\,dx', keywords: ['积分公式', 'integral formula', 'jifengongshi']}
        ],
        [isEn() ? 'Logic Symbols' : '逻辑符号']: [
            {display: '∀', latex: '\\forall', keywords: ['任意', 'for all', 'forall', 'renyi', '全称量词', 'universal quantifier']},
            {display: '∃', latex: '\\exists', keywords: ['存在', 'exists', 'cunzai', '存在量词', 'existential quantifier']},
            {display: '∄', latex: '\\nexists', keywords: ['不存在', 'not exists', 'nexists', 'bucunzai']},
            {display: '∧', latex: '\\wedge', keywords: ['与', 'and', 'wedge', 'yu', '逻辑与', '合取', 'conjunction']},
            {display: '∨', latex: '\\vee', keywords: ['或', 'or', 'vee', 'huo', '逻辑或', '析取', 'disjunction']},
            {display: '¬', latex: '\\neg', keywords: ['非', 'not', 'neg', 'fei', '逻辑非', '否定', 'negation']},
            {display: '⇒', latex: '\\Rightarrow', keywords: ['蕴含', 'implies', 'Rightarrow', 'yinhan', '推出', 'implication']},
            {display: '⇐', latex: '\\Leftarrow', keywords: ['被蕴含', 'implied by', 'Leftarrow', 'beiyinhan']},
            {display: '⇔', latex: '\\Leftrightarrow', keywords: ['等价', 'iff', 'Leftrightarrow', 'dengjia', '当且仅当', '等价于', 'biconditional']},
            {display: '⊢', latex: '\\vdash', keywords: ['推出', 'turnstile', 'vdash', 'tuichu', '语法推出']},
            {display: '⊨', latex: '\\vDash', keywords: ['满足', 'models', 'vDash', 'manzu', '语义满足']},
            {display: '⊤', latex: '\\top', keywords: ['真', 'true', 'top', 'zhen', '恒真', 'tautology']},
            {display: '⊥', latex: '\\bot', keywords: ['假', 'false', 'bot', 'jia', '恒假', '矛盾']},
            {display: '∴', latex: '\\therefore', keywords: ['所以', 'therefore', 'yinshi', '所以符号']},
            {display: '∵', latex: '\\because', keywords: ['因为', 'because', 'yinwei', '因为符号']},
            {display: '∎', latex: '\\blacksquare', keywords: ['证毕', 'qed', 'blacksquare', 'zhengbi', '结束符']},
            {display: '□', latex: '\\square', keywords: ['方框', 'square', 'fangkuang', '待证']},
            {display: '⊕', latex: '\\oplus', keywords: ['异或', 'xor', 'oplus', 'yihuo', '逻辑异或', 'exclusive or']}
        ],
        [isEn() ? 'Arrow Symbols' : '箭头符号']: [
            {display: '→', latex: '\\to', keywords: ['箭头', 'to', 'arrow', 'jiantou', '右箭头', '映射', 'rightarrow']},
            {display: '←', latex: '\\leftarrow', keywords: ['左箭头', 'left arrow', 'leftarrow', 'zuojiantou']},
            {display: '↔', latex: '\\leftrightarrow', keywords: ['双向箭头', 'leftrightarrow', 'shuangxiangjiantou', '等价']},
            {display: '↦', latex: '\\mapsto', keywords: ['映射', 'mapsto', 'yingshe', '映射箭头']},
            {display: '⇒', latex: '\\Rightarrow', keywords: ['双箭头', 'Rightarrow', 'shuangjiantou', '推出']},
            {display: '⇐', latex: '\\Leftarrow', keywords: ['左双箭头', 'Leftarrow', 'zuoshuangjiantou']},
            {display: '⇔', latex: '\\Leftrightarrow', keywords: ['双向双箭头', 'Leftrightarrow', 'shuangxiangshuangjiantou', '等价']},
            {display: '⇑', latex: '\\Uparrow', keywords: ['上双箭头', 'Uparrow', 'shangshuangjiantou']},
            {display: '⇓', latex: '\\Downarrow', keywords: ['下双箭头', 'Downarrow', 'xiashuangjiantou']},
            {display: '↑', latex: '\\uparrow', keywords: ['上箭头', 'up arrow', 'uparrow', 'shangjiantou']},
            {display: '↓', latex: '\\downarrow', keywords: ['下箭头', 'down arrow', 'downarrow', 'xiajiantou']},
            {display: '↗', latex: '\\nearrow', keywords: ['右上箭头', 'nearrow', 'youshangjiantou', '东北箭头']},
            {display: '↘', latex: '\\searrow', keywords: ['右下箭头', 'searrow', 'youxiajiantou', '东南箭头']},
            {display: '↙', latex: '\\swarrow', keywords: ['左下箭头', 'swarrow', 'zuoxiajiantou', '西南箭头']},
            {display: '↖', latex: '\\nwarrow', keywords: ['左上箭头', 'nwarrow', 'zuoshangjiantou', '西北箭头']},
            {display: '⟶', latex: '\\longrightarrow', keywords: ['长右箭头', 'longrightarrow', 'changyoujiantou']},
            {display: '⟵', latex: '\\longleftarrow', keywords: ['长左箭头', 'longleftarrow', 'changzuojiantou']},
            {display: '⟹', latex: '\\Longrightarrow', keywords: ['长双右箭头', 'Longrightarrow', 'changshuangyoujiantou']},
            {display: '⟸', latex: '\\Longleftarrow', keywords: ['长双左箭头', 'Longleftarrow', 'changshuangzuojiantou']},
            {display: '⟺', latex: '\\Longleftrightarrow', keywords: ['长双向双箭头', 'Longleftrightarrow', 'changshuangxiangshuangjiantou']},
            {display: '↪', latex: '\\hookrightarrow', keywords: ['钩箭头', 'hookrightarrow', 'goujiantou', '单射']},
            {display: '↩', latex: '\\hookleftarrow', keywords: ['左钩箭头', 'hookleftarrow', 'zuogoujiantou']},
            {display: '⇝', latex: '\\leadsto', keywords: ['波浪箭头', 'leadsto', 'bolangjiantou']},
            {display: '↠', latex: '\\twoheadrightarrow', keywords: ['双头箭头', 'twoheadrightarrow', 'shuangtoujiantou', '满射']},
            {display: '⇢', latex: '\\dashrightarrow', keywords: ['虚线箭头', 'dashrightarrow', 'xuxianjiantou']},
            {display: '⇠', latex: '\\dashleftarrow', keywords: ['左虚线箭头', 'dashleftarrow', 'zuoxuxianjiantou']}
        ],
        [isEn() ? 'Geometry Symbols' : '几何符号']: [
            {display: '∠', latex: '\\angle', keywords: ['角', 'angle', 'jiao', '角度']},
            {display: '∡', latex: '\\measuredangle', keywords: ['测量角', 'measured angle', 'measuredangle', 'celiangjiao']},
            {display: '∢', latex: '\\sphericalangle', keywords: ['球面角', 'spherical angle', 'sphericalangle', 'qiumianjiao']},
            {display: '⊥', latex: '\\perp', keywords: ['垂直', 'perpendicular', 'perp', 'chuizhi', '正交']},
            {display: '∥', latex: '\\parallel', keywords: ['平行', 'parallel', 'pingxing', '平行线']},
            {display: '∦', latex: '\\nparallel', keywords: ['不平行', 'not parallel', 'nparallel', 'bupingxing']},
            {display: '≅', latex: '\\cong', keywords: ['全等', 'congruent', 'cong', 'quandeng', '全等于']},
            {display: '∼', latex: '\\sim', keywords: ['相似', 'similar', 'sim', 'xiangsi', '相似于']},
            {display: '≁', latex: '\\nsim', keywords: ['不相似', 'not similar', 'nsim', 'buxiangsi']},
            {display: '≃', latex: '\\simeq', keywords: ['相似等于', 'simeq', 'xiangsidengyu']},
            {display: '∽', latex: '\\backsim', keywords: ['反向相似', 'backsim', 'fanxiangxiangsi']},
            {display: '∝', latex: '\\propto', keywords: ['正比', 'proportional', 'propto', 'zhengbi', '正比于']},
            {display: '∘', latex: '\\circ', keywords: ['度', 'degree', 'circ', 'du', '度符号', '圆圈']},
            {display: '•', latex: '\\bullet', keywords: ['点', 'bullet', 'dian', '圆点', 'bullet point']},
            {display: '⊙', latex: '\\odot', keywords: ['圆点', 'odot', 'yuandian', '圆心']},
            {display: '⊚', latex: '\\circledcirc', keywords: ['双圆', 'circledcirc', 'shuangyuan']},
            {display: '⊕', latex: '\\oplus', keywords: ['圆加', 'oplus', 'yuanjia']},
            {display: '⊗', latex: '\\otimes', keywords: ['圆乘', 'otimes', 'yuancheng']},
            {display: '△', latex: '\\triangle', keywords: ['三角形', 'triangle', 'sanjiaoxing', 'delta']},
            {display: '□', latex: '\\square', keywords: ['正方形', 'square', 'zhengfangxing', '方框']},
            {display: '▭', latex: '\\rectangle', keywords: ['矩形', 'rectangle', 'juxing']},
            {display: '◊', latex: '\\lozenge', keywords: ['菱形', 'lozenge', 'diamond', 'lingxing']},
            {display: '★', latex: '\\bigstar', keywords: ['五角星', 'bigstar', 'wujiaoxing', '星']},
            {display: '⌒', latex: '\\frown', keywords: ['弧', 'frown', 'hu', '圆弧']},
            {display: '⌢', latex: '\\smile', keywords: ['微笑弧', 'smile', 'weixiao', '弧']}
        ],
        [isEn() ? 'Fractions & Exponents' : '分数指数']: [
            {display: '½', latex: '\\frac{1}{2}', keywords: ['二分之一', 'half', 'one half', 'erfenzhi', '分数']},
            {display: '⅓', latex: '\\frac{1}{3}', keywords: ['三分之一', 'one third', 'sanfenzhi', '分数']},
            {display: '¼', latex: '\\frac{1}{4}', keywords: ['四分之一', 'one quarter', 'sifenzhi', '分数']},
            {display: '⅕', latex: '\\frac{1}{5}', keywords: ['五分之一', 'one fifth', 'wufenzhi', '分数']},
            {display: '⅙', latex: '\\frac{1}{6}', keywords: ['六分之一', 'one sixth', 'liufenzhi', '分数']},
            {display: '⅐', latex: '\\frac{1}{7}', keywords: ['七分之一', 'one seventh', 'qifenzhi', '分数']},
            {display: '⅛', latex: '\\frac{1}{8}', keywords: ['八分之一', 'one eighth', 'bafenzhi', '分数']},
            {display: '⅑', latex: '\\frac{1}{9}', keywords: ['九分之一', 'one ninth', 'jiufenzhi', '分数']},
            {display: '⅒', latex: '\\frac{1}{10}', keywords: ['十分之一', 'one tenth', 'shifenzhi', '分数']},
            {display: '⅔', latex: '\\frac{2}{3}', keywords: ['三分之二', 'two thirds', 'sanfenzhi', '分数']},
            {display: '¾', latex: '\\frac{3}{4}', keywords: ['四分之三', 'three quarters', 'sifenzhi', '分数']},
            {display: '√', latex: '\\sqrt{}', keywords: ['根号', 'sqrt', 'square root', 'genhao', '平方根']},
            {display: '∛', latex: '\\sqrt[3]{}', keywords: ['立方根', 'cube root', 'cbrt', 'lifanggen', '三次根']},
            {display: '∜', latex: '\\sqrt[4]{}', keywords: ['四次根', 'fourth root', 'sicigen']},
            {display: 'ⁿ', latex: '^{n}', keywords: ['n次方', 'power n', 'ncifang', '指数', 'exponent']},
            {display: 'a/b', latex: '\\frac{a}{b}', keywords: ['分数', 'fraction', 'fenshu', '分式']},
            {display: 'aⁿ', latex: 'a^{n}', keywords: ['a的n次方', 'a to the n', 'acifang', '幂', 'power']},
            {display: 'aₙ', latex: 'a_{n}', keywords: ['a下标n', 'a sub n', 'axian', '下标', 'subscript']},
            {display: '√a', latex: '\\sqrt{a}', keywords: ['根号a', 'sqrt a', 'genhaoa', '平方根']},
            {display: 'a^{m/n}', latex: 'a^{\\frac{m}{n}}', keywords: ['分数指数', 'fractional exponent', 'fenshuzhishu', '有理指数']},
            {display: 'e^x', latex: 'e^{x}', keywords: ['e的x次方', 'e to the x', 'ex', '指数函数', 'exponential']},
            {display: '10^x', latex: '10^{x}', keywords: ['10的x次方', '10 to the x', 'shicifang', '科学计数']},
            {display: 'logₐb', latex: '\\log_{a}b', keywords: ['对数', 'log', 'logarithm', 'duishu', 'log base']}
        ],
        [isEn() ? 'Linear Algebra' : '线性代数']: [
            {display: 'Aᵀ', latex: 'A^{T}', keywords: ['转置', 'transpose', 'zhuanzhi', '矩阵转置']},
            {display: 'A⁻¹', latex: 'A^{-1}', keywords: ['逆矩阵', 'inverse', 'ni', '逆', 'matrix inverse']},
            {display: 'A⁺', latex: 'A^{+}', keywords: ['伪逆', 'pseudoinverse', 'weini', 'moore penrose']},
            {display: 'det(A)', latex: '\\det(A)', keywords: ['行列式', 'determinant', 'hanglieshi', 'det']},
            {display: 'tr(A)', latex: '\\operatorname{tr}(A)', keywords: ['迹', 'trace', 'ji', '矩阵迹']},
            {display: 'rank(A)', latex: '\\operatorname{rank}(A)', keywords: ['秩', 'rank', 'zhi', '矩阵秩']},
            {display: 'dim(A)', latex: '\\dim(A)', keywords: ['维数', 'dimension', 'weishu', '维度']},
            {display: 'ker(A)', latex: '\\ker(A)', keywords: ['核', 'kernel', 'he', '零空间', 'null space']},
            {display: 'Im(A)', latex: '\\operatorname{Im}(A)', keywords: ['像', 'image', 'xiang', '值域', 'range']},
            {display: 'Iₙ', latex: 'I_{n}', keywords: ['单位矩阵', 'identity', 'danwei', '单位阵']},
            {display: '0ₙ', latex: '\\mathbf{0}_{n}', keywords: ['零矩阵', 'zero matrix', 'lingjuzhen']},
            {display: 'u·v', latex: '\\mathbf{u} \\cdot \\mathbf{v}', keywords: ['点积', 'dot product', 'dianji', '内积', 'inner product']},
            {display: 'u×v', latex: '\\mathbf{u} \\times \\mathbf{v}', keywords: ['叉积', 'cross product', 'chaji', '外积', 'outer product', '向量积']},
            {display: '‖v‖', latex: '\\|\\mathbf{v}\\|', keywords: ['范数', 'norm', 'fanshu', '长度', 'length', '模']},
            {display: '⟨u,v⟩', latex: '\\langle \\mathbf{u}, \\mathbf{v} \\rangle', keywords: ['内积', 'inner product', 'neiji', '括号']},
            {display: isEn() ? 'Matrix' : '矩阵', latex: '\\begin{pmatrix} a & b \\ c & d \\end{pmatrix}', keywords: ['矩阵', 'matrix', 'juzhen', 'pmatrix', '圆括号矩阵']},
            {display: isEn() ? 'Determinant' : '行列式', latex: '\\begin{vmatrix} a & b \\ c & d \\end{vmatrix}', keywords: ['行列式', 'determinant', 'hanglieshi', 'vmatrix', '竖线']},
            {display: isEn() ? 'Vector' : '向量', latex: '\\begin{bmatrix} x \\ y \\ z \\end{bmatrix}', keywords: ['向量', 'vector', 'xiangliang', 'bmatrix', '方括号']},
            {display: 'Bmatrix', latex: '\\begin{Bmatrix} a & b \\ c & d \\end{Bmatrix}', keywords: ['大括号矩阵', 'Bmatrix', 'dakuohaojuzhen']},
            {display: 'vmatrix', latex: '\\begin{vmatrix} a & b \\ c & d \\end{vmatrix}', keywords: ['行列式', 'vmatrix', 'hanglieshi']},
            {display: 'Vmatrix', latex: '\\begin{Vmatrix} a & b \\ c & d \\end{Vmatrix}', keywords: ['范数矩阵', 'Vmatrix', 'fanshujuzhen', '双竖线']}
        ],
        [isEn() ? 'Chemistry Symbols' : '化学符号']: [
            {display: '→', latex: '\\rightarrow', keywords: ['反应', 'reaction', 'fanying', '箭头', '反应箭头']},
            {display: '⇌', latex: '\\rightleftharpoons', keywords: ['可逆', 'reversible', 'keni', '平衡', 'equilibrium']},
            {display: '⇀', latex: '\\rightharpoonup', keywords: ['半箭头', 'harpoon', 'banjiantou']},
            {display: '↽', latex: '\\leftharpoondown', keywords: ['左半箭头', 'left harpoon', 'zuobanjiantou']},
            {display: '↑', latex: '\\uparrow', keywords: ['气体', 'gas', 'qiti', '上箭头', '气体符号']},
            {display: '↓', latex: '\\downarrow', keywords: ['沉淀', 'precipitate', 'chendian', '下箭头', '沉淀符号']},
            {display: '⇅', latex: '\\uparrow\\downarrow', keywords: ['气体沉淀', 'gas precipitate', 'qitichedian']},
            {display: 'H₂O', latex: '\\mathrm{H_2O}', keywords: ['水', 'water', 'shui', 'h2o', '水分子']},
            {display: 'CO₂', latex: '\\mathrm{CO_2}', keywords: ['二氧化碳', 'carbon dioxide', 'eryanghuatan', 'co2']},
            {display: 'H⁺', latex: '\\mathrm{H^+}', keywords: ['氢离子', 'hydrogen ion', 'qinglizi', '质子']},
            {display: 'OH⁻', latex: '\\mathrm{OH^-}', keywords: ['氢氧根', 'hydroxide', 'qingyanggen', 'oh']},
            {display: 'ΔH', latex: '\\Delta H', keywords: ['焓变', 'enthalpy', 'hanbian', '反应热']},
            {display: 'ΔS', latex: '\\Delta S', keywords: ['熵变', 'entropy', 'shangbian']},
            {display: 'ΔG', latex: '\\Delta G', keywords: ['吉布斯自由能', 'gibbs free energy', 'jibusiziyouneng']},
            {display: '°C', latex: '^{\\circ}\\mathrm{C}', keywords: ['摄氏度', 'celsius', 'sheshidu', '温度']},
            {display: 'K', latex: '\\mathrm{K}', keywords: ['开尔文', 'kelvin', 'kaierwen', '温度单位']},
            {display: 'mol', latex: '\\mathrm{mol}', keywords: ['摩尔', 'mole', 'moer', '物质的量']},
            {display: isEn() ? '⇌ Equilibrium' : '⇌ 平衡', latex: '\\mathrm{A} + \\mathrm{B} \\rightleftharpoons \\mathrm{C}', keywords: ['化学平衡', 'chemical equilibrium', 'huaxuepingheng', '平衡反应']},
            {display: isEn() ? '→ Reaction' : '→ 反应', latex: '2\\mathrm{H_2} + \\mathrm{O_2} \\rightarrow 2\\mathrm{H_2O}', keywords: ['化学反应', 'chemical reaction', 'huaxuefanying', '反应方程式']},
            {display: 'e⁻', latex: '\\mathrm{e^-}', keywords: ['电子', 'electron', 'dianzi', '负电子']}
        ],
        [isEn() ? 'Function Operations' : '函数运算']: [
            {display: 'sin', latex: '\\sin', keywords: ['正弦', 'sine', 'sin', 'zhengxian', '三角函数']},
            {display: 'cos', latex: '\\cos', keywords: ['余弦', 'cosine', 'cos', 'yuxian', '三角函数']},
            {display: 'tan', latex: '\\tan', keywords: ['正切', 'tangent', 'tan', 'zhengqie', '三角函数']},
            {display: 'cot', latex: '\\cot', keywords: ['余切', 'cotangent', 'cot', 'yuqie']},
            {display: 'sec', latex: '\\sec', keywords: ['正割', 'secant', 'sec', 'zhengge']},
            {display: 'csc', latex: '\\csc', keywords: ['余割', 'cosecant', 'csc', 'yuge']},
            {display: 'arcsin', latex: '\\arcsin', keywords: ['反正弦', 'arcsine', 'arcsin', 'fanzhengxian', '反三角']},
            {display: 'arccos', latex: '\\arccos', keywords: ['反余弦', 'arccosine', 'arccos', 'fanyuxian']},
            {display: 'arctan', latex: '\\arctan', keywords: ['反正切', 'arctangent', 'arctan', 'fanzhengqie']},
            {display: 'sinh', latex: '\\sinh', keywords: ['双曲正弦', 'hyperbolic sine', 'sinh', 'shuangquzhengxian']},
            {display: 'cosh', latex: '\\cosh', keywords: ['双曲余弦', 'hyperbolic cosine', 'cosh', 'shuangquyuxian']},
            {display: 'tanh', latex: '\\tanh', keywords: ['双曲正切', 'hyperbolic tangent', 'tanh', 'shuangquzhengqie']},
            {display: 'log', latex: '\\log', keywords: ['对数', 'logarithm', 'log', 'duishu', '常用对数']},
            {display: 'ln', latex: '\\ln', keywords: ['自然对数', 'natural log', 'ln', 'ziranduishu']},
            {display: 'lg', latex: '\\lg', keywords: ['常用对数', 'log base 10', 'lg', 'changyongduishu']},
            {display: 'exp', latex: '\\exp', keywords: ['指数', 'exponential', 'exp', 'zhishu', 'e的幂']},
            {display: 'max', latex: '\\max', keywords: ['最大值', 'maximum', 'max', 'zuidazhi']},
            {display: 'min', latex: '\\min', keywords: ['最小值', 'minimum', 'min', 'zuixiaozhi']},
            {display: 'argmax', latex: '\\arg\\max', keywords: ['最大参数', 'argmax', 'arg max', 'zuidacanshu']},
            {display: 'argmin', latex: '\\arg\\min', keywords: ['最小参数', 'argmin', 'arg min', 'zuixiaocanshu']},
            {display: 'gcd', latex: '\\gcd', keywords: ['最大公约数', 'greatest common divisor', 'gcd', 'zuidagongyueshu']},
            {display: 'lcm', latex: '\\operatorname{lcm}', keywords: ['最小公倍数', 'least common multiple', 'lcm', 'zuixiaogongbeishu']},
            {display: 'mod', latex: '\\mod', keywords: ['取模', 'modulo', 'mod', 'qumo', '模运算']},
            {display: 'sgn', latex: '\\operatorname{sgn}', keywords: ['符号函数', 'sign', 'sgn', 'fuhao', '正负号']},
            {display: 'Re', latex: '\\operatorname{Re}', keywords: ['实部', 'real part', 're', 'shibu']},
            {display: 'Im', latex: '\\operatorname{Im}', keywords: ['虚部', 'imaginary part', 'im', 'xubu']},
            {display: 'deg', latex: '\\deg', keywords: ['度', 'degree', 'deg', 'du', '角度']},
            {display: 'dim', latex: '\\dim', keywords: ['维数', 'dimension', 'dim', 'weishu']},
            {display: 'ker', latex: '\\ker', keywords: ['核', 'kernel', 'ker', 'he']},
            {display: 'Pr', latex: '\\Pr', keywords: ['概率', 'probability', 'pr', 'gailv']}
        ],
        [isEn() ? 'Brackets' : '括号']: [
            {display: '( )', latex: '()', keywords: ['圆括号', 'parentheses', 'yuanakuohao', '小括号', 'round brackets']},
            {display: '[ ]', latex: '[]', keywords: ['方括号', 'brackets', 'fangkuohao', '中括号', 'square brackets']},
            {display: '{ }', latex: '\\begin{cases} \\end{cases}', keywords: ['花括号', 'braces', 'huakuohao', '大括号', 'curly brackets']},
            {display: '⟨ ⟩', latex: '\\langle \\rangle', keywords: ['尖括号', 'angle brackets', 'jiankuohao', '内积括号']},
            {display: '⌊ ⌋', latex: '\\lfloor \\rfloor', keywords: ['下取整', 'floor', 'xiaquzheng', '地板函数', 'floor brackets']},
            {display: '⌈ ⌉', latex: '\\lceil \\rceil', keywords: ['上取整', 'ceiling', 'shangquzheng', '天花板函数', 'ceiling brackets']},
            {display: '∣ ∣', latex: '| |', keywords: ['绝对值', 'absolute value', 'jueduizhi', '竖线', 'bars']},
            {display: '∥ ∥', latex: '\\| \\|', keywords: ['范数', 'norm', 'fanshu', '双竖线', 'double bars']},
            {display: '(', latex: '(', keywords: ['左圆括号', 'left parenthesis', 'zuoyuanakuohao', '开括号']},
            {display: ')', latex: ')', keywords: ['右圆括号', 'right parenthesis', 'youyuanakuohao', '闭括号']},
            {display: '[', latex: '[', keywords: ['左方括号', 'left bracket', 'zuofangkuohao']},
            {display: ']', latex: ']', keywords: ['右方括号', 'right bracket', 'youfangkuohao']},
            {display: '{', latex: '\\{', keywords: ['左花括号', 'left brace', 'zuohuakuohao']},
            {display: '}', latex: '\\}', keywords: ['右花括号', 'right brace', 'youhuakuohao']},
            {display: '⟦ ⟧', latex: '⟦ \\⟧', keywords: ['双括号', 'double brackets', 'shuangkuohao']},
            {display: '⟮ ⟯', latex: '⟮ \\⟯', keywords: ['圆括号变体', 'parenthesis variant', 'yuankuohaobianti']},
            {display: '⦃ ⦄', latex: '⦃ \\⦄', keywords: ['花括号变体', 'brace variant', 'huakuohaobianti']},
            {display: '⦅ ⦆', latex: '⦅ \\⦆', keywords: ['双边括号', 'double paren', 'shuangbiankuohao']},
            {display: '⦇ ⦈', latex: '⦇ \\⦈', keywords: ['z括号', 'z notation', 'zkuohao']},
            {display: '⦉ ⦊', latex: '⦉ \\⦊', keywords: ['角括号变体', 'angle variant', 'jiaokuohaobianti']}
        ],
        [isEn() ? 'Subscripts & Superscripts' : '上下标']: [
            {display: 'a₁', latex: 'a_{1}', keywords: ['下标', 'subscript', 'xiabiao', '下标1', 'a1']},
            {display: 'a₂', latex: 'a_{2}', keywords: ['下标2', 'subscript 2', 'xiabiao2', 'a2']},
            {display: 'aₙ', latex: 'a_{n}', keywords: ['下标n', 'subscript n', 'xiabiaon', 'an']},
            {display: 'aᵢ', latex: 'a_{i}', keywords: ['下标i', 'subscript i', 'xiabiaoi', 'ai']},
            {display: 'aⱼ', latex: 'a_{j}', keywords: ['下标j', 'subscript j', 'xiabiaoj', 'aj']},
            {display: 'x²', latex: 'x^{2}', keywords: ['平方', 'square', 'pingfang', 'x平方', '上标2']},
            {display: 'x³', latex: 'x^{3}', keywords: ['立方', 'cube', 'lifang', 'x立方', '上标3']},
            {display: 'xⁿ', latex: 'x^{n}', keywords: ['n次方', 'power n', 'ncifang', 'xn', '上标n']},
            {display: 'eˣ', latex: 'e^{x}', keywords: ['e的x次方', 'e to the x', 'ex', '指数']},
            {display: 'x̄', latex: '\\bar{x}', keywords: ['平均值', 'bar', 'pingjunzhi', 'x bar', '均值']},
            {display: 'x̂', latex: '\\hat{x}', keywords: ['估计值', 'hat', 'gujizhi', 'x hat', '估计']},
            {display: 'x̃', latex: '\\tilde{x}', keywords: ['近似值', 'tilde', 'jinsizhi', 'x tilde', '波浪号']},
            {display: 'ẋ', latex: '\\dot{x}', keywords: ['一阶导数', 'dot', 'yijiadaoshu', 'x dot', '导数']},
            {display: 'ẍ', latex: '\\ddot{x}', keywords: ['二阶导数', 'ddot', 'erjiadaoshu', 'x ddot']},
            {display: 'x⃗', latex: '\\vec{x}', keywords: ['向量', 'vector', 'xiangliang', 'x vec', '箭头']},
            {display: 'Aᵢⱼ', latex: 'A_{ij}', keywords: ['双下标', 'double subscript', 'shuangxiabiao', 'aij', '矩阵元素']},
            {display: 'x′', latex: "x'", keywords: ['导数', 'prime', 'daoshu', 'x prime', '撇']},
            {display: 'x″', latex: "x''", keywords: ['二阶导', 'double prime', 'erjiedao', 'x double prime']},
            {display: 'x†', latex: 'x^{\\dagger}', keywords: ['共轭转置', 'dagger', 'gongezhi', '埃尔米特']},
            {display: 'x*', latex: 'x^{*}', keywords: ['共轭', 'star', 'gonge', 'x star', '星号']}
        ],
        [isEn() ? 'Special Symbols' : '特殊符号']: [
            {display: 'ℕ', latex: '\\mathbb{N}', keywords: ['自然数', 'natural numbers', 'n', 'ziranshu', 'mathbb']},
            {display: 'ℤ', latex: '\\mathbb{Z}', keywords: ['整数', 'integers', 'z', 'zhengshu', '整数集']},
            {display: 'ℚ', latex: '\\mathbb{Q}', keywords: ['有理数', 'rational numbers', 'q', 'youlishu', '有理数集']},
            {display: 'ℝ', latex: '\\mathbb{R}', keywords: ['实数', 'real numbers', 'r', 'shishu', '实数集']},
            {display: 'ℂ', latex: '\\mathbb{C}', keywords: ['复数', 'complex numbers', 'c', 'fushu', '复数集']},
            {display: 'ℙ', latex: '\\mathbb{P}', keywords: ['概率', 'probability', 'p', 'gailv', '投影']},
            {display: '𝔼', latex: '\\mathbb{E}', keywords: ['期望', 'expectation', 'e', 'qiwang', '数学期望']},
            {display: '𝕍', latex: '\\mathbb{V}', keywords: ['方差', 'variance', 'v', 'fangcha']},
            {display: 'ℍ', latex: '\\mathbb{H}', keywords: ['四元数', 'quaternions', 'h', 'siyuanshu']},
            {display: '𝕂', latex: '\\mathbb{K}', keywords: ['域', 'field', 'k', 'yu', '数域']},
            {display: '∇·', latex: '\\nabla \\cdot', keywords: ['散度', 'divergence', 'sadu', 'div', '点乘']},
            {display: '∇×', latex: '\\nabla \\times', keywords: ['旋度', 'curl', 'xuandu', 'rot', '叉乘']},
            {display: '∇²', latex: '\\nabla^2', keywords: ['拉普拉斯', 'laplacian', 'lapulasi', 'laplace']},
            {display: '□', latex: '\\Box', keywords: ['方框', 'box', 'fangkuang', '达朗贝尔']},
            {display: '◊', latex: '\\Diamond', keywords: ['菱形', 'diamond', 'lingxing']},
            {display: 'ℏ', latex: '\\hbar', keywords: ['约化普朗克常数', 'hbar', 'yuehua', '狄拉克常数']},
            {display: 'ℓ', latex: '\\ell', keywords: ['小写l', 'ell', 'script l', 'xiaoxiel']},
            {display: '℘', latex: '\\wp', keywords: ['魏尔斯特拉斯', 'weierstrass', 'weierstrass p', 'weiersitela']},
            {display: 'ℜ', latex: '\\Re', keywords: ['实部', 'real part', 'shibu', '花体r']},
            {display: 'ℑ', latex: '\\Im', keywords: ['虚部', 'imaginary part', 'xubu', '花体i']},
            {display: 'ℵ', latex: '\\aleph', keywords: ['阿列夫', 'aleph', 'aliefu', '无穷基数']},
            {display: 'ℶ', latex: '\\beth', keywords: ['贝斯', 'beth', 'beisi', '连续统']},
            {display: '∂', latex: '\\partial', keywords: ['偏微分', 'partial', 'piandao', '偏导']},
            {display: '∞', latex: '\\infty', keywords: ['无穷', 'infinity', 'wuqiong', '无穷大', '无限']},
            {display: '℧', latex: '\\mho', keywords: ['姆欧', 'mho', 'muou', '电导']},
            {display: '∡', latex: '\\measuredangle', keywords: ['测量角', 'measured angle', 'celiangjiao']}
        ],
        [isEn() ? 'Common Formula Templates' : '常用公式模板']: [
            {display: isEn() ? 'Quadratic Formula' : '二次公式', latex: 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}', keywords: ['求根公式', 'quadratic formula', 'qiugen', '二次方程', '韦达定理']},
            {display: isEn() ? 'Binomial Theorem' : '二项式定理', latex: '(a+b)^n = \\sum_{k=0}^{n} \\binom{n}{k} a^{n-k} b^k', keywords: ['二项式', 'binomial theorem', 'erxiangshi', '杨辉三角', '组合数']},
            {display: isEn() ? 'Integration by Parts' : '分部积分', latex: '\\int u \\, dv = uv - \\int v \\, du', keywords: ['分部积分', 'integration by parts', 'fenbujifen', '积分技巧']},
            {display: isEn() ? 'Chain Rule' : '链式法则', latex: '\\frac{dy}{dx} = \\frac{dy}{du} \\cdot \\frac{du}{dx}', keywords: ['链式法则', 'chain rule', 'lianshifaze', '复合函数求导']},
            {display: isEn() ? 'Fourier Transform' : '傅里叶变换', latex: 'F(\\omega) = \\int_{-\\infty}^{\\infty} f(t) e^{-i\\omega t} dt', keywords: ['傅里叶', 'fourier transform', 'fuliyebianhuan', '频域']},
            {display: isEn() ? 'Schrödinger Equation' : '薛定谔方程', latex: 'i\\hbar\\frac{\\partial}{\\partial t}\\Psi = \\hat{H}\\Psi', keywords: ['薛定谔', 'schrodinger equation', 'xuedingee', '量子力学']},
            {display: isEn() ? 'Maxwell Equations' : '麦克斯韦方程组', latex: '\\nabla \\cdot \\mathbf{E} = \\frac{\\rho}{\\varepsilon_0}', keywords: ['麦克斯韦', 'maxwell equations', 'maikesiwei', '电磁学']},
            {display: isEn() ? 'Normal Distribution' : '正态分布', latex: 'f(x) = \\frac{1}{\\sigma\\sqrt{2\\pi}} e^{-\\frac{(x-\\mu)^2}{2\\sigma^2}}', keywords: ['正态分布', 'normal distribution', 'zhengtai', '高斯分布', 'gaussian']},
            {display: isEn() ? 'Taylor Series' : '泰勒展开', latex: 'f(x) = \\sum_{n=0}^{\\infty} \\frac{f^{(n)}(a)}{n!}(x-a)^n', keywords: ['泰勒', 'taylor series', 'taile', '级数展开']},
            {display: isEn() ? 'Pythagorean Theorem' : '勾股定理', latex: 'a^2 + b^2 = c^2', keywords: ['勾股定理', 'pythagorean theorem', 'gougudingli', '毕达哥拉斯']},
            {display: isEn() ? 'Law of Cosines' : '余弦定理', latex: 'c^2 = a^2 + b^2 - 2ab\\cos C', keywords: ['余弦定理', 'law of cosines', 'yuxiandingli', '三角形']},
            {display: isEn() ? 'Law of Sines' : '正弦定理', latex: '\\frac{a}{\\sin A} = \\frac{b}{\\sin B} = \\frac{c}{\\sin C}', keywords: ['正弦定理', 'law of sines', 'zhengxiandingli', '三角形']},
            {display: isEn() ? 'Gaussian Integral' : '高斯积分', latex: '\\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}', keywords: ['高斯积分', 'gaussian integral', 'gaosi', '泊松积分']},
            {display: isEn() ? 'Stirling Formula' : '斯特林公式', latex: 'n! \\approx \\sqrt{2\\pi n}\\left(\\frac{n}{e}\\right)^n', keywords: ['斯特林', 'stirling formula', 'sitelin', '阶乘近似']},
            {display: isEn() ? 'Cauchy-Schwarz' : '柯西不等式', latex: '|\\langle \\mathbf{u}, \\mathbf{v} \\rangle| \\leq \\|\\mathbf{u}\\| \\cdot \\|\\mathbf{v}\\|', keywords: ['柯西', 'cauchy schwarz', 'kexi', '内积不等式']}
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
    searchBox.placeholder = isEn() ? 'Search (max 10 chars)...' : '搜索（最多10字）...';
    searchBox.maxLength = 10;
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

    // 右上角关闭按钮
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '<i class="fas fa-times"></i>';
    closeBtn.style.cssText = `
        position: absolute;
        top: 15px;
        right: 15px;
        width: 32px;
        height: 32px;
        background: ${(window.nightMode === true) ? '#444' : '#f5f5f5'};
        color: ${(window.nightMode === true) ? '#eee' : '#333'};
        border: none;
        border-radius: 50%;
        cursor: pointer;
        font-size: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
    `;
    closeBtn.onclick = closeFormulaPicker;
    formulaContainer.style.position = 'relative';
    formulaContainer.appendChild(closeBtn);

    // 创建底部按钮
    const bottomBar = document.createElement('div');
    bottomBar.style.cssText = `
        display: flex;
        justify-content: flex-end;
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

    const wrapInDollarBtn = document.createElement('button');
    wrapInDollarBtn.textContent = isEn() ? 'Insert Inline' : '行内公式';
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
    wrapInDoubleDollarBtn.textContent = isEn() ? 'Insert Block' : '多行公式';
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
    formulaContainer.appendChild(bottomBar);

    formulaSheet.appendChild(formulaContainer);
    document.body.appendChild(formulaSheet);

    let selectedFormula = null;


    // 分类标签和搜索结果标签
    let searchActive = false;
    function renderCategoryTabs() {
        categoryTabs.innerHTML = '';
        // 搜索时显示"搜索结果"标签
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
                // 检查长度限制
                if (searchKeyword.length > 10) {
                    const lengthError = document.createElement('div');
                    lengthError.textContent = isEn() ? 'Keyword too long (max 10 chars)' : '关键词过长（最多10字）';
                    lengthError.style.cssText = 'color: #dc3545; font-size: 12px;';
                    emptyMsg.appendChild(lengthError);
                } else {
                    const aiSearchLink = document.createElement('a');
                    aiSearchLink.href = 'javascript:void(0)';
                    aiSearchLink.textContent = isEn() ? 'Try AI Search' : '试试AI搜索';
                    aiSearchLink.style.cssText = 'color: #4a90e2; text-decoration: underline; cursor: pointer; font-size: 14px;';
                    aiSearchLink.addEventListener('click', function() {
                        performAISearch(searchKeyword);
                    });
                    emptyMsg.appendChild(aiSearchLink);
                }
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
        // 限制输入长度
        if (this.value.length > 10) {
            this.value = this.value.substring(0, 10);
        }

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

    // 插入按钮点击事件 - 直接插入LaTeX，不加任何包裹
    insertBtn.addEventListener('click', () => {
        const formula = getSelectedFormula();
        if (formula && vditor) {
            vditor.insertValue(formula.latex);
            closeFormulaPicker();
            showMessage(isEn() ? 'LaTeX formula inserted' : 'LaTeX公式已插入');
        } else {
            showMessage(isEn() ? 'Please select a formula first' : '请先选择一个公式', 'error');
        }
    });

    // 插入行内公式 - 用$包裹单行公式
    wrapInDollarBtn.addEventListener('click', () => {
        const formula = getSelectedFormula();
        if (formula && vditor) {
            vditor.insertValue(`$${formula.latex}$`);
            closeFormulaPicker();
            showMessage(isEn() ? 'Inline formula inserted' : '行内公式已插入');
        } else {
            showMessage(isEn() ? 'Please select a formula first' : '请先选择一个公式', 'error');
        }
    });

    // 插入多行公式 - 用$$包裹多行公式
    wrapInDoubleDollarBtn.addEventListener('click', () => {
        const formula = getSelectedFormula();
        if (formula && vditor) {
            vditor.insertValue(`$$\n${formula.latex}\n$$`);
            closeFormulaPicker();
            showMessage(isEn() ? 'Block formula inserted' : '块级公式已插入');
        } else {
            showMessage(isEn() ? 'Please select a formula first' : '请先选择一个公式', 'error');
        }
    });

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

    // 检查关键词长度
    if (keyword.length > 10) {
        showMessage(isEn() ? 'Search keyword too long (max 10 characters)' : '搜索关键词过长（最多10个字）', 'error');
        return;
    }

    // 显示AI搜索加载状态
    const formulaGrid = document.getElementById('formulaGrid');
    if (!formulaGrid) return;

    formulaGrid.innerHTML = '';

    // 创建加载提示
    const loadingDiv = document.createElement('div');
    loadingDiv.style.cssText = 'text-align:center;padding:40px 0;grid-column: 1/-1;';

    const loadingIcon = document.createElement('div');
    loadingIcon.innerHTML = '<i class="fas fa-magic" style="font-size: 32px; color: #4a90e2;"></i>';
    loadingIcon.style.cssText = 'margin-bottom: 15px;';

    const loadingText = document.createElement('div');
    loadingText.textContent = isEn() ? 'AI is searching...' : 'AI搜索中...';
    loadingText.style.cssText = 'color: #4a90e2; font-size: 14px;';

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
    resultHeader.innerHTML = `<span style="color: #4a90e2; font-weight: bold;">${isEn() ? 'AI Search Results' : 'AI搜索结果'}</span> <span style="color: #888; font-size: 12px;"></span>`;
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
            symbolBtn.style.borderColor = '#4a90e2';
            symbolBtn.style.background = (window.nightMode === true) ? 'rgba(74, 144, 226, 0.2)' : 'rgba(74, 144, 226, 0.1)';

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
