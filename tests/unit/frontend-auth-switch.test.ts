/**
 * @jest-environment jsdom
 */

describe('frontend account switch', () => {
    let warnSpy;

    beforeEach(() => {
        jest.resetModules();
        jest.useFakeTimers();
        warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        localStorage.clear();
        document.body.innerHTML = `
            <button id="confirmSwitchAccountBtn">确认切换</button>
            <button id="cancelSwitchAccountBtn">取消</button>
            <button id="closeSwitchAccountConfirmBtn">关闭</button>
            <div id="switchAccountConfirmModalOverlay"></div>
            <p id="switchAccountDescText"></p>
            <div id="accountListContainer"></div>
            <div id="userMenuDropdown" class="show"></div>
            <button id="mobileLoginBtn"></button>
        `;

        window.i18n = {
            t: (key) => ({
                accountSwitching: '切换中',
                accountSwitched: '已切换到账户: {username}',
                switchAccountDesc: '您确定要切换到账户 {username} 吗？',
                accountAddFailed: '添加账户失败',
                accountNotFound: '账户不存在',
                userMenu: '用户菜单',
                login: '登录'
            }[key] || key)
        };
        window.getApiBaseUrl = () => '/api';
        window.showMessage = jest.fn();
        window.loadFiles = jest.fn();
        window.startAutoSync = jest.fn();
        window.stopAutoSync = jest.fn();
        window.clearAllCacheStorage = jest.fn();
        window.clearAllIndexedDB = jest.fn();
        window.clearAllCookies = jest.fn();
        window.IndexedDBManager = {
            clearAll: jest.fn().mockResolvedValue(),
            clearDrafts: jest.fn().mockResolvedValue()
        };
        global.fetch = jest.fn().mockResolvedValue({
            json: jest.fn().mockResolvedValue({ code: 200, data: { token: 'target-token' } })
        });

        require('../../js/auth');
    });

    afterEach(() => {
        warnSpy.mockRestore();
        jest.useRealTimers();
        delete global.fetch;
    });

    it('does not use global storage cleanup while switching accounts', async () => {
        window.currentUser = { username: 'source', token: 'source-token', password: 'source-pass' };
        window.files = [];
        window.unsavedChanges = {};
        window.addAccountToList('source', 'source-pass');
        window.addAccountToList('target', 'target-pass');
        window.loadFilesFromServer = jest.fn().mockResolvedValue();

        window.showSwitchAccountConfirm('target');
        await window.confirmSwitchAccount();

        expect(window.currentUser.username).toBe('target');
        expect(window.clearAllCacheStorage).not.toHaveBeenCalled();
        expect(window.clearAllIndexedDB).not.toHaveBeenCalled();
        expect(window.clearAllCookies).not.toHaveBeenCalled();
        expect(window.IndexedDBManager.clearAll).toHaveBeenCalled();
    });

    it('releases the switching overlay if server file loading stalls', async () => {
        window.currentUser = { username: 'source', token: 'source-token', password: 'source-pass' };
        window.files = [];
        window.unsavedChanges = {};
        window.addAccountToList('source', 'source-pass');
        window.addAccountToList('target', 'target-pass');
        window.loadFilesFromServer = jest.fn(() => new Promise(() => {}));

        window.showSwitchAccountConfirm('target');
        const switchPromise = window.confirmSwitchAccount();
        await jest.advanceTimersByTimeAsync(20000);
        await switchPromise;

        const overlay = document.getElementById('accountSwitchingOverlay');
        expect(window.currentUser.username).toBe('target');
        expect(overlay.style.display).toBe('none');
        expect(window.startAutoSync).toHaveBeenCalled();
    });
    it('switches an encrypted account using its token without a cached password or vault unlock', async () => {
        window.currentUser = { username: 'source', token: 'source-token' };
        window.files = []; window.unsavedChanges = {};
        window.E2EVault = { ensureUnlocked: jest.fn() };
        window.addAccountToList('target', undefined, 'saved-token');
        window.loadFilesFromServer = jest.fn().mockResolvedValue();
        window.showSwitchAccountConfirm('target');
        await window.confirmSwitchAccount();
        expect(fetch).toHaveBeenCalledWith('/api/auth/verify', expect.objectContaining({ body: JSON.stringify({ username: 'target', token: 'saved-token' }) }));
        expect(window.currentUser.token).toBe('saved-token');
        expect(window.E2EVault.ensureUnlocked).not.toHaveBeenCalled();
        delete window.E2EVault;
    });
    it('preserves current files and requests ordinary login when an account has no credentials', async () => {
        document.body.insertAdjacentHTML('beforeend', '<div id="addAccountModalOverlay"><input id="addAccountUsername"><input id="addAccountPassword"><div id="addAccountMessage"></div></div>');
        window.currentUser = { username: 'source', token: 'source-token' };
        window.files = [{ id: 'source-file', content: 'private note' }]; window.unsavedChanges = {};
        window.addAccountToList('target', undefined);
        window.showSwitchAccountConfirm('target');
        await window.confirmSwitchAccount();
        expect(fetch).not.toHaveBeenCalled();
        expect(window.currentUser.username).toBe('source');
        expect(window.files[0].content).toBe('private note');
        expect(window.IndexedDBManager.clearAll).not.toHaveBeenCalled();
        expect(document.getElementById('addAccountUsername').value).toBe('target');
        expect(document.getElementById('addAccountModalOverlay').classList.contains('show')).toBe(true);
        document.getElementById('addAccountPassword').value = 'ordinary-login-password';
        window.loadFilesFromServer = jest.fn().mockResolvedValue();
        await window.handleAddAccount();
        expect(fetch.mock.calls[0][0]).toBe('/api/auth/login');
        expect(JSON.parse(fetch.mock.calls[0][1].body).password).toBe('ordinary-login-password');
        expect(fetch.mock.calls.map(call => call[0])).not.toContain('/api/auth/register');
        expect(window.currentUser.username).toBe('target');
    });
    it('keeps the current account when token verification fails because the network is unavailable', async () => {
        window.currentUser = { username: 'source', token: 'source-token' };
        window.files = []; window.unsavedChanges = {};
        window.addAccountToList('target', undefined, 'target-token');
        fetch.mockRejectedValueOnce(new Error('offline'));
        window.showSwitchAccountConfirm('target'); await window.confirmSwitchAccount();
        expect(window.currentUser.username).toBe('source');
        expect(window.IndexedDBManager.clearAll).not.toHaveBeenCalled();
    });

});
