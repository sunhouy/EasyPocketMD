import * as vault from './e2e-vault';
import { encryptSync, lazyLoadCrypto, looksLikeE2ECiphertext } from './e2e';
import { e2eText as t, e2eError, e2eErrorText } from './e2e-i18n';
import './e2e-attachments';
window.E2EVault = vault;
window.e2eSerializeUser = vault.serializeUser;
let dialogNumber = 0;
const text = (key: string) => `<span data-i18n="${key}">${t(key)}</span>`;
function dialog(titleKey: string, body: string, closable = true) {
    const titleId = `e2e-dialog-title-${++dialogNumber}`;
    const overlay = document.createElement('div'); overlay.className = 'modal-overlay show e2e-modal';
    // Only stacking is specific to this dialog; visuals use the existing modal components.
    overlay.style.zIndex = '30000';
    overlay.innerHTML = `<section class="modal account-modal" role="dialog" aria-modal="true" aria-labelledby="${titleId}">
        <div class="modal-header"><h2 id="${titleId}" data-i18n="${titleKey}">${t(titleKey)}</h2></div>
        <div class="modal-form">${body}<p class="modal-message" data-error role="alert"></p>
        ${closable ? `<div class="modal-actions"><button type="button" class="modal-btn secondary full-width" data-close>${text('e2eClose')}</button></div>` : ''}</div></section>`;
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
function error(view: HTMLElement, err: any) { const message = view.querySelector('[data-error]'); message.textContent = e2eErrorText(err); message.classList.add('error'); window.showMessage?.(e2eErrorText(err), 'error'); }
async function run(view: HTMLElement, action: () => Promise<void>) {
    const buttons = Array.from(view.querySelectorAll<HTMLButtonElement>('button')); const states = buttons.map(b=>b.disabled); buttons.forEach(b=>b.disabled=true);
    try { await action(); } catch(err) { error(view,err); }
    finally { buttons.forEach((b,i)=>b.disabled=states[i]); const lock = view.querySelector<HTMLButtonElement>('[data-lock]'); if (lock) lock.disabled = !vault.state().config; }
}
async function requestUnlock() {
    const methods = vault.state().config.methods;
    return new Promise<void>((resolve, reject) => {
        const passwordMethod = (method: string, title: string, input: string, action: string) => `<form class="form-group" data-method="${method}">
            <label>${text(title)}<input class="form-control" type="password" autocomplete="off" data-${method}-password placeholder="${t(input)}" data-i18n-placeholder="${input}"></label>
            <button type="submit" class="modal-btn primary full-width" data-${method}>${text(action)}</button></form>`;
        const view = dialog('e2eUnlockTitle', `<p class="settings-hint">${text('e2eUnlockHint')}</p>
            ${methods.login ? passwordMethod('login','e2eLoginMethod','e2eLoginInput','e2eUseLogin') : ''}
            ${methods.passkey ? `<div class="form-group" data-method="passkey"><label>${text('e2ePasskeyMethod')}</label><button type="button" class="modal-btn primary full-width" data-passkey>${text('e2eUsePasskey')}</button></div>` : ''}
            ${methods.dedicated ? passwordMethod('dedicated','e2eDedicatedMethod','e2eDedicatedInput','e2eUseDedicated') : ''}
            <p class="settings-hint">${text('e2eSessionHint')}</p>`,false);
        const close = document.createElement('button');
        close.type = 'button'; close.className = 'modal-close-btn'; close.dataset.unlockClose = '';
        close.setAttribute('aria-label', t('e2eClose')); close.textContent = '×';
        close.addEventListener('click', () => { view.remove(); reject(e2eError('e2eUnlockCancelled')); });
        view.querySelector('.modal-header').append(close);
        view.addEventListener('keydown', event => { if (event.key === 'Escape' && !close.disabled) { event.preventDefault(); close.click(); } });
        const done = () => { window.showMessage?.(t('e2eUnlockSuccess'), 'success'); view.remove(); resolve(); };
        for (const method of ['login','dedicated'] as const) view.querySelector(`[data-method="${method}"]`)?.addEventListener('submit',event=>{
            event.preventDefault(); void run(view,async()=>{ await vault.unlockPassword(method,(view.querySelector(`[data-${method}-password]`) as HTMLInputElement).value); done(); });
        });
        view.querySelector('[data-passkey]')?.addEventListener('click',()=>run(view,async()=>{ await vault.unlockPasskey(); done(); }));
    });
}
export async function showSettings() {
    const loading = dialog('e2eSettingsTitle', `<p role="status" data-i18n="e2eLoading">${t('e2eLoading')}</p>`);
    try { await vault.ensureUnlocked(); await lazyLoadCrypto(); }
    catch (err) { loading.remove(); throw err; }
    if (!loading.isConnected) return;
    loading.remove();
    const view = dialog('e2eSettingsTitle', `
        <p class="settings-hint">${text('e2eMethodsHint')}</p>
        <div class="form-group" data-method="login"><div class="checkbox-group"><label><input type="checkbox" data-login>${text('e2eLoginMethod')}</label></div>
            <label>${text('e2eLoginInput')}<input class="form-control" type="password" data-login-password autocomplete="off"></label>
            <button type="button" class="modal-btn primary full-width" data-use-login>${text('e2eUseLogin')}</button></div>
        <div class="form-group" data-method="passkey"><div class="checkbox-group"><label><input type="checkbox" data-passkey>${text('e2ePasskeyMethod')}</label></div>
            <p class="settings-hint">${text('e2ePasskeyHint')}</p><button type="button" class="modal-btn primary full-width" data-use-passkey>${text('e2eUsePasskey')}</button></div>
        <div class="form-group" data-method="dedicated"><div class="checkbox-group"><label><input type="checkbox" data-dedicated>${text('e2eDedicatedMethod')}</label></div>
            <label>${text('e2eDedicatedSetup')}<input class="form-control" type="password" data-password autocomplete="new-password"></label>
            <p class="settings-hint">${text('e2eDedicatedHint')}</p>
            <label>${text('e2eConfirmDedicated')}<input class="form-control" type="password" data-confirm autocomplete="new-password"></label>
            <button type="button" class="modal-btn primary full-width" data-use-dedicated>${text('e2eUseDedicated')}</button></div>
        <div class="form-group"><label for="e2eTtl">${text('e2eTtlLabel')}</label><select id="e2eTtl" data-ttl>
        ${[[60,'e2eMinute1'],[300,'e2eMinute5'],[900,'e2eMinute15'],[1800,'e2eMinute30'],[3600,'e2eHour1'],[14400,'e2eHour4'],[86400,'e2eHour24']].map(([value,key])=>`<option value="${value}" data-i18n="${key}">${t(String(key))}</option>`).join('')}</select></div>
        <p class="settings-hint">${text('e2eAttachmentsHint')}</p>
        <div class="modal-actions"><button type="button" class="modal-btn primary" data-save>${text('e2eSave')}</button><button type="button" class="modal-btn secondary" data-lock>${text('e2eLockNow')}</button></div>`);
    const checked = (name:string) => (view.querySelector('[data-'+name+']') as HTMLInputElement).checked;
    const refreshMethods = () => {
        const c = vault.state().config;
        for (const method of ['login','passkey','dedicated']) (view.querySelector('[data-'+method+']') as HTMLInputElement).checked = c ? !!c.methods[method] : method === 'login';
        (view.querySelector('[data-lock]') as HTMLButtonElement).disabled = !c;
    };
    refreshMethods();
    (view.querySelector('[data-ttl]') as HTMLSelectElement).value = String(vault.state().config?.ttlSeconds || 900);
    const options = () => ({ login:checked('login'),passkey:checked('passkey'),dedicated:checked('dedicated'),password:(view.querySelector('[data-password]') as HTMLInputElement).value,loginPassword:(view.querySelector('[data-login-password]') as HTMLInputElement).value,ttlSeconds:Number((view.querySelector('[data-ttl]') as HTMLSelectElement).value) });
    async function save(selected = options()) {
        if (selected.dedicated && selected.password && selected.password !== (view.querySelector('[data-confirm]') as HTMLInputElement).value) throw e2eError('e2ePasswordMismatch');
        await vault.saveSettings(selected);
        localStorage.setItem('vditor_files',serializeFiles(window.files || []));
        window.showMessage?.(t('e2eSaved'),'success');
    }
    // Each method can be configured independently without removing other enabled methods.
    for (const method of ['login','passkey','dedicated'] as const) view.querySelector('[data-use-'+method+']').addEventListener('click',()=>run(view,async()=>{
        const c = vault.state().config;
        const selected = { ...options(),login:c ? !!c.methods.login : true,passkey:!!c?.methods.passkey,dedicated:!!c?.methods.dedicated,[method]:true };
        if (method !== 'dedicated') selected.password = '';
        if (method !== 'login') selected.loginPassword = '';
        if (method === 'dedicated' && !selected.password && !c?.methods.dedicated) throw e2eError('e2eDedicatedRequired');
        await save(selected); refreshMethods();
        (view.querySelector('[data-password]') as HTMLInputElement).value = '';
        (view.querySelector('[data-confirm]') as HTMLInputElement).value = '';
        (view.querySelector('[data-login-password]') as HTMLInputElement).value = '';
    }));
    view.querySelector('[data-save]').addEventListener('click',()=>run(view,async()=>{ await save(); view.remove(); }));
    view.querySelector('[data-lock]').addEventListener('click',()=>vault.lock());
}
export function serializeFiles(files: any[]) {
    if (!vault.state().config) return JSON.stringify(files);
    return JSON.stringify(files.map(f=>{
        if (![true,1,'1','true'].includes((f.e2e_enabled ?? f.e2eEnabled) as any)) return f;
        const copy = { ...f };
        for (const field of ['content','crdtBaseContent','localSyncedContent', 'syncConflictRemoteContent', 'syncConflictDiskContent']) if (typeof copy[field] === 'string' && copy[field] && !looksLikeE2ECiphertext(copy[field])) copy[field] = encryptSync(copy[field],null);
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
document.addEventListener('click', event => {
    if (!(event.target instanceof Element) || !event.target.closest('#manageE2E')) return;
    event.preventDefault();
    void showSettings().catch(err => { if (err?.e2eKey !== 'e2eUnlockCancelled') window.showMessage?.(e2eErrorText(err), 'error'); });
});
window.addEventListener('e2e-unlocked', () => {
    (window.refreshFileSyncIcons as any)?.();
    setTimeout(() => (window.queueBackgroundFileSync as any)?.(window.currentFileId), 0);
});
async function bootstrap() {
    if (!window.currentUser?.token || new URLSearchParams(location.search).has('share_id')) return;
    try { await vault.initialize(); if (vault.state().unlocked) await lazyLoadCrypto(); }
    catch(err) { window.showMessage?.(e2eErrorText(err),'error'); }
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
