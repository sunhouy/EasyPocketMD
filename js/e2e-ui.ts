import * as vault from './e2e-vault';
import { encryptSync, resolveFileContentSync, lazyLoadCrypto, looksLikeE2ECiphertext } from './e2e';
import './e2e-attachments';
window.E2EVault = vault;
window.e2eSerializeUser = vault.serializeUser;
const en = () => window.i18n?.getLanguage() === 'en';
const label = (zh: string, english: string) => en() ? english : zh;
function dialog(title: string, body: string, closable = true) {
    const overlay = document.createElement('div'); overlay.className = 'modal-overlay e2e-modal';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:30000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.75);';
    overlay.innerHTML = `<section class="e2e-card" role="dialog" aria-modal="true" aria-labelledby="e2eDialogTitle"><h3 id="e2eDialogTitle"></h3>${body}<p class="e2e-error" role="alert"></p>${closable ? '<button type="button" data-close>关闭 / Close</button>' : ''}</section>`;
    overlay.querySelector('h3').textContent = title;
    document.body.append(overlay);
    overlay.querySelector('[data-close]')?.addEventListener('click',() => overlay.remove());
    overlay.addEventListener('keydown',event => {
        if (event.key !== 'Tab') return;
        const focusable = Array.from(overlay.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select'));
        const first = focusable[0], last = focusable[focusable.length-1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    });
    (overlay.querySelector('input,button') as HTMLElement)?.focus();
    return overlay;
}
function error(view: HTMLElement, err: any) { view.querySelector('.e2e-error').textContent = err?.message || String(err); }
async function run(view: HTMLElement, action: () => Promise<void>) {
    const buttons = Array.from(view.querySelectorAll<HTMLButtonElement>('button')); const states = buttons.map(b=>b.disabled); buttons.forEach(b=>b.disabled=true);
    try { await action(); } catch(err) { error(view,err); }
    finally { buttons.forEach((b,i)=>b.disabled=states[i]); }
}
async function requestUnlock() {
    const methods = vault.state().config.methods;
    return new Promise<void>(resolve => {
        const view = dialog(label('解锁端到端加密','Unlock end-to-end encryption'), `
            <p>${label('任选一种已启用的方式解锁。','Use any enabled method to unlock.')}</p>
            <form><label>${label('密码','Password')}<input type="password" autocomplete="off" data-password></label>
            ${methods.login ? `<button type="button" data-login>${label('使用登录密码','Use login password')}</button>` : ''}
            ${methods.dedicated ? `<button type="button" data-dedicated>${label('使用专用密码','Use dedicated password')}</button>` : ''}</form>
            ${methods.passkey ? `<button type="button" data-passkey>${label('使用 Passkey 通行密钥','Use Passkey')}</button>` : ''}
            ${vault.state().config.otp ? `<button type="button" data-otp>${label('使用 OTP 受信设备','Use OTP trusted device')}</button>` : ''}
            <p>${label('过期后需重新验证。专用密码与通行密钥不会发送到服务器。','Verify again when the session expires. Dedicated passwords and Passkey secrets stay on your device.')}</p>`,false);
        view.querySelector('form').addEventListener('submit',event=>event.preventDefault());
        const done = () => { view.remove(); resolve(); };
        for (const method of ['login','dedicated'] as const) view.querySelector('[data-'+method+']')?.addEventListener('click',()=>run(view,async()=>{
            await vault.unlockPassword(method,(view.querySelector('[data-password]') as HTMLInputElement).value); done();
        }));
        view.querySelector('[data-passkey]')?.addEventListener('click',()=>run(view,async()=>{ await vault.unlockPasskey(); done(); }));
        view.querySelector('[data-otp]')?.addEventListener('click',()=>run(view,async()=>{ await pairingDialog(); done(); }));
    });
}
async function pairingDialog() {
    const pair = await vault.beginPairing();
    return new Promise<void>((resolve,reject) => {
        const view = dialog(label('OTP 设备配对','OTP device pairing'),`<p>${label('在已解锁的设备上，打开加密设置 → 批准 OTP 配对，输入以下一次性配对码。','On an unlocked device, open encryption settings → Approve OTP pairing and enter this one-time code.')}</p><strong data-code></strong><p>${label('两台设备必须逐组核对完整指纹，一致后才批准。5 分钟内有效。','Compare every group of the full fingerprint on both devices before approving. Expires in 5 minutes.')}</p><code data-fingerprint></code><p data-status></p>`);
        view.querySelector('[data-code]').textContent = pair.code;
        view.querySelector('[data-fingerprint]').textContent = pair.fingerprint;
        let stopped = false, timer: ReturnType<typeof setTimeout>;
        view.querySelector('[data-close]').addEventListener('click',()=>{ stopped=true; clearTimeout(timer); reject(new Error(label('已取消 OTP 解锁','OTP unlock canceled'))); });
        const poll = async()=>{
            if (stopped) return;
            try {
                if (Date.now() >= pair.expiresAt) throw new Error(label('配对码已过期，请重新请求','Pairing code expired; request a new one'));
                if (await vault.consumePairing(pair)) { stopped=true; view.remove(); resolve(); return; }
                timer = setTimeout(poll,3000);
            } catch(err) { stopped=true; clearTimeout(timer); error(view,err); reject(err); }
        };
        timer = setTimeout(poll,3000);
    });
}
async function approveDialog() {
    const view = dialog(label('批准 OTP 配对','Approve OTP pairing'), `<label>${label('新设备上的 8 位配对码','8-digit code on the new device')}<input inputmode="numeric" maxlength="8" data-code></label><button data-find>${label('查找设备','Find device')}</button><p data-note></p><code data-fingerprint></code><button data-approve hidden>${label('完整指纹一致，批准解锁','Full fingerprint matches; approve unlock')}</button>`);
    let pair;
    view.querySelector('[data-find]').addEventListener('click',()=>run(view,async()=>{
        pair = await vault.findPairing((view.querySelector('[data-code]') as HTMLInputElement).value.trim());
        view.querySelector('[data-note]').textContent = label('请与新设备逐组核对以下全部指纹。若不一致，关闭此窗口。','Compare every fingerprint group with the new device. Close this window if any differ.');
        view.querySelector('[data-fingerprint]').textContent = pair.fingerprint;
        (view.querySelector('[data-approve]') as HTMLButtonElement).hidden=false;
    }));
    view.querySelector('[data-approve]').addEventListener('click',()=>run(view,async()=>{
        await vault.approvePairing(pair); view.remove(); window.showMessage?.(label('已批准新设备解锁','New device approved'),'success');
    }));
}
export async function showSettings() {
    await vault.ensureUnlocked(); await lazyLoadCrypto();
    const c = vault.state().config;
    const view = dialog(label('端到端加密设置','End-to-end encryption settings'), `
        <p>${label('勾选的方式可同时使用，任意一种正确即可解锁。OTP 需要另一台已解锁设备在线。','Enabled methods coexist; any one can unlock. OTP requires another unlocked device online.')}</p>
        <label><input type="checkbox" data-login> ${label('1. 登录密码（默认）','1. Login password (default)')}</label>
        <label><input type="checkbox" data-passkey> ${label('2. Passkey 通行密钥','2. Passkey')}</label>
        <label><input type="checkbox" data-dedicated> ${label('3. 专用密码','3. Dedicated password')}</label>
        <label>${label('新的专用密码（至少 12 字符；留空保留现有密码）','New dedicated password (12+ characters; leave blank to keep existing)')}<input type="password" data-password autocomplete="new-password"></label>
        <label>${label('确认专用密码','Confirm dedicated password')}<input type="password" data-confirm autocomplete="new-password"></label>
        <label><input type="checkbox" data-otp> ${label('4. OTP 受信设备确认','4. OTP trusted device confirmation')}</label>
        <label>${label('解锁后自动锁定时间','Automatically lock after unlocking')}<select data-ttl>
        <option value="60">1 min</option><option value="300">5 min</option><option value="900">15 min</option><option value="1800">30 min</option><option value="3600">1 h</option><option value="14400">4 h</option><option value="86400">24 h</option></select></label>
        <p>${label('通行密钥需要浏览器和认证器支持 PRF。启用加密时，会为文档内已有的本应用附件创建加密副本；历史公开附件仍可能存在。','Passkey requires browser and authenticator PRF support. Enabling encryption creates encrypted copies of existing app attachments; historical public copies may remain.')}</p>
        <button data-save>${label('保存设置','Save settings')}</button><button data-approve>${label('批准 OTP 配对','Approve OTP pairing')}</button><button data-lock>${label('立即锁定','Lock now')}</button>`);
    const checked = (name:string) => (view.querySelector('[data-'+name+']') as HTMLInputElement).checked;
    (view.querySelector('[data-login]') as HTMLInputElement).checked = c ? !!c.methods.login : true;
    (view.querySelector('[data-passkey]') as HTMLInputElement).checked = !!c?.methods.passkey;
    (view.querySelector('[data-dedicated]') as HTMLInputElement).checked = !!c?.methods.dedicated;
    (view.querySelector('[data-otp]') as HTMLInputElement).checked = !!c?.otp;
    (view.querySelector('[data-ttl]') as HTMLSelectElement).value = String(c?.ttlSeconds || 900);
    (view.querySelector('[data-approve]') as HTMLButtonElement).disabled = !c?.otp;
    (view.querySelector('[data-lock]') as HTMLButtonElement).disabled = !c;
    view.querySelector('[data-save]').addEventListener('click',()=>run(view,async()=>{
        const password = (view.querySelector('[data-password]') as HTMLInputElement).value;
        if (checked('dedicated') && password !== (view.querySelector('[data-confirm]') as HTMLInputElement).value) throw new Error(label('两次密码不一致','Passwords do not match'));
        await vault.saveSettings({ login:checked('login'),passkey:checked('passkey'),dedicated:checked('dedicated'),otp:checked('otp'),password,ttlSeconds:Number((view.querySelector('[data-ttl]') as HTMLSelectElement).value) });
        // Seal the existing local cache too; legacy ciphertext remains readable by every new method.
        window.localStorage.setItem('vditor_files',serializeFiles(window.files || []));
        view.remove(); window.showMessage?.(label('加密设置已保存','Encryption settings saved'),'success');
    }));
    view.querySelector('[data-approve]').addEventListener('click',()=>approveDialog().catch(err=>error(view,err)));
    view.querySelector('[data-lock]').addEventListener('click',()=>vault.lock());
}
export function serializeFiles(files: any[]) {
    if (!vault.state().config) return JSON.stringify(files);
    return JSON.stringify(files.map(f=>{
        if (![true,1,'1','true'].includes((f.e2e_enabled ?? f.e2eEnabled) as any)) return f;
        const copy = { ...f };
        for (const field of ['content','crdtBaseContent','localSyncedContent', 'syncConflictRemoteContent']) if (typeof copy[field] === 'string' && copy[field] && !looksLikeE2ECiphertext(copy[field])) copy[field] = encryptSync(copy[field],null);
        return copy;
    }));
}
function sealAndReload() {
    (window.stopAutoSync as any)?.(); (window.clearAutoSave as any)?.();
    const f = (window.files || []).find(f=>f.id===window.currentFileId);
    if (f && [true,1,'1','true'].includes((f.e2e_enabled ?? f.e2eEnabled) as any)) {
        const live = (window.getCurrentEditorContent as any)?.(f.id,f.content) ?? f.content;
        f.content = (window.LocalImageManager as any)?.convertBlobToLocal(live) ?? live;
    }
    localStorage.setItem('vditor_files',serializeFiles(window.files || []));
    // Backups are stored encrypted on each write; the editor/undo history is discarded on reload.
    window.E2EAttachments.clear();
    document.querySelectorAll('.e2e-modal').forEach(el=>el.remove());
    window.location.reload();
}
vault.setUI(requestUnlock,sealAndReload);
window.showE2ESettings = showSettings;
window.e2eSerializeFiles = serializeFiles;
async function bootstrap() {
    const button = document.getElementById('manageE2E');
    button?.addEventListener('click',()=>showSettings().catch(err=>window.showMessage?.(err.message,'error')));
    if (!window.currentUser?.token || new URLSearchParams(location.search).has('share_id')) return;
    try { await vault.ensureUnlocked(); await lazyLoadCrypto(); }
    catch(err) { window.showMessage?.(err.message,'error'); }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',bootstrap); else void bootstrap();
// Remove a previous account's key and attachment previews before account changes are used.
window.addEventListener('e2e-account-reset',()=>{
    vault.sealSession(() => {
        const files = window.files || [];
        const current = files.find(f=>f.id===window.currentFileId);
        if (current && [true,1,'1','true'].includes((current.e2e_enabled ?? current.e2eEnabled) as any)) {
            current.content = (window.getCurrentEditorContent as any)?.(current.id,current.content) ?? current.content;
            (window.vditor as any)?.setValue?.('');
        }
        const sealed = JSON.parse(serializeFiles(files));
        localStorage.setItem('vditor_files', JSON.stringify(sealed));
        for (let i=0;i<files.length;i++) {
            if ([true,1,'1','true'].includes((files[i].e2e_enabled ?? files[i].e2eEnabled) as any)) {
                Object.assign(files[i],sealed[i]);
                if (window.lastSyncedContent) delete window.lastSyncedContent[files[i].id];
            }
        }
    });
    vault.reset(); window.E2EAttachments.clear();
});
window.addEventListener('pageshow',event=>{ if (event.persisted) { vault.lock(); vault.reset(); void bootstrap(); } });
