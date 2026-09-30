/** MathJax's display attribute distinguishes inline expressions from display math. */
export function cleanExportMath(html: string) {
    const container = document.createElement('div');
    container.innerHTML = html;
    container.querySelectorAll('script, mjx-assistive-mml').forEach(node => node.remove());
    container.querySelectorAll('mjx-container').forEach(math => {
        const svg = math.querySelector('svg');
        if (!svg) { math.remove(); return; }
        const display = math.getAttribute('display') === 'true';
        const wrapper = document.createElement(display ? 'div' : 'span');
        wrapper.className = display ? 'export-math-display' : 'export-math-inline';
        wrapper.style.cssText = display
            ? 'display:block;text-align:center;margin:1em 0;page-break-inside:avoid;'
            : 'display:inline-block;vertical-align:middle;margin:0;white-space:nowrap;';
        wrapper.appendChild(svg.cloneNode(true));
        math.replaceWith(wrapper);
    });
    return container.innerHTML;
}
