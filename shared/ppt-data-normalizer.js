/**
 * PPT 数据规范化模块
 * 统一前后端的数据验证和规范化逻辑
 */

// 统一的长度限制
const LENGTH_LIMITS = {
    title: 56,
    subtitle: 88,
    bullet: 42,
    subBullet: 30,
    statLabel: 18,
    statValue: 20,
    statNote: 28,
    sectionTitle: 42,
    imageCaption: 46
};

// 统一的数量限制
const COUNT_LIMITS = {
    bullets: 8,
    subBulletsPerBullet: 2,
    sections: 8,
    itemsPerSection: 6,
    stats: 6,
    highlights: 4
};

// 字段别名映射
const FIELD_ALIASES = {
    bullets: ['bullets', 'points', 'items', '要点'],
    sections: ['sections', 'columns', 'groups'],
    stats: ['stats', 'metrics', 'dataCards'],
    highlights: ['highlights', 'keywords', 'tags']
};

/**
 * 清理和截断文本
 * @param {string} text - 原始文本
 * @param {number} maxLen - 最大长度
 * @returns {string} 清理后的文本
 */
function sanitizeText(text, maxLen) {
    if (!text) return '';

    let value = String(text)
        .replace(/\s+/g, ' ')
        .replace(/第\s*\d+\s*页[：:]?/gi, '')
        .replace(/page\s*\d+[：:]?/gi, '')
        .trim();

    if (!value) return '';

    if (value.length > maxLen) {
        value = value.slice(0, Math.max(1, maxLen - 1)).trim() + '…';
    }

    return value;
}

/**
 * 规范化 bullets 数据
 * @param {Array} rawBullets - 原始 bullets 数据
 * @returns {Array} 规范化后的 bullets
 */
function normalizeBullets(rawBullets) {
    if (!Array.isArray(rawBullets)) return [];

    return rawBullets
        .map(item => {
            if (typeof item === 'string') {
                return {
                    text: sanitizeText(item, LENGTH_LIMITS.bullet),
                    subBullets: []
                };
            }

            if (!item || typeof item !== 'object') return null;

            const text = sanitizeText(
                item.text || item.title || item.label || '',
                LENGTH_LIMITS.bullet
            );

            const subBullets = Array.isArray(item.subBullets)
                ? item.subBullets
                    .map(sub => sanitizeText(sub, LENGTH_LIMITS.subBullet))
                    .filter(Boolean)
                    .slice(0, COUNT_LIMITS.subBulletsPerBullet)
                : [];

            if (!text) return null;

            return { text, subBullets };
        })
        .filter(Boolean);
}

/**
 * 规范化 stats 数据
 * @param {Array} rawStats - 原始 stats 数据
 * @returns {Array} 规范化后的 stats
 */
function normalizeStats(rawStats) {
    if (!Array.isArray(rawStats)) return [];

    return rawStats
        .map(item => {
            if (!item || typeof item !== 'object') return null;

            const label = sanitizeText(
                item.label || item.name || item.title || '',
                LENGTH_LIMITS.statLabel
            );
            const value = sanitizeText(
                item.value || item.data || '',
                LENGTH_LIMITS.statValue
            );
            const note = sanitizeText(
                item.note || item.desc || item.description || '',
                LENGTH_LIMITS.statNote
            );

            if (!label && !value) return null;

            return {
                label: label || '指标',
                value: value || '--',
                note
            };
        })
        .filter(Boolean)
        .slice(0, COUNT_LIMITS.stats);
}

/**
 * 规范化 sections 数据
 * @param {Array} rawSections - 原始 sections 数据
 * @returns {Array} 规范化后的 sections
 */
function normalizeSections(rawSections) {
    if (!Array.isArray(rawSections)) return [];

    return rawSections
        .map(section => {
            if (!section || typeof section !== 'object') {
                const line = sanitizeText(section, LENGTH_LIMITS.sectionTitle);
                if (!line) return null;
                return { title: line, items: [] };
            }

            const title = sanitizeText(
                section.title || section.header || section.name || '',
                LENGTH_LIMITS.sectionTitle
            );

            const items = Array.isArray(section.items)
                ? section.items
                    .map(item => sanitizeText(item, LENGTH_LIMITS.bullet))
                    .filter(Boolean)
                    .slice(0, COUNT_LIMITS.itemsPerSection)
                : [];

            if (!title && !items.length) return null;

            return {
                title: title || (items[0] || '章节'),
                items
            };
        })
        .filter(Boolean)
        .slice(0, COUNT_LIMITS.sections);
}

/**
 * 规范化 highlights 数据
 * @param {Array} rawHighlights - 原始 highlights 数据
 * @returns {Array} 规范化后的 highlights
 */
function normalizeHighlights(rawHighlights) {
    if (!Array.isArray(rawHighlights)) return [];

    return rawHighlights
        .map(item => sanitizeText(item, 28))
        .filter(Boolean)
        .slice(0, COUNT_LIMITS.highlights);
}

/**
 * 规范化 quote 数据
 * @param {Object|string} rawQuote - 原始 quote 数据
 * @returns {Object|null} 规范化后的 quote
 */
function normalizeQuote(rawQuote) {
    if (!rawQuote) return null;

    if (typeof rawQuote === 'string') {
        const text = sanitizeText(rawQuote, 160);
        return text ? { text, author: '' } : null;
    }

    if (typeof rawQuote !== 'object') return null;

    const text = sanitizeText(rawQuote.text || rawQuote.quote || '', 160);
    const author = sanitizeText(rawQuote.author || rawQuote.from || '', 36);

    if (!text) return null;

    return { text, author };
}

/**
 * 规范化 image 数据
 * @param {Object} rawImage - 原始 image 数据
 * @returns {Object|null} 规范化后的 image
 */
function normalizeImage(rawImage) {
    if (!rawImage || typeof rawImage !== 'object') return null;

    const url = sanitizeText(rawImage.url || rawImage.data || '', 3000);
    if (!url) return null;

    return {
        url,
        caption: sanitizeText(rawImage.caption || '', LENGTH_LIMITS.imageCaption),
        fit: String(rawImage.fit || 'contain').toLowerCase() === 'cover' ? 'cover' : 'contain'
    };
}

// 导出（支持 CommonJS 和浏览器环境）
if (typeof module !== 'undefined' && module.exports) {
    // Node.js 环境
    module.exports = {
        LENGTH_LIMITS,
        COUNT_LIMITS,
        FIELD_ALIASES,
        sanitizeText,
        normalizeBullets,
        normalizeStats,
        normalizeSections,
        normalizeHighlights,
        normalizeQuote,
        normalizeImage
    };
} else if (typeof window !== 'undefined') {
    // 浏览器环境
    window.PPTDataNormalizer = {
        LENGTH_LIMITS,
        COUNT_LIMITS,
        FIELD_ALIASES,
        sanitizeText,
        normalizeBullets,
        normalizeStats,
        normalizeSections,
        normalizeHighlights,
        normalizeQuote,
        normalizeImage
    };
}
