import { textDiff, highlightedLines } from './highlight';

type Side = { label: string; read(): string; write?(text: string): boolean | void };
/** Keep textareas stable while repainting the comparison underneath them. */
export function createDiffEditors(host: HTMLElement, sides: [Side, Side], onEdit?: () => void) {
    host.classList.add('diff-editors');
    const inputs: HTMLTextAreaElement[] = [], paints: HTMLElement[] = [];
    let composing = false, frame = 0;
    sides.forEach((side, index) => {
        const pane = document.createElement('div'); pane.className = 'diff-edit-pane';
        const paint = document.createElement('pre'); paint.className = 'diff-edit-paint'; paint.setAttribute('aria-hidden', 'true');
        const input = document.createElement('textarea'); input.className = 'diff-edit-input'; input.spellcheck = false;
        input.wrap = 'soft'; input.value = side.read(); input.readOnly = !side.write; input.setAttribute('aria-label', side.label);
        pane.append(paint, input); host.append(pane); inputs.push(input); paints.push(paint);
        const scroll = () => { paint.style.transform = `translateY(${-input.scrollTop}px)`; };
        input.addEventListener('scroll', scroll);
        input.addEventListener('compositionstart', () => { composing = true; });
        input.addEventListener('compositionend', () => { composing = false; save(); });
        const save = () => {
            cancelAnimationFrame(frame); frame = requestAnimationFrame(paintBoth);
            if (!side.write || composing) return;
            if (side.write(input.value) === false) return;
            onEdit?.();
        };
        input.addEventListener('input', save);
    });
    function paintBoth() {
        const parts = textDiff(inputs[0].value, inputs[1].value);
        paints.forEach((paint, index) => {
            paint.innerHTML = highlightedLines(parts, index === 0 ? 'left' : 'right').join('\n') + '\n';
            paint.style.width = inputs[index].clientWidth + 'px';
            paint.style.transform = `translateY(${-inputs[index].scrollTop}px)`;
        });
    }
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(paintBoth) : null;
    observer?.observe(host); paintBoth();
    return {
        flush() { sides.forEach((side, index) => { if (side.write && inputs[index].value !== side.read()) side.write(inputs[index].value); }); },
        destroy() { cancelAnimationFrame(frame); observer?.disconnect(); host.replaceChildren(); host.classList.remove('diff-editors'); },
        inputs
    };
}
