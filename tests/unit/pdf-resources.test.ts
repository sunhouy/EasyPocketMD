import { normalizePdfResources } from '../../api/utils/pdfResources';

describe('PDF resource normalization for stdin HTML', () => {
    const normalize = (html: string) => normalizePdfResources(html, 'https://example.test/docs/', src => src === '/uploads/a.png' ? 'data:image/png;base64,YQ==' : null);
    it('inlines uploaded images and CSS resources and resolves relative and protocol-relative assets', () => {
        const html = normalize('<img src="/uploads/a.png"><img src="pic.png"><link rel="stylesheet" href="//cdn.test/a.css"><style>.a{background:url(/uploads/a.png)} .b{background:url(../b.png)}</style>');
        expect(html).toContain('src="data:image/png;base64,YQ=="');
        expect(html).toContain('src="https://example.test/docs/pic.png"');
        expect(html).toContain('href="https://cdn.test/a.css"');
        expect(html).toContain('url("data:image/png;base64,YQ==")');
        expect(html).toContain('url("https://example.test/b.png")');
    });
    it('prevents unsupported local/browser protocols from reaching WebKit without enabling local file access', () => {
        const html = normalize('<base href="file:///tmp/"><img src="file:///etc/passwd"><img src="blob:abc"><img src="asset://x"><img src="pic.png" srcset="file:///x 2x"><style>.a{background:url(file:///x)}</style><iframe src="file:///y"></iframe>');
        expect(html).not.toMatch(/file:|blob:|asset:|srcset|<base|<iframe/);
        expect(html).toContain('background:none');
    });
    it('preserves vector diagram geometry, MathJax references and clickable document links', () => {
        const html = normalize('<svg viewBox="0 0 80 40"><defs><path id="eq" d="M0 0"/></defs><use xlink:href="#eq"/><text>Chart</text></svg><a href="mailto:a@b.com">Mail</a><img src="data:image/svg+xml;base64,YQ==">');
        expect(html).toContain('viewBox="0 0 80 40"');
        expect(html).toContain('xlink:href="#eq"');
        expect(html).toContain('mailto:a@b.com');
        expect(html).toContain('data:image/svg+xml;base64,YQ==');
    });
    it('does not fall back to filesystem resolution when the client base is non-HTTP', () => {
        expect(normalizePdfResources('<img src="a.png">', 'file:///tmp/', () => null)).not.toContain('src=');
    });
});
