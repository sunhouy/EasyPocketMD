/** @jest-environment jsdom */
// @ts-nocheck
export {};
let mockConfig, mockUnlock;
jest.mock('../../js/e2e-vault',()=>({
    state:()=>({config:mockConfig}),ensureUnlocked:jest.fn(async()=>{}),
    saveSettings:jest.fn(async options=>{mockConfig={ttlSeconds:options.ttlSeconds,methods:Object.fromEntries(['login','passkey','dedicated'].filter(k=>options[k]).map(k=>[k,{}]))};}),
    unlockPassword:jest.fn(async()=>{}),unlockPasskey:jest.fn(async()=>{}),
    setUI:fn=>{mockUnlock=fn;},serializeUser:jest.fn(),lock:jest.fn()
}));
jest.mock('../../js/e2e',()=>({lazyLoadCrypto:jest.fn(async()=>{}),encryptSync:jest.fn(),looksLikeE2ECiphertext:jest.fn()}));
jest.mock('../../js/e2e-attachments',()=>({}));
require('../../js/translations');
window.currentUser=null;
const vault=require('../../js/e2e-vault');
const {showSettings}=require('../../js/e2e-ui');
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
beforeEach(()=>{document.body.innerHTML='';jest.clearAllMocks();window.showMessage=jest.fn();mockConfig={ttlSeconds:900,methods:{login:{},passkey:{}}};window.files=[];window.i18n.setLanguage('zh');});
it.each(['zh','en'])('uses existing buttons and complete %s translations',async lang=>{
    window.i18n.setLanguage(lang);await showSettings();
    expect(document.querySelectorAll('[data-use-login],[data-use-passkey],[data-use-dedicated]')).toHaveLength(3);
    for(const button of document.querySelectorAll('button')) expect(button.classList.contains('modal-btn')).toBe(true);
    for(const label of document.querySelectorAll('[data-i18n]')) expect(window.i18n.has(label.dataset.i18n)).toBe(true);
    expect(document.body.textContent).not.toMatch(/OTP|一次性配对|e2e[A-Z]/);
    if(lang==='en') expect(document.body.textContent).not.toMatch(/[\u4e00-\u9fff]/);
    else expect(document.body.textContent).toContain('使用专用密码');
});
it('activates dedicated password with its own button while retaining other methods',async()=>{
    await showSettings();document.querySelector('[data-password]').value='dedicated-password';document.querySelector('[data-confirm]').value='dedicated-password';
    document.querySelector('[data-use-dedicated]').click();await tick();
    expect(vault.saveSettings).toHaveBeenCalledWith(expect.objectContaining({login:true,passkey:true,dedicated:true,password:'dedicated-password'}));
    expect(document.querySelector('[data-dedicated]').checked).toBe(true);
    expect(document.querySelector('[data-password]').value).toBe('');
    expect(document.querySelector('[data-use-dedicated]').disabled).toBe(false);
});
it('configures login without consuming an unrelated dedicated password input',async()=>{
    mockConfig.methods.dedicated={};await showSettings();
    document.querySelector('[data-password]').value='unfinished';document.querySelector('[data-confirm]').value='different';
    document.querySelector('[data-login-password]').value='login-password';document.querySelector('[data-use-login]').click();await tick();
    expect(vault.saveSettings).toHaveBeenCalledWith(expect.objectContaining({login:true,passkey:true,dedicated:true,password:'',loginPassword:'login-password'}));
});
it.each(['login','dedicated','passkey'])('unlocks directly through independent %s action',async method=>{
    mockConfig.methods.dedicated={};const pending=mockUnlock();
    expect(document.querySelectorAll('[data-method]')).toHaveLength(3);
    if(method==='passkey'){document.querySelector('[data-passkey]').click();}
    else {document.querySelector(`[data-${method}-password]`).value=method+'-secret';document.querySelector(`[data-method="${method}"]`).dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));}
    await pending;
    if(method==='passkey') expect(vault.unlockPasskey).toHaveBeenCalledTimes(1);
    else expect(vault.unlockPassword).toHaveBeenCalledWith(method,method+'-secret');
    expect(document.querySelector('.e2e-modal')).toBeNull();
    expect(window.showMessage).toHaveBeenCalledWith('端到端加密验证成功','success');
});
it('shows password errors in the selected language',async()=>{
    window.i18n.setLanguage('en');mockConfig.methods.dedicated={};void mockUnlock();
    vault.unlockPassword.mockRejectedValueOnce(require('../../js/e2e-i18n').e2eError('e2ePasswordIncorrect'));
    document.querySelector('[data-method="dedicated"]').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await tick();
    expect(document.querySelector('[data-error]').textContent).toContain('Incorrect password');
    expect(window.showMessage).toHaveBeenCalledWith(expect.stringContaining('Incorrect password'),'error');
    expect(document.querySelector('[data-error]').textContent).not.toMatch(/[\u4e00-\u9fff]/);
});


it('cancels unlocking without trapping the next file open', async()=>{
    const pending = mockUnlock();
    const rejected = expect(pending).rejects.toMatchObject({e2eKey:'e2eUnlockCancelled'});
    const close = document.querySelector('.modal-header [data-unlock-close]');
    expect(close.getAttribute('aria-label')).toBe('关闭');
    close.click(); await rejected;
    expect(document.querySelector('.e2e-modal')).toBeNull();
    expect(vault.unlockPassword).not.toHaveBeenCalled();
    const retry = mockUnlock();
    document.querySelector('[data-method="login"]').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
    await retry; expect(document.querySelector('.e2e-modal')).toBeNull();
});


it('responds to the management button immediately, including a late-mounted settings page', async()=>{
    let ready; vault.ensureUnlocked.mockImplementationOnce(()=>new Promise(resolve=>{ready=resolve;}));
    document.body.innerHTML='<button id="manageE2E"><span>manage</span></button>';
    document.querySelector('#manageE2E span').click();
    expect(document.querySelector('[role="status"]').textContent).toContain('正在加载');
    ready(); await tick();
    expect(document.querySelectorAll('[data-use-login],[data-use-passkey],[data-use-dedicated]')).toHaveLength(3);
});

it.each(['dedicated','passkey'])('sets up %s independently without enabling login-password protection',async method=>{
    mockConfig=null;await showSettings();
    if(method==='dedicated') {document.querySelector('[data-password]').value='dedicated-password';document.querySelector('[data-confirm]').value='dedicated-password';}
    document.querySelector('[data-use-'+method+']').click();await tick();
    expect(vault.saveSettings).toHaveBeenCalledWith(expect.objectContaining({login:false,[method]:true}));
});
