/** @jest-environment jsdom */
import { preparePdfResources } from '../../js/ui/pdf-resources';

describe('browser PDF resources', () => {
    it('resolves relative images while retaining SVG diagrams and data images', async () => {
        const html = await preparePdfResources('<img src="/uploads/a.png"><svg viewBox="0 0 10 10"><path d="M0 0"/></svg><img src="data:image/png;base64,YQ==">', 'https://example.test/docs/');
        expect(html).toContain('src="https://example.test/uploads/a.png"');
        expect(html).toContain('viewBox="0 0 10 10"');
        expect(html).toContain('data:image/png;base64,YQ==');
    });
    it('serializes blob images once, keeping them visible in server exports', async () => {
        const fetchMock = jest.fn(async () => ({ ok: true, blob: async () => new Blob(['hello'], { type: 'image/png' }) }));
        window.fetch = fetchMock as any;
        const html = await preparePdfResources('<img src="blob:https://example.test/a"><img src="blob:https://example.test/a">', 'https://example.test/');
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(html.match(/data:image\/png;base64,aGVsbG8=/g)).toHaveLength(2);
        expect(html).not.toContain('blob:');
    });
});
