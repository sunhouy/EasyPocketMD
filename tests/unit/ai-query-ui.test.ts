/** @jest-environment jsdom */
// @ts-nocheck
const fs = jest.requireActual('node:fs');
import path from 'node:path';
jest.mock('../../js/e2e', () => ({ looksLikeE2ECiphertext: () => false, resolveFileContent: async value => value }));
const html = fs.readFileSync(path.resolve(__dirname, '../../index.html'), 'utf8');
require('../../js/ui/ai-assistant');
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

describe('AI query panel', () => {
    beforeEach(() => {
        document.body.innerHTML = html;
        window.currentUser = { username: 'owner', token: 'token' };
        window.files = []; window.currentFileId = null;
        window.i18n = { getLanguage: () => 'zh', t: key => key };
        window.fetch = jest.fn(async url => ({ ok: true, json: async () => url.includes('/content?')
            ? { code: 200, data: { content: '发布定于10月20日。' } }
            : { code: 200, data: { files: [{ name: '项目/计划.md' }] } } }));
        window.AIConfig = { isReady: () => true, callText: jest.fn(async (_system, input) => {
            const data = JSON.parse(input);
            return data.chunks ? JSON.stringify({ facts: [{ chunk: data.chunks[0].id, quote: '发布定于10月20日。' }] }) : '发布日期：10月20日。[1]';
        }) };
        window.initAIAssistant(); window.showAIPanel();
        document.querySelector('[data-ai-action="query"]').click();
        document.getElementById('aiQueryInput').value = '项目何时发布？';
    });
    afterEach(() => window.closeAIPanel());
    it('searches other files using the configured client and shows safe source excerpts', async () => {
        document.getElementById('aiQueryRun').click();
        for (let i = 0; i < 8; i++) await tick();
        expect(window.AIConfig.callText).toHaveBeenCalledTimes(2);
        expect(document.getElementById('aiQueryAnswer').textContent).toContain('10月20日');
        expect(document.getElementById('aiQuerySources').textContent).toContain('项目/计划.md');
        expect(document.querySelector('#aiQuerySources blockquote').textContent).toBe('发布定于10月20日。');
        expect(document.getElementById('aiQueryCopy').hidden).toBe(false);
        expect(document.getElementById('aiQueryRun').disabled).toBe(false);
    });
    it('cancels a pending model request and never displays its late answer', async () => {
        let finish;
        window.AIConfig.callText = jest.fn(() => new Promise(resolve => { finish = resolve; }));
        document.getElementById('aiQueryRun').click();
        for (let i = 0; i < 4; i++) await tick();
        const signal = window.AIConfig.callText.mock.calls[0][2].signal;
        document.getElementById('aiQueryCancel').click();
        expect(signal.aborted).toBe(true);
        finish('{"facts":[]}'); await tick();
        expect(document.getElementById('aiQueryAnswer').textContent).toBe('');
        expect(document.getElementById('aiQueryRun').disabled).toBe(false);
    });
    it('clears answers and excerpts when the account resets or encryption locks', async () => {
        document.getElementById('aiQueryRun').click();
        for (let i = 0; i < 8; i++) await tick();
        window.dispatchEvent(new Event('e2e-account-reset'));
        expect(document.getElementById('aiQueryAnswer').textContent).toBe('');
        expect(document.getElementById('aiQuerySources').textContent).toBe('');
        expect(document.getElementById('aiQueryCopy').hidden).toBe(true);
        document.getElementById('aiQueryAnswer').textContent = 'sensitive text';
        window.dispatchEvent(new Event('e2e-locked'));
        expect(document.getElementById('aiQueryAnswer').textContent).toBe('');
    });
});
