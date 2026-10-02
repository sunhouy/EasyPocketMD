/** Client-only key management. The server receives authenticated wrapped keys only. */
export type Box = { salt: string; iv: string; data: string; credentialId?: string; prfSalt?: string };
export type VaultConfig = { version: 2; ttlSeconds: number; otp: boolean; check: Box; methods: { login?: Box; dedicated?: Box; passkey?: Box } };
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
    if (!names.includes(owner)) localStorage.setItem('epmd_e2e_accounts', JSON.stringify([...names,owner]));
    for (const key of ['vditor_user','vditor_accounts']) {
        const raw = localStorage.getItem(key);
        if (raw) { try { localStorage.setItem(key,serializeUser(JSON.parse(raw))); } catch { /* Existing malformed account cache is handled by auth. */ } }
    }
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
    if (!u?.token) throw new Error('请先登录');
    const response = await fetch((window.getApiBaseUrl?.() || 'api') + '/e2e/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, username: u.username, token: u.token }) });
    const result = await response.json();
    if (user()?.username !== u.username) throw new Error('账号已切换，请重试');
    if (!response.ok || result.code !== 200) throw new Error(result.message || '加密服务请求失败');
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
            if (currentGeneration !== generation) throw new Error('账号已切换');
            if (!data || !('config' in data)) throw new Error('无效的加密配置响应');
            config = data.config; revision = data.revision; loaded = true;
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
    if (!unlockUI) throw new Error('请先解锁端到端加密');
    if (!unlocking) unlocking = unlockUI().finally(() => { unlocking = null; });
    await unlocking;
    if (!material || Date.now() >= expiresAt) throw new Error('端到端加密尚未解锁');
}
export function secrets(): KeyMaterial {
    if (owner !== user()?.username || !loaded) throw new Error('加密配置尚未载入');
    if (!config) return null;
    if (!material || (!sealing && Date.now() >= expiresAt)) throw new Error('加密会话已过期，请重新解锁');
    return material;
}
function validateMaterial(value: any): KeyMaterial {
    if (!value || !/^[A-Za-z0-9+/=]{44}$/.test(value.master) || unbase64(value.master).length !== 32 || typeof value.legacy !== 'string' || value.legacy.length > 128) throw new Error('密钥格式错误');
    return { master: value.master, legacy: value.legacy };
}
async function accept(value: KeyMaterial) {
    value = validateMaterial(value);
    const activeOwner = owner, activeGeneration = generation;
    const check = await unwrap(config.check, unbase64(value.master));
    if (check !== 'EasyPocketMD vault v2' || owner !== activeOwner || generation !== activeGeneration || owner !== user()?.username) throw new Error('密钥校验失败');
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
    if (!password || !config?.methods[method]) throw new Error('此解锁方式未启用');
    try { await accept(JSON.parse(await unwrap(config.methods[method], password))); }
    catch { throw new Error('密码错误或密钥校验失败'); }
}
async function prf(credentialId: string, prfSalt: string) {
    const credential = await navigator.credentials.get({ publicKey: { challenge: random(32), allowCredentials: [{ type: 'public-key', id: unbase64(credentialId) }], userVerification: 'required', extensions: { prf: { eval: { first: unbase64(prfSalt) } } } as any } }) as PublicKeyCredential;
    const result = (credential?.getClientExtensionResults() as any)?.prf?.results?.first;
    if (!result || result.byteLength !== 32) throw new Error('此通行密钥或浏览器不支持 PRF 加密，请使用其他方式');
    return new Uint8Array(result) as Uint8Array<ArrayBuffer>;
}
export async function unlockPasskey() {
    const box = config?.methods.passkey;
    if (!box) throw new Error('通行密钥未启用');
    await accept(JSON.parse(await unwrap(box, await prf(box.credentialId, box.prfSalt))));
}
export async function registerPasskey(value: KeyMaterial): Promise<Box> {
    if (!window.isSecureContext || !navigator.credentials) throw new Error('通行密钥需要 HTTPS 和支持 PRF 的浏览器');
    const salt = base64(random(32));
    const credential = await navigator.credentials.create({ publicKey: { challenge: random(32), rp: { name: 'EasyPocketMD' }, user: { id: await digest(utf8.encode(user().username)), name: user().username, displayName: user().username }, pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }], authenticatorSelection: { residentKey: 'required', userVerification: 'required' }, extensions: { prf: {} } as any } }) as PublicKeyCredential;
    if (!credential) throw new Error('通行密钥创建已取消');
    const credentialId = base64(credential.rawId);
    const secret = await prf(credentialId, salt);
    return { ...await wrap(JSON.stringify(value), secret), credentialId, prfSalt: salt };
}
export async function saveSettings(options: { login: boolean; dedicated: boolean; password: string; passkey: boolean; otp: boolean; ttlSeconds: number }, newPasskey?: Box) {
    await ensureUnlocked();
    if (![60,300,900,1800,3600,14400,86400].includes(options.ttlSeconds)) throw new Error('无效的自动锁定时间');
    if (!options.login && !options.dedicated && !options.passkey) throw new Error('至少保留一种独立解锁方式；OTP 需要已解锁设备');
    const activeOwner = owner, activeGeneration = generation;
    const value = material || { master: base64(random(32)), legacy: user()?.password || '' };
    if (!material && !value.legacy) throw new Error('首次设置需要登录密码，以兼容已有加密文件');
    const methods: VaultConfig['methods'] = {};
    if (options.login) {
        // Reuse a current wrapper unless the user explicitly supplies a password.
        if (config?.methods.login) methods.login = config.methods.login;
        else { const password = options.password && !options.dedicated ? options.password : user()?.password; if (!password) throw new Error('缺少登录密码'); methods.login = await wrap(JSON.stringify(value), password); }
    }
    if (options.dedicated) {
        if (options.password) { if (options.password.length < 12) throw new Error('专用密码至少需要 12 个字符'); methods.dedicated = await wrap(JSON.stringify(value), options.password); }
        else if (config?.methods.dedicated) methods.dedicated = config.methods.dedicated;
        else throw new Error('请输入专用密码');
    }
    if (options.passkey) methods.passkey = newPasskey || config?.methods.passkey || await registerPasskey(value);
    const nextConfig: VaultConfig = { version: 2, ttlSeconds: options.ttlSeconds, otp: options.otp, methods, check: config?.check || await wrap('EasyPocketMD vault v2', unbase64(value.master)) };
    if (owner !== activeOwner || generation !== activeGeneration || owner !== user()?.username) throw new Error('账号已切换');
    const data = await request('config/save', { config: nextConfig, revision });
    if (owner !== activeOwner || generation !== activeGeneration) throw new Error('账号已切换');
    config = nextConfig; revision = data.revision; protectSavedPassword();
    await accept(value);
}
export async function beginPairing() {
    await initialize();
    if (!config?.otp) throw new Error('OTP 未启用');
    const keys = await crypto.subtle.generateKey({ name: 'RSA-OAEP', modulusLength: 3072, publicExponent: new Uint8Array([1,0,1]), hash: 'SHA-256' }, true, ['encrypt','decrypt']);
    const publicKey = base64(await crypto.subtle.exportKey('spki', keys.publicKey));
    const data = await request('pair/create', { publicKey });
    return { ...data, privateKey: keys.privateKey, fingerprint: await fingerprint(publicKey) };
}
export async function fingerprint(publicKey: string) {
    // Full SHA-256, grouped for visual comparison; never trust a relay-supplied fingerprint.
    return Array.from(await digest(unbase64(publicKey)), b => b.toString(16).padStart(2,'0')).join('').match(/.{1,8}/g).join(' ');
}
export async function findPairing(code: string) {
    await ensureUnlocked();
    if (!config?.otp) throw new Error('OTP 未启用');
    const data = await request('pair/find', { code });
    return { ...data, fingerprint: await fingerprint(data.publicKey) };
}
export async function approvePairing(pair: { id: string; publicKey: string }) {
    await ensureUnlocked();
    if (!config?.otp) throw new Error('OTP 未启用');
    const value = secrets(), activeOwner = owner, activeGeneration = generation;
    const key = await crypto.subtle.importKey('spki', unbase64(pair.publicKey), { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt']);
    const ciphertext = await crypto.subtle.encrypt({ name: 'RSA-OAEP', label: utf8.encode(pair.id) }, key, utf8.encode(JSON.stringify(value)));
    if (owner !== activeOwner || generation !== activeGeneration || owner !== user()?.username) throw new Error('账号已切换');
    await request('pair/approve', { id: pair.id, ciphertext: base64(ciphertext) });
}
export async function consumePairing(pair: { id: string; secret: string; privateKey: CryptoKey }) {
    const data = await request('pair/consume', { id: pair.id, secret: pair.secret });
    if (!data.ciphertext) return false;
    const raw = await crypto.subtle.decrypt({ name: 'RSA-OAEP', label: utf8.encode(pair.id) }, pair.privateKey, unbase64(data.ciphertext));
    await accept(JSON.parse(new TextDecoder().decode(raw))); return true;
}

export async function preparePasswordChange(currentPassword: string, newPassword: string) {
    await initialize();
    if (!config?.methods.login) return null;
    await ensureUnlocked();
    const next = { ...config, methods: { ...config.methods, login: await wrap(JSON.stringify(secrets()), newPassword) } };
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
