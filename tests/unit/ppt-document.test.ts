/** @jest-environment jsdom */
import { parseDocumentPPTReply, generateDocumentPPT, buildDocumentPPTPrompt } from '../../js/ui/ppt-document';
import { PPT_TEMPLATES } from '../../shared/ppt-templates';

describe('Direct document PPT export', () => {
    it('accepts fenced / wrapped JSON and rejects invalid pages without changing an editor draft', () => {
        const json = JSON.stringify({ pages: [{ title: '标题', layout: 'stats', stats: [] }] });
        expect(parseDocumentPPTReply('```json\n' + json + '\n```', '报告').pages[0].title).toBe('标题');
        expect(parseDocumentPPTReply('回复：' + json + '完毕', '报告').topic).toBe('报告');
        expect(() => parseDocumentPPTReply('{"pages":[]}', '报告')).toThrow();
        expect(() => parseDocumentPPTReply('{"pages":[{"title":" ","layout":"html"}]}', '报告')).toThrow();
        expect(buildDocumentPPTPrompt('全文末尾', '报告')).toContain('全文末尾');
    });
    it('sends the chosen template directly to the exporter and returns the file', async () => {
        window.currentUser={username:'native',token:'native-token'};window.getApiBaseUrl=()=> 'https://md.yhsun.cn/api';
        const file = new Blob(['pptx']);
        global.fetch = jest.fn().mockResolvedValue({ ok: true, blob: async () => file });
        const document = parseDocumentPPTReply('{"pages":[{"title":"标题"}]}', '报告');
        await expect(generateDocumentPPT(document, PPT_TEMPLATES[2].id)).resolves.toBe(file);
        const init = jest.mocked(fetch).mock.calls[0][1]!;
        expect(fetch).toHaveBeenCalledWith('https://md.yhsun.cn/api/ppt-export',expect.any(Object));
        expect(init.credentials).toBeUndefined();expect(init.headers).toMatchObject({Authorization:'Bearer native-token'});
        expect(JSON.parse(String(init.body))).toMatchObject({ templateId: 'dark-gold', pages: [{ title: '标题' }] });
        await expect(generateDocumentPPT(document, 'unknown')).rejects.toThrow();
        expect(fetch).toHaveBeenCalledTimes(1);
    });
});
