import { e2eError } from './e2e-i18n';
/**
 * End-to-End Encryption module
 * Uses crypto-js for AES encryption
 * Lazy loaded to optimize initial bundle size
 */

let CryptoJS = null;
const V2_PREFIX = 'EPMD2:';
function vaultSecret(password) {
    const value = typeof window !== 'undefined' && window.E2EVault ? window.E2EVault.secrets() : null;
    return value ? value.master : password;
}
function legacySecret(password) {
    const value = typeof window !== 'undefined' && window.E2EVault ? window.E2EVault.secrets() : null;
    return value ? value.legacy : password;
}
function encryptV2(text, master) {
    const encKey = CryptoJS.SHA256('EasyPocketMD text enc v2|' + master);
    const macKey = CryptoJS.SHA256('EasyPocketMD text mac v2|' + master);
    const iv = CryptoJS.lib.WordArray.random(16);
    const cipher = CryptoJS.AES.encrypt(text, encKey, { iv }).ciphertext.toString(CryptoJS.enc.Base64);
    const body = iv.toString(CryptoJS.enc.Base64) + '.' + cipher;
    return V2_PREFIX + body + '.' + CryptoJS.HmacSHA256(body, macKey).toString();
}
function decryptV2(ciphertext, master) {
    if (!master || !CryptoJS) throw e2eError('e2eUnlockRequired');
    const parts = ciphertext.slice(V2_PREFIX.length).split('.');
    if (parts.length !== 3 || !/^[a-f0-9]{64}$/.test(parts[2])) throw e2eError('e2eFileInvalid');
    const [iv, cipher, mac] = parts;
    const expected = CryptoJS.HmacSHA256(iv + '.' + cipher, CryptoJS.SHA256('EasyPocketMD text mac v2|' + master)).toString();
    let different = 0;
    for (let i = 0; i < 64; i++) different |= expected.charCodeAt(i) ^ mac.charCodeAt(i);
    if (different) throw e2eError('e2eFileTampered');
    return CryptoJS.AES.decrypt({ ciphertext: CryptoJS.enc.Base64.parse(cipher) }, CryptoJS.SHA256('EasyPocketMD text enc v2|' + master), { iv: CryptoJS.enc.Base64.parse(iv) }).toString(CryptoJS.enc.Utf8);
}
async function prepareVault() {
    if (typeof window !== 'undefined' && window.E2EVault) await window.E2EVault.ensureUnlocked();
}

// Lazy load the CryptoJS library
export async function lazyLoadCrypto() {
    if (!CryptoJS) {
        // Dynamic import for code splitting
        const module = await import('crypto-js');
        CryptoJS = module.default || module;
    }
    return CryptoJS;
}

export function encryptSync(text, password) {
    if (!text) return text;
    const secret = vaultSecret(password);
    if (!secret || !CryptoJS) throw e2eError('e2eCryptoNotReady');
    // Authenticate every new write, including accounts without a configured vault.
    return encryptV2(text, secret);
}

export function decryptSync(ciphertext, password) {
    if (!looksLikeE2ECiphertext(ciphertext)) return ciphertext;
    if (ciphertext.startsWith(V2_PREFIX)) {
        const master = vaultSecret(password), legacy = legacySecret(password);
        try { return decryptV2(ciphertext, master); }
        catch (error) {
            // Files written before vault setup used the login password as their key.
            // The MAC must still verify before either key can return plaintext.
            if (legacy && legacy !== master) return decryptV2(ciphertext, legacy);
            throw error;
        }
    }
    password = legacySecret(password);
    if (!password || !CryptoJS) throw e2eError('e2eFileDecryptFailed');
    try {
        const envelope = CryptoJS.format.OpenSSL.parse(ciphertext);
        if (!envelope.salt || envelope.salt.sigBytes !== 8 || !envelope.ciphertext.sigBytes || envelope.ciphertext.sigBytes % 16) {
            throw e2eError('e2eFileDecryptFailed');
        }
        // CryptoJS's default unpad only subtracts the last byte, without validating
        // the padding. A wrong key can therefore appear to produce valid short text.
        const bytes = CryptoJS.AES.decrypt(envelope, password, { padding: CryptoJS.pad.NoPadding });
        const byteAt = index => (bytes.words[index >>> 2] >>> (24 - (index % 4) * 8)) & 255;
        const padding = byteAt(bytes.sigBytes - 1);
        if (padding < 1 || padding > 16 || padding > bytes.sigBytes) throw e2eError('e2eFileDecryptFailed');
        for (let i = bytes.sigBytes - padding; i < bytes.sigBytes; i++) {
            if (byteAt(i) !== padding) throw e2eError('e2eFileDecryptFailed');
        }
        bytes.sigBytes -= padding;
        const originalText = bytes.toString(CryptoJS.enc.Utf8);
        if (!originalText) throw e2eError('e2eFileDecryptFailed');
        return originalText;
    } catch (e) {
        console.error('E2E sync decrypt error:', e);
        throw e2eError('e2eFileDecryptFailed');
    }
}

export function resolveFileContentSync(content, password, e2eEnabled) {
    if (looksLikeE2ECiphertext(content)) {
        return decryptSync(content, password);
    }
    return content;
}

if (typeof window !== 'undefined') {
    window.e2eEncryptSync = encryptSync;
    window.e2eResolveFileContentSync = resolveFileContentSync;
}

/**
 * Encrypt a string using AES
 * @param {string} text - text to encrypt
 * @param {string} password - encryption key/password
 * @returns {Promise<string>} encrypted string
 */
export async function encrypt(text, password) {
    if (!text) return text;
    await prepareVault();
    await lazyLoadCrypto();
    return encryptSync(text, password);
}

/** CryptoJS AES ciphertext in OpenSSL format (Base64) typically starts with this prefix. */
export function looksLikeE2ECiphertext(text) {
    return typeof text === 'string' && (text.startsWith('U2FsdGVkX1') || text.startsWith(V2_PREFIX));
}

/**
 * Normalize file content for display or plaintext storage.
 * When E2E is enabled, decrypt ciphertext. When disabled, still decrypt stale ciphertext left on server/local.
 * @param {string} content
 * @param {string} password
 * @param {boolean} e2eEnabled
 * @returns {Promise<string>}
 */
export async function resolveFileContent(content, password, e2eEnabled) {
    if (looksLikeE2ECiphertext(content)) {
        const decrypted = await decrypt(content, password);
        if (decrypted === null) throw e2eError('e2eFileDecryptFailed');
        return decrypted;
    }
    return content;
}

/**
 * Decrypt an AES encrypted string
 * @param {string} ciphertext - text to decrypt
 * @param {string} password - encryption key/password
 * @returns {Promise<string>} decrypted text
 */
export async function decrypt(ciphertext, password) {
    if (!looksLikeE2ECiphertext(ciphertext)) return ciphertext;
    await prepareVault();
    await lazyLoadCrypto();
    try { return decryptSync(ciphertext, password); }
    catch (error) { return null; }
}
