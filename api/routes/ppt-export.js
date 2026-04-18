const express = require('express');
const router = express.Router();
const PptxGenJS = require('pptxgenjs');

// 引入共享模块
const {
    LENGTH_LIMITS,
    COUNT_LIMITS,
    sanitizeText,
    normalizeBullets,
    normalizeStats,
    normalizeSections,
    normalizeHighlights,
    normalizeQuote,
    normalizeImage
} = require('../../shared/ppt-data-normalizer');

const {
    fitFontByLength,
    getFontSize,
    getSlideSize
} = require('../../shared/ppt-style-calculator');

const THEME_MAP = {
    'white-black': { bg: 'FFFFFF', text: '2C3E50', sub: '34495E', accent: '4A90E2' },
    'black-white': { bg: '1A1A1A', text: 'FFFFFF', sub: 'E0E0E0', accent: '4A90E2' },
    'traffic-light': { bg: '2D5016', text: 'C0392B', sub: 'E74C3C', accent: 'F1C40F' },
    'traditional': { bg: '1E3A5F', text: 'FFFFFF', sub: 'ECF0F1', accent: 'F39C12' },
    'business': { bg: '34495E', text: 'ECF0F1', sub: 'BDC3C7', accent: '3498DB' }
};

// 使用共享模块的限制常量
const MAX_TITLE_LEN = LENGTH_LIMITS.title;
const MAX_SUBTITLE_LEN = LENGTH_LIMITS.subtitle;
const MAX_BULLET_LEN = LENGTH_LIMITS.bullet;
const MAX_SUB_BULLET_LEN = LENGTH_LIMITS.subBullet;
const MAX_IMAGE_CAPTION_LEN = LENGTH_LIMITS.imageCaption;
const MAX_BULLETS_PER_SLIDE = COUNT_LIMITS.bullets;
const MAX_SUB_BULLETS_PER_BULLET = COUNT_LIMITS.subBulletsPerBullet;
const MAX_SECTIONS_PER_SLIDE = COUNT_LIMITS.sections;
const MAX_STATS_PER_SLIDE = COUNT_LIMITS.stats;
const MAX_HIGHLIGHTS = COUNT_LIMITS.highlights;

// POST /api/ppt-export - 导出可编辑 PPT
router.post('/', async (req, res) => {
    try {
        const { topic, pages, outline, ratio = '16:9' } = req.body || {};

        if (!Array.isArray(pages) || pages.length === 0) {
            return res.status(400).json({
                code: 400,
                message: 'PPT 页面数据不能为空'
            });
        }

        // 预验证所有图片数据
        console.log('Validating images in pages...');
        for (let i = 0; i < pages.length; i++) {
            if (pages[i] && pages[i].image && pages[i].image.url) {
                const imageUrl = pages[i].image.url;
                if (imageUrl.startsWith('data:image/')) {
                    // 验证base64图片数据完整性
                    const base64Data = imageUrl.split(',')[1];
                    if (!base64Data || base64Data.length < 100) {
                        console.warn(`Page ${i + 1}: Image data seems incomplete (${base64Data ? base64Data.length : 0} bytes)`);
                        // 移除不完整的图片
                        pages[i].image = null;
                    } else {
                        console.log(`Page ${i + 1}: Image validated (${Math.round(base64Data.length / 1024)}KB)`);
                    }
                }
            }
        }

        const pptx = new PptxGenJS();
        pptx.title = topic || 'PPT演示';
        pptx.author = 'EasyPocketMD';
        pptx.subject = topic || 'PPT演示';
        pptx.company = 'EasyPocketMD';

        if (ratio === '16:9') {
            pptx.defineLayout({ name: '16:9', width: 10, height: 5.625 });
        } else {
            pptx.defineLayout({ name: '4:3', width: 10, height: 7.5 });
        }
        pptx.layout = ratio === '16:9' ? '16:9' : '4:3';

        for (let i = 0; i < pages.length; i++) {
            const pageOutline = outline && outline[i] ? outline[i] : { number: i + 1, title: `第${i + 1}页`, content: [] };
            const slideSpec = normalizeSlideSpec(pages[i], pageOutline, i);
            const chunks = paginateSlideSpec(slideSpec);

            chunks.forEach((chunk, chunkIndex) => {
                const slide = pptx.addSlide();
                const pageNo = `${pageOutline.number || i + 1}${chunkIndex > 0 ? '-' + (chunkIndex + 1) : ''}`;
                renderSlideFromSpec(slide, chunk, ratio, pageNo);
            });
        }

        const fileName = `${topic || 'PPT'}_${Date.now()}.pptx`;
        const pptBuffer = await pptx.write({ outputType: 'nodebuffer' });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
        return res.status(200).send(pptBuffer);
    } catch (error) {
        console.error('PPT 导出错误:', error);
        return res.status(500).json({
            code: 500,
            message: '服务器内部错误: ' + error.message
        });
    }
});

