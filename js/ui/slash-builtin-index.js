// Auto-generated from formula-picker.js, emoji-picker.js and ui/chart.js
// Regenerate this file when builtin picker datasets change.

const BUILTIN_FORMULA_ITEMS = [
    {
        "display": "+",
        "latex": "+",
        "keywords": [
            "加",
            "plus",
            "add",
            "jia",
            "加法",
            "addition"
        ]
    },
    {
        "display": "-",
        "latex": "-",
        "keywords": [
            "减",
            "minus",
            "subtract",
            "jian",
            "减法",
            "subtraction"
        ]
    },
    {
        "display": "×",
        "latex": "\times",
        "keywords": [
            "乘",
            "times",
            "multiply",
            "cheng",
            "乘法",
            "multiplication"
        ]
    },
    {
        "display": "÷",
        "latex": "\\div",
        "keywords": [
            "除",
            "div",
            "divide",
            "chu",
            "除法",
            "division"
        ]
    },
    {
        "display": "=",
        "latex": "=",
        "keywords": [
            "等于",
            "equal",
            "equals",
            "dengyu",
            "等号",
            "equality"
        ]
    },
    {
        "display": "≠",
        "latex": "\neq",
        "keywords": [
            "不等于",
            "not equal",
            "neq",
            "budengyu",
            "不等号",
            "inequality"
        ]
    },
    {
        "display": "≈",
        "latex": "\\approx",
        "keywords": [
            "约等于",
            "approx",
            "approximately",
            "yuedengyu",
            "约等",
            "approximate"
        ]
    },
    {
        "display": "±",
        "latex": "\\pm",
        "keywords": [
            "正负",
            "plus minus",
            "pm",
            "zhengfu",
            "加减"
        ]
    },
    {
        "display": "∓",
        "latex": "\\mp",
        "keywords": [
            "负正",
            "minus plus",
            "mp",
            "fuzheng",
            "减加"
        ]
    },
    {
        "display": "⋅",
        "latex": "\\cdot",
        "keywords": [
            "点乘",
            "cdot",
            "dot",
            "diancheng",
            "内积",
            "点积",
            "dot product"
        ]
    },
    {
        "display": "∗",
        "latex": "\\ast",
        "keywords": [
            "星号",
            "ast",
            "asterisk",
            "xinghao",
            "星乘"
        ]
    },
    {
        "display": "⋆",
        "latex": "\\star",
        "keywords": [
            "星",
            "star",
            "xing",
            "五角星"
        ]
    },
    {
        "display": "⊕",
        "latex": "\\oplus",
        "keywords": [
            "直和",
            "oplus",
            "direct sum",
            "zhihe",
            "异或",
            "xor"
        ]
    },
    {
        "display": "⊗",
        "latex": "\\otimes",
        "keywords": [
            "张量积",
            "otimes",
            "tensor",
            "zhangliang",
            "克罗内克积",
            "kronecker"
        ]
    },
    {
        "display": "†",
        "latex": "\\dagger",
        "keywords": [
            " dagger",
            "共轭转置",
            "dagger",
            "gongezhi",
            "埃尔米特"
        ]
    },
    {
        "display": "‡",
        "latex": "\\ddagger",
        "keywords": [
            "双 dagger",
            "ddagger",
            "shuang"
        ]
    },
    {
        "display": "<",
        "latex": "<",
        "keywords": [
            "小于",
            "less",
            "less than",
            "xiaoyu",
            "小于号"
        ]
    },
    {
        "display": ">",
        "latex": ">",
        "keywords": [
            "大于",
            "greater",
            "greater than",
            "dayu",
            "大于号"
        ]
    },
    {
        "display": "≤",
        "latex": "\\leq",
        "keywords": [
            "小于等于",
            "less equal",
            "leq",
            "xiaoyudengyu",
            "小于等于号",
            "less than or equal"
        ]
    },
    {
        "display": "≥",
        "latex": "\\geq",
        "keywords": [
            "大于等于",
            "greater equal",
            "geq",
            "dayudengyu",
            "大于等于号",
            "greater than or equal"
        ]
    },
    {
        "display": "≦",
        "latex": "\\leqq",
        "keywords": [
            "小于等于",
            "leqq",
            "less equal",
            "xiaoyudengyu"
        ]
    },
    {
        "display": "≧",
        "latex": "\\geqq",
        "keywords": [
            "大于等于",
            "geqq",
            "greater equal",
            "dayudengyu"
        ]
    },
    {
        "display": "≪",
        "latex": "\\ll",
        "keywords": [
            "远小于",
            "much less",
            "ll",
            "yuanxiaoyu",
            "远小于号"
        ]
    },
    {
        "display": "≫",
        "latex": "\\gg",
        "keywords": [
            "远大于",
            "much greater",
            "gg",
            "yuandayu",
            "远大于号"
        ]
    },
    {
        "display": "≡",
        "latex": "\\equiv",
        "keywords": [
            "恒等于",
            "equivalent",
            "equiv",
            "hengdengyu",
            "恒等",
            "恒等号",
            "identical"
        ]
    },
    {
        "display": "≢",
        "latex": "\not\\equiv",
        "keywords": [
            "不恒等于",
            "not equivalent",
            "not equiv",
            "buhengdengyu",
            "不恒等"
        ]
    },
    {
        "display": "∼",
        "latex": "\\sim",
        "keywords": [
            "相似",
            "similar",
            "sim",
            "xiangsi",
            "波浪号",
            "tilde"
        ]
    },
    {
        "display": "≃",
        "latex": "\\simeq",
        "keywords": [
            "近似等于",
            "simeq",
            "similar equal",
            "jinsidengyu"
        ]
    },
    {
        "display": "≅",
        "latex": "\\cong",
        "keywords": [
            "全等",
            "congruent",
            "cong",
            "quandeng",
            "全等于",
            "全等号"
        ]
    },
    {
        "display": "≈",
        "latex": "\\approx",
        "keywords": [
            "约等于",
            "approx",
            "approximately",
            "yuedengyu",
            "约等"
        ]
    },
    {
        "display": "≉",
        "latex": "\not\\approx",
        "keywords": [
            "不约等于",
            "not approx",
            "buyuedengyu"
        ]
    },
    {
        "display": "∝",
        "latex": "\\propto",
        "keywords": [
            "正比",
            "proportional",
            "propto",
            "zhengbi",
            "正比于",
            "比例"
        ]
    },
    {
        "display": "≺",
        "latex": "\\prec",
        "keywords": [
            "先于",
            "prec",
            "precedes",
            "xianyu",
            "偏序"
        ]
    },
    {
        "display": "≻",
        "latex": "\\succ",
        "keywords": [
            "后于",
            "succ",
            "succeeds",
            "houyu"
        ]
    },
    {
        "display": "≼",
        "latex": "\\preceq",
        "keywords": [
            "先于等于",
            "preceq",
            "precedes equal",
            "xianyudengyu"
        ]
    },
    {
        "display": "≽",
        "latex": "\\succeq",
        "keywords": [
            "后于等于",
            "succeq",
            "succeeds equal",
            "houyudengyu"
        ]
    },
    {
        "display": "⊏",
        "latex": "\\sqsubset",
        "keywords": [
            "方形子集",
            "sqsubset",
            "square subset",
            "fangxingziji"
        ]
    },
    {
        "display": "⊐",
        "latex": "\\sqsupset",
        "keywords": [
            "方形超集",
            "sqsupset",
            "square superset",
            "fangxingchaoji"
        ]
    },
    {
        "display": "⊑",
        "latex": "\\sqsubseteq",
        "keywords": [
            "方形子集等于",
            "sqsubseteq",
            "square subseteq",
            "fangxingzijidengyu"
        ]
    },
    {
        "display": "⊒",
        "latex": "\\sqsupseteq",
        "keywords": [
            "方形超集等于",
            "sqsupseteq",
            "square superseteq",
            "fangxingchaojidengyu"
        ]
    },
    {
        "display": "∈",
        "latex": "\\in",
        "keywords": [
            "属于",
            "in",
            "element",
            "shuyu",
            "属于符号",
            "member"
        ]
    },
    {
        "display": "∉",
        "latex": "\notin",
        "keywords": [
            "不属于",
            "not in",
            "notin",
            "bushuyu",
            "不属于符号"
        ]
    },
    {
        "display": "∋",
        "latex": "\ni",
        "keywords": [
            "包含",
            "ni",
            "contains",
            "baohan",
            "包含元素"
        ]
    },
    {
        "display": "∌",
        "latex": "\not\ni",
        "keywords": [
            "不包含",
            "not ni",
            "notni",
            "bubaohan"
        ]
    },
    {
        "display": "⊂",
        "latex": "\\subset",
        "keywords": [
            "真子集",
            "subset",
            "proper subset",
            "zhenziji",
            "子集",
            "包含于"
        ]
    },
    {
        "display": "⊃",
        "latex": "\\supset",
        "keywords": [
            "真超集",
            "superset",
            "proper superset",
            "zhenchaoji",
            "超集",
            "包含"
        ]
    },
    {
        "display": "⊆",
        "latex": "\\subseteq",
        "keywords": [
            "子集",
            "subseteq",
            "subset equal",
            "ziji",
            "子集等于"
        ]
    },
    {
        "display": "⊇",
        "latex": "\\supseteq",
        "keywords": [
            "超集",
            "superseteq",
            "superset equal",
            "chaoji",
            "超集等于"
        ]
    },
    {
        "display": "⊄",
        "latex": "\not\\subset",
        "keywords": [
            "非子集",
            "not subset",
            "feiziji"
        ]
    },
    {
        "display": "⊅",
        "latex": "\not\\supset",
        "keywords": [
            "非超集",
            "not superset",
            "feichaoji"
        ]
    },
    {
        "display": "⊈",
        "latex": "\nsubseteq",
        "keywords": [
            "非子集等于",
            "nsubseteq",
            "not subseteq",
            "feizijidengyu"
        ]
    },
    {
        "display": "⊉",
        "latex": "\nsupseteq",
        "keywords": [
            "非超集等于",
            "nsupseteq",
            "not superseteq",
            "feichaojidengyu"
        ]
    },
    {
        "display": "∪",
        "latex": "\\cup",
        "keywords": [
            "并集",
            "union",
            "cup",
            "bingji",
            "并",
            "联合"
        ]
    },
    {
        "display": "∩",
        "latex": "\\cap",
        "keywords": [
            "交集",
            "intersection",
            "cap",
            "jiaoji",
            "交",
            "共同"
        ]
    },
    {
        "display": "∖",
        "latex": "\\setminus",
        "keywords": [
            "差集",
            "setminus",
            "difference",
            "chaji",
            "集合差"
        ]
    },
    {
        "display": "△",
        "latex": "\triangle",
        "keywords": [
            "对称差",
            "triangle",
            "symmetric difference",
            "duichencha",
            "三角"
        ]
    },
    {
        "display": "⊎",
        "latex": "\\uplus",
        "keywords": [
            "多重并",
            "uplus",
            "disjoint union",
            "duochongbing"
        ]
    },
    {
        "display": "∅",
        "latex": "\\emptyset",
        "keywords": [
            "空集",
            "empty set",
            "emptyset",
            "kongji",
            "空集合",
            "null"
        ]
    },
    {
        "display": "ℵ",
        "latex": "\\aleph",
        "keywords": [
            "阿列夫",
            "aleph",
            "alef",
            "aliefu",
            "无穷基数"
        ]
    },
    {
        "display": "ℶ",
        "latex": "\\beth",
        "keywords": [
            "贝斯",
            "beth",
            "beisi",
            "连续统基数"
        ]
    },
    {
        "display": "∀",
        "latex": "\\forall",
        "keywords": [
            "任意",
            "for all",
            "forall",
            "renyi",
            "全称量词",
            "universal"
        ]
    },
    {
        "display": "∃",
        "latex": "\\exists",
        "keywords": [
            "存在",
            "exists",
            "cunzai",
            "存在量词",
            "existential"
        ]
    },
    {
        "display": "∄",
        "latex": "\nexists",
        "keywords": [
            "不存在",
            "not exists",
            "nexists",
            "bucunzai"
        ]
    },
    {
        "display": "∞",
        "latex": "\\infty",
        "keywords": [
            "无穷",
            "infinity",
            "infty",
            "wuqiong",
            "无穷大",
            "无限"
        ]
    },
    {
        "display": "α",
        "latex": "\\alpha",
        "keywords": [
            "阿尔法",
            "alpha",
            "aerfa",
            "希腊字母a"
        ]
    },
    {
        "display": "β",
        "latex": "\\beta",
        "keywords": [
            "贝塔",
            "beta",
            "beita",
            "希腊字母b"
        ]
    },
    {
        "display": "γ",
        "latex": "\\gamma",
        "keywords": [
            "伽马",
            "gamma",
            "gama",
            "希腊字母g"
        ]
    },
    {
        "display": "δ",
        "latex": "\\delta",
        "keywords": [
            "德尔塔",
            "delta",
            "deerta",
            "希腊字母d"
        ]
    },
    {
        "display": "ε",
        "latex": "\\epsilon",
        "keywords": [
            "艾普西隆",
            "epsilon",
            "epsilon",
            "希腊字母e"
        ]
    },
    {
        "display": "ζ",
        "latex": "\\zeta",
        "keywords": [
            "泽塔",
            "zeta",
            "zeta",
            "希腊字母z"
        ]
    },
    {
        "display": "η",
        "latex": "\\eta",
        "keywords": [
            "伊塔",
            "eta",
            "yita",
            "希腊字母h"
        ]
    },
    {
        "display": "θ",
        "latex": "\theta",
        "keywords": [
            "西塔",
            "theta",
            "theta",
            "希腊字母th"
        ]
    },
    {
        "display": "ι",
        "latex": "\\iota",
        "keywords": [
            "约塔",
            "iota",
            "yota",
            "希腊字母i"
        ]
    },
    {
        "display": "κ",
        "latex": "\\kappa",
        "keywords": [
            "卡帕",
            "kappa",
            "kapa",
            "希腊字母k"
        ]
    },
    {
        "display": "λ",
        "latex": "\\lambda",
        "keywords": [
            "拉姆达",
            "lambda",
            "lambda",
            "希腊字母l",
            "波长"
        ]
    },
    {
        "display": "μ",
        "latex": "\\mu",
        "keywords": [
            "缪",
            "mu",
            "miu",
            "希腊字母m",
            "微",
            "均值"
        ]
    },
    {
        "display": "ν",
        "latex": "\nu",
        "keywords": [
            "纽",
            "nu",
            "niu",
            "希腊字母n",
            "频率"
        ]
    },
    {
        "display": "ξ",
        "latex": "\\xi",
        "keywords": [
            "克西",
            "xi",
            "xi",
            "希腊字母x"
        ]
    },
    {
        "display": "ο",
        "latex": "\\omicron",
        "keywords": [
            "奥密克戎",
            "omicron",
            "omikelong",
            "希腊字母o"
        ]
    },
    {
        "display": "π",
        "latex": "\\pi",
        "keywords": [
            "派",
            "pi",
            "pai",
            "希腊字母p",
            "圆周率"
        ]
    },
    {
        "display": "ρ",
        "latex": "\rho",
        "keywords": [
            "柔",
            "rho",
            "rou",
            "希腊字母r",
            "密度"
        ]
    },
    {
        "display": "σ",
        "latex": "\\sigma",
        "keywords": [
            "西格玛",
            "sigma",
            "sigma",
            "希腊字母s",
            "求和",
            "标准差"
        ]
    },
    {
        "display": "τ",
        "latex": "\tau",
        "keywords": [
            "陶",
            "tau",
            "tao",
            "希腊字母t"
        ]
    },
    {
        "display": "υ",
        "latex": "\\upsilon",
        "keywords": [
            "宇普西隆",
            "upsilon",
            "ypsilong",
            "希腊字母u"
        ]
    },
    {
        "display": "φ",
        "latex": "\\phi",
        "keywords": [
            "斐",
            "phi",
            "fei",
            "希腊字母ph",
            "黄金比例"
        ]
    },
    {
        "display": "χ",
        "latex": "\\chi",
        "keywords": [
            "喜",
            "chi",
            "xi",
            "希腊字母ch"
        ]
    },
    {
        "display": "ψ",
        "latex": "\\psi",
        "keywords": [
            "普西",
            "psi",
            "psi",
            "希腊字母ps"
        ]
    },
    {
        "display": "ω",
        "latex": "\\omega",
        "keywords": [
            "欧米伽",
            "omega",
            "omeiga",
            "希腊字母o",
            "角速度"
        ]
    },
    {
        "display": "Γ",
        "latex": "\\Gamma",
        "keywords": [
            "大写伽马",
            "Gamma",
            "Gamma",
            "希腊字母G"
        ]
    },
    {
        "display": "Δ",
        "latex": "\\Delta",
        "keywords": [
            "大写德尔塔",
            "Delta",
            "Delta",
            "希腊字母D",
            "差分",
            "拉普拉斯"
        ]
    },
    {
        "display": "Θ",
        "latex": "\\Theta",
        "keywords": [
            "大写西塔",
            "Theta",
            "Theta",
            "希腊字母Th"
        ]
    },
    {
        "display": "Λ",
        "latex": "\\Lambda",
        "keywords": [
            "大写拉姆达",
            "Lambda",
            "Lambda",
            "希腊字母L"
        ]
    },
    {
        "display": "Ξ",
        "latex": "\\Xi",
        "keywords": [
            "大写克西",
            "Xi",
            "Xi",
            "希腊字母X"
        ]
    },
    {
        "display": "Π",
        "latex": "\\Pi",
        "keywords": [
            "大写派",
            "Pi",
            "Pi",
            "希腊字母P",
            "连乘"
        ]
    },
    {
        "display": "Σ",
        "latex": "\\Sigma",
        "keywords": [
            "大写西格玛",
            "Sigma",
            "Sigma",
            "希腊字母S",
            "求和",
            "sigma"
        ]
    },
    {
        "display": "Υ",
        "latex": "\\Upsilon",
        "keywords": [
            "大写宇普西隆",
            "Upsilon",
            "Ypsilon",
            "希腊字母U"
        ]
    },
    {
        "display": "Φ",
        "latex": "\\Phi",
        "keywords": [
            "大写斐",
            "Phi",
            "Fei",
            "希腊字母Ph"
        ]
    },
    {
        "display": "Ψ",
        "latex": "\\Psi",
        "keywords": [
            "大写普西",
            "Psi",
            "Psi",
            "希腊字母Ps"
        ]
    },
    {
        "display": "Ω",
        "latex": "\\Omega",
        "keywords": [
            "大写欧米伽",
            "Omega",
            "Omega",
            "希腊字母O",
            "欧姆"
        ]
    },
    {
        "display": "∫",
        "latex": "\\int",
        "keywords": [
            "积分",
            "integral",
            "int",
            "jifen",
            "不定积分",
            "integration"
        ]
    },
    {
        "display": "∮",
        "latex": "\\oint",
        "keywords": [
            "环路积分",
            "contour integral",
            "oint",
            "huanlujifen",
            "围道积分"
        ]
    },
    {
        "display": "∬",
        "latex": "\\iint",
        "keywords": [
            "二重积分",
            "double integral",
            "iint",
            "erchongjifen",
            "面积分"
        ]
    },
    {
        "display": "∭",
        "latex": "\\iiint",
        "keywords": [
            "三重积分",
            "triple integral",
            "iiint",
            "sanchongjifen",
            "体积分"
        ]
    },
    {
        "display": "⨌",
        "latex": "\\iiiint",
        "keywords": [
            "四重积分",
            "quadruple integral",
            "iiiint",
            "sichongjifen"
        ]
    },
    {
        "display": "∂",
        "latex": "\\partial",
        "keywords": [
            "偏导",
            "partial",
            "piandao",
            "偏微分",
            "partial derivative"
        ]
    },
    {
        "display": "∇",
        "latex": "\nabla",
        "keywords": [
            "纳布拉",
            "nabla",
            "nabla",
            "梯度",
            "散度",
            "旋度",
            "del"
        ]
    },
    {
        "display": "∆",
        "latex": "\\Delta",
        "keywords": [
            "增量",
            "delta",
            "Delta",
            "zengliang",
            "拉普拉斯",
            "laplacian"
        ]
    },
    {
        "display": "∑",
        "latex": "\\sum",
        "keywords": [
            "求和",
            "sum",
            "summation",
            "qiuhe",
            "求和符号",
            "sigma",
            "西格玛"
        ]
    },
    {
        "display": "∏",
        "latex": "\\prod",
        "keywords": [
            "求积",
            "product",
            "prod",
            "qiuji",
            "连乘",
            "乘积"
        ]
    },
    {
        "display": "∐",
        "latex": "\\coprod",
        "keywords": [
            "余积",
            "coproduct",
            "coprod",
            "yuji",
            "余求积"
        ]
    },
    {
        "display": "lim",
        "latex": "\\lim_{x \to a}",
        "keywords": [
            "极限",
            "limit",
            "lim",
            "jixian",
            "趋近"
        ]
    },
    {
        "display": "sup",
        "latex": "\\sup",
        "keywords": [
            "上确界",
            "supremum",
            "sup",
            "shangquejie"
        ]
    },
    {
        "display": "inf",
        "latex": "\\inf",
        "keywords": [
            "下确界",
            "infimum",
            "inf",
            "xiaquejie"
        ]
    },
    {
        "display": "max",
        "latex": "\\max",
        "keywords": [
            "最大值",
            "maximum",
            "max",
            "zuidazhi",
            "最大"
        ]
    },
    {
        "display": "min",
        "latex": "\\min",
        "keywords": [
            "最小值",
            "minimum",
            "min",
            "zuixiaozhi",
            "最小"
        ]
    },
    {
        "display": "argmax",
        "latex": "\\arg\\max",
        "keywords": [
            "最大参数",
            "argmax",
            "arg max",
            "zuidacanshu"
        ]
    },
    {
        "display": "argmin",
        "latex": "\\arg\\min",
        "keywords": [
            "最小参数",
            "argmin",
            "arg min",
            "zuixiaocanshu"
        ]
    },
    {
        "display": "dx",
        "latex": "\\,dx",
        "keywords": [
            "dx",
            "微分",
            "differential",
            "weifen"
        ]
    },
    {
        "display": "dy/dx",
        "latex": "\\frac{dy}{dx}",
        "keywords": [
            "导数",
            "derivative",
            "dy dx",
            "daoshu",
            "微分"
        ]
    },
    {
        "display": "d²y/dx²",
        "latex": "\\frac{d^2y}{dx^2}",
        "keywords": [
            "二阶导数",
            "second derivative",
            "erjiedaoshu"
        ]
    },
    {
        "display": "∂f/∂x",
        "latex": "\\frac{\\partial f}{\\partial x}",
        "keywords": [
            "偏导数",
            "partial derivative",
            "piandaoshu"
        ]
    },
    {
        "display": "∫ₐᵇ",
        "latex": "\\int_{a}^{b}",
        "keywords": [
            "定积分",
            "definite integral",
            "dingjifen",
            "积分上下限"
        ]
    },
    {
        "display": "∫ f(x) dx",
        "latex": "\\int f(x) \\,dx",
        "keywords": [
            "积分公式",
            "integral formula",
            "jifengongshi"
        ]
    },
    {
        "display": "∀",
        "latex": "\\forall",
        "keywords": [
            "任意",
            "for all",
            "forall",
            "renyi",
            "全称量词",
            "universal quantifier"
        ]
    },
    {
        "display": "∃",
        "latex": "\\exists",
        "keywords": [
            "存在",
            "exists",
            "cunzai",
            "存在量词",
            "existential quantifier"
        ]
    },
    {
        "display": "∄",
        "latex": "\nexists",
        "keywords": [
            "不存在",
            "not exists",
            "nexists",
            "bucunzai"
        ]
    },
    {
        "display": "∧",
        "latex": "\\wedge",
        "keywords": [
            "与",
            "and",
            "wedge",
            "yu",
            "逻辑与",
            "合取",
            "conjunction"
        ]
    },
    {
        "display": "∨",
        "latex": "\\vee",
        "keywords": [
            "或",
            "or",
            "vee",
            "huo",
            "逻辑或",
            "析取",
            "disjunction"
        ]
    },
    {
        "display": "¬",
        "latex": "\neg",
        "keywords": [
            "非",
            "not",
            "neg",
            "fei",
            "逻辑非",
            "否定",
            "negation"
        ]
    },
    {
        "display": "⇒",
        "latex": "\\Rightarrow",
        "keywords": [
            "蕴含",
            "implies",
            "Rightarrow",
            "yinhan",
            "推出",
            "implication"
        ]
    },
    {
        "display": "⇐",
        "latex": "\\Leftarrow",
        "keywords": [
            "被蕴含",
            "implied by",
            "Leftarrow",
            "beiyinhan"
        ]
    },
    {
        "display": "⇔",
        "latex": "\\Leftrightarrow",
        "keywords": [
            "等价",
            "iff",
            "Leftrightarrow",
            "dengjia",
            "当且仅当",
            "等价于",
            "biconditional"
        ]
    },
    {
        "display": "⊢",
        "latex": "\\vdash",
        "keywords": [
            "推出",
            "turnstile",
            "vdash",
            "tuichu",
            "语法推出"
        ]
    },
    {
        "display": "⊨",
        "latex": "\\vDash",
        "keywords": [
            "满足",
            "models",
            "vDash",
            "manzu",
            "语义满足"
        ]
    },
    {
        "display": "⊤",
        "latex": "\top",
        "keywords": [
            "真",
            "true",
            "top",
            "zhen",
            "恒真",
            "tautology"
        ]
    },
    {
        "display": "⊥",
        "latex": "\\bot",
        "keywords": [
            "假",
            "false",
            "bot",
            "jia",
            "恒假",
            "矛盾"
        ]
    },
    {
        "display": "∴",
        "latex": "\therefore",
        "keywords": [
            "所以",
            "therefore",
            "yinshi",
            "所以符号"
        ]
    },
    {
        "display": "∵",
        "latex": "\\because",
        "keywords": [
            "因为",
            "because",
            "yinwei",
            "因为符号"
        ]
    },
    {
        "display": "∎",
        "latex": "\\blacksquare",
        "keywords": [
            "证毕",
            "qed",
            "blacksquare",
            "zhengbi",
            "结束符"
        ]
    },
    {
        "display": "□",
        "latex": "\\square",
        "keywords": [
            "方框",
            "square",
            "fangkuang",
            "待证"
        ]
    },
    {
        "display": "⊕",
        "latex": "\\oplus",
        "keywords": [
            "异或",
            "xor",
            "oplus",
            "yihuo",
            "逻辑异或",
            "exclusive or"
        ]
    },
    {
        "display": "→",
        "latex": "\to",
        "keywords": [
            "箭头",
            "to",
            "arrow",
            "jiantou",
            "右箭头",
            "映射",
            "rightarrow"
        ]
    },
    {
        "display": "←",
        "latex": "\\leftarrow",
        "keywords": [
            "左箭头",
            "left arrow",
            "leftarrow",
            "zuojiantou"
        ]
    },
    {
        "display": "↔",
        "latex": "\\leftrightarrow",
        "keywords": [
            "双向箭头",
            "leftrightarrow",
            "shuangxiangjiantou",
            "等价"
        ]
    },
    {
        "display": "↦",
        "latex": "\\mapsto",
        "keywords": [
            "映射",
            "mapsto",
            "yingshe",
            "映射箭头"
        ]
    },
    {
        "display": "⇒",
        "latex": "\\Rightarrow",
        "keywords": [
            "双箭头",
            "Rightarrow",
            "shuangjiantou",
            "推出"
        ]
    },
    {
        "display": "⇐",
        "latex": "\\Leftarrow",
        "keywords": [
            "左双箭头",
            "Leftarrow",
            "zuoshuangjiantou"
        ]
    },
    {
        "display": "⇔",
        "latex": "\\Leftrightarrow",
        "keywords": [
            "双向双箭头",
            "Leftrightarrow",
            "shuangxiangshuangjiantou",
            "等价"
        ]
    },
    {
        "display": "⇑",
        "latex": "\\Uparrow",
        "keywords": [
            "上双箭头",
            "Uparrow",
            "shangshuangjiantou"
        ]
    },
    {
        "display": "⇓",
        "latex": "\\Downarrow",
        "keywords": [
            "下双箭头",
            "Downarrow",
            "xiashuangjiantou"
        ]
    },
    {
        "display": "↑",
        "latex": "\\uparrow",
        "keywords": [
            "上箭头",
            "up arrow",
            "uparrow",
            "shangjiantou"
        ]
    },
    {
        "display": "↓",
        "latex": "\\downarrow",
        "keywords": [
            "下箭头",
            "down arrow",
            "downarrow",
            "xiajiantou"
        ]
    },
    {
        "display": "↗",
        "latex": "\nearrow",
        "keywords": [
            "右上箭头",
            "nearrow",
            "youshangjiantou",
            "东北箭头"
        ]
    },
    {
        "display": "↘",
        "latex": "\\searrow",
        "keywords": [
            "右下箭头",
            "searrow",
            "youxiajiantou",
            "东南箭头"
        ]
    },
    {
        "display": "↙",
        "latex": "\\swarrow",
        "keywords": [
            "左下箭头",
            "swarrow",
            "zuoxiajiantou",
            "西南箭头"
        ]
    },
    {
        "display": "↖",
        "latex": "\nwarrow",
        "keywords": [
            "左上箭头",
            "nwarrow",
            "zuoshangjiantou",
            "西北箭头"
        ]
    },
    {
        "display": "⟶",
        "latex": "\\longrightarrow",
        "keywords": [
            "长右箭头",
            "longrightarrow",
            "changyoujiantou"
        ]
    },
    {
        "display": "⟵",
        "latex": "\\longleftarrow",
        "keywords": [
            "长左箭头",
            "longleftarrow",
            "changzuojiantou"
        ]
    },
    {
        "display": "⟹",
        "latex": "\\Longrightarrow",
        "keywords": [
            "长双右箭头",
            "Longrightarrow",
            "changshuangyoujiantou"
        ]
    },
    {
        "display": "⟸",
        "latex": "\\Longleftarrow",
        "keywords": [
            "长双左箭头",
            "Longleftarrow",
            "changshuangzuojiantou"
        ]
    },
    {
        "display": "⟺",
        "latex": "\\Longleftrightarrow",
        "keywords": [
            "长双向双箭头",
            "Longleftrightarrow",
            "changshuangxiangshuangjiantou"
        ]
    },
    {
        "display": "↪",
        "latex": "\\hookrightarrow",
        "keywords": [
            "钩箭头",
            "hookrightarrow",
            "goujiantou",
            "单射"
        ]
    },
    {
        "display": "↩",
        "latex": "\\hookleftarrow",
        "keywords": [
            "左钩箭头",
            "hookleftarrow",
            "zuogoujiantou"
        ]
    },
    {
        "display": "⇝",
        "latex": "\\leadsto",
        "keywords": [
            "波浪箭头",
            "leadsto",
            "bolangjiantou"
        ]
    },
    {
        "display": "↠",
        "latex": "\twoheadrightarrow",
        "keywords": [
            "双头箭头",
            "twoheadrightarrow",
            "shuangtoujiantou",
            "满射"
        ]
    },
    {
        "display": "⇢",
        "latex": "\\dashrightarrow",
        "keywords": [
            "虚线箭头",
            "dashrightarrow",
            "xuxianjiantou"
        ]
    },
    {
        "display": "⇠",
        "latex": "\\dashleftarrow",
        "keywords": [
            "左虚线箭头",
            "dashleftarrow",
            "zuoxuxianjiantou"
        ]
    },
    {
        "display": "∠",
        "latex": "\\angle",
        "keywords": [
            "角",
            "angle",
            "jiao",
            "角度"
        ]
    },
    {
        "display": "∡",
        "latex": "\\measuredangle",
        "keywords": [
            "测量角",
            "measured angle",
            "measuredangle",
            "celiangjiao"
        ]
    },
    {
        "display": "∢",
        "latex": "\\sphericalangle",
        "keywords": [
            "球面角",
            "spherical angle",
            "sphericalangle",
            "qiumianjiao"
        ]
    },
    {
        "display": "⊥",
        "latex": "\\perp",
        "keywords": [
            "垂直",
            "perpendicular",
            "perp",
            "chuizhi",
            "正交"
        ]
    },
    {
        "display": "∥",
        "latex": "\\parallel",
        "keywords": [
            "平行",
            "parallel",
            "pingxing",
            "平行线"
        ]
    },
    {
        "display": "∦",
        "latex": "\nparallel",
        "keywords": [
            "不平行",
            "not parallel",
            "nparallel",
            "bupingxing"
        ]
    },
    {
        "display": "≅",
        "latex": "\\cong",
        "keywords": [
            "全等",
            "congruent",
            "cong",
            "quandeng",
            "全等于"
        ]
    },
    {
        "display": "∼",
        "latex": "\\sim",
        "keywords": [
            "相似",
            "similar",
            "sim",
            "xiangsi",
            "相似于"
        ]
    },
    {
        "display": "≁",
        "latex": "\nsim",
        "keywords": [
            "不相似",
            "not similar",
            "nsim",
            "buxiangsi"
        ]
    },
    {
        "display": "≃",
        "latex": "\\simeq",
        "keywords": [
            "相似等于",
            "simeq",
            "xiangsidengyu"
        ]
    },
    {
        "display": "∽",
        "latex": "\\backsim",
        "keywords": [
            "反向相似",
            "backsim",
            "fanxiangxiangsi"
        ]
    },
    {
        "display": "∝",
        "latex": "\\propto",
        "keywords": [
            "正比",
            "proportional",
            "propto",
            "zhengbi",
            "正比于"
        ]
    },
    {
        "display": "∘",
        "latex": "\\circ",
        "keywords": [
            "度",
            "degree",
            "circ",
            "du",
            "度符号",
            "圆圈"
        ]
    },
    {
        "display": "•",
        "latex": "\\bullet",
        "keywords": [
            "点",
            "bullet",
            "dian",
            "圆点",
            "bullet point"
        ]
    },
    {
        "display": "⊙",
        "latex": "\\odot",
        "keywords": [
            "圆点",
            "odot",
            "yuandian",
            "圆心"
        ]
    },
    {
        "display": "⊚",
        "latex": "\\circledcirc",
        "keywords": [
            "双圆",
            "circledcirc",
            "shuangyuan"
        ]
    },
    {
        "display": "⊕",
        "latex": "\\oplus",
        "keywords": [
            "圆加",
            "oplus",
            "yuanjia"
        ]
    },
    {
        "display": "⊗",
        "latex": "\\otimes",
        "keywords": [
            "圆乘",
            "otimes",
            "yuancheng"
        ]
    },
    {
        "display": "△",
        "latex": "\triangle",
        "keywords": [
            "三角形",
            "triangle",
            "sanjiaoxing",
            "delta"
        ]
    },
    {
        "display": "□",
        "latex": "\\square",
        "keywords": [
            "正方形",
            "square",
            "zhengfangxing",
            "方框"
        ]
    },
    {
        "display": "▭",
        "latex": "\rectangle",
        "keywords": [
            "矩形",
            "rectangle",
            "juxing"
        ]
    },
    {
        "display": "◊",
        "latex": "\\lozenge",
        "keywords": [
            "菱形",
            "lozenge",
            "diamond",
            "lingxing"
        ]
    },
    {
        "display": "★",
        "latex": "\\bigstar",
        "keywords": [
            "五角星",
            "bigstar",
            "wujiaoxing",
            "星"
        ]
    },
    {
        "display": "⌒",
        "latex": "\\frown",
        "keywords": [
            "弧",
            "frown",
            "hu",
            "圆弧"
        ]
    },
    {
        "display": "⌢",
        "latex": "\\smile",
        "keywords": [
            "微笑弧",
            "smile",
            "weixiao",
            "弧"
        ]
    },
    {
        "display": "½",
        "latex": "\\frac{1}{2}",
        "keywords": [
            "二分之一",
            "half",
            "one half",
            "erfenzhi",
            "分数"
        ]
    },
    {
        "display": "⅓",
        "latex": "\\frac{1}{3}",
        "keywords": [
            "三分之一",
            "one third",
            "sanfenzhi",
            "分数"
        ]
    },
    {
        "display": "¼",
        "latex": "\\frac{1}{4}",
        "keywords": [
            "四分之一",
            "one quarter",
            "sifenzhi",
            "分数"
        ]
    },
    {
        "display": "⅕",
        "latex": "\\frac{1}{5}",
        "keywords": [
            "五分之一",
            "one fifth",
            "wufenzhi",
            "分数"
        ]
    },
    {
        "display": "⅙",
        "latex": "\\frac{1}{6}",
        "keywords": [
            "六分之一",
            "one sixth",
            "liufenzhi",
            "分数"
        ]
    },
    {
        "display": "⅐",
        "latex": "\\frac{1}{7}",
        "keywords": [
            "七分之一",
            "one seventh",
            "qifenzhi",
            "分数"
        ]
    },
    {
        "display": "⅛",
        "latex": "\\frac{1}{8}",
        "keywords": [
            "八分之一",
            "one eighth",
            "bafenzhi",
            "分数"
        ]
    },
    {
        "display": "⅑",
        "latex": "\\frac{1}{9}",
        "keywords": [
            "九分之一",
            "one ninth",
            "jiufenzhi",
            "分数"
        ]
    },
    {
        "display": "⅒",
        "latex": "\\frac{1}{10}",
        "keywords": [
            "十分之一",
            "one tenth",
            "shifenzhi",
            "分数"
        ]
    },
    {
        "display": "⅔",
        "latex": "\\frac{2}{3}",
        "keywords": [
            "三分之二",
            "two thirds",
            "sanfenzhi",
            "分数"
        ]
    },
    {
        "display": "¾",
        "latex": "\\frac{3}{4}",
        "keywords": [
            "四分之三",
            "three quarters",
            "sifenzhi",
            "分数"
        ]
    },
    {
        "display": "√",
        "latex": "\\sqrt{}",
        "keywords": [
            "根号",
            "sqrt",
            "square root",
            "genhao",
            "平方根"
        ]
    },
    {
        "display": "∛",
        "latex": "\\sqrt[3]{}",
        "keywords": [
            "立方根",
            "cube root",
            "cbrt",
            "lifanggen",
            "三次根"
        ]
    },
    {
        "display": "∜",
        "latex": "\\sqrt[4]{}",
        "keywords": [
            "四次根",
            "fourth root",
            "sicigen"
        ]
    },
    {
        "display": "ⁿ",
        "latex": "^{n}",
        "keywords": [
            "n次方",
            "power n",
            "ncifang",
            "指数",
            "exponent"
        ]
    },
    {
        "display": "a/b",
        "latex": "\\frac{a}{b}",
        "keywords": [
            "分数",
            "fraction",
            "fenshu",
            "分式"
        ]
    },
    {
        "display": "aⁿ",
        "latex": "a^{n}",
        "keywords": [
            "a的n次方",
            "a to the n",
            "acifang",
            "幂",
            "power"
        ]
    },
    {
        "display": "aₙ",
        "latex": "a_{n}",
        "keywords": [
            "a下标n",
            "a sub n",
            "axian",
            "下标",
            "subscript"
        ]
    },
    {
        "display": "√a",
        "latex": "\\sqrt{a}",
        "keywords": [
            "根号a",
            "sqrt a",
            "genhaoa",
            "平方根"
        ]
    },
    {
        "display": "a^{m/n}",
        "latex": "a^{\\frac{m}{n}}",
        "keywords": [
            "分数指数",
            "fractional exponent",
            "fenshuzhishu",
            "有理指数"
        ]
    },
    {
        "display": "e^x",
        "latex": "e^{x}",
        "keywords": [
            "e的x次方",
            "e to the x",
            "ex",
            "指数函数",
            "exponential"
        ]
    },
    {
        "display": "10^x",
        "latex": "10^{x}",
        "keywords": [
            "10的x次方",
            "10 to the x",
            "shicifang",
            "科学计数"
        ]
    },
    {
        "display": "logₐb",
        "latex": "\\log_{a}b",
        "keywords": [
            "对数",
            "log",
            "logarithm",
            "duishu",
            "log base"
        ]
    },
    {
        "display": "Aᵀ",
        "latex": "A^{T}",
        "keywords": [
            "转置",
            "transpose",
            "zhuanzhi",
            "矩阵转置"
        ]
    },
    {
        "display": "A⁻¹",
        "latex": "A^{-1}",
        "keywords": [
            "逆矩阵",
            "inverse",
            "ni",
            "逆",
            "matrix inverse"
        ]
    },
    {
        "display": "A⁺",
        "latex": "A^{+}",
        "keywords": [
            "伪逆",
            "pseudoinverse",
            "weini",
            "moore penrose"
        ]
    },
    {
        "display": "det(A)",
        "latex": "\\det(A)",
        "keywords": [
            "行列式",
            "determinant",
            "hanglieshi",
            "det"
        ]
    },
    {
        "display": "tr(A)",
        "latex": "\\operatorname{tr}(A)",
        "keywords": [
            "迹",
            "trace",
            "ji",
            "矩阵迹"
        ]
    },
    {
        "display": "rank(A)",
        "latex": "\\operatorname{rank}(A)",
        "keywords": [
            "秩",
            "rank",
            "zhi",
            "矩阵秩"
        ]
    },
    {
        "display": "dim(A)",
        "latex": "\\dim(A)",
        "keywords": [
            "维数",
            "dimension",
            "weishu",
            "维度"
        ]
    },
    {
        "display": "ker(A)",
        "latex": "\\ker(A)",
        "keywords": [
            "核",
            "kernel",
            "he",
            "零空间",
            "null space"
        ]
    },
    {
        "display": "Im(A)",
        "latex": "\\operatorname{Im}(A)",
        "keywords": [
            "像",
            "image",
            "xiang",
            "值域",
            "range"
        ]
    },
    {
        "display": "Iₙ",
        "latex": "I_{n}",
        "keywords": [
            "单位矩阵",
            "identity",
            "danwei",
            "单位阵"
        ]
    },
    {
        "display": "0ₙ",
        "latex": "\\mathbf{0}_{n}",
        "keywords": [
            "零矩阵",
            "zero matrix",
            "lingjuzhen"
        ]
    },
    {
        "display": "u·v",
        "latex": "\\mathbf{u} \\cdot \\mathbf{v}",
        "keywords": [
            "点积",
            "dot product",
            "dianji",
            "内积",
            "inner product"
        ]
    },
    {
        "display": "u×v",
        "latex": "\\mathbf{u} \times \\mathbf{v}",
        "keywords": [
            "叉积",
            "cross product",
            "chaji",
            "外积",
            "outer product",
            "向量积"
        ]
    },
    {
        "display": "‖v‖",
        "latex": "\\|\\mathbf{v}\\|",
        "keywords": [
            "范数",
            "norm",
            "fanshu",
            "长度",
            "length",
            "模"
        ]
    },
    {
        "display": "⟨u,v⟩",
        "latex": "\\langle \\mathbf{u}, \\mathbf{v} \rangle",
        "keywords": [
            "内积",
            "inner product",
            "neiji",
            "括号"
        ]
    },
    {
        "display": "Bmatrix",
        "latex": "\\begin{Bmatrix} a & b \\ c & d \\end{Bmatrix}",
        "keywords": [
            "大括号矩阵",
            "Bmatrix",
            "dakuohaojuzhen"
        ]
    },
    {
        "display": "vmatrix",
        "latex": "\\begin{vmatrix} a & b \\ c & d \\end{vmatrix}",
        "keywords": [
            "行列式",
            "vmatrix",
            "hanglieshi"
        ]
    },
    {
        "display": "Vmatrix",
        "latex": "\\begin{Vmatrix} a & b \\ c & d \\end{Vmatrix}",
        "keywords": [
            "范数矩阵",
            "Vmatrix",
            "fanshujuzhen",
            "双竖线"
        ]
    },
    {
        "display": "→",
        "latex": "\rightarrow",
        "keywords": [
            "反应",
            "reaction",
            "fanying",
            "箭头",
            "反应箭头"
        ]
    },
    {
        "display": "⇌",
        "latex": "\rightleftharpoons",
        "keywords": [
            "可逆",
            "reversible",
            "keni",
            "平衡",
            "equilibrium"
        ]
    },
    {
        "display": "⇀",
        "latex": "\rightharpoonup",
        "keywords": [
            "半箭头",
            "harpoon",
            "banjiantou"
        ]
    },
    {
        "display": "↽",
        "latex": "\\leftharpoondown",
        "keywords": [
            "左半箭头",
            "left harpoon",
            "zuobanjiantou"
        ]
    },
    {
        "display": "↑",
        "latex": "\\uparrow",
        "keywords": [
            "气体",
            "gas",
            "qiti",
            "上箭头",
            "气体符号"
        ]
    },
    {
        "display": "↓",
        "latex": "\\downarrow",
        "keywords": [
            "沉淀",
            "precipitate",
            "chendian",
            "下箭头",
            "沉淀符号"
        ]
    },
    {
        "display": "⇅",
        "latex": "\\uparrow\\downarrow",
        "keywords": [
            "气体沉淀",
            "gas precipitate",
            "qitichedian"
        ]
    },
    {
        "display": "H₂O",
        "latex": "\\mathrm{H_2O}",
        "keywords": [
            "水",
            "water",
            "shui",
            "h2o",
            "水分子"
        ]
    },
    {
        "display": "CO₂",
        "latex": "\\mathrm{CO_2}",
        "keywords": [
            "二氧化碳",
            "carbon dioxide",
            "eryanghuatan",
            "co2"
        ]
    },
    {
        "display": "H⁺",
        "latex": "\\mathrm{H^+}",
        "keywords": [
            "氢离子",
            "hydrogen ion",
            "qinglizi",
            "质子"
        ]
    },
    {
        "display": "OH⁻",
        "latex": "\\mathrm{OH^-}",
        "keywords": [
            "氢氧根",
            "hydroxide",
            "qingyanggen",
            "oh"
        ]
    },
    {
        "display": "ΔH",
        "latex": "\\Delta H",
        "keywords": [
            "焓变",
            "enthalpy",
            "hanbian",
            "反应热"
        ]
    },
    {
        "display": "ΔS",
        "latex": "\\Delta S",
        "keywords": [
            "熵变",
            "entropy",
            "shangbian"
        ]
    },
    {
        "display": "ΔG",
        "latex": "\\Delta G",
        "keywords": [
            "吉布斯自由能",
            "gibbs free energy",
            "jibusiziyouneng"
        ]
    },
    {
        "display": "°C",
        "latex": "^{\\circ}\\mathrm{C}",
        "keywords": [
            "摄氏度",
            "celsius",
            "sheshidu",
            "温度"
        ]
    },
    {
        "display": "K",
        "latex": "\\mathrm{K}",
        "keywords": [
            "开尔文",
            "kelvin",
            "kaierwen",
            "温度单位"
        ]
    },
    {
        "display": "mol",
        "latex": "\\mathrm{mol}",
        "keywords": [
            "摩尔",
            "mole",
            "moer",
            "物质的量"
        ]
    },
    {
        "display": "e⁻",
        "latex": "\\mathrm{e^-}",
        "keywords": [
            "电子",
            "electron",
            "dianzi",
            "负电子"
        ]
    },
    {
        "display": "sin",
        "latex": "\\sin",
        "keywords": [
            "正弦",
            "sine",
            "sin",
            "zhengxian",
            "三角函数"
        ]
    },
    {
        "display": "cos",
        "latex": "\\cos",
        "keywords": [
            "余弦",
            "cosine",
            "cos",
            "yuxian",
            "三角函数"
        ]
    },
    {
        "display": "tan",
        "latex": "\tan",
        "keywords": [
            "正切",
            "tangent",
            "tan",
            "zhengqie",
            "三角函数"
        ]
    },
    {
        "display": "cot",
        "latex": "\\cot",
        "keywords": [
            "余切",
            "cotangent",
            "cot",
            "yuqie"
        ]
    },
    {
        "display": "sec",
        "latex": "\\sec",
        "keywords": [
            "正割",
            "secant",
            "sec",
            "zhengge"
        ]
    },
    {
        "display": "csc",
        "latex": "\\csc",
        "keywords": [
            "余割",
            "cosecant",
            "csc",
            "yuge"
        ]
    },
    {
        "display": "arcsin",
        "latex": "\\arcsin",
        "keywords": [
            "反正弦",
            "arcsine",
            "arcsin",
            "fanzhengxian",
            "反三角"
        ]
    },
    {
        "display": "arccos",
        "latex": "\\arccos",
        "keywords": [
            "反余弦",
            "arccosine",
            "arccos",
            "fanyuxian"
        ]
    },
    {
        "display": "arctan",
        "latex": "\\arctan",
        "keywords": [
            "反正切",
            "arctangent",
            "arctan",
            "fanzhengqie"
        ]
    },
    {
        "display": "sinh",
        "latex": "\\sinh",
        "keywords": [
            "双曲正弦",
            "hyperbolic sine",
            "sinh",
            "shuangquzhengxian"
        ]
    },
    {
        "display": "cosh",
        "latex": "\\cosh",
        "keywords": [
            "双曲余弦",
            "hyperbolic cosine",
            "cosh",
            "shuangquyuxian"
        ]
    },
    {
        "display": "tanh",
        "latex": "\tanh",
        "keywords": [
            "双曲正切",
            "hyperbolic tangent",
            "tanh",
            "shuangquzhengqie"
        ]
    },
    {
        "display": "log",
        "latex": "\\log",
        "keywords": [
            "对数",
            "logarithm",
            "log",
            "duishu",
            "常用对数"
        ]
    },
    {
        "display": "ln",
        "latex": "\\ln",
        "keywords": [
            "自然对数",
            "natural log",
            "ln",
            "ziranduishu"
        ]
    },
    {
        "display": "lg",
        "latex": "\\lg",
        "keywords": [
            "常用对数",
            "log base 10",
            "lg",
            "changyongduishu"
        ]
    },
    {
        "display": "exp",
        "latex": "\\exp",
        "keywords": [
            "指数",
            "exponential",
            "exp",
            "zhishu",
            "e的幂"
        ]
    },
    {
        "display": "max",
        "latex": "\\max",
        "keywords": [
            "最大值",
            "maximum",
            "max",
            "zuidazhi"
        ]
    },
    {
        "display": "min",
        "latex": "\\min",
        "keywords": [
            "最小值",
            "minimum",
            "min",
            "zuixiaozhi"
        ]
    },
    {
        "display": "argmax",
        "latex": "\\arg\\max",
        "keywords": [
            "最大参数",
            "argmax",
            "arg max",
            "zuidacanshu"
        ]
    },
    {
        "display": "argmin",
        "latex": "\\arg\\min",
        "keywords": [
            "最小参数",
            "argmin",
            "arg min",
            "zuixiaocanshu"
        ]
    },
    {
        "display": "gcd",
        "latex": "\\gcd",
        "keywords": [
            "最大公约数",
            "greatest common divisor",
            "gcd",
            "zuidagongyueshu"
        ]
    },
    {
        "display": "lcm",
        "latex": "\\operatorname{lcm}",
        "keywords": [
            "最小公倍数",
            "least common multiple",
            "lcm",
            "zuixiaogongbeishu"
        ]
    },
    {
        "display": "mod",
        "latex": "\\mod",
        "keywords": [
            "取模",
            "modulo",
            "mod",
            "qumo",
            "模运算"
        ]
    },
    {
        "display": "sgn",
        "latex": "\\operatorname{sgn}",
        "keywords": [
            "符号函数",
            "sign",
            "sgn",
            "fuhao",
            "正负号"
        ]
    },
    {
        "display": "Re",
        "latex": "\\operatorname{Re}",
        "keywords": [
            "实部",
            "real part",
            "re",
            "shibu"
        ]
    },
    {
        "display": "Im",
        "latex": "\\operatorname{Im}",
        "keywords": [
            "虚部",
            "imaginary part",
            "im",
            "xubu"
        ]
    },
    {
        "display": "deg",
        "latex": "\\deg",
        "keywords": [
            "度",
            "degree",
            "deg",
            "du",
            "角度"
        ]
    },
    {
        "display": "dim",
        "latex": "\\dim",
        "keywords": [
            "维数",
            "dimension",
            "dim",
            "weishu"
        ]
    },
    {
        "display": "ker",
        "latex": "\\ker",
        "keywords": [
            "核",
            "kernel",
            "ker",
            "he"
        ]
    },
    {
        "display": "Pr",
        "latex": "\\Pr",
        "keywords": [
            "概率",
            "probability",
            "pr",
            "gailv"
        ]
    },
    {
        "display": "( )",
        "latex": "()",
        "keywords": [
            "圆括号",
            "parentheses",
            "yuanakuohao",
            "小括号",
            "round brackets"
        ]
    },
    {
        "display": "[ ]",
        "latex": "[]",
        "keywords": [
            "方括号",
            "brackets",
            "fangkuohao",
            "中括号",
            "square brackets"
        ]
    },
    {
        "display": "{ }",
        "latex": "\\begin{cases} \\end{cases}",
        "keywords": [
            "花括号",
            "braces",
            "huakuohao",
            "大括号",
            "curly brackets"
        ]
    },
    {
        "display": "⟨ ⟩",
        "latex": "\\langle \rangle",
        "keywords": [
            "尖括号",
            "angle brackets",
            "jiankuohao",
            "内积括号"
        ]
    },
    {
        "display": "⌊ ⌋",
        "latex": "\\lfloor \rfloor",
        "keywords": [
            "下取整",
            "floor",
            "xiaquzheng",
            "地板函数",
            "floor brackets"
        ]
    },
    {
        "display": "⌈ ⌉",
        "latex": "\\lceil \rceil",
        "keywords": [
            "上取整",
            "ceiling",
            "shangquzheng",
            "天花板函数",
            "ceiling brackets"
        ]
    },
    {
        "display": "∣ ∣",
        "latex": "| |",
        "keywords": [
            "绝对值",
            "absolute value",
            "jueduizhi",
            "竖线",
            "bars"
        ]
    },
    {
        "display": "∥ ∥",
        "latex": "\\| \\|",
        "keywords": [
            "范数",
            "norm",
            "fanshu",
            "双竖线",
            "double bars"
        ]
    },
    {
        "display": "(",
        "latex": "(",
        "keywords": [
            "左圆括号",
            "left parenthesis",
            "zuoyuanakuohao",
            "开括号"
        ]
    },
    {
        "display": ")",
        "latex": ")",
        "keywords": [
            "右圆括号",
            "right parenthesis",
            "youyuanakuohao",
            "闭括号"
        ]
    },
    {
        "display": "[",
        "latex": "[",
        "keywords": [
            "左方括号",
            "left bracket",
            "zuofangkuohao"
        ]
    },
    {
        "display": "]",
        "latex": "]",
        "keywords": [
            "右方括号",
            "right bracket",
            "youfangkuohao"
        ]
    },
    {
        "display": "{",
        "latex": "\\{",
        "keywords": [
            "左花括号",
            "left brace",
            "zuohuakuohao"
        ]
    },
    {
        "display": "}",
        "latex": "\\}",
        "keywords": [
            "右花括号",
            "right brace",
            "youhuakuohao"
        ]
    },
    {
        "display": "⟦ ⟧",
        "latex": "⟦ \\⟧",
        "keywords": [
            "双括号",
            "double brackets",
            "shuangkuohao"
        ]
    },
    {
        "display": "⟮ ⟯",
        "latex": "⟮ \\⟯",
        "keywords": [
            "圆括号变体",
            "parenthesis variant",
            "yuankuohaobianti"
        ]
    },
    {
        "display": "⦃ ⦄",
        "latex": "⦃ \\⦄",
        "keywords": [
            "花括号变体",
            "brace variant",
            "huakuohaobianti"
        ]
    },
    {
        "display": "⦅ ⦆",
        "latex": "⦅ \\⦆",
        "keywords": [
            "双边括号",
            "double paren",
            "shuangbiankuohao"
        ]
    },
    {
        "display": "⦇ ⦈",
        "latex": "⦇ \\⦈",
        "keywords": [
            "z括号",
            "z notation",
            "zkuohao"
        ]
    },
    {
        "display": "⦉ ⦊",
        "latex": "⦉ \\⦊",
        "keywords": [
            "角括号变体",
            "angle variant",
            "jiaokuohaobianti"
        ]
    },
    {
        "display": "a₁",
        "latex": "a_{1}",
        "keywords": [
            "下标",
            "subscript",
            "xiabiao",
            "下标1",
            "a1"
        ]
    },
    {
        "display": "a₂",
        "latex": "a_{2}",
        "keywords": [
            "下标2",
            "subscript 2",
            "xiabiao2",
            "a2"
        ]
    },
    {
        "display": "aₙ",
        "latex": "a_{n}",
        "keywords": [
            "下标n",
            "subscript n",
            "xiabiaon",
            "an"
        ]
    },
    {
        "display": "aᵢ",
        "latex": "a_{i}",
        "keywords": [
            "下标i",
            "subscript i",
            "xiabiaoi",
            "ai"
        ]
    },
    {
        "display": "aⱼ",
        "latex": "a_{j}",
        "keywords": [
            "下标j",
            "subscript j",
            "xiabiaoj",
            "aj"
        ]
    },
    {
        "display": "x²",
        "latex": "x^{2}",
        "keywords": [
            "平方",
            "square",
            "pingfang",
            "x平方",
            "上标2"
        ]
    },
    {
        "display": "x³",
        "latex": "x^{3}",
        "keywords": [
            "立方",
            "cube",
            "lifang",
            "x立方",
            "上标3"
        ]
    },
    {
        "display": "xⁿ",
        "latex": "x^{n}",
        "keywords": [
            "n次方",
            "power n",
            "ncifang",
            "xn",
            "上标n"
        ]
    },
    {
        "display": "eˣ",
        "latex": "e^{x}",
        "keywords": [
            "e的x次方",
            "e to the x",
            "ex",
            "指数"
        ]
    },
    {
        "display": "x̄",
        "latex": "\\bar{x}",
        "keywords": [
            "平均值",
            "bar",
            "pingjunzhi",
            "x bar",
            "均值"
        ]
    },
    {
        "display": "x̂",
        "latex": "\\hat{x}",
        "keywords": [
            "估计值",
            "hat",
            "gujizhi",
            "x hat",
            "估计"
        ]
    },
    {
        "display": "x̃",
        "latex": "\tilde{x}",
        "keywords": [
            "近似值",
            "tilde",
            "jinsizhi",
            "x tilde",
            "波浪号"
        ]
    },
    {
        "display": "ẋ",
        "latex": "\\dot{x}",
        "keywords": [
            "一阶导数",
            "dot",
            "yijiadaoshu",
            "x dot",
            "导数"
        ]
    },
    {
        "display": "ẍ",
        "latex": "\\ddot{x}",
        "keywords": [
            "二阶导数",
            "ddot",
            "erjiadaoshu",
            "x ddot"
        ]
    },
    {
        "display": "x⃗",
        "latex": "\\vec{x}",
        "keywords": [
            "向量",
            "vector",
            "xiangliang",
            "x vec",
            "箭头"
        ]
    },
    {
        "display": "Aᵢⱼ",
        "latex": "A_{ij}",
        "keywords": [
            "双下标",
            "double subscript",
            "shuangxiabiao",
            "aij",
            "矩阵元素"
        ]
    },
    {
        "display": "x†",
        "latex": "x^{\\dagger}",
        "keywords": [
            "共轭转置",
            "dagger",
            "gongezhi",
            "埃尔米特"
        ]
    },
    {
        "display": "x*",
        "latex": "x^{*}",
        "keywords": [
            "共轭",
            "star",
            "gonge",
            "x star",
            "星号"
        ]
    },
    {
        "display": "ℕ",
        "latex": "\\mathbb{N}",
        "keywords": [
            "自然数",
            "natural numbers",
            "n",
            "ziranshu",
            "mathbb"
        ]
    },
    {
        "display": "ℤ",
        "latex": "\\mathbb{Z}",
        "keywords": [
            "整数",
            "integers",
            "z",
            "zhengshu",
            "整数集"
        ]
    },
    {
        "display": "ℚ",
        "latex": "\\mathbb{Q}",
        "keywords": [
            "有理数",
            "rational numbers",
            "q",
            "youlishu",
            "有理数集"
        ]
    },
    {
        "display": "ℝ",
        "latex": "\\mathbb{R}",
        "keywords": [
            "实数",
            "real numbers",
            "r",
            "shishu",
            "实数集"
        ]
    },
    {
        "display": "ℂ",
        "latex": "\\mathbb{C}",
        "keywords": [
            "复数",
            "complex numbers",
            "c",
            "fushu",
            "复数集"
        ]
    },
    {
        "display": "ℙ",
        "latex": "\\mathbb{P}",
        "keywords": [
            "概率",
            "probability",
            "p",
            "gailv",
            "投影"
        ]
    },
    {
        "display": "𝔼",
        "latex": "\\mathbb{E}",
        "keywords": [
            "期望",
            "expectation",
            "e",
            "qiwang",
            "数学期望"
        ]
    },
    {
        "display": "𝕍",
        "latex": "\\mathbb{V}",
        "keywords": [
            "方差",
            "variance",
            "v",
            "fangcha"
        ]
    },
    {
        "display": "ℍ",
        "latex": "\\mathbb{H}",
        "keywords": [
            "四元数",
            "quaternions",
            "h",
            "siyuanshu"
        ]
    },
    {
        "display": "𝕂",
        "latex": "\\mathbb{K}",
        "keywords": [
            "域",
            "field",
            "k",
            "yu",
            "数域"
        ]
    },
    {
        "display": "∇·",
        "latex": "\nabla \\cdot",
        "keywords": [
            "散度",
            "divergence",
            "sadu",
            "div",
            "点乘"
        ]
    },
    {
        "display": "∇×",
        "latex": "\nabla \times",
        "keywords": [
            "旋度",
            "curl",
            "xuandu",
            "rot",
            "叉乘"
        ]
    },
    {
        "display": "∇²",
        "latex": "\nabla^2",
        "keywords": [
            "拉普拉斯",
            "laplacian",
            "lapulasi",
            "laplace"
        ]
    },
    {
        "display": "□",
        "latex": "\\Box",
        "keywords": [
            "方框",
            "box",
            "fangkuang",
            "达朗贝尔"
        ]
    },
    {
        "display": "◊",
        "latex": "\\Diamond",
        "keywords": [
            "菱形",
            "diamond",
            "lingxing"
        ]
    },
    {
        "display": "ℏ",
        "latex": "\\hbar",
        "keywords": [
            "约化普朗克常数",
            "hbar",
            "yuehua",
            "狄拉克常数"
        ]
    },
    {
        "display": "ℓ",
        "latex": "\\ell",
        "keywords": [
            "小写l",
            "ell",
            "script l",
            "xiaoxiel"
        ]
    },
    {
        "display": "℘",
        "latex": "\\wp",
        "keywords": [
            "魏尔斯特拉斯",
            "weierstrass",
            "weierstrass p",
            "weiersitela"
        ]
    },
    {
        "display": "ℜ",
        "latex": "\\Re",
        "keywords": [
            "实部",
            "real part",
            "shibu",
            "花体r"
        ]
    },
    {
        "display": "ℑ",
        "latex": "\\Im",
        "keywords": [
            "虚部",
            "imaginary part",
            "xubu",
            "花体i"
        ]
    },
    {
        "display": "ℵ",
        "latex": "\\aleph",
        "keywords": [
            "阿列夫",
            "aleph",
            "aliefu",
            "无穷基数"
        ]
    },
    {
        "display": "ℶ",
        "latex": "\\beth",
        "keywords": [
            "贝斯",
            "beth",
            "beisi",
            "连续统"
        ]
    },
    {
        "display": "∂",
        "latex": "\\partial",
        "keywords": [
            "偏微分",
            "partial",
            "piandao",
            "偏导"
        ]
    },
    {
        "display": "∞",
        "latex": "\\infty",
        "keywords": [
            "无穷",
            "infinity",
            "wuqiong",
            "无穷大",
            "无限"
        ]
    },
    {
        "display": "℧",
        "latex": "\\mho",
        "keywords": [
            "姆欧",
            "mho",
            "muou",
            "电导"
        ]
    },
    {
        "display": "∡",
        "latex": "\\measuredangle",
        "keywords": [
            "测量角",
            "measured angle",
            "celiangjiao"
        ]
    }
];

