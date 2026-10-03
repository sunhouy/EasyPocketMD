import { e2eError } from './e2e-i18n';
/** Client-only key management. The server receives authenticated wrapped keys only. */
export type Box = { salt: string; iv: string; data: string; credentialId?: string; prfSalt?: string };
export type VaultConfig = { version: 2; ttlSeconds: number; check: Box; methods: { login?: Box; dedicated?: Box; passkey?: Box } };
export type KeyMaterial = { master: string; legacy: string };
const utf8 = new TextEncoder();
function protectedAccounts(): string[] { try { return JSON.parse(localStorage.getItem('epmd_e2e_accounts') || '[]'); } catch { return []; } }
export function serializeUser(value: any): string {
    const names = protectedAccounts();
    const clean = account => { if (!account || !names.includes(account.username)) return account; const copy = { ...account }; delete copy.password; return copy; };
    return JSON.stringify(Array.isArray(value) ? value.map(clean) : clean(value));
}
function protectSavedPassword() {
    const names = protectedAccounts();
    // Login-password mode intentionally remembers the already authenticated login password.
    // Independent dedicated/passwordless modes keep it out of persistent caches.
    const next = config?.methods.login ? names.filter(name => name !== owner) : [...new Set([...names,owner])];
    localStorage.setItem('epmd_e2e_accounts', JSON.stringify(next));
    for (const key of ['vditor_user','vditor_accounts']) {
        const raw = localStorage.getItem(key);
        if (raw) { try { localStorage.setItem(key,serializeUser(JSON.parse(raw))); } catch { /* Existing malformed account cache is handled by auth. */ } }
    }
}
function rememberLoginPassword(password: string) {
    if (!config?.methods.login || owner !== user()?.username || !password) return;
    user().password = password;
    localStorage.setItem('vditor_user', serializeUser(user()));
    let accounts: any[] = [];
    try { const value = JSON.parse(localStorage.getItem('vditor_accounts') || '[]'); if (Array.isArray(value)) accounts = value; } catch { /* Rebuild malformed account cache. */ }
    const account = accounts.find(account => account.username === owner);
    if (account) { account.password = password; account.token = user().token; }
    else accounts.push({username:owner,token:user().token,password});
    localStorage.setItem('vditor_accounts', serializeUser(accounts));
}
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
let material: KeyMaterial = null, expiresAt = 0, timer: ReturnType<typeof setTimeout>;
let loading: Promise<void> = null, unlocking: Promise<void> = null;
let generation = 0, sealing = false;
let unlockUI: () => Promise<void>;
let lockUI: () => void;
export function setUI(unlock: () => Promise<void>, lock: () => void) { unlockUI = unlock; lockUI = lock; }
function user(): any { return typeof window !== 'undefined' ? window.currentUser : null; }
export async function request(path: string, body: Record<string, unknown> = {}) {
    const u = user();
    if (!u?.token) throw e2eError('e2eLoginRequired');
    const response = await fetch((window.getApiBaseUrl?.() || 'api') + '/e2e/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, username: u.username, token: u.token }) });
    const result = await response.json();
    if (user()?.username !== u.username) throw e2eError('e2eAccountChangedRetry');
    if (!response.ok || result.code !== 200) throw e2eError(result.message_key || (result.code === 409 ? 'e2eConfigConflict' : result.code === 401 ? 'e2eLoginRequired' : 'e2eServiceFailed'));
    return result.data;
}
export function state() { return { config, revision, loaded, unlocked: !!material && Date.now() < expiresAt, expiresAt, owner }; }
export function sealSession(action: () => void) {
    if (!material || owner !== user()?.username) return;
    const previous = sealing; sealing = true;
    try { action(); } finally { sealing = previous; }
}
export function reset() {
    generation++; clearTimeout(timer); material = null; config = null; loaded = false; loading = null; unlocking = null; expiresAt = 0; owner = '';
}
export async function initialize() {
    const u = user();
    if (!u?.token) { reset(); return; }
    if (owner !== u.username) { reset(); owner = u.username; }
    if (loaded) return;
    if (!loading) {
        const currentGeneration = generation;
        loading = request('config').then(data => {
            if (currentGeneration !== generation) throw e2eError('e2eAccountChanged');
            if (!data || !('config' in data)) throw e2eError('e2eConfigResponseInvalid');
            config = data.config ? { version: data.config.version, ttlSeconds: data.config.ttlSeconds, methods: data.config.methods, check: data.config.check } : null; revision = data.revision; loaded = true;
            if (config) protectSavedPassword();
        }).finally(() => { if (currentGeneration === generation) loading = null; });
    }
    await loading;
}
export async function ensureUnlocked() {
    await initialize();
    if (!config) return;
    if (material && Date.now() < expiresAt) return;
    if (material) lock();
    if (config.methods.login && user()?.password) {
        try { await unlockPassword('login', user().password); return; }
        catch { /* A changed or missing remembered password requires an explicit method. */ }
    }
    if (!unlockUI) throw e2eError('e2eUnlockRequired');
    if (!unlocking) unlocking = unlockUI().finally(() => { unlocking = null; });
    await unlocking;
    if (!material || Date.now() >= expiresAt) throw e2eError('e2eNotUnlocked');
}
export function secrets(): KeyMaterial {
    if (owner !== user()?.username || !loaded) throw e2eError('e2eConfigNotLoaded');
    if (!config) return null;
    if (!material || (!sealing && Date.now() >= expiresAt)) throw e2eError('e2eSessionExpired');
    return material;
}
function validateMaterial(value: any): KeyMaterial {
    if (!value || !/^[A-Za-z0-9+/=]{44}$/.test(value.master) || unbase64(value.master).length !== 32 || typeof value.legacy !== 'string' || value.legacy.length > 128) throw e2eError('e2eKeyInvalid');
    return { master: value.master, legacy: value.legacy };
}
async function accept(value: KeyMaterial) {
    value = validateMaterial(value);
    const activeOwner = owner, activeGeneration = generation;
    const check = await unwrap(config.check, unbase64(value.master));
    if (check !== 'EasyPocketMD vault v2' || owner !== activeOwner || generation !== activeGeneration || owner !== user()?.username) throw e2eError('e2eKeyCheckFailed');
    material = value; expiresAt = Date.now() + config.ttlSeconds * 1000;
    clearTimeout(timer); timer = setTimeout(lock, config.ttlSeconds * 1000);
    window.dispatchEvent(new Event('e2e-unlocked'));
}
export function lock() {
    // Seal live drafts while the key still exists, then discard the complete session.
    try { if (material) { sealing = true; lockUI?.(); } }
    finally { sealing = false; material = null; expiresAt = 0; clearTimeout(timer); }
    window.dispatchEvent(new Event('e2e-locked'));
}
export async function unlockPassword(method: 'login' | 'dedicated', password: string) {
    if (!password || !config?.methods[method]) throw e2eError('e2eMethodDisabled');
    try { await accept(JSON.parse(await unwrap(config.methods[method], password))); if (method === 'login') rememberLoginPassword(password); }
    catch { throw e2eError('e2ePasswordIncorrect'); }
}
async function prf(credentialId: string, prfSalt: string) {
    const credential = await navigator.credentials.get({ publicKey: { challenge: random(32), allowCredentials: [{ type: 'public-key', id: unbase64(credentialId) }], userVerification: 'required', extensions: { prf: { eval: { first: unbase64(prfSalt) } } } as any } }) as PublicKeyCredential;
    const result = (credential?.getClientExtensionResults() as any)?.prf?.results?.first;
    if (!result || result.byteLength !== 32) throw e2eError('e2ePrfUnsupported');
    return new Uint8Array(result) as Uint8Array<ArrayBuffer>;
}
export async function unlockPasskey() {
    const box = config?.methods.passkey;
    if (!box) throw e2eError('e2ePasskeyDisabled');
    await accept(JSON.parse(await unwrap(box, await prf(box.credentialId, box.prfSalt))));
}
export async function registerPasskey(value: KeyMaterial): Promise<Box> {
    if (!window.isSecureContext || !navigator.credentials) throw e2eError('e2ePasskeySecureRequired');
    const salt = base64(random(32));
    const credential = await navigator.credentials.create({ publicKey: { challenge: random(32), rp: { name: 'EasyPocketMD' }, user: { id: await digest(utf8.encode(user().username)), name: user().username, displayName: user().username }, pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }], authenticatorSelection: { residentKey: 'required', userVerification: 'required' }, extensions: { prf: {} } as any } }) as PublicKeyCredential;
    if (!credential) throw e2eError('e2ePasskeyCanceled');
    const credentialId = base64(credential.rawId);
    const secret = await prf(credentialId, salt);
    return { ...await wrap(JSON.stringify(value), secret), credentialId, prfSalt: salt };
}
export async function saveSettings(options: { login: boolean; dedicated: boolean; password: string; loginPassword?: string; passkey: boolean; ttlSeconds: number }, newPasskey?: Box) {
    await ensureUnlocked();
    if (![60,300,900,1800,3600,14400,86400].includes(options.ttlSeconds)) throw e2eError('e2eTtlInvalid');
    if (!options.login && !options.dedicated && !options.passkey) throw e2eError('e2eMethodRequired');
    const activeOwner = owner, activeGeneration = generation;
    const value = material || { master: base64(random(32)), legacy: options.loginPassword || user()?.password || '' };
    const methods: VaultConfig['methods'] = {};
    if (options.login) {
        // Reuse a current wrapper unless the user explicitly supplies a password.
        if (options.loginPassword) {
            const response = await fetch((window.getApiBaseUrl?.() || 'api') + '/auth/login', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({username:owner,password:options.loginPassword}) });
            const result = await response.json();
            if (!response.ok || result.code !== 200) throw e2eError('e2ePasswordIncorrect');
            methods.login = await wrap(JSON.stringify(value), options.loginPassword);
        } else if (config?.methods.login) methods.login = config.methods.login;
        else { const password = user()?.password; if (!password) throw e2eError('e2eLoginPasswordMissing'); methods.login = await wrap(JSON.stringify(value), password); }
    }
    if (options.dedicated) {
        if (options.password) { if (options.password.length < 12) throw e2eError('e2eDedicatedTooShort'); methods.dedicated = await wrap(JSON.stringify(value), options.password); }
        else if (config?.methods.dedicated) methods.dedicated = config.methods.dedicated;
        else throw e2eError('e2eDedicatedRequired');
    }
    if (options.passkey) methods.passkey = newPasskey || config?.methods.passkey || await registerPasskey(value);
    const nextConfig: VaultConfig = { version: 2, ttlSeconds: options.ttlSeconds, methods, check: config?.check || await wrap('EasyPocketMD vault v2', unbase64(value.master)) };
    if (owner !== activeOwner || generation !== activeGeneration || owner !== user()?.username) throw e2eError('e2eAccountChanged');
    const data = await request('config/save', { config: nextConfig, revision });
    if (owner !== activeOwner || generation !== activeGeneration) throw e2eError('e2eAccountChanged');
    config = nextConfig; revision = data.revision; protectSavedPassword();
    if (config.methods.login) rememberLoginPassword(options.loginPassword || user()?.password);
    await accept(value);
}
export async function preparePasswordChange(currentPassword: string, newPassword: string) {
    await initialize();
    if (!config?.methods.login) return null;
    // Verify the login-method wrapper with the explicitly entered ordinary password.
    // Do not open or unlock the document encryption session to change login credentials.
    const value = validateMaterial(JSON.parse(await unwrap(config.methods.login, currentPassword)));
    const next = { ...config, methods: { ...config.methods, login: await wrap(JSON.stringify(value), newPassword) } };
    return { config: next, revision };
}
export function finishPasswordChange(patch: { config: VaultConfig; revision: number }) {
    if (patch) { config = patch.config; revision = patch.revision + 1; }
}
// A freshly verified login is also verification of the default unlock method.
// Token-only page restores do not call this and must prompt after a lock/reload.
export async function unlockAfterLogin(password: string) {
    await initialize();
    if (config?.methods.login) await unlockPassword('login',password);
}