function normalizeSlideSpec(rawPage, outlineItem, index) {
    const fallbackBullets = normalizeBullets((outlineItem.content || []).map(item => ({ text: item })));
    const fallbackTitle = sanitizeText(outlineItem.title || `第${index + 1}页`, MAX_TITLE_LEN);
    const fallbackRole = inferRoleByTitle(fallbackTitle, index);

    if (!rawPage || typeof rawPage !== 'object' || Array.isArray(rawPage)) {
        return {
            layout: roleToLayout(fallbackRole, index),
            role: fallbackRole,
            themeToken: 'white-black',
            title: fallbackTitle,
            subtitle: '',
            bullets: fallbackBullets,
            highlights: [],
            sections: [],
            stats: [],
            quote: null,
            image: null,
            continuation: false
        };
    }

    const role = normalizeRole(rawPage.role, fallbackRole, index);
    const layout = normalizeLayout(rawPage.layout || roleToLayout(role, index), index, role);
    const title = sanitizeText(rawPage.title || fallbackTitle, MAX_TITLE_LEN);
    const subtitle = sanitizeText(rawPage.subtitle || '', MAX_SUBTITLE_LEN);
    const bullets = normalizeBullets(rawPage.bullets);
    const sections = normalizeSections(rawPage.sections);
    const stats = normalizeStats(rawPage.stats);
    const quote = normalizeQuote(rawPage.quote);
    const highlights = normalizeTextItems(rawPage.highlights, MAX_HIGHLIGHTS, 28);

    return {
        layout,
        role,
        themeToken: resolveThemeToken(rawPage.themeToken || rawPage.theme || 'white-black'),
        title: title || fallbackTitle,
        subtitle,
        bullets: bullets.length ? bullets : fallbackBullets,
        highlights,
        sections,
        stats,
        quote,
        image: normalizeImage(rawPage.image),
        continuation: !!rawPage.continuation
    };
}

function normalizeLayout(layout, index, role) {
    const raw = String(layout || '').toLowerCase();
    const valid = ['cover', 'toc', 'content', 'two-column', 'image-left', 'image-right', 'timeline', 'comparison', 'stats', 'quote', 'references', 'thanks'];
    if (valid.includes(raw)) return raw;
    return roleToLayout(role, index);
}

function normalizeRole(role, fallbackRole, index) {
    const raw = String(role || '').toLowerCase().trim();
    if (['cover', 'toc', 'body', 'references', 'thanks'].includes(raw)) return raw;
    if (index === 0) return 'cover';
    return fallbackRole || 'body';
}

function roleToLayout(role, index) {
    if (role === 'cover' || index === 0) return 'cover';
    if (role === 'toc') return 'toc';
    if (role === 'references') return 'references';
    if (role === 'thanks') return 'thanks';
    return 'content';
}

function inferRoleByTitle(title, index) {
    const t = String(title || '').toLowerCase();
    if (index === 0 || /(封面|标题|title|cover)/.test(t)) return 'cover';
    if (/(目录|议程|agenda|contents?)/.test(t)) return 'toc';
    if (/(参考|文献|references?|bibliography)/.test(t)) return 'references';
    if (/(致谢|感谢|thanks|thank you|q&a)/.test(t)) return 'thanks';
    return 'body';
}

function resolveThemeToken(token) {
    const key = String(token || '').trim();
    return THEME_MAP[key] ? key : 'white-black';
}

// 删除重复的规范化函数，使用共享模块中的函数
// normalizeBullets, normalizeImage, normalizeSections, normalizeStats, normalizeQuote
// 已从 shared/ppt-data-normalizer.js 导入

function normalizeTextItems(items, maxCount, maxLen) {
    if (!Array.isArray(items)) return [];
    return items
        .map(item => sanitizeText(item, maxLen))
        .filter(Boolean)
        .slice(0, maxCount);
}