const BUILTIN_EMOJI_CATEGORIES = {
    "常用": [
        "😀",
        "😁",
        "😂",
        "😃",
        "😄",
        "😅",
        "😆",
        "😉",
        "😊",
        "😋",
        "😎",
        "😍",
        "😘",
        "😗",
        "😙",
        "😚",
        "🙂",
        "🤗",
        "🤔",
        "😐",
        "😑",
        "😶",
        "🙄",
        "😏",
        "😣",
        "😥",
        "😮",
        "🤐",
        "😯",
        "😪",
        "😫",
        "😴",
        "😌",
        "😛",
        "😜",
        "😝",
        "🤤",
        "😒",
        "😓",
        "😔",
        "😕",
        "🙃",
        "🤑",
        "😲",
        "☹️",
        "🙁",
        "😖",
        "😞",
        "😟",
        "😤",
        "😢",
        "😭",
        "😦",
        "😧",
        "😨",
        "😩",
        "🤯",
        "😬",
        "😰",
        "😱",
        "😳",
        "🤪",
        "😵",
        "😡",
        "😠",
        "🤬",
        "😷",
        "🤒",
        "🤕",
        "🤢",
        "🤮",
        "🤧",
        "😇",
        "🤠",
        "🤡",
        "🤥",
        "🤫",
        "🤭",
        "🧐",
        "🤓",
        "😈",
        "👿",
        "👹",
        "👺",
        "💀",
        "👻",
        "👽",
        "🤖",
        "💩",
        "😺",
        "😸",
        "😹",
        "😻",
        "😼",
        "😽",
        "🙀",
        "😿",
        "😾"
    ],
    "手势": [
        "👏",
        "🙌",
        "👐",
        "🤲",
        "🤝",
        "👍",
        "👎",
        "👊",
        "✊",
        "🤛",
        "🤜",
        "🤞",
        "✌️",
        "🤟",
        "🤘",
        "👌",
        "🤏",
        "👈",
        "👉",
        "👆",
        "👇",
        "☝️",
        "✋",
        "🤚",
        "🖐️",
        "🖖",
        "👋",
        "🤙",
        "💪",
        "🦾",
        "🖕",
        "✍️",
        "🙏"
    ],
    "物品": [
        "⌚",
        "📱",
        "📲",
        "💻",
        "⌨️",
        "🖥️",
        "🖨️",
        "🖱️",
        "🖲️",
        "🎮",
        "🕹️",
        "🗜️",
        "💾",
        "💿",
        "📀",
        "📼",
        "📷",
        "📸",
        "📹",
        "🎥",
        "📽️",
        "🎞️",
        "📞",
        "☎️",
        "📟",
        "📠",
        "📺",
        "📻",
        "🎙️",
        "🎚️",
        "🎛️",
        "🧭",
        "⏱️",
        "⏲️",
        "⏰",
        "🕰️",
        "⌛",
        "⏳",
        "📡",
        "🔋",
        "🔌",
        "💡",
        "🔦",
        "🕯️",
        "🪔",
        "🧯",
        "🛢️",
        "💸",
        "💵",
        "💴",
        "💶",
        "💷",
        "💰",
        "💳",
        "💎"
    ],
    "符号": [
        "❤️",
        "🧡",
        "💛",
        "💚",
        "💙",
        "💜",
        "🖤",
        "🤍",
        "🤎",
        "💔",
        "❣️",
        "💕",
        "💞",
        "💓",
        "💗",
        "💖",
        "💘",
        "💝",
        "💟",
        "☮️",
        "✝️",
        "☪️",
        "🕉️",
        "☸️",
        "✡️",
        "🔯",
        "🕎",
        "☯️",
        "☦️",
        "🛐",
        "⛎",
        "♈",
        "♉",
        "♊",
        "♋",
        "♌",
        "♍",
        "♎",
        "♏",
        "♐",
        "♑",
        "♒",
        "♓",
        "🆔",
        "⚛️",
        "🉑",
        "☢️",
        "☣️",
        "📴",
        "📳",
        "🈶",
        "🈚",
        "🈸",
        "🈺",
        "🈷️",
        "✴️",
        "🆚",
        "💮",
        "🉐",
        "㊙️",
        "㊗️",
        "🈴",
        "🈵",
        "🈹",
        "🈲",
        "🅰️",
        "🅱️",
        "🆎",
        "🆑",
        "🅾️",
        "🆘",
        "❌",
        "⭕",
        "🛑",
        "⛔",
        "📛",
        "🚫",
        "💯",
        "💢",
        "♨️",
        "🚷",
        "🚯",
        "🚳",
        "🚱",
        "🔞",
        "📵",
        "🚭"
    ]
};

