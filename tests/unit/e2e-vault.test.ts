/** @jest-environment jsdom */
// @ts-nocheck
export {};
require('../../js/translations');
window.i18n.setLanguage('zh');
const {webcrypto}=require('node:crypto');
const {TextEncoder,TextDecoder}=require('node:util');
const {File}=require('node:buffer');
Object.defineProperty(window,'crypto',{value:webcrypto,configurable:true});
Object.assign(global,{TextEncoder,TextDecoder});
const vault=require('../../js/e2e-vault');
const e2e=require('../../js/e2e');
const attachments=require('../../js/e2e-attachments');
window.currentUser=null;
const {serializeFiles}=require('../../js/e2e-ui');
let stored;
beforeEach(()=>{
    vault.reset();localStorage.clear();window.E2EVault=vault;
    window.currentUser={username:'user',password:'login-password',token:'token'};
    stored=null;
    global.fetch=jest.fn(async()=>({ok:true,json:async()=>({code:200,data:{config:stored,revision:stored?1:0}})}));
});
afterEach(()=>{vault.reset();delete window.E2EVault;attachments.clear();jest.useRealTimers();});
async function oldConfig() {
    const value={master:vault.base64(vault.random(32)),legacy:'login-password'};
    stored={version:2,ttlSeconds:60,methods:{login:await vault.wrap(JSON.stringify(value),'login-password'),dedicated:{retired:true}},check:await vault.wrap('EasyPocketMD vault v2',vault.unbase64(value.master))};
    return value;
}
it('encrypts and reads authenticated content using only the saved account password',async()=>{
    const cipher=await e2e.encrypt('private text',undefined);
    expect(cipher).toMatch(/^EPMD2:/);
    expect(await e2e.resolveFileContent(cipher,undefined,true)).toBe('private text');
    expect(document.querySelector('.e2e-modal')).toBeNull();
    expect(vault.saveSettings).toBeUndefined();expect(vault.unlockPasskey).toBeUndefined();expect(vault.unlockPassword).toBeUndefined();
});
it('keeps the account password across refresh and account serialization',async()=>{
    const user=window.currentUser;
    localStorage.setItem('epmd_e2e_accounts',JSON.stringify(['user']));
    await vault.initialize();
    expect(JSON.parse(vault.serializeUser(user)).password).toBe('login-password');
    expect(localStorage.getItem('epmd_e2e_accounts')).toBeNull();
    const cipher=await e2e.encrypt('saved',undefined);
    vault.reset();window.currentUser=JSON.parse(vault.serializeUser(user));
    expect(await e2e.resolveFileContent(cipher,undefined,true)).toBe('saved');
});
it('recovers an account password from the matching saved account, never another account',async()=>{
    delete window.currentUser.password;
    localStorage.setItem('vditor_accounts',JSON.stringify([{username:'other',password:'wrong'},{username:'user',password:'login-password'}]));
    expect(await e2e.prepareEncryptionKey(undefined)).toBe('login-password');
    vault.reset();delete window.currentUser.password;
    localStorage.setItem('vditor_accounts',JSON.stringify([{username:'other',password:'wrong'}]));
    await expect(e2e.prepareEncryptionKey(undefined)).rejects.toThrow('请重新登录');
});
it('automatically opens the old account-password wrapper and preserves old documents',async()=>{
    const value=await oldConfig();
    delete window.E2EVault;
    const oldDirect=await e2e.encrypt('pre-vault note','login-password');
    window.E2EVault=vault;
    await vault.initialize();
    expect(vault.secrets()).toEqual(value);
    expect(Object.keys(vault.state().config.methods)).toEqual(['login']);
    expect(await e2e.resolveFileContent(oldDirect,undefined,true)).toBe('pre-vault note');
    const cipher=await e2e.encrypt('vault note',undefined);
    vault.reset();expect(await e2e.resolveFileContent(cipher,undefined,true)).toBe('vault note');
});
it('has no automatic lock timeout after an ordinary login',async()=>{
    await oldConfig();await vault.initialize();jest.useFakeTimers();
    jest.advanceTimersByTime(86400000);
    expect(vault.state().unlocked).toBe(true);
    expect(await e2e.prepareEncryptionKey(undefined)).toBe(vault.secrets().master);
    expect(document.querySelector('.e2e-modal')).toBeNull();
});
it('prepares local encrypted recovery drafts before durable checkpoints',async()=>{
    await oldConfig();await vault.initialize();
    const file={id:'restored',type:'file',name:'private.md',content:'recovery draft',e2e_enabled:1};
    const {persistFileDurably}=require('../../js/files/sync/local-state');
    expect(await e2e.resolveFileContent(file.content,undefined,true)).toBe(file.content);
    expect(await persistFileDurably(file,serializeFiles)).toBe(true);
    const saved=JSON.parse(localStorage.getItem('epm-file:restored'))[0];
    expect(saved.content).toMatch(/^EPMD2:/);
    expect(await e2e.resolveFileContent(saved.content,undefined,true)).toBe(file.content);
});
it('rewraps old data keys when the ordinary account password changes',async()=>{
    const value=await oldConfig();const cipher=await e2e.encrypt('unchanged data',undefined);
    const patch=await vault.preparePasswordChange('login-password','new-password');
    expect(Object.keys(patch.config.methods)).toEqual(['login']);
    stored=patch.config;vault.finishPasswordChange(patch);window.currentUser.password='new-password';vault.reset();
    expect(await e2e.resolveFileContent(cipher,undefined,true)).toBe('unchanged data');
    expect(vault.secrets()).toEqual(value);
});
it('does not overwrite encrypted files with no surviving account-password wrapper',async()=>{
    const value=await oldConfig();delete stored.methods.login;
    await vault.initialize();
    expect(vault.state().unlocked).toBe(false);
    await expect(e2e.encrypt('edited draft',undefined)).rejects.toThrow('原文件已保留');
    expect(stored.check).toBeDefined();expect(vault.state().config.check).toEqual(stored.check);
});
it('rejects wrong account passwords and authenticated ciphertext tampering',async()=>{
    await oldConfig();await vault.initialize();
    const cipher=await e2e.encrypt('private',undefined);
    const altered=cipher.slice(0,-1)+(cipher.endsWith('a')?'b':'a');
    await expect(e2e.resolveFileContent(altered,undefined,true)).rejects.toThrow('无法解密');
    vault.reset();window.currentUser.password='wrong';
    await expect(e2e.prepareEncryptionKey(undefined)).rejects.toThrow('密码错误');
});
it('clears the previous account key before another account is used',async()=>{
    await oldConfig();await vault.initialize();
    window.currentUser={username:'other',password:'other-password',token:'other-token'};
    expect(()=>vault.secrets()).toThrow('尚未载入');
    stored=null;
    expect(await e2e.prepareEncryptionKey(undefined)).toBe('other-password');
    expect(vault.state().owner).toBe('other');
});
it.each([false,true])('encrypts attachment bytes and metadata with the account password (old wrapper: %s)',async legacy=>{
    if(legacy) await oldConfig();
    const encrypted=await attachments.encryptFile(new File(['private bytes'],'private-name.png',{type:'image/png'}));
    const bytes=await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.readAsArrayBuffer(encrypted);});
    expect(new TextDecoder().decode(bytes)).not.toContain('private bytes');
    expect(new TextDecoder().decode(bytes)).not.toContain('private-name.png');
    vault.reset();const decoded=await attachments.decryptBytes(bytes);
    expect(decoded.name).toBe('private-name.png');
    const plain=await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.readAsArrayBuffer(decoded.blob);});
    expect(new TextDecoder().decode(plain)).toBe('private bytes');
    const altered=new Uint8Array(bytes);altered[altered.length-1]^=1;
    await expect(attachments.decryptBytes(altered.buffer)).rejects.toThrow();
});
it('shows a real key fingerprint for a signed-in account',async()=>{
    await oldConfig();await vault.initialize();
    document.body.innerHTML='<button id="lock"></button><div id="e2eInfoPopover"><span id="e2eInfoPopoverFingerprint"></span></div>';
    const {installSyncRuntime}=require('../../js/files/sync-runtime');
    const runtime=installSyncRuntime({currentUser:window.currentUser,files:[]},{},{});
    await runtime.showE2EInfoPopover(document.getElementById('lock'));
    expect(document.getElementById('e2eInfoPopoverFingerprint').textContent).toBe(await runtime.computeKeyFingerprint(vault.secrets().master));
});
it('reports a missing cached password as a normal login requirement rather than an unlock dialog',async()=>{
    delete window.currentUser.password;
    document.body.innerHTML='<button id="lock"></button><div id="e2eInfoPopover"><span id="e2eInfoPopoverFingerprint"></span></div>';
    const {installSyncRuntime}=require('../../js/files/sync-runtime');
    const runtime=installSyncRuntime({currentUser:window.currentUser,files:[]},{},{});
    await runtime.showE2EInfoPopover(document.getElementById('lock'));
    expect(document.getElementById('e2eInfoPopoverFingerprint').textContent).toContain('请重新登录');
    expect(document.querySelector('.e2e-modal')).toBeNull();
});