function paginateSlideSpec(spec) {
    if (spec.layout === 'cover' || spec.layout === 'thanks' || spec.layout === 'quote') {
        return [spec];
    }

    if (spec.layout === 'stats') {
        const chunks = [];
        const source = Array.isArray(spec.stats) ? spec.stats : [];
        const total = Math.max(1, Math.ceil(source.length / MAX_STATS_PER_SLIDE));
        for (let i = 0; i < total; i++) {
            chunks.push({
                ...spec,
                stats: source.slice(i * MAX_STATS_PER_SLIDE, (i + 1) * MAX_STATS_PER_SLIDE),
                continuation: i > 0
            });
        }
        return chunks;
    }

    if (spec.layout === 'toc' || spec.layout === 'timeline' || spec.layout === 'references') {
        const sections = Array.isArray(spec.sections) ? spec.sections : [];
        if (!sections.length) {
            return [{ ...spec, continuation: false }];
        }
        const chunks = [];
        const total = Math.max(1, Math.ceil(sections.length / MAX_SECTIONS_PER_SLIDE));
        for (let i = 0; i < total; i++) {
            chunks.push({
                ...spec,
                sections: sections.slice(i * MAX_SECTIONS_PER_SLIDE, (i + 1) * MAX_SECTIONS_PER_SLIDE),
                continuation: i > 0
            });
        }
        return chunks;
    }

    if (spec.layout === 'two-column') {
        const left = spec.bullets.slice(0, Math.ceil(spec.bullets.length / 2));
        const right = spec.bullets.slice(Math.ceil(spec.bullets.length / 2));
        const maxPerCol = 4;
        const pageCount = Math.max(1, Math.ceil(Math.max(left.length, right.length) / maxPerCol));
        const chunks = [];

        for (let i = 0; i < pageCount; i++) {
            const leftChunk = left.slice(i * maxPerCol, (i + 1) * maxPerCol);
            const rightChunk = right.slice(i * maxPerCol, (i + 1) * maxPerCol);
            chunks.push({
                ...spec,
                bullets: leftChunk.concat(rightChunk),
                leftBullets: leftChunk,
                rightBullets: rightChunk,
                continuation: i > 0
            });
        }

        return chunks;
    }

    const chunks = [];
    const total = Math.max(1, Math.ceil(spec.bullets.length / MAX_BULLETS_PER_SLIDE));
    for (let i = 0; i < total; i++) {
        chunks.push({
            ...spec,
            bullets: spec.bullets.slice(i * MAX_BULLETS_PER_SLIDE, (i + 1) * MAX_BULLETS_PER_SLIDE),
            continuation: i > 0
        });
    }
    return chunks;
}

function renderSlideFromSpec(slide, spec, ratio, pageNo) {
    const palette = THEME_MAP[spec.themeToken] || THEME_MAP['white-black'];
    const { width: slideWidth, height: slideHeight } = getSlideSize(ratio);
    const margin = 0.55;

    slide.background = { color: palette.bg };
    addDecorativeBackground(slide, palette, ratio, spec.layout);

    const titleText = spec.continuation ? `${spec.title}（续）` : spec.title;
    const titleFont = fitFontByLength(spec.layout === 'cover' ? 38 : 30, 22, titleText.length);

    slide.addText(titleText, {
        x: margin,
        y: margin,
        w: slideWidth - margin * 2,
        h: spec.layout === 'cover' ? 0.95 : 0.8,
        fontSize: titleFont,
        bold: true,
        color: palette.text,
        fontFace: 'Microsoft YaHei',
        align: spec.layout === 'cover' ? 'center' : 'left'
    });

    if (spec.subtitle) {
        slide.addText(spec.subtitle, {
            x: margin,
            y: spec.layout === 'cover' ? 1.7 : 1.4,
            w: slideWidth - margin * 2,
            h: 0.45,
            fontSize: fitFontByLength(16, 12, spec.subtitle.length),
            color: palette.sub,
            fontFace: 'Microsoft YaHei',
            align: spec.layout === 'cover' ? 'center' : 'left'
        });
    }

    if (spec.layout === 'cover') {
        addCoverBullets(slide, spec, palette, slideWidth, slideHeight, margin);
    } else if (spec.layout === 'toc') {
        renderTocSlide(slide, spec, palette, ratio);
    } else if (spec.layout === 'two-column') {
        renderTwoColumn(slide, spec, palette, ratio);
    } else if (spec.layout === 'timeline') {
        renderTimelineSlide(slide, spec, palette, ratio);
    } else if (spec.layout === 'comparison') {
        renderComparisonSlide(slide, spec, palette, ratio);
    } else if (spec.layout === 'stats') {
        renderStatsSlide(slide, spec, palette, ratio);
    } else if (spec.layout === 'quote') {
        renderQuoteSlide(slide, spec, palette, ratio);
    } else if (spec.layout === 'references') {
        renderReferencesSlide(slide, spec, palette, ratio);
    } else if (spec.layout === 'thanks') {
        renderThanksSlide(slide, spec, palette, ratio);
    } else {
        renderContentWithOptionalImage(slide, spec, palette, ratio);
    }

    slide.addText(String(pageNo || ''), {
        x: slideWidth - margin - 0.35,
        y: slideHeight - margin * 0.85,
        w: 0.35,
        h: 0.25,
        fontSize: 9,
        color: palette.sub,
        fontFace: 'Microsoft YaHei',
        align: 'right'
    });
}

