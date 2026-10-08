const codeSelector = '[data-type="code-block"]';
const rootSelector = '.vditor, .diff-vditor';
/** Only changes that can affect a code source, editor lifecycle or theme need a scan. */
export function affectsCodeBlocks(mutation: MutationRecord): boolean {
    const target = mutation.target instanceof Element ? mutation.target : mutation.target.parentElement;
    if (!target || target.closest('.epmd-code-editor')) return false;
    if (mutation.type === 'attributes') {
        if (target === document.body) return mutation.attributeName === 'class';
        return !!target.closest(codeSelector) || target.matches(rootSelector) ||
            (mutation.attributeName === 'contenteditable' && !!target.querySelector(codeSelector));
    }
    if (target.closest(codeSelector)) return true;
    if (mutation.type !== 'childList') return false;
    return [...mutation.addedNodes, ...mutation.removedNodes].some(node => node instanceof Element &&
        (node.matches(`${codeSelector},${rootSelector}`) || !!node.querySelector(`${codeSelector},${rootSelector}`)));
}
