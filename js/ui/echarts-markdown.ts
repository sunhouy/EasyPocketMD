/** Preserve chart options as native Markdown instead of a flattened screenshot. */
export function echartsMarkdown(option: unknown): string {
    return '\n```echarts\n' + JSON.stringify(option, null, 2) + '\n```\n\n';
}

/** Export a complete vector chart without canvas capture or PNG conversion. */
export async function renderEChartsSvg(option: any): Promise<string> {
    const echarts = await import('echarts');
    const chart = echarts.init(null, undefined, { renderer: 'svg', ssr: true, width: 720, height: 400 });
    try {
        chart.setOption({ ...option, animation: false });
        return chart.renderToSVGString();
    } finally { chart.dispose(); }
}

export async function renderEChartsExportBlocks(container: HTMLElement) {
    for (const code of Array.from(container.querySelectorAll('code.language-echarts'))) {
        const svg = await renderEChartsSvg(JSON.parse(code.textContent || '{}'));
        const host = document.createElement('div');
        host.className = 'echarts-vector'; host.innerHTML = svg;
        host.style.cssText = 'margin:1em 0;text-align:center;';
        const image = host.querySelector('svg');
        if (image) { image.style.maxWidth = '100%'; image.style.height = 'auto'; }
        const pre = code.parentElement;
        (pre?.tagName === 'PRE' ? pre : code).replaceWith(host);
    }
}