function addCoverBullets(slide, spec, palette, slideWidth, slideHeight, margin) {
    const bullets = (spec.bullets || []).slice(0, 3);
    if (!bullets.length) return;

    const startY = 2.3;
    bullets.forEach((item, idx) => {
        addCardShape(slide, {
            x: margin + 0.65,
            y: startY + idx * 0.55 - 0.03,
            w: slideWidth - (margin + 0.65) * 2,
            h: 0.43
        }, palette, 82);

        slide.addText(`• ${item.text}`, {
            x: margin + 0.4,
            y: startY + idx * 0.55,
            w: slideWidth - (margin + 0.4) * 2,
            h: 0.45,
            fontSize: fitFontByLength(18, 13, item.text.length),
            color: palette.text,
            fontFace: 'Microsoft YaHei',
            align: 'center'
        });
    });

    if (spec.image && spec.image.caption) {
        slide.addText(spec.image.caption, {
            x: margin,
            y: slideHeight - margin - 0.65,
            w: slideWidth - margin * 2,
            h: 0.4,
            fontSize: 11,
            color: palette.sub,
            fontFace: 'Microsoft YaHei',
            align: 'center'
        });
    }
}

function renderTocSlide(slide, spec, palette, ratio) {
    const { width: slideWidth, height: slideHeight } = getSlideSize(ratio);
    const margin = 0.55;
    const topY = 1.85;
    const columnGap = 0.35;
    const columnWidth = (slideWidth - margin * 2 - columnGap) / 2;

    const tocItems = (spec.sections || []).map(section => section.title).filter(Boolean);
    const fallbackItems = (spec.bullets || []).map(item => item.text).filter(Boolean);
    const items = (tocItems.length ? tocItems : fallbackItems).slice(0, 12);
    const left = items.slice(0, Math.ceil(items.length / 2));
    const right = items.slice(Math.ceil(items.length / 2));

    addCardShape(slide, { x: margin - 0.03, y: topY - 0.08, w: columnWidth + 0.06, h: slideHeight - topY - 0.66 }, palette, 88);
    addCardShape(slide, { x: margin + columnWidth + columnGap - 0.03, y: topY - 0.08, w: columnWidth + 0.06, h: slideHeight - topY - 0.66 }, palette, 88);

    addNumberedList(slide, left, { x: margin, y: topY, w: columnWidth, h: slideHeight - topY - 0.8 }, palette, 1);
    addNumberedList(slide, right, { x: margin + columnWidth + columnGap, y: topY, w: columnWidth, h: slideHeight - topY - 0.8 }, palette, left.length + 1);
}

