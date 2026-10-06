/** @jest-environment jsdom */
// @ts-nocheck
export {};
require('../../js/translations');
window.i18n.setLanguage('zh');
const { webcrypto } = require('node:crypto');
const { TextEncoder, TextDecoder } = require('node:util');
const { File } = require('node:buffer');
Object.defineProperty(window,'crypto',{ value:webcrypto, configurable:true });
Object.assign(global,{ TextEncoder,TextDecoder });
const vault = require('../../js/e2e-vault');
const e2e = require('../../js/e2e');
const attachments = require('../../js/e2e-attachments');
window.currentUser=null;
const {serializeFiles}=require('../../js/e2e-ui');
let stored, revision;
const options = { login:true, dedicated:true, password:'dedicated-password-123', passkey:false, ttlSeconds:60 };
beforeEach(()=>{
    vault.reset(); localStorage.clear(); delete window.E2EVault;
    window.currentUser={ username:'user', password:'login-password', token:'token' };
    stored=null; revision=0;
    global.fetch=jest.fn(async (url,init)=>{
        const body=JSON.parse(init.body); let data;
        if(url.endsWith('/config')) data={ config:stored, revision };
        else if(url.endsWith('/config/save')) { stored=body.config; revision++; data={revision}; }
        return { ok:true, json:async()=>({code:200,data}) };
    });
    vault.setUI(async()=>{ throw Error('locked'); },jest.fn());
});
afterEach(()=>{ vault.reset(); delete window.E2EVault; attachments.clear(); jest.useRealTimers(); });
async function setup(custom={}) { await vault.saveSettings({...options,...custom}); window.E2EVault=vault; }
async function reopen() { vault.reset(); await vault.initialize(); }
it('each enabled password independently opens the same key, including legacy files',async()=>{
    const legacy=require('crypto-js').AES.encrypt('legacy private note','login-password').toString();
    await setup(); const master=vault.secrets().master;
    const cipher=await e2e.encrypt('new private note','ignored'); expect(cipher).toMatch(/^EPMD2:/);
    expect(JSON.stringify(stored)).not.toContain(master); expect(JSON.stringify(stored)).not.toContain('login-password');
    await reopen(); await vault.unlockPassword('dedicated',options.password);
    expect(vault.secrets().master).toBe(master);
    expect(await e2e.decrypt(cipher,'wrong')).toBe('new private note');
    expect(await e2e.decrypt(legacy,'wrong')).toBe('legacy private note');
    await reopen(); await vault.unlockPassword('login','login-password'); expect(vault.secrets().master).toBe(master);
});
it('opens authenticated documents written before vault setup after dedicated unlock',async()=>{
    const cipher=await e2e.encrypt('pre-vault private note','login-password');
    expect(cipher).toMatch(/^EPMD2:/);
    await setup(); await reopen(); await vault.unlockPassword('dedicated',options.password);
    expect(await e2e.resolveFileContent(cipher,null,true)).toBe('pre-vault private note');
});
it('rejects wrong passwords and authenticated ciphertext modifications',async()=>{
    await setup(); const cipher=await e2e.encrypt('private','ignored');
    await reopen(); await expect(vault.unlockPassword('dedicated','bad')).rejects.toThrow('密码错误');
    await vault.unlockPassword('login','login-password');
    const altered=cipher.slice(0,-1)+(cipher.endsWith('a')?'b':'a');
    await expect(e2e.resolveFileContent(altered,null,true)).rejects.toThrow('无法解密');
});
it('allows removing login while preserving dedicated unlock, but rejects removing every method',async()=>{
    await setup(); const key=vault.secrets().master;
    await vault.saveSettings({...options,login:false,password:''});
    expect(stored.methods.login).toBeUndefined(); await reopen();
    await expect(vault.unlockPassword('login','login-password')).rejects.toThrow('未启用');
    await vault.unlockPassword('dedicated',options.password); expect(vault.secrets().master).toBe(key);
    await expect(vault.saveSettings({...options,login:false,dedicated:false})).rejects.toThrow('至少保留');
});
it('expires at the configured boundary and never implicitly reuses the saved login password',async()=>{
    jest.useFakeTimers(); await setup({login:false}); const onLock=jest.fn(); vault.setUI(async()=>{throw Error('locked');},onLock);
    jest.advanceTimersByTime(60000);
    expect(onLock).toHaveBeenCalledTimes(1); expect(vault.state().unlocked).toBe(false);
    expect(()=>vault.secrets()).toThrow('已过期');
    await expect(e2e.encrypt('private','login-password')).rejects.toThrow('locked');
});
it('rejects PRF-less passkeys and lets a supported passkey independently unlock',async()=>{
    const rawId=new Uint8Array([1,2,3]), secret=new Uint8Array(32).fill(8);
    Object.defineProperty(window,'isSecureContext',{value:true,configurable:true});
    Object.defineProperty(navigator,'credentials',{value:{create:jest.fn(async()=>({rawId})),get:jest.fn(async()=>({getClientExtensionResults:()=>({prf:{results:{first:secret.buffer}}})}))},configurable:true});
    await setup({passkey:true}); const master=vault.secrets().master;
    await reopen(); await vault.unlockPasskey(); expect(vault.secrets().master).toBe(master);
    navigator.credentials.get.mockResolvedValueOnce({getClientExtensionResults:()=>({prf:{}})});
    await expect(vault.registerPasskey(vault.secrets())).rejects.toThrow('不支持 PRF');
});
it('encrypts all attachment bytes and metadata, supports password alternatives, and detects tampering',async()=>{
    await setup(); const bytes=Uint8Array.from([0,255,1,128,45,78,0]);
    for(const type of ['image/png','application/pdf','application/zip']) {
        const original=new File([bytes],'secret-name',{type});
        const encrypted=await attachments.encryptFile(original); const cipher=await new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.readAsArrayBuffer(encrypted);});
        expect(encrypted.name).not.toContain('secret-name'); expect(Buffer.from(cipher).includes(Buffer.from('secret-name'))).toBe(false);
        await reopen(); await vault.unlockPassword('dedicated',options.password);
        const data=await attachments.decryptBytes(cipher);
        expect(data.name).toBe('secret-name');
        const plain=await new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.readAsArrayBuffer(data.blob);});
        expect(Array.from(new Uint8Array(plain))).toEqual(Array.from(bytes));
        const tampered=new Uint8Array(cipher); tampered[tampered.length-1]^=1;
        await expect(attachments.decryptBytes(tampered.buffer)).rejects.toThrow();
    }
});
it('rewraps login-password protection without changing data keys or alternate methods',async()=>{
    await setup(); const master=vault.secrets().master;
    const patch=await vault.preparePasswordChange('login-password','new-login-password');
    stored=patch.config; revision++; vault.finishPasswordChange(patch);
    await reopen(); await expect(vault.unlockPassword('login','login-password')).rejects.toThrow();
    await vault.unlockPassword('login','new-login-password'); expect(vault.secrets().master).toBe(master);
    await reopen(); await vault.unlockPassword('dedicated',options.password); expect(vault.secrets().master).toBe(master);
});
it('does not carry keys across accounts or encryption configuration failures',async()=>{
    await setup(); window.currentUser={username:'other',token:'token',password:'other'};
    expect(()=>vault.secrets()).toThrow('尚未载入');
    vault.reset(); fetch.mockRejectedValueOnce(new Error('offline'));
    await expect(vault.ensureUnlocked()).rejects.toThrow('offline');
});

