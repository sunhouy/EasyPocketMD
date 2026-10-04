import type PptxGenJS from 'pptxgenjs';
import { getPPTTemplate } from '../../shared/ppt-templates';

type Bullet = { text: string; subBullets: string[] };
type Section = { title: string; items: string[] };
type Stat = { label: string; value: string; note: string };
export interface SlideSpec {
    layout: string; role: string; themeToken: string; title: string; subtitle: string;
    bullets: Bullet[]; sections: Section[]; stats: Stat[]; highlights: string[];
    quote: { text: string; author: string } | null;
    image: { url: string; caption?: string } | null; continuation: boolean;
}
export const THEME_MAP = {
    'white-black': { bg: 'FFFFFF', text: '2C3E50', sub: '526174', accent: '2563EB' },
    'black-white': { bg: '111827', text: 'F9FAFB', sub: 'CBD5E1', accent: '60A5FA' },
    'traffic-light': { bg: 'F5FAF6', text: '163B29', sub: '416052', accent: '218350' },
    traditional: { bg: 'FFF9EF', text: '382C22', sub: '69584A', accent: 'A46A22' },
    business: { bg: 'F3F6FA', text: '183153', sub: '53657A', accent: '2364AA' }
};
type Palette = typeof THEME_MAP['white-black'];
const MARGIN = 0.65;
const BODY_FONT = 18;
const SUB_FONT = 14;
function textHeight(text: string, width: number, size: number): number {
    // CJK glyphs occupy about one em; Latin glyphs average half an em.
    const capacity = Math.max(1, width * 72 / size * 0.9);
    const lines = String(text).split('\n').reduce((total, line) => {
        const units = Array.from(line).reduce((n, char) => n + (/[^\u0000-\u00ff]/.test(char) ? 1 : 0.55), 0);
        return total + Math.max(1, Math.ceil(units / capacity));
    }, 0);
    return lines * size / 72 * 1.35 + 0.06;
}
function geometry(spec: SlideSpec, ratio: string) {
    const height = ratio === '16:9' ? 5.625 : 7.5;
    const titleHeight = Math.min(1.25, textHeight(spec.title + (spec.continuation ? '（续）' : ''), 8.7, 30));
    const top = MARGIN + titleHeight + (spec.subtitle ? Math.min(0.65, textHeight(spec.subtitle, 8.7, 15)) + 0.16 : 0) + 0.3;
    return { height, top, available: height - top - 0.65 };
}
function bulletHeight(bullet: Bullet, width: number) {
    return textHeight(bullet.text, width - 0.28, BODY_FONT)
        + bullet.subBullets.reduce((h, sub) => h + textHeight(sub, width - 0.35, SUB_FONT) + 0.06, 0) + 0.22;
}
function pack<T>(items: T[], budget: number, measure: (item: T) => number, max: number): T[][] {
    const pages: T[][] = []; let current: T[] = []; let used = 0;
    for (const item of items) {
        const height = measure(item);
        if (current.length && (used + height > budget || current.length >= max)) {
            pages.push(current); current = []; used = 0;
        }
        current.push(item); used += height;
    }
    if (current.length || !pages.length) pages.push(current);
    return pages;
}
export function paginateSlideSpec(input: SlideSpec, ratio = '16:9'): SlideSpec[] {
    let spec = input;
    // Sections are semantic groups. Split their items before rendering rather than
    // silently dropping the tail of a section when a fixed-height card fills up.
    if (['timeline', 'toc', 'references'].includes(spec.layout) && spec.sections.length) {
        spec = { ...spec, bullets: spec.sections.flatMap(section => spec.layout === 'references'
            ? section.items.map(text => ({ text, subBullets: [] }))
            : [{ text: section.title, subBullets: section.items }]), sections: [] };
    }
    if (spec.layout === 'stats' && spec.stats.length) {
        return pack(spec.stats, 6, () => 1, 6).map((stats, i) => ({ ...spec, stats, continuation: i > 0 }));
    }
    if (spec.layout === 'comparison' && spec.sections.length) {
        const result: SlideSpec[] = [];
        for (let i = 0; i < spec.sections.length; i += 2) {
            const pair = spec.sections.slice(i, i + 2);
            const columns = pair.map(section => pack(section.items, geometry({ ...spec, continuation: true }, ratio).available - 0.6,
                item => bulletHeight({ text: item, subBullets: [] }, 4.05), 5));
            const count = Math.max(...columns.map(pages => pages.length));
            for (let page = 0; page < count; page++) result.push({ ...spec, continuation: result.length > 0,
                sections: pair.map((section, column) => ({ ...section, items: columns[column][page] || [] })) });
        }
        return result;
    }
    if (['cover', 'thanks', 'quote'].includes(spec.layout)) {
        const intro = { ...spec, bullets: [], sections: [] };
        if (!spec.bullets.length && !spec.sections.length) return [intro];
        const body = { ...spec, layout: 'content', bullets: [...spec.bullets,
            ...spec.sections.map(section => ({ text: section.title, subBullets: section.items }))], sections: [] };
        return [intro, ...paginateSlideSpec(body, ratio).map(page => ({ ...page, continuation: true }))];
    }
    const columns = spec.layout === 'two-column' ? 2 : 1;
    const width = ['image-left', 'image-right'].includes(spec.layout) || columns === 2 ? 4.05 : 8.7;
    // A section may have six long subitems. Expand these into independently
    // pageable paragraphs while retaining the section heading.
    const bullets = spec.bullets.flatMap(bullet => bulletHeight(bullet, width) > geometry(spec, ratio).available
        ? [{ text: bullet.text, subBullets: [] }, ...bullet.subBullets.map(text => ({ text, subBullets: [] }))]
        : [bullet]);
    const chunks = pack(bullets, geometry({ ...spec, continuation: true }, ratio).available,
        bullet => bulletHeight(bullet, width), 5);
    const pages: SlideSpec[] = [];
    for (let i = 0; i < chunks.length; i += columns) pages.push({ ...spec,
        bullets: chunks.slice(i, i + columns).flat(), continuation: i > 0 });
    return pages;
}
function addText(slide: PptxGenJS.Slide, text: string, x: number, y: number, w: number, h: number,
    size: number, color: string, options: PptxGenJS.TextPropsOptions = {}) {
    slide.addText(text, { x, y, w, h, fontFace: 'Microsoft YaHei', fontSize: size, color,
        margin: 0, breakLine: false, valign: 'top', fit: 'shrink', ...options });
}
function rule(slide: PptxGenJS.Slide, x: number, y: number, w: number, color: string, h = 0.025) {
    slide.addShape('rect', { x, y, w, h, line: { color, transparency: 100 }, fill: { color } });
}
function renderBullets(slide: PptxGenJS.Slide, bullets: Bullet[], x: number, y: number, w: number, palette: Palette, timeline = false) {
    for (const [index, bullet] of bullets.entries()) {
        const height = textHeight(bullet.text, w - 0.28, BODY_FONT);
        if (timeline) addText(slide, String(index + 1).padStart(2, '0'), x, y, 0.45, height, 16, palette.accent, { bold: true });
        else rule(slide, x, y + 0.13, 0.08, palette.accent, 0.08);
        const inset = timeline ? 0.58 : 0.28;
        addText(slide, bullet.text, x + inset, y, w - inset, height, BODY_FONT, palette.text, { bold: true });
        y += height;
        for (const sub of bullet.subBullets) {
            const h = textHeight(sub, w - Math.max(inset, 0.35), SUB_FONT);
            addText(slide, sub, x + Math.max(inset, 0.35), y + 0.06, w - Math.max(inset, 0.35), h, SUB_FONT, palette.sub);
            y += h + 0.06;
        }
        y += 0.22;
    }
}
export function renderSlideFromSpec(slide: PptxGenJS.Slide, spec: SlideSpec, ratio: string, pageNo: string, templateId?: string) {
    const template = getPPTTemplate(templateId);
    const palette: Palette = template || THEME_MAP[spec.themeToken as keyof typeof THEME_MAP] || THEME_MAP['white-black'];
    const { height, top, available } = geometry(spec, ratio);
    slide.background = { color: palette.bg };
    rule(slide, MARGIN, 0.32, 0.6, palette.accent, 0.06);
    const hero = spec.layout === 'cover' || spec.layout === 'thanks';
    if (hero && template) {
        renderTemplateCover(slide, spec, template, height);
    } else if (hero) {
        const h = textHeight(spec.title, 8.2, 40);
        addText(slide, spec.title, 0.9, Math.max(1.1, (height - h) / 2 - 0.4), 8.2, h, 40, palette.text, { bold: true });
        if (spec.subtitle) addText(slide, spec.subtitle, 0.9, (height + h) / 2,
            8.2, textHeight(spec.subtitle, 8.2, 18), 18, palette.sub);
    } else {
        const title = spec.title + (spec.continuation ? '（续）' : '');
        const titleHeight = Math.min(1.25, textHeight(title, 8.7, 30));
        addText(slide, title, MARGIN, MARGIN, 8.7, titleHeight, 30, palette.text, { bold: true });
        if (spec.subtitle) addText(slide, spec.subtitle, MARGIN, MARGIN + titleHeight + 0.16,
            8.7, Math.min(0.65, textHeight(spec.subtitle, 8.7, 15)), 15, palette.sub);
        if (spec.layout === 'stats' && spec.stats.length) {
            const columns = Math.min(3, spec.stats.length), rows = Math.ceil(spec.stats.length / columns);
            const w = (8.7 - (columns - 1) * 0.35) / columns, h = (available - (rows - 1) * 0.3) / rows;
            spec.stats.forEach((stat, i) => {
                const x = MARGIN + (i % columns) * (w + 0.35), y = top + Math.floor(i / columns) * (h + 0.3);
                rule(slide, x, y, w, palette.accent);
                addText(slide, stat.label, x, y + 0.12, w, h * 0.22, 15, palette.sub);
                addText(slide, stat.value, x, y + h * 0.32, w, h * 0.36, 32, palette.accent, { bold: true });
                if (stat.note) addText(slide, stat.note, x, y + h * 0.73, w, h * 0.27, 13, palette.sub);
            });
        } else if (spec.layout === 'comparison' && spec.sections.length) {
            spec.sections.forEach((section, i) => {
                const x = MARGIN + i * 4.65;
                addText(slide, section.title, x, top, 4.05, 0.5, 20, palette.accent, { bold: true });
                renderBullets(slide, section.items.map(text => ({ text, subBullets: [] })), x, top + 0.6, 4.05, palette);
            });
        } else if (spec.layout === 'quote' && spec.quote) {
            rule(slide, MARGIN, top, 0.06, palette.accent, available);
            addText(slide, spec.quote.text, 1, top + 0.2, 8, available - 0.8, 28, palette.text, { bold: true });
            if (spec.quote.author) addText(slide, '— ' + spec.quote.author, 1, height - 1.05, 8, 0.35, 14, palette.sub, { align: 'right' });
        } else if (spec.layout === 'two-column') {
            // Match pagination's greedy split by actual text height, not count.
            const chunks = pack(spec.bullets, geometry({ ...spec, continuation: true }, ratio).available, bullet => bulletHeight(bullet, 4.05), 5);
            chunks.slice(0, 2).forEach((bullets, i) => renderBullets(slide, bullets, MARGIN + i * 4.65, top, 4.05, palette));
        } else if (['image-left', 'image-right'].includes(spec.layout) && spec.image && /^data:image\//i.test(spec.image.url)) {
            const left = spec.layout === 'image-left';
            slide.addImage({ data: spec.image.url, x: left ? MARGIN : 5.3, y: top, w: 4.05, h: available - 0.45, sizing: { type: 'contain', w: 4.05, h: available - 0.45 } });
            if (spec.image.caption) addText(slide, spec.image.caption, left ? MARGIN : 5.3, height - 1, 4.05, 0.35, 12, palette.sub);
            renderBullets(slide, spec.bullets, left ? 5.3 : MARGIN, top, 4.05, palette);
        } else renderBullets(slide, spec.bullets, MARGIN, top, 8.7, palette, spec.layout === 'timeline' || spec.layout === 'toc');
    }
    rule(slide, MARGIN, height - 0.4, 8.7, palette.sub, 0.008);
    addText(slide, pageNo, 8.7, height - 0.32, 0.65, 0.2, 9, hero && template?.style === 'split' ? 'FFFFFF' : palette.sub, { align: 'right' });
}

