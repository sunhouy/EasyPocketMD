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
it('continues a truncated plain-text query response instead of failing JSON extraction', async () => {
    window.fetch = jest.fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ choices: [{ finish_reason: 'length', message: { content: '发布日期是10月' } }] }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ choices: [{ finish_reason: 'stop', message: { content: '20日。[1]' } }] }) });
    const answer = await callText('使用普通文本回答，不返回JSON', '何时发布？', { maxTokens: 1024, recoverTruncation: true });
    expect(answer).toContain('发布日期是10月'); expect(answer).toContain('20日。[1]');
    const second = JSON.parse(fetch.mock.calls[1][1].body);
    expect(second.messages.at(-2)).toMatchObject({ role: 'assistant', content: '发布日期是10月' });
    expect(second.messages.at(-1).content).toContain('从中断处继续');
});
it('retries empty API JSON and allows a larger reasoning output budget', async () => {
    window.fetch = jest.fn()
        .mockResolvedValueOnce({ ok: true, json: async () => { throw new SyntaxError('Unexpected end of JSON input'); } })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ choices: [{ finish_reason: 'length', message: { content: '' } }] }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ choices: [{ finish_reason: 'stop', message: { content: '答案。[1]' } }] }) });
    await expect(callText('system', 'question', { maxTokens: 1024, recoverTruncation: true })).resolves.toBe('答案。[1]');
    expect(JSON.parse(fetch.mock.calls[2][1].body).max_tokens).toBe(4096);
});
it('preserves generated text if a continuation also reaches the output cap', async () => {
    window.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ choices: [{ finish_reason: 'length', message: { content: '已生成的事实。[1]' } }] }) }));
    const answer = await callText('system', 'question', { recoverTruncation: true });
    expect(answer).toContain('已生成的事实'); expect(answer).toContain('可继续提问'); expect(fetch).toHaveBeenCalledTimes(2);
});
it('accepts SSE from a gateway that ignores stream:false', async () => {
    const stream = 'data: {"choices":[{"delta":{"content":"发布日期"}}]}\n\ndata: {"choices":[{"delta":{"content":"是20日。[1]"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n';
    window.fetch = jest.fn(async () => ({ ok: true, clone: () => ({ text: async () => stream }), json: async () => { throw new SyntaxError('Unexpected token d'); } }));
    await expect(callText('system', 'question', { recoverTruncation: true })).resolves.toBe('发布日期是20日。[1]');
    expect(fetch).toHaveBeenCalledTimes(1);
});
it('adapts rejected token and temperature parameters to the gateway response', async () => {
    window.fetch = jest.fn()
        .mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ error: { message: 'Unsupported parameter max_tokens: use max_completion_tokens instead' } }) })
        .mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ error: { message: 'temperature does not support this value' } }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ choices: [{ message: { content: 'answer' } }] }) });
    await expect(callText('system', 'question', { maxTokens: 1024, temperature: 0, recoverTruncation: true })).resolves.toBe('answer');
    const last = JSON.parse(fetch.mock.calls[2][1].body);
    expect(last.max_completion_tokens).toBe(1024); expect(last.max_tokens).toBeUndefined(); expect(last.temperature).toBeUndefined();
});
