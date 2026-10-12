/** Replace Vditor 3.x's blocking MathJax request in all distributed bundles. */
export function useVditorAsyncMath(code: string): string {
    const syncCall = /\(0,\s*([\w$]+)(?:\/\*[^*]*\*\/)?\s*\.U\)\((""\.concat\([^;]+?"\/dist\/js\/mathjax\/tex-svg-full\.js"\)),\s*"protyleMathJaxScript"\);/g;
    const patched = code.replace(syncCall, (_match, module, url) =>
        `window.__epmdMathJaxReady || (window.__epmdMathJaxReady = (0,${module}.Z)(${url},"protyleMathJaxScript").catch(function(error){window.__epmdMathJaxReady=null;throw error;}));`);
    if (patched === code) return code;
    return patched.replace(/window\.MathJax\.startup\.promise\.then\(/g,
        'window.__epmdMathJaxReady.then(function(){return window.MathJax.startup.promise;}).then(');
}
