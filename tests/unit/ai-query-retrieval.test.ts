/** @jest-environment jsdom */
// @ts-nocheck
import { buildKnowledgeGraph, queryDocuments, parseEvidence } from '../../js/ui/ai-query';
import { semanticQueryScores, clearQueryVectors } from '../../js/ui/ai-query-vectors';
import { retrieveQueryChunks, clearQueryIndex } from '../../js/ui/ai-query-index';
beforeEach(() => { clearQueryIndex(); clearQueryVectors(); });
it('retrieves evidence from a document at the end of a large corpus using query expansion with bounded AI calls', async () => {
    const docs = Array.from({ length: 100 }, (_, i) => ({ path: 'doc' + i + '.md', content: i === 99 ? 'The release date is October 20.' : 'Unrelated gardening notes and background.' }));
    const call = jest.fn(async (_system, input) => {
        if (_system.includes('扩展问题')) return 'release date\nlaunch date';
        const data = JSON.parse(input);
        if (data.chunks) return JSON.stringify({ facts: data.chunks.filter(chunk => chunk.text.includes('release date')).map(chunk => ({ chunk: chunk.id, quote: 'The release date is October 20.' })) });
        return 'October 20. [100]';
    });
    const result = await queryDocuments('When do we ship?', docs, call);
    expect(result.files).toBe(100); expect(result.examined).toBeLessThanOrEqual(24);
    expect(result.sources[0].path).toBe('doc99.md'); expect(result.answer).toContain('[100]');
    expect(call.mock.calls.length).toBeLessThanOrEqual(8);
});
it('finds Chinese phrases and related documents without exact full-question matching', () => {
    const chunks = buildKnowledgeGraph([{ path: '计划.md', content: '项目发布日期定于十月。[[风险]]' }, { path: '风险.md', content: '审批是前置条件。' }, { path: '其他.md', content: '园艺笔记' }]);
    const found = retrieveQueryChunks(chunks, '发布日期是什么？');
    expect(found.map(chunk => chunk.path)).toContain('计划.md'); expect(found.map(chunk => chunk.path)).toContain('风险.md');
});
it('keeps only complete validated facts from a truncated response, including escaped braces', () => {
    const chunks = buildKnowledgeGraph([{ path: 'a.md', content: 'value {x} is "safe"\n第二项' }]);
    const raw = '{"facts":[' + JSON.stringify({ chunk: '1:1', quote: 'value {x} is "safe"' }) + ',{"chunk":"1:1","quote":"第';
    expect(parseEvidence(raw, chunks)).toEqual([{ source: 1, quote: 'value {x} is "safe"', line: 1 }]);
    expect(() => parseEvidence('', chunks)).toThrow('truncated');
});
it('repairs empty extraction once without losing source validation', async () => {
    let attempts = 0;
    const call = jest.fn(async (_system, input) => {
        const data = JSON.parse(input);
        if (!data.chunks) return 'The date is October 20. [1]';
        return ++attempts === 1 ? '' : '{"facts":[{"chunk":"1:1","quote":"October 20"}]}';
    });
    const result = await queryDocuments('When?', [{ path: 'a.md', content: 'October 20' }], call);
    expect(result.answer).toContain('October 20'); expect(attempts).toBe(2);
});
it('uses incremental semantic vectors, embeds only changed spans and discards the cache on lock', async () => {
    const embed = jest.fn(async texts => texts.map(text => text.includes('launch') ? [1, 0] : [0, 1]));
    const docs = [{ path: 'a.md', content: 'launch date' }, { path: 'b.md', content: 'gardening' }];
    const chunks = buildKnowledgeGraph(docs);
    expect(await semanticQueryScores(chunks, 'launch', embed, 'account:model')).toEqual([1, 0]);
    expect(embed.mock.calls[0][0]).toEqual(['launch date', 'gardening']);
    embed.mockClear();
    await semanticQueryScores(chunks, 'launch', embed, 'account:model');
    expect(embed).toHaveBeenCalledTimes(1); expect(embed.mock.calls[0][0]).toEqual(['launch']);
    embed.mockClear();
    await semanticQueryScores(buildKnowledgeGraph([{ ...docs[0], content: 'launch rescheduled' }, docs[1]]), 'launch', embed, 'account:model');
    expect(embed.mock.calls[0][0]).toEqual(['launch rescheduled']);
    window.dispatchEvent(new Event('e2e-locked')); embed.mockClear();
    await semanticQueryScores(chunks, 'launch', embed, 'account:model');
    expect(embed.mock.calls[0][0]).toEqual(['launch date', 'gardening']);
});
it('searches every document for exhaustive requests, without requiring an embeddings endpoint', async () => {
    const seen = new Set();
    const docs = Array.from({ length: 32 }, (_, i) => ({ path: i + '.md', content: 'Task ' + i }));
    const call = jest.fn(async (_system, input) => { const data = JSON.parse(input); if (data.chunks) { data.chunks.forEach(chunk => seen.add(chunk.source)); return '{"facts":[]}'; } return 'answer'; });
    const embed = jest.fn();
    const result = await queryDocuments('汇总所有项目待办', docs, call, { embed });
    expect(seen.size).toBe(32); expect(result.mode).toBe('full'); expect(embed).not.toHaveBeenCalled();
});
