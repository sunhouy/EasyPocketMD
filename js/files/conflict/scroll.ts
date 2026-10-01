export type ScrollAnchor = { key: number; top: number };
const interpolate = (value: number, points: ScrollAnchor[], input: 'key' | 'top', output: 'key' | 'top') => {
    if (!points.length) return 0;
    if (value <= points[0][input]) return points[0][output];
    for (let i = 1; i < points.length; i++) {
        if (value <= points[i][input]) {
            const a = points[i - 1], b = points[i], length = b[input] - a[input];
            return a[output] + (length ? (value - a[input]) / length : 0) * (b[output] - a[output]);
        }
    }
    return points[points.length - 1][output];
};
/** Follow corresponding diff blocks rather than copying pixels between different layouts. */
export function mapScrollPosition(top: number, from: ScrollAnchor[], to: ScrollAnchor[]) {
    return interpolate(interpolate(top, from, 'top', 'key'), to, 'key', 'top');
}
export function bindSynchronizedScroll(panes: [HTMLElement, HTMLElement], anchors: (index: number) => ScrollAnchor[], onScroll?: () => void) {
    const expected: ({ top: number; left: number } | null)[] = [null, null];
    const listeners = panes.map((pane, index) => {
        const listener = () => {
            onScroll?.();
            const scheduled = expected[index]; expected[index] = null;
            if (scheduled && Math.abs(pane.scrollTop - scheduled.top) < 1 && Math.abs(pane.scrollLeft - scheduled.left) < 1) return;
            const other = panes[1 - index];
            const source = anchors(index), target = anchors(1 - index);
            const max = pane.scrollHeight - pane.clientHeight, otherMax = other.scrollHeight - other.clientHeight;
            const top = source.length > 1 && target.length > 1 ? mapScrollPosition(pane.scrollTop, source, target) : (max > 0 ? pane.scrollTop / max * otherMax : 0);
            const horizontal = pane.scrollWidth - pane.clientWidth;
            const left = horizontal > 0 ? pane.scrollLeft / horizontal * (other.scrollWidth - other.clientWidth) : 0;
            expected[1 - index] = { top: Math.max(0, Math.min(otherMax, top)), left };
            other.scrollTop = expected[1 - index]!.top; other.scrollLeft = left;
        };
        pane.addEventListener('scroll', listener, { passive: true }); return listener;
    });
    return () => panes.forEach((pane, index) => pane.removeEventListener('scroll', listeners[index]));
}
