export {};
const db = require('../config/db');
const crypto = require('crypto');
let schemaPromise;
function ensureSchema() {
    if (!schemaPromise) schemaPromise = (async () => {
        await db.execute(`CREATE TABLE IF NOT EXISTS e2e_vaults (
            username VARCHAR(20) PRIMARY KEY, config_json MEDIUMTEXT NOT NULL, revision INT NOT NULL DEFAULT 1)`);
        await db.execute(`CREATE TABLE IF NOT EXISTS e2e_pairings (
            id CHAR(32) PRIMARY KEY, username VARCHAR(20) NOT NULL, code_hash CHAR(64) NOT NULL,
            secret_hash CHAR(64) NOT NULL, public_key TEXT NOT NULL, ciphertext TEXT NULL,
            expires_at BIGINT NOT NULL, UNIQUE KEY user_code (username, code_hash))`);
    })().catch(error => { schemaPromise = null; throw error; });
    return schemaPromise;
}
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
function validBox(box) {
    return box && typeof box.salt === 'string' && /^[A-Za-z0-9+/=]{24}$/.test(box.salt) &&
        typeof box.iv === 'string' && /^[A-Za-z0-9+/=]{16}$/.test(box.iv) &&
        typeof box.data === 'string' && /^[A-Za-z0-9+/=]{24,4096}$/.test(box.data);
}
function validConfig(c) {
    if (!c || c.version !== 2 || ![60,300,900,1800,3600,14400,86400].includes(c.ttlSeconds) ||
        typeof c.otp !== 'boolean' || !validBox(c.check) || Object.keys(c.check).some(k => !['salt','iv','data'].includes(k)) || !c.methods ||
        Object.keys(c).some(k => !['version','ttlSeconds','otp','check','methods'].includes(k)) ||
        Object.keys(c.methods).some(k => !['login','dedicated','passkey'].includes(k))) return false;
    // OTP requires another independently usable recovery method.
    if (!Object.keys(c.methods).length) return false;
    for (const [name, box] of Object.entries(c.methods) as any) {
        if (!validBox(box) || Object.keys(box).some(k => !['salt','iv','data','credentialId','prfSalt'].includes(k))) return false;
        if (name !== 'passkey' && Object.keys(box).some(k => !['salt','iv','data'].includes(k))) return false;
        if (name === 'passkey' && (!/^[A-Za-z0-9+/=]{1,2048}$/.test(box.credentialId) || !/^[A-Za-z0-9+/=]{44}$/.test(box.prfSalt))) return false;
    }
    return JSON.stringify(c).length < 20000;
}

module.exports = { ensureSchema, validConfig };
