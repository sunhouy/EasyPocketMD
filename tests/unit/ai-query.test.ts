import { buildKnowledgeGraph, parseEvidence, queryDocuments } from '../../js/ui/ai-query';

describe('Cross-document AI knowledge queries', () => {
    it('connects relative Markdown and wiki links and searches the end of long documents', () => {
        const docs = [{ path: 'projects/a.md', content: '[B](../notes/b.md)\n[[c]]' },
            { path: 'notes/b.md', content: 'Another document' },
            { path: 'projects/c.md', content: '长文'.repeat(5000) + '\n最终截止日是10月20日' }];
        const chunks = buildKnowledgeGraph(docs);
        expect(chunks[0].related.sort()).toEqual([2, 3]);
        expect(chunks.find(chunk => chunk.source === 2)?.related).toContain(1);
        expect(chunks.at(-1)?.text).toContain('最终截止日是10月20日');
        expect(chunks.at(-1)?.line).toBeGreaterThanOrEqual(1);
    });
    it('rejects fabricated excerpts and IDs while reporting the actual source line', () => {
        const chunks = buildKnowledgeGraph([{ path: 'other.md', content: '# Roadmap\nShip on October 20' }]);
        expect(parseEvidence(JSON.stringify({ facts: [
            { chunk: '1:1', quote: 'Ship on October 20' },
            { chunk: '1:1', quote: 'Ship on November 20' },
            { chunk: '999:1', quote: 'Ship on October 20' }
        ] }), chunks)).toEqual([{ source: 1, quote: 'Ship on October 20', line: 2 }]);
        expect(() => parseEvidence('invalid', chunks)).toThrow();
    });
    it('reads every document in bounded batches instead of only the current file or keyword matches', async () => {
        const docs = Array.from({ length: 14 }, (_, i) => ({ path: `folder${i}/notes.md`, content: 'background '.repeat(240) + (i === 13 ? 'Launch is October 20.' : 'No launch date.') }));
        const read = new Set<number>();
        const call = jest.fn(async (_system, input) => {
            const data = JSON.parse(input);
            if (data.chunks) {
                data.chunks.forEach(chunk => read.add(chunk.source));
                expect(input.length).toBeLessThan(12000);
                return JSON.stringify({ facts: data.chunks.filter(chunk => chunk.text.includes('Launch is October 20.')).map(chunk => ({ chunk: chunk.id, quote: 'Launch is October 20.' })) });
            }
            return 'Launch is October 20. [14] [999]';
        });
        const result = await queryDocuments('When do we ship?', docs, call, { mode: 'full' });
        expect([...read].sort((a, b) => a - b)).toEqual(Array.from({ length: 14 }, (_, i) => i + 1));
        expect(result.sources).toMatchObject([{ number: 14, path: 'folder13/notes.md' }]);
        expect(result.answer).toContain('[14]');
        expect(result.answer).not.toContain('[999]');
        expect(result.files).toBe(14);
    });
    it('does not send hidden configuration files or synthesize an unsupported answer', async () => {
        const call = jest.fn(async () => '{"facts":[]}');
        const result = await queryDocuments('What is the secret?', [
            { path: '.ai-config.json', content: 'API secret' }, { path: 'nested/.secret.md', content: 'password' }, { path: 'readme.md', content: 'Notes' }
        ], call);
        expect(call).toHaveBeenCalledTimes(1);
        expect(call.mock.calls[0][1]).not.toContain('secret.md');
        expect(call.mock.calls[0][1]).not.toContain('API secret');
        expect(result.sources).toEqual([]);
        expect(result.answer).toContain('未在可读取的文档中找到');
    });
    it('hierarchically combines all findings without discarding files when evidence is large', async () => {
        const docs = Array.from({ length: 32 }, (_, i) => ({ path: `project${i}.md`, content: `Fact ${i}: ` + 'x'.repeat(900) }));
        const combined = new Set<number>();
        const call = jest.fn(async (_system, input) => {
            const data = JSON.parse(input);
            if (data.chunks) return JSON.stringify({ facts: data.chunks.map(chunk => ({ chunk: chunk.id, quote: chunk.text })) });
            if (_system.includes('控制在1200字')) {
                for (const note of data.notes) for (const fact of JSON.parse(note)) combined.add(fact.source);
                return 'Combined findings [1]';
            }
            return 'Cross-document answer [1]';
        });
        const result = await queryDocuments('Summarize every project', docs, call);
        expect(combined.size).toBe(32);
        expect(result.sources).toHaveLength(32);
        expect(call.mock.calls.at(-1)[1].length).toBeLessThan(10000);
    });
    it('stops before synthesis when cancelled during extraction', async () => {
        const controller = new AbortController();
        const call = jest.fn(async () => { controller.abort(); return '{"facts":[]}'; });
        await expect(queryDocuments('Find plans', [{ path: 'plans.md', content: 'plans' }], call, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
        expect(call).toHaveBeenCalledTimes(1);
    });
});