const BUILTIN_EMOJI_DESCRIPTIONS = {
    "😀": {
        "zh": "咧嘴笑",
        "en": "grinning face",
        "aliases": [
            "smile",
            "happy"
        ]
    },
    "😁": {
        "zh": "露齿笑",
        "en": "beaming smile",
        "aliases": [
            "grin"
        ]
    },
    "😂": {
        "zh": "笑哭",
        "en": "face with tears of joy",
        "aliases": [
            "lol",
            "laugh"
        ]
    },
    "🤣": {
        "zh": "笑到打滚",
        "en": "rolling on the floor laughing",
        "aliases": [
            "rofl"
        ]
    },
    "😃": {
        "zh": "开心笑",
        "en": "smiling face",
        "aliases": [
            "happy"
        ]
    },
    "😄": {
        "zh": "眯眼笑",
        "en": "smiling eyes",
        "aliases": [
            "smile"
        ]
    },
    "😅": {
        "zh": "苦笑",
        "en": "grinning with sweat",
        "aliases": [
            "awkward"
        ]
    },
    "😉": {
        "zh": "眨眼",
        "en": "winking face",
        "aliases": [
            "wink"
        ]
    },
    "😊": {
        "zh": "微笑",
        "en": "smiling face with blush",
        "aliases": [
            "blush"
        ]
    },
    "😋": {
        "zh": "馋嘴",
        "en": "face savoring food",
        "aliases": [
            "yummy"
        ]
    },
    "😎": {
        "zh": "墨镜笑",
        "en": "cool face",
        "aliases": [
            "cool"
        ]
    },
    "😍": {
        "zh": "爱心眼",
        "en": "smiling with heart eyes",
        "aliases": [
            "love"
        ]
    },
    "😘": {
        "zh": "飞吻",
        "en": "face blowing a kiss",
        "aliases": [
            "kiss"
        ]
    },
    "🙂": {
        "zh": "轻微微笑",
        "en": "slightly smiling face",
        "aliases": [
            "smile"
        ]
    },
    "🤗": {
        "zh": "拥抱",
        "en": "hugging face",
        "aliases": [
            "hug"
        ]
    },
    "🤔": {
        "zh": "思考",
        "en": "thinking face",
        "aliases": [
            "think"
        ]
    },
    "😐": {
        "zh": "无语",
        "en": "neutral face",
        "aliases": [
            "neutral"
        ]
    },
    "🙄": {
        "zh": "白眼",
        "en": "face with rolling eyes",
        "aliases": [
            "eyeroll"
        ]
    },
    "😏": {
        "zh": "得意",
        "en": "smirking face",
        "aliases": [
            "smirk"
        ]
    },
    "😔": {
        "zh": "失落",
        "en": "pensive face",
        "aliases": [
            "sad"
        ]
    },
    "😢": {
        "zh": "哭泣",
        "en": "crying face",
        "aliases": [
            "cry"
        ]
    },
    "😭": {
        "zh": "大哭",
        "en": "loudly crying face",
        "aliases": [
            "sob"
        ]
    },
    "😤": {
        "zh": "气呼呼",
        "en": "face with steam from nose",
        "aliases": [
            "angry"
        ]
    },
    "😡": {
        "zh": "生气",
        "en": "pouting face",
        "aliases": [
            "angry",
            "mad"
        ]
    },
    "🤬": {
        "zh": "爆粗口",
        "en": "face with symbols on mouth",
        "aliases": [
            "swear"
        ]
    },
    "😱": {
        "zh": "惊恐",
        "en": "screaming in fear",
        "aliases": [
            "shock",
            "scared"
        ]
    },
    "😴": {
        "zh": "睡觉",
        "en": "sleeping face",
        "aliases": [
            "sleep"
        ]
    },
    "😷": {
        "zh": "戴口罩",
        "en": "face with medical mask",
        "aliases": [
            "mask",
            "sick"
        ]
    },
    "🤒": {
        "zh": "发烧",
        "en": "face with thermometer",
        "aliases": [
            "fever"
        ]
    },
    "🤮": {
        "zh": "呕吐",
        "en": "face vomiting",
        "aliases": [
            "vomit"
        ]
    },
    "🤧": {
        "zh": "打喷嚏",
        "en": "sneezing face",
        "aliases": [
            "sneeze"
        ]
    },
    "😇": {
        "zh": "天使笑",
        "en": "smiling face with halo",
        "aliases": [
            "angel"
        ]
    },
    "🤡": {
        "zh": "小丑",
        "en": "clown face",
        "aliases": [
            "clown"
        ]
    },
    "👻": {
        "zh": "幽灵",
        "en": "ghost",
        "aliases": [
            "ghost"
        ]
    },
    "🤖": {
        "zh": "机器人",
        "en": "robot",
        "aliases": [
            "robot",
            "ai"
        ]
    },
    "💩": {
        "zh": "便便",
        "en": "pile of poo",
        "aliases": [
            "poo"
        ]
    },
    "😺": {
        "zh": "笑脸猫",
        "en": "grinning cat",
        "aliases": [
            "cat"
        ]
    },
    "😿": {
        "zh": "哭泣猫",
        "en": "crying cat",
        "aliases": [
            "cat",
            "sad"
        ]
    },
    "👏": {
        "zh": "鼓掌",
        "en": "clapping hands",
        "aliases": [
            "clap"
        ]
    },
    "🙌": {
        "zh": "举手欢呼",
        "en": "raising hands",
        "aliases": [
            "hooray"
        ]
    },
    "🤝": {
        "zh": "握手",
        "en": "handshake",
        "aliases": [
            "deal"
        ]
    },
    "👍": {
        "zh": "点赞",
        "en": "thumbs up",
        "aliases": [
            "like",
            "ok"
        ]
    },
    "👎": {
        "zh": "点踩",
        "en": "thumbs down",
        "aliases": [
            "dislike"
        ]
    },
    "👊": {
        "zh": "拳头",
        "en": "oncoming fist",
        "aliases": [
            "fist"
        ]
    },
    "✌️": {
        "zh": "剪刀手",
        "en": "victory hand",
        "aliases": [
            "victory"
        ]
    },
    "👌": {
        "zh": "OK 手势",
        "en": "ok hand",
        "aliases": [
            "ok"
        ]
    },
    "👈": {
        "zh": "左指",
        "en": "backhand index pointing left",
        "aliases": [
            "left"
        ]
    },
    "👉": {
        "zh": "右指",
        "en": "backhand index pointing right",
        "aliases": [
            "right"
        ]
    },
    "👆": {
        "zh": "上指",
        "en": "backhand index pointing up",
        "aliases": [
            "up"
        ]
    },
    "👇": {
        "zh": "下指",
        "en": "backhand index pointing down",
        "aliases": [
            "down"
        ]
    },
    "👋": {
        "zh": "挥手",
        "en": "waving hand",
        "aliases": [
            "wave",
            "hello"
        ]
    },
    "💪": {
        "zh": "肌肉",
        "en": "flexed biceps",
        "aliases": [
            "strong"
        ]
    },
    "✍️": {
        "zh": "写字",
        "en": "writing hand",
        "aliases": [
            "write"
        ]
    },
    "🙏": {
        "zh": "祈祷",
        "en": "folded hands",
        "aliases": [
            "pray",
            "thanks"
        ]
    },
    "📱": {
        "zh": "手机",
        "en": "mobile phone",
        "aliases": [
            "phone"
        ]
    },
    "💻": {
        "zh": "笔记本电脑",
        "en": "laptop",
        "aliases": [
            "computer"
        ]
    },
    "⌨️": {
        "zh": "键盘",
        "en": "keyboard",
        "aliases": [
            "typing"
        ]
    },
    "🖱️": {
        "zh": "鼠标",
        "en": "computer mouse",
        "aliases": [
            "mouse"
        ]
    },
    "🎮": {
        "zh": "游戏手柄",
        "en": "video game",
        "aliases": [
            "game"
        ]
    },
    "📷": {
        "zh": "相机",
        "en": "camera",
        "aliases": [
            "photo"
        ]
    },
    "📸": {
        "zh": "拍照",
        "en": "camera with flash",
        "aliases": [
            "snapshot"
        ]
    },
    "📹": {
        "zh": "摄像机",
        "en": "video camera",
        "aliases": [
            "video"
        ]
    },
    "📞": {
        "zh": "电话",
        "en": "telephone receiver",
        "aliases": [
            "call"
        ]
    },
    "📺": {
        "zh": "电视",
        "en": "television",
        "aliases": [
            "tv"
        ]
    },
    "📻": {
        "zh": "收音机",
        "en": "radio",
        "aliases": [
            "radio"
        ]
    },
    "⏰": {
        "zh": "闹钟",
        "en": "alarm clock",
        "aliases": [
            "clock"
        ]
    },
    "🔋": {
        "zh": "电池",
        "en": "battery",
        "aliases": [
            "power"
        ]
    },
    "💡": {
        "zh": "灯泡",
        "en": "light bulb",
        "aliases": [
            "idea"
        ]
    },
    "💰": {
        "zh": "钱袋",
        "en": "money bag",
        "aliases": [
            "money"
        ]
    },
    "💳": {
        "zh": "银行卡",
        "en": "credit card",
        "aliases": [
            "card",
            "pay"
        ]
    },
    "💎": {
        "zh": "钻石",
        "en": "gem stone",
        "aliases": [
            "diamond"
        ]
    },
    "❤️": {
        "zh": "红心",
        "en": "red heart",
        "aliases": [
            "love",
            "heart"
        ]
    },
    "💔": {
        "zh": "心碎",
        "en": "broken heart",
        "aliases": [
            "heartbreak"
        ]
    },
    "💕": {
        "zh": "双心",
        "en": "two hearts",
        "aliases": [
            "love"
        ]
    },
    "💯": {
        "zh": "一百分",
        "en": "hundred points",
        "aliases": [
            "100"
        ]
    },
    "❌": {
        "zh": "叉号",
        "en": "cross mark",
        "aliases": [
            "x",
            "no"
        ]
    },
    "⭕": {
        "zh": "圆圈",
        "en": "hollow red circle",
        "aliases": [
            "circle",
            "yes"
        ]
    },
    "🛑": {
        "zh": "停止",
        "en": "stop sign",
        "aliases": [
            "stop"
        ]
    },
    "🚫": {
        "zh": "禁止",
        "en": "prohibited",
        "aliases": [
            "forbidden"
        ]
    }
};

