const express = require('express');
const router = express.Router();
const PptxGenJS = require('pptxgenjs');

const THEME_MAP = {
    'white-black': { bg: 'FFFFFF', text: '2C3E50', sub: '34495E', accent: '4A90E2' },
    'black-white': { bg: '1A1A1A', text: 'FFFFFF', sub: 'E0E0E0', accent: '4A90E2' },
    'traffic-light': { bg: '2D5016', text: 'C0392B', sub: 'E74C3C', accent: 'F1C40F' },
    'traditional': { bg: '1E3A5F', text: 'FFFFFF', sub: 'ECF0F1', accent: 'F39C12' },
    'business': { bg: '34495E', text: 'ECF0F1', sub: 'BDC3C7', accent: '3498DB' }
};

const MAX_TITLE_LEN = 56;
const MAX_SUBTITLE_LEN = 88;
const MAX_BULLET_LEN = 42;
const MAX_SUB_BULLET_LEN = 30;
const MAX_IMAGE_CAPTION_LEN = 46;
const MAX_BULLETS_PER_SLIDE = 5;
const MAX_SUB_BULLETS_PER_BULLET = 2;

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

    if (!rawPage || typeof rawPage !== 'object' || Array.isArray(rawPage)) {
        return {
            layout: index === 0 ? 'cover' : 'content',
            themeToken: 'white-black',
            title: fallbackTitle,
            subtitle: '',
            bullets: fallbackBullets,
            image: null,
            continuation: false
        };
    }

    const layout = normalizeLayout(rawPage.layout, index);
    const title = sanitizeText(rawPage.title || fallbackTitle, MAX_TITLE_LEN);
    const subtitle = sanitizeText(rawPage.subtitle || '', MAX_SUBTITLE_LEN);
    const bullets = normalizeBullets(rawPage.bullets);

    return {
        layout,
        themeToken: resolveThemeToken(rawPage.themeToken || rawPage.theme || 'white-black'),
        title: title || fallbackTitle,
        subtitle,
        bullets: bullets.length ? bullets : fallbackBullets,
        image: normalizeImage(rawPage.image),
        continuation: !!rawPage.continuation
    };
}

function normalizeLayout(layout, index) {
    const raw = String(layout || '').toLowerCase();
    if (raw === 'cover' || raw === 'content' || raw === 'two-column') return raw;
    if (raw === 'image-left' || raw === 'image-right') return raw;
    return index === 0 ? 'cover' : 'content';
}

function resolveThemeToken(token) {
    const key = String(token || '').trim();
    return THEME_MAP[key] ? key : 'white-black';
}

function normalizeBullets(rawBullets) {
    if (!Array.isArray(rawBullets)) return [];

    return rawBullets
        .map(item => {
            if (typeof item === 'string') {
                return {
                    text: sanitizeText(item, MAX_BULLET_LEN),
                    subBullets: []
                };
            }
            if (!item || typeof item !== 'object') return null;
            const text = sanitizeText(item.text || item.title || item.label || '', MAX_BULLET_LEN);
            const subBullets = Array.isArray(item.subBullets)
                ? item.subBullets.map(sub => sanitizeText(sub, MAX_SUB_BULLET_LEN)).filter(Boolean).slice(0, MAX_SUB_BULLETS_PER_BULLET)
                : [];
            if (!text) return null;
            return { text, subBullets };
        })
        .filter(Boolean)
        .slice(0, 30);
}

function normalizeImage(rawImage) {
    if (!rawImage || typeof rawImage !== 'object') return null;
    const url = sanitizeText(rawImage.url || rawImage.data || '', 3000);
    if (!url) return null;
    return {
        url,
        caption: sanitizeText(rawImage.caption || '', MAX_IMAGE_CAPTION_LEN),
        fit: String(rawImage.fit || 'contain').toLowerCase() === 'cover' ? 'cover' : 'contain'
    };
}

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

function paginateSlideSpec(spec) {
    if (spec.layout === 'cover') {
        return [spec];
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
    } else if (spec.layout === 'two-column') {
        renderTwoColumn(slide, spec, palette, ratio);
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

function renderTwoColumn(slide, spec, palette, ratio) {
    const { width: slideWidth, height: slideHeight } = getSlideSize(ratio);
    const margin = 0.55;
    const topY = 1.85;
    const columnGap = 0.35;
    const columnWidth = (slideWidth - margin * 2 - columnGap) / 2;

    const leftBullets = Array.isArray(spec.leftBullets) ? spec.leftBullets : spec.bullets.slice(0, Math.ceil(spec.bullets.length / 2));
    const rightBullets = Array.isArray(spec.rightBullets) ? spec.rightBullets : spec.bullets.slice(Math.ceil(spec.bullets.length / 2));

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
            h: bodyHeight
        });

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

function fitFontByLength(base, min, length) {
    if (!length || length <= 14) return base;
    if (length >= 70) return min;
    const ratio = (length - 14) / (70 - 14);
    return Math.max(min, Math.round(base - (base - min) * ratio));
}

function isDataImage(url) {
    return typeof url === 'string' && /^data:image\//i.test(url);
}

function getSlideSize(ratio) {
    return ratio === '16:9'
        ? { width: 10, height: 5.625 }
        : { width: 10, height: 7.5 };
}

module.exports = router;