function renderTimelineSlide(slide, spec, palette, ratio) {
    const { width: slideWidth, height: slideHeight } = getSlideSize(ratio);
    const margin = 0.65;
    const topY = 1.85;
    const maxY = slideHeight - 0.75;

    const source = (spec.sections || []).map(section => ({
        title: section.title,
        desc: (section.items || []).slice(0, 1).join(' / ')
    }));

    const fallback = (spec.bullets || []).map(item => ({
        title: item.text,
        desc: (item.subBullets || []).slice(0, 1).join(' / ')
    }));

    const timeline = (source.length ? source : fallback).slice(0, 6);
    slide.addShape(getRectShapeType(), {
        x: margin + 0.2,
        y: topY,
        w: 0.08,
        h: Math.max(0.5, maxY - topY),
        line: { color: palette.accent, transparency: 100 },
        fill: { color: palette.accent, transparency: 35 }
    });

    let y = topY;
    timeline.forEach((item) => {
        if (y > maxY - 0.5) return;
        slide.addShape(getEllipseShapeType(), {
            x: margin + 0.07,
            y: y + 0.08,
            w: 0.32,
            h: 0.22,
            line: { color: palette.accent, transparency: 100 },
            fill: { color: palette.accent, transparency: 0 }
        });
        addCardShape(slide, { x: margin + 0.45, y: y, w: slideWidth - margin - 0.95, h: 0.56 }, palette, 84);
        slide.addText(item.title || '', {
            x: margin + 0.62,
            y: y + 0.06,
            w: slideWidth - margin - 1.25,
            h: 0.22,
            fontSize: 15,
            color: palette.text,
            fontFace: 'Microsoft YaHei',
            bold: true
        });
        if (item.desc) {
            slide.addText(item.desc, {
                x: margin + 0.62,
                y: y + 0.28,
                w: slideWidth - margin - 1.25,
                h: 0.18,
                fontSize: 11,
                color: palette.sub,
                fontFace: 'Microsoft YaHei'
            });
        }
        y += 0.66;
    });
}

function renderComparisonSlide(slide, spec, palette, ratio) {
    const { width: slideWidth, height: slideHeight } = getSlideSize(ratio);
    const margin = 0.55;
    const topY = 1.85;
    const columnGap = 0.35;
    const columnWidth = (slideWidth - margin * 2 - columnGap) / 2;

    const sections = (spec.sections || []).slice(0, 2);
    const left = sections[0] || {
        title: '方案 A',
        items: (spec.bullets || []).slice(0, Math.ceil((spec.bullets || []).length / 2)).map(item => item.text)
    };
    const right = sections[1] || {
        title: '方案 B',
        items: (spec.bullets || []).slice(Math.ceil((spec.bullets || []).length / 2)).map(item => item.text)
    };

    renderSectionCardOnSlide(slide, left, { x: margin, y: topY, w: columnWidth, h: slideHeight - topY - 0.8 }, palette);
    renderSectionCardOnSlide(slide, right, { x: margin + columnWidth + columnGap, y: topY, w: columnWidth, h: slideHeight - topY - 0.8 }, palette);
}

function renderStatsSlide(slide, spec, palette, ratio) {
    const { width: slideWidth, height: slideHeight } = getSlideSize(ratio);
    const margin = 0.55;
    const topY = 1.85;

    const stats = (spec.stats || []).slice(0, 6);
    const items = stats.length
        ? stats
        : (spec.bullets || []).slice(0, 6).map((item, idx) => ({
            label: `指标${idx + 1}`,
            value: item.text,
            note: (item.subBullets || []).join(' / ')
        }));

    const columns = 3;
    const rows = Math.max(1, Math.ceil(items.length / columns));
    const gapX = 0.22;
    const gapY = 0.2;
    const cardW = (slideWidth - margin * 2 - gapX * (columns - 1)) / columns;
    const cardH = (slideHeight - topY - 0.8 - gapY * (rows - 1)) / rows;

    items.forEach((item, idx) => {
        const row = Math.floor(idx / columns);
        const col = idx % columns;
        const x = margin + col * (cardW + gapX);
        const y = topY + row * (cardH + gapY);
        addCardShape(slide, { x, y, w: cardW, h: cardH }, palette, 82);
        slide.addText(item.label || '', {
            x: x + 0.12,
            y: y + 0.08,
            w: cardW - 0.24,
            h: 0.16,
            fontSize: 10,
            color: palette.sub,
            fontFace: 'Microsoft YaHei'
        });
        slide.addText(item.value || '--', {
            x: x + 0.12,
            y: y + cardH * 0.34,
            w: cardW - 0.24,
            h: 0.22,
            fontSize: fitFontByLength(24, 14, String(item.value || '').length),
            color: palette.accent,
            bold: true,
            fontFace: 'Microsoft YaHei',
            align: 'center'
        });
        if (item.note) {
            slide.addText(item.note, {
                x: x + 0.12,
                y: y + cardH - 0.24,
                w: cardW - 0.24,
                h: 0.14,
                fontSize: 9,
                color: palette.sub,
                fontFace: 'Microsoft YaHei',
                align: 'center'
            });
        }
    });
}