it('persists encrypted documents and sync bases without encrypting ordinary notes or double-encrypting',async()=>{
    await setup(); await e2e.lazyLoadCrypto();
    const files=[{id:'private',e2e_enabled:1,content:'private',crdtBaseContent:'base',localSyncedContent:'snapshot'},{id:'public',e2e_enabled:0,content:'public'}];
    const saved=JSON.parse(serializeFiles(files));
    expect(saved[0].content).toMatch(/^EPMD2:/);expect(saved[0].crdtBaseContent).toMatch(/^EPMD2:/);
    expect(saved[1].content).toBe('public');expect(files[0].content).toBe('private');
    expect(serializeFiles(saved)).toBe(JSON.stringify(saved));
    expect(e2e.resolveFileContentSync(saved[0].content,null,true)).toBe('private');
});
it('stores encrypted crash-recovery drafts and decrypts them only in an unlocked session',async()=>{
    await setup(); await e2e.lazyLoadCrypto();
    window.files=[{id:'note',name:'note.md',e2e_enabled:1,content:'saved'}];window.currentFileId='note';window.unsavedChanges={note:true};
    window.getCurrentEditorContent=()=> 'private unfinished draft';window.appSessionId='test';
    require('../../js/draftRecovery');
    window.draftRecovery.backupNow();
    const raw=localStorage.getItem('vditor_draft_backup'); expect(raw).not.toContain('private unfinished draft');
    expect(JSON.parse(raw).content).toMatch(/^EPMD2:/);
});

it('removes saved login passwords so a lock cannot be bypassed by silently reading the account cache',async()=>{
    localStorage.setItem('vditor_user',JSON.stringify(window.currentUser));
    localStorage.setItem('vditor_accounts',JSON.stringify([window.currentUser,{username:'other',password:'other-password'}]));
    await setup({login:false});
    expect(JSON.parse(localStorage.getItem('vditor_user')).password).toBeUndefined();
    const accounts=JSON.parse(localStorage.getItem('vditor_accounts'));expect(accounts[0].password).toBeUndefined();expect(accounts[0].token).toBe('token');expect(accounts[1].password).toBe('other-password');
    expect(JSON.parse(vault.serializeUser(window.currentUser)).password).toBeUndefined();
});

