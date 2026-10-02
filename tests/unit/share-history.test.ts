/** @jest-environment jsdom */
// @ts-nocheck
import { showSharedEditHistory } from '../../js/page/share-history';
const state = { shareId: 's', viewerId: 'v', ownerUsername: 'owner' };
const events = [{ id: 1, actor_key: 'user:Alice', actor_name: '<Alice>', content_version: 2, kind: 'edit', created_at: '2026-10-02T10:00:00Z' }];
const editors = [{ actor_key: 'user:Alice', actor_name: '<Alice>', edit_count: 1, blocked: 0 }];
describe('Shared history reader and owner actions', () => {
    beforeEach(() => {
        document.body.innerHTML = ''; delete window.Vditor;
        window.currentUser = { username: 'owner', token: 'valid-token' };
        window.wasmTextEngineGateway = { diff: () => [{ type: 'removed', left: '# Old', right: '' }, { type: 'added', left: '', right: '# New' }] };
        window.fetch = jest.fn(async (url, options) => ({ json: async () => ({ code: 200, data: url.endsWith('history-event') ? { before_content: '# Old', after_content: '# New' } : { events, editors, can_manage: true } }) }));
    });
    it('opens immediately and loads metadata without embedding untrusted names as HTML', async () => {
        let resolve; window.fetch = jest.fn(() => new Promise(done => { resolve = done; }));
        const opening = showSharedEditHistory(() => state, jest.fn());
        expect(document.getElementById('shareHistoryModal').textContent).toContain('加载中');
        resolve({ json: async () => ({ code: 200, data: { events, editors, can_manage: false } }) });
        await opening;
        expect(document.querySelector('alice')).toBeNull();
        expect(document.getElementById('shareHistoryModal').textContent).toContain('<Alice>');
        expect(document.getElementById('shareHistoryModal').textContent).not.toContain('关闭编辑权限');
        expect(document.getElementById('shareHistoryModal').textContent).not.toContain('撤销这次编辑');
    });
    it('fetches individual snapshots only when expanding the rendered Markdown diff', async () => {
        await showSharedEditHistory(() => state, jest.fn());
        expect(window.fetch).toHaveBeenCalledTimes(1);
        const details = document.querySelector('.share-history-event details'); details.open = true;
        await new Promise(resolve => setTimeout(resolve, 50));
        expect(window.fetch.mock.calls.some(([url]) => url.endsWith('history-event'))).toBe(true);
        expect([...details.querySelectorAll('h1')].map(node => node.textContent)).toEqual(['Old', 'New']);
    });
    it('uses the exact actor key and owner credentials to revoke access', async () => {
        await showSharedEditHistory(() => state, jest.fn());
        const revoke = [...document.querySelectorAll('button')].find(node => node.textContent === '关闭编辑权限');
        revoke.click(); await new Promise(resolve => setTimeout(resolve, 0));
        const [url, options] = window.fetch.mock.calls.find(([url]) => url.endsWith('editor-permission'));
        expect(JSON.parse(options.body)).toMatchObject({ share_id: 's', username: 'owner', actor_key: 'user:Alice', revoked: true });
        expect(options.headers.Authorization).toBe('Bearer valid-token');
    });
});
