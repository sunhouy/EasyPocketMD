/** Vditor 3.x has no renderer option in chartRender; adapt its bundled init call. */
export function useVditorVectorCharts(code: string): string {
    // Unlike the canvas painter, the SVG painter appends without clearing JSON.
    // Vditor already parsed the option; clear only its generated preview node.
    return code
        .replace(/echarts\.init\(e, theme === "dark" \? "dark" : undefined\)/g,
            '(e.textContent = "", echarts.init(e, theme === "dark" ? "dark" : undefined, { renderer: "svg" }))')
        .replace(/echarts\.init\(e,"dark"===([\w$]+)\?"dark":void 0\)/g,
            '(e.textContent="",echarts.init(e,"dark"===$1?"dark":void 0,{renderer:"svg"}))');
}
