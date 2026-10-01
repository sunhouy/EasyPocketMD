/** @jest-environment jsdom */
// @ts-nocheck
export {};
const { echartsMarkdown } = require('../../js/ui/echarts-markdown');
const { useVditorVectorCharts } = require('../../scripts/vditor-vector-charts');
const fs = jest.requireActual('fs');

describe('native vector charts', () => {
    it('stores editable options as an echarts fence, including Unicode and punctuation', () => {
        const option = { title: { text: '数据 "对比" ```' }, series: [{ type: 'bar', data: [2, 4] }] };
        const md = echartsMarkdown(option);
        expect(md.startsWith('\n```echarts\n')).toBe(true);
        expect(JSON.parse(md.split('\n').slice(2, -3).join('\n'))).toEqual(option);
        expect(md).not.toMatch(/data:image|!\[/);
    });
    it.each([
        'echarts.init(e, theme === "dark" ? "dark" : undefined)',
        'echarts.init(e,"dark"===t?"dark":void 0)'
    ])('clears JSON before the SVG painter appends its viewport: %s', init => {
        const e = document.createElement('div');
        const option = { title: { text: '活动热力图' }, series: [{ type: 'heatmap', data: [[0, 0, 5]] }] };
        e.textContent = JSON.stringify(option);
        const chart = { setOption: jest.fn() };
        const echarts = { init: jest.fn(element => {
            expect(element.textContent).toBe('');
            element.innerHTML = '<div><svg><text>活动热力图</text></svg></div>';
            return chart;
        }) };
        const source = 'var option=JSON.parse(e.textContent); ' + init + '.setOption(option);';
        new Function('e', 'echarts', 'theme', 't', useVditorVectorCharts(source))(e, echarts, 'dark', 'dark');
        expect(chart.setOption).toHaveBeenCalledWith(option);
        expect(e.textContent).toBe('活动热力图');
        expect(echarts.init).toHaveBeenCalledWith(e, 'dark', { renderer: 'svg' });
    });
    it.each(['index.js', 'index.min.js', 'method.js', 'method.min.js'])('uses SVG in the installed Vditor %s chart renderer', file => {
        const source = fs.readFileSync('node_modules/@sunhouyun/vditor/dist/' + file, 'utf8');
        const patched = useVditorVectorCharts(source);
        expect(patched).not.toEqual(source);
        expect(patched).toMatch(/echarts\.init\(e,[^;]{0,100}renderer:\s*"svg"/);
        expect(useVditorVectorCharts(patched)).toEqual(patched);
    });
});

describe('vector chart export', () => {
    it('renders ECharts to SVG for HTML/PDF without taking a screenshot', async () => {
        const chart = { setOption: jest.fn(), renderToSVGString: jest.fn(() => '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0L10 10"/></svg>'), dispose: jest.fn() };
        jest.doMock('echarts', () => ({ init: jest.fn(() => chart) }));
        const { renderEChartsExportBlocks } = require('../../js/ui/echarts-markdown');
        const host = document.createElement('div');
        host.innerHTML = '<pre><code class="language-echarts">{"series":[{"type":"bar","data":[1,2]}]}</code></pre>';
        await renderEChartsExportBlocks(host);
        expect(require('echarts').init).toHaveBeenCalledWith(null, undefined, expect.objectContaining({ renderer: 'svg', ssr: true }));
        expect(host.querySelector('svg path')).not.toBeNull();
        expect(host.querySelector('img, canvas, code')).toBeNull();
        expect(chart.setOption).toHaveBeenCalledWith(expect.objectContaining({ animation: false }));
        expect(chart.dispose).toHaveBeenCalled();
    });
});