const BUILTIN_MERMAID_TEMPLATES = [
    {
        "nameKey": "mermaidCharts",
        "keywords": [
            "flowchart",
            "流程图",
            "flow"
        ],
        "descKey": "flowchartDescription"
    },
    {
        "nameKey": "sequenceDiagram",
        "keywords": [
            "sequence",
            "序列图",
            "时序图"
        ],
        "descKey": "sequenceDiagramDescription"
    },
    {
        "nameKey": "classDiagram",
        "keywords": [
            "class",
            "类图",
            "classDiagram"
        ],
        "descKey": "classDiagramDescription"
    },
    {
        "nameKey": "stateDiagram",
        "keywords": [
            "state",
            "状态图",
            "stateDiagram"
        ],
        "descKey": "stateDiagramDescription"
    },
    {
        "nameKey": "ganttChart",
        "keywords": [
            "gantt",
            "甘特图",
            "project"
        ],
        "descKey": "ganttChartDescription"
    },
    {
        "nameKey": "pieChart",
        "keywords": [
            "pie",
            "饼图",
            "比例"
        ],
        "descKey": "pieChartDescription"
    },
    {
        "nameKey": "lineChart",
        "keywords": [
            "line",
            "折线图",
            "趋势"
        ],
        "descKey": "lineChartDescription"
    },
    {
        "nameKey": "barChart",
        "keywords": [
            "bar",
            "柱状图",
            "条形图"
        ],
        "descKey": "barChartDescription"
    },
    {
        "nameKey": "erDiagram",
        "keywords": [
            "er",
            "er图",
            "entity"
        ],
        "descKey": "erDiagramDescription"
    },
    {
        "nameKey": "userJourney",
        "keywords": [
            "journey",
            "用户旅程"
        ],
        "descKey": "userJourneyDescription"
    },
    {
        "nameKey": "gitGraph",
        "keywords": [
            "git",
            "git graph",
            "分支"
        ],
        "descKey": "gitGraphDescription"
    },
    {
        "nameKey": "mindmap",
        "keywords": [
            "mindmap",
            "思维导图",
            "mind"
        ],
        "descKey": "mindmapDescription"
    },
    {
        "nameKey": "timeline",
        "keywords": [
            "timeline",
            "时间线",
            "历史"
        ],
        "descKey": "timelineDescription"
    },
    {
        "nameKey": "c4Diagram",
        "keywords": [
            "c4",
            "架构图",
            "architecture"
        ],
        "descKey": "c4DiagramDescription"
    },
    {
        "nameKey": "networkDiagram",
        "keywords": [
            "network",
            "网络图",
            "拓扑"
        ],
        "descKey": "networkDiagramDescription"
    }
];

