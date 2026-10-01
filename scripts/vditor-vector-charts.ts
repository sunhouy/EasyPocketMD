/** Vditor 3.x has no renderer option in chartRender; adapt its bundled init call. */
export function useVditorVectorCharts(code: string): string {
    return code
        .replace(/echarts\.init\(e, theme === "dark" \? "dark" : undefined\)/g,
            'echarts.init(e, theme === "dark" ? "dark" : undefined, { renderer: "svg" })')
        .replace(/echarts\.init\(e,"dark"===([\w$]+)\?"dark":void 0\)/g,
            'echarts.init(e,"dark"===$1?"dark":void 0,{renderer:"svg"})');
}
