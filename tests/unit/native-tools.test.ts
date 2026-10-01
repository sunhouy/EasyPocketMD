import { nativeTool, isMissingPandoc } from '../../api/utils/nativeTools';

describe('native export dependency errors', () => {
    it('uses an explicitly configured executable', () => {
        const old = process.env.PANDOC_PATH;
        process.env.PANDOC_PATH = '/opt/pandoc/bin/pandoc';
        try { expect(nativeTool('pandoc')).toBe('/opt/pandoc/bin/pandoc'); }
        finally { if (old === undefined) delete process.env.PANDOC_PATH; else process.env.PANDOC_PATH = old; }
    });
    it('only reports missing Pandoc for its spawn ENOENT, not conversion or missing input errors', () => {
        expect(isMissingPandoc({ code: 'ENOENT', exportTool: 'pandoc' })).toBe(true);
        expect(isMissingPandoc(new Error('Pandoc exited with code 43: invalid input'))).toBe(false);
        expect(isMissingPandoc({ code: 'ENOENT', path: '/tmp/input.md' })).toBe(false);
    });
});