/** MIT-adapted SplitScreen / MinimalistGradient / LayeredDepth cover designs. */
function renderTemplateCover(slide: PptxGenJS.Slide, spec: SlideSpec,
    template: NonNullable<ReturnType<typeof getPPTTemplate>>, height: number) {
    const shape = (x: number, y: number, w: number, h: number, color: string, transparency = 0) => {
        slide.addShape('rect', { x, y, w, h, line: { color, transparency: 100 }, fill: { color, transparency } });
    };
    let x = 0.75, w = 4.0, textColor = template.text, subColor = template.sub;
    if (template.style === 'split') {
        shape(5, 0, 5, height, template.accent);
        const diameter = Math.min(3.3, height * 0.55);
        slide.addShape('ellipse', { x: 5.85, y: (height - diameter) / 2, w: diameter, h: diameter,
            line: { color: template.secondary, transparency: 100 }, fill: { color: template.secondary, transparency: 60 } });
        shape(5, 0.45, 0.04, height - 0.9, template.secondary);
    } else if (template.style === 'gradient') {
        shape(0, 0, 5, height, template.accent);
        shape(5.8, height * 0.2, 3.3, height * 0.6, template.secondary, 88);
        rule(slide, x, height * 0.27, 3.5, 'FFFFFF');
        textColor = 'FFFFFF'; subColor = 'FFFFFF';
    } else {
        [0.38, 0.75, 1.12].forEach((inset, i) => shape(inset, inset, 10 - inset * 2,
            height - inset * 2, i === 1 ? template.secondary : template.accent, 90 - i * 5));
        x = 1.4; w = 7.2;
    }
    const y = height * 0.32;
    // Fixed generous title area with shrink-to-fit handles long document names.
    addText(slide, spec.title, x, y, w, height * 0.3, 36, textColor,
        { bold: true, align: template.style === 'layered' ? 'center' : 'left', valign: 'middle' });
    if (spec.subtitle) addText(slide, spec.subtitle, x, height * 0.65, w, height * 0.18, 17, subColor,
        { align: template.style === 'layered' ? 'center' : 'left' });
}
