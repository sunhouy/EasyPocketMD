/** @jest-environment jsdom */
// @ts-nocheck
import { saveAIConfig, callText, callEmbeddings } from '../../js/ai-config';
beforeEach(() => { localStorage.clear(); saveAIConfig({ apiKey: 'test-key', baseUrl: 'https://api.example.test/v1', model: 'chat', embeddingModel: 'vectors', syncToCloud: false }); });
it('reports empty API JSON and output token limits explicitly', async () => {
    window.fetch = jest.fn(async () => ({ ok: true, json: async () => { throw new SyntaxError('Unexpected end of JSON input'); } }));
    await expect(callText('system', 'question')).rejects.toThrow('empty or invalid JSON');
    fetch.mockResolvedValue({ ok: true, json: async () => ({ choices: [{ finish_reason: 'length', message: { content: '{' } }] }) });
    await expect(callText('system', 'question')).rejects.toMatchObject({ code: 'AI_OUTPUT_TRUNCATED' });
});
it('calls embeddings with the configured API/key and restores input order from result indices', async () => {
    window.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ data: [{ index: 1, embedding: [0, 1] }, { index: 0, embedding: [1, 0] }] }) }));
    expect(await callEmbeddings(['first', 'second'])).toEqual([[1, 0], [0, 1]]);
    expect(fetch.mock.calls[0][0]).toBe('https://api.example.test/v1/embeddings');
    expect(JSON.parse(fetch.mock.calls[0][1].body).model).toBe('vectors');
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer test-key');
});
it('rejects malformed embedding vectors before using them in retrieval', async () => {
    window.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ data: [{ index: 0, embedding: [1, 'invalid'] }] }) }));
    await expect(callEmbeddings(['first'])).rejects.toThrow('Invalid embeddings');
});