function renderQuoteSlide(slide, spec, palette, ratio) {
    const { width: slideWidth, height: slideHeight } = getSlideSize(ratio);
    const quote = spec.quote || {
        text: (spec.bullets && spec.bullets[0] ? spec.bullets[0].text : spec.title),
        author: ''
    };

    slide.addText('”', {
        x: slideWidth / 2 - 0.6,
        y: 1.6,
        w: 1.2,
        h: 0.8,
        fontSize: 58,
        color: palette.accent,
        fontFace: 'Microsoft YaHei',
        align: 'center'
    });

    slide.addText(quote.text || '', {
        x: 1.1,
        y: 2.15,
        w: slideWidth - 2.2,
        h: 1.5,
        fontSize: fitFontByLength(28, 16, String(quote.text || '').length),
        color: palette.text,
        bold: true,
        fontFace: 'Microsoft YaHei',
        align: 'center',
        valign: 'mid'
    });

    const authorText = quote.author || spec.title || '佚名';
    slide.addText(`—— ${authorText}`, {
        x: 0.9,
        y: 4.05,
        w: slideWidth - 1.8,
        h: 0.25,
        fontSize: 12,
        color: palette.sub,
        fontFace: 'Microsoft YaHei',
        align: 'right'
    });
}

function renderReferencesSlide(slide, spec, palette, ratio) {
    const { width: slideWidth, height: slideHeight } = getSlideSize(ratio);
    const margin = 0.6;
    const topY = 1.85;
    const refs = [];

    (spec.sections || []).forEach(section => {
        (section.items || []).forEach(item => {
            if (item) refs.push(item);
        });
    });

    if (!refs.length) {
        (spec.bullets || []).forEach(item => {
            if (item && item.text) refs.push(item.text);
        });
    }

    // If still no references, add a placeholder
    if (!refs.length) {
        refs.push('相关研究文献');
        refs.push('行业报告与白皮书');
        refs.push('官方技术文档');
    }

    const list = refs.slice(0, 10);
    let y = topY;
    list.forEach((item, idx) => {
        if (y > slideHeight - 0.65) return;
        addCardShape(slide, { x: margin, y: y - 0.02, w: slideWidth - margin * 2, h: 0.3 }, palette, 88);
        slide.addText(`${idx + 1}. ${item}`, {
            x: margin + 0.1,
            y,
            w: slideWidth - margin * 2 - 0.2,
            h: 0.25,
            fontSize: 11,
            color: palette.text,
            fontFace: 'Microsoft YaHei'
        });
        y += 0.36;
    });
}

function renderThanksSlide(slide, spec, palette, ratio) {
    const { width: slideWidth } = getSlideSize(ratio);
    slide.addText(spec.title || '致谢', {
        x: 0,
        y: 2.1,
        w: slideWidth,
        h: 0.9,
        fontSize: 44,
        color: palette.text,
        bold: true,
        fontFace: 'Microsoft YaHei',
        align: 'center'
    });

    slide.addText(spec.subtitle || '感谢聆听，欢迎交流', {
        x: 0,
        y: 3.15,
        w: slideWidth,
        h: 0.38,
        fontSize: 16,
        color: palette.sub,
        fontFace: 'Microsoft YaHei',
        align: 'center'
    });

    slide.addText('Q & A', {
        x: 0,
        y: 3.68,
        w: slideWidth,
        h: 0.28,
        fontSize: 14,
        color: palette.accent,
        fontFace: 'Microsoft YaHei',
        align: 'center'
    });
}

function renderTwoColumn(slide, spec, palette, ratio) {
    const { width: slideWidth, height: slideHeight } = getSlideSize(ratio);
    const margin = 0.55;
    const topY = 1.85;
    const columnGap = 0.35;
    const columnWidth = (slideWidth - margin * 2 - columnGap) / 2;

    const leftBullets = Array.isArray(spec.leftBullets) ? spec.leftBullets : spec.bullets.slice(0, Math.ceil(spec.bullets.length / 2));
    const rightBullets = Array.isArray(spec.rightBullets) ? spec.rightBullets : spec.bullets.slice(Math.ceil(spec.bullets.length / 2));

    addCardShape(slide, {
        x: margin - 0.03,
        y: topY - 0.08,
        w: columnWidth + 0.06,
        h: slideHeight - topY - 0.66
    }, palette, 88);

    addCardShape(slide, {
        x: margin + columnWidth + columnGap - 0.03,
        y: topY - 0.08,
        w: columnWidth + 0.06,
        h: slideHeight - topY - 0.66
    }, palette, 88);

    addBulletBlock(slide, leftBullets, {
        x: margin,
        y: topY,
        w: columnWidth,
        h: slideHeight - topY - 0.8
    }, palette);

    addBulletBlock(slide, rightBullets, {
        x: margin + columnWidth + columnGap,
        y: topY,
        w: columnWidth,
        h: slideHeight - topY - 0.8
    }, palette);
}

