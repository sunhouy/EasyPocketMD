import { e2eError } from './e2e-i18n';
/** Account-password encryption; wrapped keys are read only for existing documents. */
export type Box = { salt: string; iv: string; data: string };
export type VaultConfig = { version: 2; ttlSeconds?: number; check: Box; methods: { login?: Box } };
export type KeyMaterial = { master: string; legacy: string };
const utf8 = new TextEncoder();
export function serializeUser(value: any): string { return JSON.stringify(value); }
export const random = (size: number) => crypto.getRandomValues(new Uint8Array(size));
export function base64(bytes: ArrayBuffer | Uint8Array): string {
    const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    let result = '';
    for (let i = 0; i < arr.length; i += 8192) result += String.fromCharCode(...arr.subarray(i, i + 8192));
    return btoa(result);
}
export function unbase64(value: string): Uint8Array<ArrayBuffer> { return Uint8Array.from(atob(value), c => c.charCodeAt(0)); }
export async function digest(value: Uint8Array<ArrayBuffer>) { return new Uint8Array(await crypto.subtle.digest('SHA-256', value)); }
async function wrappingKey(secret: string | Uint8Array<ArrayBuffer>, salt: Uint8Array<ArrayBuffer>) {
    if (typeof secret === 'string') {
        const key = await crypto.subtle.importKey('raw', utf8.encode(secret), 'PBKDF2', false, ['deriveKey']);
        return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 600000 }, key, { name: 'AES-GCM', length: 256 }, false, ['encrypt','decrypt']);
    }
    const key = await crypto.subtle.importKey('raw', secret, 'HKDF', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt, info: utf8.encode('EasyPocketMD key wrap v2') }, key, { name: 'AES-GCM', length: 256 }, false, ['encrypt','decrypt']);
}
export async function wrap(text: string, secret: string | Uint8Array<ArrayBuffer>): Promise<Box> {
    const salt = random(16), iv = random(12), key = await wrappingKey(secret, salt);
    const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: utf8.encode('EasyPocketMD vault v2') }, key, utf8.encode(text));
    return { salt: base64(salt), iv: base64(iv), data: base64(data) };
}
export async function unwrap(box: Box, secret: string | Uint8Array<ArrayBuffer>): Promise<string> {
    const key = await wrappingKey(secret, unbase64(box.salt));
    const text = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unbase64(box.iv), additionalData: utf8.encode('EasyPocketMD vault v2') }, key, unbase64(box.data));
    return new TextDecoder('utf-8', { fatal: true }).decode(text);
}
let owner = '', config: VaultConfig = null, revision = 0, loaded = false;
let material: KeyMaterial = null;
let loading: Promise<void> = null, unlocking: Promise<void> = null;
let generation = 0;
function user(): any { return typeof window !== 'undefined' ? window.currentUser : null; }
function accountPassword(): string {
    const u = user();
    if (!u?.token) throw e2eError('e2eLoginRequired');
    if (!u.password) {
        // Older clients may have removed the current user's cached password.
        let accounts: any[] = [];
        try { const cached = JSON.parse(localStorage.getItem('vditor_accounts') || '[]'); if (Array.isArray(cached)) accounts = cached; } catch { /* Ask for an ordinary login below. */ }
        const saved = accounts.find(account => account.username === u.username && account.password);
        if (saved) u.password = saved.password;
    }
    if (!u.password) throw e2eError('e2eLoginPasswordMissing');
    return u.password;
}
export async function request(path: string, body: Record<string, unknown> = {}) {
    const u = user();
    if (!u?.token) throw e2eError('e2eLoginRequired');
    const response = await fetch((window.getApiBaseUrl?.() || 'api') + '/e2e/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, username: u.username, token: u.token }) });
    const result = await response.json();
    if (user() !== u) throw e2eError('e2eAccountChangedRetry');
    if (!response.ok || result.code !== 200) throw e2eError(result.message_key || (result.code === 401 ? 'e2eLoginRequired' : 'e2eServiceFailed'));
    return result.data;
}
export function state() { return { config, revision, loaded, unlocked: loaded && owner === user()?.username && (!config || !!material), sessionId: generation, owner }; }
export function sealSession(action: () => void) { if (material && owner === user()?.username) action(); }
export function reset() { generation++; material = null; config = null; loaded = false; loading = null; unlocking = null; owner = ''; }
export async function initialize() {
    const u = user();
    if (!u?.token) { reset(); return; }
    if (owner !== u.username) { reset(); owner = u.username; }
    if (!loaded) {
        if (!loading) {
            const activeGeneration = generation;
            loading = request('config').then(data => {
                if (activeGeneration !== generation) throw e2eError('e2eAccountChanged');
                if (!data || !('config' in data)) throw e2eError('e2eConfigResponseInvalid');
                // Keep only the old account-password wrapper. Other methods have been retired.
                config = data.config ? { version: 2, ttlSeconds: data.config.ttlSeconds, check: data.config.check, methods: data.config.methods?.login ? {login:data.config.methods.login} : {} } : null;
                revision = data.revision; loaded = true;
                localStorage.removeItem('epmd_e2e_accounts');
            }).finally(() => { if (activeGeneration === generation) loading = null; });
        }
        await loading;
    }
    // No dialog, timer or extra credential: the authenticated account password is sufficient.
    if (config?.methods.login && !material && u.password) await unlockAccountPassword(u.password);
}
function validateMaterial(value: any): KeyMaterial {
    if (!value || !/^[A-Za-z0-9+/=]{44}$/.test(value.master) || unbase64(value.master).length !== 32 || typeof value.legacy !== 'string' || value.legacy.length > 128) throw e2eError('e2eKeyInvalid');
    return { master:value.master, legacy:value.legacy };
}
async function unlockAccountPassword(password: string) {
    if (material) return;
    if (!config?.methods.login) throw e2eError('e2eLegacyAccountKeyMissing');
    if (!unlocking) {
        const activeOwner = owner, activeGeneration = generation;
        unlocking = (async () => {
            try {
                const value = validateMaterial(JSON.parse(await unwrap(config.methods.login,password)));
                if (await unwrap(config.check,unbase64(value.master)) !== 'EasyPocketMD vault v2') throw e2eError('e2eKeyCheckFailed');
                if (activeOwner !== user()?.username || activeGeneration !== generation) throw e2eError('e2eAccountChanged');
                material = value;
                window.dispatchEvent(new Event('e2e-unlocked'));
            } catch (error) { if (error?.e2eKey) throw error; throw e2eError('e2ePasswordIncorrect'); }
        })().finally(() => { if (activeGeneration === generation) unlocking = null; });
    }
    await unlocking;
}
export async function ensureUnlocked() {
    await initialize();
    if (!config) { accountPassword(); return; }
    await unlockAccountPassword(accountPassword());
}
export function secrets(): KeyMaterial {
    if (owner !== user()?.username || !loaded) throw e2eError('e2eConfigNotLoaded');
    if (!config) return null;
    if (!material) throw e2eError('e2eLoginPasswordMissing');
    return material;
}
/** Rewrap old data keys when changing the account password; ciphertext stays readable. */
export async function preparePasswordChange(currentPassword: string, newPassword: string) {
    await initialize();
    if (!config?.methods.login) return null;
    const value = validateMaterial(JSON.parse(await unwrap(config.methods.login,currentPassword)));
    const next = { ...config, methods:{login:await wrap(JSON.stringify(value),newPassword)} };
    return {config:next,revision};
}
export function finishPasswordChange(patch: {config:VaultConfig;revision:number}) {
    if (patch) {config=patch.config;revision=patch.revision+1;}
}
