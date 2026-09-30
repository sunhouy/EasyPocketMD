/** @jest-environment jsdom */
// @ts-nocheck
export {};
const { cleanExportMath } = require('../../js/ui/export-math');
const { prepareDocxDiagrams } = require('../../js/ui/mermaid-export');
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
        expect(window.mermaid.initialize).toHaveBeenCalledWith(expect.objectContaining({ htmlLabels: false }));
    });
    it('extracts actual Mermaid fences for DOCX and leaves code examples alone', async () => {
        const diagrams = await prepareDocxDiagrams('~~~text\n```mermaid\ngraph TD; fake-->example;\n```\n~~~\n\n```mermaid\ngraph TD; A-->B;\n```');
        expect(diagrams).toHaveLength(1);
        expect(diagrams[0].code).toBe('graph TD; A-->B;');
        expect(diagrams[0].svg).toContain('width="300"');
    });
});
