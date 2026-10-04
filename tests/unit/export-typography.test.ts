import { exportFontStack, exportHeadingSizes } from '../../shared/export-typography';
import { applyMixedPdfFonts } from '../../js/ui/pdf-text-fonts';

describe('Bilingual export typography', () => {
    it('uses balanced defaults and independently selected fonts', () => {
        expect(exportHeadingSizes()).toEqual({ 1: 24, 2: 18, 3: 15, 4: 12, 5: 12, 6: 12 });
        expect(exportFontStack({ bodyFont: 'SimKai' })).toContain('"Times New Roman", "Liberation Serif", "SimKai"');
        expect(exportFontStack({ englishFont: 'Arial', titleFont: 'SimHei' }, true)).toContain('"Arial", "SimHei"');
    });
    it('keeps bold/link context while splitting English and Chinese PDF text', () => {
        const content = [{ text: 'Hello 中文', bold: true, link: 'https://example.com', font: 'SimHei' }];
        expect(applyMixedPdfFonts(content, 'LiberationSerif', 'SimSun')).toEqual([
            { text: [{ text: 'Hello ', font: 'LiberationSerif' }, { text: '中文', font: 'SimHei' }], bold: true, link: 'https://example.com', font: 'SimHei' }
        ]);
    });
});
