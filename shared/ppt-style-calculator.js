/**
 * PPT 样式计算模块
 * 统一前后端的样式计算逻辑，确保预览和导出效果一致
 */

// 字体大小映射表（基于 10 英寸宽度的 16:9 幻灯片）
const FONT_SIZE_MAP = {
    title_cover: { vw: 5.2, pt: 38, min: 28 },
    title_normal: { vw: 3.8, pt: 30, min: 22 },
    subtitle: { vw: 2.0, pt: 16, min: 12 },
    bullet_main: { vw: 2.1, pt: 17, min: 12 },
    bullet_sub: { vw: 1.5, pt: 13, min: 10 },
    toc_number: { vw: 1.0, pt: 10, min: 9 },
    toc_item: { vw: 1.2, pt: 12, min: 10 },
    timeline_title: { vw: 2.0, pt: 15, min: 12 },
    timeline_desc: { vw: 1.4, pt: 11, min: 9 },
    stat_label: { vw: 1.0, pt: 10, min: 9 },
    stat_value: { vw: 2.4, pt: 24, min: 14 },
    stat_note: { vw: 0.9, pt: 9, min: 8 },
    quote_text: { vw: 2.8, pt: 28, min: 16 },
    quote_author: { vw: 1.2, pt: 12, min: 10 },
    page_number: { vw: 0.9, pt: 9, min: 8 }
};

// 边距映射表
const MARGIN_MAP = {
    slide: { percent: 5.5, inch: 0.55 },
    card_padding: { percent: 1.2, inch: 0.12 },
    card_gap: { percent: 2.2, inch: 0.22 },
    column_gap: { percent: 3.5, inch: 0.35 }
};

// 装饰元素尺寸映射
const DECORATION_MAP = {
    left_bar: { widthPercent: 2.4, widthInch: 0.24 },
    top_circle: { widthPercent: 26, widthInch: 2.6, heightPercent: 37, heightInch: 2.1 },
    bottom_rect: { widthPercent: 18, widthInch: 1.8, heightPercent: 11.5, heightInch: 0.65 }
};

// 透明度映射（CSS rgba alpha 值 -> PptxGenJS transparency 值）
const TRANSPARENCY_MAP = {
    // CSS alpha (0-1) -> PptxGenJS transparency (0-100)
    // transparency = (1 - alpha) * 100
    toTransparency: function(alpha) {
        return Math.round((1 - alpha) * 100);
    },
    fromTransparency: function(transparency) {
        return 1 - (transparency / 100);
    }
};

/**
 * 根据内容长度动态计算字体大小
 * @param {number} basePt - 基础字体大小（pt）
 * @param {number} minPt - 最小字体大小（pt）
 * @param {number} length - 内容长度
 * @returns {number} 计算后的字体大小（pt）
 */
function fitFontByLength(basePt, minPt, length) {
    if (!length || length <= 14) return basePt;
    if (length >= 70) return minPt;

    const ratio = (length - 14) / (70 - 14);
    return Math.max(minPt, Math.round(basePt - (basePt - minPt) * ratio));
}

/**
 * 获取字体大小（前端使用 vw，后端使用 pt）
 * @param {string} type - 字体类型
 * @param {string} unit - 单位类型 ('vw' 或 'pt')
 * @param {number} contentLength - 内容长度（可选，用于动态调整）
 * @returns {number|string} 字体大小
 */
function getFontSize(type, unit, contentLength) {
    const map = FONT_SIZE_MAP[type];
    if (!map) return unit === 'vw' ? '2vw' : 16;

    if (contentLength) {
        const adjustedPt = fitFontByLength(map.pt, map.min, contentLength);
        if (unit === 'vw') {
            // 根据调整后的 pt 值计算对应的 vw
            const ratio = adjustedPt / map.pt;
            return (map.vw * ratio).toFixed(1) + 'vw';
        }
        return adjustedPt;
    }

    return unit === 'vw' ? map.vw + 'vw' : map.pt;
}

/**
 * 获取边距值
 * @param {string} type - 边距类型
 * @param {string} unit - 单位类型 ('percent' 或 'inch')
 * @returns {number|string} 边距值
 */
function getMargin(type, unit) {
    const map = MARGIN_MAP[type];
    if (!map) return unit === 'percent' ? '5.5%' : 0.55;

    return unit === 'percent' ? map.percent + '%' : map.inch;
}

/**
 * 获取装饰元素尺寸
 * @param {string} type - 装饰元素类型
 * @param {string} unit - 单位类型 ('percent' 或 'inch')
 * @returns {Object} 尺寸对象
 */
function getDecorationSize(type, unit) {
    const map = DECORATION_MAP[type];
    if (!map) return {};

    if (unit === 'percent') {
        return {
            width: map.widthPercent + '%',
            height: map.heightPercent ? map.heightPercent + '%' : undefined
        };
    } else {
        return {
            width: map.widthInch,
            height: map.heightInch || undefined
        };
    }
}

/**
 * 转换透明度值
 * @param {number} value - 输入值
 * @param {string} from - 源格式 ('alpha' 或 'transparency')
 * @returns {number} 转换后的值
 */
function convertTransparency(value, from) {
    if (from === 'alpha') {
        return TRANSPARENCY_MAP.toTransparency(value);
    } else {
        return TRANSPARENCY_MAP.fromTransparency(value);
    }
}

/**
 * 获取幻灯片尺寸
 * @param {string} ratio - 比例 ('16:9' 或 '4:3')
 * @returns {Object} 尺寸对象 { width, height }
 */
function getSlideSize(ratio) {
    return ratio === '16:9'
        ? { width: 10, height: 5.625 }
        : { width: 10, height: 7.5 };
}

// 导出（支持 CommonJS 和浏览器环境）
if (typeof module !== 'undefined' && module.exports) {
    // Node.js 环境
    module.exports = {
        FONT_SIZE_MAP,
        MARGIN_MAP,
        DECORATION_MAP,
        TRANSPARENCY_MAP,
        fitFontByLength,
        getFontSize,
        getMargin,
        getDecorationSize,
        convertTransparency,
        getSlideSize
    };
} else if (typeof window !== 'undefined') {
    // 浏览器环境
    window.PPTStyleCalculator = {
        FONT_SIZE_MAP,
        MARGIN_MAP,
        DECORATION_MAP,
        TRANSPARENCY_MAP,
        fitFontByLength,
        getFontSize,
        getMargin,
        getDecorationSize,
        convertTransparency,
        getSlideSize
    };
}
