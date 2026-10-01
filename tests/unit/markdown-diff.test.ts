/** @jest-environment jsdom */
// @ts-nocheck
export {};
const { renderMarkdownDiff, mountDiffView } = require('../../js/files/conflict/markdown');
const { bindCollapsedDiffInteractions, buildMergedTextFromDiff } = require('../../js/files/conflict/index');
const same = text => ({ type: 'same', left: text, right: text });
const remove = text => ({ type: 'removed', left: text, right: '' });
const add = text => ({ type: 'added', left: '', right: text });

describe('rendered Markdown comparison', () => {
    beforeEach(() => { document.body.innerHTML = '<div id="diff"></div>'; delete window.Vditor; });
    it('renders full lists, tables, fenced code and emphasis while preserving the source merge', async () => {
        const left = ['# Old', '', '- **First**', '- Second', '', '| A | B |', '| - | - |', '| 1 | 2 |', '', '```js', 'const x = 1;', '```'];
        const right = left.map(line => line === '# Old' ? '# New' : line);
        const diff = [remove(left[0]), add(right[0]), ...left.slice(1).map(same)];
        const container = document.getElementById('diff');
        container.innerHTML = await renderMarkdownDiff(diff, false, { collapseSame: false });
        expect([...container.querySelectorAll('h1')].map(el => el.textContent)).toEqual(['Old', 'New']);
        expect(container.querySelectorAll('ul')).toHaveLength(2);
        expect(container.querySelectorAll('strong')).toHaveLength(2);
        expect(container.querySelectorAll('table')).toHaveLength(2);
        expect(container.querySelector('pre code').textContent).toContain('const x = 1;');
        expect(buildMergedTextFromDiff(diff, { 0: 'right' })).toBe(right.join('\n'));
    });
    it('preserves reference links and removes scripts, events and JavaScript links', async () => {
        const html = await renderMarkdownDiff([remove('old'), add('[ref][link] <img src=x onerror="alert(1)"><script>alert(1)</script>'), add(''), add('[link]: javascript:alert(1)')], false, { collapseSame: false });
        const container = document.getElementById('diff'); container.innerHTML = html;
        expect(container.querySelector('script')).toBeNull();
        expect(container.querySelector('[onerror]')).toBeNull();
        expect(container.querySelector('a[href^="javascript:"]')).toBeNull();
        expect(container.textContent).toContain('ref');
        const linked = await renderMarkdownDiff([remove('old'), add('[ref][link]'), add(''), add('[link]: https://example.com')], false, { collapseSame: false });
        container.innerHTML = linked; expect(container.querySelector('a').href).toBe('https://example.com/');
    });
    it('can expand and refold unchanged Markdown blocks', async () => {
        const container = document.getElementById('diff');
        await mountDiffView(container, [same('## Same'), same(''), remove('old'), add('**new**')], false);
        bindCollapsedDiffInteractions(container);
        const collapsed = container.querySelector('[data-markdown-collapse]');
        expect(container.querySelector('h2').closest('.diff-line').hidden).toBe(true);
        collapsed.click(); expect(container.querySelector('h2').closest('.diff-line').hidden).toBe(false);
        collapsed.click(); expect(container.querySelector('h2').closest('.diff-line').hidden).toBe(true);
    });
    it('does not overwrite source mode with a late Markdown render', async () => {
        let resolveRender; window.Vditor = { md2html: () => new Promise(resolve => { resolveRender = resolve; }) };
        const container = document.getElementById('diff');
        const diff = [remove('old'), add('**new**')];
        const pending = mountDiffView(container, diff, false);
        await new Promise(resolve => setTimeout(resolve, 0));
        await mountDiffView(container, diff, false, { markdown: false });
        // Both sides are converted sequentially; resolve the first, then the second.
        resolveRender('<p>old</p>'); await new Promise(resolve => setTimeout(resolve, 0));
        resolveRender('<p><strong>new</strong></p>'); await pending;
        expect(container.querySelector('strong')).toBeNull();
        expect(container.textContent).toContain('**new**');
    });
});
