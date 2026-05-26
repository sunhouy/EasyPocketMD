/**
 * End-to-End Encryption module
 * Uses crypto-js for AES encryption
 * Lazy loaded to optimize initial bundle size
 */

let CryptoJS = null;

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
    if (!text || !password || !CryptoJS) return text;
    return CryptoJS.AES.encrypt(text, password).toString();
}

export function decryptSync(ciphertext, password) {
    if (!ciphertext || !password || !CryptoJS) return ciphertext;
    if (!looksLikeE2ECiphertext(ciphertext)) return ciphertext;
    try {
        const bytes = CryptoJS.AES.decrypt(ciphertext, password);
        const originalText = bytes.toString(CryptoJS.enc.Utf8);
        return originalText || ciphertext;
    } catch (e) {
        console.error('E2E sync decrypt error:', e);
        return ciphertext;
    }
}

export function resolveFileContentSync(content, password, e2eEnabled) {
    if (!content || !password) return content;
    if (e2eEnabled || looksLikeE2ECiphertext(content)) {
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
    if (!text || !password) return text;
    const crypto = await lazyLoadCrypto();
    return crypto.AES.encrypt(text, password).toString();
}

/** CryptoJS AES ciphertext in OpenSSL format (Base64) typically starts with this prefix. */
export function looksLikeE2ECiphertext(text) {
    return typeof text === 'string' && text.startsWith('U2FsdGVkX1');
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
    if (!content || !password) return content;
    if (e2eEnabled || looksLikeE2ECiphertext(content)) {
        const decrypted = await decrypt(content, password);
        return decrypted !== null ? decrypted : content;
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
    if (!ciphertext || !password) return ciphertext;
    
    // Quick check if it might be encrypted
    // CryptoJS AES ciphertext in Base64 starts with U2Fsd (usually)
    if (!ciphertext.startsWith('U2FsdGVkX1')) {
        return ciphertext; // Probably not encrypted with CryptoJS AES
    }

    const crypto = await lazyLoadCrypto();
    try {
        const bytes = crypto.AES.decrypt(ciphertext, password);
        const originalText = bytes.toString(crypto.enc.Utf8);
        
        // If decryption fails (wrong password), bytes.toString(Utf8) might return empty string
        if (!originalText) {
            console.warn('E2E Decryption failed: possible incorrect password');
            return null; // indicate failure
        }
        return originalText;
    } catch (e) {
        console.error('E2E Decryption error:', e);
        return null; // indicate failure
    }
}
