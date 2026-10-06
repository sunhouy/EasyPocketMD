/** @jest-environment jsdom */
// @ts-nocheck
export {};
let cleanup;
beforeEach(()=>{
    jest.resetModules();localStorage.clear();globalThis.__APP_MARKET__=true;
    document.body.innerHTML='<div id="loginModalOverlay"></div>'+['login','register'].map(key=>`<div id="${key}Form"><input id="${key}Username" value="user"><input id="${key}Password" value="password123"><p id="${key}Message"></p><button id="${key}SubmitBtn"><span class="btn-text"><span data-i18n="${key}">${key}</span><span class="btn-spinner"></span></span></button></div>`).join('')+'<button id="desktopAIBtn"></button><section aria-labelledby="settingsAIGroupTitle"></section>';
    window.i18n={t:key=>key,getLanguage:()=> 'zh'};window.showMessage=jest.fn();window.currentUser=null;
    cleanup=require('../../js/build-variant').installMarketUI();
    require('../../js/auth');window.showLoginModal();
    global.fetch=jest.fn(async()=>({json:async()=>({code:400,message:'invalid'})}));
});
afterEach(()=>{cleanup?.();delete globalThis.__APP_MARKET__;jest.resetModules();});
it.each(['login','register'])('requires explicit privacy consent before the %s request',async key=>{
    const checkbox=document.getElementById(key+'PrivacyConsent');expect(checkbox.checked).toBe(false);
    expect(checkbox.closest('label').querySelector('a').href).toBe('https://yhsun.cn/privacy.html');
    await document.getElementById(key+'SubmitBtn').onclick();expect(fetch).not.toHaveBeenCalled();
    expect(document.getElementById(key+'Message').textContent).toContain('隐私政策');
    checkbox.checked=true;await document.getElementById(key+'SubmitBtn').onclick();expect(fetch).toHaveBeenCalledTimes(1);
    window.showLoginModal();expect(checkbox.checked).toBe(false);
});
it('hides static and dynamically created AI controls',async()=>{
    expect(document.getElementById('desktopAIBtn').hasAttribute('data-market-hidden')).toBe(true);
    const row=document.createElement('div');row.innerHTML='<button id="aiLayoutBtn"></button>';document.body.append(row);
    await Promise.resolve();expect(row.hasAttribute('data-market-hidden')).toBe(true);
});
it('blocks AI and embedding requests and configuration cloud synchronization',async()=>{
    const ai=require('../../js/ai-config');
    expect(ai.isAIConfigReady()).toBe(false);
    await expect(ai.callText('system','question')).rejects.toThrow('此版本不提供 AI');
    await expect(ai.callEmbeddings(['document'])).rejects.toThrow('此版本不提供 AI');
    await ai.syncAIConfigToCloud({});await ai.deleteAIConfigFromCloud();expect(await ai.loadAIConfigFromCloud()).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
});
it('leaves standard builds free of market consent and AI restrictions',()=>{
    cleanup();document.body.replaceChildren();delete globalThis.__APP_MARKET__;jest.resetModules();
    const variant=require('../../js/build-variant');expect(variant.isMarketBuild).toBe(false);
    expect(variant.installMarketUI()).toBeUndefined();expect(variant.requirePrivacyConsent('login')).toBe(true);
    expect(()=>variant.requireAIEnabled()).not.toThrow();
});
