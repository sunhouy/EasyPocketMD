/** @jest-environment jsdom */
import '../../js/ui/print';

describe('Document export defaults', () => {
    it('shows left aligned titles, reasonable sizes and a separate English font', () => {
        document.body.innerHTML = '';
        window.showPrintDialog('export-html', jest.fn());
        expect(document.querySelector('.title-align-btn.active')!.getAttribute('data-align')).toBe('left');
        expect(document.querySelector<HTMLInputElement>('#titleFontSize')!.value).toBe('12');
        expect(document.querySelector<HTMLSelectElement>('#englishFont')!.value).toBe('Times New Roman');
        expect(document.querySelector<HTMLSelectElement>('#lineHeight')!.value).toBe('1.5');
        document.body.innerHTML = '';
    });
    it('applies both fonts to exported HTML instead of a fixed body font', async () => {
        global.fetch = jest.fn().mockResolvedValue({ json: async () => ({ code: 200, data: '<h1>标题 Title</h1><p>正文 Body</p>' }) });
        window.convertFormulasAndChartsToImages = jest.fn(async html => html);
        const html = await window.preparePrintContent('# 标题 Title\n正文 Body', { titleFont: 'SimHei', bodyFont: 'SimKai', englishFont: 'Arial' });
        expect(html).toContain('text-align: left');
        expect(html).toContain('font-family: "Arial", "SimKai"');
        expect(html).toContain('font-family: "Arial", "SimHei"');
        expect(html).toContain('h1 { font-size: 24pt');
    });
});
