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

        require('../../js/auth.js');
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
});
