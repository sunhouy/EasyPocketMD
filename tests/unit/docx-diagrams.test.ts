// @ts-nocheck
import { mkdtemp, readFile, rm } from 'fs/promises';
import path from 'path';
import os from 'os';
const { prepareDocxDiagrams } = require('../../api/utils/docxDiagrams');
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="90"><text>Start</text></svg>';
describe('DOCX vector diagram assets', () => {
    let directory: string;
    beforeEach(async () => { directory = await mkdtemp(path.join(os.tmpdir(), 'docx-vector-test-')); });
    afterEach(async () => { await rm(directory, { recursive: true, force: true }); });
    it('replaces fenced Mermaid with a local SVG reference without rasterizing', async () => {
        const markdown = '> ```mermaid\n> graph TD; A-->B;\n> ```\n\nTail';
        const output = await prepareDocxDiagrams(markdown, [{ code: 'graph TD; A-->B;', svg }], directory);
        expect(output).toBe('> ![Mermaid Diagram](mermaid-0.svg)\n\nTail');
        expect(await readFile(path.join(directory, 'mermaid-0.svg'), 'utf8')).toBe(svg);
    });
    it('rejects scripts and external resources in supplied SVG', async () => {
        await expect(prepareDocxDiagrams('', [{ code: 'x', svg: svg.replace('<text>Start</text>', '<script>alert(1)</script>') }], directory)).rejects.toThrow('Unsupported');
    });
});
