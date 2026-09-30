// @ts-nocheck
import JSZip from 'jszip';
const { DOMParser } = require('@xmldom/xmldom');
const { applyDocxTypography, normalizeDocxSettings } = require('../../api/utils/docxTypography');

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
describe('final DOCX typography', () => {
    it('uses title size ratios until custom heading sizes are enabled', () => {
        expect(normalizeDocxSettings({ titleFontSize: '20', h1Size: '72', useCustomHeadingSizes: false }).h1Size).toBe(30);
        expect(normalizeDocxSettings({ titleFontSize: '20', h1Size: '72', useCustomHeadingSizes: true }).h1Size).toBe(72);
    });
    it('overrides template and direct run formatting while preserving emphasis, code and math', async () => {
        const zip = new JSZip();
        zip.file('word/styles.xml', `<w:styles xmlns:w="${W}"><w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:rPr><w:rFonts w:eastAsiaTheme="majorEastAsia"/><w:sz w:val="72"/><w:b/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="MyHeading"><w:basedOn w:val="Heading1"/></w:style></w:styles>`);
        zip.file('word/document.xml', `<w:document xmlns:w="${W}" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"><w:body><w:p><w:pPr><w:pStyle w:val="MyHeading"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Template"/><w:sz w:val="99"/><w:b/></w:rPr><w:t>Heading</w:t></w:r></w:p><w:p><w:r><w:rPr><w:i/></w:rPr><w:t>Body</w:t></w:r><m:oMath><m:r><m:t>x</m:t></m:r></m:oMath></w:p><w:p><w:pPr><w:pStyle w:val="SourceCode"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Consolas"/></w:rPr><w:t>code</w:t></w:r></w:p></w:body></w:document>`);
        const result = await JSZip.loadAsync(await applyDocxTypography(await zip.generateAsync({ type: 'nodebuffer' }), { titleFont: '标题 & Font', bodyFont: '正文字体', titleFontSize: 20, bodyFontSize: 15 }));
        const doc = new DOMParser().parseFromString(await result.file('word/document.xml').async('string'), 'application/xml');
        const runs = Array.from(doc.getElementsByTagNameNS(W, 'r'));
        expect(runs[0].getElementsByTagNameNS(W, 'rFonts')[0].getAttributeNS(W, 'eastAsia')).toBe('标题 & Font');
        expect(runs[0].getElementsByTagNameNS(W, 'sz')[0].getAttributeNS(W, 'val')).toBe('60');
        expect(runs[0].getElementsByTagNameNS(W, 'b')).toHaveLength(1);
        expect(runs[1].getElementsByTagNameNS(W, 'sz')[0].getAttributeNS(W, 'val')).toBe('30');
        expect(runs[1].getElementsByTagNameNS(W, 'i')).toHaveLength(1);
        expect(runs[2].getElementsByTagNameNS(W, 'rFonts')[0].getAttributeNS(W, 'ascii')).toBe('Consolas');
        expect(doc.getElementsByTagNameNS('http://schemas.openxmlformats.org/officeDocument/2006/math', 'oMath')).toHaveLength(1);
        const styles = await result.file('word/styles.xml').async('string');
        expect(styles).not.toContain('majorEastAsia');
        expect(styles).toContain('w:szCs w:val="30"');
    });
});
