/** @jest-environment jsdom */
const {readFileSync} = jest.requireActual('fs');
import { resolve } from 'path';
const app = window as any;
beforeEach(() => {
    jest.resetModules();localStorage.clear();
    document.body.innerHTML = readFileSync(resolve(__dirname, '../../index.html'), 'utf8');
    app.currentUser = {username:'saved',token:'token'};
    app.i18n = {t:(key:string)=>key,getLanguage:()=> 'zh'};
    require('../../js/auth');
});
it('keeps hidden credentials inactive and separates login from password-change autofill', () => {
    for (const id of ['loginPassword','registerPassword','currentPassword','newPassword','confirmNewPassword','addAccountPassword']) {
        expect((document.getElementById(id) as HTMLInputElement).disabled).toBe(true);
    }
    expect(document.querySelector('#loginPassword')?.closest('form')?.id).toBe('loginForm');
    expect(document.querySelector('#registerPassword')?.getAttribute('autocomplete')).toBe('new-password');
    expect(document.querySelector('#loginPassword')?.getAttribute('autocomplete')).toBe('current-password');
    expect(document.getElementById('changePasswordModalOverlay')?.classList.contains('show')).toBe(false);
    const apiKey=document.getElementById('aiApiKeyInput') as HTMLInputElement;
    expect(apiKey.type).toBe('text');expect(apiKey.classList.contains('epmd-secret-field')).toBe(true);
});
it('activates only the chosen authentication form and clears passwords when closed', () => {
    app.showLoginModal();
    expect((document.getElementById('registerPassword') as HTMLInputElement).disabled).toBe(false);
    expect((document.getElementById('loginPassword') as HTMLInputElement).disabled).toBe(true);
    document.getElementById('loginTabBtn')?.click();
    expect((document.getElementById('registerPassword') as HTMLInputElement).disabled).toBe(true);
    const password=document.getElementById('loginPassword') as HTMLInputElement;
    expect(password.disabled).toBe(false);password.value='entered';
    app.hideLoginModal();expect(password.disabled).toBe(true);expect(password.value).toBe('');
});

it('opens password change only from account settings and deactivates it on close',()=>{
    app.showUserSettingsModal();document.getElementById('openChangePasswordBtn')?.click();
    const overlay=document.getElementById('changePasswordModalOverlay');
    expect(overlay?.classList.contains('show')).toBe(true);
    const password=document.getElementById('newPassword') as HTMLInputElement;
    expect(password.disabled).toBe(false);password.value='changed';
    document.getElementById('closeChangePasswordBtn')?.click();
    expect(overlay?.classList.contains('show')).toBe(false);expect(password.disabled).toBe(true);expect(password.value).toBe('');
});
