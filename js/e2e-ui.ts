import * as vault from './e2e-vault';
import { encryptSync, lazyLoadCrypto, looksLikeE2ECiphertext } from './e2e';
import './e2e-attachments';
window.E2EVault = vault;
window.e2eSerializeUser = vault.serializeUser;
export function serializeFiles(files: any[]) {
    if (!vault.state().config) return JSON.stringify(files);
    return JSON.stringify(files.map(f=>{
        if (![true,1,'1','true'].includes((f.e2e_enabled ?? f.e2eEnabled) as any)) return f;
        const copy = { ...f };
        for (const field of ['content','pendingCloudContent','previousCloudContent','crdtBaseContent','localSyncedContent', 'syncConflictRemoteContent', 'syncConflictDiskContent']) if (typeof copy[field] === 'string' && copy[field] && !looksLikeE2ECiphertext(copy[field])) copy[field] = encryptSync(copy[field],null);
        return copy;
    }));
}
window.e2eSerializeFiles = serializeFiles;
async function bootstrap() {
    if (!window.currentUser?.token || new URLSearchParams(location.search).has('share_id')) return;
    try { await vault.initialize(); await lazyLoadCrypto(); }
    catch (error) { console.warn('Account encryption initialization failed:',error); }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',bootstrap); else void bootstrap();
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
window.addEventListener('pageshow',event=>{ if (event.persisted) { vault.reset(); window.E2EAttachments.clear(); void bootstrap(); } });
