/** @jest-environment jsdom */
// @ts-nocheck
export {};
beforeEach(()=>{
    jest.resetModules();localStorage.clear();
    document.body.innerHTML='<div id="loginModalOverlay"></div><div id="loginForm"></div><div id="registerForm"></div><input id="loginUsername" value="user"><input id="loginPassword" value="password123"><p id="loginMessage"></p><input id="registerUsername" value="user"><input id="registerPassword" value="password123"><p id="registerMessage"></p>'+['login','register'].map(key=>`<button id="${key}SubmitBtn"><span class="btn-text"><span data-i18n="${key}">${key}</span><span class="btn-spinner"></span></span></button>`).join('');
    window.i18n={t:key=>key};window.showMessage=jest.fn();window.currentUser=null;
    require('../../js/auth');window.showLoginModal();
});
it.each(['login','register'])('keeps the %s button present and disabled during verification', async(key)=>{
    let finish;global.fetch=jest.fn(()=>new Promise(resolve=>{finish=resolve;}));
    const button=document.getElementById(key+'SubmitBtn');const pending=button.onclick();
    expect(button.classList.contains('loading')).toBe(false);
    expect(button.classList.contains('is-loading')).toBe(true);
    expect(button.disabled).toBe(true);expect(button.getAttribute('aria-busy')).toBe('true');
    expect(button.textContent).toContain(key+'Loading');
    finish({json:async()=>({code:400,message:'invalid'})});await pending;
    expect(button.disabled).toBe(false);expect(button.classList.contains('is-loading')).toBe(false);
    expect(document.getElementById(key+'Message').textContent).toBe('invalid');
});

it('keeps a successful login valid when encryption configuration is unavailable',async()=>{
    jest.useFakeTimers();const warn=jest.spyOn(console,'warn').mockImplementation(()=>{});
    window.E2EVault={initialize:jest.fn(async()=>{throw Error('vault offline');}),unlockAfterLogin:jest.fn()};
    global.fetch=jest.fn(async()=>({json:async()=>({code:200,data:{token:'valid-login'}})}));
    try {
        await document.getElementById('loginSubmitBtn').onclick();
        expect(window.currentUser.token).toBe('valid-login');
        expect(document.getElementById('loginMessage').className).toContain('success');
        expect(window.E2EVault.unlockAfterLogin).not.toHaveBeenCalled();
    } finally {warn.mockRestore();jest.clearAllTimers();jest.useRealTimers();delete window.E2EVault;}
});
