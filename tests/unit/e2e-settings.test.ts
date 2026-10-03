/** @jest-environment jsdom */
// @ts-nocheck
export {};
describe('new-file encryption preference', () => {
    beforeEach(() => {
        jest.resetModules(); localStorage.clear();
        document.body.innerHTML = '<input type="checkbox" id="settingsEnableE2E"><div id="userSettingsModalOverlay"></div>';
        window.currentUser = { username: 'user', token: 'token', password: 'secret', e2e_enabled: 0 };
        window.showMessage = jest.fn(); window.getApiBaseUrl = () => '/api';
        global.fetch = jest.fn(async () => ({ json: async () => ({ code: 200 }) }));
        require('../../js/auth');
        window.dispatchEvent(new Event('DOMContentLoaded'));
    });
    it('uses the browser user state and persists the default across reloads', async () => {
        const checkbox = document.getElementById('settingsEnableE2E');
        checkbox.checked = true;
        checkbox.dispatchEvent(new Event('change'));
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(fetch).toHaveBeenCalledTimes(1);
        expect(window.currentUser.e2e_enabled).toBe(1);
        window.currentUser = JSON.parse(localStorage.getItem('vditor_user'));
        checkbox.checked = false;
        window.showUserSettingsModal();
        expect(checkbox.checked).toBe(true);
        expect(checkbox.disabled).toBe(false);
    });
    it('restores the switch if the server rejects a preference change', async () => {
        fetch.mockResolvedValueOnce({ json: async () => ({ code: 500, message: 'failed' }) });
        const checkbox = document.getElementById('settingsEnableE2E');
        checkbox.checked = true; checkbox.dispatchEvent(new Event('change'));
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(checkbox.checked).toBe(false);
        expect(window.currentUser.e2e_enabled).toBe(0);
        expect(checkbox.disabled).toBe(false);
    });
    it('treats a stored string zero as disabled when opening settings', () => {
        window.currentUser.e2e_enabled = '0'; window.showUserSettingsModal();
        expect(document.getElementById('settingsEnableE2E').checked).toBe(false);
    });
    it('saves the default encryption preference with a token and no remembered password',async()=>{
        window.currentUser={username:'user',token:'token',e2e_enabled:0};
        const checkbox=document.getElementById('settingsEnableE2E');
        checkbox.checked=true; checkbox.dispatchEvent(new Event('change'));
        await new Promise(resolve=>setTimeout(resolve,0));
        expect(window.currentUser.e2e_enabled).toBe(1);
        expect(window.showMessage).not.toHaveBeenCalledWith('e2eLoginPasswordMissing','error');
    });

});