it('seals the active editor and clears key material on logout or account change',async()=>{
    await setup();await e2e.lazyLoadCrypto();
    window.files=[{id:'note',name:'note.md',e2e_enabled:1,content:'saved'}];window.currentFileId='note';
    window.lastSyncedContent={note:'saved'};window.getCurrentEditorContent=()=> 'unfinished private edit';window.vditor={setValue:jest.fn()};
    window.dispatchEvent(new Event('e2e-account-reset'));
    expect(window.vditor.setValue).toHaveBeenCalledWith('');
    expect(window.files[0].content).toMatch(/^EPMD2:/);expect(window.lastSyncedContent.note).toBeUndefined();
    expect(vault.state().unlocked).toBe(false);
    expect(localStorage.getItem('vditor_files')).not.toContain('unfinished private edit');
});

it('ignores retired OTP settings while preserving password keys',async()=>{
    await setup(); const master=vault.secrets().master; stored={...stored,otp:true};
    await reopen(); expect(vault.state().config.otp).toBeUndefined();
    await vault.unlockPassword('dedicated',options.password); expect(vault.secrets().master).toBe(master);
    await vault.saveSettings({...options,password:''}); expect(stored.otp).toBeUndefined();
});
it('verifies explicitly entered login passwords before updating their wrapper',async()=>{
    await setup(); const master=vault.secrets().master;
    fetch.mockResolvedValueOnce({ok:true,json:async()=>({code:401})});
    await expect(vault.saveSettings({...options,loginPassword:'wrong'})).rejects.toThrow('密码错误');
    expect(vault.secrets().master).toBe(master);
    await vault.saveSettings({...options,loginPassword:'login-password'});
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/auth/login'),expect.objectContaining({body:JSON.stringify({username:'user',password:'login-password'})}));
    await reopen(); await vault.unlockPassword('login','login-password'); expect(vault.secrets().master).toBe(master);
});

it('changes the ordinary login password while the encryption vault remains locked',async()=>{
    await setup(); const master=vault.secrets().master;
    await reopen(); const prompt=jest.fn(async()=>{throw Error('must not request encryption password');});
    vault.setUI(prompt,jest.fn());
    const patch=await vault.preparePasswordChange('login-password','new-login-password');
    expect(prompt).not.toHaveBeenCalled(); expect(vault.state().unlocked).toBe(false);
    stored=patch.config; revision++;
    await reopen(); await vault.unlockPassword('login','new-login-password'); expect(vault.secrets().master).toBe(master);
    await reopen(); await vault.unlockPassword('dedicated',options.password); expect(vault.secrets().master).toBe(master);
});
it('does not require encryption credentials for ordinary password changes with dedicated-only encryption',async()=>{
    await setup({login:false}); await reopen();
    await expect(vault.preparePasswordChange('login-password','new-login-password')).resolves.toBeNull();
    expect(vault.state().unlocked).toBe(false);
});

it('remembers login-mode credentials across reloads and saves settings without prompting',async()=>{
    await setup();
    expect(JSON.parse(localStorage.getItem('vditor_user')).password).toBe('login-password');
    window.currentUser=JSON.parse(localStorage.getItem('vditor_user'));
    await reopen(); const prompt=jest.fn(async()=>{throw Error('unnecessary prompt');}); vault.setUI(prompt,jest.fn());
    await vault.saveSettings({...options,password:'',ttlSeconds:300});
    expect(prompt).not.toHaveBeenCalled(); expect(vault.state().unlocked).toBe(true);
    expect(stored.ttlSeconds).toBe(300);
});
it('sets up dedicated-only encryption with token authentication and no ordinary password',async()=>{
    window.currentUser={username:'user',token:'token'};
    await setup({login:false});
    expect(stored.methods.dedicated).toBeDefined(); expect(stored.methods.login).toBeUndefined();
    await reopen(); await vault.unlockPassword('dedicated',options.password);
    expect(vault.state().unlocked).toBe(true);
});

it('remembers an explicitly verified login unlock after an older client removed its cache',async()=>{
    await setup(); await reopen();
    window.currentUser={username:'user',token:'token'};
    await vault.unlockPassword('login','login-password');
    expect(JSON.parse(localStorage.getItem('vditor_user')).password).toBe('login-password');
    await reopen(); const prompt=jest.fn(async()=>{throw Error('must remember');}); vault.setUI(prompt,jest.fn());
    await vault.ensureUnlocked(); expect(prompt).not.toHaveBeenCalled();
});
it('uploads encrypted attachments to cloud storage while legacy local preferences are present', async () => {
    await setup(); window.currentFileId = 'doc'; window.userSettings = { storageLocation: 'local' };
    window.ResourceLoader = { storeLocalFile: jest.fn() };
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, urls: ['/uploads/encrypted.epmd'] }) });
    const link = await attachments.uploadEncrypted([new File(['private attachment'], 'secret.txt', { type: 'text/plain' })]);
    const [url, init] = fetch.mock.calls.at(-1);
    expect(url).toContain('/files/upload'); expect(init.body.get('e2e_attachment')).toBe('1');
    expect(init.body.get('files[]').name).toMatch(/\.epmd$/);
    expect(link).toContain('/uploads/encrypted.epmd'); expect(link).not.toContain('local://');
    expect(window.ResourceLoader.storeLocalFile).not.toHaveBeenCalled();
});
