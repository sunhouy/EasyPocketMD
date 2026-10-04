const express = require('express');
const router = express.Router();
const { getPPTTemplate } = require('../../shared/ppt-templates');
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

const { THEME_MAP, paginateSlideSpec, renderSlideFromSpec } = require('../services/ppt-design');

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
        const { topic, pages, outline, templateId, ratio = '16:9' } = req.body || {};

        if (!Array.isArray(pages) || pages.length === 0) {
            return res.status(400).json({
                code: 400,
                message: 'PPT 页面数据不能为空'
            });
        }

        if (templateId != null && !getPPTTemplate(templateId)) {
            return res.status(400).json({ code: 400, message: 'Unknown PPT template' });
        }

        // 预验证所有图片数据
        console.log('Validating images in pages...');
        for (let i = 0; i < pages.length; i++) {
            if (pages[i] && pages[i].image && pages[i].image.url) {
                const imageUrl = pages[i].image.url;
                if (imageUrl.startsWith('data:image/')) {
                    // 验证base64图片数据完整性
                    const parts = imageUrl.split(',');
                    if (parts.length !== 2) {
                        console.warn(`Page ${i + 1}: Invalid image format (missing comma separator)`);
                        pages[i].image = null;
                        continue;
                    }

                    const base64Data = parts[1];
                    if (!base64Data || base64Data.length < 100) {
                        console.warn(`Page ${i + 1}: Image data too short (${base64Data ? base64Data.length : 0} bytes)`);
                        pages[i].image = null;
                        continue;
                    }

                    // 验证 base64 编码是否有效
                    try {
                        const buffer = Buffer.from(base64Data, 'base64');
                        if (buffer.length < 100) {
                            console.warn(`Page ${i + 1}: Decoded image too small (${buffer.length} bytes)`);
                            pages[i].image = null;
                            continue;
                        }
                        console.log(`Page ${i + 1}: Image validated (base64: ${Math.round(base64Data.length / 1024)}KB, decoded: ${Math.round(buffer.length / 1024)}KB)`);
                    } catch (err) {
                        console.warn(`Page ${i + 1}: Invalid base64 encoding:`, err.message);
                        pages[i].image = null;
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
            const chunks = paginateSlideSpec(slideSpec, ratio);

            chunks.forEach((chunk, chunkIndex) => {
                const slide = pptx.addSlide();
                const pageNo = `${pageOutline.number || i + 1}${chunkIndex > 0 ? '-' + (chunkIndex + 1) : ''}`;
                renderSlideFromSpec(slide, chunk, ratio, pageNo, templateId);
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

module.exports = router;