function renderContentWithOptionalImage(slide, spec, palette, ratio) {
    const { width: slideWidth, height: slideHeight } = getSlideSize(ratio);
    const margin = 0.55;
    const topY = 1.85;
    const bodyHeight = slideHeight - topY - 0.8;

    if (spec.image && isDataImage(spec.image.url)) {
        const imageOnLeft = spec.layout === 'image-left';
        const imageWidth = slideWidth * 0.34;
        const textWidth = slideWidth - margin * 2 - imageWidth - 0.3;
        const imageX = imageOnLeft ? margin : slideWidth - margin - imageWidth;
        const textX = imageOnLeft ? imageX + imageWidth + 0.3 : margin;

        slide.addImage({
            data: spec.image.url,
            x: imageX,
            y: topY,
            w: imageWidth,
            h: bodyHeight,
            sizing: {
                type: spec.image.fit === 'cover' ? 'cover' : 'contain',
                w: imageWidth,
                h: bodyHeight,
                align: 'center',
                valign: 'middle'
            },
            rounding: false
        });

        addImageFrame(slide, { x: imageX, y: topY, w: imageWidth, h: bodyHeight }, palette);

        addBulletBlock(slide, spec.bullets, {
            x: textX,
            y: topY,
            w: textWidth,
            h: bodyHeight
        }, palette);

        if (spec.image.caption) {
            slide.addText(spec.image.caption, {
                x: imageX,
                y: slideHeight - 0.95,
                w: imageWidth,
                h: 0.3,
                fontSize: 10,
                color: palette.sub,
                fontFace: 'Microsoft YaHei',
                align: 'center'
            });
        }

        return;
    }

    addCardShape(slide, {
        x: margin - 0.03,
        y: topY - 0.08,
        w: slideWidth - margin * 2 + 0.06,
        h: bodyHeight + 0.12
    }, palette, 90);

    addBulletBlock(slide, spec.bullets, {
        x: margin,
        y: topY,
        w: slideWidth - margin * 2,
        h: bodyHeight
    }, palette);
}

function addBulletBlock(slide, bullets, rect, palette) {
    if (!Array.isArray(bullets) || bullets.length === 0) return;

    let y = rect.y;
    const maxY = rect.y + rect.h;

    bullets.forEach((item) => {
        if (!item || !item.text || y >= maxY - 0.3) return;

        const subCount = Array.isArray(item.subBullets) ? Math.min(item.subBullets.length, MAX_SUB_BULLETS_PER_BULLET) : 0;
        const cardHeight = 0.46 + subCount * 0.31;
        addCardShape(slide, {
            x: rect.x,
            y: y - 0.03,
            w: rect.w,
            h: Math.min(cardHeight, Math.max(0.28, maxY - y))
        }, palette, 86);

        const mainFont = fitFontByLength(17, 12, item.text.length);
        slide.addText(`• ${item.text}`, {
            x: rect.x,
            y,
            w: rect.w,
            h: 0.38,
            fontSize: mainFont,
            color: palette.text,
            fontFace: 'Microsoft YaHei',
            bold: true
        });
        y += 0.43;

        (item.subBullets || []).slice(0, MAX_SUB_BULLETS_PER_BULLET).forEach(sub => {
            if (!sub || y >= maxY - 0.25) return;
            slide.addText(`- ${sub}`, {
                x: rect.x + 0.25,
                y,
                w: rect.w - 0.25,
                h: 0.3,
                fontSize: fitFontByLength(13, 10, sub.length),
                color: palette.sub,
                fontFace: 'Microsoft YaHei'
            });
            y += 0.31;
        });

        y += 0.08;
    });
}

