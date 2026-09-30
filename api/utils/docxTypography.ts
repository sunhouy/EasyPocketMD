import JSZip from 'jszip';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const headingScales = [1.5, 1.3, 1.1, 1, 0.9, 0.8];

export function normalizeDocxSettings(settings: any = {}) {
    const positive = (value: unknown, fallback: number) => {
        const number = Number(value);
        return Number.isFinite(number) && number > 0 && number <= 200 ? number : fallback;
    };
    const titleFontSize = positive(settings.titleFontSize, 24);
    const normalized: any = {
        ...settings, titleFont: settings.titleFont || 'SimHei', bodyFont: settings.bodyFont || 'SimSun',
        titleFontSize, bodyFontSize: positive(settings.bodyFontSize, 12)
    };
    headingScales.forEach((scale, index) => {
        const key = 'h' + (index + 1) + 'Size';
        normalized[key] = settings.useCustomHeadingSizes === true
            ? positive(settings[key], titleFontSize * scale) : titleFontSize * scale;
    });
    return normalized;
}

/** Apply user typography to the actual output, including templates without rPr. */
export async function applyDocxTypography(buffer: Buffer, rawSettings: any) {
    const settings = normalizeDocxSettings(rawSettings);
    const zip = await JSZip.loadAsync(buffer);
    const stylesFile = zip.file('word/styles.xml');
    if (!stylesFile) throw new Error('DOCX is missing word/styles.xml');
    const parser = new DOMParser();
    const serializer = new XMLSerializer();
    const styles = parser.parseFromString(await stylesFile.async('string'), 'application/xml');
    const direct = (parent: any, name: string) => Array.from(parent.childNodes as ArrayLike<any>)
        .find(node => node.namespaceURI === W && node.localName === name) as any;
    const ensure = (parent: any, name: string, first = false): any => {
        let node = direct(parent, name);
        if (!node) {
            node = parent.ownerDocument.createElementNS(W, 'w:' + name);
            if (first) parent.insertBefore(node, parent.firstChild); else parent.appendChild(node);
        }
        return node;
    };
    const typography = (rPr: any, font: string, size: number) => {
        const fonts = ensure(rPr, 'rFonts', true);
        // Theme font references override literal font names in Word.
        for (const theme of ['asciiTheme', 'hAnsiTheme', 'eastAsiaTheme', 'cstheme', 'csTheme']) fonts.removeAttributeNS(W, theme);
        for (const slot of ['ascii', 'hAnsi', 'eastAsia', 'cs']) fonts.setAttributeNS(W, 'w:' + slot, font);
        for (const name of ['sz', 'szCs']) ensure(rPr, name).setAttributeNS(W, 'w:val', String(Math.round(size * 2)));
    };
    const styleMap = new Map<string, any>();
    const allStyles = Array.from(styles.getElementsByTagNameNS(W, 'style'));
    for (const style of allStyles) styleMap.set((style.getAttributeNS(W, 'styleId') || ''), style);
    const headingLevel = (id: string, visited = new Set<string>()): number => {
        if (!id || visited.has(id)) return 0;
        visited.add(id);
        const style = styleMap.get(id);
        const name = direct(style || { childNodes: [] }, 'name')?.getAttributeNS(W, 'val') || id;
        const match = /^(?:heading|标题)\s*([1-6])$/i.exec(name) || /^Heading([1-6])$/i.exec(id);
        return match ? Number(match[1]) : headingLevel(direct(style || { childNodes: [] }, 'basedOn')?.getAttributeNS(W, 'val'), visited);
    };
    const fontFor = (id: string) => {
        if (id === 'Title') return { font: settings.titleFont, size: settings.titleFontSize };
        const level = headingLevel(id);
        return { font: level ? settings.titleFont : settings.bodyFont, size: level ? settings['h' + level + 'Size'] : settings.bodyFontSize };
    };
    const defaults = ensure(styles.documentElement, 'docDefaults', true);
    typography(ensure(ensure(defaults, 'rPrDefault'), 'rPr'), settings.bodyFont, settings.bodyFontSize);
    for (const style of allStyles) {
        const id = (style.getAttributeNS(W, 'styleId') || '');
        if (style.getAttributeNS(W, 'type') !== 'paragraph' || /SourceCode|Verbatim|Code/i.test(id)) continue;
        const { font, size } = fontFor(id);
        typography(ensure(style, 'rPr'), font, size);
    }
    zip.file('word/styles.xml', serializer.serializeToString(styles));
    for (const file of Object.values(zip.files)) {
        if (!/^word\/(document|footnotes|endnotes)\.xml$/.test(file.name)) continue;
        const doc = parser.parseFromString(await file.async('string'), 'application/xml');
        for (const paragraph of Array.from(doc.getElementsByTagNameNS(W, 'p'))) {
            const id = direct(direct(paragraph, 'pPr') || { childNodes: [] }, 'pStyle')?.getAttributeNS(W, 'val') || 'Normal';
            if (/SourceCode|Verbatim|Code/i.test(id)) continue;
            const { font, size } = fontFor(id);
            for (const run of Array.from(paragraph.getElementsByTagNameNS(W, 'r'))) {
                const rPr = ensure(run, 'rPr', true);
                const characterStyle = direct(rPr, 'rStyle')?.getAttributeNS(W, 'val') || '';
                if (/SourceCode|Verbatim|Code/i.test(characterStyle)) continue;
                typography(rPr, font, size);
            }
        }
        zip.file(file.name, serializer.serializeToString(doc));
    }
    return zip.generateAsync({ type: 'nodebuffer' });
}