function isEn() {
    return !!(window.i18n && window.i18n.getLanguage && window.i18n.getLanguage() === 'en');
}

function t(key) {
    return window.i18n && typeof window.i18n.t === 'function' ? window.i18n.t(key) : key;
}

function mermaidTemplateCode(keywords) {
    if (Array.isArray(keywords) && keywords.indexOf("sequence") !== -1) {
        return "```mermaid\nsequenceDiagram\n    participant A as A\n    participant B as B\n    A->>B: Message\n```";
    }
    if (Array.isArray(keywords) && keywords.indexOf("class") !== -1) {
        return "```mermaid\nclassDiagram\n    Animal <|-- Dog\n```";
    }
    return "```mermaid\ngraph TD\n    A[开始] --> B[步骤]\n```";
}

export function getBuiltinSlashEntries() {
    const entries = [];

    for (let i = 0; i < BUILTIN_FORMULA_ITEMS.length; i++) {
        const item = BUILTIN_FORMULA_ITEMS[i];
        entries.push({
            id: 'builtin-formula-' + i,
            group: 'math',
            groupLabel: isEn() ? 'Formula' : '公式',
            titleZh: '公式 ' + item.display,
            titleEn: 'Formula ' + item.display,
            descriptionZh: item.latex,
            descriptionEn: item.latex,
            action: '',
            icon: 'fas fa-superscript',
            insertText: item.latex,
            keywords: ['公式', 'latex', item.display, item.latex].concat(item.keywords || []),
            aliases: [item.display, item.latex],
            score: 0
        });
    }

    const categories = Object.keys(BUILTIN_EMOJI_CATEGORIES);
    for (let c = 0; c < categories.length; c++) {
        const category = categories[c];
        const list = BUILTIN_EMOJI_CATEGORIES[category] || [];
        for (let i = 0; i < list.length; i++) {
            const emoji = list[i];
            const meta = BUILTIN_EMOJI_DESCRIPTIONS[emoji] || {};
            entries.push({
                id: 'builtin-emoji-' + c + '-' + i,
                group: 'insert',
                groupLabel: isEn() ? 'Insert' : '插入',
                titleZh: '表情 ' + (meta.zh || category),
                titleEn: 'Emoji ' + (meta.en || category),
                descriptionZh: emoji + ' · ' + category,
                descriptionEn: emoji + ' · ' + category,
                action: '',
                icon: 'fas fa-face-smile',
                insertText: emoji,
                keywords: ['emoji', '表情', category, emoji].concat(meta.aliases || []),
                aliases: [emoji, meta.zh || '', meta.en || ''].filter(Boolean),
                score: 0
            });
        }
    }

    for (let i = 0; i < BUILTIN_MERMAID_TEMPLATES.length; i++) {
        const tpl = BUILTIN_MERMAID_TEMPLATES[i];
        const name = t(tpl.nameKey);
        const desc = t(tpl.descKey);
        entries.push({
            id: 'builtin-mermaid-' + i,
            group: 'chart',
            groupLabel: isEn() ? 'Chart' : '图表',
            titleZh: 'Mermaid ' + name,
            titleEn: 'Mermaid ' + name,
            descriptionZh: desc,
            descriptionEn: desc,
            action: '',
            icon: 'fas fa-diagram-project',
            insertText: mermaidTemplateCode(tpl.keywords),
            keywords: ['mermaid', '图表', 'diagram'].concat(tpl.keywords || []),
            aliases: [name].concat(tpl.keywords || []),
            score: 0
        });
    }

    // 插入操作（图片、文件、链接等）
    const insertOperations = [
        {
            id: 'insert-image',
            titleZh: '图片',
            titleEn: 'Image',
            descriptionZh: '上传图片并插入到文档中',
            descriptionEn: 'Upload and insert image',
            action: 'uploadImage',
            icon: 'fas fa-image',
            keywords: ['图片', 'image', 'upload', '上传', 'tp', 'tupian', 'img'],
            aliases: ['图片', 'image', 'tp', 'tupian', 'img']
        },
        {
            id: 'insert-file',
            titleZh: '文件',
            titleEn: 'File',
            descriptionZh: '上传文件并插入到文档中',
            descriptionEn: 'Upload and insert file',
            action: 'uploadFile',
            icon: 'fas fa-file-upload',
            keywords: ['文件', 'file', 'upload', '上传'],
            aliases: ['文件', 'file']
        },
        {
            id: 'insert-webimage',
            titleZh: '网络图片',
            titleEn: 'Web Image',
            descriptionZh: '插入网络图片链接',
            descriptionEn: 'Insert web image URL',
            action: '',
            icon: 'fas fa-globe',
            insertText: '![图片描述](图片地址)',
            keywords: ['网络图片', 'web', 'image', 'url', '链接'],
            aliases: ['网络图片', 'web image']
        },
        {
            id: 'insert-link',
            titleZh: '链接',
            titleEn: 'Link',
            descriptionZh: '插入超链接',
            descriptionEn: 'Insert hyperlink',
            action: '',
            icon: 'fas fa-link',
            insertText: '[链接文字](https://)',
            keywords: ['链接', 'link', '超链接'],
            aliases: ['链接', 'link']
        },
        {
            id: 'insert-table',
            titleZh: '表格',
            titleEn: 'Table',
            descriptionZh: '插入表格',
            descriptionEn: 'Insert table',
            action: 'table',
            icon: 'fas fa-table',
            keywords: ['表格', 'table'],
            aliases: ['表格', 'table']
        },
        {
            id: 'insert-emoji',
            titleZh: '表情',
            titleEn: 'Emoji',
            descriptionZh: '插入表情符号',
            descriptionEn: 'Insert emoji',
            action: 'emoji',
            icon: 'fas fa-smile',
            keywords: ['表情', 'emoji'],
            aliases: ['表情', 'emoji']
        },
        {
            id: 'insert-formula',
            titleZh: '公式',
            titleEn: 'Formula',
            descriptionZh: '插入数学公式',
            descriptionEn: 'Insert math formula',
            action: 'formula',
            icon: 'fas fa-superscript',
            keywords: ['公式', 'formula', 'latex', '数学'],
            aliases: ['公式', 'formula']
        },
        {
            id: 'insert-chart',
            titleZh: '图表',
            titleEn: 'Chart',
            descriptionZh: '插入图表（Mermaid）',
            descriptionEn: 'Insert chart (Mermaid)',
            action: 'chart',
            icon: 'fas fa-chart-bar',
            keywords: ['图表', 'chart', 'mermaid'],
            aliases: ['图表', 'chart']
        },
        {
            id: 'insert-footnote',
            titleZh: '脚注',
            titleEn: 'Footnote',
            descriptionZh: '插入脚注',
            descriptionEn: 'Insert footnote',
            action: 'footnote',
            icon: 'fas fa-sticky-note',
            keywords: ['脚注', 'footnote', 'note'],
            aliases: ['脚注', 'footnote']
        },
        {
            id: 'insert-mindmap',
            titleZh: '脑图',
            titleEn: 'Mind Map',
            descriptionZh: '插入思维导图',
            descriptionEn: 'Insert mind map',
            action: 'mindmap',
            icon: 'fas fa-brain',
            keywords: ['脑图', 'mindmap', '思维导图'],
            aliases: ['脑图', 'mindmap']
        }
    ];

    for (let i = 0; i < insertOperations.length; i++) {
        const op = insertOperations[i];
        entries.push({
            id: op.id,
            group: 'insert',
            groupLabel: isEn() ? 'Insert' : '插入',
            titleZh: op.titleZh,
            titleEn: op.titleEn,
            descriptionZh: op.descriptionZh,
            descriptionEn: op.descriptionEn,
            action: op.action,
            icon: op.icon,
            insertText: op.insertText || '',
            keywords: op.keywords,
            aliases: op.aliases,
            score: 0
        });
    }

    return entries;
}