function addNumberedList(slide, items, rect, palette, startNo) {
    if (!Array.isArray(items) || !items.length) return;
    let y = rect.y;
    const maxY = rect.y + rect.h;
    items.forEach((item, idx) => {
        if (!item || y >= maxY - 0.3) return;
        const order = (startNo || 1) + idx;
        addCardShape(slide, { x: rect.x, y: y - 0.02, w: rect.w, h: 0.29 }, palette, 86);
        slide.addText(`${order}`, {
            x: rect.x + 0.08,
            y,
            w: 0.18,
            h: 0.22,
            fontSize: 10,
            color: palette.accent,
            bold: true,
            fontFace: 'Microsoft YaHei',
            align: 'center'
        });
        slide.addText(item, {
            x: rect.x + 0.32,
            y,
            w: rect.w - 0.35,
            h: 0.22,
            fontSize: 12,
            color: palette.text,
            fontFace: 'Microsoft YaHei'
        });
        y += 0.35;
    });
}

function renderSectionCardOnSlide(slide, section, rect, palette) {
    addCardShape(slide, rect, palette, 86);
    const title = sanitizeText(section && section.title ? section.title : '维度', MAX_BULLET_LEN);
    const items = Array.isArray(section && section.items) ? section.items : [];

    slide.addText(title, {
        x: rect.x + 0.12,
        y: rect.y + 0.08,
        w: rect.w - 0.24,
        h: 0.22,
        fontSize: 16,
        color: palette.accent,
        bold: true,
        fontFace: 'Microsoft YaHei'
    });

    let y = rect.y + 0.38;
    const maxY = rect.y + rect.h - 0.1;
    items.slice(0, 7).forEach(item => {
        if (!item || y > maxY - 0.2) return;
        slide.addText(`• ${item}`, {
            x: rect.x + 0.15,
            y,
            w: rect.w - 0.3,
            h: 0.2,
            fontSize: 12,
            color: palette.text,
            fontFace: 'Microsoft YaHei'
        });
        y += 0.23;
    });
}

function addDecorativeBackground(slide, palette, ratio, layout) {
    const { width: slideWidth, height: slideHeight } = getSlideSize(ratio);
    const rect = getRectShapeType();
    const ellipse = getEllipseShapeType();

    slide.addShape(rect, {
        x: 0,
        y: 0,
        w: 0.24,
        h: slideHeight,
        line: { color: palette.accent, transparency: 100 },
        fill: { color: palette.accent, transparency: 38 }
    });

    slide.addShape(rect, {
        x: slideWidth - 1.8,
        y: slideHeight - 0.65,
        w: 1.8,
        h: 0.65,
        line: { color: palette.accent, transparency: 100 },
        fill: { color: palette.accent, transparency: 55 }
    });

    if (layout === 'cover') {
        slide.addShape(ellipse, {
            x: slideWidth - 2.35,
            y: -0.6,
            w: 2.6,
            h: 2.1,
            line: { color: palette.accent, transparency: 100 },
            fill: { color: palette.accent, transparency: 72 }
        });
    }
}

function addCardShape(slide, rect, palette, transparency) {
    const roundRect = getRoundRectShapeType();
    slide.addShape(roundRect, {
        x: rect.x,
        y: rect.y,
        w: rect.w,
        h: rect.h,
        radius: 0.06,
        line: { color: palette.accent, transparency: 75, pt: 1 },
        fill: { color: 'FFFFFF', transparency: transparency }
    });
}

function addImageFrame(slide, rect, palette) {
    const roundRect = getRoundRectShapeType();
    slide.addShape(roundRect, {
        x: rect.x - 0.04,
        y: rect.y - 0.04,
        w: rect.w + 0.08,
        h: rect.h + 0.08,
        radius: 0.05,
        line: { color: palette.accent, pt: 1.2, transparency: 35 },
        fill: { color: 'FFFFFF', transparency: 100 }
    });
}

function getRectShapeType() {
    return PptxGenJS.ShapeType ? PptxGenJS.ShapeType.rect : 'rect';
}

function getRoundRectShapeType() {
    return PptxGenJS.ShapeType ? PptxGenJS.ShapeType.roundRect : 'roundRect';
}

function getEllipseShapeType() {
    return PptxGenJS.ShapeType ? PptxGenJS.ShapeType.ellipse : 'ellipse';
}

// 删除重复的函数定义，使用共享模块中的函数
// fitFontByLength, getSlideSize 已从 shared/ppt-style-calculator.js 导入

function isDataImage(url) {
    return typeof url === 'string' && /^data:image\//i.test(url);
}

module.exports = router;
