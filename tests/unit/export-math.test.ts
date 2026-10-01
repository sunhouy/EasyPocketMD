/** @jest-environment jsdom */
// @ts-nocheck
export {};
const { cleanExportMath } = require('../../js/ui/export-math');
const { prepareDocxDiagrams, exportMermaidSvg } = require('../../js/ui/mermaid-export');
jest.mock('html2canvas', () => ({ __esModule: true, default: jest.fn() }));

describe('exported formula layout', () => {
    it('keeps inline formulas between the surrounding words and display formulas in blocks', () => {
        const html = cleanExportMath('<p>Before <mjx-container><svg style="vertical-align:-0.2ex"><path d="M0 0"/></svg></mjx-container> after</p><mjx-container display="true"><svg><path d="M0 0"/></svg></mjx-container>');
        const host = document.createElement('div'); host.innerHTML = html;
        const inline = host.querySelector('p > span.export-math-inline');
        expect(inline).not.toBeNull();
        expect(inline.style.display).toBe('inline-block');
        expect(inline.previousSibling.textContent).toBe('Before ');
        expect(inline.nextSibling.textContent).toBe(' after');
        expect(inline.querySelector('svg').style.verticalAlign).toBe('-0.2ex');
        expect(host.querySelector('div.export-math-display').style.display).toBe('block');
    });
});

describe('Mermaid vector export', () => {
    beforeEach(() => {
        window.mermaid = {
            initialize: jest.fn(),
            run: jest.fn(async ({ nodes }) => {
                nodes[0].innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 90"><rect width="100" height="50"/><text>Start</text></svg>';
            })
        };
        window.uploadImage = jest.fn();
        require('../../js/ui/render');
    });
    it('preserves SVG paths and text without calling canvas or upload', async () => {
        const html = await window.convertFormulasAndChartsToImages('<div class="mermaid">graph TD; A-->B;</div>', { useTempDir: true });
        expect(html).toContain('mermaid-vector');
        expect(html).toContain('<svg');
        expect(html).toContain('<text>Start</text>');
        expect(html).not.toContain('<img');
        expect(require('html2canvas').default).not.toHaveBeenCalled();
        expect(window.uploadImage).not.toHaveBeenCalled();
        expect(window.mermaid.initialize).toHaveBeenCalledWith(expect.objectContaining({ htmlLabels: false, journey: { textPlacement: 'svg' } }));
    });
    it('extracts actual Mermaid fences for DOCX and leaves code examples alone', async () => {
        const diagrams = await prepareDocxDiagrams('~~~text\n```mermaid\ngraph TD; fake-->example;\n```\n~~~\n\n```mermaid\ngraph TD; A-->B;\n```');
        expect(diagrams).toHaveLength(1);
        expect(diagrams[0].code).toBe('graph TD; A-->B;');
        expect(diagrams[0].svg).toContain('width="300"');
    });
    it('embeds PNG fallback instead of silently dropping non-vector diagrams', async () => {
        window.convertFormulasAndChartsToImages = jest.fn(async () => '<img src="data:image/png;base64,iVBORw0KGgo=" />');
        const diagrams = await prepareDocxDiagrams('```mermaid\njourney\n title 购物体验\n```');
        expect(diagrams).toEqual([{ code: 'journey\n title 购物体验', png: 'data:image/png;base64,iVBORw0KGgo=' }]);
    });
    it('reports render failures instead of producing a DOCX with missing charts', async () => {
        window.convertFormulasAndChartsToImages = jest.fn(async () => '<div>[Mermaid Diagram]</div>');
        await expect(prepareDocxDiagrams('```mermaid\ninvalid\n```')).rejects.toThrow('could not be exported');
    });
});

describe('bundled Mermaid journey renderer', () => {
    it('exports the shopping journey with native SVG labels', async () => {
        const fs = jest.requireActual('fs');
        const bundle = fs.readFileSync(require.resolve('@sunhouyun/vditor/dist/js/mermaid/mermaid.min.js'), 'utf8');
        window.eval(bundle.replace('var __esbuild_esm_mermaid_nm;', 'var __esbuild_esm_mermaid_nm=globalThis.__esbuild_esm_mermaid_nm={};'));
        SVGElement.prototype.getBBox = () => ({ x: 0, y: 0, width: 300, height: 30 });
        SVGElement.prototype.getComputedTextLength = function () { return this.textContent.length * 14; };
        const realMermaid = window.mermaid;
        realMermaid.initialize({ startOnLoad: false, securityLevel: 'loose', htmlLabels: false, journey: { textPlacement: 'svg' } });
        const result = await realMermaid.render('shopping-journey', 'journey\n title 购物体验\n section 浏览\n 查看商品: 5: 用户\n section 购买\n 下单支付: 5: 用户\n section 售后\n 收货评价: 5: 用户');
        const host = document.createElement('div'); host.innerHTML = result.svg;
        const svg = exportMermaidSvg(host.querySelector('svg'));
        expect(svg).not.toBeNull();
        expect(svg).not.toContain('foreignObject');
        for (const label of ['购物体验', '查看商品', '下单支付', '收货评价']) expect(svg).toContain(label);
    });
});
