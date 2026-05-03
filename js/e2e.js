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

if (typeof window !== 'undefined') {
    window.e2eEncryptSync = encryptSync;
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
