/** @jest-environment jsdom */
// @ts-nocheck
import { liveTextRanges, createLiveDecoration } from '../../js/files/conflict/live-decoration';
import { mapScrollPosition, bindSynchronizedScroll } from '../../js/files/conflict/scroll';

test('word ranges preserve semantic DOM, selection and source content without inserted markup', () => {
    document.body.innerHTML = '<div id="host"><div id="a"><h2>Title</h2><p>price <strong>10</strong></p></div><div id="b"><h2>Title</h2><p>price <strong>20</strong></p></div></div>';
    const roots = [document.getElementById('a'), document.getElementById('b')], before = roots.map(root => root.innerHTML);
    const selection = getSelection(), caret = document.createRange(); caret.setStart(roots[0].querySelector('strong').firstChild, 1); caret.collapse(true); selection.addRange(caret);
    const ranges = liveTextRanges(roots);
    expect(ranges.map(items => items.map(range => range.toString()))).toEqual([['1'], ['2']]);
    expect(roots.map(root => root.innerHTML)).toEqual(before); expect(selection.anchorOffset).toBe(1);
    const registry = new Map(); window.CSS = { highlights: registry }; window.Highlight = class extends Set { constructor(...ranges) { super(ranges); } };
    const paint = createLiveDecoration(document.getElementById('host'), roots); paint.paint(roots);
    expect(registry.size).toBe(2); expect(roots[0].querySelector('mark')).toBeNull();
    paint.destroy(); expect(registry.size).toBe(0);
});

test('aligns scrolling by diff positions and synchronizes both directions without feedback', () => {
    const a = [{ key: 0, top: 0 }, { key: 3, top: 100 }, { key: 8, top: 400 }], b = [{ key: 0, top: 0 }, { key: 3, top: 300 }, { key: 8, top: 500 }];
    expect(mapScrollPosition(100, a, b)).toBe(300); expect(mapScrollPosition(250, a, b)).toBe(400);
    expect(mapScrollPosition(400, b, a)).toBe(250);
    const panes = [document.createElement('div'), document.createElement('div')];
    panes.forEach((pane, index) => { Object.defineProperties(pane, { scrollHeight: { value: index ? 600 : 500 }, clientHeight: { value: 100 }, scrollWidth: { value: 300 }, clientWidth: { value: 100 } }); });
    const stop = bindSynchronizedScroll(panes, index => index ? b : a);
    panes[0].scrollTop = 100; panes[0].scrollLeft = 50; panes[0].dispatchEvent(new Event('scroll')); expect(panes[1].scrollTop).toBe(300); expect(panes[1].scrollLeft).toBe(50);
    panes[1].dispatchEvent(new Event('scroll')); expect(panes[0].scrollTop).toBe(100);
    panes[1].scrollTop = 400; panes[1].dispatchEvent(new Event('scroll')); expect(panes[0].scrollTop).toBe(250);
    stop(); panes[0].scrollTop = 0; panes[0].dispatchEvent(new Event('scroll')); expect(panes[1].scrollTop).toBe(400);
});
